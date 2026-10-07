// Confere a linha central de cada pista pronta contra o mapa: quantos pontos (fora dos trechos de salto) caem sobre vazio/morte
// ou num nivel diferente do y gravado. Uma linha central ruim faz o respawn renascer no vazio (loop de queda).
//   node tools/srb2kart/check-center.js [srb2kart-map23 ...]
import fs from 'node:fs';
import path from 'node:path';
import { MapWorld } from '../../sim/mapworld.js';
import { TRACKS_DIR } from './build.js';

/** Metricas da linha central de `d` (dados baked da pista). */
export function checkCenter(d) {
  const w = new MapWorld(d), c = d.center, n = c.x.length;
  const tmp = { y: 0, sec: 0, fof: -1, nx: 0, ny: 1, nz: 0 }, info = { off: 0, death: false };
  let bad = 0, level = 0, narrow = 0, ground = 0;
  for (let i = 0; i < n; i++) {
    if (c.air[i]) continue;
    ground++;
    const si = w.locate(c.x[i], c.z[i]);
    const ok = w.surfaceIn(si, c.x[i], c.z[i], c.y[i] + 0.05, tmp) && !(w.isVoid(si) && tmp.fof < 0);
    w.surfaceInfo(tmp.sec, info);
    if (!ok || info.death) { bad++; continue; }
    if (Math.abs(tmp.y - c.y[i]) > 1.5) level++; // o y gravado nao e o de uma superficie real aqui
    if (c.hw[i] <= 2.01) narrow++;
  }
  return { n, ground, bad, badPct: ground ? (100 * bad) / ground : 0, level, levelPct: ground ? (100 * level) / ground : 0, narrow };
}

function main() {
  const index = JSON.parse(fs.readFileSync(path.join(TRACKS_DIR, 'index.json'), 'utf8'));
  const want = process.argv.slice(2);
  for (const t of index.tracks) {
    if (!t.ok || (want.length && !want.includes(t.id))) continue;
    const d = JSON.parse(fs.readFileSync(path.join(TRACKS_DIR, t.file), 'utf8'));
    const r = checkCenter(d);
    console.log(`${t.map.padEnd(6)} ${(t.name || '').padEnd(22)} vazio/morte=${r.badPct.toFixed(1).padStart(5)}%  nivel errado=${r.levelPct.toFixed(1).padStart(5)}%  hw<=2: ${r.narrow}  ${t.playable ? 'jogavel' : ''}`);
  }
}

if (process.argv[1]?.endsWith('check-center.js')) main();
