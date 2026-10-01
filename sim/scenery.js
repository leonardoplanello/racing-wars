// Cenario solido determinístico: arvores, pedras e casas viram colisores circulares.
// Usado pela simulacao (colisao) e pelo render (posicoes), entao os dois sempre concordam.
import { makeRng } from './rng.js';

const CELL = 24;

export function buildScenery(track, seed = 99) {
  const rng = makeRng(seed);
  const { N, X, Z } = track;
  const edge = track.halfWidth + track.verge;

  // hash espacial das amostras da pista
  const grid = new Map();
  const key = (cx, cz) => (cx * 73856093) ^ (cz * 19349663);
  for (let i = 0; i < N; i += 2) {
    const k = key(Math.floor(X[i] / CELL), Math.floor(Z[i] / CELL));
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  }
  const dist = (x, z, onlyBridge = false) => {
    let m = Infinity;
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
      const l = grid.get(key(cx + a, cz + b));
      if (!l) continue;
      for (const i of l) {
        if (onlyBridge && !track.BRIDGE[i]) continue;
        m = Math.min(m, Math.hypot(x - X[i], z - Z[i]));
      }
    }
    return m;
  };
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (let i = 0; i < N; i++) { x0 = Math.min(x0, X[i]); x1 = Math.max(x1, X[i]); z0 = Math.min(z0, Z[i]); z1 = Math.max(z1, Z[i]); }
  const pad = 150;
  const river = track.riverHalf ?? 34;
  const hasBridge = track.BRIDGE.some((v) => v);
  const clear = edge + 9;
  const spots = (n, minD, maxD = Infinity) => {
    const out = [];
    let guard = n * 60;
    while (out.length < n && guard-- > 0) {
      const x = x0 - pad + rng() * (x1 - x0 + pad * 2), z = z0 - pad + rng() * (z1 - z0 + pad * 2);
      const d = dist(x, z);
      if (d < clear + minD || d > maxD) continue;
      if (hasBridge && dist(x, z, true) < river + 4) continue;
      out.push([x, z]);
    }
    return out;
  };

  const trees = spots(300, 2).map(([x, z]) => {
    const s = 0.8 + rng() * 1.1;
    return { x, z, s, yaw: rng() * 6.28, sy: s * (0.9 + rng() * 0.4), hue: rng(), light: rng(), r: 1.15 * s };
  });
  const rocks = spots(90, -3).map(([x, z]) => {
    const s = 0.5 + rng() * 1.6;
    return { x, z, s, yaw: rng() * 6, tone: rng(), r: 1.5 * s };
  });
  const houses = spots(22, 14, edge + 110).map(([x, z]) => ({
    x, z, yaw: Math.floor(rng() * 4) * (Math.PI / 2), brick: rng() < 0.5, hue: rng(),
  }));

  // colisores (circulos) + grade para consulta rapida
  const colliders = [];
  for (const t of trees) colliders.push({ x: t.x, z: t.z, r: t.r, kind: 'tree' });
  for (const r of rocks) colliders.push({ x: r.x, z: r.z, r: r.r, kind: 'rock' });
  for (const h of houses) {
    const c = Math.cos(h.yaw), s = Math.sin(h.yaw);
    for (const off of [-3.2, 0, 3.2]) colliders.push({ x: h.x + c * off, z: h.z + s * off, r: 4.6, kind: 'house' });
  }
  const cgrid = new Map();
  const CC = 16;
  colliders.forEach((c, i) => {
    const k = key(Math.floor(c.x / CC), Math.floor(c.z / CC));
    if (!cgrid.has(k)) cgrid.set(k, []);
    cgrid.get(k).push(i);
  });

  return {
    trees, rocks, houses, colliders, dist,
    /** Colisores num raio em torno de (x,z). */
    query(x, z, r, out = []) {
      out.length = 0;
      const cx = Math.floor(x / CC), cz = Math.floor(z / CC);
      const n = Math.ceil((r + 6) / CC);
      for (let a = -n; a <= n; a++) for (let b = -n; b <= n; b++) {
        const l = cgrid.get(key(cx + a, cz + b));
        if (l) for (const i of l) out.push(colliders[i]);
      }
      return out;
    },
  };
}
