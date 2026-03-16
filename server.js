const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c;
  do {
    c = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms[c]);
  return c;
}

function roomInfo(r) {
  return {
    code: r.code, host: r.host, state: r.state,
    players: r.players.map(p => ({ id: p.id, name: p.name, alive: p.alive }))
  };
}

io.on('connection', socket => {
  let myRoom = null;

  socket.on('create_room', ({ name }) => {
    const code = genCode();
    rooms[code] = { code, host: socket.id, state: 'lobby',
      players: [{ id: socket.id, name, alive: true }] };
    myRoom = code;
    socket.join(code);
    socket.emit('room_joined', { ...roomInfo(rooms[code]), yourId: socket.id });
  });

  socket.on('join_room', ({ code, name }) => {
    const key = code.trim().toUpperCase();
    const r = rooms[key];
    if (!r) return socket.emit('join_error', 'Room not found');
    if (r.state !== 'lobby') return socket.emit('join_error', 'Game already in progress');
    if (r.players.length >= 4) return socket.emit('join_error', 'Room is full (max 4)');
    if (r.players.find(p => p.name.toLowerCase() === name.trim().toLowerCase()))
      return socket.emit('join_error', 'Name already taken');
    r.players.push({ id: socket.id, name: name.trim(), alive: true });
    myRoom = key;
    socket.join(key);
    socket.emit('room_joined', { ...roomInfo(r), yourId: socket.id });
    socket.to(key).emit('room_update', roomInfo(r));
  });

  socket.on('start_game', () => {
    if (!myRoom) return;
    const r = rooms[myRoom];
    if (!r || r.host !== socket.id || r.state !== 'lobby') return;
    r.state = 'playing';
    r.players.forEach(p => { p.alive = true; });
    io.to(myRoom).emit('game_start', roomInfo(r));
  });

  socket.on('board_update', data => {
    if (!myRoom) return;
    socket.to(myRoom).emit('opp_board', { id: socket.id, ...data });
  });

  socket.on('lines_cleared', ({ count, btb }) => {
    if (!myRoom) return;
    const r = rooms[myRoom];
    if (!r || r.state !== 'playing') return;
    const table = [0, 0, 1, 2, 4];
    let garb = table[Math.min(count, 4)] || 0;
    if (count === 4 && btb) garb = 6;
    if (garb > 0) {
      r.players.filter(p => p.id !== socket.id && p.alive)
        .forEach(p => io.to(p.id).emit('recv_garbage', { amount: garb }));
    }
  });

  socket.on('player_dead', () => {
    if (!myRoom) return;
    const r = rooms[myRoom];
    if (!r) return;
    const p = r.players.find(p => p.id === socket.id);
    if (p) p.alive = false;
    io.to(myRoom).emit('player_out', { id: socket.id });
    checkWin(r);
  });

  socket.on('back_to_lobby', () => {
    if (!myRoom) return;
    const r = rooms[myRoom];
    if (!r || r.host !== socket.id) return;
    r.state = 'lobby';
    r.players.forEach(p => { p.alive = true; });
    io.to(myRoom).emit('lobby_reset', roomInfo(r));
  });

  socket.on('disconnect', () => {
    if (!myRoom || !rooms[myRoom]) return;
    const r = rooms[myRoom];
    const idx = r.players.findIndex(p => p.id === socket.id);
    if (idx === -1) return;
    r.players.splice(idx, 1);
    if (r.players.length === 0) { delete rooms[myRoom]; return; }
    if (r.host === socket.id) r.host = r.players[0].id;
    io.to(myRoom).emit('player_out', { id: socket.id });
    io.to(myRoom).emit('room_update', roomInfo(r));
    if (r.state === 'playing') checkWin(r);
  });

  function checkWin(r) {
    const alive = r.players.filter(p => p.alive);
    if (alive.length <= 1 && r.state === 'playing') {
      r.state = 'lobby';
      io.to(r.code).emit('game_over', {
        winnerId: alive[0]?.id ?? null,
        winnerName: alive[0]?.name ?? null
      });
    }
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`\u{1F9F1} Tetris Arena \u2192 port ${PORT}`));
