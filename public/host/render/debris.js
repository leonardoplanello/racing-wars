// Detritos fisicos (cosmeticos): tabuas, postes, estilhacos de madeira e pecas de carro que voam, quicam,
// giram e somem. Um unico InstancedMesh; nada aqui altera a simulacao.
import * as THREE from 'three';

const MAX = 480;
const rnd = (a, b) => a + Math.random() * (b - a);

export class Debris {
  constructor(scene) {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.1 }), MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    scene.add(this.mesh);
    this.p = Array.from({ length: MAX }, () => ({ life: 0 }));
    this.next = 0;
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.col = new THREE.Color();
    const z = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < MAX; i++) { this.mesh.setMatrixAt(i, z); this.mesh.setColorAt(i, this.col.setHex(0xffffff)); }
  }

  clear() { for (const p of this.p) p.life = 0; }

  /** Uma peca: posicao, velocidade, tamanho (sx,sy,sz), cor, velocidade angular. */
  piece(o) {
    const p = this.p[this.next];
    this.next = (this.next + 1) % MAX;
    p.life = p.max = o.life ?? rnd(2.2, 3.2);
    p.x = o.x; p.y = o.y; p.z = o.z;
    p.vx = o.vx; p.vy = o.vy; p.vz = o.vz;
    p.rx = o.rx ?? rnd(0, 6); p.ry = o.ry ?? rnd(0, 6); p.rz = o.rz ?? rnd(0, 6);
    p.wx = o.wx ?? rnd(-9, 9); p.wy = o.wy ?? rnd(-9, 9); p.wz = o.wz ?? rnd(-9, 9);
    p.sx = o.sx; p.sy = o.sy; p.sz = o.sz;
    p.gy = o.gy ?? 0;
    this.mesh.setColorAt(this.p.indexOf(p), this.col.setHex(o.color));
    this.mesh.instanceColor.needsUpdate = true;
  }

  /**
   * Cerca que quebra: postes e tabuas partidos saem na direcao do carro, com ruido.
   * (x,z) centro do trecho, (dx,dz) direcao do impacto (unitaria), speed do carro, `ground` altura do chao.
   */
  fence(x, z, dx, dz, speed, ground = 0, kind = 'wood') {
    const sp = Math.min(30, Math.max(6, speed));
    const palette = kind === 'iron' ? [0x2b2f36, 0x3a3f48] : [0xf6f3ea, 0xe4dfd0, 0xcfc6ae];
    const n = kind === 'iron' ? 4 : 7;
    for (let i = 0; i < n; i++) {
      const long = Math.random() < 0.55;
      const s = rnd(0.7, 1) * sp;
      this.piece({
        x: x + rnd(-1, 1), y: ground + rnd(0.5, 1.6), z: z + rnd(-1, 1),
        vx: dx * s + rnd(-3, 3), vz: dz * s + rnd(-3, 3), vy: rnd(3, 9) + sp * 0.12,
        sx: long ? rnd(1.1, 2) : rnd(0.12, 0.3), sy: long ? 0.14 : rnd(0.5, 1.2), sz: long ? 0.12 : 0.14,
        color: palette[(Math.random() * palette.length) | 0], gy: ground,
        wx: rnd(-14, 14), wy: rnd(-14, 14), wz: rnd(-14, 14),
      });
    }
    // lascas pequenas
    for (let i = 0; i < 6; i++) {
      this.piece({
        x, y: ground + rnd(0.3, 1.4), z, vx: dx * sp * rnd(0.3, 1.1) + rnd(-5, 5), vz: dz * sp * rnd(0.3, 1.1) + rnd(-5, 5), vy: rnd(4, 11),
        sx: rnd(0.08, 0.2), sy: rnd(0.08, 0.2), sz: rnd(0.15, 0.4), color: palette[0], gy: ground, life: rnd(1, 1.8),
      });
    }
  }

  /** Explosao de carro: portas, para-choques, rodas e cacos queimados em todas as direcoes. */
  carBlast(x, z, color, vx = 0, vz = 0, ground = 0, scale = 1) {
    const parts = [
      [0.9, 0.18, 1.6, color], [0.9, 0.18, 1.6, color], [0.5, 0.5, 2.0, 0x1b1d24], [0.9, 0.9, 0.5, 0x15161b], [0.9, 0.9, 0.5, 0x15161b],
      [1.2, 0.2, 1.2, color], [0.4, 0.4, 0.4, 0x23262e], [0.5, 0.3, 0.8, 0x888f9c],
    ];
    for (let i = 0; i < 16; i++) {
      const [sx, sy, sz, c] = parts[i % parts.length];
      const a = Math.random() * 6.283, s = rnd(5, 18) * scale;
      const k = Math.random() < 0.4 ? 0.5 : 1;
      this.piece({
        x: x + Math.cos(a) * 0.6, y: ground + rnd(0.6, 1.8), z: z + Math.sin(a) * 0.6,
        vx: vx * 0.4 + Math.cos(a) * s, vz: vz * 0.4 + Math.sin(a) * s, vy: rnd(7, 17) * scale,
        sx: sx * k, sy: sy * k, sz: sz * k, color: c, gy: ground, life: rnd(2.5, 4),
      });
    }
  }

  update(dt) {
    const { m, q, e, v, s } = this;
    for (let i = 0; i < MAX; i++) {
      const p = this.p[i];
      if (p.life <= 0) {
        if (p.drawn) { m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, m); p.drawn = false; }
        continue;
      }
      p.life -= dt;
      p.vy -= 28 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.rx += p.wx * dt; p.ry += p.wy * dt; p.rz += p.wz * dt;
      const floor = p.gy + Math.min(p.sx, p.sy, p.sz) * 0.5;
      if (p.y < floor) {
        p.y = floor;
        if (p.vy < -1.5) p.vy = -p.vy * 0.32; else p.vy = 0;
        const f = Math.exp(-5 * dt);
        p.vx *= f; p.vz *= f; p.wx *= 0.82; p.wy *= 0.9; p.wz *= 0.82;
      }
      const fade = Math.min(1, Math.max(0, p.life / 0.5));
      e.set(p.rx, p.ry, p.rz);
      q.setFromEuler(e);
      s.set(p.sx * fade, p.sy * fade, p.sz * fade);
      m.compose(v.set(p.x, p.y, p.z), q, s);
      this.mesh.setMatrixAt(i, m);
      p.drawn = true;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
