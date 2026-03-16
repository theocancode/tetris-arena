'use strict';
// app.js — UI controller, socket wiring, screen management

const socket = io();

// ── State ─────────────────────────────────────────────────
let myId     = null;
let roomCode = null;
let isHost   = false;
let hostId   = null;
let players  = [];   // [{id, name, alive}]
let gm       = null; // GameManager instance

// ── Helpers ───────────────────────────────────────────────
function $(id) { return document.getElementById(id); }

function showScreen(id) {
  ['landing','lobby','game'].forEach(s => {
    const el = $(s);
    if (el) el.classList.toggle('hidden', s !== id);
  });
}

function toast(msg, ms=2200) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), ms);
}

function setError(id, msg) { $(id).textContent = msg; }

// ── Lobby player list ─────────────────────────────────────
function rebuildPlayerList() {
  const ul = $('player-list');
  ul.innerHTML = '';
  for (const p of players) {
    const row = document.createElement('div');
    row.className = 'player-row' + (p.id === myId ? ' you' : '');
    row.dataset.pid = p.id;
    const dot = document.createElement('span');
    dot.className = 'player-dot' + (p.id === hostId ? ' host' : '');
    const name = document.createElement('span');
    name.className = 'player-name';
    name.textContent = p.name;
    const badge = document.createElement('span');
    badge.className = 'player-badge';
    if (p.id === myId)   badge.textContent = 'YOU';
    if (p.id === hostId) badge.textContent = (p.id === myId ? 'YOU · ' : '') + 'HOST';
    row.append(dot, name, badge);
    ul.appendChild(row);
  }
  // Show start button only to host
  const canStart = isHost && players.length >= 1;
  $('btn-start').classList.toggle('hidden', !isHost);
  $('waiting-msg').classList.toggle('hidden', isHost);
}

// ── Socket: connect ───────────────────────────────────────
socket.on('connect', () => { myId = socket.id; });

// ── Socket: room events ───────────────────────────────────
socket.on('room-created', ({ code, players: pl, isHost: h, hostId: hid }) => {
  roomCode = code;
  isHost   = h;
  hostId   = hid;
  players  = pl;
  $('lobby-code').textContent = code;
  rebuildPlayerList();
  showScreen('lobby');
});

socket.on('room-joined', ({ code, players: pl, isHost: h, hostId: hid }) => {
  roomCode = code;
  isHost   = h;
  hostId   = hid;
  players  = pl;
  $('lobby-code').textContent = code;
  rebuildPlayerList();
  showScreen('lobby');
});

socket.on('player-joined', ({ id, name }) => {
  if (!players.find(p => p.id === id)) players.push({ id, name, alive: true });
  rebuildPlayerList();
  toast(`${name} joined`);
});

socket.on('player-left', ({ id, name }) => {
  players = players.filter(p => p.id !== id);
  rebuildPlayerList();
  toast(`${name || 'Player'} left`);
  if (gm) gm.opponents[id] && (gm.opponents[id].alive = false);
});

socket.on('host-changed', ({ id }) => {
  hostId = id;
  isHost = id === myId;
  rebuildPlayerList();
  if (isHost) toast('You are now the host');
});

socket.on('error-msg', msg => setError('landing-err', msg));

// ── Socket: game start ────────────────────────────────────
socket.on('game-start', ({ players: pl }) => {
  players = pl;
  startGame();
});

// ── Socket: return to lobby ───────────────────────────────
socket.on('returned-to-lobby', ({ players: pl }) => {
  players = pl;
  if (gm) { gm.stop(); gm = null; }
  hideOverlay();
  $('lobby-code').textContent = roomCode;
  rebuildPlayerList();
  showScreen('lobby');
});

// ── Game lifecycle ────────────────────────────────────────
function startGame() {
  showScreen('game');
  hideOverlay();
  removeBanner();

  // Size canvas
  const canvas = $('game-canvas');
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;

  if (gm) gm.stop();
  gm = new GameManager(canvas, socket, myId, players);
  gm.start();
}

window.addEventListener('local-dead', () => {
  showBanner('ELIMINATED');
});

window.addEventListener('game-over', e => {
  const { winnerId, winnerName, myId: mid } = e.detail;
  const iWon = winnerId === mid;
  $('ov-title').textContent    = iWon ? '🏆 WINNER!' : 'GAME OVER';
  $('ov-title').className      = 'overlay-title ' + (iWon ? 'win' : 'lose');
  $('ov-sub').textContent      = iWon ? 'You outlasted everyone!' : `${winnerName} wins`;
  $('btn-rematch').classList.toggle('hidden', !isHost);
  showOverlay();
});

// ── Overlays ──────────────────────────────────────────────
function showOverlay() { $('overlay-gameover').classList.remove('hidden'); }
function hideOverlay() { $('overlay-gameover').classList.add('hidden'); }

let _banner = null;
function showBanner(msg) {
  removeBanner();
  _banner = document.createElement('div');
  _banner.className = 'dead-banner';
  _banner.textContent = msg;
  document.body.appendChild(_banner);
  setTimeout(removeBanner, 2600);
}
function removeBanner() {
  if (_banner) { _banner.remove(); _banner = null; }
}

// ── Button handlers ───────────────────────────────────────
$('btn-create').addEventListener('click', () => {
  setError('landing-err','');
  const name = $('inp-name').value.trim() || 'Player';
  socket.emit('create-room', { name });
});

$('btn-join').addEventListener('click', () => {
  setError('landing-err','');
  const name = $('inp-name').value.trim() || 'Player';
  const code = $('inp-code').value.trim().toUpperCase();
  if (!code) return setError('landing-err','Enter a room code');
  socket.emit('join-room', { code, name });
});

$('inp-code').addEventListener('keydown', e => {
  if (e.key === 'Enter') $('btn-join').click();
});
$('inp-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') $('btn-create').click();
});

$('btn-start').addEventListener('click', () => {
  socket.emit('start-game');
});

$('btn-leave').addEventListener('click', () => {
  socket.disconnect();
  socket.connect();
  players = [];
  showScreen('landing');
});

$('btn-rematch').addEventListener('click', () => {
  socket.emit('return-to-lobby');
});

$('btn-back-lobby').addEventListener('click', () => {
  socket.emit('return-to-lobby');
});

$('btn-quit').addEventListener('click', () => {
  socket.disconnect();
  socket.connect();
  players = [];
  if (gm) { gm.stop(); gm = null; }
  hideOverlay();
  showScreen('landing');
});

// ── Copy room code ────────────────────────────────────────
$('lobby-code').addEventListener('click', () => {
  const url = `${location.origin}?join=${roomCode}`;
  navigator.clipboard.writeText(url).then(() => toast('Link copied!'));
});
$('copy-hint').addEventListener('click', () => $('lobby-code').click());

// ── Auto-join from URL ────────────────────────────────────
const urlCode = new URLSearchParams(location.search).get('join');
if (urlCode) {
  $('inp-code').value = urlCode.toUpperCase();
  toast(`Room code ${urlCode} loaded — enter your name and join!`);
}

// ── Resize ────────────────────────────────────────────────
window.addEventListener('resize', () => {
  const canvas = $('game-canvas');
  if (!canvas || $('game').classList.contains('hidden')) return;
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;

