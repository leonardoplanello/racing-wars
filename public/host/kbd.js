// Teclado do host: navegacao de menu e jogador local (setas/AD + espaco).
export class Keyboard {
  constructor() {
    this.left = false;
    this.right = false;
    this.fireQueued = false;
    this.onNav = null; // (k) => void
    this.onKey = null; // (letra) => void
    addEventListener('keydown', (e) => {
      if (e.target?.matches?.('input, textarea, select')) return; // digitando no painel de debug
      if (e.repeat) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') this.onNav?.(e.key === 'ArrowLeft' ? 'left' : 'right', true);
        return;
      }
      const k = e.key;
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') { this.left = true; this.onNav?.('left'); }
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') { this.right = true; this.onNav?.('right'); }
      else if (k === 'ArrowUp') this.onNav?.('up');
      else if (k === 'ArrowDown') this.onNav?.('down');
      else if (k === 'Enter') this.onNav?.('ok');
      else if (k === 'Escape') this.onNav?.('back');
      else if (k === ' ') { this.fireQueued = true; this.onNav?.('ok'); e.preventDefault(); }
      else if (k.length === 1) this.onKey?.(k.toLowerCase());
    });
    addEventListener('keyup', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') this.left = false;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') this.right = false;
    });
  }
  get rev() { return this.left && this.right; } // as duas setas juntas = re
  get steer() { return this.rev ? 0 : (this.right ? 1 : 0) - (this.left ? 1 : 0); }
  takeFire() { const f = this.fireQueued; this.fireQueued = false; return f; }
}
