// Testa o A* entre os checkpoints de um mapa: node tools/srb2kart/route-test.js MAP51  (grava route-MAPxx.json para a previa)
import fs from 'node:fs';
import path from 'node:path';
import { Wad, mapLabels } from './wad.js';
import { readMap } from './map.js';
import { parseSoc } from './soc.js';
import { bake } from './bake.js';
import { routeThroughCheckpoints } from './nav.js';
import { centerline } from './centerline.js';
import { DEFAULT_OUT } from './extract.js';

const name = (process.argv[2] || 'MAP51').toUpperCase();
const wad = Wad.open(path.join(DEFAULT_OUT, 'maps.kart'));
const soc = parseSoc(wad.get('SOC_MAIN').toString('latin1'));
const map = readMap(wad, mapLabels(wad).find((m) => m.name === name).i);
const d = bake(map, soc.get(name));
const t0 = Date.now();
let r;
try { r = routeThroughCheckpoints(d); } catch (e) { console.log(name, e.message); console.log(JSON.stringify(e.detail, (k, v) => (typeof v === 'number' ? +v.toFixed(2) : v))); process.exit(1); }
let len = 0;
for (let i = 1; i < r.path.length; i++) len += Math.hypot(r.path[i].x - r.path[i - 1].x, r.path[i].z - r.path[i - 1].z);
console.log(`${name}: ${r.goals.length} checkpoints, ${r.path.length} pontos, comprimento ${len.toFixed(0)} u (${(len / 34).toFixed(0)} s a 34 u/s), ${Date.now() - t0} ms`);
fs.writeFileSync(path.join(DEFAULT_OUT, `route-${name}.json`), JSON.stringify({ scale: d.scale, path: r.path.map((p) => [p.x, p.z, p.y]) }));
const t1 = Date.now();
const c = centerline(r.world, r);
const hws = c.hw.slice().sort((a, b) => a - b);
console.log(`linha central: ${c.n} amostras, meia largura min/med/max = ${hws[0].toFixed(1)}/${hws[hws.length >> 1].toFixed(1)}/${hws[hws.length - 1].toFixed(1)} u, ${Date.now() - t1} ms`);
fs.writeFileSync(path.join(DEFAULT_OUT, `center-${name}.json`), JSON.stringify({ scale: d.scale, pts: c.x.map((x, i) => [x, c.z[i]]) }));
