// Cidade (tema 'city'): predios ao longo dos muros, placas de neon e skyline ao fundo. Tudo procedural.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TX from './textures.js';

const HEIGHTS = [18, 28, 40, 56];
const DEPTH = 26;
const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), eu = new THREE.Euler(), ps = new THREE.Vector3(), sc = new THREE.Vector3();

function mat(x, y, z, yaw, sx, sy, sz) {
  eu.set(0, -yaw, 0, 'YXZ');
  qt.setFromEuler(eu);
  return m4.compose(ps.set(x, y, z), qt, sc.set(sx, sy, sz)).clone();
}

const NEON = [['BAR', '#ff3df2'], ['HOTEL', '#35e6ff'], ['PIZZA', '#ffb23a'], ['CAFE', '#7dff5a'], ['24H', '#ff4a4a'], ['CINE', '#b48cff']];

/**
 * Predios ficam logo atras do muro de cada lado (so onde o muro e 'building' e fechado) e sao so visuais:
 * a colisao e o proprio muro da pista. `track.scenery.dist` evita que um predio invada outro trecho da pista.
 */
export function buildCity(track, { group, decor, rng, low, EDGEf }) {
  const { N, X, Z, TX: TXs, TZ: TZs, NX, NZ, ds } = track;
  const L = track.length;
  const dist = track.scenery?.dist;
  const mats = HEIGHTS.map(() => []);
  const cols = HEIGHTS.map(() => []);
  const neon = NEON.map(() => []);
  const tint = new THREE.Color();
  const block = low ? 34 : 24;
  const step = Math.max(1, Math.round(block / ds));
  for (let i = 0; i < N; i += step) {
    const k = i % N, kc = (i + (step >> 1)) % N;
    for (const sg of [-1, 1]) {
      if (track.wallStyle(k) !== 'building' || track.wallStyle(kc) !== 'building') continue;
      if (track.OPEN[k] & (sg > 0 ? 2 : 1) || track.OPEN[kc] & (sg > 0 ? 2 : 1)) continue;
      const o = EDGEf(kc) + 0.45 + DEPTH / 2 - 0.5;
      const cx = X[kc] + NX[kc] * sg * o, cz = Z[kc] + NZ[kc] * sg * o;
      if (dist && dist(cx, cz) < o - 5) continue;
      const hi = Math.min(HEIGHTS.length - 1, Math.floor(rng() * rng() * 2.2 * HEIGHTS.length));
      const h = HEIGHTS[hi] * (0.85 + rng() * 0.3);
      const yaw = Math.atan2(TZs[kc], TXs[kc]);
      const len = step * ds + 3;
      mats[hi].push(mat(cx, h / 2, cz, yaw, len, h / HEIGHTS[hi], DEPTH));
      tint.setHSL(0.55 + rng() * 0.12, 0.08 + rng() * 0.25, 0.6 + rng() * 0.3);
      cols[hi].push(tint.clone());
      // placa de neon na fachada que da para a rua
      if (rng() < 0.16) {
        const ni = Math.floor(rng() * NEON.length);
        const fo = o - DEPTH / 2 + 0.2;
        const px = X[kc] + NX[kc] * sg * fo, pz = Z[kc] + NZ[kc] * sg * fo;
        eu.set(0, -yaw + (sg > 0 ? -Math.PI / 2 : Math.PI / 2), 0, 'YXZ');
        qt.setFromEuler(eu);
        neon[ni].push(m4.compose(ps.set(px, 7 + rng() * 6, pz), qt, sc.set(9, 3.4, 1)).clone());
      }
    }
  }
  const box = new THREE.BoxGeometry(1, 1, 1);
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x555a63, roughness: 1 });
  HEIGHTS.forEach((hh, hi) => {
    const list = mats[hi];
    if (!list.length) return;
    const map = TX.facadeTexture('#d6dae2', 31 + hi);
    map.repeat.set(1, (hh / 4) / 16);
    const side = new THREE.MeshStandardMaterial({ map, roughness: 0.85 });
    const mesh = new THREE.InstancedMesh(box.clone().scale(1, hh, 1), [side, side, roofMat, roofMat, side, side], list.length);
    list.forEach((m, i) => { mesh.setMatrixAt(i, m); mesh.setColorAt(i, cols[hi][i]); });
    mesh.castShadow = !low;
    mesh.receiveShadow = true;
    decor.add(mesh);
  });
  // placas de neon (sem luz propria: material basico, brilham sob a nevoa)
  NEON.forEach(([text, color], ni) => {
    const list = neon[ni];
    if (!list.length) return;
    const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: TX.neonTexture(text, color), toneMapped: false, side: THREE.DoubleSide }), list.length);
    list.forEach((m, i) => im.setMatrixAt(i, m));
    decor.add(im);
  });

  // skyline distante: torres altas num anel alem da pista
  {
    let cx = 0, cz = 0;
    for (let i = 0; i < N; i += 8) { cx += X[i]; cz += Z[i]; }
    cx /= Math.ceil(N / 8); cz /= Math.ceil(N / 8);
    let span = 0;
    for (let i = 0; i < N; i += 4) span = Math.max(span, Math.hypot(X[i] - cx, Z[i] - cz));
    const towers = [];
    const n = low ? 40 : 90;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng() * 0.08, r = span + 260 + rng() * 380;
      const w = 40 + rng() * 60, h = 90 + rng() * 210;
      towers.push(mat(cx + Math.cos(a) * r, h / 2 - 2, cz + Math.sin(a) * r, rng() * 3, w, h, w));
    }
    const im = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ map: TX.facadeTexture('#5b6272', 77), roughness: 1, fog: true }), towers.length);
    towers.forEach((m, i) => { im.setMatrixAt(i, m); tint.setHSL(0.6, 0.15, 0.35 + rng() * 0.25); im.setColorAt(i, tint); });
    decor.add(im);
  }
  void L; void mergeGeometries;
}
