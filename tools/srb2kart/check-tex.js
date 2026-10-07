// Texturas/flats usados pelo mapa que nao existem nos dados do jogo (viram cinza no render): node tools/srb2kart/check-tex.js MAP01 ...
import fs from 'node:fs';
import path from 'node:path';
import { TRACKS_DIR } from './build.js';

for (const m of process.argv.slice(2)) {
  const d = JSON.parse(fs.readFileSync(path.join(TRACKS_DIR, `srb2kart-${m.toLowerCase()}.json`), 'utf8'));
  const miss = new Map();
  const add = (k, n, where) => { const key = k + ':' + n; miss.set(key, (miss.get(key) || 0) + where); };
  const used = (n) => n && n !== '-' && !n.startsWith('#') && !/^(\d+|DS\w*)$/.test(n);
  d.lines.forEach((l) => {
    for (const si of [l[9], l[10]]) {
      const sd = d.sides[si]; if (!sd) continue;
      const two = l[7] >= 0 && l[6] >= 0;
      // so as faces que de fato aparecem: meio de uma parede de um lado, e superior/inferior/meio de dois lados
      for (const k of two ? [0, 1, 2] : [2]) if (used(sd[k]) && !d.tex[sd[k]]) add('tex', sd[k], 1);
    }
  });
  d.sectors.forEach((S) => { for (const f of [S.fp, S.cp]) if (f !== 'F_SKY1' && !d.flat[f]) add('flat', f, 1); });
  d.fofs.forEach((f) => { if (f.tex && used(f.tex) && !d.tex[f.tex]) add('fof-tex', f.tex, 1); });
  const nonProp = Object.entries(d.propTypes || {}).filter(([, v]) => !v).map(([k]) => k);
  console.log(m, d.name, '\n  faltando:', [...miss].map(([k, v]) => `${k}x${v}`).join(' ') || 'nada', '\n  objetos sem sprite:', nonProp.join(' ') || 'nada');
}
