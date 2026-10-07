import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack, SURF } from '../sim/track.js';
import mountain from '../sim/tracks/mountain.js';
import { Game } from '../sim/game.js';
import { placeCar, stepCar, DT } from '../sim/car.js';
import { buildScenery } from '../sim/scenery.js';

const track = buildTrack(mountain);
const L = track.length;
const players = (n) => Array.from({ length: n }, (_, i) => ({ id: i, name: 'P' + i, color: i, isBot: true }));
const ramps = (mountain.hills || []).filter((h) => h.fall === 0);

test('montanha: pista fecha, ~2,6 min por volta e curvas fechadas viaveis', () => {
  assert.ok(L > 5000 && L < 6800, 'comprimento ' + L);
  assert.ok(track.minRadius() > 16, 'raio minimo ' + track.minRadius());
});

test('montanha: trechos distantes nao ficam colados', () => {
  let worst = Infinity;
  for (let i = 0; i < track.N; i += 5) for (let j = i + 1; j < track.N; j += 5) {
    const arc = Math.min(j - i, track.N - (j - i)) * track.ds;
    if (arc < 150) continue;
    worst = Math.min(worst, Math.hypot(track.X[i] - track.X[j], track.Z[i] - track.Z[j]));
  }
  assert.ok(worst > 70, 'menor distancia ' + worst.toFixed(0));
});

test('montanha: rampas de salto ficam em reta (antes e depois do labio)', () => {
  assert.ok(ramps.length >= 3, 'rampas ' + ramps.length);
  for (const h of ramps) {
    const s0 = h.from * L, p = track.pointAt(s0);
    let worst = 0;
    for (let d = -40; d <= 90; d += 5) {
      const q = track.pointAt(s0 + d);
      worst = Math.max(worst, Math.abs((q.x - p.x) * -p.tz + (q.z - p.z) * p.tx));
    }
    assert.ok(worst <= 4, `rampa em ${h.from}: desvio do eixo ${worst.toFixed(1)} u`);
  }
});

test('montanha: carro lancado em cada rampa pousa na estrada (sem explodir por sair da pista)', () => {
  for (const h of ramps) {
    const g = new Game(players(1), { track: buildTrack(mountain), cup: 'fast', seed: 3 });
    const car = g.cars[0];
    placeCar(car, g.track, h.from * L - 90, 0);
    car.locked = false; car.state = 'run';
    car.vx = Math.cos(car.h) * 38; car.vz = Math.sin(car.h) * 38;
    let maxD = 0, air = false;
    for (let i = 0; i < 120 * 5; i++) {
      stepCar(car, g.track, DT, []);
      // mantem a velocidade de cruzeiro e o volante reto (carro de teste)
      car.steer = 0;
      maxD = Math.max(maxD, Math.abs(car.near.d));
      air = air || car.air;
    }
    assert.ok(air, `rampa ${h.from} nao lanca o carro`);
    assert.ok(maxD < g.track.hwAt(car.near.idx) + 2, `rampa ${h.from}: carro saiu da estrada (d=${maxD.toFixed(1)})`);
    assert.notEqual(car.state, 'wreck');
  }
});

test('montanha: subida com montanha a esquerda, queda a direita e caixas na beirada', () => {
  assert.ok(track.hasChasm && track.hasElev);
  assert.ok(Math.max(...track.ELEV) >= 20, 'altura da subida');
  const s = mountain.solidWalls[0];
  const i = track.idxAt(((s.from + s.to) / 2) * L);
  assert.equal(track.hardWall(i, -10), true, 'parede a esquerda');
  assert.equal(track.hardWall(i, 10), false, 'direita aberta');
  const near = track.newNear();
  Object.assign(near, { idx: i, d: track.edgeAt(i) + 20 });
  assert.equal(track.chasmAt(near), true, 'queda a direita');
  near.d = -(track.edgeAt(i) + 20);
  assert.equal(track.chasmAt(near), false, 'esquerda sem queda');
  const g = new Game(players(2), { track: buildTrack(mountain), cup: 'war', seed: 4 });
  const row = g.items.boxes.filter((b) => b.fixed);
  assert.ok(row.length >= 8, 'caixas na beirada ' + row.length);
  for (const b of row) {
    const nr = g.track.nearest(b.x, b.z, -1, g.track.newNear());
    assert.ok(nr.d > 0 && nr.d < g.track.edgeAt(nr.idx), 'caixa na beirada direita (d=' + nr.d.toFixed(1) + ')');
  }
});

test('montanha: praia de areia com o mar (agua) a esquerda e a ponte da descida em reta', () => {
  const sea = mountain.chasms.find((c) => c.water);
  const i = track.idxAt(((sea.from + sea.to) / 2) * L);
  assert.equal(track.SURFACE[i], SURF.SAND);
  assert.equal(track.CHWATER[i], 1);
  const near = track.newNear();
  Object.assign(near, { idx: i, d: -(track.edgeAt(i) + 100) });
  assert.equal(track.chasmAt(near), true, 'mar a esquerda');
  near.d = -(track.edgeAt(i) + 10);
  assert.equal(track.chasmAt(near), false, 'faixa de areia antes do mar');
  near.d = track.edgeAt(i) + 100;
  assert.equal(track.chasmAt(near), false, 'direita sem mar');
  const br = mountain.bridges[1];
  assert.ok(track.BRIDGE[track.idxAt(((br.from + br.to) / 2) * L)] === 1);
});

test('montanha: largada livre de cenario', () => {
  const g = new Game(players(8), { track: buildTrack(mountain), cup: 'war', seed: 4 });
  g.track.scenery = buildScenery(g.track);
  for (const car of g.cars) {
    for (const o of g.track.scenery.query(car.x, car.z, 6)) assert.ok(Math.hypot(o.x - car.x, o.z - car.z) > o.r + 2, 'carro nasce em ' + o.kind);
  }
});
