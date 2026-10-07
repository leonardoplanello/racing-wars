import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack } from '../sim/track.js';
import { Game, RACE_POINTS } from '../sim/game.js';
import { makeBrain, think } from '../sim/ai.js';
import { makeRng } from '../sim/rng.js';
import testCircuit from '../sim/tracks/testcircuit.js';

function runRace(bots, secs, laps = 1) {
  const track = buildTrack({ ...testCircuit, laps });
  const players = Array.from({ length: bots }, (_, i) => ({ id: i, name: 'P' + i, color: i, isBot: true }));
  const game = new Game(players, { track, cup: 'fast', seed: 3, mode: 'race' });
  const rng = makeRng(7);
  const brains = new Map(game.cars.map((c) => [c.id, makeBrain(rng, 0.85)]));
  const events = [];
  for (let t = 0; t < secs && game.state !== 'MATCH_END'; t += 1 / 60) {
    for (const c of game.cars) if (c.alive && c.near) { const r = think(brains.get(c.id), c, game, 1 / 60); game.setInput(c.id, r.steer, r.fire, r.rev); }
    game.update(1 / 60);
    events.push(...game.drainEvents());
  }
  return { game, events };
}

test('corrida: todos chegam, ha colocacao unica e pontos por posicao', () => {
  const { game, events } = runRace(4, 400);
  assert.equal(game.state, 'MATCH_END');
  assert.equal(game.endReason, 'race');
  const fin = events.filter((e) => e.type === 'finish');
  assert.ok(fin.length >= 1);
  const end = events.find((e) => e.type === 'matchEnd');
  assert.ok(end && end.results.length === 4);
  assert.deepEqual(end.results.map((r) => r.place), [1, 2, 3, 4]);
  assert.deepEqual(end.results.map((r) => r.points), RACE_POINTS.slice(0, 4));
  assert.equal(end.winner, end.results[0].id);
});

test('corrida: nao tem rodadas nem fim de rodada (modo race nao e survival)', () => {
  const { game, events } = runRace(4, 30);
  assert.equal(game.mode, 'race');
  assert.ok(!events.some((e) => e.type === 'roundEnd'));
});

test('corrida: quem fica para tras (sai do quadro) e cortado', () => {
  const track = buildTrack({ ...testCircuit, laps: 3 });
  const players = Array.from({ length: 4 }, (_, i) => ({ id: i, name: 'P' + i, color: i, isBot: i !== 0 })); // 0 = sem controle
  const game = new Game(players, { track, cup: 'fast', seed: 3, mode: 'race' });
  const rng = makeRng(7);
  const brains = new Map(game.cars.map((c) => [c.id, makeBrain(rng, 0.85)]));
  const events = [];
  for (let t = 0; t < 90; t += 1 / 60) {
    for (const c of game.cars) if (c.isBot && c.alive && c.near) { const r = think(brains.get(c.id), c, game, 1 / 60); game.setInput(c.id, r.steer, r.fire, r.rev); }
    game.update(1 / 60);
    events.push(...game.drainEvents());
  }
  assert.ok(events.some((e) => e.type === 'dead' && e.cause === 'cut'), 'ninguem foi cortado pela camera');
});

test('corrida: com varios carros juntos a camera enquadra todos dentro da tela (nao so o lider)', () => {
  const { game } = runRace(4, 12, 3);
  const o = { nx: 0, ny: 0, d: 0 };
  for (const c of game.cars) {
    game.camera.project(c.x, c.y + 0.5, c.z, o);
    assert.ok(o.d > 0 && Math.abs(o.nx) <= 1 && Math.abs(o.ny) <= 1, `carro ${c.id} fora da tela (nx=${o.nx.toFixed(2)} ny=${o.ny.toFixed(2)})`);
  }
});

test('corrida: quando sobra so um carro (os outros explodiram) ha reinicio geral com semaforo: todos juntos na grade, tempo da corrida continua', () => {
  const track = buildTrack({ ...testCircuit, laps: 3 });
  const players = Array.from({ length: 4 }, (_, i) => ({ id: i, name: 'P' + i, color: i, isBot: true }));
  const game = new Game(players, { track, cup: 'fast', seed: 3, mode: 'race' });
  const rng = makeRng(7);
  const brains = new Map(game.cars.map((c) => [c.id, makeBrain(rng, 0.85)]));
  const events = [];
  const stepAll = () => {
    for (const c of game.cars) if (c.alive && c.near && !c.locked) { const r = think(brains.get(c.id), c, game, 1 / 60); game.setInput(c.id, r.steer, r.fire, r.rev); }
    game.update(1 / 60);
    events.push(...game.drainEvents());
  };
  for (let t = 0; t < 10; t += 1 / 60) stepAll();
  assert.equal(game.state, 'RACING');
  const t0 = game.time;
  for (const i of [1, 2]) { game.cars[i].shield = 0; game.explodeCar(game.cars[i], 'mine'); }
  stepAll();
  assert.equal(game.state, 'RACING', 'ainda ha 2 carros vivos: sem reinicio');
  game.cars[3].shield = 0;
  game.explodeCar(game.cars[3], 'mine'); // sobra so um carro
  events.length = 0;
  let sawCount = false;
  for (let t = 0; t < 8 && !sawCount; t += 1 / 60) { stepAll(); sawCount = game.state === 'COUNTDOWN'; }
  assert.ok(sawCount, 'deveria reiniciar com semaforo');
  assert.ok(events.some((e) => e.type === 'countdown' && e.n === 3));
  const ps = game.cars.map((c) => c.progress);
  assert.ok(Math.max(...ps) - Math.min(...ps) < 40, 'todos juntos na grade');
  assert.ok(game.cars.every((c) => c.alive && c.locked));
  for (let t = 0; t < 4 && game.state !== 'RACING'; t += 1 / 60) stepAll();
  assert.equal(game.state, 'RACING');
  assert.ok(events.some((e) => e.type === 'go'));
  assert.ok(game.time > t0, 'o tempo da corrida nao zera');
});

test('corrida: carro que sai do quadro da camera explode (exceto o lider)', () => {
  const track = buildTrack({ ...testCircuit, laps: 3 });
  const players = Array.from({ length: 3 }, (_, i) => ({ id: i, name: 'P' + i, color: i, isBot: i !== 0 }));
  const game = new Game(players, { track, cup: 'fast', seed: 3, mode: 'race' });
  const events = [];
  for (let t = 0; t < 4; t += 1 / 60) { game.update(1 / 60); events.push(...game.drainEvents()); }
  assert.equal(game.state, 'RACING');
  game.sinceGo = 5;
  const bot = game.cars[2];
  bot.shield = 0;
  game.camera.isCut = (x) => x === bot.x; // so o bot esta fora do quadro
  game.update(1 / 60);
  events.push(...game.drainEvents());
  assert.ok(events.some((e) => e.type === 'dead' && e.cause === 'cut' && e.car === 2));
});
