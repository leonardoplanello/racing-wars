// Confere o bake: a BSP deve dar o mesmo setor que o teste de ponto-em-poligono; mostra largadas, rampas e FOFs.
//   node tools/srb2kart/check-bake.js MAP51
import path from 'node:path';
import { Wad, mapLabels } from './wad.js';
import { readMap, resolveLines } from './map.js';
import { parseSoc } from './soc.js';
import { sectorLoops } from './geom.js';
import { bake } from './bake.js';
import { DEFAULT_OUT } from './extract.js';

const name = (process.argv[2] || 'MAP51').toUpperCase();
const wad = Wad.open(path.join(DEFAULT_OUT, 'maps.kart'));
const soc = parseSoc(wad.get('SOC_MAIN').toString('latin1'));
const label = mapLabels(wad).find((m) => m.name === name);
const map = readMap(wad, label.i);
const b = bake(map, soc.get(name));
const loops = sectorLoops(map, resolveLines(map));
const V = map.verts;

const inside = (px, py, loop) => {
  let c = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const a = V[loop[i]], d = V[loop[j]];
    if ((a.y > py) !== (d.y > py) && px < ((d.x - a.x) * (py - a.y)) / (d.y - a.y) + a.x) c = !c;
  }
  return c;
};
// ponto-em-setor por poligono (paridade par-impar sobre todos os contornos do setor)
const polySector = (px, py) => {
  for (const [s, ls] of loops) { let n = 0; for (const l of ls) if (inside(px, py, l)) n++; if (n % 2 === 1) return s; }
  return -1;
};
const locate = (mx, my) => {
  // mesma consulta da bake, refeita aqui a partir dos dados baked (como o motor faz)
  const s = b.scale, N = b.nodes;
  let n = N.length / 6 - 1;
  for (let g = 0; g < 64; g++) {
    const o = n * 6, dx = mx - N[o], dy = my - N[o + 1];
    const child = dy * N[o + 2] < N[o + 3] * dx ? N[o + 4] : N[o + 5];
    if (child & 0x8000) return b.subSector[child & 0x7fff];
    n = child;
  }
  return -1;
};
let ok = 0, bad = 0, unk = 0;
let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
for (const v of V) { minx = Math.min(minx, v.x); maxx = Math.max(maxx, v.x); miny = Math.min(miny, v.y); maxy = Math.max(maxy, v.y); }
for (let i = 0; i < 4000; i++) {
  const mx = minx + rnd() * (maxx - minx), my = miny + rnd() * (maxy - miny);
  const a = polySector(mx, my), c = locate(mx, my);
  if (a < 0) { unk++; continue; }
  if (a === c) ok++; else bad++;
}
console.log(`${name}: BSP x poligono: ${ok} iguais, ${bad} diferentes, ${unk} fora de qualquer contorno`);
const sl = b.sectors.filter((x) => x.fs || x.cs).length;
console.log(`setores=${b.sectors.length} com rampa=${sl} fofs=${b.fofs.length} (${['solid', 'water', 'intangible', 'reverse'].map((k) => k + ':' + b.fofs.filter((f) => f.kind === k).length).join(' ')}) linhas=${b.lines.length}`);
console.log('largadas:', b.starts.slice(0, 3).map((t) => `#${t.n} (${t.x.toFixed(1)},${t.z.toFixed(1)}) h=${t.h.toFixed(2)} setor=${t.sec} piso=${b.sectors[t.sec].f.toFixed(2)} ${b.sectors[t.sec].fp}`).join(' | '));
