// Mede se os bots completam uma volta SEM travar em cada pista de mapa: conta reinicios gerais (cada travamento/queda) e onde ocorrem.
//   node tools/srb2kart/stuck-all.js [srb2kart-map51 ...]   (sem argumentos: todas as pistas ok; roda em paralelo)
//   opcoes: --bots=8 --seed=5 --skill=0.85 --level=medium
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildMapTrack } from '../../sim/maptrack.js';
import { Game } from '../../sim/game.js';
import { makeBrain, think, AI } from '../../sim/ai.js';
import { makeRng } from '../../sim/rng.js';
import { TRACKS_DIR } from './build.js';

const opt = Object.fromEntries(process.argv.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));

/** Uma volta com `bots` bots; devolve { lap, regroups, causes, at } (lap = s da primeira volta, 0 = nao completou). */
export function run(data, { bots = 8, seed = 5, skill = 0.85, level = 'medium', secs = 0 } = {}) {
  if (opt.ai) for (const kv of opt.ai.split(',')) { const [k, v] = kv.split(':'); AI[k] = Number(v); }
  if (opt.off) for (const k of opt.off.split(',')) AI.off[k] = true;
  const track = buildMapTrack(data);
  const L = track.length;
  const players = Array.from({ length: bots }, (_, i) => ({ id: i, name: 'P' + i, color: i, isBot: true }));
  const game = new Game(players, { track, cup: 'fast', seed, mode: 'race' });
  game.debug.infinite = true; game.debug.noCut = true;
  const rng = makeRng(7);
  const brains = new Map(game.cars.map((c) => [c.id, makeBrain(rng, skill, level)]));
  const limit = secs || Math.min(900, 60 + (L / 20) * 3);
  const causes = {}, at = [];
  let regroups = 0, lap = 0, falls = 0;
  const lastAir = new Map(), kinds = {};
  const items = new Set(['missile', 'mine', 'whomp', 'ice', 'pump']);
  for (let t = 0; t < limit; t += 1 / 60) {
    for (const c of game.cars) if (c.alive && c.near) { const r = think(brains.get(c.id), c, game, 1 / 60); game.setInput(c.id, r.steer, r.fire, r.rev); }
    game.update(1 / 60);
    for (const c of game.cars) if (c.air) lastAir.set(c.id, t);
    for (const e of game.drainEvents()) {
      if (e.type === 'fall') falls++;
      if (e.type === 'dead' && !items.has(e.cause)) {
        const c = game.carById(e.car);
        causes[e.cause] = (causes[e.cause] || 0) + 1; regroups++;
        const hw = track.hwAt(c.near.idx), air = t - (lastAir.get(c.id) ?? -99) < 2.5;
        const asst = track.assists.some((a) => Math.hypot(a.x - c.x, a.z - c.z) < 25);
        const kind = (air ? 'ar' : '') + (Math.abs(c.near.d) > hw + 3 ? 'fora' : 'pista') + (asst ? '+salto' : '') + (e.cause === 'fall' ? '+queda' : '');
        kinds[kind] = (kinds[kind] || 0) + 1;
        at.push((c.progress / L * 100).toFixed(0) + '%/' + e.cause);
      }
    }
    if (!lap && game.cars.some((c) => c.progress >= L)) lap = Math.round(t);
    if (lap && t > lap + 5) break;
  }
  const prog = game.cars.map((c) => c.progress / L);
  return { lap, regroups, falls, causes, kinds, at: at.slice(0, 12), best: Math.max(...prog), min: Math.min(...prog), length: Math.round(L) };
}

function main() {
  const index = JSON.parse(fs.readFileSync(path.join(TRACKS_DIR, 'index.json'), 'utf8'));
  const list = index.tracks.filter((t) => t.ok && t.kind !== 'battle' && (!args.length || args.includes(t.id)));
  const flags = process.argv.filter((a) => a.startsWith('--'));
  const results = [];
  let next = 0, running = 0;
  const par = Math.max(1, Math.min(os.cpus().length - 1, 8));
  const self = fileURLToPath(import.meta.url);
  const launch = () => {
    while (running < par && next < list.length) {
      const t = list[next++];
      running++;
      const p = spawn(process.execPath, [self, '--child', t.id, ...flags], { stdio: ['ignore', 'pipe', 'inherit'] });
      let out = '';
      p.stdout.on('data', (d) => { out += d; });
      p.on('close', () => {
        running--;
        try { results.push({ t, r: JSON.parse(out.trim().split('\n').pop()) }); } catch { results.push({ t, r: null }); }
        if (next >= list.length && !running) finish(); else launch();
      });
    }
  };
  const finish = () => {
    results.sort((a, b) => a.t.map.localeCompare(b.t.map));
    let bad = 0;
    for (const { t, r } of results) {
      if (!r) { console.log(`${t.map} ERRO`); bad++; continue; }
      const good = r.lap > 0 && r.regroups === 0;
      if (!good) bad++;
      console.log(`${t.map} ${(t.name || '').padEnd(22)} ${good ? 'OK   ' : 'FALHA'} volta=${r.lap}s reinicios=${r.regroups} quedas=${r.falls} min=${r.min.toFixed(2)} ${r.at.length ? 'em ' + r.at.slice(0, 4).join(' ') : ''} ${JSON.stringify(r.kinds)}`);
    }
    const total = results.reduce((n, { r }) => n + (r ? r.regroups : 0), 0);
    console.log(`${results.length - bad}/${results.length} pistas sem travar, ${total} incidentes no total`);
  };
  launch();
}

if (process.argv.includes('--child')) {
  const tid = process.argv[process.argv.indexOf('--child') + 1];
  const data = JSON.parse(fs.readFileSync(path.join(TRACKS_DIR, tid + '.json'), 'utf8'));
  const o = {};
  if (opt.bots) o.bots = Number(opt.bots);
  if (opt.seed) o.seed = Number(opt.seed);
  if (opt.skill) o.skill = Number(opt.skill);
  if (opt.level) o.level = opt.level;
  console.log(JSON.stringify(run(data, o)));
} else if (process.argv[1]?.endsWith('stuck-all.js')) main();
