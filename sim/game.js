// Partida: rodadas por eliminacao, pontuacao, respawn coletivo, camera e itens.
import { makeCar, placeCar, stepCar, updateProgress, collideCars, startFall, impulseCar, hullPos, HULL, DT, CAR } from './car.js';
import { qmat, makeWheel, stepWheel, WHEEL } from './body.js';
import { ChaseCamera } from './camera.js';
import { Items } from './items.js';
import { buildScenery } from './scenery.js';
import { makeRng } from './rng.js';

const BOXCG = 1.1; // altura do centro de massa do carro (sim/body.js BOX.cg)
const CLW = { pen: 0, nx: 0, nz: 0 };
const HPW = { x: 0, z: 0 };

/** Rampa do retardatario: a partir de `from` (ny na tela) comeca a acelerar, ate o maximo em `to`. */
export const CATCHUP = { from: -0.3, to: -0.8 };

export const RULES = {
  startPoints: 5,
  maxPoints: 10,
  laps: 3,
  countdown: 3,
  cutGrace: 1.0, // segundos apos o GO sem corte de camera
  zoomIn: 0.3, // zoom rapido no sobrevivente
  hold: 0.5, // tempo mostrando o sobrevivente
  gridRowGap: 7.5,
  gridBehind: 10, // "um pouco antes" de onde o sobrevivente ficou
};

/** Posicao do i-esimo carro na grade: distancia atras da frente e lado (-1/+1). */
export function gridSlot(i) {
  const row = Math.floor(i / 2), col = i % 2;
  return { back: row * RULES.gridRowGap + col * 2.5, side: col ? 1 : -1 };
}

/** Aplica a pontuacao da rodada. `deaths` = ids na ordem em que morreram. Retorna {id: delta}. */
export function scoreRound(deaths, survivorId, allIds) {
  const delta = {};
  for (const id of allIds) delta[id] = 0;
  const dead = deaths.filter((id) => id !== survivorId);
  delta[survivorId] = 2;
  if (dead.length) {
    delta[dead[0]] = -2; // primeiro a morrer
    for (const id of dead.slice(1)) delta[id] = -1;
    if (dead.length >= 2) delta[dead[dead.length - 1]] = 1; // penultimo a morrer (ultimo dos mortos)
  }
  return delta;
}

export class Game {
  /**
   * players: [{id,name,color,isBot}]
   * opts: { track, cup, seed, aspect }
   */
  constructor(players, opts) {
    this.track = opts.track;
    if (!this.track.scenery) this.track.scenery = buildScenery(this.track);
    this.cup = opts.cup || 'super';
    this.rng = makeRng(opts.seed ?? 1234);
    this.cars = players.map((p) => makeCar(p.id, p));
    this.points = new Map(this.cars.map((c) => [c.id, RULES.startPoints]));
    this.items = new Items(this.track, this.cup, this.rng);
    this.camera = new ChaseCamera(opts.aspect || 16 / 9);
    this.events = [];
    this.nextWheel = 0;
    this.wheels = []; // pneus soltos pelas explosoes (corpos fisicos ate o proximo spawn)
    this.state = 'COUNTDOWN';
    this.timer = 0;
    this.time = 0; // tempo dentro da rodada racing
    this.round = 0;
    this.acc = 0;
    this.deaths = [];
    this.survivorId = -1;
    this.lastDelta = null;
    this.winner = null;
    this.endReason = null;
    this.countN = RULES.countdown;
    // modo debug (so o host liga): corrida infinita, sem corte, carros imortais
    this.debug = { infinite: false, noCut: false };
    this.startRound(-4);
  }

  /** Quao perto da explosao por sair da pista (1 = explode). So vale onde o terreno e aberto. */
  offroadRatio(car) {
    const t = this.track;
    if (!car.near || !t.def.openLand || t.hardWall(car.near.idx)) return 0;
    const out = Math.abs(car.near.d) - (t.halfWidth + t.verge);
    return Math.max(0, out) / CAR.offroadMax;
  }

  carById(id) { return this.cars.find((c) => c.id === id) || null; }
  aliveCars() { return this.cars.filter((c) => c.alive); }
  get ids() { return this.cars.map((c) => c.id); }
  lapOf(car) { return Math.max(1, Math.floor(car.progress / this.track.length) + 1); }

  /** Posiciona todos os carros ao mesmo tempo na grade, com frente em `frontProgress`. */
  startRound(frontProgress, order = null) {
    this.round++;
    const cars = order ? order.map((id) => this.carById(id)) : this.cars.slice();
    cars.forEach((car, i) => {
      const slot = gridSlot(i);
      car.hidden = false;
      car.wantFire = false;
      placeCar(car, this.track, frontProgress - slot.back, slot.side * this.track.halfWidth * 0.36);
    });
    this.items.reset();
    this.wheels.length = 0;
    this.deaths = [];
    this.survivorId = -1;
    this.time = 0;
    this.state = 'COUNTDOWN';
    this.timer = RULES.countdown;
    this.countN = RULES.countdown;
    this.events.push({ type: 'countdown', n: this.countN });
    this.frameCamera(true);
  }

  frameCamera(snap = false) {
    const alive = this.aliveCars();
    this.camera.fast = 1;
    this.camera.computeTarget(alive.length ? alive : this.cars, this.track);
    if (snap) this.camera.snap();
  }

  ranking() {
    return this.aliveCars().sort((a, b) => b.progress - a.progress);
  }
  leaderId() {
    let best = null;
    for (const c of this.cars) if (c.alive && (!best || c.progress > best.progress)) best = c;
    return best ? best.id : -1;
  }

  setInput(id, steer, fire, rev = false) {
    const c = this.carById(id);
    if (!c) return;
    c.revIn = !!rev;
    c.steer = Math.max(-1, Math.min(1, steer));
    if (fire) c.wantFire = true;
  }

  kill(car, cause) {
    if (!car.alive) return;
    car.alive = false;
    car.item = null;
    if (car.freeze > 0) { this.events.push({ type: 'unfreeze', car: car.id, x: car.x, y: car.y, z: car.z, shatter: true }); car.freeze = 0; }
    this.deaths.push(car.id);
    this.events.push({ type: 'dead', car: car.id, cause, x: car.x, z: car.z });
    if (car.state === 'falling') return; // cai na agua: some depois da animacao
    // qualquer outra morte deixa uma CARCACA na pista ate o proximo spawn. Ela mantem a velocidade (e o
    // motor "preso" ainda empurra um pouco): quem decide o giro e o capotamento e a fisica, nao um valor fixo.
    car.state = 'wreck';
    car.wreckT = 0;
    car.hidden = false;
    car.locked = false;
    car.asleep = false;
    car.restT = 0;
    car.thrust = Math.max(0, car.drive || 0) * 0.8;
    car.boost = 0;
    car.stun = 0;
    car.ox = car.oz = 0;
    car.revIn = false;
  }

  /** Congela o carro dentro de um cubo de gelo por `t` segundos (ele desliza em linha reta e perde o controle). */
  freezeCar(car, t) {
    if (!car.alive || car.state === 'falling' || car.state === 'wreck') return;
    car.freeze = Math.max(car.freeze, t);
    car.boost = 0;
    car.revIn = false;
    car.w *= 0.3;
    this.events.push({ type: 'freeze', car: car.id, t });
  }

  /** Explode o carro (mina, missil, camera, longe da pista): elimina e deixa a carcaca. */
  explodeCar(car, cause, by = -1, ex = car.x, ez = car.z) {
    if (!car.alive || car.state === 'falling' || car.god) return;
    this.events.push({ type: 'explode', kind: cause, x: car.x, z: car.z, owner: by, car: car.id });
    this.kill(car, cause);
    // a onda de choque empurra o carro para longe do epicentro, aplicada fora do centro de massa (gera giro)
    const dx = car.x - ex, dz = car.z - ez, d = Math.hypot(dx, dz);
    const nx = d > 0.05 ? dx / d : Math.cos(car.h), nz = d > 0.05 ? dz / d : Math.sin(car.h);
    const lat = (this.rng() - 0.5) * 2.2;
    impulseCar(car, nx * 13, 9, nz * 13, -nx * 1.1 - nz * lat, -0.5, -nz * 1.1 + nx * lat, CAR.wreckMass * 0.5);
    car.asleep = false;
    this.spawnWheels(car, nx, nz);
  }

  /** Os 4 pneus saem do carro como corpos fisicos: herdam velocidade e giro e ganham o empurrao da explosao. */
  spawnWheels(car, nx, nz) {
    if (this.wheels.length > 40) this.wheels.splice(0, this.wheels.length - 36); // limite (modo debug nao reinicia a rodada)
    const m = qmat(car.q);
    const w = [car.ox, -car.w, car.oz];
    const cgx = BOXCG * m[1], cgy = BOXCG * m[4], cgz = BOXCG * m[7];
    const sc = 0.72, ax = [m[2], m[5], m[8]];
    const vf = car.vx * m[0] + car.vy * m[3] + car.vz * m[6]; // velocidade ao longo da frente
    for (const [lx, ly, lz] of [[1.6, 0.82, 1.38], [1.6, 0.82, -1.38], [-1.6, 0.82, 1.38], [-1.6, 0.82, -1.38]]) {
      const ox = (m[0] * lx + m[1] * ly + m[2] * lz) * sc, oy = (m[3] * lx + m[4] * ly + m[5] * lz) * sc, oz = (m[6] * lx + m[7] * ly + m[8] * lz) * sc;
      const rx = ox - cgx, ry = oy - cgy, rz = oz - cgz;
      const v = [
        car.vx + w[1] * rz - w[2] * ry + nx * (3 + this.rng() * 5) + (this.rng() - 0.5) * 3,
        car.vy + w[2] * rx - w[0] * rz + 2 + this.rng() * 4,
        car.vz + w[0] * ry - w[1] * rx + nz * (3 + this.rng() * 5) + (this.rng() - 0.5) * 3,
      ];
      const spin = -vf / WHEEL.r;
      const ww = [w[0] + ax[0] * spin, w[1] + ax[1] * spin, w[2] + ax[2] * spin];
      this.wheels.push(makeWheel(this.nextWheel++, car.x + ox, car.y + oy, car.z + oz, v, ww, car.q, car.near ? car.near.idx : -1));
    }
  }

  /** Pneus soltos: fisica propria + colisao com carros, carcacas, cenario, muros e falesias. */
  stepWheels(dt) {
    const rw = WHEEL.r;
    for (const w of this.wheels) {
      if (w.dead) continue;
      if (w.asleep) { if (this.wheelHit(w, rw, false)) { w.asleep = false; w.rest = 0; } continue; }
      stepWheel(w, this.track, dt, CAR.gravity);
      this.wheelHit(w, rw, true);
    }
  }

  /** Resolve colisoes do pneu `w`; true se algo o tocou. */
  wheelHit(w, rw, full) {
    let hit = false;
    const tr = this.track;
    for (const c of this.cars) {
      if (c.state === 'falling' || c.state === 'dead' || w.y > c.y + 2.4 || w.y < c.y - 0.5) continue;
      const mc = c.state === 'wreck' ? CAR.wreckMass : 1;
      for (let i = 0; i < HULL.length; i++) {
        hullPos(c, i, HPW);
        const dx = w.x - HPW.x, dz = w.z - HPW.z;
        const rr = CAR.circleR + rw, d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr || d2 < 1e-9) continue;
        const d = Math.sqrt(d2), nx = dx / d, nz = dz / d;
        w.x += nx * (rr - d); w.z += nz * (rr - d);
        const vn = (w.v[0] - c.vx) * nx + (w.v[2] - c.vz) * nz;
        if (vn < 0) {
          const j = (-(1.45) * vn) / (1 / WHEEL.mass + 1 / mc);
          w.v[0] += (j * nx) / WHEEL.mass; w.v[2] += (j * nz) / WHEEL.mass;
          c.vx -= (j * nx) / mc; c.vz -= (j * nz) / mc;
          if (-vn > 3) this.events.push({ type: 'bump', a: c.id, b: c.id, x: w.x, z: w.z, strength: Math.min(1, -vn / 22) });
        }
        hit = true;
      }
    }
    if (!full) return hit;
    const list = tr.scenery ? tr.scenery.query(w.x, w.z, 4, w._q || (w._q = [])) : [];
    for (const o of list) {
      if (w.y > (o.top ?? 99) + rw) continue;
      const dx = w.x - o.x, dz = w.z - o.z, rr = rw + o.r, d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr || d2 < 1e-9) continue;
      const d = Math.sqrt(d2), nx = dx / d, nz = dz / d;
      w.x += nx * (rr - d); w.z += nz * (rr - d);
      const vn = w.v[0] * nx + w.v[2] * nz;
      if (vn < 0) { w.v[0] -= 1.5 * vn * nx; w.v[2] -= 1.5 * vn * nz; }
      hit = true;
    }
    const nr = tr._gn;
    if (nr && tr.hasElev && tr.cliffAt(w.x, w.z, w.y, rw, w.hint, CLW)) {
      w.x -= CLW.nx * CLW.pen; w.z -= CLW.nz * CLW.pen;
      const vn = w.v[0] * CLW.nx + w.v[2] * CLW.nz;
      if (vn > 0) { w.v[0] -= 1.5 * vn * CLW.nx; w.v[2] -= 1.5 * vn * CLW.nz; }
      hit = true;
    }
    if (nr) {
      if (tr.hardWall(nr.idx)) {
        const maxD = tr.hwAt(nr.idx) + tr.verge - rw, ad = Math.abs(nr.d);
        if (ad > maxD) {
          const sg = nr.d > 0 ? 1 : -1, nx = nr.nx * sg, nz = nr.nz * sg;
          w.x -= nx * (ad - maxD); w.z -= nz * (ad - maxD);
          const vn = w.v[0] * nx + w.v[2] * nz;
          if (vn > 0) { w.v[0] -= 1.5 * vn * nx; w.v[2] -= 1.5 * vn * nz; }
          hit = true;
        }
      }
      if (w.y < 0.3 && (tr.inWater(nr) || (tr.hasChasm && tr.chasmAt(nr)))) w.dead = true; // cai no rio/precipicio e some
    }
    return hit;
  }

  /** Avanca a simulacao `dt` segundos reais em passos fixos. */
  update(dt) {
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= DT) {
      this.acc -= DT;
      this.step(DT);
    }
    this.camera.update(dt);
  }

  step(dt) {
    switch (this.state) {
      case 'COUNTDOWN': return this.stepCountdown(dt);
      case 'RACING': return this.stepRacing(dt);
      case 'LAST_STAND': return this.stepLastStand(dt);
      default: return; // MATCH_END: congelado
    }
  }

  stepCountdown(dt) {
    this.timer -= dt;
    const n = Math.ceil(this.timer);
    if (n < this.countN && n > 0) {
      this.countN = n;
      this.events.push({ type: 'countdown', n });
    }
    for (const c of this.cars) this.physics(c, dt);
    // separa qualquer sobreposicao antes do GO (nada de impulso explosivo na largada)
    for (let i = 0; i < this.cars.length; i++) {
      for (let j = i + 1; j < this.cars.length; j++) collideCars(this.cars[i], this.cars[j], this.events);
    }
    this.frameCamera();
    if (this.timer <= 0) {
      this.state = 'RACING';
      this.time = 0;
      for (const c of this.cars) { c.locked = false; c.state = 'run'; }
      this.events.push({ type: 'go' });
    }
  }

  physics(car, dt) {
    if (car.state === 'dead') return;
    stepCar(car, this.track, dt, this.events);
    updateProgress(car, this.track);
  }

  stepRacing(dt) {
    this.time += dt;
    this.updateCatchup(dt);
    this.stepWheels(dt);
    for (const c of this.cars) {
      if (c.wantFire) {
        c.wantFire = false;
        this.items.use(c, this);
      }
      this.physics(c, dt);
      if (c.alive && c.near) {
        // rio ao lado da ponte: afunda; longe demais da estrada: explode
        if (c.state !== 'falling' && c.y <= 0.3 && this.track.inWater(c.near)) startFall(c, this.events, 'fall');
        else if (c.state !== 'falling' && c.y <= 0.3 && this.track.hasChasm && this.track.chasmAt(c.near)) startFall(c, this.events, 'chasm');
        if (c.state !== 'falling' && !this.debug.noCut && this.offroadRatio(c) > 1) this.explodeCar(c, 'offroad');
      }
      if (c.state === 'wreck' && c.near && c.y <= 0.3) {
        // carcaca jogada no rio/precipicio tambem cai (nao fica flutuando)
        if (this.track.inWater(c.near)) startFall(c, this.events, 'fall');
        else if (this.track.hasChasm && this.track.chasmAt(c.near)) startFall(c, this.events, 'chasm');
      }
      if (c.alive && c.state === 'falling') this.kill(c, c.fallCause === 'chasm' ? 'chasm' : 'fall');
    }
    const live = this.cars.filter((c) => c.alive || c.state === 'wreck');
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) collideCars(live[i], live[j], this.events);
    }
    this.items.update(dt, this);

    this.frameCamera();
    // corte pelo enquadramento da camera
    if (this.time > RULES.cutGrace && !this.debug.noCut) {
      const lead = this.leaderId(); // o lider nunca e cortado
      for (const c of this.cars) {
        if (c.alive && c.id !== lead && this.camera.isCut(c.x, c.z, c.y)) this.explodeCar(c, 'cut');
      }
    }

    if (this.debug.infinite) { this.debugRespawn(); return; } // debug: corrida infinita
    // fim de partida por voltas
    let leader = null;
    for (const c of this.cars) if (c.alive && (!leader || c.progress > leader.progress)) leader = c;
    if (leader && leader.progress >= this.track.length * RULES.laps) {
      return this.endMatch('laps', leader.id);
    }
    // fim de rodada: so avaliado em RACING (evita falso vencedor no respawn)
    if (this.cars.length >= 2 && this.cars.filter((c) => c.alive).length <= 1) this.endRound();
  }

  /** Retardatario perto de sair do quadro ganha velocidade ate voltar para perto do centro da tela. */
  updateCatchup(dt) {
    const lead = this.leaderId();
    const o = this._o || (this._o = { nx: 0, ny: 0, d: 0 });
    const cam = this.camera;
    for (const c of this.cars) {
      let want = 0;
      if (c.alive && c.state === 'run' && c.id !== lead) {
        cam.project(c.x, c.y + 0.5, c.z, o);
        const ny = o.d > 0.1 ? o.ny : -9;
        want = Math.max(0, Math.min(1, (CATCHUP.from - ny) / (CATCHUP.from - CATCHUP.to)));
      }
      c.catchup += (want - c.catchup) * Math.min(1, 5 * dt);
    }
  }

  /** Debug: carros mortos renascem onde estavam, para a corrida nunca acabar. */
  debugRespawn() {
    this.deaths.length = 0;
    let n = 0;
    for (const c of this.cars) {
      const gone = c.state === 'dead' || (c.state === 'wreck' && c.wreckT > 2.2);
      if (c.alive || !gone) continue;
      // renasce junto do pelotao (se renascesse onde morreu, a camera o cortaria de novo)
      const alive = this.cars.filter((o) => o.alive);
      const front = alive.length ? alive.reduce((m, o) => Math.max(m, o.progress), -1e9) - 8 : c.progress;
      // varios renascendo juntos usam espacos da grade diferentes (nunca um dentro do outro)
      const slot = gridSlot(n++);
      placeCar(c, this.track, front - slot.back, slot.side * this.track.halfWidth * 0.36);
      c.hidden = false;
      c.locked = false;
      c.state = 'run';
      c.vx = Math.cos(c.h) * 14;
      c.vz = Math.sin(c.h) * 14;
    }
  }

  endRound() {
    const alive = this.cars.filter((c) => c.alive);
    const survivorId = alive.length ? alive[0].id : this.deaths[this.deaths.length - 1];
    this.survivorId = survivorId;
    const delta = scoreRound(this.deaths, survivorId, this.ids);
    for (const [id, d] of Object.entries(delta)) {
      const k = Number(id);
      this.points.set(k, Math.max(0, Math.min(RULES.maxPoints, this.points.get(k) + d)));
    }
    this.lastDelta = delta;
    this.events.push({ type: 'roundEnd', survivor: survivorId, delta, points: Object.fromEntries(this.points) });
    this.state = 'LAST_STAND';
    this.timer = RULES.zoomIn + RULES.hold;
    this.standT = 0;
    // a vitoria por pontos e decidida ao fim da apresentacao
    const top = [...this.points.entries()].filter(([, p]) => p >= RULES.maxPoints);
    this.pendingWinner = top.find(([id]) => id === survivorId) || top[0] || null;
  }

  stepLastStand(dt) {
    this.standT += dt;
    const s = this.carById(this.survivorId);
    // mundo congelado; so a camera se move (zoom rapido atras do sobrevivente)
    this.camera.fast = 3;
    this.camera.focus(s, this.track, 11);
    this.timer -= dt;
    if (this.timer > 0) return;
    if (this.pendingWinner) return this.endMatch('points', this.pendingWinner[0]);
    // novo round: todos renascem juntos um pouco antes de onde o sobrevivente estava
    const front = s.progress - RULES.gridBehind;
    const order = [s.id, ...this.deaths.slice().reverse().filter((id) => id !== s.id)];
    for (const c of this.cars) if (!order.includes(c.id)) order.push(c.id);
    this.startRound(front, order);
  }

  endMatch(reason, winnerId) {
    if (reason === 'laps') {
      // vence quem tem mais pontos; desempate por progresso (ordem de chegada)
      let best = null;
      for (const c of this.cars) {
        const p = this.points.get(c.id);
        if (!best || p > best.p || (p === best.p && c.progress > best.prog)) best = { id: c.id, p, prog: c.progress };
      }
      winnerId = best.id;
    }
    this.winner = winnerId;
    this.endReason = reason;
    this.state = 'MATCH_END';
    this.events.push({ type: 'matchEnd', winner: winnerId, reason, points: Object.fromEntries(this.points) });
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
}
