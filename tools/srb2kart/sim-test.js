// Roda bots numa pista importada e mostra se completam voltas: node tools/srb2kart/sim-test.js srb2kart-map51 [segundos] [bots]
import fs from 'node:fs';
import { buildMapTrack } from '../../sim/maptrack.js';
import { Game } from '../../sim/game.js';
import { makeBrain, think } from '../../sim/ai.js';
import { makeRng } from '../../sim/rng.js';

const [id = 'srb2kart-map51', secs = '120', nb = '8'] = process.argv.slice(2);
const data = JSON.parse(fs.readFileSync(new URL(`../../public/tracks/srb2kart/${id}.json`, import.meta.url), 'utf8'));
const track = buildMapTrack(data);
const players = Array.from({ length: Number(nb) }, (_, i) => ({ id: i, name: 'P' + i, color: i, isBot: true }));
const game = new Game(players, { track, cup: 'fast', seed: 5 });
game.debug.infinite = true; game.debug.noCut = true;
const rng = makeRng(7);
const brains = new Map(game.cars.map((c) => [c.id, makeBrain(rng, 0.85)]));
let walls = 0, falls = 0, lastBest = 0, stuckT = 0;
const lapT = [];
for (let t = 0; t < Number(secs); t += 1 / 60) {
  for (const c of game.cars) if (c.alive && c.near) { const r = think(brains.get(c.id), c, game, 1 / 60); game.setInput(c.id, r.steer, r.fire, r.rev); }
  game.update(1 / 60);
  for (const e of game.drainEvents()) { if (e.type === 'wall') walls++; if (e.type === 'fall') falls++; }
  const best = Math.max(...game.cars.map((c) => c.progress));
  if (Math.floor(best / track.length) > Math.floor(lastBest / track.length)) lapT.push(t.toFixed(0));
  lastBest = best;
}
console.log(`${id} (${data.name}): comprimento ${track.length.toFixed(0)} u, ${secs}s: melhor progresso ${(lastBest / track.length).toFixed(2)} voltas, paredes=${walls}, quedas=${falls}, voltas completas aos ${lapT.join('s, ')}s`);
console.log('progresso por carro:', game.cars.map((c) => (c.progress / track.length).toFixed(2) + (c.alive ? '' : '†')).join(' '));
