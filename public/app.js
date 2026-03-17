var socket = io();
var myId = null, roomCode = null, isHost = false, hostId = null;
var players = [], gm = null;
var currentUser = null; // logged-in username or null
var myKOs = 0;         // tracked client-side during game

function $(id) { return document.getElementById(id); }

function showScreen(id) {
  ['landing','lobby','game','stats-screen'].forEach(s => {
    var el = $(s);
    if (el) el.classList.toggle('hidden', s !== id);
  });
}
function toast(msg, ms) {
  var t = $('toast'); ms = ms||2200;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(function(){ t.classList.remove('show'); }, ms);
}
function setError(id, msg) { $(id).textContent = msg; }

// ── Auth ──────────────────────────────────────────────────────────
function updateAuthUI() {
  if (currentUser) {
    $('logged-in-bar').classList.remove('hidden');
    $('not-logged-note').classList.add('hidden');
    $('logged-in-name').textContent = '👤 ' + currentUser;
  } else {
    $('logged-in-bar').classList.add('hidden');
    $('not-logged-note').classList.remove('hidden');
  }
}

fetch('/auth/me').then(function(r){ return r.json(); }).then(function(d){
  if (d.username) { currentUser = d.username; updateAuthUI(); }
});

function doLogin() {
  var u = $('auth-username').value.trim();
  var p = $('auth-password').value;
  setError('auth-err','');
  fetch('/auth/login', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ username:u, password:p }) })
  .then(function(r){ return r.json(); }).then(function(d){
    if (!d.ok) return setError('auth-err', d.error);
    currentUser = d.username;
    updateAuthUI();
    $('auth-modal').classList.add('hidden');
    toast('Welcome back, ' + currentUser + '!');
  });
}

function doRegister() {
  var u = $('reg-username').value.trim();
  var p = $('reg-password').value;
  setError('reg-err','');
  fetch('/auth/register', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ username:u, password:p }) })
  .then(function(r){ return r.json(); }).then(function(d){
    if (!d.ok) return setError('reg-err', d.error);
    currentUser = d.username;
    updateAuthUI();
    $('auth-modal').classList.add('hidden');
    toast('Account created! Welcome, ' + currentUser + '!');
  });
}

$('open-auth-link').addEventListener('click', function(){ $('auth-modal').classList.remove('hidden'); });
$('btn-close-auth').addEventListener('click', function(){ $('auth-modal').classList.add('hidden'); });
$('btn-do-login').addEventListener('click', doLogin);
$('btn-do-register').addEventListener('click', doRegister);
$('auth-password').addEventListener('keydown', function(e){ if(e.key==='Enter') doLogin(); });
$('reg-password').addEventListener('keydown', function(e){ if(e.key==='Enter') doRegister(); });

$('tab-login').addEventListener('click', function(){
  $('tab-login').classList.add('active'); $('tab-register').classList.remove('active');
  $('panel-login').classList.add('active'); $('panel-register').classList.remove('active');
});
$('tab-register').addEventListener('click', function(){
  $('tab-register').classList.add('active'); $('tab-login').classList.remove('active');
  $('panel-register').classList.add('active'); $('panel-login').classList.remove('active');
});

$('btn-logout').addEventListener('click', function(){
  fetch('/auth/logout', { method:'POST' }).then(function(){
    currentUser = null; updateAuthUI(); toast('Logged out');
  });
});

// ── Stats ─────────────────────────────────────────────────────────
function showStats() {
  showScreen('stats-screen');
  loadMyStats();
  loadLeaderboard();
}
function loadMyStats() {
  if (!currentUser) {
    $('stats-grid').innerHTML = '<p style="color:var(--muted);font-size:.75rem;text-align:center;padding:20px">Sign in to track your stats</p>';
    return;
  }
  $('stats-title').textContent = currentUser.toUpperCase() + ' · STATS';
  fetch('/stats/' + currentUser).then(function(r){ return r.json(); }).then(function(d){
    if (!d.ok) return;
    var s = d.stats;
    var winRate = s.games_played > 0 ? Math.round(s.wins/s.games_played*100) : 0;
    var grid = [
      { label:'Games Played', val: s.games_played, accent: false },
      { label:'Win Rate',     val: winRate + '%',  accent: true },
      { label:'Total Wins',   val: s.wins,          accent: true },
      { label:'Total KOs',    val: s.kos,           accent: false },
      { label:'Lines Sent',   val: s.lines_sent,    accent: false },
      { label:'Lines Cleared',val: s.lines_cleared, accent: false },
      { label:'Best LPM',     val: s.best_lpm.toFixed(1), accent: true },
      { label:'Time Played',  val: formatTime(s.total_seconds), accent: false },
    ];
    $('stats-grid').innerHTML = grid.map(function(g){
      return '<div class="stat-box"><div class="stat-label">' + g.label + '</div>' +
        '<div class="stat-value' + (g.accent?' accent':'') + '">' + g.val + '</div></div>';
    }).join('');
  });
}
function loadLeaderboard() {
  fetch('/leaderboard').then(function(r){ return r.json(); }).then(function(d){
    if (!d.ok) return;
    var medals = ['🥇','🥈','🥉'];
    $('leaderboard-list').innerHTML = d.rows.map(function(r, i){
      return '<div class="leaderboard-row">' +
        '<span class="lb-rank ' + (i===0?'gold':i===1?'silver':i===2?'bronze':'') + '">' + (medals[i]||i+1) + '</span>' +
        '<span class="lb-name">' + r.username + '</span>' +
        '<span class="lb-stat">' + r.wins + 'W · ' + r.kos + ' KOs</span>' +
        '<span class="lb-stat" style="margin-left:8px">' + r.best_lpm.toFixed(1) + ' LPM</span>' +
        '</div>';
    }).join('') || '<p style="color:var(--muted);text-align:center;padding:16px;font-size:.75rem">No games played yet</p>';
  });
}
function formatTime(secs) {
  if (!secs) return '0m';
  var h = Math.floor(secs/3600), m = Math.floor((secs%3600)/60);
  return h > 0 ? h+'h '+m+'m' : m+'m';
}

// Tab switching in stats screen
document.querySelectorAll('.tab-btn').forEach(function(btn){
  btn.addEventListener('click', function(){
    document.querySelectorAll('.tab-btn').forEach(function(b){ b.classList.remove('active'); });
    document.querySelectorAll('.tab-content').forEach(function(c){ c.classList.remove('active'); });
    btn.classList.add('active');
    $('tab-'+btn.dataset.tab).classList.add('active');
  });
});

$('btn-view-stats').addEventListener('click', showStats);
$('btn-close-stats').addEventListener('click', function(){ showScreen('landing'); });

// ── Lobby ─────────────────────────────────────────────────────────
function rebuildPlayerList() {
  var ul = $('player-list');
  ul.innerHTML = '';
  for (var i=0; i<players.length; i++) {
    var p = players[i];
    var row = document.createElement('div');
    row.className = 'player-row' + (p.id===myId?' you':'');
    var dot = document.createElement('span');
    dot.className = 'player-dot' + (p.id===hostId?' host':'');
    var name = document.createElement('span');
    name.className = 'player-name';
    name.textContent = p.name;
    var badge = document.createElement('span');
    badge.className = 'player-badge';
    if (p.id===myId && p.id===hostId) badge.textContent = 'YOU · HOST';
    else if (p.id===myId) badge.textContent = 'YOU';
    else if (p.id===hostId) badge.textContent = 'HOST';
    row.append(dot, name, badge);
    ul.appendChild(row);
  }
  $('btn-start').classList.toggle('hidden', !isHost);
  $('waiting-msg').classList.toggle('hidden', isHost);
}

// ── Socket ────────────────────────────────────────────────────────
socket.on('connect', function(){ myId = socket.id; });

socket.on('room-created', function(d){
  roomCode=d.code; isHost=d.isHost; hostId=d.hostId; players=d.players;
  $('lobby-code').textContent=d.code; rebuildPlayerList(); showScreen('lobby');
});
socket.on('room-joined', function(d){
  roomCode=d.code; isHost=d.isHost; hostId=d.hostId; players=d.players;
  $('lobby-code').textContent=d.code; rebuildPlayerList(); showScreen('lobby');
});
socket.on('player-joined', function(d){
  if (!players.find(function(p){ return p.id===d.id; })) players.push({id:d.id,name:d.name,alive:true});
  rebuildPlayerList(); toast(d.name+' joined');
});
socket.on('player-left', function(d){
  players=players.filter(function(p){ return p.id!==d.id; });
  rebuildPlayerList(); toast((d.name||'Player')+' left');
  if (gm && gm.opponents[d.id]) gm.opponents[d.id].alive=false;
});
socket.on('host-changed', function(d){
  hostId=d.id; isHost=d.id===myId; rebuildPlayerList();
  if (isHost) toast('You are now the host');
});
socket.on('error-msg', function(msg){ setError('landing-err', msg); });
socket.on('game-start', function(d){ players=d.players; myKOs=0; startGame(); });
socket.on('returned-to-lobby', function(d){
  players=d.players;
  if (gm){ gm.stop(); gm=null; }
  hideOverlay();
  $('lobby-code').textContent=roomCode;
  rebuildPlayerList();
  if (d.summary) showRoundSummary(d.summary, d.roundWins || {});
  showScreen('lobby');
});

function showRoundSummary(summary, roundWins) {
  var box = $('round-summary');
  var rows = $('summary-rows');
  if (!box || !rows) return;
  var entries = Object.values(summary).sort(function(a,b){ return (roundWins[b.id]||b.wins||0) - (roundWins[a.id]||a.wins||0); });
  rows.innerHTML = entries.map(function(p) {
    var wins = roundWins[p.name] || p.wins || 0;
    return '<div class="summary-row">' +
      '<span class="summary-crown">' + (wins > 0 ? '👑' : '  ') + '</span>' +
      '<span class="summary-name">' + p.name + '</span>' +
      '<span class="summary-stat">Wins: <span>' + wins + '</span></span>' +
      '<span class="summary-stat">KOs: <span>' + (p.kos||0) + '</span></span>' +
      '<span class="summary-stat">Sent: <span>' + (p.linesSent||0) + '</span></span>' +
      '<span class="summary-stat">Got: <span>' + (p.linesReceived||0) + '</span></span>' +
    '</div>';
  }).join('');
  box.style.display = 'block';
}

// ── Game ──────────────────────────────────────────────────────────
function startGame() {
  showScreen('game');
  hideOverlay(); removeBanner();
  var canvas = $('game-canvas');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  if (gm) gm.stop();
  gm = new GameManager(canvas, socket, myId, players);
  gm.start();
}

window.addEventListener('local-dead', function(){
  showBanner('ELIMINATED');
  // Emit stats
  if (gm) {
    socket.emit('player-dead', { kos: myKOs });
    socket.emit('lines-cleared', { total: gm.engine ? gm.engine.lines : 0 });
  }
});

window.addEventListener('game-over', function(e){
  var d = e.detail;
  var iWon = d.winnerId === d.myId;
  $('ov-title').textContent = iWon ? 'WINNER!' : 'GAME OVER';
  $('ov-title').className = 'overlay-title ' + (iWon?'win':'lose');
  $('ov-sub').textContent = iWon ? 'You outlasted everyone!' : (d.winnerName+' wins');
  $('btn-rematch').classList.toggle('hidden', !isHost);
  if (iWon) socket.emit('game-won', { kos: myKOs });
  showOverlay();
});

window.addEventListener('player-ko', function(e){
  myKOs++;
  if (gm) socket.emit('lines-cleared', { total: gm.engine ? gm.engine.lines : 0 });
});

function showOverlay() { $('overlay-gameover').classList.remove('hidden'); }
function hideOverlay()  { $('overlay-gameover').classList.add('hidden'); }

var _banner = null;
function showBanner(msg) {
  removeBanner();
  _banner = document.createElement('div');
  _banner.className = 'dead-banner'; _banner.textContent = msg;
  document.body.appendChild(_banner);
  setTimeout(removeBanner, 2600);
}
function removeBanner() { if (_banner){ _banner.remove(); _banner=null; } }

// ── Buttons ───────────────────────────────────────────────────────
$('btn-create').addEventListener('click', function(){
  setError('landing-err','');
  var name = $('inp-name').value.trim() || currentUser || 'Player';
  socket.emit('create-room', { name: name, username: currentUser });
});
$('btn-join').addEventListener('click', function(){
  setError('landing-err','');
  var name = $('inp-name').value.trim() || currentUser || 'Player';
  var code = $('inp-code').value.trim().toUpperCase();
  if (!code) return setError('landing-err','Enter a room code');
  socket.emit('join-room', { code: code, name: name, username: currentUser });
});
$('inp-code').addEventListener('keydown', function(e){ if(e.key==='Enter') $('btn-join').click(); });
$('inp-name').addEventListener('keydown', function(e){ if(e.key==='Enter') $('btn-create').click(); });
$('btn-start').addEventListener('click', function(){ socket.emit('start-game'); });
$('btn-leave').addEventListener('click', function(){
  socket.disconnect(); socket.connect(); players=[]; showScreen('landing');
});
$('btn-rematch').addEventListener('click', function(){ socket.emit('return-to-lobby'); });
$('btn-back-lobby').addEventListener('click', function(){ socket.emit('return-to-lobby'); });
$('btn-quit').addEventListener('click', function(){
  socket.disconnect(); socket.connect(); players=[];
  if (gm){ gm.stop(); gm=null; }
  hideOverlay(); showScreen('landing');
});
$('lobby-code').addEventListener('click', function(){
  navigator.clipboard.writeText(location.origin+'?join='+roomCode).then(function(){ toast('Link copied!'); });
});
$('copy-hint').addEventListener('click', function(){ $('lobby-code').click(); });

var urlCode = new URLSearchParams(location.search).get('join');
if (urlCode) {
  $('inp-code').value = urlCode.toUpperCase();
  toast('Room code '+urlCode+' loaded — enter name and join!');
}
window.addEventListener('resize', function(){
  var canvas = $('game-canvas');
  if (!canvas || $('game').classList.contains('hidden')) return;
  canvas.width=window.innerWidth; canvas.height=window.innerHeight;
});

// Mute
var muted = false;
$('btn-mute').addEventListener('click', function(){
  muted=!muted; SoundSystem.setEnabled(!muted);
  $('btn-mute').textContent = muted ? '🔇 MUTED' : '🔊 SOUND';
});
SoundSystem.init();
