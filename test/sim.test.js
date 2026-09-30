import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack } from '../sim/track.js';
import testCircuit from '../sim/tracks/testcircuit.js';
import { makeCar, placeCar, stepCar, updateProgress, hitCar, DT, CAR } from '../sim/car.js';
import { Game, scoreRound, RULES } from '../sim/game.js';
import { ChaseCamera, CAMERA } from '../sim/camera.js';
import { makeBrain, think } from '../sim/ai.js';
import { makeRng } from '../sim/rng.js';

const track = buildTrack(testCircuit);
const players = (n) => Array.from({ length: n }, (_, i) => ({ id: i, name: 'P' + i, color: i, isBot: true }));

function runBots(game, seconds, hook) {
  const rng = makeRng(7);
  const brains = new Map(game.cars.map((c) => [c.id, makeBrain(rng, 0.85)]));
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) {
    for (const c of game.cars) {
      if (!c.alive || !c.near) continue;
      const r = think(brains.get(c.id), c, game, dt);
      game.setInput(c.id, r.steer, r.fire);
    }
    game.update(dt);
    if (hook) hook(game);
  }
}

test('pista: fecha, curvas suaves e comprimento coerente', () => {
  assert.ok(track.length > 800);
  assert.ok(track.minRadius() > track.halfWidth + track.verge, 'raio minimo maior que a largura (sem dobrar a faixa)');
  const a = { x: track.X[0], z: track.Z[0] }, b = { x: track.X[track.N - 1], z: track.Z[track.N - 1] };
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 2, 'ultima amostra encosta na primeira');
});

test('pista: nearest devolve s e d coerentes e progresso e continuo ao dar a volta', () => {
  const near = track.newNear();
  const p = track.pointAt(100);
  track.nearest(p.x + p.nx * 4, p.z + p.nz * 4, -1, near);
  assert.ok(Math.abs(near.s - 100) < 1.5);
  assert.ok(Math.abs(near.d - 4) < 0.2);
  // percorre a linha central duas vezes
  const car = makeCar(0);
  placeCar(car, track, 0, 0);
  for (let s = 0; s < track.length * 2; s += 0.8) {
    const q = track.pointAt(s);
    track.nearest(q.x, q.z, car.near.idx, car.near);
    updateProgress(car, track);
  }
  assert.ok(Math.abs(car.progress - track.length * 2) < 3, 'progresso desenrolado: ' + car.progress);
});

test('carro: cruise control chega a velocidade de cruzeiro na reta', () => {
  const car = makeCar(0);
  placeCar(car, track, 0, 0);
  car.locked = false;
  for (let i = 0; i < 400; i++) { stepCar(car, track, DT, []); updateProgress(car, track); }
  assert.ok(car.speed > CAR.cruise * 0.9, 'velocidade ' + car.speed);
});

test('carro: parede nao e atravessada nem a 120 u/s (sem tunelamento)', () => {
  const car = makeCar(0);
  placeCar(car, track, 300, 0);
  car.locked = false;
  car.state = 'run';
  const lim = track.halfWidth + track.verge;
  for (let i = 0; i < 1200; i++) {
    car.steer = 1; // vira o tempo todo para fora
    car.vx = Math.cos(car.h + 0.6) * 120;
    car.vz = Math.sin(car.h + 0.6) * 120;
    stepCar(car, track, DT, []);
    assert.ok(Math.abs(car.near.d) <= lim + 0.01, 'atravessou a parede: d=' + car.near.d);
  }
});

test('carro: terra tem menos aderencia que asfalto (mais derrapagem)', () => {
  const slip = (surfIdx) => {
    const car = makeCar(0);
    placeCar(car, track, 100, 0);
    car.locked = false;
    for (let i = 0; i < 300; i++) stepCar(car, track, DT, []);
    car.near.idx = car.near.idx; // mantem
    const sv = { ...testCircuit };
    return car;
  };
  const t2 = buildTrack({ ...testCircuit, bridges: [], surfaces: [{ from: 0, to: 1, type: 2 }] });
  const t0 = buildTrack({ ...testCircuit, bridges: [], surfaces: [] });
  const run = (tr) => {
    const car = makeCar(0);
    placeCar(car, tr, 0, 0);
    car.locked = false;
    let maxSlip = 0;
    for (let i = 0; i < 600; i++) {
      car.steer = i > 300 ? 1 : 0;
      stepCar(car, tr, DT, []);
      if (i > 320) maxSlip = Math.max(maxSlip, car.slip);
    }
    return maxSlip;
  };
  assert.ok(run(t2) > run(t0), 'terra derrapa mais');
  assert.ok(slip);
});

test('pontuacao: sobrevivente +2, penultimo +1, primeiro morto -2, demais -1', () => {
  // 5 carros; mortes na ordem 3,1,4,0 ; sobrevivente 2
  const d = scoreRound([3, 1, 4, 0], 2, [0, 1, 2, 3, 4]);
  assert.deepEqual(d, { 0: 1, 1: -1, 2: 2, 3: -2, 4: -1 });
  // 2 jogadores
  assert.deepEqual(scoreRound([1], 0, [0, 1]), { 0: 2, 1: -2 });
  // 3 jogadores
  assert.deepEqual(scoreRound([2, 1], 0, [0, 1, 2]), { 0: 2, 1: 1, 2: -2 });
  // 0 vivos: ultimo a morrer conta como sobrevivente
  assert.deepEqual(scoreRound([1, 2, 0], 0, [0, 1, 2]), { 0: 2, 1: -2, 2: 1 });
});

// carros sinteticos ao longo da pista, usados nos testes de camera
function fakeCars(list) {
  return list.map(([id, s]) => {
    const p = track.pointAt(s);
    return { id, x: p.x, z: p.z, progress: s, near: { s: track.wrapS(s) } };
  });
}
function settle(cam, cars, seconds = 6) {
  cam.computeTarget(cars, track);
  cam.snap();
  for (let t = 0; t < seconds; t += 1 / 60) {
    cam.computeTarget(cars, track);
    cam.update(1 / 60);
  }
}

test('camera: fica atras do pelotao (yaw segue a tangente da pista)', () => {
  const cam = new ChaseCamera(16 / 9);
  const cars = fakeCars([[0, 300], [1, 290]]);
  settle(cam, cars);
  const p = track.pointAt(300 + CAMERA.yawLook);
  const want = Math.atan2(p.tz, p.tx);
  const diff = Math.atan2(Math.sin(cam.yaw - want), Math.cos(cam.yaw - want));
  assert.ok(Math.abs(diff) < 0.05, 'yaw ' + diff);
  // a camera esta atras do lider, no sentido contrario ao rumo
  const behind = (track.pointAt(300).x - cam.x) * Math.cos(cam.yaw) + (track.pointAt(300).z - cam.z) * Math.sin(cam.yaw);
  assert.ok(behind > 10, 'camera atras do lider: ' + behind);
});

test('camera: lider fica no terco superior e nunca e cortado, mesmo muito a frente', () => {
  const cam = new ChaseCamera(16 / 9);
  const cars = fakeCars([[0, 500], [1, 420]]); // lider 80 u a frente
  settle(cam, cars);
  const o = { nx: 0, ny: 0, d: 0 };
  cam.project(cars[0].x, CAMERA.carY, cars[0].z, o);
  assert.ok(o.ny > 0.3 && o.ny <= 1, 'lider em ny=' + o.ny);
  assert.equal(cam.isCut(cars[0].x, cars[0].z), false);
  // mesmo que o lider dispare absurdamente para a frente, a ancora o segue
  const far = fakeCars([[0, 900], [1, 420]]);
  settle(cam, far);
  assert.equal(cam.isCut(far[0].x, far[0].z), false, 'lider nunca sai pela frente');
});

test('camera: zoom out acompanha o retardatario e respeita o limite', () => {
  const cam = new ChaseCamera(16 / 9);
  settle(cam, fakeCars([[0, 300], [1, 296]]));
  const hClose = cam.H;
  assert.equal(hClose, CAMERA.hMin);
  settle(cam, fakeCars([[0, 300], [1, 265]]));
  assert.ok(cam.H > hClose && cam.H < CAMERA.hMax, 'zoom out: ' + cam.H);
  settle(cam, fakeCars([[0, 300], [1, 120]]));
  assert.ok(cam.H <= CAMERA.hMax + 1e-9, 'limite: ' + cam.H);
  assert.ok(Math.abs(cam.H - CAMERA.hMax) < 0.5);
});

test('camera: retardatario alem do limite e cortado por tras', () => {
  const cam = new ChaseCamera(16 / 9);
  const cars = fakeCars([[0, 300], [1, 120]]);
  settle(cam, cars);
  assert.equal(cam.isCut(cars[1].x, cars[1].z), true, 'ficou para tras');
  assert.equal(cam.isCut(cars[0].x, cars[0].z), false);
  assert.ok(cam.edgeRatio(cars[1].x, cars[1].z) > 1);
});

test('partida: carencia de 1 s depois do GO sem corte', () => {
  const game = new Game(players(2), { track, cup: 'fast' });
  game.state = 'RACING';
  for (const c of game.cars) { c.locked = false; c.state = 'run'; }
  game.time = 0;
  // joga o carro 1 muito para tras
  const far = track.pointAt(game.cars[0].progress - 200);
  game.cars[1].x = far.x; game.cars[1].z = far.z;
  game.cars[1].progress -= 200;
  game.step(DT);
  assert.equal(game.cars[1].alive, true, 'dentro da carencia');
  game.time = 1.5;
  game.step(DT);
  assert.equal(game.cars[1].alive, false, 'depois da carencia e cortado');
  assert.equal(game.cars[0].alive, true, 'quem lidera nao e cortado');
});

test('partida: 8 bots — uma unica rodada termina por vez e todos renascem juntos', () => {
  const game = new Game(players(8), { track, cup: 'war', seed: 5 });
  let roundEnds = 0, countdownStarts = 0;
  const alivePerCountdown = [];
  runBots(game, 240, (g) => {
    for (const e of g.drainEvents()) {
      if (e.type === 'roundEnd') {
        roundEnds++;
        assert.equal(g.aliveCars().length <= 1, true, 'so termina com no maximo 1 vivo');
      }
      if (e.type === 'countdown' && e.n === RULES.countdown) {
        countdownStarts++;
        alivePerCountdown.push(g.aliveCars().length);
      }
    }
  });
  assert.ok(roundEnds >= 1, 'pelo menos uma rodada terminou em 4 min');
  for (const n of alivePerCountdown) assert.equal(n, 8, 'todos renascem ao mesmo tempo');
  for (const [, p] of game.points) assert.ok(p >= 0 && p <= RULES.maxPoints);
});

test('partida: sobrevivente e mostrado 0,5 s antes da nova contagem', () => {
  const game = new Game(players(3), { track, cup: 'fast', seed: 3 });
  let sawStand = false, standTime = 0;
  const dt = 1 / 60;
  const rng = makeRng(1);
  const brains = new Map(game.cars.map((c) => [c.id, makeBrain(rng, 0.9)]));
  for (let t = 0; t < 400 && !sawStand; t += dt) {
    for (const c of game.cars) if (c.alive) { const r = think(brains.get(c.id), c, game, dt); game.setInput(c.id, r.steer, false); }
    game.update(dt);
    if (game.state === 'LAST_STAND') sawStand = true;
    // forca uma eliminacao se ninguem morrer sozinho
    if (t > 20 && game.state === 'RACING') game.kill(game.aliveCars()[0], 'cut');
  }
  assert.ok(sawStand);
  while (game.state === 'LAST_STAND') { game.update(dt); standTime += dt; }
  assert.ok(Math.abs(standTime - (RULES.zoomIn + RULES.hold)) < 0.1, 'duracao ' + standTime);
  assert.equal(game.state, 'COUNTDOWN');
  assert.equal(game.aliveCars().length, 3);
});

test('partida: regra de fim por 10 pontos', () => {
  const game = new Game(players(2), { track, cup: 'fast', seed: 9 });
  game.points.set(0, 9);
  game.state = 'RACING';
  for (const c of game.cars) { c.locked = false; c.state = 'run'; }
  game.time = 5;
  game.kill(game.carById(1), 'cut');
  game.step(DT); // avalia fim de rodada
  assert.equal(game.state, 'LAST_STAND');
  for (let i = 0; i < 200; i++) game.update(1 / 60);
  assert.equal(game.state, 'MATCH_END');
  assert.equal(game.winner, 0);
  assert.equal(game.endReason, 'points');
});

test('partida: fim por 3 voltas vence quem tem mais pontos', () => {
  const game = new Game(players(2), { track, cup: 'fast', seed: 9 });
  game.state = 'RACING';
  for (const c of game.cars) { c.locked = false; c.state = 'run'; }
  game.time = 5;
  game.points.set(0, 4);
  game.points.set(1, 8);
  game.carById(0).progress = track.length * RULES.laps + 1; // 0 cruza primeiro
  game.step(DT);
  assert.equal(game.state, 'MATCH_END');
  assert.equal(game.endReason, 'laps');
  assert.equal(game.winner, 1, 'mais pontos vence, mesmo sem cruzar primeiro');
});

test('nao ha falso vencedor durante a contagem (fim so avaliado em RACING)', () => {
  const game = new Game(players(4), { track, cup: 'fast' });
  assert.equal(game.state, 'COUNTDOWN');
  for (const c of game.cars.slice(1)) c.alive = false; // corrida de estados
  for (let i = 0; i < 200; i++) game.step(DT);
  assert.notEqual(game.state, 'LAST_STAND');
});

test('nitro NAO da invulnerabilidade contra minas', () => {
  const game = new Game(players(2), { track, cup: 'fast' });
  game.state = 'RACING';
  for (const c of game.cars) { c.locked = false; c.state = 'run'; }
  const [a, b] = game.cars;
  a.item = 'nitro';
  game.items.use(a, game);
  assert.ok(a.boost > 0);
  game.items.mines.push({ x: a.x + 0.5, z: a.z, owner: b.id, age: 5 });
  game.items.update(DT, game);
  assert.equal(a.state, 'stun', 'carro em nitro foi atingido pela mina');
});

test('missil mira o carro imediatamente a frente no ranking', () => {
  const game = new Game(players(3), { track, cup: 'fast' });
  const [a, b, c] = game.cars;
  a.progress = 300; b.progress = 200; c.progress = 100;
  assert.equal(game.missileTarget(c), b.id);
  assert.equal(game.missileTarget(b), a.id);
});

test('whomp empurra os vizinhos e poupa o dono', () => {
  const game = new Game(players(2), { track, cup: 'fast' });
  game.state = 'RACING';
  for (const c of game.cars) { c.locked = false; c.state = 'run'; c.vx = c.vz = 0; }
  const [a, b] = game.cars;
  b.x = a.x + 5; b.z = a.z;
  a.item = 'whomp';
  game.items.use(a, game);
  for (let i = 0; i < 60; i++) game.items.update(DT, game);
  assert.ok(b.vx > 10, 'empurrado para longe');
  assert.equal(a.vx, 0, 'dono nao e afetado');
});

test('mina: dono nao dispara a propria mina logo apos soltar', () => {
  const game = new Game(players(2), { track, cup: 'super' });
  game.state = 'RACING';
  for (const c of game.cars) { c.locked = false; c.state = 'run'; }
  const a = game.cars[0];
  a.item = 'mine';
  game.items.use(a, game);
  game.items.update(DT, game);
  assert.equal(game.items.mines.length, 1);
  assert.notEqual(a.state, 'stun');
  hitCar(a); // sanidade da funcao
  assert.equal(a.state, 'stun');
});

test('copas: Fast sem caixas, War com mais caixas que Super', () => {
  const n = (cup) => new Game(players(2), { track, cup }).items.boxes.length;
  assert.equal(n('fast'), 0);
  assert.ok(n('war') > n('super') && n('super') > 0);
});
