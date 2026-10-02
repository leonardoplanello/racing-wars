import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack } from '../sim/track.js';
import downtown from '../sim/tracks/downtown.js';
import { placeCar, stepCar, DT } from '../sim/car.js';
import { Game } from '../sim/game.js';
import { buildScenery, PUMP } from '../sim/scenery.js';

const track = buildTrack(downtown);
const players = (n) => Array.from({ length: n }, (_, i) => ({ id: i, name: 'P' + i, color: i, isBot: true }));
const newGame = (n = 4, cup = 'war') => {
  const g = new Game(players(n), { track: buildTrack(downtown), cup, seed: 4 });
  g.state = 'RACING';
  for (const c of g.cars) { c.locked = false; c.state = 'run'; }
  return g;
};

test('downtown: pista fecha, ~4 min por volta e curvas largas o bastante', () => {
  assert.ok(track.length > 7000 && track.length < 8300, 'comprimento ' + track.length);
  const maxHW = Math.max(...track.HW);
  assert.ok(track.minRadius() > 16.5, 'raio minimo ' + track.minRadius());
  assert.ok(maxHW >= 22 && Math.min(...track.HW) <= 10.01, 'larguras variam por trecho');
});

test('downtown: trechos distantes da pista nao ficam colados (viaduto/rodovia sem sobreposicao)', () => {
  let worst = Infinity;
  for (let i = 0; i < track.N; i += 5) for (let j = i + 1; j < track.N; j += 5) {
    const arc = Math.min(j - i, track.N - (j - i)) * track.ds;
    if (arc < 250) continue;
    worst = Math.min(worst, Math.hypot(track.X[i] - track.X[j], track.Z[i] - track.Z[j]));
  }
  assert.ok(worst > 90, 'menor distancia ' + worst.toFixed(0));
});

test('downtown: muros solidos nas ruas, lado de dentro do posto aberto', () => {
  const i = track.idxAt(0.36 * track.length);
  assert.equal(track.hardWall(i, 10), false, 'direita (dentro da esquina) aberta no posto');
  assert.equal(track.hardWall(i, -10), true, 'esquerda continua com muro');
  assert.equal(track.hardWall(track.idxAt(0.05 * track.length), 5), true, 'avenida com muro');
});

test('downtown: largada livre (nada de cenario nas vagas) e props fora do meio da pista', () => {
  const sc = buildScenery(track);
  for (const c of sc.colliders) {
    if (!c.prop || c.kind === 'cone' || c.kind === 'pump' || c.kind === 'bldg' || c.kind === 'pillar') continue;
    const nr = track.nearest(c.x, c.z, -1, track.newNear());
    assert.ok(Math.abs(nr.d) > track.hwAt(nr.idx) - 1.2, `${c.kind} no meio da pista (d=${nr.d.toFixed(1)})`);
  }
  const g = newGame(8);
  for (const car of g.cars) {
    for (const o of g.track.scenery.query(car.x, car.z, 6)) assert.ok(Math.hypot(o.x - car.x, o.z - car.z) > o.r + 2, 'carro nasce em ' + o.kind);
  }
});

test('posto: bater numa bomba explode, mata so no raio e acende as vizinhas', () => {
  const g = newGame(3);
  const pumps = g.track.scenery.pumps;
  assert.equal(pumps.length, 4);
  const p = pumps[0];
  const [a, b, far] = g.cars;
  // a de frente para a bomba; b ao lado dela (no raio); far longe (fora do raio)
  const nr = g.track.nearest(p.x, p.z, -1, g.track.newNear());
  placeCar(a, g.track, nr.s - 6, 0);
  a.x = p.x - 5; a.z = p.z; a.h = 0; a.vx = 16; a.vz = 0; a.near && g.track.nearest(a.x, a.z, -1, a.near);
  b.x = p.x + 0.5; b.z = p.z + 6; b.vx = b.vz = 0; g.track.nearest(b.x, b.z, -1, b.near);
  placeCar(far, g.track, nr.s - 400, 0);
  for (const c of [a, b, far]) { c.locked = false; c.state = 'run'; c.god = false; }
  g.debug.noCut = true;
  const evs = [];
  for (let i = 0; i < 60; i++) { g.update(DT); evs.push(...g.drainEvents()); }
  assert.ok(evs.some((e) => e.type === 'pumpBoom'), 'evento de explosao');
  assert.ok(pumps.filter((q) => q.burnt || q.lit).length >= 2, 'reacao em cadeia nas bombas vizinhas');
  void p;
  const dead = evs.filter((e) => e.type === 'explode' && e.kind === 'pump').map((e) => e.car);
  assert.ok(dead.includes(b.id), 'carro no raio morre');
  assert.ok(!dead.includes(far.id), 'carro longe nao morre');
});

test('posto: a cadeia completa queima as quatro bombas (sem carros por perto)', () => {
  const g = newGame(2);
  const sc = g.track.scenery;
  g.debug.noCut = true;
  sc.ignite(sc.pumps[0], PUMP.first);
  for (let i = 0; i < 240; i++) g.update(DT);
  assert.equal(sc.pumps.filter((q) => q.burnt).length, 4);
});

test('posto: a bomba queimada nao volta na rodada seguinte', () => {
  const g = newGame(2);
  const sc = g.track.scenery;
  sc.ignite(sc.pumps[0], 0.01);
  for (let i = 0; i < 60; i++) g.update(DT);
  assert.ok(sc.pumps[0].burnt);
  sc.restore();
  assert.equal(sc.pumps[0].burnt, true);
  assert.equal(sc.pumps[0].cols.every((c) => c.dead), true, 'colisor continua desativado');
  assert.ok(PUMP.radius > 0);
});

test('props: cone tomba ao toque e volta na proxima rodada; poste e solido', () => {
  const g = newGame(2, 'fast');
  const sc = g.track.scenery;
  const cone = sc.props.find((p) => p.type === 'cone');
  const [a] = g.cars;
  a.x = cone.x - 4; a.z = cone.z; a.h = 0; a.vx = 20; a.vz = 0; g.track.nearest(a.x, a.z, -1, a.near);
  const ev = [];
  for (let i = 0; i < 120; i++) { stepCar(a, g.track, DT, ev); }
  assert.ok(ev.some((e) => e.type === 'propHit' && e.kind === 'cone'), 'evento propHit');
  assert.equal(cone.dead, true);
  sc.restore();
  assert.equal(cone.dead, false);
  assert.equal(cone.cols.every((c) => !c.dead), true);
});

test('caixa suspensa: so quem esta no ar na altura certa pega', () => {
  const t = buildTrack({ ...downtown, boxes: [{ x: 0, z: 0, h: 5 }], boxGroups: [] });
  const g = new Game(players(2), { track: t, cup: 'war', seed: 1 });
  const b = g.items.boxes.find((q) => q.fixed);
  assert.ok(b && b.h === 5);
  g.state = 'RACING';
  const [a] = g.cars;
  a.locked = false; a.state = 'run'; a.x = b.x; a.z = b.z; a.y = 0; a.item = null;
  g.items.update(DT, g);
  assert.equal(a.item, null, 'no chao nao pega');
  a.y = b.gy + b.h; a.air = true; a.item = null;
  g.items.update(DT, g);
  assert.ok(a.item, 'no ar pega');
});

function drive(g, car, frac, back, d = 0, seconds = 6) {
  placeCar(car, g.track, frac * g.track.length - back, d);
  car.locked = false; car.state = 'run';
  const f = { x: Math.cos(car.h), z: Math.sin(car.h) };
  car.vx = f.x * 34; car.vz = f.z * 34;
  const out = { maxY: 0, picked: false, landed: false, crash: false };
  for (let i = 0; i < seconds / DT; i++) {
    g.update(DT);
    for (const e of g.drainEvents()) {
      if (e.type === 'pickup' && e.car === car.id) out.picked = true;
      if (e.type === 'land' && e.car === car.id) { out.landed = true; if (e.crash) out.crash = true; }
    }
    out.maxY = Math.max(out.maxY, car.y);
  }
  return out;
}

test('carretas-cegonha: a primeira e a rampa, o carro voa, pega a caixa suspensa e pousa na segunda', () => {
  const g = newGame(2);
  g.debug.noCut = true;
  const [a, b] = g.cars;
  placeCar(b, g.track, 0.3 * g.track.length, 0); b.locked = false; b.state = 'run';
  const r = drive(g, a, 0.5587, 40);
  assert.ok(r.maxY > 5.5, 'decolou alto: ' + r.maxY.toFixed(2));
  assert.ok(r.picked, 'pegou a caixa flutuante');
  assert.ok(r.landed && !r.crash, 'pousou sem capotar');
});

test('viaduto: o deck sobe, termina em labio e a pista segue no chao (queda obrigatoria)', () => {
  const t = track, L = t.length;
  assert.ok(t.elevAt(0.78 * L) > 6.5, 'deck alto antes do labio');
  assert.ok(t.elevAt(0.81 * L) < 0.01, 'rodovia no chao depois do labio');
  const g = newGame(2);
  g.debug.noCut = true;
  const [a, b] = g.cars;
  placeCar(b, g.track, 0.3 * g.track.length, 0); b.locked = false; b.state = 'run';
  const r = drive(g, a, 0.8, 120, 0, 5);
  assert.ok(r.maxY > 6.5, 'estava no deck: ' + r.maxY.toFixed(2));
  assert.ok(r.landed, 'caiu na rodovia');
  assert.equal(a.alive, true, 'sobreviveu a queda reta');
});

test('viaduto: pela brecha do guard-rail (lado esquerdo) o carro cai ao lado do deck', () => {
  const t = track, L = t.length;
  const i = t.idxAt(0.79 * L);
  assert.equal(t.hardWall(i, -5), false, 'esquerda aberta na brecha');
  assert.equal(t.hardWall(i, 5), true, 'direita fechada');
});
