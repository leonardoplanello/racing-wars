// Props urbanos (Downtown): poste, semaforo, placa de pare, hidrante, cone, ponto de onibus, bomba de combustivel,
// pilar, caixote e trechos de predio. Posicoes e estado vem de `track.scenery.props` (simulacao); aqui so o desenho.
// Eixos do modelo: +x ao longo da pista, +z em direcao a estrada (a simulacao ja gira o prop para a calcada ficar atras).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TX from './textures.js';

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), eu = new THREE.Euler(), ps = new THREE.Vector3(), sc = new THREE.Vector3();

function matrix(x, y, z, yaw, s = 1) {
  eu.set(0, -yaw, 0, 'YXZ');
  qt.setFromEuler(eu);
  return m4.compose(ps.set(x, y, z), qt, sc.set(s, s, s)).clone();
}

function part(geo, hex, x = 0, y = 0, z = 0) {
  const g = (geo.index ? geo.toNonIndexed() : geo).clone();
  g.translate(x, y, z);
  const c = new THREE.Color(hex);
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.deleteAttribute('uv');
  return g;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg);
const merge = (list) => mergeGeometries(list);

const GREY = 0x3b3f4a;

/** Geometria (cor por vertice) de cada tipo. */
function models() {
  const m = {};
  m.lamp = merge([
    part(cyl(0.3, 0.38, 0.6), 0x2b2e36, 0, 0.3),
    part(cyl(0.16, 0.22, 9), GREY, 0, 4.5),
    part(box(0.18, 0.18, 3.1), GREY, 0, 9, 1.35),
    part(box(0.6, 0.22, 1.1), 0x2b2e36, 0, 8.92, 3.0),
  ]);
  m.light = merge([
    part(cyl(0.2, 0.28, 6.4), GREY, 0, 3.2),
    part(box(0.18, 0.18, 4.4), GREY, 0, 6.1, 2.0),
    part(box(0.55, 1.5, 0.5), 0x1d1f26, 0, 5.1, 3.6),
  ]);
  m.hydrant = merge([
    part(cyl(0.34, 0.4, 0.85), 0xd8392b, 0, 0.42),
    part(cyl(0.38, 0.38, 0.14), 0xb02a1f, 0, 0.9),
    part(new THREE.SphereGeometry(0.28, 8, 6), 0xd8392b, 0, 1.0),
    part(cyl(0.14, 0.14, 1.0).rotateZ(Math.PI / 2), 0xe8e8ee, 0, 0.55),
    part(cyl(0.13, 0.13, 0.5).rotateX(Math.PI / 2), 0xe8e8ee, 0, 0.5, 0.2),
  ]);
  m.cone = merge([
    part(box(0.95, 0.08, 0.95), 0x1c1d22, 0, 0.04),
    part(new THREE.ConeGeometry(0.4, 1.0, 10), 0xff6a1a, 0, 0.58),
    part(cyl(0.22, 0.28, 0.16, 10), 0xffffff, 0, 0.58),
  ]);
  m.pump = merge([
    part(box(1.1, 0.35, 0.9), 0x77797f, 0, 0.17),
    part(box(0.95, 1.85, 0.7), 0xe53935, 0, 1.3),
    part(box(1.0, 0.25, 0.75), 0xf3f3f6, 0, 2.3),
    part(box(0.6, 0.45, 0.04), 0x22313a, 0, 1.7, 0.37),
    part(box(0.1, 0.8, 0.12), 0x1b1c20, 0.58, 1.1, 0),
    part(box(0.1, 0.8, 0.12), 0x1b1c20, -0.58, 1.1, 0),
  ]);
  m.burnt = merge([
    part(box(1.1, 0.35, 0.9), 0x2a2a2d, 0, 0.17),
    part(box(0.95, 1.2, 0.7), 0x1a1a1c, 0, 0.95),
    part(box(0.5, 0.5, 0.5), 0x111113, 0.2, 1.7, 0.1),
  ]);
  m.pillar = merge([
    part(cyl(0.7, 0.8, 9, 10), 0xf2f2f2, 0, 4.5),
    part(cyl(0.74, 0.84, 1.4, 10), 0xe53935, 0, 3.6),
  ]);
  m.crate = merge([
    part(box(2.4, 1.9, 2.4), 0x2e7d4f, 0, 0.95),
    part(box(2.5, 0.2, 2.5), 0x1f5a37, 0, 1.95),
  ]);
  m.busFrame = merge([
    part(box(4.9, 0.18, 2.0), 0x2a6fd1, 0, 3.25),
    part(box(0.14, 3.2, 0.14), GREY, -2.3, 1.6, -0.8),
    part(box(0.14, 3.2, 0.14), GREY, 2.3, 1.6, -0.8),
    part(box(0.14, 3.2, 0.14), GREY, -2.3, 1.6, 0.8),
    part(box(0.14, 3.2, 0.14), GREY, 2.3, 1.6, 0.8),
    part(box(3.4, 0.14, 0.7), 0x7a5a38, 0, 0.55, -0.55),
    part(box(1.0, 1.6, 0.1), 0xfff7e0, 2.8, 1.5, -0.1),
  ]);
  m.fountain = merge([
    part(cyl(2.7, 2.9, 0.9, 16), 0xb9bcc4, 0, 0.45),
    part(cyl(2.3, 2.3, 0.12, 16), 0x3d8fd6, 0, 0.88),
    part(cyl(0.45, 0.6, 2.4, 10), 0xd3d6dc, 0, 1.6),
    part(new THREE.SphereGeometry(0.7, 10, 8), 0x9bd8ff, 0, 3.0),
  ]);
  m.busGlass = box(4.4, 2.5, 0.06).translate(0, 1.7, -0.95);
  m.lampHead = box(0.5, 0.12, 0.9).translate(0, 8.82, 3.0);
  return m;
}

export class PropsView {
  /** parent: grupo three; `track.scenery.props` ja existe (gerado pela simulacao). */
  constructor(track, parent, { low = false } = {}) {
    this.track = track;
    this.list = track.scenery?.props || [];
    this.meshes = {};
    this.base = new Map(); // idx -> matrizes de cada instancia
    this.slot = []; // prop idx -> {mesh, i}
    this.group = new THREE.Group();
    parent.add(this.group);
    const G = models();
    const by = {};
    for (const p of this.list) if (p.render !== false) (by[p.type] ||= []).push(p);
    const std = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1, flatShading: true });
    const mk = (key, geo, mat, items, { cast = true } = {}) => {
      if (!items.length) return null;
      const im = new THREE.InstancedMesh(geo, mat, items.length);
      im.castShadow = cast && !low;
      im.receiveShadow = true;
      im.frustumCulled = false;
      this.group.add(im);
      return im;
    };
    const place = (type, geoKey, mat, opts) => {
      const items = by[type] || [];
      const im = mk(type, G[geoKey], mat, items, opts);
      if (!im) return;
      this.meshes[type] = im;
      items.forEach((p, i) => {
        const mtx = matrix(p.x, p.y, p.z, p.yaw);
        im.setMatrixAt(i, mtx);
        this.slot[p.idx] = { mesh: im, i, mtx };
      });
    };
    for (const [type, key] of [['lamp', 'lamp'], ['light', 'light'], ['hydrant', 'hydrant'], ['cone', 'cone'], ['pump', 'pump'], ['pillar', 'pillar'], ['crate', 'crate'], ['fountain', 'fountain']]) place(type, key, std);
    // ponto de onibus: estrutura + vidro translucido
    {
      const items = by.busstop || [];
      const fr = mk('busstop', G.busFrame, std, items);
      const gl = mk('busstopGlass', G.busGlass, new THREE.MeshStandardMaterial({ color: 0x9bd8ff, transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.2 }), items, { cast: false });
      if (fr) {
        this.meshes.busstop = fr;
        items.forEach((p, i) => {
          const mtx = matrix(p.x, p.y, p.z, p.yaw);
          fr.setMatrixAt(i, mtx); gl.setMatrixAt(i, mtx);
          this.slot[p.idx] = { mesh: fr, i, mtx, extra: gl };
        });
      }
    }
    // luz acesa da cabeca do poste (sem sombreamento) e poca de luz no chao
    {
      const items = by.lamp || [];
      if (items.length) {
        const head = new THREE.InstancedMesh(G.lampHead, new THREE.MeshBasicMaterial({ color: 0xffe9a8, toneMapped: false }), items.length);
        const pool = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: TX.glowTexture('255,226,150'), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: true }), items.length);
        items.forEach((p, i) => {
          head.setMatrixAt(i, matrix(p.x, p.y, p.z, p.yaw));
          const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
          // poca de luz: 3 u na direcao da estrada (local +z)
          const px = p.x + -s * 3.0, pz = p.z + c * 3.0;
          pool.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(px, 0.12, pz), new THREE.Quaternion(), new THREE.Vector3(15, 1, 15)));
        });
        this.group.add(head, pool);
      }
    }
    // placa de pare: poste + octogono com textura
    {
      const items = by.sign || [];
      if (items.length) {
        const pole = new THREE.InstancedMesh(part(cyl(0.07, 0.07, 2.7), 0x8d9199, 0, 1.35), std, items.length);
        const face = new THREE.InstancedMesh(new THREE.CircleGeometry(0.62, 8).rotateZ(Math.PI / 8).translate(0, 2.55, 0.08), new THREE.MeshStandardMaterial({ map: TX.stopSignTexture(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.6 }), items.length);
        pole.castShadow = true;
        items.forEach((p, i) => {
          const mtx = matrix(p.x, p.y, p.z, p.yaw);
          pole.setMatrixAt(i, mtx); face.setMatrixAt(i, mtx);
          this.slot[p.idx] = { mesh: pole, i, mtx, extra: face };
        });
        this.group.add(pole, face);
        this.meshes.sign = pole;
      }
    }
    // luzes do semaforo (3 por semaforo; o ciclo vai trocando as cores)
    {
      const items = by.light || [];
      this.lights = items;
      if (items.length) {
        const lamps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ toneMapped: false }), items.length * 3);
        items.forEach((p, i) => {
          for (let q = 0; q < 3; q++) {
            // lampadas na caixa pendurada (local 0, 5.1 + 0.45 - q*0.45, 3.6 + 0.26)
            const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
            const lx = 0, lz = 3.9;
            lamps.setMatrixAt(i * 3 + q, new THREE.Matrix4().compose(new THREE.Vector3(p.x + c * lx - s * lz, 5.55 - q * 0.45, p.z + s * lx + c * lz), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)));
          }
        });
        lamps.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(items.length * 9), 3);
        this.lamps = lamps;
        this.group.add(lamps);
        this.lightPhase = items.map((p, i) => (p.x * 0.013 + p.z * 0.007 + i) % 1);
        this.lastLight = -1;
      }
    }
    // trechos de predio (cadeias de circulos): caixas altas com fachada
    {
      const items = by.bldg || [];
      if (items.length) {
        const map = TX.facadeTexture('#d6dae2', 55);
        map.repeat.set(1, 2.5);
        const side = new THREE.MeshStandardMaterial({ map, roughness: 0.85 }), roof = new THREE.MeshStandardMaterial({ color: 0x555a63, roughness: 1 });
        const im = new THREE.InstancedMesh(new THREE.BoxGeometry(9.2, 36, 9.2).translate(0, 18, 0), [side, side, roof, roof, side, side], items.length);
        im.castShadow = !low; im.receiveShadow = true;
        const tint = new THREE.Color();
        items.forEach((p, i) => { const mt = matrix(p.x, p.y, p.z, p.yaw); mt.scale(new THREE.Vector3(1, (p.h ?? 36) / 36, 1)); im.setMatrixAt(i, mt); tint.setHSL(0.55 + (i % 5) * 0.03, 0.12, 0.7); im.setColorAt(i, tint); });
        this.group.add(im);
      }
    }
    // bomba queimada (aparece no lugar da bomba)
    {
      const items = by.pump || [];
      if (items.length) {
        this.burnt = new THREE.InstancedMesh(G.burnt, std, items.length);
        this.burnt.frustumCulled = false;
        items.forEach((p, i) => { this.burnt.setMatrixAt(i, ZERO); p._bi = i; });
        this.group.add(this.burnt);
      }
    }
    this.syncBurnt();
  }

  syncBurnt() {
    if (!this.burnt) return;
    for (const p of this.list) {
      if (p.type !== 'pump') continue;
      this.burnt.setMatrixAt(p._bi, p.burnt ? matrix(p.x, p.y, p.z, p.yaw) : ZERO);
      const s = this.slot[p.idx];
      if (s) { s.mesh.setMatrixAt(s.i, p.burnt || p.dead ? ZERO : s.mtx); s.mesh.instanceMatrix.needsUpdate = true; }
    }
    this.burnt.instanceMatrix.needsUpdate = true;
  }

  /** Prop removido (cone/placa/ponto/hidrante tombaram ou um poder derrubou). */
  hide(idx) {
    const s = this.slot[idx];
    if (!s) return;
    s.mesh.setMatrixAt(s.i, ZERO); s.mesh.instanceMatrix.needsUpdate = true;
    if (s.extra) { s.extra.setMatrixAt(s.i, ZERO); s.extra.instanceMatrix.needsUpdate = true; }
  }

  /** Bomba explodiu: troca pelo modelo queimado. */
  burn(idx) {
    const p = this.list[idx];
    if (!p) return;
    this.hide(idx);
    if (this.burnt && p._bi !== undefined) { this.burnt.setMatrixAt(p._bi, matrix(p.x, p.y, p.z, p.yaw)); this.burnt.instanceMatrix.needsUpdate = true; }
  }

  /** Nova rodada: tudo volta (menos o que queimou). */
  restore() {
    for (const p of this.list) {
      const s = this.slot[p.idx];
      if (!s) continue;
      const gone = p.burnt;
      s.mesh.setMatrixAt(s.i, gone ? ZERO : s.mtx); s.mesh.instanceMatrix.needsUpdate = true;
      if (s.extra) { s.extra.setMatrixAt(s.i, gone ? ZERO : s.mtx); s.extra.instanceMatrix.needsUpdate = true; }
    }
    this.syncBurnt();
  }

  /** Ciclo dos semaforos (verde, amarelo, vermelho). */
  update(t) {
    if (!this.lamps) return;
    const step = Math.floor(t * 2);
    if (step === this.lastLight) return;
    this.lastLight = step;
    const col = new THREE.Color();
    this.lights.forEach((p, i) => {
      const ph = (this.lightPhase[i] + t / 14) % 1; // ciclo de 14 s
      const st = ph < 0.42 ? 0 : ph < 0.5 ? 1 : 2; // 0 verde, 1 amarelo, 2 vermelho
      const on = [st === 2 ? 0xff2a2a : 0x3a0d0d, st === 1 ? 0xffd23a : 0x3a300d, st === 0 ? 0x33ff66 : 0x0d3a1c];
      for (let q = 0; q < 3; q++) this.lamps.setColorAt(i * 3 + q, col.setHex(on[q]));
    });
    this.lamps.instanceColor.needsUpdate = true;
  }
}
