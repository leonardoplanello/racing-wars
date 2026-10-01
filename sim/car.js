// Fisica do carro: modelo de bicicleta dinamico (tracao TRASEIRA, direcao DIANTEIRA) + corpo rigido
// de 3 circulos para colisoes (empurrar, girar, raspar no muro). Sem DOM/Three.
//
// Convencoes: x para a direita, z para baixo; rumo h: frente = (cos h, sin h); h crescente = virar a direita;
// direita do carro = (-sin h, cos h); velocidade lateral v > 0 = deslizando para a direita; w = dh/dt.
import { SURF_MU, SURF_SPEED } from './track.js';

export const DT = 1 / 120;
export const CAR = {
  radius: 1.5, // raio envolvente (itens, explosoes)
  circleR: 0.88, // raio de cada circulo de colisao
  circleOff: [1.05, 0, -1.05],
  length: 3.3,
  wheelbase: 2.2,
  a: 1.28, // CG -> eixo dianteiro
  b: 0.92, // CG -> eixo traseiro
  inertia: 1.45, // momento de inercia (massa = 1)
  g: 48, // escala das aderencias (aceleracao lateral maxima = mu * g)
  cruise: 34,
  reverseSpeed: 16,
  boostSpeed: 52,
  engineCap: 30, // aceleracao maxima do motor
  boostCap: 72,
  brakeCap: 26,
  kp: 6, // ganho do controle de cruzeiro
  steerMax: 0.68, // rad no volante, em baixa velocidade
  steerRef: 23, // a esterco diminui com a velocidade
  steerRate: 15, // velocidade do volante (1/s): resposta rapida
  catchupBoost: 0.2, // retardatario perto de sair do quadro ganha ate +20% de velocidade
  alphaSatF: 0.16, // rad: deriva em que o pneu dianteiro satura
  alphaSatR: 0.11, // traseiro mais "duro": carro estavel (subesterca no limite)
  wallE: 0.22,
  carE: 0.45,
  gravity: 26,
  stunTime: 1.6,
  offroadMax: 28, // distancia alem da borda da estrada em que o carro explode
};

const FRONT_LOAD = CAR.b / CAR.wheelbase; // fracao do peso no eixo dianteiro
const REAR_LOAD = CAR.a / CAR.wheelbase;

export function makeCar(id, opts = {}) {
  return {
    id,
    name: opts.name || 'Jogador',
    color: opts.color ?? id,
    isBot: !!opts.isBot,
    x: 0, z: 0, h: 0, vx: 0, vz: 0, w: 0, y: 0, vy: 0, spin: 0, spinVel: 0,
    steer: 0, steerSm: 0, fire: false, contact: false, stuck: 0, rev: 0, revIn: false,
    boost: 0, stun: 0, mass: 1,
    alive: false, state: 'dead', // grid | run | stun | falling | dead
    locked: true, fall: 0, item: null,
    near: null, nearC: null, progress: 0, prevS: 0, slip: 0, speed: 0, surf: 0, onVerge: false, drive: 0,
    lastBig: 0, catchup: 0, destab: 0,
    pitch: 0, roll: 0, pitchVel: 0, rollVel: 0,
  };
}

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Posiciona o carro sobre a pista em `progress` (nao normalizado) com offset lateral d. */
export function placeCar(car, track, progress, d) {
  const p = track.pointAt(progress);
  car.x = p.x + p.nx * d;
  car.z = p.z + p.nz * d;
  car.h = Math.atan2(p.tz, p.tx);
  car.vx = car.vz = car.w = 0;
  car.y = car.vy = 0;
  car.spin = car.spinVel = 0;
  car.pitch = car.roll = car.pitchVel = car.rollVel = 0;
  car.catchup = car.destab = 0;
  car.steer = car.steerSm = 0;
  car.boost = car.stun = 0;
  car.fall = 0;
  car.alive = true;
  car.state = 'grid';
  car.locked = true;
  car.item = null;
  car.near = track.newNear();
  track.nearest(car.x, car.z, -1, car.near);
  car.nearC = [track.newNear(), track.newNear(), track.newNear()];
  car.prevS = car.near.s;
  car.progress = progress;
  car.speed = 0;
  car.drive = 0;
}

/** Golpe (whomp/colisao forte): joga o carro para cima girando de verdade. O giro e REAL (car.w/car.h):
 * ao fim o carro fica virado para onde parou, sem nenhum auxilio de realinhamento. */
export function hitCar(car, power = 1, dir = 0) {
  if (!car.alive || car.state === 'falling') return;
  const sg = dir || (car.id % 2 ? 1 : -1);
  car.state = 'stun';
  car.stun = CAR.stunTime * power;
  car.vy = 11 * Math.min(1.3, power);
  car.y = 0.01;
  car.w = sg * (8 + 3 * power);
  car.pitchVel = (car.id % 3 - 1) * 5 * power;
  car.rollVel = sg * 7 * power;
  car.vx *= 0.12;
  car.vz *= 0.12;
  car.boost = 0;
}

/** Aproxima um angulo livre (capotamento) do multiplo de 2pi mais proximo quando o carro toca o chao. */
function settleAngle(a, k) {
  const t = Math.round(a / (2 * Math.PI)) * 2 * Math.PI;
  return a + (t - a) * k;
}

/** Capotamento 3D (so cinematica): gira solto no ar e assenta ao tocar o chao. */
export function tumble(car, dt, bounceK) {
  car.pitch += car.pitchVel * dt;
  car.roll += car.rollVel * dt;
  if (car.y <= 0.02) {
    const k = 1 - Math.exp(-bounceK * dt);
    car.pitch = settleAngle(car.pitch, k);
    car.roll = settleAngle(car.roll, k);
    const d = Math.exp(-bounceK * 0.8 * dt);
    car.pitchVel *= d;
    car.rollVel *= d;
  }
}

/** Posicao mundial do circulo i do carro. */
export function circlePos(car, i, out = { x: 0, z: 0 }) {
  const off = CAR.circleOff[i];
  out.x = car.x + Math.cos(car.h) * off;
  out.z = car.z + Math.sin(car.h) * off;
  return out;
}

/** Um passo de fisica. `events` recebe eventos de parede/queda. */
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

  car.destab = Math.max(0, car.destab - dt);
  const surf = car.near ? track.surfaceAt(car.near.idx) : 0;
  car.surf = surf;
  car.contactPrev = car.contact;
  car.contact = false;

  if (car.locked) {
    car.vx = car.vz = car.w = 0;
    car.speed = 0;
  } else if (car.state === 'wreck') {
    // carcaca: corpo inerte que desliza, perde velocidade e pode ser empurrado
    car.wreckT = (car.wreckT || 0) + dt;
    car.vy -= CAR.gravity * dt;
    car.y += car.vy * dt;
    if (car.y <= 0) { car.y = 0; car.vy = car.vy < -3 ? -car.vy * 0.28 : 0; }
    car.spin += car.spinVel * dt;
    car.spinVel *= Math.exp(-1.2 * dt);
    tumble(car, dt, 5);
    const k = Math.exp((car.y > 0.05 ? -0.15 : -1.9) * dt);
    car.vx *= k;
    car.vz *= k;
    car.w *= Math.exp(-2.4 * dt);
    car.h += car.w * dt;
  } else if (car.state === 'stun') {
    car.stun -= dt;
    car.vy -= CAR.gravity * dt;
    car.y += car.vy * dt;
    if (car.y <= 0) { car.y = 0; car.vy = car.stun > 0.35 ? 3.2 : 0; }
    tumble(car, dt, 7);
    const k = Math.exp(-1.6 * dt);
    car.vx *= k;
    car.vz *= k;
    car.w *= Math.exp(-(car.y > 0.05 ? 0.35 : 1.5) * dt); // gira solto no ar, atrito no chao
    car.h += car.w * dt; // o giro e fisico: o carro fica virado para onde parou
    if (car.stun <= 0) {
      car.state = 'run';
      car.y = 0;
      car.vy = 0;
      car.pitch = car.roll = car.pitchVel = car.rollVel = 0;
    }
  } else {
    car.state = 'run';
    driveStep(car, surf, dt);
  }

  car.x += car.vx * dt;
  car.z += car.vz * dt;
  car.speed = Math.hypot(car.vx, car.vz);

  // posicao na pista (centro de massa) e contato com muros/abismo
  const near = car.near;
  track.nearest(car.x, car.z, near.idx, near);
  const hw = track.hwAt(near.idx);
  const ad = Math.abs(near.d);
  car.onVerge = ad > hw;

  if (track.boundary === 'wall') {
    for (let i = 0; i < 3; i++) wallContact(car, track, i, hw, events);
    sceneryContact(car, track.scenery, events);
  } else if (track.boundary === 'void') {
    if (ad > hw && car.y <= 0.05 && car.state !== 'stun') startFall(car, events, 'fall');
  }
}

/** Dinamica do carro rodando: motor no eixo traseiro, esterco no dianteiro. */
function driveStep(car, surf, dt) {
  const fx = Math.cos(car.h), fz = Math.sin(car.h);
  const rx = -fz, rz = fx;
  let u = car.vx * fx + car.vz * fz; // longitudinal
  let v = car.vx * rx + car.vz * rz; // lateral (direita +)
  let w = car.w;

  const mu = car.onVerge ? SURF_MU[surf] * 0.62 : SURF_MU[surf];
  const fmaxF = mu * CAR.g * FRONT_LOAD;
  // traseira atingida: perde aderencia por um instante e o carro roda com facilidade
  const fmaxR0 = mu * CAR.g * REAR_LOAD * (1 - 0.6 * Math.min(1, car.destab / 0.5));

  // volante suavizado; menos esterco em alta velocidade
  car.steerSm += Math.max(-CAR.steerRate * dt, Math.min(CAR.steerRate * dt, car.steer - car.steerSm));
  // o angulo do volante e limitado pela aderencia (auxilio de direcao): evita rodar so de esterçar
  const us = Math.max(Math.abs(u), 3);
  const gripCap = (0.95 * mu * CAR.g * CAR.wheelbase) / (us * us);
  const dMax = Math.min(CAR.steerMax / (1 + (u / CAR.steerRef) ** 2), Math.max(gripCap, 0.02));
  const delta = car.steerSm * dMax * (car.rev > 0 ? -1 : 1);

  // controle de cruzeiro -> forca de tracao na roda traseira
  // preso de frente para o muro: engata re por um instante e sai
  if (car.contactPrev || Math.abs(u) > 3) car.stuck = Math.abs(u) > 3 ? 0 : car.stuck + dt;
  else car.stuck = Math.max(0, car.stuck - 2 * dt);
  if (car.stuck > 0.45 && car.rev <= 0) { car.rev = 0.9; car.stuck = 0; }
  const catchup = 1 + CAR.catchupBoost * car.catchup;
  let target = CAR.cruise * SURF_SPEED[surf] * catchup;
  let cap = CAR.engineCap * catchup;
  if (car.rev > 0) { car.rev -= dt; target = -9; }
  if (car.revIn) target = -CAR.reverseSpeed; // jogador segurou as duas setas
  if (car.boost > 0) { car.boost -= dt; target = CAR.boostSpeed; cap = CAR.boostCap; }
  if (car.onVerge) target *= 0.8;
  let fx_drive = CAR.kp * (target - u);
  fx_drive = Math.max(-CAR.brakeCap, Math.min(cap, fx_drive));
  // limite de tracao: a roda traseira nao passa do atrito disponivel (patina)
  const tractionCap = fmaxR0 * 1.15;
  fx_drive = Math.max(-fmaxR0 * 1.2, Math.min(tractionCap, fx_drive));
  // controle de tracao: tira o pe quando o carro derrapa (evita sobreviragem incontrolavel)
  if (fx_drive > 0) fx_drive *= Math.max(0.12, 1 - 1.7 * (Math.abs(v) / (Math.abs(u) + 3)));
  car.drive = fx_drive;

  // forcas laterais dos pneus (angulo de deriva), regularizado em baixa velocidade
  const ua = Math.max(Math.abs(u), 2.0) * (u < 0 ? -1 : 1);
  const alphaF = Math.atan2(v + CAR.a * w, ua) - delta;
  const alphaR = Math.atan2(v - CAR.b * w, ua);
  const fyF = -fmaxF * Math.tanh(alphaF / CAR.alphaSatF);
  // circulo de atrito do eixo traseiro: quanto mais tracao, menos forca lateral
  const ratio = Math.min(0.85, Math.abs(fx_drive) / (fmaxR0 * 1.15));
  const fmaxR = fmaxR0 * Math.sqrt(1 - ratio * ratio);
  const fyR = -fmaxR * Math.tanh(alphaR / CAR.alphaSatR);

  const cd = Math.cos(delta), sd = Math.sin(delta);
  const du = fx_drive - fyF * sd - 0.35 * u + v * w;
  const dv = fyF * cd + fyR - u * w;
  const dw = (CAR.a * fyF * cd - CAR.b * fyR) / CAR.inertia - (0.9 + 0.55 * Math.abs(w)) * w;
  car.slip = Math.abs(v);

  u += du * dt;
  v += dv * dt;
  w += dw * dt;
  // amortecimento lateral quando quase parado (evita deslizar parado)
  if (Math.abs(u) < 3) v *= Math.exp(-6 * dt);

  car.h += w * dt;
  car.w = w;
  const nfx = Math.cos(car.h), nfz = Math.sin(car.h);
  car.vx = nfx * u - nfz * v;
  car.vz = nfz * u + nfx * v;
}

/** Impulso de um contato estatico (muro, arvore...) com normal (nx,nz) para FORA do carro. */
function staticImpulse(car, nx, nz, cx, cz, R, e, mu, events, kind, what = 'wall') {
  const rx = cx - car.x + nx * R, rz = cz - car.z + nz * R;
  const rvx = car.vx - car.w * rz, rvz = car.vz + car.w * rx;
  const vn = rvx * nx + rvz * nz;
  if (vn <= 0) return 0;
  const rn = rx * nz - rz * nx;
  const j = ((1 + e) * vn) / (1 + (rn * rn) / CAR.inertia);
  car.vx -= j * nx;
  car.vz -= j * nz;
  car.w -= (j * rn) / CAR.inertia;
  const tx = -nz, tz = nx;
  const vt = rvx * tx + rvz * tz;
  const rt = rx * tz - rz * tx;
  const jt = Math.max(-mu * j, Math.min(mu * j, -vt / (1 + (rt * rt) / CAR.inertia)));
  car.vx += jt * tx;
  car.vz += jt * tz;
  car.w += (jt * rt) / CAR.inertia;
  if (vn > 3 && events) events.push({ type: kind, what, car: car.id, x: cx + nx * R, z: cz + nz * R, nx, nz, strength: Math.min(1, vn / 18) });
  return vn;
}

/** Contato de um circulo do carro com os muros da pista (impulso com rotacao). */
function wallContact(car, track, i, hw, events) {
  const R = CAR.circleR;
  const off = CAR.circleOff[i];
  const cx = car.x + Math.cos(car.h) * off, cz = car.z + Math.sin(car.h) * off;
  const nc = car.nearC[i];
  track.nearest(cx, cz, nc.idx >= 0 ? nc.idx : car.near.idx, nc);
  if (!track.hardWall(nc.idx)) return; // terra aberta: da para sair da estrada
  const maxD = track.hwAt(nc.idx) + track.verge - R;
  const ad = Math.abs(nc.d);
  if (ad <= maxD) return;
  const pen = ad - maxD;
  car.contact = true;
  const sg = nc.d > 0 ? 1 : -1;
  const nx = nc.nx * sg, nz = nc.nz * sg; // normal para fora da pista
  car.x -= nx * pen;
  car.z -= nz * pen;
  staticImpulse(car, nx, nz, cx, cz, R, CAR.wallE, 0.35, events, 'wall');
}

/** Colisao com o cenario solido (arvores, pedras, casas). */
export function sceneryContact(car, scenery, events) {
  if (!scenery || car.state === 'falling') return;
  const R = CAR.circleR;
  const list = scenery.query(car.x, car.z, 8, car._q || (car._q = []));
  if (!list.length) return;
  for (let i = 0; i < 3; i++) {
    const off = CAR.circleOff[i];
    const cx = car.x + Math.cos(car.h) * off, cz = car.z + Math.sin(car.h) * off;
    for (const o of list) {
      const dx = o.x - cx, dz = o.z - cz;
      const rr = R + o.r;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr || d2 < 1e-9) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d, nz = dz / d; // do carro para o obstaculo
      const pen = rr - d;
      car.x -= nx * pen;
      car.z -= nz * pen;
      car.contact = true;
      staticImpulse(car, nx, nz, cx - nx * pen, cz - nz * pen, R, o.kind === 'rock' ? 0.3 : 0.18, 0.3, events, 'wall', o.kind);
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

/** Colisao carro x carro: 3 circulos por carro, impulso linear + angular. */
export function collideCars(a, b, events) {
  if (a.state === 'falling' || b.state === 'falling' || a.state === 'dead' || b.state === 'dead') return;
  const R2 = CAR.circleR * 2;
  const ma = (a.state === 'wreck' ? 2 : 1) * (a.boost > 0 ? 1.25 : 1), mb = (b.state === 'wreck' ? 2 : 1) * (b.boost > 0 ? 1.25 : 1);
  const Ia = CAR.inertia * ma, Ib = CAR.inertia * mb;
  let worst = 0, hx = 0, hz = 0;
  for (let i = 0; i < 3; i++) {
    for (let k = 0; k < 3; k++) {
      const ax = a.x + Math.cos(a.h) * CAR.circleOff[i], az = a.z + Math.sin(a.h) * CAR.circleOff[i];
      const bx = b.x + Math.cos(b.h) * CAR.circleOff[k], bz = b.z + Math.sin(b.h) * CAR.circleOff[k];
      const dx = bx - ax, dz = bz - az;
      const d2 = dx * dx + dz * dz;
      if (d2 >= R2 * R2 || d2 < 1e-8) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d, nz = dz / d; // de a para b
      const pen = R2 - d;
      // separa (proporcional ao inverso da massa)
      const wa = mb / (ma + mb), wb = ma / (ma + mb);
      a.x -= nx * pen * wa * 0.6; a.z -= nz * pen * wa * 0.6;
      b.x += nx * pen * wb * 0.6; b.z += nz * pen * wb * 0.6;
      // ponto de contato (no meio dos circulos)
      const px = ax + nx * CAR.circleR, pz = az + nz * CAR.circleR;
      const rax = px - a.x, raz = pz - a.z, rbx = px - b.x, rbz = pz - b.z;
      const vax = a.vx - a.w * raz, vaz = a.vz + a.w * rax;
      const vbx = b.vx - b.w * rbz, vbz = b.vz + b.w * rbx;
      const vn = (vbx - vax) * nx + (vbz - vaz) * nz;
      if (vn >= 0) continue;
      const rna = rax * nz - raz * nx, rnb = rbx * nz - rbz * nx;
      const j = (-(1 + CAR.carE) * vn) / (1 / ma + 1 / mb + (rna * rna) / Ia + (rnb * rnb) / Ib);
      a.vx -= (j * nx) / ma; a.vz -= (j * nz) / ma; a.w -= (j * rna) / Ia;
      b.vx += (j * nx) / mb; b.vz += (j * nz) / mb; b.w += (j * rnb) / Ib;
      // roda traseira: bater ali desestabiliza muito mais (rodopia e perde a traseira)
      if (-vn > 2.5) {
        if (i === 2) { a.w -= (1.2 * j * rna) / Ia; a.destab = Math.max(a.destab, Math.min(1.1, -vn / 7)); }
        if (k === 2) { b.w += (1.2 * j * rnb) / Ib; b.destab = Math.max(b.destab, Math.min(1.1, -vn / 7)); }
      }
      // atrito tangencial leve
      const tx = -nz, tz = nx;
      const vt = (vbx - vax) * tx + (vbz - vaz) * tz;
      const jt = Math.max(-0.2 * j, Math.min(0.2 * j, -vt * 0.3));
      a.vx -= (jt * tx) / ma; a.vz -= (jt * tz) / ma;
      b.vx += (jt * tx) / mb; b.vz += (jt * tz) / mb;
      if (-vn > worst) { worst = -vn; hx = px; hz = pz; }
    }
  }
  if (worst > 2.5 && events) events.push({ type: 'bump', a: a.id, b: b.id, x: hx, z: hz, strength: Math.min(1, worst / 16) });
}
