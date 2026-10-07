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
import { Assets, bleedAlpha } from './assets.js';
import { linkLaunch } from '../../sim/mapworld.js';
import { bakeGeometry } from './geo.js';
import { encodePng } from './png.js';
import { parseInfo, spawnFrames } from './objects.js';

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
  // pistas com vaos largos so fecham com saltos longos: tenta alcances cada vez maiores e fica com o primeiro que gera
  let route = null, err = null;
  for (const jumpMax of [60, 140, 240]) {
    try { route = routeThroughCheckpoints(d, { jumpMax }); d.jumpMax = jumpMax; break; } catch (e) { err = err || e; }
  }
  if (!route) throw err;
  const c = centerline(route.world, route);
  d.center = { x: c.x.map((v) => +v.toFixed(3)), z: c.z.map((v) => +v.toFixed(3)), y: c.y.map((v) => +v.toFixed(3)), hw: c.hw.map((v) => +v.toFixed(2)), air: c.air, ds: c.ds };
  // lancamentos: molas/dash pads (por setor) e elos assistidos (por ponto de decolagem), com vy e velocidade horizontal para pousar la
  d.springs = {}; d.assists = [];
  for (const sp of route.springs) {
    const L = linkLaunch(sp.dist, sp.y1 - sp.y0);
    const rec = { vy: +L.vy.toFixed(2), v: +L.v.toFixed(2), dx: +sp.dx.toFixed(3), dz: +sp.dz.toFixed(3), dist: +sp.dist.toFixed(1) };
    // saltos de rampa (labio) tambem viram elos assistidos: sem eles o carro bate no degrau do pe da rampa em vez de decolar
    if (sp.assist || !sp.spring) d.assists.push({ x: +sp.x.toFixed(2), z: +sp.z.toFixed(2), r: 2.6, ...rec });
    else if (!d.springs[sp.sec]) d.springs[sp.sec] = rec;
  }
  // cada assist guarda em que ponto da pista ele esta (fracao da volta): pistas que se cruzam tem outra perna passando pelo mesmo
  // lugar em outro sentido, e o gatilho nao pode disparar para quem esta nela
  {
    const n = d.center.x.length;
    for (const a of d.assists) {
      let best = -1, bd = 1e9;
      for (let i = 0; i < n; i++) {
        const j = (i + 3) % n, tx = d.center.x[j] - d.center.x[i], tz = d.center.z[j] - d.center.z[i], tl = Math.hypot(tx, tz) || 1;
        if ((tx * a.dx + tz * a.dz) / tl < 0.3) continue;
        const dd = Math.hypot(d.center.x[i] - a.x, d.center.z[i] - a.z);
        if (dd < bd) { bd = dd; best = i; }
      }
      if (best >= 0) a.f = +(best / n).toFixed(5);
    }
  }
  d.id = trackId(label.name);
  d.geo = bakeGeometry(map, d.scale);
  if (assets) { exportTextures(d, map, assets); exportObjects(d, assets); }
  delete d.objs; // sobram so os resolvidos (d.props)
  return d;
}

/** Exporta (uma vez) as texturas e flats usados pelo mapa como PNG e guarda tamanho/alfa em d.tex / d.flat; cor do ceu em d.theme. */
function exportTextures(d, map, assets) {
  fs.mkdirSync(TEX_DIR, { recursive: true });
  const put = (kind, name, img) => {
    const file = path.join(TEX_DIR, `${kind}_${safe(name)}.png`);
    let alpha = false;
    for (let i = 3; i < img.rgba.length; i += 4) if (!img.rgba[i]) { alpha = true; break; }
    if (!fs.existsSync(file)) fs.writeFileSync(file, encodePng(img.w, img.h, alpha ? bleedAlpha(img).rgba : img.rgba));
    return { w: img.w, h: img.h, a: alpha ? 1 : 0 };
  };
  d.tex = {}; d.flat = {};
  const names = new Set();
  for (const sd of map.sides) for (const k of [sd.top, sd.bottom, sd.mid]) if (k && k !== '-' && !k.startsWith('#')) names.add(k);
  for (const n of names) { const img = assets.texture(n); if (img) d.tex[n] = put('t', n, img); }
  const flats = new Set();
  for (const c of map.sectors) { flats.add(c.floorPic); flats.add(c.ceilPic); }
  for (const f of flats) { if (f === 'F_SKY1') continue; const img = assets.flat(f); if (img) d.flat[f] = put('f', f, img); }
  // animacoes (ANIMDEFS): para cada flat/textura usado que faz parte de um ciclo, exporta todos os quadros e guarda o ciclo
  d.anim = { f: {}, t: {} };
  for (const [kind, set, store, get] of [['f', d.flat, d.flat, (n) => assets.flat(n)], ['t', d.tex, d.tex, (n) => assets.texture(n)]]) {
    for (const n of Object.keys(set)) {
      const an = assets.anims[kind].get(n);
      if (!an) continue;
      const frames = [];
      for (const fr of an.frames) { const img = get(fr); if (!img) { frames.length = 0; break; } if (!store[fr]) store[fr] = put(kind, fr, img); frames.push(fr); }
      if (frames.length >= 2) d.anim[kind][n] = { frames, tics: an.tics, i0: an.frames.indexOf(n) };
    }
  }
  // ceu: textura SKYn (cores do topo, meio e horizonte para o degrade)
  const sky = assets.texture('SKY' + d.sky);
  if (sky) {
    d.skyTex = put('t', 'SKY' + d.sky, sky);
    const row = (y) => { let r = 0, g = 0, b = 0; for (let x = 0; x < sky.w; x++) { const o = (Math.min(sky.h - 1, y) * sky.w + x) * 4; r += sky.rgba[o]; g += sky.rgba[o + 1]; b += sky.rgba[o + 2]; } return ((Math.round(r / sky.w) << 16) | (Math.round(g / sky.w) << 8) | Math.round(b / sky.w)); };
    const css = (n) => '#' + n.toString(16).padStart(6, '0');
    d.theme = { sky: [css(row(2)), css(row(sky.h >> 1)), css(row(sky.h - 3))], fog: [row(sky.h - 3), 380, 1300], exposure: 1.0 };
  }
}

let INFO = null;
/** Objetos de cenario/mola do mapa -> d.props [[doomednum, x, y, z, flip, setor]] + d.propTypes {dn: {frames:[[chave, tics]], r, h, bright, trans, paper}} + d.spr {chave: {w,h,ox,oy,flip}} (PNG em tex/s_*). */
function exportObjects(d, assets) {
  INFO ||= parseInfo();
  d.props = []; d.propTypes = {}; d.spr = {};
  const S = d.scale, ph = (p, x, z) => p[0] * x + p[1] * z + p[2];
  for (const o of d.objs) {
    if (o.type === 1488) { // plateia (MT_RANDOMAUDIENCE): chao com o dobro do tamanho, quadro de torcida AUDI A ou B (sorteado pela posicao)
      const k = (Math.abs(Math.round(o.x * 7 + o.z * 13)) % 2), id = 99000 + k;
      if (!d.propTypes[id]) {
        const key = 'AUDI_' + k, img = assets.sprite('AUDI', k);
        if (!img) { d.propTypes[id] = null; continue; }
        if (!d.spr[key]) {
          const file = path.join(TEX_DIR, `s_${key}.png`);
          if (!fs.existsSync(file)) fs.writeFileSync(file, encodePng(img.w, img.h, bleedAlpha(img).rgba));
          d.spr[key] = { w: img.w, h: img.h, ox: img.ox, oy: img.oy, flip: img.flip ? 1 : 0 };
        }
        d.propTypes[id] = { frames: [[key, -1]], r: 16, h: 40, bright: 0, trans: 0, paper: 0, spring: 0, sc: 2 };
      }
      if (d.propTypes[id]) { const sec = d.sectors[o.sec]; d.props.push([id, o.x, +((sec.fs ? sec.fs[0] * o.x + sec.fs[1] * o.z + sec.fs[2] : sec.f) + o.zoff).toFixed(3), o.z, 0, o.sec]); }
      continue;
    }
    const type = INFO.types.get(o.type);
    if (!type || o.type === 300 || (o.type >= 600 && o.type <= 609)) continue; // o SRB2Kart nao tem aneis
    if (!d.propTypes[o.type]) {
      const sf = spawnFrames(INFO, type), frames = [];
      for (const f of sf.frames) {
        const key = f.spr + '_' + f.f;
        if (!d.spr[key]) {
          const img = assets.sprite(f.spr, f.f);
          if (!img) continue;
          const file = path.join(TEX_DIR, `s_${key}.png`);
          if (!fs.existsSync(file)) fs.writeFileSync(file, encodePng(img.w, img.h, bleedAlpha(img).rgba));
          d.spr[key] = { w: img.w, h: img.h, ox: img.ox, oy: img.oy, flip: img.flip ? 1 : 0 };
        }
        frames.push([key, f.t]);
      }
      d.propTypes[o.type] = frames.length ? { frames, r: type.radius, h: type.height, bright: sf.bright ? 1 : 0, trans: sf.trans, paper: sf.paper ? 1 : 0, spring: type.flags.includes('SPRING') ? 1 : 0 } : null;
    }
    if (!d.propTypes[o.type]) continue;
    const sec = d.sectors[o.sec];
    const flip = !!(o.opt & 2) !== type.flags.includes('SPAWNCEILING'); // MTF_OBJECTFLIP = 2
    const zo = o.zoff;
    const fl = sec.fs ? ph(sec.fs, o.x, o.z) : sec.f, ce = sec.cs ? ph(sec.cs, o.x, o.z) : sec.c;
    const y = flip ? ce - type.height * S - zo : fl + zo;
    d.props.push([o.type, o.x, +y.toFixed(3), o.z, flip ? 1 : 0, o.sec]);
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
