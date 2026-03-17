var socket = io();
var myId = null, roomCode = null, isHost = false, hostId = null;
var players = [], gm = null;
var currentUser = null;
var myKOs = 0;

function $(id) { return document.getElementById(id); }
function on(id, evt, fn) { var el=$(id); if(el) el.addEventListener(evt,fn); }

function showScreen(id) {
  ['landing','lobby','game','stats-screen'].forEach(function(s) {
    var el=$(s); if(el) el.classList.toggle('hidden', s!==id);
  });
}
function toast(msg, ms) {
  var t=$('toast'); ms=ms||2200;
  t.textContent=msg; t.classList.add('show');
  clearTimeout(toast._t);
  toast._t=setTimeout(function(){ t.classList.remove('show'); }, ms);
}
function setError(id, msg) { var el=$(id); if(el) el.textContent=msg; }

// ── Auth: claim username ──────────────────────────────────────────
function updateAuthUI() {
  if (currentUser) {
    var bar = $('logged-in-bar');
    var note = $('not-logged-note');
    var nm = $('logged-in-name');
    if(bar)  bar.classList.remove('hidden');
    if(note) note.classList.add('hidden');
    if(nm)   nm.textContent = '👤 ' + currentUser;
    // Pre-fill name input with username
    var inp = $('inp-name');
    if(inp && !inp.value) inp.value = currentUser;
  } else {
    var bar = $('logged-in-bar');
    var note = $('not-logged-note');
    if(bar)  bar.classList.add('hidden');
    if(note) note.classList.remove('hidden');
  }
}

// Check if already logged in from session
fetch('/auth/me').then(function(r){ return r.json(); }).then(function(d){
  if (d.username) {
    currentUser = d.username;
    updateAuthUI();
  }
});

function claimProfile() {
  console.log('claimProfile called');
  var u = $('claim-username');
  console.log('claim-username element:', u);
  if (!u) return console.error('claim-username not found!');
  var name = u.value.trim();
  setError('claim-err', '');
  if (!name) return setError('claim-err', 'Enter a username');

  fetch('/auth/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: name })
  }).then(function(r){ return r.json(); }).then(function(d){
    if (!d.ok) return setError('claim-err', d.error);
    currentUser = d.username;
    updateAuthUI();
    $('auth-modal').classList.add('hidden');
    if (d.isNew) {
      toast('Profile created for ' + currentUser + '! Stats will be saved 🎉');
    } else {
      toast('Welcome back, ' + currentUser + '! Stats loaded ✓');
    }
  });
}

// Defer all DOM event handlers until page fully loaded
window.addEventListener('load', function() {

on('open-auth-link', 'click', function(){
  $('auth-modal').classList.remove('hidden');
  // Pre-fill with current name input if any
  var nameInp = $('inp-name');
  var claimInp = $('claim-username');
  if(nameInp && claimInp && nameInp.value) claimInp.value = nameInp.value;
});
on('btn-close-auth', 'click', function(){ $('auth-modal').classList.add('hidden'); });
on('btn-do-claim', 'click', claimProfile);
on('claim-username', 'keydown', function(e){ if(e.key==='Enter') claimProfile(); });

on('btn-logout', 'click', function(){
  fetch('/auth/logout', { method:'POST' }).then(function(){
    currentUser = null;
    updateAuthUI();
    toast('Logged out');
  });
});

// ── Stats ─────────────────────────────────────────────────────────
function showStats() {
  showScreen('stats-screen');
  loadMyStats();
  loadLeaderboard();
}

function loadMyStats() {
  var grid = $('stats-grid');
  var title = $('stats-title');
  if (!currentUser) {
    if(grid) grid.innerHTML = '<p style="color:var(--muted);font-size:.8rem;text-align:center;padding:24px;grid-column:1/-1">Save your profile to track stats!</p>';
    return;
  }
  if(title) title.textContent = currentUser.toUpperCase();
  fetch('/stats/' + currentUser).then(function(r){ return r.json(); }).then(function(d){
    if (!d.ok || !grid) return;
    var s = d.stats;
    var winRate = s.games_played > 0 ? Math.round(s.wins/s.games_played*100) : 0;
    var items = [
      { label:'Games Played', val: s.games_played },
      { label:'Win Rate',     val: winRate + '%',  accent: true },
      { label:'Wins',         val: s.wins,          accent: true },
      { label:'KOs',          val: s.kos },
      { label:'Lines Sent',   val: s.lines_sent },
      { label:'Lines Cleared',val: s.lines_cleared },
      { label:'Best LPM',     val: s.best_lpm.toFixed(1), accent: true },
      { label:'Time Played',  val: fmtTime(s.total_seconds) },
    ];
    grid.innerHTML = items.map(function(g){
      return '<div class="stat-box"><div class="stat-label">' + g.label + '</div>' +
        '<div class="stat-value' + (g.accent?' accent':'') + '">' + g.val + '</div></div>';
    }).join('');
  });
}

function loadLeaderboard() {
  var list = $('leaderboard-list');
  if(!list) return;
  fetch('/leaderboard').then(function(r){ return r.json(); }).then(function(d){
    if (!d.ok) return;
    var medals = ['🥇','🥈','🥉'];
    list.innerHTML = d.rows.map(function(r, i){
      return '<div class="leaderboard-row">' +
        '<span class="lb-rank">' + (medals[i]||'#'+(i+1)) + '</span>' +
        '<span class="lb-name">' + r.username + '</span>' +
        '<span class="lb-stat">' + r.wins + 'W · ' + r.kos + ' KOs</span>' +
        '<span class="lb-stat" style="margin-left:8px">' + r.best_lpm.toFixed(1) + ' LPM</span>' +
        '</div>';
    }).join('') || '<p style="color:var(--muted);text-align:center;padding:20px;font-size:.75rem">No games yet!</p>';
  });
}

function fmtTime(secs) {
  if (!secs) return '0m';
  var h=Math.floor(secs/3600), m=Math.floor((secs%3600)/60);
  return h>0 ? h+'h '+m+'m' : m+'m';
}

document.querySelectorAll('.tab-btn').forEach(function(btn){
  btn.addEventListener('click', function(){
    document.querySelectorAll('.tab-btn').forEach(function(b){ b.classList.remove('active'); });
    document.querySelectorAll('.tab-content').forEach(function(c){ c.classList.remove('active'); });
    btn.classList.add('active');
    var tc = $('tab-'+btn.dataset.tab);
    if(tc) tc.classList.add('active');
  });
});

on('btn-view-stats', 'click', showStats);
on('btn-close-stats', 'click', function(){ showScreen('landing'); });

// ── Lobby ─────────────────────────────────────────────────────────
function rebuildPlayerList() {
  var ul = $('player-list');
  if(!ul) return;
  ul.innerHTML = '';
  for (var i=0; i<players.length; i++) {
    var p = players[i];
    var row = document.createElement('div');
    row.className = 'player-row' + (p.id===myId?' you':'');
    var dot = document.createElement('span');
    dot.className = 'player-dot' + (p.id===hostId?' host':p.id===myId?' you':'');
    var name = document.createElement('span');
    name.className = 'player-name';
    name.textContent = p.name;
    var badge = document.createElement('span');
    badge.className = 'player-badge';
    if (p.id===myId && p.id===hostId) badge.textContent = 'YOU · HOST';
    else if (p.id===myId)   badge.textContent = 'YOU';
    else if (p.id===hostId) badge.textContent = 'HOST';
    row.append(dot, name, badge);
    ul.appendChild(row);
  }
  var startBtn = $('btn-start');
  var waitMsg  = $('waiting-msg');
  if(startBtn) startBtn.classList.toggle('hidden', !isHost);
  if(waitMsg)  waitMsg.classList.toggle('hidden', isHost);
}

function showRoundSummary(summary, roundWins) {
  var box  = $('round-summary');
  var rows = $('summary-rows');
  if (!box || !rows || !summary) return;
  var entries = Object.values(summary).sort(function(a,b){
    return (b.wins||0) - (a.wins||0);
  });
  rows.innerHTML = entries.map(function(p, i) {
    var crown = i===0 ? '👑' : '  ';
    return '<div class="summary-row">' +
      '<span class="summary-crown">' + crown + '</span>' +
      '<span class="summary-name">' + p.name + '</span>' +
      '<span class="summary-stat">Wins: <span>' + (p.wins||0) + '</span></span>' +
      '<span class="summary-stat">KOs: <span>' + (p.kos||0) + '</span></span>' +
      '<span class="summary-stat">↑ <span>' + (p.linesSent||0) + '</span></span>' +
      '<span class="summary-stat">↓ <span>' + (p.linesReceived||0) + '</span></span>' +
    '</div>';
  }).join('');
  box.style.display = 'block';
}

// ── Socket ────────────────────────────────────────────────────────
socket.on('connect', function(){ myId = socket.id; });

socket.on('room-created', function(d){
  roomCode=d.code; isHost=d.isHost; hostId=d.hostId; players=d.players;
  var lc=$('lobby-code'); if(lc) lc.textContent=d.code;
  var rs=$('round-summary'); if(rs) rs.style.display='none';
  rebuildPlayerList(); showScreen('lobby');
});
socket.on('room-joined', function(d){
  roomCode=d.code; isHost=d.isHost; hostId=d.hostId; players=d.players;
  var lc=$('lobby-code'); if(lc) lc.textContent=d.code;
  var rs=$('round-summary'); if(rs) rs.style.display='none';
  rebuildPlayerList(); showScreen('lobby');
  MusicSystem.play('lobby');
});
socket.on('player-joined', function(d){
  if (!players.find(function(p){ return p.id===d.id; }))
    players.push({id:d.id, name:d.name, alive:true});
  rebuildPlayerList(); toast(d.name+' joined! 👋');
});
socket.on('player-left', function(d){
  players = players.filter(function(p){ return p.id!==d.id; });
  rebuildPlayerList(); toast((d.name||'Player')+' left');
  if(gm && gm.opponents[d.id]) gm.opponents[d.id].alive=false;
});
socket.on('host-changed', function(d){
  hostId=d.id; isHost=d.id===myId; rebuildPlayerList();
  if(isHost) toast('You are now the host ⭐');
});
socket.on('error-msg', function(msg){ setError('landing-err', msg); });
socket.on('game-start', function(d){ players=d.players; myKOs=0; startGame(); });
socket.on('returned-to-lobby', function(d){
  players=d.players;
  if(gm){ gm.stop(); gm=null; }
  hideOverlay();
  var lc=$('lobby-code'); if(lc) lc.textContent=roomCode;
  rebuildPlayerList();
  showRoundSummary(d.summary, d.roundWins);
  showScreen('lobby');
});

// ── Game ──────────────────────────────────────────────────────────
function startGame() {
  showScreen('game'); hideOverlay(); removeBanner();
  var canvas=$('game-canvas');
  canvas.width=window.innerWidth; canvas.height=window.innerHeight;
  if(gm) gm.stop();
  gm = new GameManager(canvas, socket, myId, players);
  // Start game music then ramp speed up over 90 seconds (1.0 → 1.35x)
  MusicSystem.play('game').then ? 
    MusicSystem.play('game').then(function(){ MusicSystem.startSpeedRamp(1.35, 90000); }) :
    (MusicSystem.play('game'), setTimeout(function(){ MusicSystem.startSpeedRamp(1.35, 90000); }, 500));
  gm.start();
}

window.addEventListener('local-dead', function(){
  showBanner('ELIMINATED');
  socket.emit('player-dead', { kos: myKOs });
  if(gm) socket.emit('lines-cleared', { total: gm.engine ? gm.engine.lines : 0 });
});

window.addEventListener('game-over', function(e){
  var d=e.detail;
  var iWon = d.winnerId === d.myId;
  var title=$('ov-title'), sub=$('ov-sub'), rematch=$('btn-rematch');
  if(title){ title.textContent = iWon ? '🏆 WINNER!' : 'GAME OVER'; title.className='overlay-title '+(iWon?'win':'lose'); }
  if(sub)   sub.textContent = iWon ? 'You outlasted everyone!' : (d.winnerName+' wins!');
  if(rematch) rematch.classList.toggle('hidden', !isHost);
  if(iWon) socket.emit('game-won', { kos: myKOs });
  showOverlay();
});

window.addEventListener('player-ko', function(){
  myKOs++;
  if(gm) socket.emit('lines-cleared', { total: gm.engine ? gm.engine.lines : 0 });
});

function showOverlay(){ var o=$('overlay-gameover'); if(o) o.classList.remove('hidden'); }
function hideOverlay(){ var o=$('overlay-gameover'); if(o) o.classList.add('hidden'); }

var _banner=null;
function showBanner(msg){
  removeBanner();
  _banner=document.createElement('div');
  _banner.className='dead-banner'; _banner.textContent=msg;
  document.body.appendChild(_banner);
  setTimeout(removeBanner, 2600);
}
function removeBanner(){ if(_banner){ _banner.remove(); _banner=null; } }

// ── Buttons ───────────────────────────────────────────────────────
on('btn-create','click',function(){
  setError('landing-err','');
  var name=($('inp-name').value.trim()) || currentUser || 'Player';
  MusicSystem.play('lobby');
  socket.emit('create-room', { name:name, username:currentUser });
});
on('btn-join','click',function(){
  setError('landing-err','');
  var name=($('inp-name').value.trim()) || currentUser || 'Player';
  var code=($('inp-code').value.trim()).toUpperCase();
  if(!code) return setError('landing-err','Enter a room code');
  MusicSystem.play('lobby');
  socket.emit('join-room', { code:code, name:name, username:currentUser });
});
on('inp-code','keydown',function(e){ if(e.key==='Enter') $('btn-join').click(); });
on('inp-name','keydown',function(e){ if(e.key==='Enter') $('btn-create').click(); });
on('btn-start','click',function(){ socket.emit('start-game'); });
on('btn-leave','click',function(){
  MusicSystem.stop();
  socket.disconnect(); socket.connect(); players=[]; showScreen('landing');
});
on('btn-rematch','click',function(){ MusicSystem.play('lobby'); socket.emit('return-to-lobby'); });
on('btn-back-lobby','click',function(){ MusicSystem.play('lobby'); socket.emit('return-to-lobby'); });
on('btn-quit','click',function(){
  MusicSystem.stop();
  socket.disconnect(); socket.connect(); players=[];
  if(gm){ gm.stop(); gm=null; }
  hideOverlay(); showScreen('landing');
});
on('lobby-code','click',function(){
  navigator.clipboard.writeText(location.origin+'?join='+roomCode)
    .then(function(){ toast('Invite link copied! 📋'); });
});
on('copy-hint','click',function(){ var lc=$('lobby-code'); if(lc) lc.click(); });

var urlCode=new URLSearchParams(location.search).get('join');
if(urlCode){
  var ci=$('inp-code'); if(ci) ci.value=urlCode.toUpperCase();
  toast('Room code '+urlCode+' ready — enter your name and join!');
}
window.addEventListener('resize',function(){
  var canvas=$('game-canvas');
  if(!canvas||$('game').classList.contains('hidden')) return;
  canvas.width=window.innerWidth; canvas.height=window.innerHeight;
});

// Mute
var muted=false;
on('btn-mute','click',function(){
  muted=!muted;
  SoundSystem.setEnabled(!muted);
  MusicSystem.setEnabled(!muted);
  $('btn-mute').textContent=muted?'🔇 MUTED':'🔊 SOUND';
});
SoundSystem.init();
MusicSystem.unlock();

}); // end window.load
