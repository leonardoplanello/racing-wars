// Fisica arcade 2D do carro. Sem DOM/Three.
import { SURF_GRIP, SURF_SPEED } from './track.js';

export const DT = 1 / 120;
export const CAR = {
  radius: 1.7,
  cruise: 24,
  boostSpeed: 40,
  accel: 26,
  boostAccel: 80,
  turn: 2.7, // rad/s
  wallRestitution: 0.3,
  gravity: 26,
  stunTime: 1.6,
};

export function makeCar(id, opts = {}) {
  return {
    id,
    name: opts.name || 'Jogador',
    color: opts.color ?? id,
    isBot: !!opts.isBot,
    // fisica
    x: 0, z: 0, h: 0, vx: 0, vz: 0, y: 0, vy: 0, spin: 0, spinVel: 0,
    steer: 0, steerSm: 0, fire: false,
    boost: 0, stun: 0, mass: 1,
    // estado
    alive: false, state: 'dead', // grid | run | stun | falling | dead
    locked: true, fall: 0, item: null,
    // progresso na pista
    near: null, progress: 0, prevS: 0, slip: 0, speed: 0, surf: 0, onVerge: false,
    lastBig: 0,
  };
}

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Posiciona o carro sobre a pista em `progress` (nao normalizado) com offset lateral d. */
export function placeCar(car, track, progress, d) {
  const p = track.pointAt(progress);
  car.x = p.x + p.nx * d;
  car.z = p.z + p.nz * d;
  car.h = Math.atan2(p.tz, p.tx);
  car.vx = car.vz = 0;
  car.y = car.vy = 0;
  car.spin = car.spinVel = 0;
  car.steer = car.steerSm = 0;
  car.boost = car.stun = 0;
  car.fall = 0;
  car.alive = true;
  car.state = 'grid';
  car.locked = true;
  car.item = null;
  car.near = track.newNear();
  track.nearest(car.x, car.z, -1, car.near);
  car.prevS = car.near.s;
  car.progress = progress;
  car.speed = 0;
}

/** Aplica o efeito de explosao (mina/missil): projeta o carro para cima girando e zera a inercia. */
export function hitCar(car, power = 1) {
  if (!car.alive || car.state === 'falling') return;
  car.state = 'stun';
  car.stun = CAR.stunTime * power;
  car.vy = 11 * Math.min(1.3, power);
  car.y = 0.01;
  car.spinVel = (car.id % 2 ? 1 : -1) * (9 + 3 * power);
  car.vx *= 0.12;
  car.vz *= 0.12;
  car.boost = 0;
}

/**
 * Um passo de fisica. `events` recebe eventos de parede/queda.
 * Retorna nada; atualiza car in-place.
 */
export function stepCar(car, track, dt, events) {
  if (car.state === 'dead') return;
  if (car.state === 'falling') {
    car.fall += dt;
    car.vy -= CAR.gravity * dt;
    car.y += car.vy * dt;
    car.x += car.vx * dt;
    car.z += car.vz * dt;
    car.vx *= 0.99;
    car.vz *= 0.99;
    car.spin += car.spinVel * dt;
    if (car.fall > 1.1) {
      car.state = 'dead';
      car.hidden = true;
    }
    return;
  }

  const fx = Math.cos(car.h), fz = Math.sin(car.h);
  const rx = -fz, rz = fx;
  let vf = car.vx * fx + car.vz * fz;
  let vl = car.vx * rx + car.vz * rz;
  const surf = car.near ? track.surfaceAt(car.near.idx) : 0;
  car.surf = surf;

  if (car.locked) {
    car.vx = car.vz = 0;
  } else if (car.state === 'stun') {
    car.stun -= dt;
    car.vy -= CAR.gravity * dt;
    car.y += car.vy * dt;
    if (car.y <= 0) { car.y = 0; car.vy = car.stun > 0.35 ? 3.2 : 0; }
    car.spin += car.spinVel * dt;
    car.spinVel *= Math.exp(-0.9 * dt);
    const k = Math.exp(-1.6 * dt);
    car.vx *= k;
    car.vz *= k;
    if (car.stun <= 0) {
      car.state = 'run';
      car.spin = 0;
      car.spinVel = 0;
      car.y = 0;
      car.vy = 0;
    }
  } else {
    car.state = 'run';
    // direcao suavizada
    const want = car.steer;
    const dS = want - car.steerSm;
    car.steerSm += Math.max(-16 * dt, Math.min(16 * dt, dS));
    const authority = Math.min(1, Math.abs(vf) / 10);
    car.h += car.steerSm * CAR.turn * authority * dt;

    // aceleracao automatica (cruise control)
    let target = CAR.cruise * SURF_SPEED[surf];
    let acc = CAR.accel;
    if (car.boost > 0) {
      car.boost -= dt;
      target = CAR.boostSpeed;
      acc = CAR.boostAccel;
    }
    if (car.onVerge) target *= 0.72;
    if (vf < target) vf = Math.min(target, vf + acc * dt);
    else vf = Math.max(target, vf - 14 * dt);

    // aderencia lateral (quanto menor, mais derrapa)
    const grip = car.onVerge ? 3 : SURF_GRIP[surf];
    const before = vl;
    vl *= Math.exp(-grip * dt);
    car.slip = Math.abs(before);
    // recompoe velocidade no rumo novo
    const nfx = Math.cos(car.h), nfz = Math.sin(car.h);
    const nrx = -nfz, nrz = nfx;
    car.vx = nfx * vf + nrx * vl;
    car.vz = nfz * vf + nrz * vl;
  }

  car.x += car.vx * dt;
  car.z += car.vz * dt;
  car.speed = Math.hypot(car.vx, car.vz);

  // posicao na pista
  const near = car.near;
  track.nearest(car.x, car.z, near.idx, near);
  const hw = track.hwAt(near.idx);
  const ad = Math.abs(near.d);
  car.onVerge = ad > hw;

  if (track.boundary === 'wall') {
    const maxD = hw + track.verge - CAR.radius;
    if (ad > maxD) {
      const pen = ad - maxD;
      const sg = near.d > 0 ? 1 : -1;
      const nx = near.nx * sg, nz = near.nz * sg;
      car.x -= nx * pen;
      car.z -= nz * pen;
      const vn = car.vx * nx + car.vz * nz;
      if (vn > 0) {
        car.vx -= (1 + CAR.wallRestitution) * vn * nx;
        car.vz -= (1 + CAR.wallRestitution) * vn * nz;
        const loss = 1 - Math.min(0.35, vn * 0.018);
        car.vx *= loss;
        car.vz *= loss;
        if (vn > 3 && events) events.push({ type: 'wall', car: car.id, x: car.x + nx * CAR.radius, z: car.z + nz * CAR.radius, strength: Math.min(1, vn / 16) });
      }
      // raspando: alinha o rumo com o movimento
      if (car.state === 'run' && car.speed > 3) {
        const a = Math.atan2(car.vz, car.vx);
        car.h += wrapAngle(a - car.h) * Math.min(1, 9 * dt);
      }
      near.d = sg * maxD;
    }
  } else if (track.boundary === 'void') {
    if (ad > hw && car.y <= 0.05 && car.state !== 'stun') {
      startFall(car, events, 'fall');
    }
  }
}

export function startFall(car, events, cause) {
  if (car.state === 'falling' || car.state === 'dead') return;
  car.state = 'falling';
  car.fall = 0;
  car.vy = 2;
  car.spinVel = (car.id % 2 ? 1 : -1) * 3;
  if (events) events.push({ type: 'fall', car: car.id, x: car.x, z: car.z, cause });
}

/** Atualiza o progresso desenrolado (voltas) a partir do s da pista. */
export function updateProgress(car, track) {
  const L = track.length;
  let delta = car.near.s - car.prevS;
  if (delta > L / 2) delta -= L;
  else if (delta < -L / 2) delta += L;
  car.progress += delta;
  car.prevS = car.near.s;
}

/** Colisao carro x carro (circulos com impulso). */
export function collideCars(a, b, events) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const min = CAR.radius * 2;
  const d2 = dx * dx + dz * dz;
  if (d2 >= min * min || d2 === 0) return;
  const d = Math.sqrt(d2);
  const nx = dx / d, nz = dz / d;
  const ma = a.boost > 0 ? 1.6 : 1, mb = b.boost > 0 ? 1.6 : 1;
  const pen = min - d;
  const wa = mb / (ma + mb), wb = ma / (ma + mb);
  a.x -= nx * pen * wa; a.z -= nz * pen * wa;
  b.x += nx * pen * wb; b.z += nz * pen * wb;
  const rvn = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
  if (rvn < 0) {
    const e = 0.55;
    const j = (-(1 + e) * rvn) / (1 / ma + 1 / mb);
    a.vx -= (j / ma) * nx; a.vz -= (j / ma) * nz;
    b.vx += (j / mb) * nx; b.vz += (j / mb) * nz;
    if (events && -rvn > 2.5) events.push({ type: 'bump', a: a.id, b: b.id, x: a.x + nx * CAR.radius, z: a.z + nz * CAR.radius, strength: Math.min(1, -rvn / 18) });
  }
}
