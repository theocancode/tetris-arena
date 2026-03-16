'use strict';
class GameManager {
  constructor(canvas, socket, myId, players) {
    this.canvas   = canvas;
    this.ctx      = canvas.getContext('2d');
    this.socket   = socket;
    this.myId     = myId;
    this.players  = players;
    this.engine   = null;
    this.input    = null;
    this._raf     = null;
    this._lastTick    = 0;
    this._lastSync    = 0;
    this._lockTimer   = null;
    this._LOCK_MS     = 500;
    this._LOCK_MAX    = 15;
    this._lastLockMoves = 0;
    this._comboFlashAlpha = 0;
    this._particles   = new Renderer.ParticleSystem();
    this._lastLevel   = 1;
    this._hurryPlayed = false;
    this._finishPosition = 0; // track placement
    this._totalPlayers   = players.length;
    this._eliminated     = 0; // how many others knocked out before me

    this.opponents = {};
    for (const p of players) {
      if (p.id !== myId)
        this.opponents[p.id] = { board: [], name: p.name, alive: p.alive, pending: 0 };
    }
  }

  start() {
    SoundSystem.unlock();

    // Short delay then play "GO!" sound
    setTimeout(() => SoundSystem.play('go'), 300);

    this.engine = new TetrisEngine();

    // ── Patch _lock to hook sounds + particles ──────────────────
    const origLock = this.engine._lock.bind(this.engine);
    this.engine._lock = () => {
      const prevLines = this.engine.lines;
      const prevCombo = this.engine.combo;
      origLock();
      const cleared = this.engine.lines - prevLines;

      if (cleared > 0) {
        // SFX line clear
        SoundSystem.play(`clear${Math.min(cleared, 4)}`);
        // Voice callout (double/triple/tetris)
        setTimeout(() => SoundSystem.playClearVoice(cleared), 80);
        // Combo
        if (this.engine.combo > 1) {
          this._comboFlashAlpha = 0.85;
          SoundSystem.playCombo(this.engine.combo);
        }
        // Particles
        const l = this._layout();
        const rows = [];
        for (let r = 0; r < 20 && rows.length < cleared; r++) rows.push(r);
        this._particles.lineClear(l.boardX, l.boardY, rows);
      } else {
        SoundSystem.play('lock');
      }
    };

    this.engine.onDead = () => this._onDead();
    this.engine.onSendGarbage = (lines) => this.socket.emit('send-garbage', { lines });

    // ── Wrap moves for sounds ────────────────────────────────────
    const origML  = this.engine.moveLeft.bind(this.engine);
    const origMR  = this.engine.moveRight.bind(this.engine);
    const origRot = this.engine.rotate.bind(this.engine);
    const origHld = this.engine.doHold.bind(this.engine);
    const origHD  = this.engine.hardDrop.bind(this.engine);
    const origSD  = this.engine.softDrop.bind(this.engine);

    this.engine.moveLeft  = () => { if (origML())  SoundSystem.play('move'); };
    this.engine.moveRight = () => { if (origMR())  SoundSystem.play('move'); };
    this.engine.rotate    = (d) => { origRot(d);   SoundSystem.play('rotate'); };
    this.engine.doHold    = () => { origHld();     SoundSystem.play('hold'); };
    this.engine.hardDrop  = () => { origHD();      SoundSystem.play('drop'); this._resetLockTimer(); };
    this.engine.softDrop  = () => { const r = origSD(); if (!r) SoundSystem.play('fall'); return r; };

    this.input = new InputHandler({
      left:     () => this.engine.moveLeft(),
      right:    () => this.engine.moveRight(),
      softDrop: () => this.engine.softDrop(),
      hardDrop: () => this.engine.hardDrop(),
      rotCW:    () => this.engine.rotate(1),
      rotCCW:   () => this.engine.rotate(-1),
      hold:     () => this.engine.doHold()
    });
    this.input.enable();

    this._lastTick  = performance.now();
    this._lastLevel = 1;
    this._raf = requestAnimationFrame(t => this._loop(t));

    this.socket.on('board-update',      d => this._onBoardUpdate(d));
    this.socket.on('garbage-incoming',  d => this._onGarbage(d));
    this.socket.on('player-eliminated', d => this._onEliminated(d));
    this.socket.on('game-over',         d => this._onGameOver(d));
  }

  stop() {
    if (this._raf)       { cancelAnimationFrame(this._raf); this._raf = null; }
    if (this.input)      { this.input.disable(); }
    if (this._lockTimer) { clearTimeout(this._lockTimer); this._lockTimer = null; }
    this.socket.off('board-update');
    this.socket.off('garbage-incoming');
    this.socket.off('player-eliminated');
    this.socket.off('game-over');
  }

  _layout() {
    const W = this.canvas.width, H = this.canvas.height;
    const R = window.Renderer;
    const boardW = 10 * R.BLOCK, boardH = 20 * R.BLOCK;
    const leftW  = R.PANEL * 4 + 16;
    const rightW = R.PANEL * 4 + 16;
    const totalW = leftW + boardW + 20 + rightW;
    const ox = (W - totalW) / 2;
    const oy = Math.max(10, (H - boardH) / 2);
    return {
      boardX: ox + leftW + 8,
      boardY: oy,
      holdX:  ox,
      holdY:  oy + 16,
      statsX: ox,
      statsY: oy + 16 + R.PANEL * 3 + 24,
      nextX:  ox + leftW + 8 + boardW + 14,
      nextY:  oy + 16,
      oppX:   ox + leftW + 8 + boardW + 14 + R.PANEL * 4 + 16,
      oppY:   oy,
      W, H
    };
  }

  _loop(ts) {
    if (!this.engine || this.engine.isDead) return;
    const eng   = this.engine;
    const gravMs = GRAVITY[Math.min(eng.level - 1, GRAVITY.length - 1)];

    if (ts - this._lastTick >= gravMs) { this._lastTick = ts; eng.tick(); }

    // Level up sound
    if (eng.level > this._lastLevel) {
      this._lastLevel = eng.level;
      SoundSystem.play('levelup');
      // Hurry up voice at level 8+
      if (eng.level >= 8 && !this._hurryPlayed) {
        this._hurryPlayed = true;
        setTimeout(() => SoundSystem.play('voice_hurryup'), 500);
      }
    }

    // Lock delay
    if (eng.piece && !eng._fits(eng.piece.shape, eng.piece.row + 1, eng.piece.col)) {
      const moved = eng.lockMoves;
      if (moved !== this._lastLockMoves) {
        this._lastLockMoves = moved;
        if (this._lockTimer) clearTimeout(this._lockTimer);
        if (moved < this._LOCK_MAX) {
          this._lockTimer = setTimeout(() => {
            if (this.engine && !this.engine.isDead) this.engine._lock();
          }, this._LOCK_MS);
        } else {
          this.engine._lock();
        }
      } else if (!this._lockTimer) {
        this._lockTimer = setTimeout(() => {
          if (this.engine && !this.engine.isDead) this.engine._lock();
        }, this._LOCK_MS);
      }
    } else {
      if (this._lockTimer) { clearTimeout(this._lockTimer); this._lockTimer = null; }
      this._lastLockMoves = 0;
    }

    // Sync ~100ms
    if (ts - this._lastSync > 100) {
      this._lastSync = ts;
      this.socket.emit('board-update', { board: eng.serialiseBoard() });
    }

    // Decay combo flash
    if (this._comboFlashAlpha > 0)
      this._comboFlashAlpha = Math.max(0, this._comboFlashAlpha - 0.025);

    this._draw();
    this._raf = requestAnimationFrame(t => this._loop(t));
  }

  _resetLockTimer() {
    if (this._lockTimer) { clearTimeout(this._lockTimer); this._lockTimer = null; }
    this._lastLockMoves = this.engine?.lockMoves ?? 0;
  }

  _draw() {
    const ctx = this.ctx;
    const R   = window.Renderer;
    const eng = this.engine;
    const l   = this._layout();

    ctx.clearRect(0, 0, l.W, l.H);

    // Background
    const bg = ctx.createRadialGradient(l.W/2, l.H/2, 0, l.W/2, l.H/2, l.W * 0.7);
    bg.addColorStop(0, '#0d1520');
    bg.addColorStop(1, '#080c14');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, l.W, l.H);

    // Combo flash
    if (this._comboFlashAlpha > 0)
      R.renderComboFlash(ctx, eng.combo, l.W, l.H, this._comboFlashAlpha);

    // Main board + particles
    R.renderMain(ctx, eng, l.boardX, l.boardY, this._particles);

    // Garbage meter
    R.renderGarbageMeter(ctx, eng.pendingGarbage, l.boardX, l.boardY);

    // Hold
    R.renderHold(ctx, eng.hold, eng.holdUsed, l.holdX, l.holdY);

    // Stats
    R.renderStats(ctx, eng.score, eng.lines, eng.level, eng.combo, l.statsX, l.statsY);

    // Next
    R.renderNext(ctx, eng.queue.slice(0, 5), l.nextX, l.nextY);

    // Opponents
    const oppIds = Object.keys(this.opponents);
    const miniH  = 20 * R.MINI + 16 + 8;
    for (let i = 0; i < oppIds.length; i++) {
      const opp = this.opponents[oppIds[i]];
      R.renderMini(ctx, opp.board, opp.name, opp.pending || 0, l.oppX, l.oppY + i * miniH, opp.alive);
    }
  }

  _onBoardUpdate({ id, board }) {
    if (this.opponents[id]) this.opponents[id].board = board;
  }

  _onGarbage({ lines }) {
    if (this.engine && !this.engine.isDead) this.engine.receiveGarbage(lines);
    SoundSystem.play('garbage');
    this.canvas.style.outline = '3px solid #ff1133';
    setTimeout(() => this.canvas.style.outline = 'none', 280);
  }

  _onEliminated({ id }) {
    if (this.opponents[id]) {
      this.opponents[id].alive = false;
      // KO sound if it was caused by us (server sent it after our garbage)
      SoundSystem.play('ko');
      this._eliminated++;
    }
  }

  _onDead() {
    this.stop();
    SoundSystem.play('lose');
    setTimeout(() => SoundSystem.play('voice_lose'), 300);
    this.socket.emit('player-dead');
    window.dispatchEvent(new CustomEvent('local-dead'));
  }

  _onGameOver({ winnerId, winnerName, placement }) {
    this.stop();
    const iWon = winnerId === this.myId;
    if (iWon) {
      SoundSystem.play('win');
      setTimeout(() => SoundSystem.play('voice_win'), 400);
    }
    // Play placement voice if provided
    if (placement) {
      setTimeout(() => SoundSystem.playPlacement(placement), 600);
    }
    window.dispatchEvent(new CustomEvent('game-over', {
      detail: { winnerId, winnerName, myId: this.myId, placement }
    }));
  }
}

window.GameManager = GameManager;
