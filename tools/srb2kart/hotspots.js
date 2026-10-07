// Onde os bots batem mais numa pista: node tools/srb2kart/hotspots.js srb2kart-map02 [segundos]
import fs from 'node:fs';
import path from 'node:path';
import { buildMapTrack } from '../../sim/maptrack.js';
import { Game } from '../../sim/game.js';
import { makeBrain, think } from '../../sim/ai.js';
import { makeRng } from '../../sim/rng.js';
import { TRACKS_DIR } from './build.js';

const [id, secs = '120'] = process.argv.slice(2);
const d = JSON.parse(fs.readFileSync(path.join(TRACKS_DIR, `${id}.json`), 'utf8'));
const track = buildMapTrack(d);
const players = Array.from({ length: 8 }, (_, i) => ({ id: i, name: 'P' + i, color: i, isBot: true }));
const game = new Game(players, { track, cup: 'fast', seed: 5, mode: 'race' });
game.debug.infinite = true; game.debug.noCut = true;
const rng = makeRng(7); const brains = new Map(game.cars.map((c) => [c.id, makeBrain(rng, 0.85)]));
const hot = new Map(), falls = new Map(), resp = new Map(), lastResp = new Map(), causes = {};
let loops = 0, total = 0;
const key = (x, z) => `${Math.round(x / 6) * 6},${Math.round(z / 6) * 6}`;
let maxS = 0;
for (let t = 0; t < Number(secs); t += 1 / 60) {
  for (const c of game.cars) if (c.alive && c.near) { const r = think(brains.get(c.id), c, game, 1 / 60); game.setInput(c.id, r.steer, r.fire, r.rev); }
  game.update(1 / 60);
  for (const e of game.drainEvents()) {
    if (e.type === 'wall') { const k = key(e.x, e.z); hot.set(k, (hot.get(k) || 0) + 1); }
    else if (e.type === 'fall') { const k = key(e.x, e.z); falls.set(k, (falls.get(k) || 0) + 1); }
    else if (e.type === 'respawn') {
      const k = key(e.x, e.z) + ' ' + e.cause; resp.set(k, (resp.get(k) || 0) + 1);
      total++; causes[e.cause] = (causes[e.cause] || 0) + 1;
      if (game.time - (lastResp.get(e.car) ?? -99) < 2.5) loops++; // renasceu e caiu/travou de novo logo: loop
      lastResp.set(e.car, game.time);
    }
  }
  maxS = Math.max(maxS, ...game.cars.map((c) => c.progress / track.length));
}
const top = (m, n = 5) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k}:${v}`).join('  ');
console.log(`${id}: melhor ${maxS.toFixed(2)} voltas`);
console.log(' paredes :', top(hot));
console.log(' quedas  :', top(falls));
console.log(' renasce :', top(resp));
console.log(` respawns: ${total} (${Object.entries(causes).map(([k, v]) => k + ':' + v).join(' ')})  em loop (<2,5 s): ${loops}`);
