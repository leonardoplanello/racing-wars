// Gera as pistas do SRB2Kart para o jogo: public/tracks/srb2kart/<id>.json (nao versionado) + index.json.
//   node tools/srb2kart/build.js [MAP51 MAP01 ... | race | all]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Wad, mapLabels } from './wad.js';
import { readMap } from './map.js';
import { parseSoc } from './soc.js';
import { bake } from './bake.js';
import { routeThroughCheckpoints } from './nav.js';
import { centerline } from './centerline.js';
import { DEFAULT_OUT } from './extract.js';
import { Assets } from './assets.js';
import { linkLaunch } from '../../sim/mapworld.js';
import { bakeGeometry } from './geo.js';
import { encodePng } from './png.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const TRACKS_DIR = path.join(root, 'public/tracks/srb2kart');
export const TEX_DIR = path.join(TRACKS_DIR, 'tex');
const safe = (n) => n.replace(/[^A-Za-z0-9_-]/g, (c) => '~' + c.charCodeAt(0).toString(16));

export const trackId = (map) => 'srb2kart-' + map.toLowerCase();

/** Gera uma pista; devolve { d (dados), info } ou lanca erro com o motivo. */
export function buildMap(wad, soc, label, assets = null) {
  const map = readMap(wad, label.i);
  const h = soc.get(label.name);
  const d = bake(map, h);
  if (!d.starts.length) throw new Error('sem posicoes de largada');
  const route = routeThroughCheckpoints(d);
  const c = centerline(route.world, route);
  d.center = { x: c.x.map((v) => +v.toFixed(3)), z: c.z.map((v) => +v.toFixed(3)), y: c.y.map((v) => +v.toFixed(3)), hw: c.hw.map((v) => +v.toFixed(2)), air: c.air, ds: c.ds };
  // lancamentos: molas/dash pads (por setor) e elos assistidos (por ponto de decolagem), com vy e velocidade horizontal para pousar la
  d.springs = {}; d.assists = [];
  for (const sp of route.springs) {
    const L = linkLaunch(sp.dist, sp.y1 - sp.y0);
    const rec = { vy: +L.vy.toFixed(2), v: +L.v.toFixed(2), dx: +sp.dx.toFixed(3), dz: +sp.dz.toFixed(3), dist: +sp.dist.toFixed(1) };
    if (sp.assist) d.assists.push({ x: +sp.x.toFixed(2), z: +sp.z.toFixed(2), r: 2.6, ...rec });
    else if (sp.spring && !d.springs[sp.sec]) d.springs[sp.sec] = rec;
  }
  d.id = trackId(label.name);
  d.geo = bakeGeometry(map, d.scale);
  if (assets) exportTextures(d, map, assets);
  return d;
}

/** Exporta (uma vez) as texturas e flats usados pelo mapa como PNG e guarda tamanho/alfa em d.tex / d.flat; cor do ceu em d.theme. */
function exportTextures(d, map, assets) {
  fs.mkdirSync(TEX_DIR, { recursive: true });
  const put = (kind, name, img) => {
    const file = path.join(TEX_DIR, `${kind}_${safe(name)}.png`);
    let alpha = false;
    for (let i = 3; i < img.rgba.length; i += 4) if (!img.rgba[i]) { alpha = true; break; }
    if (!fs.existsSync(file)) fs.writeFileSync(file, encodePng(img.w, img.h, img.rgba));
    return { w: img.w, h: img.h, a: alpha ? 1 : 0 };
  };
  d.tex = {}; d.flat = {};
  const names = new Set();
  for (const sd of map.sides) for (const k of [sd.top, sd.bottom, sd.mid]) if (k && k !== '-' && !k.startsWith('#')) names.add(k);
  for (const n of names) { const img = assets.texture(n); if (img) d.tex[n] = put('t', n, img); }
  const flats = new Set();
  for (const c of map.sectors) { flats.add(c.floorPic); flats.add(c.ceilPic); }
  for (const f of flats) { if (f === 'F_SKY1') continue; const img = assets.flat(f); if (img) d.flat[f] = put('f', f, img); }
  // ceu: textura SKYn (cores do topo, meio e horizonte para o degrade)
  const sky = assets.texture('SKY' + d.sky);
  if (sky) {
    d.skyTex = put('t', 'SKY' + d.sky, sky);
    const row = (y) => { let r = 0, g = 0, b = 0; for (let x = 0; x < sky.w; x++) { const o = (Math.min(sky.h - 1, y) * sky.w + x) * 4; r += sky.rgba[o]; g += sky.rgba[o + 1]; b += sky.rgba[o + 2]; } return ((Math.round(r / sky.w) << 16) | (Math.round(g / sky.w) << 8) | Math.round(b / sky.w)); };
    const css = (n) => '#' + n.toString(16).padStart(6, '0');
    d.theme = { sky: [css(row(2)), css(row(sky.h >> 1)), css(row(sky.h - 3))], fog: [row(sky.h - 3), 380, 1300], exposure: 1.0 };
  }
}

function main() {
  const args = process.argv.slice(2);
  const wad = Wad.open(path.join(DEFAULT_OUT, 'maps.kart'));
  const soc = parseSoc(wad.get('SOC_MAIN').toString('latin1'));
  const labels = mapLabels(wad);
  const assets = new Assets();
  let todo;
  if (!args.length || args[0] === 'race') todo = labels.filter((m) => soc.get(m.name)?.race && /^MAP\d\d$/.test(m.name));
  else if (args[0] === 'all') todo = labels.filter((m) => soc.get(m.name)?.race);
  else todo = args.map((a) => labels.find((m) => m.name === a.toUpperCase())).filter(Boolean);
  fs.mkdirSync(TRACKS_DIR, { recursive: true });
  const indexFile = path.join(TRACKS_DIR, 'index.json');
  const index = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : { tracks: [] };
  const byId = new Map(index.tracks.map((t) => [t.id, t]));
  for (const label of todo) {
    const h = soc.get(label.name);
    const t0 = Date.now();
    try {
      const d = buildMap(wad, soc, label, assets);
      const file = `${d.id}.json`;
      fs.writeFileSync(path.join(TRACKS_DIR, file), JSON.stringify(d));
      const len = d.center.x.length * d.center.ds;
      byId.set(d.id, { id: d.id, map: label.name, name: h.name, subtitle: h.subtitle, laps: h.laps, length: Math.round(len), file, ok: true });
      console.log(`${label.name} ${h.name}: OK (${len.toFixed(0)} u, ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    } catch (e) {
      byId.set(trackId(label.name), { id: trackId(label.name), map: label.name, name: h?.name, subtitle: h?.subtitle, laps: h?.laps, ok: false, reason: e.message });
      console.log(`${label.name} ${h?.name}: FALHOU (${e.message})`);
    }
  }
  const tracks = [...byId.values()].sort((a, b) => a.map.localeCompare(b.map));
  fs.writeFileSync(indexFile, JSON.stringify({ tracks }, null, 1));
  console.log(`${tracks.filter((t) => t.ok).length}/${tracks.length} pistas prontas em ${TRACKS_DIR}`);
}

if (process.argv[1]?.endsWith('build.js')) main();
