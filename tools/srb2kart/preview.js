// Previa 2D (SVG) de um mapa para conferir o importador: setores coloridos pelo tipo, waypoints, largadas, caixas.
//   node tools/srb2kart/preview.js MAP51 [saida.svg]
import fs from 'node:fs';
import path from 'node:path';
import { Wad, mapLabels } from './wad.js';
import { readMap, resolveLines } from './map.js';
import { sectorLoops, triangulateSector } from './geom.js';
import { DEFAULT_OUT } from './extract.js';

const name = (process.argv[2] || 'MAP51').toUpperCase();
const wad = Wad.open(path.join(DEFAULT_OUT, 'maps.kart'));
const label = mapLabels(wad).find((m) => m.name === name);
if (!label) throw new Error('mapa nao encontrado: ' + name);
const map = readMap(wad, label.i);
const lines = resolveLines(map);
const loops = sectorLoops(map, lines);
const V = map.verts;

const sec = (s) => map.sectors[s];
const color = (s) => {
  const c = sec(s), sp = c.special;
  if (c.floorPic === 'F_SKY1') return null; // sem piso: vazio
  const s1 = sp & 15, s4 = (sp >> 12) & 15;
  if (s4 === 10) return '#ffffff'; // linha de chegada
  if (s4 === 6) return '#ffd60a'; // sneaker panel
  if (s1 >= 2 && s1 <= 4) return ['#7a6a3a', '#6a5a2a', '#5a4a1a'][s1 - 2]; // fora de pista
  if (s1 === 6 || s1 === 7 || s1 === 8 || c.floorPic === 'PIT') return '#d03030'; // buraco
  const h = Math.max(0, Math.min(1, (c.floor + 1000) / 3000));
  const g = Math.round(70 + h * 150);
  return `rgb(${g},${g},${g + 20})`;
};

let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
for (const v of V) { minx = Math.min(minx, v.x); maxx = Math.max(maxx, v.x); miny = Math.min(miny, v.y); maxy = Math.max(maxy, v.y); }
const W = 1600, sc = W / (maxx - minx), H = Math.round((maxy - miny) * sc);
const X = (x) => ((x - minx) * sc).toFixed(1), Y = (y) => ((maxy - y) * sc).toFixed(1);
const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#101820"/>`];
let tris = 0, bad = 0;
for (const [s, ls] of loops) {
  const col = color(s);
  if (!col) continue;
  const t = triangulateSector(ls, V);
  if (!t.length) bad++;
  tris += t.length;
  out.push(`<path fill="${col}" d="${t.map((f) => `M${X(V[f[0]].x)} ${Y(V[f[0]].y)}L${X(V[f[1]].x)} ${Y(V[f[1]].y)}L${X(V[f[2]].x)} ${Y(V[f[2]].y)}Z`).join('')}"/>`);
}
for (const l of lines) {
  if (l.front < 0 || l.back >= 0) continue;
  out.push(`<line x1="${X(V[l.v1].x)}" y1="${Y(V[l.v1].y)}" x2="${X(V[l.v2].x)}" y2="${Y(V[l.v2].y)}" stroke="#000" stroke-width="1"/>`);
}
const wps = map.things.filter((t) => t.type === 292).sort((a, b) => a.angle - b.angle);
wps.forEach((t) => out.push(`<circle cx="${X(t.x)}" cy="${Y(t.y)}" r="5" fill="#0af"/><text x="${X(t.x)}" y="${Y(t.y)}" fill="#fff" font-size="11">${t.angle}</text>`));
for (const t of map.things) {
  if (t.type === 2000) out.push(`<rect x="${X(t.x) - 3}" y="${Y(t.y) - 3}" width="6" height="6" fill="#f0f"/>`);
  else if (t.type === 502) out.push(`<circle cx="${X(t.x)}" cy="${Y(t.y)}" r="3" fill="#f80"/>`);
  else if (t.type >= 1 && t.type <= 16) {
    const a = (t.angle * Math.PI) / 180;
    out.push(`<line x1="${X(t.x)}" y1="${Y(t.y)}" x2="${X(t.x + Math.cos(a) * 80)}" y2="${Y(t.y + Math.sin(a) * 80)}" stroke="#0f0" stroke-width="2"/><circle cx="${X(t.x)}" cy="${Y(t.y)}" r="3" fill="#0f0"/>`);
  }
}
const routeFile = path.join(DEFAULT_OUT, `route-${name}.json`);
if (fs.existsSync(routeFile)) {
  const r = JSON.parse(fs.readFileSync(routeFile, 'utf8'));
  const pts = r.path.map(([x, z]) => `${X(x / r.scale)},${Y(-z / r.scale)}`).join(' ');
  out.push(`<polyline points="${pts}" fill="none" stroke="#ff2d95" stroke-width="3" stroke-linejoin="round"/>`);
}
if (fs.existsSync(path.join(DEFAULT_OUT, `center-${name}.json`))) {
  const r = JSON.parse(fs.readFileSync(path.join(DEFAULT_OUT, `center-${name}.json`), 'utf8'));
  const pts = r.pts.map(([x, z]) => `${X(x / r.scale)},${Y(-z / r.scale)}`).join(' ');
  out.push(`<polyline points="${pts}" fill="none" stroke="#35ff6a" stroke-width="2"/>`);
}
out.push('</svg>');
const file = process.argv[3] || path.join(DEFAULT_OUT, `preview-${name}.svg`);
fs.writeFileSync(file, out.join('\n'));
console.log(`${name}: ${loops.size} setores com contorno, ${tris} triangulos, ${bad} sem triangulos; ${file}`);
