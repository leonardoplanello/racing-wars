// Partida: rodadas por eliminacao, pontuacao, respawn coletivo, camera e itens.
import { makeCar, placeCar, stepCar, updateProgress, collideCars, startFall, DT, CAR } from './car.js';
import { ChaseCamera } from './camera.js';
import { Items } from './items.js';
import { makeRng } from './rng.js';

export const RULES = {
  startPoints: 5,
  maxPoints: 10,
  laps: 3,
  countdown: 3,
  cutGrace: 1.0, // segundos apos o GO sem corte de camera
  zoomIn: 0.3, // zoom rapido no sobrevivente
  hold: 0.5, // tempo mostrando o sobrevivente
  gridRowGap: 8,
  gridBehind: 10, // "um pouco antes" de onde o sobrevivente ficou
};

/** Posicao do i-esimo carro na grade: distancia atras da frente e lado (-1/+1). */
export function gridSlot(i) {
  const row = Math.floor(i / 2), col = i % 2;
  return { back: row * RULES.gridRowGap + col * 3, side: col ? 1 : -1 };
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
    this.cup = opts.cup || 'super';
    this.rng = makeRng(opts.seed ?? 1234);
    this.cars = players.map((p) => makeCar(p.id, p));
    this.points = new Map(this.cars.map((c) => [c.id, RULES.startPoints]));
    this.items = new Items(this.track, this.cup, this.rng);
    this.camera = new ChaseCamera(opts.aspect || 16 / 9);
    this.events = [];
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
    this.startRound(-4);
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

  /** Alvo do missil: carro imediatamente a frente no ranking (ou o mais proximo na frente, se for o lider). */
  missileTarget(owner) {
    const rank = this.ranking();
    const i = rank.findIndex((c) => c.id === owner.id);
    if (i > 0) return rank[i - 1].id;
    let best = null, bd = 80;
    const fx = Math.cos(owner.h), fz = Math.sin(owner.h);
    for (const c of rank) {
      if (c.id === owner.id) continue;
      const dx = c.x - owner.x, dz = c.z - owner.z, d = Math.hypot(dx, dz);
      if (d < bd && (dx * fx + dz * fz) / (d || 1) > 0.5) { bd = d; best = c; }
    }
    return best ? best.id : -1;
  }

  setInput(id, steer, fire) {
    const c = this.carById(id);
    if (!c) return;
    c.steer = Math.max(-1, Math.min(1, steer));
    if (fire) c.wantFire = true;
  }

  kill(car, cause) {
    if (!car.alive) return;
    car.alive = false;
    car.item = null;
    this.deaths.push(car.id);
    this.events.push({ type: 'dead', car: car.id, cause, x: car.x, z: car.z });
    if (car.state !== 'falling') car.state = 'dead';
    if (car.state === 'dead') car.hidden = true;
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
    for (const c of this.cars) {
      if (c.wantFire) {
        c.wantFire = false;
        this.items.use(c, this);
      }
      this.physics(c, dt);
      if (c.alive && c.state === 'falling') this.kill(c, 'fall');
    }
    const live = this.cars.filter((c) => c.alive);
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) collideCars(live[i], live[j], this.events);
    }
    this.items.update(dt, this);

    this.frameCamera();
    // corte pelo enquadramento da camera
    if (this.time > RULES.cutGrace) {
      for (const c of this.cars) {
        if (c.alive && this.camera.isCut(c.x, c.z)) this.kill(c, 'cut');
      }
    }

    // fim de partida por voltas
    let leader = null;
    for (const c of this.cars) if (c.alive && (!leader || c.progress > leader.progress)) leader = c;
    if (leader && leader.progress >= this.track.length * RULES.laps) {
      return this.endMatch('laps', leader.id);
    }
    // fim de rodada: so avaliado em RACING (evita falso vencedor no respawn)
    if (this.cars.length >= 2 && this.cars.filter((c) => c.alive).length <= 1) this.endRound();
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
