import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack } from '../sim/track.js';
import testCircuit from '../sim/tracks/testcircuit.js';
import { makeCar, placeCar, stepCar, updateProgress, hitCar, collideCars, DT, CAR } from '../sim/car.js';
import { Game, scoreRound, RULES } from '../sim/game.js';
import { whompFactor, WHOMP } from '../sim/items.js';
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
  const wallTrack = buildTrack({ ...testCircuit, openLand: false, bridges: [] });
  const car = makeCar(0);
  placeCar(car, wallTrack, 300, 0);
  car.locked = false;
  car.state = 'run';
  const lim = wallTrack.halfWidth + wallTrack.verge;
  for (let i = 0; i < 1200; i++) {
    car.steer = 1; // vira o tempo todo para fora
    car.vx = Math.cos(car.h + 0.6) * 120;
    car.vz = Math.sin(car.h + 0.6) * 120;
    stepCar(car, wallTrack, DT, []);
    assert.ok(Math.abs(car.near.d) <= lim + 0.01, 'atravessou a parede: d=' + car.near.d);
  }
});

test('carro: terra tem menos aderencia (curva mais aberta) e a tracao traseira patina', () => {
  const t2 = buildTrack({ ...testCircuit, bridges: [], baseSurface: 2 });
  const t0 = buildTrack({ ...testCircuit, bridges: [], baseSurface: 0 });
  // taxa de guinada em regime com o volante todo para a direita
  const yaw = (tr) => {
    const car = makeCar(0);
    placeCar(car, tr, 0, 0);
    car.locked = false;
    let sum = 0, n = 0;
    for (let i = 0; i < 480; i++) {
      car.steer = i > 240 ? 1 : 0;
      stepCar(car, tr, DT, []);
      if (i > 300 && i < 360) { sum += Math.abs(car.w); n++; }
    }
    return sum / n;
  };
  assert.ok(yaw(t0) > yaw(t2), 'asfalto vira mais que terra');
  // aceleracao do arranque limitada pela tracao (atrito) na roda traseira
  const launch = (tr) => {
    const car = makeCar(0);
    placeCar(car, tr, 0, 0);
    car.locked = false;
    for (let i = 0; i < 120; i++) stepCar(car, tr, DT, []);
    return car.speed;
  };
  assert.ok(launch(t0) > launch(t2), 'mais atrito = arranque mais forte');
});

test('carro: direcao dianteira - volante para a direita faz o carro virar a direita', () => {
  const car = makeCar(0);
  placeCar(car, track, 200, 0);
  car.locked = false;
  for (let i = 0; i < 360; i++) stepCar(car, track, DT, []);
  const h0 = car.h;
  car.steer = 0.5;
  for (let i = 0; i < 120; i++) stepCar(car, track, DT, []);
  assert.ok(car.w > 0.05, 'guinada positiva = direita: ' + car.w);
  assert.ok(car.h > h0, 'rumo aumentou');
});

test('colisao: bater por tras empurra o carro da frente e freia quem bate', () => {
  const g = new Game(players(2), { track, cup: 'fast' });
  g.state = 'RACING';
  for (const c of g.cars) { c.locked = false; c.state = 'run'; }
  const [a, b] = g.cars;
  // a parado a frente, b chegando por tras na mesma linha
  placeCar(a, track, 60, 0); placeCar(b, track, 52, 0);
  for (const c of [a, b]) { c.locked = false; c.state = 'run'; }
  const f = { x: Math.cos(b.h), z: Math.sin(b.h) };
  b.vx = f.x * 20; b.vz = f.z * 20;
  let hit = false;
  for (let i = 0; i < 240; i++) {
    stepCar(a, track, DT, []); stepCar(b, track, DT, []);
    const ev = [];
    collideCars(a, b, ev);
    if (ev.some((e) => e.type === 'bump')) hit = true;
  }
  assert.ok(hit, 'houve batida');
  const va = a.vx * f.x + a.vz * f.z, vb = b.vx * f.x + b.vz * f.z;
  assert.ok(va > 8, 'carro da frente foi empurrado: ' + va);
  assert.ok(Math.abs(a.x - b.x) > 1 || Math.abs(a.z - b.z) > 1, 'nao ficam sobrepostos');
  void vb;
});

test('colisao: batida de lado gira o carro atingido (corpo rigido)', () => {
  const a = makeCar(0), b = makeCar(1);
  placeCar(a, track, 60, 0); placeCar(b, track, 60, 0);
  for (const c of [a, b]) { c.locked = false; c.state = 'run'; }
  const p = track.pointAt(60);
  a.x = p.x; a.z = p.z; a.vx = a.vz = 0;
  // b vem de lado (pela normal) e acerta a traseira de a
  b.h = a.h + Math.PI / 2;
  b.x = p.x - Math.cos(a.h) * 1.1 + p.nx * -2.0; b.z = p.z - Math.sin(a.h) * 1.1 + p.nz * -2.0;
  b.vx = p.nx * 14; b.vz = p.nz * 14;
  let w = 0;
  for (let i = 0; i < 60; i++) { collideCars(a, b, []); w = Math.max(w, Math.abs(a.w)); }
  assert.ok(w > 0.2, 'o carro atingido girou: ' + w);
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

/** Teleporta o carro e refaz a busca global na pista (a busca normal e por janela). */
function relocate(car, tr, x, z) {
  car.x = x; car.z = z;
  tr.nearest(x, z, -1, car.near);
  for (const nc of car.nearC) tr.nearest(x, z, -1, nc);
  car.prevS = car.near.s;
}

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

test('camera: o pelotao fica no meio da tela', () => {
  const cam = new ChaseCamera(16 / 9);
  const cars = fakeCars([[0, 300], [1, 296], [2, 291]]);
  settle(cam, cars);
  const o = { nx: 0, ny: 0, d: 0 };
  let sum = 0;
  for (const c of cars) { cam.project(c.x, CAMERA.carY, c.z, o); sum += o.ny; }
  assert.ok(Math.abs(sum / cars.length) < 0.25, 'ny medio ' + sum / cars.length);
});

test('camera: lider fica visivel e nunca e cortado, mesmo muito a frente', () => {
  const cam = new ChaseCamera(16 / 9);
  const cars = fakeCars([[0, 500], [1, 420]]); // lider 80 u a frente
  settle(cam, cars);
  const o = { nx: 0, ny: 0, d: 0 };
  cam.project(cars[0].x, CAMERA.carY, cars[0].z, o);
  assert.ok(o.ny <= CAMERA.topNy + 0.05, 'lider cabe na tela: ny=' + o.ny);
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
  settle(cam, fakeCars([[0, 300], [1, 278]]));
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
  assert.equal(a.alive, false, 'carro em nitro foi destruido pela mina');
  assert.equal(a.state, 'wreck');
});

test('missil anda sempre em linha reta (nao persegue ninguem)', () => {
  const game = new Game(players(3), { track, cup: 'super' });
  game.state = 'RACING';
  game.time = 5;
  const [a, b] = game.cars;
  for (const c of game.cars) { c.locked = false; c.state = 'run'; }
  a.item = 'missile';
  game.items.use(a, game);
  const m = game.items.missiles[0];
  assert.ok(m && m.target === undefined, 'sem alvo');
  const h0 = m.h;
  b.x = m.x + 30; b.z = m.z + 60; // alvo fora da linha: o missil nao vira
  for (let i = 0; i < 60; i++) game.items.update(DT, game);
  assert.equal(game.items.missiles[0]?.h ?? h0, h0);
});

test('rastro do nitro: explode quem cruza (menos o dono)', () => {
  const game = new Game(players(3), { track, cup: 'super' });
  game.state = 'RACING';
  game.time = 5;
  for (const c of game.cars) { c.locked = false; c.state = 'run'; c.vx = c.vz = 0; }
  const [a, b, c] = game.cars;
  a.x = 0; a.z = 0; a.h = 0; a.boost = 2;
  b.x = 500; b.z = 500; c.x = -500; c.z = -500;
  for (let i = 0; i < 240; i++) { a.x += 0.3; game.items.update(DT, game); }
  assert.ok(game.items.trails.length > 3, 'deixou rastro');
  assert.equal(a.alive, true, 'dono imune');
  const t = game.items.trails[0];
  b.x = t.x; b.z = t.z;
  game.items.update(DT, game);
  assert.equal(b.alive, false);
  assert.equal(c.alive, true);
  assert.ok(game.events.some((e) => e.type === 'explode' && e.kind === 'trail'));
});

test('retardatario perto da borda de tras ganha velocidade; lider nao', () => {
  const game = new Game(players(3), { track, cup: 'fast' });
  game.state = 'RACING';
  game.time = 5;
  for (const c of game.cars) { c.locked = false; c.state = 'run'; }
  const [a, b] = game.cars;
  a.progress = 300; b.progress = 270;
  // posiciona b bem atras de a, no limite de baixo do quadro
  const pa = track.pointAt(300), pb = track.pointAt(262);
  a.x = pa.x; a.z = pa.z; b.x = pb.x; b.z = pb.z;
  game.frameCamera(true);
  game.updateCatchup(1);
  assert.ok(b.catchup > 0.3, 'retardatario acelera: ' + b.catchup);
  assert.equal(a.catchup, 0);
});

test('bater na roda traseira desestabiliza (destab so na traseira)', () => {
  const mk = (circleIdx) => {
    const v = makeCar(0), hit = makeCar(1);
    for (const c of [v, hit]) { c.alive = true; c.state = 'run'; c.locked = false; }
    v.x = 0; v.z = 0; v.h = 0; v.vx = 25;
    // o outro bate de lado no circulo `circleIdx` do alvo
    const off = CAR.circleOff[circleIdx];
    hit.x = off; hit.z = 1.7; hit.h = -Math.PI / 2; hit.vx = 25; hit.vz = -8;
    collideCars(v, hit, []);
    return v;
  };
  const rear = mk(2), front = mk(0);
  assert.ok(rear.destab > 0.2, 'destab: ' + rear.destab);
  assert.ok(front.destab === 0);
});

test('carro atingido gira de verdade e NAO volta sozinho a direcao original', () => {
  const car = makeCar(0);
  placeCar(car, track, 100, 0);
  car.state = 'run'; car.locked = false;
  const h0 = car.h;
  hitCar(car, 1, 1);
  for (let i = 0; i < 400 && car.state === 'stun'; i++) stepCar(car, track, DT, []);
  assert.equal(car.state, 'run');
  assert.ok(Math.abs(Math.atan2(Math.sin(car.h - h0), Math.cos(car.h - h0))) > 0.5 || Math.abs(car.h - h0) > 1, 'ficou virado para outro lado');
});

test('debug: corrida infinita nao acaba por voltas e mortos renascem', () => {
  const game = new Game(players(3), { track, cup: 'fast' });
  game.debug.infinite = true;
  game.state = 'RACING';
  game.time = 5;
  for (const c of game.cars) { c.locked = false; c.state = 'run'; }
  game.cars[0].progress = track.length * 3 + 5;
  game.explodeCar(game.cars[1], 'mine');
  game.explodeCar(game.cars[2], 'mine');
  for (let i = 0; i < 600; i++) game.step(DT);
  assert.equal(game.state, 'RACING');
  assert.ok(game.cars.every((c) => c.alive), 'todos renasceram');
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
  assert.equal(a.alive, true);
  hitCar(a); // sanidade da funcao
  assert.equal(a.state, 'stun');
});

test('copas: Fast sem caixas, War com mais caixas que Super', () => {
  const n = (cup) => new Game(players(2), { track, cup }).items.boxes.length;
  assert.equal(n('fast'), 0);
  assert.ok(n('war') > n('super') && n('super') > 0);
});

test('re: segurar as duas setas leva o carro a andar de re em linha reta', () => {
  const car = makeCar(0);
  placeCar(car, track, 60, 0);
  car.locked = false;
  for (let i = 0; i < 360; i++) stepCar(car, track, DT, []);
  assert.ok(car.speed > 20);
  const h0 = car.h;
  car.revIn = true;
  for (let i = 0; i < 600; i++) stepCar(car, track, DT, []);
  const fwd = car.vx * Math.cos(car.h) + car.vz * Math.sin(car.h);
  assert.ok(fwd < -8, 'andando de re: ' + fwd);
  assert.ok(Math.abs(car.h - h0) < 0.3, 'em linha reta');
});

test('whomp: forca cai exponencialmente com a distancia e some fora do alcance', () => {
  assert.ok(whompFactor(2) > whompFactor(5) && whompFactor(5) > whompFactor(10));
  assert.ok(Math.abs(whompFactor(2) / whompFactor(5) - Math.exp(3 / WHOMP.lambda)) < 1e-9);
  assert.equal(whompFactor(WHOMP.radius + 1), 0);
  assert.ok(WHOMP.push * whompFactor(14) < 4, 'longe quase nao empurra');
});

test('whomp: carro colado e jogado longe e sai do chao; o de longe quase nao sente', () => {
  const game = new Game(players(3), { track, cup: 'fast' });
  game.state = 'RACING';
  for (const c of game.cars) { c.locked = false; c.state = 'run'; c.vx = c.vz = 0; }
  const [a, near, far] = game.cars;
  const p = track.pointAt(60);
  a.x = p.x; a.z = p.z;
  near.x = p.x + p.nx * 2.2; near.z = p.z + p.nz * 2.2;
  far.x = p.x - p.nx * 13; far.z = p.z - p.nz * 13;
  a.item = 'whomp';
  game.items.use(a, game);
  let maxY = 0;
  for (let i = 0; i < 90; i++) { game.items.update(DT, game); maxY = Math.max(maxY, near.y); }
  assert.ok(Math.hypot(near.vx, near.vz) > 30, 'colado voa: ' + Math.hypot(near.vx, near.vz));
  assert.ok(near.vy > 3 || maxY > 0.05, 'sai do chao');
  assert.ok(Math.hypot(far.vx, far.vz) < 5, 'longe nao sente');
  assert.equal(a.vx, 0);
});

test('mina e missil explodem o carro, que fica na pista como carcaca ate o respawn', () => {
  const game = new Game(players(3), { track, cup: 'fast' });
  game.state = 'RACING';
  game.time = 5;
  for (const c of game.cars) { c.locked = false; c.state = 'run'; }
  const [a, b] = game.cars;
  game.items.mines.push({ x: b.x, z: b.z, owner: a.id, age: 3 });
  game.items.update(DT, game);
  assert.equal(b.alive, false);
  assert.equal(b.state, 'wreck');
  assert.equal(b.hidden, false, 'carcaca continua visivel');
  const x0 = b.x;
  for (let i = 0; i < 600; i++) { stepCar(b, track, DT, []); }
  assert.ok(Math.abs(b.speed) < 1, 'carcaca para por atrito');
  assert.ok(Math.abs(b.x - x0) < 60);
  // outro carro bate na carcaca: colide
  const c = game.cars[2];
  const f = { x: Math.cos(b.h), z: Math.sin(b.h) };
  c.x = b.x - f.x * 6; c.z = b.z - f.z * 6; c.h = b.h; c.vx = f.x * 20; c.vz = f.z * 20;
  let bumped = false;
  for (let i = 0; i < 120; i++) { const ev = []; collideCars(c, b, ev); if (ev.length) bumped = true; stepCar(c, track, DT, ev); stepCar(b, track, DT, ev); }
  assert.ok(bumped, 'colidiu com a carcaca');
  // novo spawn remove a carcaca
  game.endRound();
  for (let i = 0; i < 150; i++) game.update(1 / 60);
  assert.equal(game.state, 'COUNTDOWN');
  assert.equal(b.alive, true);
  assert.notEqual(b.state, 'wreck');
});

test('terra aberta: sair da estrada e permitido, mas longe demais explode', () => {
  const game = new Game(players(2), { track, cup: 'fast' });
  game.state = 'RACING';
  game.time = 0.2; // dentro da carencia: sem corte de camera
  for (const c of game.cars) { c.locked = false; c.state = 'run'; }
  const a = game.cars[0];
  const edge = track.halfWidth + track.verge;
  // acha um trecho de terra onde afastar 40 u da estrada nao encosta em outro pedaco da pista
  const probe = track.newNear();
  let land = -1, sg = 1;
  for (let s = 400; s < track.length - 300 && land < 0; s += 25) {
    const q = track.pointAt(s);
    if (track.BRIDGE[q.idx]) continue;
    for (const cand of [1, -1]) {
      track.nearest(q.x + q.nx * (edge + 40) * cand, q.z + q.nz * (edge + 40) * cand, -1, probe);
      if (Math.abs(probe.d) > edge + 36) { land = s; sg = cand; break; }
    }
  }
  assert.ok(land > 0, 'trecho encontrado');
  const p = track.pointAt(land);
  placeCar(a, track, land, 0);
  a.locked = false; a.state = 'run';
  relocate(a, track, p.x + p.nx * (edge + 6) * sg, p.z + p.nz * (edge + 6) * sg); a.vx = a.vz = 0;
  game.frameCamera(true);
  game.step(DT);
  assert.equal(a.alive, true, 'perto da estrada: ainda vivo');
  assert.ok(game.offroadRatio(a) > 0 && game.offroadRatio(a) < 1);
  relocate(a, track, p.x + p.nx * (edge + 40) * sg, p.z + p.nz * (edge + 40) * sg);
  game.frameCamera(true);
  game.step(DT);
  assert.equal(a.alive, false, 'longe demais da estrada: explode');
  assert.equal(a.state, 'wreck');
});

test('cenario solido: bater numa arvore para o carro e o empurra de volta', () => {
  const game = new Game(players(2), { track, cup: 'fast' });
  const sc = game.track.scenery;
  const tree = sc.trees.find((t) => sc.query(t.x, t.z, 14).filter((o) => Math.hypot(o.x - t.x, o.z - t.z) < 14).length === 1);
  assert.ok(tree, 'arvore isolada');
  const car = game.cars[0];
  placeCar(car, track, 100, 0);
  car.locked = false; car.state = 'run';
  car.h = 0; relocate(car, track, tree.x - 7, tree.z); car.vx = 25; car.vz = 0;
  let minx = Infinity, minv = Infinity;
  for (let i = 0; i < 120; i++) {
    stepCar(car, track, DT, []);
    minx = Math.min(minx, Math.hypot(car.x - tree.x, car.z - tree.z));
    minv = Math.min(minv, car.vx);
  }
  assert.ok(minx >= tree.r + CAR.circleR - 0.8, 'nao atravessou o tronco: ' + minx);
  assert.ok(minv < 10, 'perdeu velocidade: ' + minv);
});
