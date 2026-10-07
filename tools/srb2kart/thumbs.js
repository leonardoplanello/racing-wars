// Gera a miniatura (SVG do traçado) de cada pista pronta e grava `thumb` no index.json.
//   node tools/srb2kart/thumbs.js
import fs from 'node:fs';
import path from 'node:path';
import { thumbSvg } from '../../shared/thumb.js';
import { TRACKS_DIR } from './build.js';

export function writeThumbs() {
  const file = path.join(TRACKS_DIR, 'index.json');
  const index = JSON.parse(fs.readFileSync(file, 'utf8'));
  const dir = path.join(TRACKS_DIR, 'thumb');
  fs.mkdirSync(dir, { recursive: true });
  let n = 0;
  for (const t of index.tracks) {
    if (!t.ok) continue;
    const d = JSON.parse(fs.readFileSync(path.join(TRACKS_DIR, t.file), 'utf8'));
    const pts = d.center.x.map((x, i) => [x, d.center.z[i]]);
    fs.writeFileSync(path.join(dir, `${t.id}.svg`), thumbSvg(pts));
    t.thumb = `thumb/${t.id}.svg`;
    n++;
  }
  fs.writeFileSync(file, JSON.stringify(index, null, 1));
  return n;
}

if (process.argv[1]?.endsWith('thumbs.js')) console.log(`${writeThumbs()} miniaturas gravadas`);
