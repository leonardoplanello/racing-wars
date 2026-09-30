// Audio procedural (WebAudio): motor, pneus, efeitos e um riff de rock em loop. Sem arquivos.
export class GameAudio {
  constructor() {
    this.ctx = null;
    this.musicOn = false;
    this.step = 0;
    this.nextT = 0;
  }

  init() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 0.7; this.sfx.connect(this.master);
    this.music = ctx.createGain(); this.music.gain.value = 0.16; this.music.connect(this.master);
    // ruido branco reutilizavel
    const len = ctx.sampleRate * 1.5;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // motor
    this.eng = ctx.createOscillator(); this.eng.type = 'sawtooth';
    this.eng2 = ctx.createOscillator(); this.eng2.type = 'square';
    this.engF = ctx.createBiquadFilter(); this.engF.type = 'lowpass'; this.engF.frequency.value = 500;
    this.engG = ctx.createGain(); this.engG.gain.value = 0;
    this.eng.connect(this.engF); this.eng2.connect(this.engF); this.engF.connect(this.engG); this.engG.connect(this.sfx);
    this.eng.start(); this.eng2.start();
    // guincho de pneu
    this.sq = ctx.createBufferSource(); this.sq.buffer = this.noiseBuf; this.sq.loop = true;
    this.sqF = ctx.createBiquadFilter(); this.sqF.type = 'bandpass'; this.sqF.frequency.value = 2400; this.sqF.Q.value = 6;
    this.sqG = ctx.createGain(); this.sqG.gain.value = 0;
    this.sq.connect(this.sqF); this.sqF.connect(this.sqG); this.sqG.connect(this.sfx);
    this.sq.start();
    // distorcao para a guitarra
    this.dist = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 512) - 1; curve[i] = Math.tanh(x * 6); }
    this.dist.curve = curve;
    this.gtrF = ctx.createBiquadFilter(); this.gtrF.type = 'lowpass'; this.gtrF.frequency.value = 2600;
    this.dist.connect(this.gtrF); this.gtrF.connect(this.music);
    this.timer = setInterval(() => this.tick(), 25);
  }

  setEngine(speed, active) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 55 + speed * 3.2;
    this.eng.frequency.setTargetAtTime(f, t, 0.08);
    this.eng2.frequency.setTargetAtTime(f * 0.5, t, 0.08);
    this.engF.frequency.setTargetAtTime(300 + speed * 22, t, 0.1);
    this.engG.gain.setTargetAtTime(active ? 0.1 : 0, t, 0.15);
  }
  setSqueal(v) {
    if (!this.ctx) return;
    this.sqG.gain.setTargetAtTime(Math.min(0.09, v * 0.09), this.ctx.currentTime, 0.05);
  }
  setMusic(on) { this.musicOn = on; }

  // ---------- musica ----------
  tick() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    if (!this.musicOn) { this.nextT = ctx.currentTime + 0.1; return; }
    const spb = 60 / 158 / 2; // colcheia
    while (this.nextT < ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextT, spb);
      this.step = (this.step + 1) % 64;
      this.nextT += spb;
    }
  }
  playStep(step, t, spb) {
    const bar = Math.floor(step / 8) % 8, i = step % 8;
    const roots = [82.41, 82.41, 98.0, 82.41, 110.0, 98.0, 82.41, 123.47];
    const root = roots[bar];
    // riff: palm mute nas colcheias, acentos nas notas 0,3,6
    const accent = i === 0 || i === 3 || i === 6;
    const f = root * (i === 5 ? 1.5 : i === 7 && bar % 2 ? 1.335 : 1);
    this.guitar(f * 2, t, spb * (accent ? 1.6 : 0.7), accent ? 0.9 : 0.55);
    if (accent) this.guitar(f * 3, t, spb * 1.6, 0.5); // quinta
    // bateria
    if (i === 0 || i === 4) this.kick(t);
    if (i === 2 || i === 6) this.snare(t);
    this.hat(t, i % 2 ? 0.4 : 0.8);
  }
  guitar(f, t, dur, vol) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = f * 1.006;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol * 0.5, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); o2.connect(g); g.connect(this.dist);
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }
  kick(t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(1, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g); g.connect(this.music); o.start(t); o.stop(t + 0.25);
  }
  snare(t) { this.noise(t, 0.14, 1800, 5000, 0.7, 'highpass'); }
  hat(t, v) { this.noise(t, 0.04, 7000, 7000, 0.22 * v, 'highpass', this.music); }

  // ---------- efeitos ----------
  noise(t, dur, f0, f1, vol, type = 'lowpass', dest = this.sfx) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(dest);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  tone(f0, f1, dur, type = 'sine', vol = 0.4, delay = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + dur + 0.05);
  }
  play(name, arg) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'count': this.tone(440, 440, 0.18, 'square', 0.25); break;
      case 'go': this.tone(880, 880, 0.5, 'square', 0.3); break;
      case 'pickup': [660, 880, 1320].forEach((f, i) => this.tone(f, f, 0.09, 'triangle', 0.3, i * 0.06)); break;
      case 'nitro': this.tone(200, 900, 0.6, 'sawtooth', 0.25); this.noise(t, 0.6, 1200, 4000, 0.3, 'bandpass'); break;
      case 'mine': this.tone(140, 70, 0.15, 'square', 0.35); break;
      case 'missile': this.noise(t, 0.5, 3000, 600, 0.45, 'bandpass'); this.tone(500, 220, 0.4, 'sawtooth', 0.15); break;
      case 'whomp': this.tone(180, 30, 0.7, 'sine', 0.8); this.noise(t, 0.5, 900, 80, 0.5); break;
      case 'explode': this.noise(t, arg > 1 ? 1.0 : 0.7, 2200, 60, 0.9); this.tone(110, 30, 0.6, 'sine', 0.8); break;
      case 'wall': this.noise(t, 0.12, 2500, 300, 0.25 + 0.4 * (arg || 0)); break;
      case 'bump': this.noise(t, 0.1, 1200, 200, 0.2 + 0.3 * (arg || 0)); this.tone(120, 60, 0.1, 'square', 0.2); break;
      case 'alarm': this.tone(1500, 1500, 0.07, 'square', 0.3); this.tone(1500, 1500, 0.07, 'square', 0.3, 0.12); break;
      case 'fall': this.tone(700, 70, 0.9, 'sine', 0.3); this.noise(t + 0.8, 0.4, 1800, 200, 0.4); break;
      case 'cut': this.tone(400, 60, 0.4, 'sawtooth', 0.3); this.noise(t, 0.5, 2500, 100, 0.6); break;
      case 'win': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.22, 'square', 0.22, i * 0.11)); break;
      case 'lose': [400, 330, 262].forEach((f, i) => this.tone(f, f * 0.98, 0.25, 'sawtooth', 0.2, i * 0.13)); break;
      case 'fanfare': [523, 659, 784, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, f, 0.3, 'square', 0.22, i * 0.14)); break;
      case 'menu': this.tone(700, 900, 0.06, 'triangle', 0.25); break;
      case 'join': this.tone(500, 900, 0.14, 'triangle', 0.3); break;
    }
  }
}
