// Do caminho bruto do A* para a linha central do jogo: reamostra, recentra entre as bordas da estrada (parede, fora de
// pista, buraco), suaviza e fecha o laco com espacamento de 1 u. Devolve arrays alinhados (x, z, y, hw).
const MAX_HW = 24; // limite da meia largura (u) em areas abertas

function resampleClosed(pts, step) {
  // pts: [{x,z}], laco fechado. Devolve pontos a cada `step` ao longo do comprimento.
  const n = pts.length, seg = [];
  let L = 0;
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; const l = Math.hypot(b.x - a.x, b.z - a.z); seg.push(l); L += l; }
  const count = Math.max(8, Math.round(L / step)), out = [];
  let i = 0, acc = 0;
  for (let k = 0; k < count; k++) {
    const target = (k / count) * L;
    while (acc + seg[i] < target && i < n - 1) { acc += seg[i]; i++; }
    const a = pts[i], b = pts[(i + 1) % n], f = seg[i] > 0 ? (target - acc) / seg[i] : 0;
    out.push({ x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, y: a.y + (b.y - a.y) * f, air: !!(b.jump || b.air) });
  }
  return out;
}

function smoothClosed(pts, passes, w = 4) {
  const n = pts.length;
  for (let p = 0; p < passes; p++) {
    const nx = new Float64Array(n), nz = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let sx = 0, sz = 0, c = 0;
      for (let k = -w; k <= w; k++) { const q = pts[(i + k + n) % n]; sx += q.x; sz += q.z; c++; }
      nx[i] = sx / c; nz[i] = sz / c;
    }
    for (let i = 0; i < n; i++) if (!pts[i].air) { pts[i].x = nx[i]; pts[i].z = nz[i]; }
  }
}

export function centerline(world, route, opts = {}) {
  const ds = 1;
  const step = 0.3;
  const tmp = { y: 0, sec: 0, fof: -1, nx: 0, ny: 1, nz: 0 }, info = { off: 0, boost: false, finish: false, death: false };

  // pontos distintos do A*, laco fechado
  let pts = route.path.filter((p, i, a) => i === 0 || Math.hypot(p.x - a[i - 1].x, p.z - a[i - 1].z) > 1e-6).map((p) => ({ ...p }));
  if (Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].z - pts[pts.length - 1].z) < 1e-6) pts.pop();
  pts = resampleClosed(pts, 0.75);
  smoothClosed(pts, 6, 5);

  /** E estrada (dirigivel e sem ser fora de pista) em (x,z) vindo de (px,pz) a altura y? Atualiza y por superficie. */
  const road = (px, pz, x, z, y) => {
    const si = world.locate(x, z);
    if (!world.surfaceIn(si, x, z, y, tmp) || (world.isVoid(si) && tmp.fof < 0)) return -1;
    world.surfaceInfo(tmp.sec, info);
    if (info.death || info.off) return -1;
    if (world.segmentBlocked(px, pz, x, z, y)) return -1;
    return tmp.y;
  };
  const extent = (p, nx, nz, sign) => {
    let x = p.x, z = p.z, y = p.y, d = 0;
    while (d < MAX_HW) {
      const x2 = p.x + nx * sign * (d + step), z2 = p.z + nz * sign * (d + step);
      const ny = road(x, z, x2, z2, y);
      if (ny < 0) break;
      x = x2; z = z2; y = ny; d += step;
    }
    return d;
  };

  let hw = new Float32Array(pts.length);
  for (let pass = 0; pass < 4; pass++) {
    const n = pts.length, shift = new Float64Array(n), hl = new Float64Array(n), hr = new Float64Array(n);
    // y coerente ao longo do laco (duas voltas para assentar)
    let y = pts[0].y;
    for (let k = 0; k < 2 * n; k++) {
      const p = pts[k % n];
      if (p.air) { y = p.y; continue; } // trecho de salto: a altura vem da interpolacao
      const si = world.locate(p.x, p.z);
      if (world.surfaceIn(si, p.x, p.z, y, tmp)) { y = tmp.y; p.y = y; }
    }
    for (let i = 0; i < n; i++) {
      if (pts[i].air) { shift[i] = 0; hl[i] = hr[i] = 8; hw[i] = 8; pts[i]._n = [0, 0]; continue; }
      const a = pts[(i - 2 + n) % n], b = pts[(i + 2) % n];
      let tx = b.x - a.x, tz = b.z - a.z; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      const nx = -tz, nz = tx; // direita
      hr[i] = extent(pts[i], nx, nz, 1);
      hl[i] = extent(pts[i], nx, nz, -1);
      shift[i] = (hr[i] - hl[i]) / 2;
      hw[i] = Math.min(hl[i], hr[i]) + Math.abs(shift[i]);
      pts[i]._n = [nx, nz];
    }
    // suaviza o deslocamento e aplica
    const sm = new Float64Array(n), W = 6;
    for (let i = 0; i < n; i++) { let s = 0; for (let k = -W; k <= W; k++) s += shift[(i + k + n) % n]; sm[i] = s / (2 * W + 1); }
    for (let i = 0; i < n; i++) { pts[i].x += pts[i]._n[0] * sm[i] * 0.9; pts[i].z += pts[i]._n[1] * sm[i] * 0.9; }
    smoothClosed(pts, 2, 3);
  }

  // folga: afasta a linha das paredes (o carro tem ~2,6 u de largura; bots encalham em cantos apertados)
  {
    const n = pts.length, nw = { nx: 0, nz: 0 };
    for (let it = 0; it < 8; it++) {
      let moved = 0;
      for (let i = 0; i < n; i++) {
        const p = pts[i];
        if (p.air) continue;
        const dist = world.nearestWall(p.x, p.z, p.y + 0.05, 3, nw);
        if (dist < 2.4) { const push = (2.4 - dist) * 0.7; p.x -= nw.nx * push; p.z -= nw.nz * push; moved++; }
      }
      smoothClosed(pts, 1, 2);
      if (!moved) break;
    }
  }

  // medida final e reamostragem a 1 u
  const fin = resampleClosed(pts, ds);
  const n = fin.length;
  const hws = new Float32Array(n), ys = new Float32Array(n);
  let y = fin[0].y;
  for (let k = 0; k < 2 * n; k++) {
    const p = fin[k % n];
    if (p.air) { y = p.y; continue; }
    const si = world.locate(p.x, p.z);
    if (world.surfaceIn(si, p.x, p.z, y, tmp)) { y = tmp.y; p.y = y; }
  }
  for (let i = 0; i < n; i++) {
    if (fin[i].air) { hws[i] = 8; ys[i] = fin[i].y; continue; }
    const a = fin[(i - 2 + n) % n], b = fin[(i + 2) % n];
    let tx = b.x - a.x, tz = b.z - a.z; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    const nx = -tz, nz = tx;
    const r = extent(fin[i], nx, nz, 1), lft = extent(fin[i], nx, nz, -1);
    hws[i] = Math.max(2, Math.min(r, lft));
    ys[i] = fin[i].y;
  }
  // meia largura suavizada e sempre >= 2 u
  const hs = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let k = -6; k <= 6; k++) { s += hws[(i + k + n) % n]; c++; } hs[i] = Math.max(2, Math.min(hws[i], s / c)); }
  return { x: fin.map((p) => p.x), z: fin.map((p) => p.z), y: Array.from(ys), hw: Array.from(hs), air: fin.map((p) => (p.air ? 1 : 0)), ds, n };
}
