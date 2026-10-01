// Modo debug global do host. F3 (ou ?debug) abre o painel em qualquer fase.
// Corrida infinita, sem corte, carros humanos imortais, freecam, itens, slow-mo e hitboxes.
// So mexe em flags do host/render: com tudo desligado a simulacao e a normal.
import * as THREE from 'three';
import { ITEMS } from '/shared/protocol.js';

const SPEEDS = [1, 0.5, 0.25, 2];

export class DebugTools {
  constructor(sc, { onToggle } = {}) {
    this.sc = sc;
    this.on = false;
    this.infinite = true;
    this.noCut = false;
    this.god = false;
    this.free = false;
    this.hitboxes = false;
    this.speedIdx = 0;
    this.frozen = false; // simulacao congelada (a camera livre e o render continuam)
    this.stepFrames = 0; // quadros a avancar com o freeze ligado
    this.selecting = false; // modo de selecao de area (o editor liga)
    this.onToggle = onToggle;
    this.keys = new Set();
    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = -0.9;
    this.drag = false;
    this.el = document.getElementById('debug');
    this.lines = [];
    this.group = new THREE.Group();
    this.group.visible = false;
    sc.scene.add(this.group);
    this.pending = []; // acoes do teclado a aplicar no proximo tick: {type, ...}

    addEventListener('keydown', (e) => {
      if (e.key === 'F3') { e.preventDefault(); this.toggle(); return; }
      if (!this.on) return;
      if (e.target?.matches?.('input, textarea, select')) return; // digitando no painel do editor
      this.keys.add(e.key.toLowerCase());
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === 'f') this.setFree(!this.free);
      else if (k === 'n') this.noCut = !this.noCut;
      else if (k === 'g') this.god = !this.god;
      else if (k === 'm') this.infinite = !this.infinite;
      else if (k === 'h') { this.hitboxes = !this.hitboxes; this.group.visible = this.hitboxes; }
      else if (k === 't') this.speedIdx = (this.speedIdx + 1) % SPEEDS.length;
      else if (k === 'v') this.frozen = !this.frozen;
      else if (k === '.') this.stepFrames = Math.min(60, this.stepFrames + 1); // um quadro com a simulacao congelada
      else if (k === 'e') this.onSelectMode?.();
      else if (k === 'f4') this.onEditor?.();
      else if (k === 'r') this.pending.push({ type: 'respawn' });
      else if (k === 'x') this.pending.push({ type: 'killbots' });
      else if (k >= '1' && k <= '5') this.pending.push({ type: 'item', item: ITEMS[Number(k) - 1] });
    });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    sc.renderer.domElement.addEventListener('pointerdown', (e) => { if (this.on && this.free && !this.selecting) { this.drag = true; e.target.setPointerCapture?.(e.pointerId); } });
    addEventListener('pointerup', () => { this.drag = false; });
    addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      this.yaw += e.movementX * 0.005;
      this.pitch = Math.max(-1.55, Math.min(1.2, this.pitch - e.movementY * 0.005));
    });
    if (new URLSearchParams(location.search).has('debug')) this.toggle(true);
  }

  toggle(force) {
    this.on = force ?? !this.on;
    if (!this.on) { this.setFree(false); this.group.visible = false; }
    else this.group.visible = this.hitboxes;
    this.el.hidden = !this.on;
    this.onToggle?.(this.on);
  }

  setFree(v) {
    if (v === this.free) return;
    this.free = v;
    if (v) {
      const c = this.sc.camera;
      this.pos.copy(c.position);
      const d = new THREE.Vector3();
      c.getWorldDirection(d);
      this.yaw = Math.atan2(d.z, d.x);
      this.pitch = Math.asin(d.y);
    }
  }

  get timeScale() { return this.on ? (this.frozen ? 0 : SPEEDS[this.speedIdx]) : 1; }
  /** Quadros de 1/60 s a avancar agora (freeze + passo); consome o pedido. */
  takeStep() { if (!(this.on && this.frozen) || !this.stepFrames) return 0; const n = this.stepFrames; this.stepFrames = 0; return n; }
  /** Flags para a simulacao (tudo desligado quando o painel esta fechado). */
  get flags() { return { infinite: this.on && this.infinite, noCut: this.on && (this.noCut || this.free) }; }

  /** Chamar depois de sc.frame(): se a freecam esta ativa, assume a camera Three. */
  applyCamera(dt) {
    if (!(this.on && this.free)) return;
    const k = this.keys, sp = (k.has('shift') ? 90 : 30) * dt;
    const fx = Math.cos(this.yaw) * Math.cos(this.pitch), fy = Math.sin(this.pitch), fz = Math.sin(this.yaw) * Math.cos(this.pitch);
    const rx = -Math.sin(this.yaw), rz = Math.cos(this.yaw);
    const mv = (k.has('i') ? 1 : 0) - (k.has('k') ? 1 : 0), st = (k.has('l') ? 1 : 0) - (k.has('j') ? 1 : 0), up = (k.has('o') ? 1 : 0) - (k.has('u') ? 1 : 0);
    this.pos.x += (fx * mv + rx * st) * sp;
    this.pos.y += (fy * mv + up) * sp;
    this.pos.z += (fz * mv + rz * st) * sp;
    const c = this.sc.camera;
    c.position.copy(this.pos);
    c.lookAt(this.pos.x + fx, this.pos.y + fy, this.pos.z + fz);
    c.updateMatrixWorld();
  }

  takeActions() { const a = this.pending; this.pending = []; return a; }

  /** Desenha o casco de colisao dos carros (6 circulos que cobrem corpo e rodas) e os circulos dos pneus soltos. */
  updateHitboxes(game, hull, R) {
    if (!(this.on && this.hitboxes && game)) return;
    const circle = (r, color) => {
      const pts = [];
      for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)); }
      const l = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, depthTest: false }));
      l.renderOrder = 20;
      this.group.add(l);
      return l;
    };
    const need = game.cars.length * hull.length;
    while (this.lines.length < need) this.lines.push(circle(R, 0x00ff66));
    this.wheelLines = this.wheelLines || [];
    while (this.wheelLines.length < game.wheels.length) this.wheelLines.push(circle(0.6, 0xff5050));
    let n = 0;
    for (const c of game.cars) {
      const co = Math.cos(c.h), si = Math.sin(c.h);
      for (let i = 0; i < hull.length; i++) {
        const l = this.lines[n++];
        l.visible = c.alive || c.state === 'wreck' || c.state === 'run';
        l.position.set(c.x + co * hull[i].x - si * hull[i].z, c.y + 0.3, c.z + si * hull[i].x + co * hull[i].z);
      }
    }
    for (let i = 0; i < this.wheelLines.length; i++) {
      const w = game.wheels[i], l = this.wheelLines[i];
      l.visible = !!w && !w.dead;
      if (w) l.position.set(w.x, w.y, w.z);
    }
  }

  text(fps, extra) {
    if (!this.on) return;
    const f = (b) => (b ? 'ON ' : 'off');
    this.el.textContent = `DEBUG (F3)  ${fps} fps\n${extra}\n` +
      `[M] corrida infinita ${f(this.infinite)}   [N] sem corte ${f(this.noCut)}\n` +
      `[G] imortal ${f(this.god)}   [H] hitboxes ${f(this.hitboxes)}\n` +
      `[F] freecam ${f(this.free)} (IJKL mover, U/O altura, Shift rapido, arrastar mouse)\n` +
      `[T] velocidade x${SPEEDS[this.speedIdx]}   [V] freeze ${f(this.frozen)} ([.] 1 quadro)   [R] renasce eu   [X] explode bots\n` +
      `[F4] editor (valores, camera, pista)   [E] selecionar area ${f(this.selecting)}\n` +
      `[1-5] da item: nitro/mina/missil/whomp/gelo`;
  }
}
