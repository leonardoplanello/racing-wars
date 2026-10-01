// IA simples dos bots: seguem a linha central com antecipacao e usam itens.
import { CAR } from './car.js';

export function makeBrain(rng, skill = 0.8) {
  return {
    skill,
    laneBias: (rng() - 0.5) * 0.9, // fracao da meia-largura
    hold: 0.6 + rng() * 3, // espera antes de usar item
    holdT: 0,
    wobbleT: rng() * 10,
    rng,
  };
}

const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/** Retorna { steer, fire } para o bot. */
export function think(brain, car, game, dt) {
  const track = game.track;
  brain.wobbleT += dt;
  const look = 12 + car.speed * (0.45 + 0.1 * brain.skill);
  const p = track.pointAt(car.near.s + look);
  const hw = track.halfWidth;
  const bias = brain.laneBias * hw * 0.6 + Math.sin(brain.wobbleT * 0.7) * (1 - brain.skill) * hw * 0.5;
  const tx = p.x + p.nx * bias, tz = p.z + p.nz * bias;
  const want = Math.atan2(tz - car.z, tx - car.x);
  let steer = angDiff(want, car.h) * (1.6 + brain.skill);
  steer = Math.max(-1, Math.min(1, steer));
  // desvia de carros proximos (lado a lado ou logo a frente)
  const fx = Math.cos(car.h), fz = Math.sin(car.h);
  for (const o of game.cars) {
    if (o === car || !(o.alive || o.state === 'wreck') || o.state === 'falling') continue;
    const dx = o.x - car.x, dz = o.z - car.z;
    const ahead = dx * fx + dz * fz;
    const lat = -dx * fz + dz * fx; // + = o carro esta a direita
    if (ahead > -3 && ahead < 14 && Math.abs(lat) < 4) {
      const w = (1 - Math.max(0, ahead) / 14) * 0.9;
      steer += (lat > 0 ? -1 : 1) * w * (1 - Math.abs(lat) / 4.5);
    }
  }
  // desvia do muro proximo
  const edge = hw + track.verge - Math.abs(car.near.d);
  if (edge < 4) steer += (car.near.d > 0 ? -1 : 1) * 0.6 * (1 - edge / 4);
  steer = Math.max(-1, Math.min(1, steer));

  let fire = false;
  if (car.item && !car.locked && car.state === 'run') {
    brain.holdT += dt;
    if (brain.holdT > brain.hold) {
      const rank = game.ranking();
      const i = rank.findIndex((c) => c.id === car.id);
      let ok = false;
      if (car.item === 'nitro') ok = Math.abs(steer) < 0.25;
      else if (car.item === 'mine') ok = i >= 0 && i < rank.length - 1 && rank[i + 1] && Math.abs(rank[i + 1].progress - car.progress) < 30;
      else if (car.item === 'missile') {
        // o missil vai reto: so atira com alguem na linha de tiro
        ok = rank.some((c) => {
          if (c.id === car.id) return false;
          const dx = c.x - car.x, dz = c.z - car.z;
          const ahead = dx * fx + dz * fz, lat = Math.abs(-dx * fz + dz * fx);
          return ahead > 6 && ahead < 70 && lat < 2.4;
        });
      }
      else if (car.item === 'whomp') ok = rank.some((c) => c.id !== car.id && Math.hypot(c.x - car.x, c.z - car.z) < 13);
      if (ok) { fire = true; brain.holdT = 0; brain.hold = 0.8 + brain.rng() * 3; }
    }
  }
  return { steer, fire };
}
