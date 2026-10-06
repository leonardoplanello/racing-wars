// Mostra onde e por que os carros caem numa pista importada: node tools/srb2kart/debug-fall.js srb2kart-map01 [segundos]
import fs from 'node:fs';
import { buildMapTrack } from '../../sim/maptrack.js';
import { Game } from '../../sim/game.js';
import { makeBrain, think } from '../../sim/ai.js';
import { makeRng } from '../../sim/rng.js';

const [id = 'srb2kart-map01', secs = '150'] = process.argv.slice(2);
const data = JSON.parse(fs.readFileSync(new URL(`../../public/tracks/srb2kart/${id}.json`, import.meta.url), 'utf8'));
const track = buildMapTrack(data);
const players = Array.from({ length: Number(process.argv[4] || 8) }, (_, i) => ({ id: i, name: 'P' + i, color: i, isBot: true }));
const game = new Game(players, { track, cup: 'fast', seed: 5 });
game.debug.infinite = true; game.debug.noCut = true;
const rng = makeRng(7); const brains = new Map(game.cars.map((c) => [c.id, makeBrain(rng, 0.85)]));
let shown = 0;
for (let t = 0; t < Number(secs) && shown < 8; t += 1 / 60) {
  for (const c of game.cars) if (c.alive && c.near) { const r = think(brains.get(c.id), c, game, 1 / 60); game.setInput(c.id, r.steer, r.fire); }
  game.update(1 / 60);
  for (const e of game.drainEvents()) {
    if (e.type === 'fall' && shown < 8) {
      shown++;
      const c = game.carById(e.car), w = track.map, g = w.groundAt(c.x, c.z, c.y, {}), S = w.sectors[g.si];
      console.log(`t=${t.toFixed(1)} car${c.id} pos(${c.x.toFixed(1)},${c.z.toFixed(1)}) y=${c.y.toFixed(2)} s=${c.near.s.toFixed(0)} d=${c.near.d.toFixed(1)} | setor ${g.si} piso=${S.fp} sp=${S.sp} y=${g.y.toFixed(2)} sec=${g.sec} fof=${g.fof} air=${c.air} state=${c.state} cause=${e.cause}`);
    }
  }
  for (const c of game.cars) {
    if (c.state === 'falling' && c.fall < 0.02 && shown < 8) {
      shown++;
      const w = track.map, g = w.groundAt(c.x, c.z, c.y, {}), S = w.sectors[g.si];
      console.log(`t=${t.toFixed(1)} car${c.id} pos(${c.x.toFixed(1)},${c.z.toFixed(1)}) y=${c.y.toFixed(2)} s=${c.near.s.toFixed(0)} d=${c.near.d.toFixed(1)} | setor ${g.si} piso=${S.fp} sp=${S.sp} y=${g.y.toFixed(2)} sec=${g.sec} fof=${g.fof} air=${c.air} vy=${c.vy.toFixed(1)}`);
    }
  }
}
