// Particulas compactas (um unico Points com shader) para fumaca, fogo, faiscas, explosoes.
import * as THREE from 'three';

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
    this.p = Array.from({ length: MAX }, () => ({ life: 0 }));
    this.next = 0;
    this.c0 = new THREE.Color();
    this.c1 = new THREE.Color();
    this.acc = 0;
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

  smoke(x, z, intensity = 1) {
    this.emit({ x, z, y: 0.8, vx: (Math.random() - 0.5) * 2, vz: (Math.random() - 0.5) * 2, vy: 1.5, life: 0.7 * intensity + 0.2, s0: 1.4, s1: 4.2, c0: [0.75, 0.75, 0.78], a0: 0.5, a1: 0, drag: 2 });
  }
  dust(x, z, color = [0.7, 0.6, 0.45]) {
    this.emit({ x, z, y: 0.5, vx: (Math.random() - 0.5) * 4, vz: (Math.random() - 0.5) * 4, vy: 1, life: 0.6, s0: 1.2, s1: 3.6, c0: color, a0: 0.55, a1: 0, drag: 2.5 });
  }
  fire(x, z, dx, dz) {
    this.emit({ x, z, y: 1.1, vx: dx * -8 + (Math.random() - 0.5) * 3, vz: dz * -8 + (Math.random() - 0.5) * 3, vy: 0.5, life: 0.35, s0: 2.2, s1: 0.4, c0: [1, 0.85, 0.2], c1: [1, 0.25, 0.05], a0: 0.95, a1: 0 });
  }
  sparks(x, z, n = 8, nx = 0, nz = 0) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, s = 6 + Math.random() * 14;
      this.emit({ x, z, y: 1.2, vx: Math.cos(a) * s + nx * 4, vz: Math.sin(a) * s + nz * 4, vy: 3 + Math.random() * 6, g: 26, life: 0.35 + Math.random() * 0.3, s0: 0.8, s1: 0.2, c0: [1, 0.95, 0.5], c1: [1, 0.5, 0.1], a0: 1, a1: 0.2 });
    }
  }
  explosion(x, z, big = 1) {
    for (let i = 0; i < 26 * big; i++) {
      const a = Math.random() * 6.283, s = (3 + Math.random() * 12) * big;
      this.emit({ x, z, y: 1 + Math.random() * 2, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: 2 + Math.random() * 9, g: 14, life: 0.5 + Math.random() * 0.5, s0: 3.2 * big, s1: 6 * big, c0: [1, 0.85, 0.25], c1: [0.9, 0.2, 0.05], a0: 1, a1: 0, drag: 1.5 });
    }
    for (let i = 0; i < 16 * big; i++) {
      const a = Math.random() * 6.283, s = 2 + Math.random() * 7;
      this.emit({ x, z, y: 1.5, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: 4 + Math.random() * 4, life: 1.1 + Math.random() * 0.8, s0: 3, s1: 8, c0: [0.25, 0.25, 0.27], a0: 0.7, a1: 0, drag: 1.2 });
    }
    this.sparks(x, z, 14);
  }
  splash(x, z) {
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * 6.283, s = 2 + Math.random() * 6;
      this.emit({ x, z, y: 0.5, vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: 8 + Math.random() * 8, g: 30, life: 0.9, s0: 1.4, s1: 0.8, c0: [0.85, 0.95, 1], a0: 0.9, a1: 0 });
    }
  }

  /** scale = altura do buffer em px / (2 * tan(fov/2)); o tamanho do ponto diminui com a distancia. */
  update(dt, scale) {
    this.mat.uniforms.uScale.value = scale;
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
