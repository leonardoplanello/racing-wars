// Geometria dos setores: reconstroi os contornos (com buracos) a partir dos linedefs/sidedefs e triangula.
// Convencao Doom: a frente do linedef (side0) fica a DIREITA de v1->v2. Entao, para o setor S, o contorno e feito
// das arestas v1->v2 dos linedefs cuja frente e S e v2->v1 dos que tem S atras: S fica sempre a direita de cada
// aresta orientada (sentido horario com y para cima = area com sinal negativa; buracos = anti-horario).
import { ShapeUtils, Vector2 } from 'three';

/** Contornos fechados de cada setor: Map setor -> [[idx vertices...], ...]. Linedefs com o mesmo setor dos dois lados nao contam. */
export function sectorLoops(map, lines) {
  const bySector = new Map();
  const add = (s, a, b) => {
    if (s < 0) return;
    let arr = bySector.get(s);
    if (!arr) bySector.set(s, (arr = []));
    arr.push([a, b]);
  };
  for (const l of lines) {
    if (l.front === l.back) continue;
    if (l.front >= 0) add(l.front, l.v1, l.v2);
    if (l.back >= 0) add(l.back, l.v2, l.v1);
  }
  const V = map.verts;
  const out = new Map();
  for (const [s, edges] of bySector) {
    // arestas que saem de cada vertice
    const outs = new Map();
    edges.forEach((e, i) => { (outs.get(e[0]) || outs.set(e[0], []).get(e[0])).push(i); });
    const used = new Uint8Array(edges.length);
    const loops = [];
    for (let i = 0; i < edges.length; i++) {
      if (used[i]) continue;
      const loop = [];
      let cur = i, guard = 0;
      while (!used[cur] && guard++ < edges.length + 2) {
        used[cur] = 1;
        const [a, b] = edges[cur];
        loop.push(a);
        const cand = (outs.get(b) || []).filter((k) => !used[k] || k === i);
        if (!cand.length) { cur = -1; break; }
        if (cand.length === 1) { cur = cand[0]; if (cur === i) break; continue; }
        // varios candidatos: a curva mais a direita (menor angulo anti-horario a partir da volta pelo caminho de chegada)
        const rho = Math.atan2(V[a].y - V[b].y, V[a].x - V[b].x);
        let best = -1, bestA = 1e9;
        for (const k of cand) {
          const c = edges[k][1];
          let d = Math.atan2(V[c].y - V[b].y, V[c].x - V[b].x) - rho;
          while (d <= 1e-9) d += Math.PI * 2;
          if (d < bestA) { bestA = d; best = k; }
        }
        cur = best;
        if (cur === i) break;
      }
      if (loop.length >= 3 && cur === i) loops.push(loop);
    }
    out.set(s, loops);
  }
  return out;
}

const area = (loop, V) => {
  let a = 0;
  for (let i = 0; i < loop.length; i++) {
    const p = V[loop[i]], q = V[loop[(i + 1) % loop.length]];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
};

const inside = (pt, loop, V) => {
  let c = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const a = V[loop[i]], b = V[loop[j]];
    if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
};

/**
 * Triangula o setor: devolve [{ tris: [[v,v,v]...] }] com indices de vertices do mapa. Contornos horarios (area < 0) sao
 * externos, anti-horarios sao buracos do menor externo que os contem.
 */
export function triangulateSector(loops, V) {
  const outers = [], holes = [];
  for (const l of loops) (area(l, V) < 0 ? outers : holes).push(l);
  const polys = outers.map((o) => ({ outer: o, holes: [] }));
  for (const h of holes) {
    const p = V[h[0]];
    let best = null, bestA = Infinity;
    for (const poly of polys) {
      if (inside(p, poly.outer, V)) { const a = Math.abs(area(poly.outer, V)); if (a < bestA) { bestA = a; best = poly; } }
    }
    if (best) best.holes.push(h);
  }
  const tris = [];
  for (const poly of polys) {
    const ids = [...poly.outer, ...poly.holes.flat()];
    const pts = (l) => l.map((i) => new Vector2(V[i].x, V[i].y));
    const faces = ShapeUtils.triangulateShape(pts(poly.outer), poly.holes.map(pts));
    for (const f of faces) tris.push([ids[f[0]], ids[f[1]], ids[f[2]]]);
  }
  return tris;
}
