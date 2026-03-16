
const socket = io();

let myId     = null;
let roomCode = null;
let isHost   = false;
let hostId   = null;
let players  = [];
let gm       = null;

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

function rebuildPlayerList() {
  const ul = $('player-list');
  ul.innerHTML = '';
  for (const p of players) {
    const row = document.createElement('div');
    row.className = 'player-row' + (p.id === myId ? ' you' : '');
    const dot = document.createElement('span');
    dot.className = 'player-dot' + (p.id === hostId ? ' host' : '');
    const name = document.createElement('span');
    name.className = 'player-name';
    name.textContent = p.name;
    const badge = document.createElement('span');
    badge.className = 'player-badge';
    if (p.id === myId && p.id === hostId) badge.textContent = 'YOU · HOST';
    else if (p.id === myId) badge.textContent = 'YOU';
    else if (p.id === hostId) badge.textContent = 'HOST';
    row.append(dot, name, badge);
    ul.appendChild(row);
  }
  $('btn-start').classList.toggle('hidden', !isHost);
  $('waiting-msg').classList.toggle('hidden', isHost);
}

socket.on('connect', () => { myId = socket.id; });

socket.on('room-created', ({ code, players: pl, isHost: h, hostId: hid }) => {
  roomCode = code; isHost = h; hostId = hid; players = pl;
  $('lobby-code').textContent = code;
  rebuildPlayerList();
  showScreen('lobby');
});

socket.on('room-joined', ({ code, players: pl, isHost: h, hostId: hid }) => {
  roomCode = code; isHost = h; hostId = hid; players = pl;
  $('lobby-code').textContent = code;
  rebuildPlayerList();
  showScreen('lobby');
});

socket.on('player-joined', ({ id, name }) => {
  if (!players.find(p => p.id === id)) players.push({ id, name, alive: true });
  rebuildPlayerList();
  toast(name + ' joined');
});

socket.on('player-left', ({ id, name }) => {
  players = players.filter(p => p.id !== id);
  rebuildPlayerList();
  toast((name || 'Player') + ' left');
  if (gm && gm.opponents[id]) gm.opponents[id].alive = false;
});

socket.on('host-changed', ({ id }) => {
  hostId = id; isHost = id === myId;
  rebuildPlayerList();
  if (isHost) toast('You are now the host');
});

socket.on('error-msg', msg => setError('landing-err', msg));

socket.on('game-start', ({ players: pl }) => {
  players = pl;
  startGame();
});

socket.on('returned-to-lobby', ({ players: pl }) => {
  players = pl;
  if (gm) { gm.stop(); gm = null; }
  hideOverlay();
  $('lobby-code').textContent = roomCode;
  rebuildPlayerList();
  showScreen('lobby');
});

function startGame() {
  showScreen('game');
  hideOverlay();
  removeBanner();
  const canvas = $('game-canvas');
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  if (gm) gm.stop();
  gm = new GameManager(canvas, socket, myId, players);
  gm.start();
}

window.addEventListener('local-dead', () => showBanner('ELIMINATED'));

window.addEventListener('game-over', function(e) {
  const winnerId = e.detail.winnerId;
  const winnerName = e.detail.winnerName;
  const mid = e.detail.myId;
  const iWon = winnerId === mid;
  $('ov-title').textContent = iWon ? 'WINNER!' : 'GAME OVER';
  $('ov-title').className   = 'overlay-title ' + (iWon ? 'win' : 'lose');
  $('ov-sub').textContent   = iWon ? 'You outlasted everyone!' : (winnerName + ' wins');
  $('btn-rematch').classList.toggle('hidden', !isHost);
  showOverlay();
});

function showOverlay() { $('overlay-gameover').classList.remove('hidden'); }
function hideOverlay()  { $('overlay-gameover').classList.add('hidden'); }

var _banner = null;
function showBanner(msg) {
  removeBanner();
  _banner = document.createElement('div');
  _banner.className   = 'dead-banner';
  _banner.textContent = msg;
  document.body.appendChild(_banner);
  setTimeout(removeBanner, 2600);
}
function removeBanner() {
  if (_banner) { _banner.remove(); _banner = null; }
}

$('btn-create').addEventListener('click', function() {
  setError('landing-err', '');
  var name = $('inp-name').value.trim() || 'Player';
  socket.emit('create-room', { name: name });
});

$('btn-join').addEventListener('click', function() {
  setError('landing-err', '');
  var name = $('inp-name').value.trim() || 'Player';
  var code = $('inp-code').value.trim().toUpperCase();
  if (!code) { setError('landing-err', 'Enter a room code'); return; }
  socket.emit('join-room', { code: code, name: name });
});

$('inp-code').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') $('btn-join').click();
});
$('inp-name').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') $('btn-create').click();
});

$('btn-start').addEventListener('click', function() {
  socket.emit('start-game');
});

$('btn-leave').addEventListener('click', function() {
  socket.disconnect();
  socket.connect();
  players = [];
  showScreen('landing');
});

$('btn-rematch').addEventListener('click', function() {
  socket.emit('return-to-lobby');
});

$('btn-back-lobby').addEventListener('click', function() {
  socket.emit('return-to-lobby');
});

$('btn-quit').addEventListener('click', function() {
  socket.disconnect();
  socket.connect();
  players = [];
  if (gm) { gm.stop(); gm = null; }
  hideOverlay();
  showScreen('landing');
});

$('lobby-code').addEventListener('click', function() {
  var url = location.origin + '?join=' + roomCode;
  navigator.clipboard.writeText(url).then(function() { toast('Link copied!'); });
});

$('copy-hint').addEventListener('click', function() { $('lobby-code').click(); });

var urlCode = new URLSearchParams(location.search).get('join');
if (urlCode) {
  $('inp-code').value = urlCode.toUpperCase();
  toast('Room code ' + urlCode + ' loaded - enter your name and join!');
}

window.addEventListener('resize', function() {
  var canvas = $('game-canvas');
  if (!canvas || $('game').classList.contains('hidden')) return;
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
});

// Mute button
var muted = false;
document.getElementById('btn-mute').addEventListener('click', function() {
  muted = !muted;
  SoundSystem.setEnabled(!muted);
  document.getElementById('btn-mute').textContent = muted ? '🔇 MUTED' : '🔊 SOUND';
});

SoundSystem.init();
