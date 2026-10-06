// Janela do mapa em SVG para depuracao: node tools/srb2kart/window.js srb2kart-map55 140 140 40
// Linhas: vermelha = parede de um lado, magenta = IMPASSIVEL, laranja = degrau (altura mostrada), cinza = passagem; verde = linha central.
import fs from 'node:fs';
import path from 'node:path';
import { TRACKS_DIR } from './build.js';

const [id, xs, zs, rs = '40'] = process.argv.slice(2);
const x = Number(xs), z = Number(zs), r = Number(rs);
const d = JSON.parse(fs.readFileSync(path.join(TRACKS_DIR, `${id}.json`), 'utf8'));
const S = 900 / (2 * r);
const X = (a) => ((a - (x - r)) * S).toFixed(1), Z = (a) => ((a - (z - r)) * S).toFixed(1);
const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 900" width="900" height="900"><rect width="100%" height="100%" fill="#101820"/>`];
const near = (l) => Math.min(l[0], l[2]) < x + r && Math.max(l[0], l[2]) > x - r && Math.min(l[1], l[3]) < z + r && Math.max(l[1], l[3]) > z - r;
const secs = new Set();
for (const l of d.lines) {
  if (!near(l)) continue;
  if (l[6] === l[7]) continue;
  const A = l[6] >= 0 ? d.sectors[l[6]] : null, B = l[7] >= 0 ? d.sectors[l[7]] : null;
  let col = '#566', w = 1, label = '';
  if (!A || !B) { col = '#f44'; w = 2.5; } else if (l[4] & 1) { col = '#f0f'; w = 2.5; } else if (Math.abs(A.f - B.f) > d.stepUp) { col = '#fa0'; w = 2; label = Math.abs(A.f - B.f).toFixed(1); }
  out.push(`<line x1="${X(l[0])}" y1="${Z(l[1])}" x2="${X(l[2])}" y2="${Z(l[3])}" stroke="${col}" stroke-width="${w}"/>`);
  if (label) out.push(`<text x="${X((l[0] + l[2]) / 2)}" y="${Z((l[1] + l[3]) / 2)}" fill="#fa0" font-size="11">${label}</text>`);
  if (l[6] >= 0) secs.add(l[6]); if (l[7] >= 0) secs.add(l[7]);
}
// rotulo dos setores: piso, FOFs (topo) e special, no centroide aproximado das linhas
const cen = new Map();
for (const l of d.lines) { if (!near(l)) continue; for (const si of [l[6], l[7]]) if (si >= 0) { const c = cen.get(si) || { x: 0, z: 0, n: 0 }; c.x += (l[0] + l[2]) / 2; c.z += (l[1] + l[3]) / 2; c.n++; cen.set(si, c); } }
for (const [si, c] of cen) {
  const q = d.sectors[si];
  const tops = q.fofs.map((fi) => d.fofs[fi]).filter((f) => f.kind === 'solid').map((f) => (typeof f.t === 'number' ? f.t : f.t[2]).toFixed(1));
  out.push(`<text x="${X(c.x / c.n)}" y="${Z(c.z / c.n)}" fill="#9cf" font-size="11" text-anchor="middle">s${si} f=${q.f.toFixed(1)}${q.sp ? ' sp' + q.sp : ''}${tops.length ? ' F:' + tops.join('/') : ''}</text>`);
}
const c = d.center;
out.push(`<polyline fill="none" stroke="#3f6" stroke-width="2" points="${c.x.map((a, i) => `${X(a)},${Z(c.z[i])}`).join(' ')}"/>`);
for (const a of d.assists || []) out.push(`<circle cx="${X(a.x)}" cy="${Z(a.z)}" r="${a.r * S}" fill="none" stroke="#0ff"/>`);
for (const w of d.waypoints) out.push(`<circle cx="${X(w.x)}" cy="${Z(w.z)}" r="4" fill="#4af"/><text x="${X(w.x)}" y="${Z(w.z)}" fill="#fff" font-size="10">${w.angle}</text>`);
out.push(`<circle cx="${X(x)}" cy="${Z(z)}" r="5" fill="#ff0"/></svg>`);
fs.mkdirSync(path.join(TRACKS_DIR, 'diag'), { recursive: true });
fs.writeFileSync(path.join(TRACKS_DIR, 'diag', `win-${id}.svg`), out.join(String.fromCharCode(10)));
console.log('ok');
