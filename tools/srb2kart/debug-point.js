// Inspeciona um ponto de um mapa: node tools/srb2kart/debug-point.js MAP54 200 35 [raio]
import path from 'node:path';
import { Wad, mapLabels } from './wad.js';
import { readMap } from './map.js';
import { parseSoc } from './soc.js';
import { bake } from './bake.js';
import { MapWorld } from '../../sim/mapworld.js';
import { DEFAULT_OUT } from './extract.js';

const [name, xs, zs, rs = '6'] = process.argv.slice(2);
const x = Number(xs), z = Number(zs), r = Number(rs);
const wad = Wad.open(path.join(DEFAULT_OUT, 'maps.kart'));
const soc = parseSoc(wad.get('SOC_MAIN').toString('latin1'));
const map = readMap(wad, mapLabels(wad).find((m) => m.name === name.toUpperCase()).i);
const d = bake(map, soc.get(name.toUpperCase()));
const w = new MapWorld(d);
const si = w.locate(x, z), S = d.sectors[si];
console.log(`ponto (${x},${z}) setor ${si} piso=${S.f.toFixed(2)} (${S.fp}) teto=${S.c.toFixed(2)} sp=${S.sp} fofs=${S.fofs.length}`);
w.forLines(x, z, r, (i, l) => {
  const A = l[6] >= 0 ? d.sectors[l[6]] : null, B = l[7] >= 0 ? d.sectors[l[7]] : null;
  console.log(`linha ${i} (${l[0].toFixed(1)},${l[1].toFixed(1)})->(${l[2].toFixed(1)},${l[3].toFixed(1)}) flags=${l[4]} sp=${l[5]} tag=${l[8]} frente=${l[6]}${A ? ` f=${A.f.toFixed(2)} c=${A.c.toFixed(2)} sp=${A.sp} ${A.fp}` : ''} tras=${l[7]}${B ? ` f=${B.f.toFixed(2)} c=${B.c.toFixed(2)} sp=${B.sp} ${B.fp}` : ''}`);
});
