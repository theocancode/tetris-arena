'use strict';
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const path       = require('path');
const session    = require('express-session');
const fs         = require('fs');

// ── Simple JSON file database (no native deps) ────────────────────
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = path.join(DATA_DIR, 'users.json');

function loadDB() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch(e) { return { users: {}, stats: {} }; }
}
function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// ── App ───────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'tetris-friends-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 }
}));

// ── Auth routes ───────────────────────────────────────────────────
app.post('/auth/claim', (req, res) => {
  const { username } = req.body || {};
  if (!username) return res.json({ ok: false, error: 'Enter a username' });
  const u = username.trim();
  if (u.length < 2 || u.length > 16) return res.json({ ok: false, error: 'Username must be 2-16 chars' });
  if (!/^[a-zA-Z0-9_]+$/.test(u)) return res.json({ ok: false, error: 'Letters, numbers and _ only' });

  const db = loadDB();
  const key = u.toLowerCase();
  const isNew = !db.users[key];
  if (isNew) {
    db.users[key] = { username: u, created: Date.now() };
    db.stats[key] = { games_played:0, wins:0, kos:0, lines_sent:0, lines_received:0, lines_cleared:0, best_lpm:0, total_seconds:0 };
    saveDB(db);
  }
  req.session.username = db.users[key].username;
  res.json({ ok: true, username: db.users[key].username, isNew });
});

app.post('/auth/logout', (req, res) => { req.session.destroy(); res.json({ ok: true }); });
app.get('/auth/me', (req, res) => res.json({ username: req.session.username || null }));

app.get('/stats/:username', (req, res) => {
  const db = loadDB();
  const key = req.params.username.toLowerCase();
  const u = db.users[key];
  const s = db.stats[key];
  if (!u || !s) return res.json({ ok: false, error: 'Not found' });
  res.json({ ok: true, stats: { username: u.username, ...s } });
});

app.get('/leaderboard', (_, res) => {
  const db = loadDB();
  const rows = Object.keys(db.users).map(key => ({
    username: db.users[key].username,
    ...db.stats[key]
  })).sort((a, b) => b.wins - a.wins || b.kos - a.kos).slice(0, 20);
  res.json({ ok: true, rows });
});

app.post('/stats/update', (req, res) => {
  const { username, d } = req.body || {};
  if (!username || !d) return res.json({ ok: false });
  const db = loadDB();
  const key = username.toLowerCase();
  if (!db.stats[key]) return res.json({ ok: false, error: 'User not found' });
  const s = db.stats[key];
  s.games_played   += d.gp   || 0;
  s.wins           += d.wins || 0;
  s.kos            += d.kos  || 0;
  s.lines_sent     += d.ls   || 0;
  s.lines_received += d.lr   || 0;
  s.lines_cleared  += d.lc   || 0;
  s.best_lpm        = Math.max(s.best_lpm, d.lpm || 0);
  s.total_seconds  += d.secs || 0;
  saveDB(db);
  res.json({ ok: true });
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
  if (!room.roundWins) room.roundWins = {};
  if (w) room.roundWins[w.id] = (room.roundWins[w.id] || 0) + 1;
  const summary = {};
  for (const [id, p] of room.players) {
    summary[id] = {
      name: p.name,
      wins: room.roundWins[id] || 0,
      kos:  p.stats?.kos || 0,
      linesSent:     p.stats?.linesSent     || 0,
      linesReceived: p.stats?.linesReceived || 0,
      linesCleared:  p.stats?.linesCleared  || 0,
    };
  }
  room.lastSummary = summary;
  io.to(room.code).emit('game-over', {
    winnerId: w?.id || null, winnerName: w?.name || 'Nobody', summary
  });
}

function saveStats(username, pStats, isWin, startTime) {
  if (!username || !pStats) return;
  const elapsed = startTime ? Math.round((Date.now() - startTime) / 1000) : 0;
  const lpm = elapsed > 0 ? Math.round((pStats.linesCleared || 0) / (elapsed / 60) * 10) / 10 : 0;
  fetch(`http://localhost:${process.env.PORT || 3000}/stats/update`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, d: {
      gp: 1, wins: isWin ? 1 : 0, kos: pStats.kos || 0,
      ls: pStats.linesSent || 0, lr: pStats.linesReceived || 0,
      lc: pStats.linesCleared || 0, lpm, secs: elapsed
    }})
  }).catch(() => {});
}

io.on('connection', socket => {
  let room = null, myName = 'Player', myUsername = null;

  function enter(r) {
    room = r; socket.join(r.code);
    r.players.set(socket.id, {
      id: socket.id, name: myName, alive: true, username: myUsername,
      stats: { kos:0, linesSent:0, linesReceived:0, linesCleared:0 }
    });
  }

  socket.on('create-room', ({ name, username }) => {
    myName = (name||'Player').slice(0,16); myUsername = username || null;
    const code = mkCode();
    const r = { code, host: socket.id, state: 'lobby', players: new Map(), startTime: null, roundWins: {}, lastSummary: null };
    rooms.set(code, r); enter(r);
    socket.emit('room-created', { code, players: arr(r), isHost: true, hostId: socket.id });
  });

  socket.on('join-room', ({ code, name, username }) => {
    myName = (name||'Player').slice(0,16); myUsername = username || null;
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
    room.state = 'playing'; room.startTime = Date.now();
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

  socket.on('player-dead', (data) => {
    const kos = (data||{}).kos;
    if (!room) return;
    const p = room.players.get(socket.id);
    if (p) { p.alive = false; if (p.stats) p.stats.kos = kos || 0; }
    saveStats(p?.username, p?.stats, false, room.startTime);
    socket.to(room.code).emit('player-eliminated', { id: socket.id });
    checkWin(room);
  });

  socket.on('game-won', ({ kos }) => {
    if (!room) return;
    const p = room.players.get(socket.id);
    if (p?.stats) p.stats.kos = kos || p.stats.kos;
    saveStats(p?.username, p?.stats, true, room.startTime);
  });

  socket.on('return-to-lobby', () => {
    if (!room || room.host !== socket.id) return;
    room.state = 'lobby';
    for (const p of room.players.values()) p.alive = true;
    io.to(room.code).emit('returned-to-lobby', {
      players: arr(room), summary: room.lastSummary || null, roundWins: room.roundWins || {}
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
server.listen(PORT, () => console.log(`Tetris Friends → port ${PORT}`));
