// Onde os bots travam: node tools/srb2kart/debug-stuck.js srb2kart-map01 [segundos]
import fs from 'node:fs';
import { buildMapTrack } from '../../sim/maptrack.js';
import { Game } from '../../sim/game.js';
import { makeBrain, think } from '../../sim/ai.js';
import { makeRng } from '../../sim/rng.js';

const [id = 'srb2kart-map01', secs = '100'] = process.argv.slice(2);
const data = JSON.parse(fs.readFileSync(new URL(`../../public/tracks/srb2kart/${id}.json`, import.meta.url), 'utf8'));
const track = buildMapTrack(data);
const players = Array.from({ length: 4 }, (_, i) => ({ id: i, name: 'P' + i, color: i, isBot: true }));
const game = new Game(players, { track, cup: 'fast', seed: 5 });
game.debug.infinite = true; game.debug.noCut = true;
const rng = makeRng(7); const brains = new Map(game.cars.map((c) => [c.id, makeBrain(rng, 0.85)]));
const last = new Map();
for (let t = 0; t < Number(secs); t += 1 / 60) {
  for (const c of game.cars) if (c.alive && c.near) { const r = think(brains.get(c.id), c, game, 1 / 60); game.setInput(c.id, r.steer, r.fire); }
  game.update(1 / 60);
  game.drainEvents();
  if (Math.abs(t - Math.round(t)) < 1 / 120 && t > 20) {
    const c = game.cars[0], p = last.get(c.id);
    if (p && Math.abs(c.progress - p) < 1.5) {
      const w = track.map, g = w.groundAt(c.x, c.z, c.y, {});
      console.log(`t=${t.toFixed(0)} car0 parado em s=${c.near.s.toFixed(0)} (${(c.near.s / track.length).toFixed(2)}) pos(${c.x.toFixed(1)},${c.z.toFixed(1)}) y=${c.y.toFixed(2)} h=${c.h.toFixed(2)} d=${c.near.d.toFixed(1)} setor=${g.si} chao=${g.y.toFixed(2)} sp=${w.sectors[g.si].sp} air=${c.air} speed=${c.speed.toFixed(1)} state=${c.state}`);
      // linhas de bloqueio perto, na frente
      const fx = Math.cos(c.h), fz = Math.sin(c.h);
      w.forLines(c.x + fx * 2, c.z + fz * 2, 4, (i, l) => {
        const A = l[6] >= 0 ? w.sectors[l[6]] : null, B = l[7] >= 0 ? w.sectors[l[7]] : null;
        console.log(`  linha ${i} (${l[0].toFixed(1)},${l[1].toFixed(1)})->(${l[2].toFixed(1)},${l[3].toFixed(1)}) flags=${l[4]} sp=${l[5]} frente=${l[6]}${A ? ' f=' + A.f.toFixed(2) + ' c=' + A.c.toFixed(2) : ''} tras=${l[7]}${B ? ' f=' + B.f.toFixed(2) + ' c=' + B.c.toFixed(2) + ' fofs=' + B.fofs.length : ''}`);
      });
      process.exit(0);
    }
    last.set(c.id, c.progress);
  }
}
console.log('nao travou');
