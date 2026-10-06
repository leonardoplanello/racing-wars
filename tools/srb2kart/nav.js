// Linha central de uma pista do SRB2Kart: os waypoints (thing 292) dao os checkpoints em ordem (ID 0..N); entre dois
// checkpoints seguidos um A* sobre uma grade de celulas dirigiveis acha o caminho pela estrada. O resultado bruto e
// suavizado/recentrado em centerline.js.
import { MapWorld } from '../../sim/mapworld.js';

class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v;
    let i = k.length;
    k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v, topV = v[0], lastK = k.pop(), lastV = v.pop();
    if (k.length) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= k.length) break;
        if (c + 1 < k.length && k[c + 1] < k[c]) c++;
        if (k[c] >= lastK) break;
        k[i] = k[c]; v[i] = v[c]; i = c;
      }
      k[i] = lastK; v[i] = lastV;
    }
    return topV;
  }
}

/**
 * Checkpoints em ordem. Cada ID tem 4 waypoints (os cantos do checkpoint); o centro deles pode cair num poco, no vazio ou em
 * outro nivel, entao cada ID vira uma lista de CANDIDATOS: o centro e os proprios membros que estao em chao dirigivel.
 * Com varios aglomerados distantes (rotas alternativas) vale o mais proximo do checkpoint anterior.
 */
export function checkpointGoals(d, world) {
  const byId = new Map();
  for (const w of d.waypoints) { if (!byId.has(w.angle)) byId.set(w.angle, []); byId.get(w.angle).push(w); }
  const ids = [...byId.keys()].sort((a, b) => a - b);
  const tmp = { y: 0, sec: 0, fof: -1, nx: 0, ny: 1, nz: 0 }, inf = { off: 0, death: false };
  /** Superficies dirigiveis em (x,z): o piso do setor e o topo de cada piso 3D solido (uma por nivel). */
  const levels = (x, z) => {
    const si = world.locate(x, z), S = world.sectors[si], out = [];
    const ys = [];
    if (!world.isVoid(si)) ys.push(world.floorAt(si, x, z));
    for (const fi of S.fofs) { const f = world.fofs[fi]; if (f.kind === 'solid') ys.push(world.fofTop(f, x, z)); }
    for (const y of ys) {
      if (!world.surfaceIn(si, x, z, y, tmp) || Math.abs(tmp.y - y) > 0.01) continue;
      if (world.isVoid(si) && tmp.fof < 0) continue;
      world.surfaceInfo(tmp.sec, inf);
      if (inf.death) continue;
      out.push({ x, z, y: tmp.y });
    }
    return out;
  };
  const goals = [];
  let prev = d.starts[0] || d.waypoints[0];
  for (const id of ids) {
    const clusters = [];
    for (const p of byId.get(id)) {
      const c = clusters.find((cl) => Math.hypot(cl.x - p.x, cl.z - p.z) < 40);
      if (c) { c.n++; c.x += (p.x - c.x) / c.n; c.z += (p.z - c.z) / c.n; c.m.push(p); } else clusters.push({ x: p.x, z: p.z, n: 1, m: [p] });
    }
    clusters.sort((a, b) => Math.hypot(a.x - prev.x, a.z - prev.z) - Math.hypot(b.x - prev.x, b.z - prev.z));
    const c = clusters[0];
    const cands = [];
    cands.push(...levels(c.x, c.z));
    for (const m of c.m) cands.push(...levels(m.x, m.z));
    goals.push({ id, x: c.x, z: c.z, cands });
    prev = c;
  }
  return goals;
}

/** Caminho bruto (pontos da grade) passando por todos os checkpoints e voltando ao primeiro. */
export function routeThroughCheckpoints(d, opts = {}) {
  const world = opts.world || new MapWorld(d);
  const g = opts.cell ?? 1.5; // celula da grade (u do jogo)
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const l of d.lines) { x0 = Math.min(x0, l[0], l[2]); x1 = Math.max(x1, l[0], l[2]); z0 = Math.min(z0, l[1], l[3]); z1 = Math.max(z1, l[1], l[3]); }
  const W = Math.ceil((x1 - x0) / g) + 1, H = Math.ceil((z1 - z0) / g) + 1;
  const idxOf = (x, z) => { const ix = Math.round((x - x0) / g), iz = Math.round((z - z0) / g); return ix < 0 || iz < 0 || ix >= W || iz >= H ? -1 : iz * W + ix; };
  const cx = (i) => x0 + (i % W) * g, cz = (i) => z0 + Math.floor(i / W) * g;

  const gs = new Float32Array(W * H), stamp = new Uint32Array(W * H), done = new Uint32Array(W * H), from = new Int32Array(W * H), yv = new Float32Array(W * H);
  const secv = new Int32Array(W * H), jumpDist = new Float32Array(W * H), jumpStamp = new Uint32Array(W * H), assistStamp = new Uint32Array(W * H), edgeCell = new Uint32Array(W * H);
  let relaxed = false; // 2a passada: elos assistidos (salto/degrau) nas bordas
  let cur = 0;
  const tmp = { y: 0, sec: 0, fof: -1, nx: 0, ny: 1, nz: 0 };
  const info = { off: 0, boost: false, finish: false, death: false };
  const info2 = { off: 0, boost: false, finish: false, death: false, spring: false, dash: false };
  const G = 26, V = 34; // gravidade e velocidade de cruzeiro do carro (sim/car.js)
  const JUMP_UP = 14, JUMP_MAX = 60;

  /** Custo de entrar em (x,z) vindo de (px,pz) na altura y; -1 = proibido. Deixa a altura destino em tmp.y. */
  const enter = (px, pz, x, z, y) => {
    const si = world.locate(x, z);
    if (!world.surfaceIn(si, x, z, y, tmp) || (world.isVoid(si) && tmp.fof < 0)) return -1;
    world.surfaceInfo(tmp.sec, info);
    if (info.death) return -1;
    if (world.segmentBlocked(px, pz, x, z, y)) return -1;
    return info.off ? 7 + 2 * info.off : info.boost ? 0.85 : 1;
  };

  /** O segmento (a->b) passa por algo que nao se dirige (vazio, morte, piso fora do alcance)? E ai que um salto vale a pena. */
  const hasGap = (ax, az, ay, bx, bz) => {
    const n = Math.max(2, Math.ceil(Math.hypot(bx - ax, bz - az) / (g * 0.75)));
    for (let k = 1; k < n; k++) {
      const x = ax + ((bx - ax) * k) / n, z = az + ((bz - az) * k) / n, si = world.locate(x, z);
      if (!world.surfaceIn(si, x, z, ay, tmp) || (world.isVoid(si) && tmp.fof < 0)) return true;
      world.surfaceInfo(tmp.sec, info2);
      if (info2.death) return true;
    }
    return false;
  };

  /** Arestas de salto a partir de u: molas/dash pads (alcance fixo) e labios de rampa (alcance balistico pela subida). */
  const jumpsFrom = (u, gx, gz, heap, near) => {
    const ux = cx(u), uz = cz(u), uy = yv[u], p = from[u];
    world.surfaceInfo(secv[u], info2);
    let range = 0, up = JUMP_UP;
    if (info2.spring || info2.dash) range = JUMP_MAX;
    else if (p >= 0 && jumpStamp[u] !== cur) {
      // labio de rampa: a subida por unidade horizontal da o vy (vy = r * V); alcance = V * T, T = 2 vy / G
      let q = p, k = 0;
      while (k < 3 && from[q] >= 0) { q = from[q]; k++; }
      const run = Math.hypot(ux - cx(q), uz - cz(q)) || g;
      const r = (uy - yv[q]) / run;
      if (r < 0.12) return;
      const vy = r * V;
      range = Math.min(JUMP_MAX, 0.9 * V * (2 * vy) / G);
      up = Math.min(JUMP_UP, (vy * vy) / (2 * G) + 0.5);
    } else return;
    if (range < 4) return;
    let dirx = p >= 0 ? ux - cx(p) : gx - ux, dirz = p >= 0 ? uz - cz(p) : gz - uz;
    const dl = Math.hypot(dirx, dirz) || 1; dirx /= dl; dirz /= dl;
    for (const ang of [0, 0.3, -0.3]) {
      const ca = Math.cos(ang), sa = Math.sin(ang), jx = dirx * ca - dirz * sa, jz = dirx * sa + dirz * ca;
      for (let dist = 4; dist <= range; dist += 2) {
        const lx = ux + jx * dist, lz = uz + jz * dist, v = idxOf(lx, lz);
        if (v < 0 || done[v] === cur) continue;
        const si = world.locate(lx, lz);
        if (!world.surfaceIn(si, lx, lz, uy + up, tmp) || (world.isVoid(si) && tmp.fof < 0)) continue;
        const landY = tmp.y, landSec = tmp.sec; // hasGap reaproveita o tmp
        world.surfaceInfo(landSec, info2);
        if (info2.death || info2.off) continue;
        if (world.segmentWalled(ux, uz, lx, lz) || !hasGap(ux, uz, uy, lx, lz)) continue;
        const ng = gs[u] + dist * 1.05;
        if (stamp[v] !== cur || ng < gs[v]) {
          stamp[v] = cur; gs[v] = ng; from[v] = u; yv[v] = landY; secv[v] = landSec; jumpStamp[v] = cur; jumpDist[v] = dist;
          heap.push(ng + near(lx, lz), v);
        }
        break; // o primeiro pouso valido nessa direcao basta (o mais curto)
      }
    }
  };

  /** Elos assistidos: de uma celula de borda, salta ate ~24 u em qualquer direcao (e sobe ate 45 u) por cima de vaos, degraus altos ou paredes baixas. */
  const assistFrom = (u, heap, near) => {
    const ux = cx(u), uz = cz(u), uy = yv[u];
    for (let a = 0; a < 16; a++) {
      const ang = (a * Math.PI) / 8, jx = Math.cos(ang), jz = Math.sin(ang);
      for (let dist = 3; dist <= 24; dist += 3) {
        const lx = ux + jx * dist, lz = uz + jz * dist, v = idxOf(lx, lz);
        if (v < 0 || done[v] === cur) continue;
        const si = world.locate(lx, lz);
        if (!world.surfaceIn(si, lx, lz, uy + 45, tmp) || (world.isVoid(si) && tmp.fof < 0)) continue;
        const landY = tmp.y, landSec = tmp.sec;
        world.surfaceInfo(landSec, info2);
        if (info2.death || info2.off) continue;
        if (world.segmentWalled(ux, uz, lx, lz)) continue;
        // so vale se ha algo a vencer: vao, ou degrau alto demais para dirigir
        const gap = hasGap(ux, uz, uy, lx, lz), ledge = landY - uy > world.stepUp * 1.5;
        if (!gap && !ledge) continue;
        const ng = gs[u] + 20 + dist * 3;
        if (stamp[v] !== cur || ng < gs[v]) {
          stamp[v] = cur; gs[v] = ng; from[v] = u; yv[v] = landY; secv[v] = landSec; jumpStamp[v] = cur; assistStamp[v] = cur; jumpDist[v] = dist;
          heap.push(ng + near(lx, lz), v);
        }
        break;
      }
    }
  };

  /** A* de (sx,sz,sy) ate qualquer candidato; devolve o caminho ou null (astar.fail guarda o diagnostico). */
  const astar = (sx, sz, sy, cands) => {
    const s = idxOf(sx, sz);
    if (s < 0 || !cands.length) return null;
    cur++;
    const heap = new Heap();
    const near = (x, z) => { let m = Infinity; for (const c of cands) { const q = Math.hypot(c.x - x, c.z - z); if (q < m) m = q; } return m; };
    const tol = opts.tol ?? 3;
    stamp[s] = cur; gs[s] = 0; from[s] = -1; yv[s] = sy; jumpStamp[s] = 0;
    { const si0 = world.locate(sx, sz); world.surfaceIn(si0, sx, sz, sy, tmp); secv[s] = tmp.sec; }
    heap.push(0, s);
    let steps = 0, bestD = Infinity, bestU = s, end = -1;
    while (heap.size && steps++ < 6e6) {
      const u = heap.pop();
      const ux = cx(u), uz = cz(u), uy = yv[u];
      let hit = false;
      for (const c of cands) if (Math.hypot(c.x - ux, c.z - uz) < tol && Math.abs(c.y - uy) < 3) { hit = true; break; }
      const dd = near(ux, uz);
      if (dd < bestD) { bestD = dd; bestU = u; }
      if (hit) { end = u; break; }
      if (done[u] === cur) continue;
      done[u] = cur;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = ux + dx * g, nz = uz + dz * g, v = idxOf(nx, nz);
        if (v < 0 || done[v] === cur) continue;
        const c = enter(ux, uz, nx, nz, uy);
        if (c < 0) { edgeCell[u] = cur; continue; }
        const ng = gs[u] + c * g * (dx && dz ? 1.4142 : 1);
        if (stamp[v] !== cur || ng < gs[v]) {
          stamp[v] = cur; gs[v] = ng; from[v] = u; yv[v] = tmp.y; secv[v] = tmp.sec; jumpStamp[v] = 0;
          heap.push(ng + near(nx, nz), v);
        }
      }
      jumpsFrom(u, cands[0].x, cands[0].z, heap, near);
      if (relaxed && edgeCell[u] === cur) assistFrom(u, heap, near);
    }
    if (end < 0) {
      const cells = [];
      if (opts.debugCells) for (let i = 0; i < W * H; i += 1) if (done[i] === cur) cells.push([cx(i), cz(i), yv[i]]);
      astar.fail = { cells, visited: steps, closest: { x: cx(bestU), z: cz(bestU), y: yv[bestU], d: bestD }, goal: cands.map((c) => ({ x: +c.x.toFixed(1), z: +c.z.toFixed(1), y: +c.y.toFixed(1) })), start: { x: sx, z: sz, y: sy } };
      return null;
    }
    const path = [];
    for (let u = end; u >= 0; u = from[u]) {
      const jumped = jumpStamp[u] === cur;
      path.push({ x: cx(u), z: cz(u), y: yv[u], jump: jumped });
      if (jumped) {
        // a mola dispara na ENTRADA do setor: o salto parte de la, nao do ponto onde o A* decolou
        let e = from[u];
        world.surfaceInfo(secv[e], info2);
        const springy = info2.spring || info2.dash;
        if (springy) while (from[e] >= 0 && secv[from[e]] === secv[e] && jumpStamp[e] !== cur) e = from[e];
        const dist = Math.hypot(cx(u) - cx(e), cz(u) - cz(e)) || jumpDist[u];
        astar.springs.push({ sec: secv[e], dist, x: cx(e), z: cz(e), dx: (cx(u) - cx(e)) / dist, dz: (cz(u) - cz(e)) / dist, y0: yv[e], y1: yv[u], spring: springy, assist: assistStamp[u] === cur });
      }
    }
    return path.reverse();
  };
  astar.springs = [];

  const goals = checkpointGoals(d, world);
  if (goals.length < 3) throw new Error('waypoints insuficientes: ' + goals.length);
  const start = d.starts[0];
  const startY = world.floorAt(start.sec, start.x, start.z) + start.zoff;
  const first = goals.find((q) => q.cands.length);
  if (!first) throw new Error('nenhum checkpoint em chao dirigivel');

  const path = [];
  const skipped = [];
  const order = goals.slice(goals.indexOf(first));
  let last = { x: first.cands[0].x, z: first.cands[0].z, y: first.cands[0].y };
  { const si = world.locate(last.x, last.z); if (world.surfaceIn(si, last.x, last.z, startY, tmp)) last.y = tmp.y; }
  const legs = [];
  let k = 1;
  while (k <= order.length) {
    // checkpoint k; se nao ha chao nele ou nao se alcanca, tenta os dois seguintes (o pulado conta como salto)
    let p = null, failDetail = null, used = 0;
    for (let skip = 0; skip < 3 && !p && k + skip <= order.length; skip++) {
      const gk = order[(k + skip) % order.length];
      if (!gk.cands.length) { skipped.push(gk.id); continue; }
      if (k + skip === order.length && Math.hypot(gk.cands[0].x - last.x, gk.cands[0].z - last.z) < 3 * g) { p = []; used = skip; break; }
      relaxed = false;
      p = astar(last.x, last.z, last.y, gk.cands);
      if (!p && opts.assist !== false) { relaxed = true; p = astar(last.x, last.z, last.y, gk.cands); relaxed = false; }
      if (!p) { failDetail = astar.fail; skipped.push(gk.id); } else used = skip;
    }
    if (!p) {
      const e = new Error(`sem caminho entre os checkpoints ${order[k - 1].id} e ${order[k % order.length].id}`);
      e.detail = failDetail;
      throw e;
    }
    if (p.length) { legs.push(p.length); path.push(...(path.length ? p.slice(1) : p)); last = p[p.length - 1]; }
    k += used + 1;
  }
  return { world, path, legs, goals, skipped, cell: g, springs: astar.springs };
}
