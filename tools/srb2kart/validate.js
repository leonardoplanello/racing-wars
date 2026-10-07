// Valida as pistas geradas com bots (a mesma fisica do jogo) e grava no index.json: playable, lapSeconds, issue.
//   node tools/srb2kart/validate.js [srb2kart-map51 ...]   (sem argumentos: todas as pistas ok do index)
import fs from 'node:fs';
import path from 'node:path';
import { buildMapTrack } from '../../sim/maptrack.js';
import { Game } from '../../sim/game.js';
import { makeBrain, think } from '../../sim/ai.js';
import { makeRng } from '../../sim/rng.js';
import { TRACKS_DIR } from './build.js';

/** Roda `bots` bots por `secs` s; devolve { best (voltas do melhor), done (bots com >= 0.95 volta), lapSeconds, falls, walls }. */
export function simulate(data, { secs = 200, bots = 8, seed = 5 } = {}) {
  const track = buildMapTrack(data);
  const players = Array.from({ length: bots }, (_, i) => ({ id: i, name: 'P' + i, color: i, isBot: true }));
  const game = new Game(players, { track, cup: 'fast', seed, mode: 'race' });
  game.debug.infinite = true; game.debug.noCut = true;
  const rng = makeRng(7);
  const brains = new Map(game.cars.map((c) => [c.id, makeBrain(rng, 0.85)]));
  let falls = 0, walls = 0, lapAt = 0;
  const L = track.length;
  for (let t = 0; t < secs; t += 1 / 60) {
    for (const c of game.cars) if (c.alive && c.near) { const r = think(brains.get(c.id), c, game, 1 / 60); game.setInput(c.id, r.steer, r.fire, r.rev); }
    game.update(1 / 60);
    for (const e of game.drainEvents()) { if (e.type === 'fall') falls++; else if (e.type === 'wall') walls++; }
    if (!lapAt && game.cars.some((c) => c.progress >= L)) { lapAt = t; if (secs > t + 15) secs = t + 15; } // ja completou: basta
  }
  const prog = game.cars.map((c) => c.progress / L);
  return { best: Math.max(...prog), done: prog.filter((p) => p >= 0.95).length, lapSeconds: lapAt ? Math.round(lapAt) : 0, falls, walls, length: Math.round(L) };
}

function main() {
  const file = path.join(TRACKS_DIR, 'index.json');
  const index = JSON.parse(fs.readFileSync(file, 'utf8'));
  const want = process.argv.slice(2);
  for (const t of index.tracks) {
    if (!t.ok || t.kind === 'battle') continue;
    if (want.length && !want.includes(t.id)) continue;
    const data = JSON.parse(fs.readFileSync(path.join(TRACKS_DIR, t.file), 'utf8'));
    const t0 = Date.now();
    const r = simulate(data, { secs: Math.min(900, 40 + (t.length / 20) * 2.6) }); // pistas longas levam mais de 5 min por volta
    t.sim = r;
    t.lapSeconds = r.lapSeconds;
    t.playable = r.done >= 3 || (r.done >= 1 && r.best >= 1);
    t.issue = t.playable ? '' : r.best < 0.2 ? 'bots nao saem da largada' : `bots travam em ${(r.best * 100).toFixed(0)}% da volta`;
    console.log(`${t.map} ${(t.name || '').padEnd(22)} ${t.playable ? 'JOGAVEL' : 'FALHA  '} melhor=${r.best.toFixed(2)} terminaram=${r.done}/8 volta=${r.lapSeconds}s quedas=${r.falls} paredes=${r.walls} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }
  fs.writeFileSync(file, JSON.stringify(index, null, 1));
  const ok = index.tracks.filter((t) => t.playable).length;
  console.log(`${ok} jogaveis de ${index.tracks.filter((t) => t.ok).length} geradas`);
}

if (process.argv[1]?.endsWith('validate.js')) main();
