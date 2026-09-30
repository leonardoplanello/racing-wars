// Pista: spline fechada amostrada uniformemente. Coordenadas: x para a direita, z para baixo (tela).
// Rumo h: frente = (cos h, sin h); aumentar h = virar para a direita. Normal "direita" = (-tz, tx).

export const SURF = { ASPHALT: 0, WOOD: 1, DIRT: 2 };
export const SURF_GRIP = [10, 6.5, 3.8];
export const SURF_SPEED = [1, 0.97, 0.93];

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return [
    0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
    0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
  ];
}

/**
 * def: { name, points:[[x,z]..], scale, halfWidth, verge, boundary:'wall'|'void',
 *        surfaces:[{from,to,type}] (fracao 0..1 da volta), boxGroups:[fracao..], theme }
 */
export function buildTrack(def, spacing = 1) {
  const sc = def.scale || 1;
  const pts = def.points.map(([x, z]) => [x * sc, z * sc]);
  const n = pts.length;
  // amostragem densa
  const dense = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const chord = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const k = Math.max(8, Math.ceil(chord * 4));
    for (let j = 0; j < k; j++) dense.push(catmull(p0, p1, p2, p3, j / k));
  }
  // comprimento acumulado e reamostragem uniforme
  const cum = [0];
  for (let i = 1; i <= dense.length; i++) {
    const a = dense[i - 1], b = dense[i % dense.length];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = cum[cum.length - 1];
  const N = Math.round(total / spacing);
  const ds = total / N;
  const X = new Float64Array(N), Z = new Float64Array(N);
  let k = 0;
  for (let i = 0; i < N; i++) {
    const target = i * ds;
    while (cum[k + 1] < target) k++;
    const f = (target - cum[k]) / (cum[k + 1] - cum[k] || 1);
    const a = dense[k], b = dense[(k + 1) % dense.length];
    X[i] = a[0] + (b[0] - a[0]) * f;
    Z[i] = a[1] + (b[1] - a[1]) * f;
  }
  const TX = new Float64Array(N), TZ = new Float64Array(N), NX = new Float64Array(N), NZ = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const a = (i - 1 + N) % N, b = (i + 1) % N;
    let tx = X[b] - X[a], tz = Z[b] - Z[a];
    const l = Math.hypot(tx, tz) || 1;
    tx /= l; tz /= l;
    TX[i] = tx; TZ[i] = tz; NX[i] = -tz; NZ[i] = tx;
  }
  const SURFACE = new Uint8Array(N);
  const BRIDGE = new Uint8Array(N);
  // marca um intervalo (fracao da volta); from > to significa que passa pela linha de largada
  const mark = (from, to, fn) => {
    const a = Math.floor(from * N);
    let b = Math.ceil(to * N);
    if (to < from) b += N;
    for (let i = a; i < b; i++) fn(((i % N) + N) % N);
  };
  for (const s of def.surfaces || []) mark(s.from, s.to, (i) => (SURFACE[i] = s.type));
  for (const b of def.bridges || []) mark(b.from, b.to, (i) => { BRIDGE[i] = 1; SURFACE[i] = 1; });
  // elevacao visual do tabuleiro (a fisica continua 2D): rampas suaves nas cabeceiras
  const deck = def.deckHeight ?? 1.6;
  const ramp = def.rampLength ?? 45;
  const ELEV = new Float32Array(N);
  if (def.bridges && def.bridges.length) {
    const dist = new Float64Array(N).fill(Infinity);
    for (let i = 0; i < N; i++) if (BRIDGE[i]) dist[i] = 0;
    for (let pass = 0; pass < 2 * N; pass++) {
      const i = pass % N, j = (i + 1) % N;
      dist[j] = Math.min(dist[j], dist[i] + ds);
    }
    for (let pass = 2 * N; pass > 0; pass--) {
      const i = pass % N, j = (i - 1 + N) % N;
      dist[j] = Math.min(dist[j], dist[i] + ds);
    }
    for (let i = 0; i < N; i++) {
      const t = Math.min(1, dist[i] / ramp);
      ELEV[i] = deck * (1 - t * t * (3 - 2 * t));
    }
  }
  const halfWidth = def.halfWidth ?? 10;
  const HW = new Float64Array(N).fill(halfWidth);

  const track = {
    def, name: def.name, N, ds, length: N * ds,
    X, Z, TX, TZ, NX, NZ, SURFACE, HW, BRIDGE, ELEV,
    halfWidth, verge: def.verge ?? 0, boundary: def.boundary || 'wall',
    theme: def.theme || {},
    newNear: () => ({ idx: -1, s: 0, d: 0, nx: 0, nz: 1, tx: 1, tz: 0, cx: 0, cz: 0, dist: 0 }),
    wrapS(s) { const L = this.length; return ((s % L) + L) % L; },
    idxAt(s) { return Math.floor(this.wrapS(s) / ds) % N; },
    hwAt(i) { return HW[i]; },
    /** Ponto da linha central em s (posicao + tangente). */
    pointAt(s, out = { x: 0, z: 0, tx: 1, tz: 0, nx: 0, nz: 1, idx: 0 }) {
      const w = this.wrapS(s);
      const i = Math.floor(w / ds) % N, j = (i + 1) % N;
      const f = w / ds - Math.floor(w / ds);
      out.x = X[i] + (X[j] - X[i]) * f;
      out.z = Z[i] + (Z[j] - Z[i]) * f;
      let tx = TX[i] + (TX[j] - TX[i]) * f, tz = TZ[i] + (TZ[j] - TZ[i]) * f;
      const l = Math.hypot(tx, tz) || 1;
      out.tx = tx / l; out.tz = tz / l; out.nx = -out.tz; out.nz = out.tx; out.idx = i;
      return out;
    },
    /** Ponto mais proximo da linha central. hint<0 = busca global. Preenche e retorna `out`. */
    nearest(x, z, hint, out) {
      let best = Infinity, bi = 0;
      if (hint < 0) {
        for (let i = 0; i < N; i++) {
          const dx = x - X[i], dz = z - Z[i], d2 = dx * dx + dz * dz;
          if (d2 < best) { best = d2; bi = i; }
        }
      } else {
        const W = 40;
        for (let o = -W; o <= W; o++) {
          const i = (hint + o + N) % N;
          const dx = x - X[i], dz = z - Z[i], d2 = dx * dx + dz * dz;
          if (d2 < best) { best = d2; bi = i; }
        }
      }
      // refina na projecao sobre os dois segmentos vizinhos
      let bd = Infinity, bs = 0, bcx = 0, bcz = 0, bnx = 0, bnz = 0, btx = 1, btz = 0;
      for (let o = -1; o <= 0; o++) {
        const a = (bi + o + N) % N, b = (a + 1) % N;
        const ex = X[b] - X[a], ez = Z[b] - Z[a];
        const t = Math.max(0, Math.min(1, ((x - X[a]) * ex + (z - Z[a]) * ez) / (ex * ex + ez * ez || 1)));
        const cx = X[a] + ex * t, cz = Z[a] + ez * t;
        const d2 = (x - cx) * (x - cx) + (z - cz) * (z - cz);
        if (d2 < bd) {
          bd = d2; bcx = cx; bcz = cz;
          const l = Math.hypot(ex, ez) || 1;
          btx = ex / l; btz = ez / l; bnx = -btz; bnz = btx;
          bs = (a + t) * ds;
        }
      }
      out.idx = bi;
      out.s = bs % this.length;
      out.cx = bcx; out.cz = bcz; out.tx = btx; out.tz = btz; out.nx = bnx; out.nz = bnz;
      out.d = (x - bcx) * bnx + (z - bcz) * bnz;
      out.dist = Math.sqrt(bd);
      return out;
    },
    surfaceAt(idx) { return SURFACE[idx]; },
    /** Altura visual do tabuleiro em s (interpolada). */
    elevAt(s) {
      const w = this.wrapS(s) / ds;
      const i = Math.floor(w) % N, j = (i + 1) % N, f = w - Math.floor(w);
      return ELEV[i] + (ELEV[j] - ELEV[i]) * f;
    },
    wallStyle(i) { return BRIDGE[i] ? 'truss' : 'logs'; },
    /** Menor raio de curvatura (unidades) — usado nos testes. */
    minRadius() {
      let m = Infinity;
      for (let i = 0; i < N; i++) {
        const j = (i + 3) % N;
        const dot = Math.max(-1, Math.min(1, TX[i] * TX[j] + TZ[i] * TZ[j]));
        const ang = Math.acos(dot);
        if (ang > 1e-4) m = Math.min(m, (3 * ds) / ang);
      }
      return m;
    },
  };
  return track;
}
