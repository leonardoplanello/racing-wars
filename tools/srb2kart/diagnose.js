// Diagnostico das pistas que o A* nao completa (nao grava nada): node tools/srb2kart/diagnose.js [MAP06 MAP10 ... | failing]
import fs from 'node:fs';
import path from 'node:path';
import { Wad, mapLabels } from './wad.js';
import { readMap } from './map.js';
import { parseSoc } from './soc.js';
import { bake } from './bake.js';
import { routeThroughCheckpoints } from './nav.js';
import { DEFAULT_OUT } from './extract.js';
import { TRACKS_DIR } from './build.js';

const wad = Wad.open(path.join(DEFAULT_OUT, 'maps.kart'));
const soc = parseSoc(wad.get('SOC_MAIN').toString('latin1'));
let names = process.argv.slice(2);
if (!names.length || names[0] === 'failing') {
  const idx = JSON.parse(fs.readFileSync(path.join(TRACKS_DIR, 'index.json'), 'utf8'));
  names = idx.tracks.filter((t) => !t.ok).map((t) => t.map);
}
for (const n of names) {
  const m = readMap(wad, mapLabels(wad).find((x) => x.name === n.toUpperCase()).i);
  const d = bake(m, soc.get(n.toUpperCase()));
  try {
    const r = routeThroughCheckpoints(d, { debugCells: !!process.env.SVG });
    console.log(n, 'OK', r.path.length, 'pontos', r.skipped.length ? 'pulados ' + r.skipped.join(',') : '');
  } catch (e) {
    const f = e.detail;
    if (!f) { console.log(n, e.message); continue; }
    const c = f.closest, g0 = f.goal[0];
    if (process.env.SVG && f.cells?.length) {
      // SVG: contorno do mapa (linhas), celulas alcancadas (cor = altura), objetivo (vermelho) e inicio (verde)
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (const l of d.lines) { x0 = Math.min(x0, l[0], l[2]); x1 = Math.max(x1, l[0], l[2]); z0 = Math.min(z0, l[1], l[3]); z1 = Math.max(z1, l[1], l[3]); }
      const Wd = 1600, k = Wd / (x1 - x0), Hd = Math.round((z1 - z0) * k);
      const X = (x) => ((x - x0) * k).toFixed(1), Z = (z) => ((z - z0) * k).toFixed(1);
      const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Wd} ${Hd}" width="${Wd}" height="${Hd}"><rect width="100%" height="100%" fill="#101820"/>`];
      for (const l of d.lines.filter((q) => q[7] < 0 || (q[4] & 1))) out.push(`<line x1="${X(l[0])}" y1="${Z(l[1])}" x2="${X(l[2])}" y2="${Z(l[3])}" stroke="${l[7] < 0 || (l[4] & 1) ? '#7a8' : '#345'}" stroke-width="1"/>`);
      const sz = Math.max(3, 6 * k);
      for (const [x, z, y] of f.cells.filter((_, i) => i % 6 === 0)) out.push(`<rect x="${X(x)}" y="${Z(z)}" width="${sz}" height="${sz}" fill="hsl(${Math.max(0, Math.min(300, 120 + y * 2))},80%,55%)" opacity="0.7"/>`);
      for (const q of f.goal) out.push(`<circle cx="${X(q.x)}" cy="${Z(q.z)}" r="6" fill="#f22"/>`);
      out.push(`<circle cx="${X(f.start.x)}" cy="${Z(f.start.z)}" r="6" fill="#2f2"/></svg>`);
      fs.mkdirSync(path.join(TRACKS_DIR, 'diag'), { recursive: true });
      fs.writeFileSync(path.join(TRACKS_DIR, 'diag', `${n.toUpperCase()}.svg`), out.join(String.fromCharCode(10)));
    }
    console.log(n, e.message.replace('sem caminho entre os checkpoints', 'cp'), `| alcancou d=${c.d.toFixed(0)} dy=${(g0.y - c.y).toFixed(0)} (y ${c.y.toFixed(0)} -> ${g0.y.toFixed(0)}) cands=${f.goal.length} visitados=${f.visited}`);
  }
}
