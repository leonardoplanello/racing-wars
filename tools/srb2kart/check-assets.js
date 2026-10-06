// Confere quantas texturas/flats de um mapa o decodificador acha: node tools/srb2kart/check-assets.js MAP51 MAP01
import { Assets } from './assets.js';
import { Wad, mapLabels } from './wad.js';
import { readMap } from './map.js';
import { DEFAULT_OUT } from './extract.js';
import path from 'node:path';

const t0 = Date.now();
const A = new Assets();
console.log('assets', A.patchLump.size, 'patches', A.flatLump.size, 'flats', A.defs.size, 'composites', (Date.now() - t0) + 'ms');
const wad = Wad.open(path.join(DEFAULT_OUT, 'maps.kart'));
for (const n of process.argv.slice(2)) {
  const m = readMap(wad, mapLabels(wad).find((x) => x.name === n.toUpperCase()).i);
  const tex = new Set(), flats = new Set();
  for (const s of m.sides) for (const k of [s.top, s.bottom, s.mid]) if (k && k !== '-' && !k.startsWith('#')) tex.add(k);
  for (const c of m.sectors) { flats.add(c.floorPic); flats.add(c.ceilPic); }
  const missT = [], missF = [];
  let bytes = 0;
  for (const t of tex) { const i = A.texture(t); if (!i) missT.push(t); else bytes += i.rgba.length; }
  for (const f of flats) { if (f === 'F_SKY1') continue; const i = A.flat(f); if (!i) missF.push(f); else bytes += i.rgba.length; }
  console.log(n, 'texturas', tex.size, 'faltando', missT.length, missT.slice(0, 10).join(','), '| flats', flats.size, 'faltando', missF.length, missF.slice(0, 10).join(','), '| RGBA', (bytes / 1e6).toFixed(1) + 'MB');
}
