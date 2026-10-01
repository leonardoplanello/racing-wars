// Particulas compactas (um unico Points com shader) para fumaca, fogo, faiscas, explosoes.
import * as THREE from 'three';
import { starburstTexture } from './textures.js';

const MAX = 1600;
const VERT = `
attribute float size; attribute vec4 pcol; varying vec4 vCol; uniform float uScale;
void main(){ vCol = pcol; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = clamp(size * uScale / max(0.5, -mv.z), 1.0, 256.0); gl_Position = projectionMatrix * mv; }`;
const FRAG = `
varying vec4 vCol;
void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard; float a = smoothstep(0.5, 0.15, r) * vCol.a; gl_FragColor = vec4(vCol.rgb, a); }`;

export class FX {
  constructor(scene) {
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.col = new Float32Array(MAX * 4);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    this.geo.setAttribute('pcol', new THREE.BufferAttribute(this.col, 4));
    this.mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, uniforms: { uScale: { value: 10 } } });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    scene.add(this.points);
    this.scene = scene;
    this.flashes = [];
    this.burstMat = new THREE.SpriteMaterial({ map: starburstTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.p = Array.from({ length: MAX }, () => ({ life: 0 }));
    this.next = 0;
    this.c0 = new THREE.Color();
    this.c1 = new THREE.Color();
    this.acc = 0;
    // luz de explosao (pooled) e marcas de queimado no chao
    this.light = new THREE.PointLight(0xffa040, 0, 60, 2);
    this.light.position.set(0, 3, 0);
    scene.add(this.light);
    this.lightT = 0;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.85)'); gr.addColorStop(0.55, 'rgba(10,8,6,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    this.scorchMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6 });
    this.scorchGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.scorches = [];
  }

  /** Remove marcas de queimado (novo round). */
  clearScorch() { for (const m of this.scorches) this.scene.remove(m); this.scorches.length = 0; }
  scorch(x, z, r = 4, y = 0.06) {
    const m = new THREE.Mesh(this.scorchGeo, this.scorchMat);
    m.position.set(x, y, z);
    m.rotation.y = Math.random() * 6.28;
    m.scale.set(r * 2, 1, r * 2);
    this.scene.add(m);
    this.scorches.push(m);
    if (this.scorches.length > 14) this.scene.remove(this.scorches.shift());
  }

  /** Lascas de madeira e poeira empurradas na direcao do impacto (cerca quebrando). */
  woodChips(x, z, dx, dz, speed = 12, y = 1) {
    for (let i = 0; i < 18; i++) {
      const s = (0.4 + Math.random()) * speed;
      this.emit({ x, z, y: y + Math.random(), vx: dx * s + (Math.random() - 0.5) * 8, vz: dz * s + (Math.random() - 0.5) * 8, vy: 2 + Math.random() * 7, g: 22, life: 0.5 + Math.random() * 0.5, s0: 0.5, s1: 0.2, c0: [0.85, 0.7, 0.45], a0: 1, a1: 0.3 });
    }
    for (let i = 0; i < 8; i++) this.emit({ x, z, y: y * 0.5, vx: dx * speed * 0.3 + (Math.random() - 0.5) * 3, vz: dz * speed * 0.3 + (Math.random() - 0.5) * 3, vy: 1 + Math.random() * 2, life: 0.8, s0: 1.6, s1: 4.4, c0: [0.72, 0.64, 0.5], a0: 0.5, a1: 0, drag: 2.2 });
  }
  /** Folhas e galhos soltos por uma arvore atingida; `rock` solta lascas de pedra. */
  leaves(x, z, strength = 0.5, rock = false, y0 = 0) {
    const n = Math.round(8 + 14 * strength);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, s = 2 + Math.random() * 7 * (0.5 + strength);
      const c = rock ? [0.62, 0.58, 0.52] : Math.random() < 0.5 ? [0.35, 0.72, 0.25] : [0.55, 0.82, 0.3];
      this.emit({ x, z, y: y0 + (rock ? 1 : 3 + Math.random() * 3), vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: rock ? 3 + Math.random() * 6 : 1 + Math.random() * 3, g: rock ? 24 : 5, life: rock ? 0.7 : 1 + Math.random() * 0.9, s0: rock ? 0.6 : 0.9, s1: rock ? 0.2 : 0.5, c0: c, a0: 1, a1: 0.2, drag: rock ? 0.6 : 2 });
    }
  }
  /** Arco eletrico (whomp): faiscas azuis em arco em volta do carro. */
  arcs(x, z, n = 16, y0 = 0) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, r = Math.random() * 1.8;
      this.emit({ x: x + Math.cos(a) * r, z: z + Math.sin(a) * r, y: y0 + 0.8 + Math.random() * 2, vx: Math.cos(a) * 9, vz: Math.sin(a) * 9, vy: 3 + Math.random() * 7, g: 16, life: 0.25 + Math.random() * 0.3, s0: 0.9, s1: 0.2, c0: [0.7, 0.9, 1], c1: [0.25, 0.55, 1], a0: 1, a1: 0 });
    }
  }

  emit(o) {
    const p = this.p[this.next];
    this.next = (this.next + 1) % MAX;
    p.life = p.max = o.life;
    p.x = o.x; p.y = o.y ?? 0.6; p.z = o.z;
    p.vx = o.vx || 0; p.vy = o.vy || 0; p.vz = o.vz || 0;
    p.g = o.g || 0; p.drag = o.drag ?? 1;
    p.s0 = o.s0; p.s1 = o.s1 ?? o.s0;
    p.r0 = o.c0[0]; p.g0 = o.c0[1]; p.b0 = o.c0[2];
    const c1 = o.c1 || o.c0;
    p.r1 = c1[0]; p.g1 = c1[1]; p.b1 = c1[2];
    p.a0 = o.a0 ?? 1; p.a1 = o.a1 ?? 0;
  }

  smoke(x, z, intensity = 1, y0 = 0) {
    this.emit({ x, z, y: y0 + 0.8, vx: (Math.random() - 0.5) * 2, vz: (Math.random() - 0.5) * 2, vy: 1.5, life: 0.7 * intensity + 0.2, s0: 1.4, s1: 4.2, c0: [0.75, 0.75, 0.78], a0: 0.5, a1: 0, drag: 2 });
  }
  dust(x, z, color = [0.7, 0.6, 0.45], y0 = 0) {
    this.emit({ x, z, y: y0 + 0.5, vx: (Math.random() - 0.5) * 4, vz: (Math.random() - 0.5) * 4, vy: 1, life: 0.6, s0: 1.2, s1: 3.6, c0: color, a0: 0.55, a1: 0, drag: 2.5 });
  }
  fire(x, z, dx, dz, y0 = 0) {
    this.emit({ x, z, y: y0 + 1.1, vx: dx * -8 + (Math.random() - 0.5) * 3, vz: dz * -8 + (Math.random() - 0.5) * 3, vy: 0.5, life: 0.35, s0: 2.2, s1: 0.4, c0: [1, 0.85, 0.2], c1: [1, 0.25, 0.05], a0: 0.95, a1: 0 });
  }
  sparks(x, z, n = 8, nx = 0, nz = 0, y0 = 0) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, s = 6 + Math.random() * 14;
      this.emit({ x, z, y: y0 + 1.2, vx: Math.cos(a) * s + nx * 4, vz: Math.sin(a) * s + nz * 4, vy: 3 + Math.random() * 6, g: 26, life: 0.35 + Math.random() * 0.3, s0: 0.8, s1: 0.2, c0: [1, 0.95, 0.5], c1: [1, 0.5, 0.1], a0: 1, a1: 0.2 });
    }
  }
  /** Clarao com raios de luz e anel de choque. */
  flash(x, z, big = 1, y = 1.6, tint = 0xffffff) {
    const spr = new THREE.Sprite(this.burstMat.clone());
    spr.material.color.setHex(tint);
    spr.position.set(x, y, z);
    spr.material.rotation = Math.random() * 6.28;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: tint === 0xffffff ? 0xbfe6ff : tint, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
    ring.position.set(x, 0.5, z);
    this.scene.add(spr, ring);
    this.flashes.push({ spr, ring, t: 0, big });
  }

  explosion(x, z, big = 1, y0 = 0) {
    this.flash(x, z, big, y0 + 1.6);
    this.flash(x, z, big * 0.6, y0 + 3.2, 0xffc060);
    this.lightT = 0.45;
    this.light.position.set(x, y0 + 4, z);
    this.scorch(x, z, 3.2 * big, y0 + 0.06);
    // bola de fogo: sobe e se espalha
    for (let i = 0; i < 34 * big; i++) {
      const a = Math.random() * 6.283, s = (1 + Math.random() * 9) * big;
      this.emit({ x, z, y: y0 + 0.8 + Math.random() * 2, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: 3 + Math.random() * 12, g: 6, life: 0.45 + Math.random() * 0.6, s0: 3 * big, s1: 7 * big, c0: [1, 0.9, 0.35], c1: [0.9, 0.2, 0.04], a0: 1, a1: 0, drag: 1.6 });
    }
    // coluna de fumaca escura que sobe devagar
    for (let i = 0; i < 22 * big; i++) {
      const a = Math.random() * 6.283, s = Math.random() * 3;
      this.emit({ x: x + Math.cos(a) * 0.8, z: z + Math.sin(a) * 0.8, y: y0 + 1.5 + Math.random() * 2, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: 5 + Math.random() * 8, life: 1.6 + Math.random() * 1.4, s0: 3, s1: 10, c0: [0.2, 0.2, 0.22], a0: 0.75, a1: 0, drag: 0.9 });
    }
    // anel de poeira da onda de choque
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * 6.283;
      this.emit({ x, z, y: y0 + 0.4, vx: Math.cos(a) * 20 * big, vz: Math.sin(a) * 20 * big, vy: 0.5, life: 0.6, s0: 2, s1: 5, c0: [0.8, 0.72, 0.6], a0: 0.45, a1: 0, drag: 3 });
    }
    this.sparks(x, z, 22, 0, 0, y0);
  }
  /** Impacto do gelo: anel de geada, nevoa branca e cristais subindo. */
  frost(x, z, y0 = 0, r = 9) {
    this.flash(x, z, 1.1, y0 + 1.5, 0x9fe6ff);
    for (let i = 0; i < 36; i++) {
      const a = Math.random() * 6.283, s = Math.random() * r * 1.4;
      this.emit({ x, z, y: y0 + 0.5, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: 2 + Math.random() * 6, g: 4, life: 0.8 + Math.random() * 0.8, s0: 2.4, s1: 6, c0: [0.85, 0.95, 1], c1: [0.55, 0.8, 1], a0: 0.7, a1: 0, drag: 2 });
    }
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * 6.283, s = 4 + Math.random() * 12;
      this.emit({ x, z, y: y0 + 1, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: 5 + Math.random() * 9, g: 26, life: 0.5 + Math.random() * 0.5, s0: 0.9, s1: 0.3, c0: [0.9, 0.98, 1], c1: [0.5, 0.8, 1], a0: 1, a1: 0.2 });
    }
  }
  /** Faiscas de gelo atras do morteiro. */
  iceTrail(x, z, y) {
    this.emit({ x: x + (Math.random() - 0.5), z: z + (Math.random() - 0.5), y, vx: (Math.random() - 0.5) * 3, vz: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, g: 6, life: 0.5, s0: 1.2, s1: 0.2, c0: [0.85, 0.97, 1], c1: [0.4, 0.75, 1], a0: 0.9, a1: 0 });
  }
  /** Agua do gelo derretendo: gotas e poca atras do cubo deslizando (so visual). */
  meltWater(x, z, y, vx, vz) {
    const a = Math.random() * 6.283, r = 0.8 + Math.random() * 1.8;
    this.emit({ x: x + Math.cos(a) * r, z: z + Math.sin(a) * r, y: y + 0.3 + Math.random() * 0.6, vx: vx * 0.25 + Math.cos(a) * 1.5, vz: vz * 0.25 + Math.sin(a) * 1.5, vy: 1 + Math.random() * 2.5, g: 22, life: 0.45 + Math.random() * 0.3, s0: 0.9, s1: 0.5, c0: [0.6, 0.85, 1], c1: [0.35, 0.7, 1], a0: 0.85, a1: 0.1 });
    if (Math.random() < 0.35) this.emit({ x: x - vx * 0.04, z: z - vz * 0.04, y: y + 0.12, vx: 0, vz: 0, vy: 0, g: 0, life: 0.9, s0: 2.2, s1: 3.2, c0: [0.55, 0.8, 1], a0: 0.4, a1: 0, drag: 2 });
  }
  splash(x, z) {
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * 6.283, s = 2 + Math.random() * 6;
      this.emit({ x, z, y: 0.5, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: 8 + Math.random() * 8, g: 30, life: 0.9, s0: 1.4, s1: 0.8, c0: [0.85, 0.95, 1], a0: 0.9, a1: 0 });
    }
  }

  /** scale = altura do buffer em px / (2 * tan(fov/2)); o tamanho do ponto diminui com a distancia. */
  update(dt, scale) {
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const fl = this.flashes[i];
      fl.t += dt;
      const k = fl.t / 0.45;
      if (k >= 1) {
        this.scene.remove(fl.spr, fl.ring);
        fl.spr.material.dispose(); fl.ring.geometry.dispose(); fl.ring.material.dispose();
        this.flashes.splice(i, 1);
        continue;
      }
      fl.spr.scale.setScalar((9 + 16 * Math.sqrt(k)) * fl.big);
      fl.spr.material.opacity = 1 - k * k;
      fl.ring.scale.setScalar(2 + 14 * k * fl.big);
      fl.ring.material.opacity = 0.9 * (1 - k);
    }
    this.mat.uniforms.uScale.value = scale;
    if (this.lightT > 0) { this.lightT -= dt; this.light.intensity = Math.max(0, this.lightT / 0.45) * 900; } else this.light.intensity = 0;
    const pos = this.pos, size = this.size, col = this.col;
    for (let i = 0; i < MAX; i++) {
      const p = this.p[i];
      if (p.life <= 0) {
        size[i] = 0;
        continue;
      }
      p.life -= dt;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vz *= k;
      p.vy -= p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.1) { p.y = 0.1; p.vy = Math.abs(p.vy) * 0.3; }
      const t = 1 - Math.max(0, p.life) / p.max;
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      size[i] = p.s0 + (p.s1 - p.s0) * t;
      col[i * 4] = p.r0 + (p.r1 - p.r0) * t;
      col[i * 4 + 1] = p.g0 + (p.g1 - p.g0) * t;
      col[i * 4 + 2] = p.b0 + (p.b1 - p.b0) * t;
      col[i * 4 + 3] = p.a0 + (p.a1 - p.a0) * t;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
    this.geo.attributes.pcol.needsUpdate = true;
  }
}
