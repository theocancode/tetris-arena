'use strict';
const express      = require('express');
const http         = require('http');
const { Server }   = require('socket.io');
const path         = require('path');
const bcrypt       = require('bcryptjs');
const session      = require('express-session');
const Database     = require('better-sqlite3');
const fs           = require('fs');

// ── Database ──────────────────────────────────────────────────────
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'arena.db'));
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password   TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS stats (
    user_id        INTEGER PRIMARY KEY REFERENCES users(id),
    games_played   INTEGER DEFAULT 0,
    wins           INTEGER DEFAULT 0,
    kos            INTEGER DEFAULT 0,
    lines_sent     INTEGER DEFAULT 0,
    lines_received INTEGER DEFAULT 0,
    lines_cleared  INTEGER DEFAULT 0,
    best_lpm       REAL    DEFAULT 0,
    total_seconds  INTEGER DEFAULT 0
  );
`);

const stmts = {
  getUser:      db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE'),
  insertUser:   db.prepare('INSERT INTO users (username, password) VALUES (?, ?)'),
  insertStats:  db.prepare('INSERT OR IGNORE INTO stats (user_id) VALUES (?)'),
  getStats:     db.prepare('SELECT u.username, s.* FROM users u JOIN stats s ON s.user_id = u.id WHERE u.username = ? COLLATE NOCASE'),
  updateStats:  db.prepare(`UPDATE stats SET
    games_played   = games_played   + @gp,
    wins           = wins           + @wins,
    kos            = kos            + @kos,
    lines_sent     = lines_sent     + @ls,
    lines_received = lines_received + @lr,
    lines_cleared  = lines_cleared  + @lc,
    best_lpm       = MAX(best_lpm,    @lpm),
    total_seconds  = total_seconds  + @secs
    WHERE user_id = (SELECT id FROM users WHERE username = ? COLLATE NOCASE)`),
  leaderboard:  db.prepare(`SELECT u.username, s.wins, s.kos, s.lines_sent, s.lines_cleared, s.games_played, s.best_lpm
    FROM users u JOIN stats s ON s.user_id = u.id ORDER BY s.wins DESC, s.kos DESC LIMIT 20`)
};

// ── App ───────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'tetris-arena-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

// ── Auth ──────────────────────────────────────────────────────────
app.post('/auth/register', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.json({ ok: false, error: 'Missing fields' });
  if (username.length < 2 || username.length > 16) return res.json({ ok: false, error: 'Username 2–16 chars' });
  if (!/^[a-zA-Z0-9_]+$/.test(username)) return res.json({ ok: false, error: 'Letters, numbers, _ only' });
  if (password.length < 4) return res.json({ ok: false, error: 'Password min 4 chars' });
  if (stmts.getUser.get(username)) return res.json({ ok: false, error: 'Username taken' });
  const info = stmts.insertUser.run(username, bcrypt.hashSync(password, 10));
  stmts.insertStats.run(info.lastInsertRowid);
  req.session.username = username;
  res.json({ ok: true, username });
});

app.post('/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = stmts.getUser.get(username);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.json({ ok: false, error: 'Wrong username or password' });
  req.session.username = user.username;
  res.json({ ok: true, username: user.username });
});

app.post('/auth/logout', (req, res) => { req.session.destroy(); res.json({ ok: true }); });
app.get('/auth/me', (req, res) => res.json({ username: req.session.username || null }));

app.get('/stats/:username', (req, res) => {
  const s = stmts.getStats.get(req.params.username);
  if (!s) return res.json({ ok: false, error: 'Not found' });
  res.json({ ok: true, stats: s });
});

app.get('/leaderboard', (_, res) => res.json({ ok: true, rows: stmts.leaderboard.all() }));

app.post('/stats/update', (req, res) => {
  const { username, d } = req.body || {};
  if (!username || !d) return res.json({ ok: false });
  try {
    stmts.updateStats.run(
      d.gp||0, d.wins||0, d.kos||0, d.ls||0, d.lr||0, d.lc||0, d.lpm||0, d.secs||0,
      username
    );
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

app.get('/', (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ── Rooms ─────────────────────────────────────────────────────────
const rooms = new Map();

function mkCode() {
  const C = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  while (c.length < 4) c += C[Math.random() * C.length | 0];
  return rooms.has(c) ? mkCode() : c;
}
function arr(room) {
  return [...room.players.values()].map(p => ({ id: p.id, name: p.name, alive: p.alive }));
}
function checkWin(room) {
  if (room.state !== 'playing') return;
  const alive = [...room.players.values()].filter(p => p.alive);
  if (alive.length > 1) return;
  room.state = 'ended';
  const w = alive[0] || null;
  // Build round summary for all players
  const summary = {};
  for (const [id, p] of room.players) {
    summary[id] = {
      name:    p.name,
      wins:    (room.roundWins?.[id] || 0),
      linesSent:     p.stats?.linesSent     || 0,
      linesReceived: p.stats?.linesReceived || 0,
      linesCleared:  p.stats?.linesCleared  || 0,
      kos:           p.stats?.kos           || 0,
    };
  }
  // Track cumulative round wins
  if (!room.roundWins) room.roundWins = {};
  if (w) room.roundWins[w.id] = (room.roundWins[w.id] || 0) + 1;
  // Add updated wins to summary
  if (w) summary[w.id].wins = room.roundWins[w.id];
  room.lastSummary = summary;
  io.to(room.code).emit('game-over', {
    winnerId: w?.id || null, winnerName: w?.name || 'Nobody', summary
  });
}

io.on('connection', socket => {
  let room = null, myName = 'Player', myUsername = null;

  function enter(r) {
    room = r;
    socket.join(r.code);
    r.players.set(socket.id, {
      id: socket.id, name: myName, alive: true, username: myUsername,
      stats: { kos:0, linesSent:0, linesReceived:0, linesCleared:0 }
    });
  }

  socket.on('create-room', ({ name, username }) => {
    myName = (name||'Player').slice(0,16);
    myUsername = username || null;
    const code = mkCode();
    const r = { code, host: socket.id, state: 'lobby', players: new Map(), startTime: null };
    rooms.set(code, r);
    enter(r);
    socket.emit('room-created', { code, players: arr(r), isHost: true, hostId: socket.id });
  });

  socket.on('join-room', ({ code, name, username }) => {
    myName = (name||'Player').slice(0,16);
    myUsername = username || null;
    const r = rooms.get((code||'').toUpperCase());
    if (!r) return socket.emit('error-msg', 'Room not found');
    if (r.state !== 'lobby') return socket.emit('error-msg', 'Game in progress');
    if (r.players.size >= 4) return socket.emit('error-msg', 'Room full (max 4)');
    enter(r);
    socket.emit('room-joined', { code: r.code, players: arr(r), isHost: false, hostId: r.host });
    socket.to(r.code).emit('player-joined', { id: socket.id, name: myName });
  });

  socket.on('start-game', () => {
    if (!room || room.host !== socket.id || room.state !== 'lobby') return;
    room.state = 'playing';
    room.startTime = Date.now();
    for (const p of room.players.values()) {
      p.alive = true;
      p.stats = { kos:0, linesSent:0, linesReceived:0, linesCleared:0 };
    }
    io.to(room.code).emit('game-start', { players: arr(room) });
  });

  socket.on('board-update', ({ board }) => {
    if (!room) return;
    socket.to(room.code).emit('board-update', { id: socket.id, board });
  });

  socket.on('send-garbage', ({ lines }) => {
    if (!room || !lines) return;
    const alive = [...room.players.entries()].filter(([id,p]) => id !== socket.id && p.alive);
    if (!alive.length) return;
    const [tid, tp] = alive[Math.random() * alive.length | 0];
    const me = room.players.get(socket.id);
    if (me?.stats) me.stats.linesSent += lines;
    if (tp?.stats) tp.stats.linesReceived += lines;
    io.to(tid).emit('garbage-incoming', { lines, from: socket.id });
  });

  socket.on('lines-cleared', ({ total }) => {
    const me = room?.players.get(socket.id);
    if (me?.stats) me.stats.linesCleared = total;
  });

  socket.on('player-dead', ({ kos }) => {
    if (!room) return;
    const p = room.players.get(socket.id);
    if (p) { p.alive = false; if (p.stats) p.stats.kos = kos || 0; }
    // Save stats for this player
    const elapsed = room.startTime ? Math.round((Date.now() - room.startTime) / 1000) : 0;
    const stats = p?.stats || {};
    const lpm = elapsed > 0 ? (stats.linesCleared / (elapsed / 60)) : 0;
    if (p?.username) {
      fetch(`http://localhost:${process.env.PORT || 3000}/stats/update`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: p.username, d: {
          gp:1, wins:0, kos: stats.kos||0,
          ls: stats.linesSent||0, lr: stats.linesReceived||0,
          lc: stats.linesCleared||0, lpm: Math.round(lpm*10)/10, secs: elapsed
        }})
      }).catch(()=>{});
    }
    socket.to(room.code).emit('player-eliminated', { id: socket.id });
    checkWin(room);
  });

  socket.on('game-won', ({ kos }) => {
    // Winner stats
    if (!room) return;
    const elapsed = room.startTime ? Math.round((Date.now() - room.startTime) / 1000) : 0;
    const p = room.players.get(socket.id);
    const stats = p?.stats || {};
    const lpm = elapsed > 0 ? (stats.linesCleared / (elapsed / 60)) : 0;
    if (p?.username) {
      fetch(`http://localhost:${process.env.PORT || 3000}/stats/update`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: p.username, d: {
          gp:1, wins:1, kos: kos||stats.kos||0,
          ls: stats.linesSent||0, lr: stats.linesReceived||0,
          lc: stats.linesCleared||0, lpm: Math.round(lpm*10)/10, secs: elapsed
        }})
      }).catch(()=>{});
    }
  });

  socket.on('return-to-lobby', () => {
    if (!room || room.host !== socket.id) return;
    room.state = 'lobby';
    for (const p of room.players.values()) p.alive = true;
    io.to(room.code).emit('returned-to-lobby', { 
      players: arr(room),
      summary: room.lastSummary || null,
      roundWins: room.roundWins || {}
    });
  });

  socket.on('disconnect', () => {
    if (!room) return;
    const name = room.players.get(socket.id)?.name || 'Player';
    room.players.delete(socket.id);
    io.to(room.code).emit('player-left', { id: socket.id, name });
    if (room.players.size === 0) { rooms.delete(room.code); return; }
    if (room.host === socket.id) {
      room.host = room.players.keys().next().value;
      io.to(room.code).emit('host-changed', { id: room.host });
    }
    if (room.state === 'playing') checkWin(room);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Tetris Arena → port ${PORT}`));
