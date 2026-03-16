'use strict';
// Input handler with DAS (Delayed Auto Shift) and ARR (Auto Repeat Rate)
// DAS = 133ms  ARR = 10ms  (Tetris Friends defaults)

const DAS = 133;
const ARR = 10;

class InputHandler {
  constructor(handlers) {
    // handlers = { left, right, softDrop, hardDrop, rotCW, rotCCW, hold }
    this.handlers = handlers;
    this._held  = {};   // key -> { startMs, lastMs }
    this._bound = this._onDown.bind(this);
    this._boundU= this._onUp.bind(this);
    this._raf   = null;
    this.enabled = false;
  }

  enable() {
    if (this.enabled) return;
    this.enabled = true;
    window.addEventListener('keydown', this._bound);
    window.addEventListener('keyup',   this._boundU);
    this._loop();
  }

  disable() {
    this.enabled = false;
    window.removeEventListener('keydown', this._bound);
    window.removeEventListener('keyup',   this._boundU);
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
    this._held = {};
  }

  _action(key) {
    switch(key) {
      case 'ArrowLeft':  case 'a': this.handlers.left?.();      break;
      case 'ArrowRight': case 'd': this.handlers.right?.();     break;
      case 'ArrowDown':  case 's': this.handlers.softDrop?.();  break;
      case ' ':                    this.handlers.hardDrop?.();  break;
      case 'ArrowUp':    case 'x': this.handlers.rotCW?.();     break;
      case 'z':          case 'Control': this.handlers.rotCCW?.(); break;
      case 'c':          case 'Shift':   this.handlers.hold?.();    break;
    }
  }

  _onDown(e) {
    if (!this.enabled) return;
    const k = e.key;
    // Prevent browser scrolling
    if (['ArrowLeft','ArrowRight','ArrowDown','ArrowUp',' '].includes(k)) e.preventDefault();
    if (this._held[k]) return; // already held
    this._held[k] = { startMs: performance.now(), lastMs: 0 };
    this._action(k);
  }
  _onUp(e) { delete this._held[e.key]; }

  _loop() {
    if (!this.enabled) return;
    this._raf = requestAnimationFrame(() => {
      const now = performance.now();
      for (const [key, state] of Object.entries(this._held)) {
        // Only DAS keys (not rotation/hold/harddrop)
        if (!['ArrowLeft','ArrowRight','ArrowDown','a','d','s'].includes(key)) continue;
        const elapsed = now - state.startMs;
        if (elapsed < DAS) continue;
        if (now - state.lastMs >= ARR) {
          state.lastMs = now;
          this._action(key);
        }
      }
      this._loop();
    });
  }
}

window.InputHandler = InputHandler;
