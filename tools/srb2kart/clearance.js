// Folga da linha central ate as paredes (as mesmas que o carro enfrenta): node tools/srb2kart/clearance.js srb2kart-map51 ...
import fs from 'node:fs';
import path from 'node:path';
import { MapWorld } from '../../sim/mapworld.js';
import { TRACKS_DIR } from './build.js';

export function clearance(d, world, R = 1.6) {
  const c = d.center, n = c.x.length, out = new Float32Array(n);
  const tmp = { y: 0, sec: 0, fof: -1, nx: 0, ny: 1, nz: 0 };
  for (let i = 0; i < n; i++) {
    let m = 99;
    const x = c.x[i], z = c.z[i], y = c.y[i] + 0.05;
    world.forLines(x, z, R, (li, l) => {
      const ex = l[2] - l[0], ez = l[3] - l[1], len2 = ex * ex + ez * ez;
      let t = len2 > 0 ? ((x - l[0]) * ex + (z - l[1]) * ez) / len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = l[0] + ex * t, pz = l[1] + ez * t, dist = Math.hypot(px - x, pz - z);
      if (dist >= m) return;
      let block = l[6] < 0 || l[7] < 0 || (l[4] & 1) !== 0;
      if (!block) {
        const cross = ex * (z - l[1]) - ez * (x - l[0]);
        const near = cross > 0 ? l[6] : l[7];
        block = !world.surfaceIn(near === l[6] ? l[7] : l[6], px, pz, y, tmp);
      }
      if (block) m = dist;
    });
    out[i] = m;
  }
  return out;
}

if (process.argv[1]?.endsWith('clearance.js')) {
  for (const id of process.argv.slice(2)) {
    const d = JSON.parse(fs.readFileSync(path.join(TRACKS_DIR, `${id}.json`), 'utf8'));
    const cl = clearance(d, new MapWorld(d));
    const n = cl.length, tight = [...cl].filter((v) => v < 1.4).length, air = d.center.air.reduce((a, b) => a + b, 0);
    console.log(`${id}: ${n} amostras, ${(100 * tight / n).toFixed(1)}% com folga < 1,4 u, ar=${air}`);
  }
}
