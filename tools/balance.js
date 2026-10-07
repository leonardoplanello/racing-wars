// Simulacao headless com bots para observar o ritmo das rodadas: node tools/balance.js [bots] [copa] [pista: test|mountain]
import { buildTrack } from '../sim/track.js';
import tc from '../sim/tracks/testcircuit.js';
import mountain from '../sim/tracks/mountain.js';
import { Game } from '../sim/game.js';
import { makeBrain, think } from '../sim/ai.js';
import { makeRng } from '../sim/rng.js';

const n = Number(process.argv[2]) || 8;
const cup = process.argv[3] || 'war';
const track = buildTrack(process.argv[4] === 'mountain' ? mountain : tc);
const g = new Game(Array.from({ length: n }, (_, i) => ({ id: i, name: 'P' + i, color: i, isBot: true })), { track, cup, seed: 2 });
const rng = makeRng(3);
const br = new Map(g.cars.map((c) => [c.id, makeBrain(rng, 0.6 + rng() * 0.4)]));
let t = 0, last = 0;
const dt = 1 / 60;
const causes = {};
while (t < 900 && g.state !== 'MATCH_END') {
  for (const c of g.cars) if (c.alive && c.near) { const r = think(br.get(c.id), c, g, dt); g.setInput(c.id, r.steer, r.fire); }
  g.update(dt);
  t += dt;
  for (const e of g.drainEvents()) {
    if (e.type === 'use') causes['uso_' + e.item] = (causes['uso_' + e.item] || 0) + 1;
    if (e.type === 'hit') causes['hit_' + e.kind] = (causes['hit_' + e.kind] || 0) + 1;
    if (e.type === 'dead') causes[e.cause] = (causes[e.cause] || 0) + 1;
    if (e.type === 'roundEnd') { console.log('t', t.toFixed(0), 'rodada', g.round, 'dur', (t - last).toFixed(1) + 's', 'sobrevivente', e.survivor, JSON.stringify(e.points)); last = t; }
    if (e.type === 'matchEnd') console.log('FIM', e.reason, 'vencedor', e.winner);
  }
}
console.log('mortes:', causes, 'estado', g.state, 'tempo', t.toFixed(0) + 's');
