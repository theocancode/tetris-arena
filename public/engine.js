'use strict';

const COLS = 10, ROWS = 20;
const TYPES = ['I','O','T','S','Z','J','L'];
const NEXT_COUNT = 5;

const COLORS = {
  I:'#00d4ff', O:'#ffd700', T:'#bf00ff', S:'#00e855',
  Z:'#ff1a3a', J:'#1a4fff', L:'#ff8c00',
  GHOST:'rgba(200,220,255,0.12)', GARBAGE:'#2a3a4a'
};

const SHAPES = {
  I:[[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
  O:[[0,0,0,0],[0,1,1,0],[0,1,1,0],[0,0,0,0]],
  T:[[0,1,0],[1,1,1],[0,0,0]],
  S:[[0,1,1],[1,1,0],[0,0,0]],
  Z:[[1,1,0],[0,1,1],[0,0,0]],
  J:[[1,0,0],[1,1,1],[0,0,0]],
  L:[[0,0,1],[1,1,1],[0,0,0]]
};

// SRS kick data [col_offset, row_offset]
const KICKS_JLSTZ = [
  [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
  [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
  [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  [[0,0],[1,0],[1,-1],[0,2],[1,2]]
];
const KICKS_I = [
  [[0,0],[-2,0],[1,0],[-2,1],[1,-2]],
  [[0,0],[2,0],[-1,0],[2,-1],[-1,2]],
  [[0,0],[-1,0],[2,0],[-1,-2],[2,1]],
  [[0,0],[1,0],[-2,0],[1,2],[-2,-1]],
  [[0,0],[2,0],[-1,0],[2,-1],[-1,2]],
  [[0,0],[-2,0],[1,0],[-2,1],[1,-2]],
  [[0,0],[1,0],[-2,0],[1,2],[-2,-1]],
  [[0,0],[-1,0],[2,0],[-1,-2],[2,1]]
];
const KICK_IDX = {'01':0,'10':1,'12':2,'21':3,'23':4,'32':5,'30':6,'03':7};

// Line-clear -> garbage lines sent (Tetris Friends style)
const GARBAGE_TABLE = { 1:0, 2:1, 3:2, 4:4 };

function shuffle(a) {
  for (let i = a.length-1; i > 0; i--) {
    const j = 0|Math.random()*(i+1);
    [a[i],a[j]] = [a[j],a[i]];
  }
  return a;
}
function rotateCW(m) {
  const R=m.length, C=m[0].length;
  return Array.from({length:C},(_,r)=>Array.from({length:R},(_,c)=>m[R-1-c][r]));
}

class TetrisEngine {
  constructor() {
    this.board     = Array.from({length:ROWS}, ()=>Array(COLS).fill(null));
    this.queue     = [];
    this._fillQ();
    this.piece     = null;
    this.hold      = null;
    this.holdUsed  = false;
    this.score     = 0;
    this.lines     = 0;
    this.level     = 1;
    this.combo     = 0;
    this.pendingGarbage = 0;
    this.isDead    = false;
    this.lockMoves = 0;
    // Callbacks assigned by GameManager
    this.onDead        = null;
    this.onSendGarbage = null;
    this._spawn();
  }

  _fillQ() {
    while (this.queue.length < NEXT_COUNT + 2)
      this.queue.push(...shuffle([...TYPES]));
  }
  _deq() {
    const t = this.queue.shift();
    this._fillQ();
    return t;
  }
  _mkPiece(type) {
    const shape = SHAPES[type].map(r=>[...r]);
    const col   = type === 'O' ? 3 : type === 'I' ? 3 : 3;
    return { type, shape, row: -1, col, rot: 0 };
  }

  _spawn() {
    this.holdUsed = false;
    const p = this._mkPiece(this._deq());
    // Spawn just above visible board
    p.row = p.type === 'I' ? -2 : -1;
    // Centre col
    p.col = Math.floor((COLS - p.shape[0].length) / 2);
    if (!this._fits(p.shape, p.row, p.col)) {
      this.isDead = true;
      if (this.onDead) this.onDead();
      return;
    }
    this.piece = p;
    this.lockMoves = 0;
  }

  _fits(shape, row, col) {
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const nr = row + r, nc = col + c;
        if (nr >= ROWS || nc < 0 || nc >= COLS) return false;
        if (nr >= 0 && this.board[nr][nc]) return false;
      }
    }
    return true;
  }

  ghostRow() {
    if (!this.piece) return 0;
    let g = this.piece.row;
    while (this._fits(this.piece.shape, g+1, this.piece.col)) g++;
    return g;
  }

  moveLeft()  { if (this._fits(this.piece.shape, this.piece.row, this.piece.col-1)) { this.piece.col--; this._resetLock(); return true; } return false; }
  moveRight() { if (this._fits(this.piece.shape, this.piece.row, this.piece.col+1)) { this.piece.col++; this._resetLock(); return true; } return false; }
  softDrop()  {
    if (this._fits(this.piece.shape, this.piece.row+1, this.piece.col)) {
      this.piece.row++;
      this.score++;
      return true;
    }
    return false;
  }
  hardDrop() {
    let dropped = 0;
    while (this._fits(this.piece.shape, this.piece.row+1, this.piece.col)) {
      this.piece.row++;
      dropped++;
    }
    this.score += dropped * 2;
    this._lock();
  }

  rotate(dir) {
    const p = this.piece;
    let newShape = p.shape.map(r=>[...r]);
    const times = dir === 1 ? 1 : 3;
    for (let i = 0; i < times; i++) newShape = rotateCW(newShape);
    const newRot = ((p.rot + dir) + 4) % 4;
    const kicks  = p.type === 'I' ? KICKS_I : KICKS_JLSTZ;
    const idx    = KICK_IDX[`${p.rot}${newRot}`];
    if (idx === undefined) return;
    for (const [dc, dr] of kicks[idx]) {
      if (this._fits(newShape, p.row+dr, p.col+dc)) {
        p.shape = newShape;
        p.rot   = newRot;
        p.col  += dc;
        p.row  += dr;
        this._resetLock();
        return;
      }
    }
  }

  _resetLock() {
    this.lockMoves++;
  }

  // Called each gravity tick
  tick() {
    if (this.isDead || !this.piece) return;
    if (!this.softDrop()) {
      this._lock();
    }
  }

  _lock() {
    const p = this.piece;
    // Place on board
    for (let r = 0; r < p.shape.length; r++)
      for (let c = 0; c < p.shape[r].length; c++)
        if (p.shape[r][c] && p.row+r >= 0)
          this.board[p.row+r][p.col+c] = p.type;

    const cleared = this._clearLines();

    // Handle combo
    if (cleared > 0) {
      this.combo++;
      // garbage sent
      const g = (GARBAGE_TABLE[cleared] || 0) + (this.combo > 1 ? this.combo - 1 : 0);
      if (g > 0 && this.onSendGarbage) this.onSendGarbage(g);
    } else {
      this.combo = 0;
    }

    // Push pending garbage
    if (this.pendingGarbage > 0 && cleared === 0) {
      this._addGarbage(this.pendingGarbage);
      this.pendingGarbage = 0;
    } else if (cleared > 0 && this.pendingGarbage > 0) {
      // Clears cancel garbage
      this.pendingGarbage = Math.max(0, this.pendingGarbage - cleared);
    }

    this.piece = null;
    this._spawn();
  }

  _clearLines() {
    const full = [];
    for (let r = 0; r < ROWS; r++)
      if (this.board[r].every(c => c !== null)) full.push(r);
    for (const r of full) {
      this.board.splice(r, 1);
      this.board.unshift(Array(COLS).fill(null));
    }
    if (full.length) {
      const pts = [0, 100, 300, 500, 800];
      this.score += (pts[full.length] || 0) * this.level;
      this.lines += full.length;
      this.level  = Math.min(15, 1 + Math.floor(this.lines / 10));
    }
    return full.length;
  }

  _addGarbage(lines) {
    const gapCol = 0|Math.random()*COLS;
    for (let i = 0; i < lines; i++) {
      this.board.shift();
      const row = Array(COLS).fill('GARBAGE');
      row[gapCol] = null;
      this.board.push(row);
    }
    // Push piece up if overlapping
    if (this.piece) {
      while (!this._fits(this.piece.shape, this.piece.row, this.piece.col))
        this.piece.row--;
    }
  }

  receiveGarbage(lines) {
    this.pendingGarbage += lines;
  }

  doHold() {
    if (this.holdUsed || !this.piece) return;
    this.holdUsed = true;
    const type = this.piece.type;
    if (this.hold) {
      this.piece = this._mkPiece(this.hold);
      this.piece.col = Math.floor((COLS - this.piece.shape[0].length) / 2);
    } else {
      this.piece = null;
      this._spawn();
    }
    this.hold = type;
  }

  // Serialise board for network (colour strings or null)
  serialiseBoard() {
    return this.board.map(row => row.map(c => c ? COLORS[c] || '#555' : null));
  }

  // Add ghost to serialised board for rendering
  serialiseBoardWithPiece() {
    const out = this.board.map(row => [...row]);
    const p = this.piece;
    if (!p) return out;
    const gr = this.ghostRow();
    // ghost
    for (let r=0;r<p.shape.length;r++)
      for (let c=0;c<p.shape[r].length;c++)
        if (p.shape[r][c] && gr+r>=0 && gr+r<ROWS)
          if (!out[gr+r][p.col+c])
            out[gr+r][p.col+c] = 'GHOST';
    // piece
    for (let r=0;r<p.shape.length;r++)
      for (let c=0;c<p.shape[r].length;c++)
        if (p.shape[r][c] && p.row+r>=0 && p.row+r<ROWS)
          out[p.row+r][p.col+c] = p.type;
    return out;
  }
}

// Gravity intervals per level (ms)
const GRAVITY = [1000,833,695,578,482,402,335,279,233,194,162,135,113,94,78];

// Expose for browser modules
if (typeof window !== 'undefined') {
  window.TetrisEngine = TetrisEngine;
  window.SHAPES  = SHAPES;
  window.COLORS  = COLORS;
  window.GRAVITY = GRAVITY;
  window.COLS    = COLS;
  window.ROWS    = ROWS;
  window.NEXT_COUNT = NEXT_COUNT;
}
