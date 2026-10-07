// Detalha onde e por que os bots travam/caem numa pista: node tools/srb2kart/stuck-diag.js srb2kart-map51 [segundos] [--bots=8] [--level=medium]
// Para cada incidente (parado > 2 s, queda, morte nao causada por item) mostra posicao, rumo, velocidade, parede mais proxima e o que a IA mandou.
import fs from 'node:fs';
import path from 'node:path';
import { buildMapTrack } from '../../sim/maptrack.js';
import { Game } from '../../sim/game.js';
import { makeBrain, think } from '../../sim/ai.js';
import { makeRng } from '../../sim/rng.js';
import { TRACKS_DIR } from './build.js';

const opt = Object.fromEntries(process.argv.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const [id = 'srb2kart-map51', secs = '0'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const data = JSON.parse(fs.readFileSync(path.join(TRACKS_DIR, id + '.json'), 'utf8'));
const track = buildMapTrack(data);
const L = track.length;
const bots = Number(opt.bots || 8);
const players = Array.from({ length: bots }, (_, i) => ({ id: i, name: 'P' + i, color: i, isBot: true }));
const game = new Game(players, { track, cup: 'fast', seed: Number(opt.seed || 5), mode: 'race' });
game.debug.infinite = true; game.debug.noCut = true;
const rng = makeRng(7);
const brains = new Map(game.cars.map((c) => [c.id, makeBrain(rng, Number(opt.skill || 0.85), opt.level || 'medium')]));
const items = new Set(['missile', 'mine', 'whomp', 'ice', 'pump']);
const hist = new Map(game.cars.map((c) => [c.id, []]));
const slow = new Map(game.cars.map((c) => [c.id, 0]));
const limit = Number(secs) || Math.min(900, 60 + (L / 20) * 3);
const f = (v, n = 1) => (v === undefined ? '-' : v.toFixed(n));
const snap = (c) => {
  const b = brains.get(c.id), hw = track.hwAt(c.near.idx);
  return `car${c.id} s=${f(c.progress / L * 100)}% (${f(c.x)},${f(c.z)},y${f(c.y)}) h=${f(c.h, 2)} v=${f(c.speed)} d/hw=${f(c.near.d / hw, 2)} hw=${f(hw)} air=${c.air ? 1 : 0} state=${c.state} blockT=${f(b.blockT, 1)} revT=${f(b.revT, 1)} steerCmd=${f(b.steerCmd, 2)} dbg=${b.dbg ? `line ${f(b.dbg.line, 2)} avoid ${f(b.dbg.avoid, 2)} edge ${f(b.dbg.edge, 2)} lane ${f(b.dbg.lane, 2)}` : '-'}`;
};
const traceId = opt.trace !== undefined ? Number(opt.trace) : -1, tFrom = Number(opt.from || 0), tTo = Number(opt.to || 1e9);
let shown = 0;
const maxShow = Number(opt.max || 25);
for (let t = 0; t < limit && shown < maxShow; t += 1 / 60) {
  for (const c of game.cars) if (c.alive && c.near) { const r = think(brains.get(c.id), c, game, 1 / 60); game.setInput(c.id, r.steer, r.fire, r.rev); }
  game.update(1 / 60);
  if (traceId >= 0 && t >= tFrom && t <= tTo && Math.round(t * 60) % (Number(opt.every || 12)) === 0) { const c = game.carById(traceId); if (c.near) console.log('  t=' + f(t) + ' ' + snap(c) + ' thr=' + f(c.throttle, 2) + ' steer=' + f(c.steer, 2)); }
  for (const c of game.cars) {
    if (!c.near || !c.alive) { slow.set(c.id, 0); continue; }
    const h = hist.get(c.id);
    if (Math.round(t * 60) % 12 === 0) { h.push(`t=${f(t)} ${snap(c)}`); if (h.length > 8) h.shift(); }
    if (game.state === 'RACING' && c.speed < 2) { slow.set(c.id, slow.get(c.id) + 1 / 60); if (Math.abs(slow.get(c.id) - 2) < 1 / 120) { console.log(`[t=${f(t)}] PARADO 2s: ${snap(c)}`); shown++; } } else slow.set(c.id, 0);
  }
  for (const e of game.drainEvents()) {
    if (e.type === 'fall' || (e.type === 'dead' && !items.has(e.cause))) {
      const c = game.carById(e.car);
      console.log(`[t=${f(t)}] ${e.type.toUpperCase()} ${e.cause || ''} ${snap(c)}`);
      for (const l of (hist.get(c.id) || []).slice(-5)) console.log('    ' + l);
      shown++;
    }
  }
}
