'use strict';
// ═══════════════════════════════════════════════════════════════════
//  Sound System — Tetris Friends exact filenames
//  Drop files directly into public/sounds/ — no renaming needed.
//  Falls back to Web Audio synth if files aren't present.
// ═══════════════════════════════════════════════════════════════════

const SoundSystem = (() => {
  let ctx = null;
  let masterGain = null;
  let enabled = true;
  const buffers = {};  // name -> AudioBuffer

  // ── Exact TF filenames → internal name ──────────────────────────
  // Lists multiple candidates; first one found wins.
  const FILE_MAP = {
    // ── Gameplay ─────────────────────────────────────────────────
    move:     ['fx_unmve.mp3'],
    rotate:   ['fx_rta01.mp3'],
    drop:     ['fx_hrddp.mp3'],
    lock:     ['fx_lck01.mp3'],
    fall:     ['fx_fall.mp3'],       // soft-drop landing sound
    hold:     ['fx_hold.mp3'],
    unhold:   ['fx_unhld.mp3'],

    // ── Line clears ───────────────────────────────────────────────
    clear1:   ['fx_lne01.mp3'],
    clear2:   ['fx_lne02.mp3'],
    clear3:   ['fx_lne03.mp3'],
    clear4:   ['fx_lne04.mp3'],      // Tetris SFX

    // ── Voice callouts ────────────────────────────────────────────
    voice_tetris:  ['vo_tetrs.mp3'],         // "TETRIS!" voice
    voice_double:  ['vo_lne02.mp3'],         // "DOUBLE!" voice
    voice_triple:  ['vo_lne03.mp3'],         // "TRIPLE!" voice
    voice_tspin1:  ['vo_tspinsingle.mp3'],
    voice_tspin2:  ['vo_tspindouble.mp3'],
    voice_tspin3:  ['vo_tspintriple.mp3'],
    voice_b2b:     ['vo_b2btetrs.mp3'],       // Back-to-back
    voice_hurryup: ['vo_hurryup.mp3'],       // Hurry up!
    voice_win:     ['vo_uwin.mp3'],
    voice_lose:    ['vo_ulose.mp3'],

    // ── Placement announcements ───────────────────────────────────
    place_1st: ['vo_firstplace.mp3'],
    place_2nd: ['vo_secondplace.mp3'],
    place_3rd: ['vo_thirdplace.mp3'],
    place_4th: ['vo_fourthplace.mp3'],
    place_5th: ['vo_fifthplace.mp3'],
    place_6th: ['vo_sixthplace.mp3'],

    // ── Combos ────────────────────────────────────────────────────
    combo1:   ['fx_combo01.mp3'],
    combo2:   ['fx_combo02.mp3'],
    combo3:   ['fx_combo03.mp3'],
    combo4:   ['fx_combo04.mp3'],
    combo5:   ['fx_combo05.mp3'],
    combo6:   ['fx_combo06.mp3'],
    combo7:   ['fx_combo07.mp3'],

    // ── T-Spins ───────────────────────────────────────────────────
    tspin:    ['fx_tspin.mp3'],
twist:    ['fx_twist.mp3'],      // T-spin twist sound (different from rotate)

    // ── Garbage / attacks ─────────────────────────────────────────
    garbage:  ['fx_ko_receive.mp3'],   // incoming garbage
    ko:       ['fx_ko.mp3'],           // you KO'd someone

    // ── Level ─────────────────────────────────────────────────────
    levelup:    ['fx_levelup.mp3'],
    leveldown:  ['fx_leveldown.mp3'],
    bonuslevel: ['fx_bonuslevel.mp3'],

    // ── Match flow ────────────────────────────────────────────────
    go:       ['fx_go.mp3'],           // game start
    endmatch: ['fx_endmatch.mp3'],
    win:      ['fx_win.mp3'],
    lose:     ['fx_lose.mp3'],
    happy:    ['vo_happy.mp3'],
    sad:      ['vo_sad.mp3'],

    // ── Countdown ticks ───────────────────────────────────────────
    tick1:  ['fx_01tic.mp3'],
    tick2:  ['fx_02tic.mp3'],
    tick3:  ['fx_03tic.mp3'],
    tick4:  ['fx_04tic.mp3'],
    tick5:  ['fx_05tic.mp3'],
    tick:   ['fx_tick.mp3'],
    tick_2: ['fx_tick2.mp3'],
    tick_3: ['fx_tick3.mp3'],

    // ── Highscore ─────────────────────────────────────────────────
    highscore: ['fx_highscore.mp3'],
  };

  function getCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.6;
      masterGain.connect(ctx.destination);
    }
    return ctx;
  }

  async function tryLoadFile(name, filenames) {
    for (const fname of filenames) {
      try {
        const head = await fetch(`/sounds/${fname}`, { method: 'HEAD' });
        if (!head.ok) continue;
        const res  = await fetch(`/sounds/${fname}`);
        const ab   = await res.arrayBuffer();
        const buf  = await getCtx().decodeAudioData(ab);
        buffers[name] = buf;
        console.log(`[SFX] ✓ ${fname} → ${name}`);
        return;
      } catch {}
    }
  }

  async function init() {
    getCtx();
    await Promise.all(Object.entries(FILE_MAP).map(([n, f]) => tryLoadFile(n, f)));
    console.log(`[SFX] Loaded ${Object.keys(buffers).length}/${Object.keys(FILE_MAP).length} sounds`);
  }

  function playBuffer(buf, vol = 1, rate = 1, delay = 0) {
    if (!ctx || !enabled) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(g);
    g.connect(masterGain);
    src.start(ctx.currentTime + delay);
  }

  // ── Synth fallbacks ──────────────────────────────────────────────
  function beep(freq, dur, type='square', vol=0.15, decay=true) {
    if (!ctx || !enabled) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, ctx.currentTime);
    if (decay) g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g); g.connect(masterGain);
    o.start(); o.stop(ctx.currentTime + dur);
  }
  function noise(dur, vol=0.12) {
    if (!ctx || !enabled) return;
    const n = ctx.sampleRate*dur, buf=ctx.createBuffer(1,n,ctx.sampleRate);
    const d=buf.getChannelData(0); for(let i=0;i<n;i++) d[i]=Math.random()*2-1;
    const src=ctx.createBufferSource(), g=ctx.createGain();
    src.buffer=buf; g.gain.setValueAtTime(vol,ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+dur);
    src.connect(g); g.connect(masterGain); src.start(); src.stop(ctx.currentTime+dur);
  }

  const SYNTH = {
    move:    () => beep(220, 0.04, 'square', 0.06),
    rotate:  () => beep(330, 0.05, 'square', 0.07),
    drop:    () => { beep(110, 0.06, 'sawtooth', 0.12); noise(0.05, 0.08); },
    lock:    () => beep(160, 0.08, 'square', 0.10),
    hold:    () => beep(440, 0.08, 'sine', 0.10),
    clear1:  () => beep(523, 0.12, 'sine', 0.18),
    clear2:  () => { beep(523,0.08,'sine',0.16); beep(659,0.12,'sine',0.18,false); },
    clear3:  () => [523,659,784].forEach((f,i)=>beep(f,0.10,'sine',0.16,i===2)),
    clear4:  () => [523,659,784,1047].forEach((f,i)=>setTimeout(()=>beep(f,0.14,'sine',0.22),i*55)),
    garbage: () => { beep(90,0.18,'sawtooth',0.20); noise(0.10,0.10); },
    levelup: () => [523,659,784,1047,1318].forEach((f,i)=>setTimeout(()=>beep(f,0.12,'sine',0.20),i*60)),
    lose:    () => [440,330,220,110].forEach((f,i)=>setTimeout(()=>beep(f,0.18,'sawtooth',0.22),i*80)),
    win:     () => [523,659,784,1047,1318,1568].forEach((f,i)=>setTimeout(()=>beep(f,0.18,'sine',0.22),i*70)),
    go:      () => [440,880].forEach((f,i)=>setTimeout(()=>beep(f,0.14,'sine',0.20),i*120)),
    tspin:   () => beep(800,0.10,'sine',0.15),
    ko:      () => { beep(200,0.10,'sawtooth',0.18); setTimeout(()=>beep(400,0.12,'sine',0.15),100); },
    tick:    () => beep(1000,0.03,'sine',0.08),
    combo1: ()=>beep(600,0.07,'sine',0.12), combo2: ()=>beep(660,0.07,'sine',0.12),
    combo3: ()=>beep(720,0.07,'sine',0.12), combo4: ()=>beep(780,0.07,'sine',0.12),
    combo5: ()=>beep(840,0.07,'sine',0.12), combo6: ()=>beep(900,0.07,'sine',0.12),
    combo7: ()=>beep(960,0.07,'sine',0.14),
  };

  // ── Public API ───────────────────────────────────────────────────
  function play(name, opts = {}) {
    if (!enabled) return;
    try {
      if (ctx?.state === 'suspended') ctx.resume();
      if (buffers[name]) playBuffer(buffers[name], opts.vol ?? 1, opts.rate ?? 1, opts.delay ?? 0);
      else if (SYNTH[name]) SYNTH[name]();
    } catch {}
  }

  // Play combo sound by combo count (1-7, clamps)
  function playCombo(count) {
    // Combos 2-7 use escalating sounds
    // In TF, combos sound like quick ascending tones
    const n = Math.min(count, 7);
    play('combo' + n, { vol: 0.7 });
  }

  // Play voice for line count (1-4) at higher volume to cut through SFX
  function playClearVoice(lines) {
    if (lines === 4)      play('voice_tetris', { vol: 1.2 });
    else if (lines === 3) play('voice_triple', { vol: 1.1 });
    else if (lines === 2) play('voice_double', { vol: 1.1 });
    // no voice for singles
  }

  // Play placement vo_ (1-6)
  function playPlacement(pos) {
    const map = {1:'place_1st',2:'place_2nd',3:'place_3rd',4:'place_4th',5:'place_5th',6:'place_6th'};
    if (map[pos]) play(map[pos]);
    if (pos === 1) setTimeout(() => play('voice_win'), 400);
    else           setTimeout(() => play('voice_lose'), 400);
  }

  function setEnabled(v) { enabled = v; }
  function setVolume(v)  { if (masterGain) masterGain.gain.value = Math.max(0, Math.min(1, v)); }
  function unlock()      { getCtx(); if (ctx.state === 'suspended') ctx.resume(); }
  function isLoaded(n)   { return !!buffers[n]; }

  return { init, play, playCombo, playClearVoice, playPlacement, setEnabled, setVolume, unlock, isLoaded };
})();

window.SoundSystem = SoundSystem;

// ═══════════════════════════════════════════════════════════════════
//  Music System — separate from SFX, handles looping + speed ramp
// ═══════════════════════════════════════════════════════════════════
const MusicSystem = (() => {
  let ctx = null;
  let source = null;
  let gainNode = null;
  let buffer = null;
  let currentTrack = null;
  let startTime = 0;
  let pauseOffset = 0;
  let isPlaying = false;
  let enabled = true;
  let volume = 0.45;
  let _rampInterval = null;

  const TRACKS = {
    lobby: '/sounds/music_lobby.mp3',
    game:  '/sounds/music_game.mp3'
  };

  function getCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      gainNode = ctx.createGain();
      gainNode.gain.value = volume;
      gainNode.connect(ctx.destination);
    }
    return ctx;
  }

  async function loadTrack(name) {
    if (currentTrack === name && buffer) return buffer;
    const c = getCtx();
    const res = await fetch(TRACKS[name]);
    const ab  = await res.arrayBuffer();
    buffer = await c.decodeAudioData(ab);
    currentTrack = name;
    return buffer;
  }

  async function play(name, rate) {
    if (!enabled) return;
    rate = rate || 1.0;
    stop();
    try {
      const c = getCtx();
      if (c.state === 'suspended') await c.resume();
      const buf = await loadTrack(name);
      source = c.createBufferSource();
      source.buffer = buf;
      source.loop = true;
      source.playbackRate.value = rate;
      source.connect(gainNode);
      source.start(0, pauseOffset);
      startTime = c.currentTime - pauseOffset;
      pauseOffset = 0;
      isPlaying = true;
    } catch(e) { console.warn('Music error:', e); }
  }

  function stop() {
    stopRamp();
    if (source) {
      try {
        pauseOffset = ctx ? (ctx.currentTime - startTime) % (buffer ? buffer.duration : 1) : 0;
        source.stop();
      } catch(e) {}
      source = null;
    }
    isPlaying = false;
    pauseOffset = 0; // always restart from beginning on stop
  }

  // Gradually ramp playback speed from 1.0 to maxRate over durationMs
  function startSpeedRamp(maxRate, durationMs) {
    stopRamp();
    if (!source) return;
    const startRate = 1.0;
    const startMs   = Date.now();
    _rampInterval = setInterval(function() {
      if (!source) { stopRamp(); return; }
      const elapsed = Date.now() - startMs;
      const t = Math.min(elapsed / durationMs, 1);
      // Ease in — slow at first, faster near end
      const rate = startRate + (maxRate - startRate) * (t * t);
      source.playbackRate.value = rate;
      if (t >= 1) stopRamp();
    }, 250);
  }

  function stopRamp() {
    if (_rampInterval) { clearInterval(_rampInterval); _rampInterval = null; }
  }

  function setEnabled(v) {
    enabled = v;
    if (!v) stop();
    else if (gainNode) gainNode.gain.value = volume;
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (gainNode) gainNode.gain.value = volume;
  }

  function unlock() { getCtx(); if (ctx.state === 'suspended') ctx.resume(); }

  return { play, stop, startSpeedRamp, setEnabled, setVolume, unlock, isPlaying: () => isPlaying };
})();

window.MusicSystem = MusicSystem;
