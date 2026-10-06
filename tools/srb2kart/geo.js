// Geometria para desenhar: vertices do mapa em coordenadas do jogo e triangulos de cada setor (indices de vertice).
// As alturas (piso/teto/rampas/FOFs) e as texturas ficam em `bake`; o navegador monta as malhas a partir disso.
import { resolveLines } from './map.js';
import { sectorLoops, triangulateSector } from './geom.js';

export function bakeGeometry(map, scale) {
  const lines = resolveLines(map);
  const loops = sectorLoops(map, lines);
  const tri = {};
  let count = 0;
  for (const [s, ls] of loops) {
    const t = triangulateSector(ls, map.verts);
    if (!t.length) continue;
    tri[s] = t.flat();
    count += t.length;
  }
  const v = [];
  for (const p of map.verts) v.push(+(p.x * scale).toFixed(3), +(-p.y * scale).toFixed(3));
  return { v, tri, count };
}
