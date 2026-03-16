'use strict';
const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

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
  io.to(room.code).emit('game-over', {
    winnerId:   w ? w.id   : null,
    winnerName: w ? w.name : 'Nobody'
  });
}

io.on('connection', socket => {
  let room = null;
  let myName = 'Player';

  function enter(r) {
    room = r;
    socket.join(r.code);
    r.players.set(socket.id, { id: socket.id, name: myName, alive: true });
  }

  socket.on('create-room', ({ name }) => {
    myName = (name || 'Player').slice(0, 16);
    const code = mkCode();
    const r = { code, host: socket.id, state: 'lobby', players: new Map() };
    rooms.set(code, r);
    enter(r);
    socket.emit('room-created', { code, players: arr(r), isHost: true, hostId: socket.id });
  });

  socket.on('join-room', ({ code, name }) => {
    myName = (name || 'Player').slice(0, 16);
    const r = rooms.get((code || '').toUpperCase());
    if (!r)                  return socket.emit('error-msg', 'Room not found');
    if (r.state !== 'lobby') return socket.emit('error-msg', 'Game already in progress');
    if (r.players.size >= 4) return socket.emit('error-msg', 'Room is full (max 4)');
    enter(r);
    socket.emit('room-joined', { code: r.code, players: arr(r), isHost: false, hostId: r.host });
    socket.to(r.code).emit('player-joined', { id: socket.id, name: myName });
  });

  socket.on('start-game', () => {
    if (!room || room.host !== socket.id || room.state !== 'lobby') return;
    room.state = 'playing';
    for (const p of room.players.values()) p.alive = true;
    io.to(room.code).emit('game-start', { players: arr(room) });
  });

  socket.on('board-update', ({ board }) => {
    if (!room) return;
    socket.to(room.code).emit('board-update', { id: socket.id, board });
  });

  socket.on('send-garbage', ({ lines }) => {
    if (!room || !lines) return;
    const alive = [...room.players.entries()].filter(([id, p]) => id !== socket.id && p.alive);
    if (!alive.length) return;
    const [tid] = alive[Math.random() * alive.length | 0];
    io.to(tid).emit('garbage-incoming', { lines, from: socket.id });
  });

  socket.on('player-dead', () => {
    if (!room) return;
    const p = room.players.get(socket.id);
    if (p) p.alive = false;
    socket.to(room.code).emit('player-eliminated', { id: socket.id });
    checkWin(room);
  });

  socket.on('return-to-lobby', () => {
    if (!room || room.host !== socket.id) return;
    room.state = 'lobby';
    for (const p of room.players.values()) p.alive = true;
    io.to(room.code).emit('returned-to-lobby', { players: arr(room) });
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
