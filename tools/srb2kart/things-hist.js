// Histograma de tipos de thing (doomednum) de mapas do SRB2Kart: node tools/srb2kart/things-hist.js MAP01 MAP08 ...
import path from 'node:path';
import { Wad, mapLabels } from './wad.js';
import { readMap } from './map.js';
import { DEFAULT_OUT } from './extract.js';

const wad = Wad.open(path.join(DEFAULT_OUT, 'maps.kart'));
const labels = mapLabels(wad);
const want = process.argv.slice(2);
for (const l of labels) {
  if (want.length && !want.includes(l.name)) continue;
  const m = readMap(wad, l.i), h = new Map();
  for (const t of m.things) h.set(t.type, (h.get(t.type) || 0) + 1);
  console.log(l.name, [...h].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' '));
}
