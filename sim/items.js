// Caixas de item, minas, misseis e ondas Whomp.
import { ITEMS } from '../shared/protocol.js';
import { CAR, impulseCar } from './car.js';

const BOX_RADIUS = 2.3;
const BOX_RESPAWN = 6;
const MINE_TRIGGER = 2.3;
export const MISSILE = { speed: 90, life: 4, hit: 1.6, blast: 3.2 };
// rastro do nitro: segmentos de fogo que explodem quem passar (menos o dono)
// curto e colado no carro: ~0,3 s de fogo (uns 15 u a 52 u/s)
export const TRAIL = { gap: 0.8, life: 0.3, radius: 1.5, grace: 0.06, back: 1.5 };
// Whomp: forca exponencial com a distancia (curto alcance): F = push * exp(-d / lambda)
export const WHOMP = { radius: 16, speed: 40, push: 110, lambda: 3.5, lift: 11, liveFrac: 0.6, maxSpin: 1.6 };

// canhao de gelo: morteiro (arco alto) que cai a distancia fixa e congela os carros da area
export const ICE = { range: 45, flight: 1.6, radius: 9, time: 3, gravity: 26 };

export const CUP_BOX_DENSITY = { fast: 0, super: 1, war: 2 };

/** Intensidade (0..1) do Whomp a uma distancia d do carro que o soltou. */
export function whompFactor(d) {
  return d > WHOMP.radius ? 0 : Math.exp(-d / WHOMP.lambda);
}

export class Items {
  constructor(track, cup, rng) {
    this.track = track;
    this.cup = cup;
    this.rng = rng;
    this.boxes = [];
    this.mines = [];
    this.missiles = [];
    this.shocks = [];
    this.mortars = [];
    this.trails = [];
    this.lastTrail = new Map();
    this.nextId = 1;
    this.buildBoxes();
  }

  buildBoxes() {
    const dens = CUP_BOX_DENSITY[this.cup] ?? 1;
    this.boxes.length = 0;
    if (dens === 0) return;
    const groups = this.track.def.boxGroups || [];
    // War: 5 caixas espalhadas (2-1-2); Super: 3 caixas em V; grupos alternados na Super Cup
    const pattern = dens === 2
      ? [[-0.62, 0], [0.62, 0], [0, 4.5], [-0.34, 9], [0.34, 9]]
      : [[-0.5, 0], [0.5, 0], [0, 5]];
    groups.forEach((frac, gi) => {
      if (dens === 1 && gi % 2 === 1) return;
      const s = frac * this.track.length;
      const hw = this.track.halfWidth;
      for (const [o, ds] of pattern) {
        const p = this.track.pointAt(s + ds);
        this.boxes.push({ x: p.x + p.nx * hw * o, z: p.z + p.nz * hw * o, active: true, timer: 0, s: s + ds });
      }
    });
  }

  reset() {
    for (const b of this.boxes) { b.active = true; b.timer = 0; }
    this.mines.length = 0;
    this.missiles.length = 0;
    this.shocks.length = 0;
    this.mortars.length = 0;
    this.trails.length = 0;
    this.lastTrail.clear();
  }

  randomItem() {
    return ITEMS[Math.floor(this.rng() * ITEMS.length)];
  }

  update(dt, game) {
    const { cars, events } = game;
    // caixas
    for (const b of this.boxes) {
      if (!b.active) {
        b.timer -= dt;
        if (b.timer <= 0) b.active = true;
        continue;
      }
      for (const c of cars) {
        if (!c.alive || c.state === 'falling' || c.item) continue;
        const dx = c.x - b.x, dz = c.z - b.z;
        if (dx * dx + dz * dz < BOX_RADIUS * BOX_RADIUS) {
          c.item = this.randomItem();
          b.active = false;
          b.timer = BOX_RESPAWN;
          events.push({ type: 'pickup', car: c.id, item: c.item, x: b.x, z: b.z });
          break;
        }
      }
    }
    // minas
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      m.age += dt;
      for (const c of cars) {
        if (!c.alive || c.state === 'falling') continue;
        if (c.id === m.owner && m.age < 0.9) continue;
        const dx = c.x - m.x, dz = c.z - m.z;
        if (dx * dx + dz * dz < MINE_TRIGGER * MINE_TRIGGER) {
          this.explode(game, m.x, m.z, 'mine', 2.6, m.owner, c);
          this.mines.splice(i, 1);
          break;
        }
      }
    }
    // misseis
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      m.age += dt;
      // sempre em linha reta; so avisa (alarme) quem esta na linha de tiro
      m.alarm -= dt;
      if (m.alarm <= 0) {
        const mx = Math.cos(m.h), mz = Math.sin(m.h);
        for (const t of cars) {
          if (!t.alive || t.id === m.owner) continue;
          const dx = t.x - m.x, dz = t.z - m.z;
          const ahead = dx * mx + dz * mz, lat = -dx * mz + dz * mx;
          if (ahead > 0 && ahead < 36 && Math.abs(lat) < 3.2) { m.alarm = 0.26; events.push({ type: 'alarm', car: t.id }); break; }
        }
      }
      m.x += Math.cos(m.h) * MISSILE.speed * dt;
      m.z += Math.sin(m.h) * MISSILE.speed * dt;
      let boom = m.age > MISSILE.life;
      let hit = null;
      if (!boom) {
        for (const c of cars) {
          if (!c.alive || c.state === 'falling') continue;
          if (c.id === m.owner && m.age < 0.5) continue;
          const dx = c.x - m.x, dz = c.z - m.z;
          if (dx * dx + dz * dz < (MISSILE.hit + CAR.radius) ** 2) { hit = c; boom = true; break; }
        }
      }
      if (!boom) {
        m.near = this.track.nearest(m.x, m.z, m.near ? m.near.idx : -1, m.near || this.track.newNear());
        if (Math.abs(m.near.d) > this.track.halfWidth + this.track.verge) boom = true;
      }
      if (boom) {
        this.explode(game, m.x, m.z, 'missile', 3.2, m.owner, hit);
        this.missiles.splice(i, 1);
      }
    }
    // morteiros de gelo: voo balistico; ao tocar o chao congelam quem estiver na area
    for (let i = this.mortars.length - 1; i >= 0; i--) {
      const m = this.mortars[i];
      m.age += dt;
      m.vy -= ICE.gravity * dt;
      m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt;
      const gy = this.track.groundAt(m.x, m.z, m.hint, this._gp || (this._gp = { y: 0, nx: 0, ny: 1, nz: 0 })).y;
      if (this.track._gn) m.hint = this.track._gn.idx;
      if (m.age > 0.25 && (m.y <= gy || m.age > ICE.flight + 1)) {
        this.mortars.splice(i, 1);
        this.iceBurst(game, m.x, Math.max(gy, 0), m.z, m.owner);
      }
    }
    // rastro do nitro: quem aciona deixa fogo no chao; outros carros que cruzarem explodem
    for (const c of cars) {
      if (!c.alive || c.state === 'falling' || !(c.boost > 0)) continue;
      const last = this.trails.length ? this.lastTrail.get(c.id) : null;
      const bx = c.x - Math.cos(c.h) * TRAIL.back, bz = c.z - Math.sin(c.h) * TRAIL.back;
      if (!last || Math.hypot(bx - last.x, bz - last.z) >= TRAIL.gap) {
        const seg = { x: bx, z: bz, owner: c.id, age: 0 };
        this.trails.push(seg);
        this.lastTrail.set(c.id, seg);
      }
    }
    for (let i = this.trails.length - 1; i >= 0; i--) {
      const t = this.trails[i];
      t.age += dt;
      if (t.age > TRAIL.life) { this.trails.splice(i, 1); continue; }
      if (t.age < TRAIL.grace) continue; // o fogo nasce atras do dono: da tempo dele se afastar
      for (const c of cars) {
        if (!c.alive || c.state === 'falling' || c.id === t.owner) continue;
        const dx = c.x - t.x, dz = c.z - t.z, rr = TRAIL.radius + 1.0;
        if (dx * dx + dz * dz < rr * rr) { game.explodeCar(c, 'trail', t.owner, t.x, t.z); }
      }
    }
    // ondas whomp (magneticas)
    for (let i = this.shocks.length - 1; i >= 0; i--) {
      const s = this.shocks[i];
      s.r += WHOMP.speed * dt;
      for (const c of cars) {
        if (!(c.alive || c.state === 'wreck') || c.state === 'falling' || c.id === s.owner || s.hit.has(c.id)) continue;
        const dx = c.x - s.x, dz = c.z - s.z;
        const d = Math.hypot(dx, dz);
        if (d > s.r || d > WHOMP.radius) continue;
        s.hit.add(c.id);
        const e = whompFactor(d);
        const k = WHOMP.push * e;
        if (k < 1.5) continue;
        const nx = d > 0.01 ? dx / d : 1, nz = d > 0.01 ? dz / d : 0;
        if (c.state === 'run' || c.state === 'grid') {
          // carro vivo: empurrao e um pulinho, mantendo o rumo (so um leve giro, limitado)
          c.vx += nx * k * WHOMP.liveFrac;
          c.vz += nz * k * WHOMP.liveFrac;
          const side = nx * Math.sin(c.h) - nz * Math.cos(c.h);
          c.w = Math.max(-WHOMP.maxSpin, Math.min(WHOMP.maxSpin, c.w + side * k * 0.03));
          c.vy = Math.max(c.vy, WHOMP.lift * 0.6 * e);
          c.y += 0.02;
          c.air = true;
          c.destab = Math.max(c.destab, 0.3 * e);
        } else {
          // carcaca/carro ja capotado: impulso fisico completo, aplicado um pouco abaixo do centro de massa
          impulseCar(c, nx * k * 0.5, WHOMP.lift * e * 0.9, nz * k * 0.5, -nx * 0.9, -0.7, -nz * 0.9, c.state === 'wreck' ? CAR.wreckMass * 0.5 : 1);
          c.asleep = false;
        }
        events.push({ type: 'whompHit', car: c.id, by: s.owner, force: e });
      }
      if (s.r >= WHOMP.radius) this.shocks.splice(i, 1);
    }
  }

  /** Explosao de mina/missil: o carro atingido (e vizinhos no raio) EXPLODE e vira carcaca. */
  explode(game, x, z, kind, power, owner, direct) {
    const radius = kind === 'missile' ? MISSILE.blast : 2.6;
    let any = false;
    for (const c of game.cars) {
      if (!c.alive || c.state === 'falling') continue;
      if (c === direct || (c.id !== owner && Math.hypot(c.x - x, c.z - z) < radius)) {
        game.explodeCar(c, kind, owner, x, z);
        any = true;
      }
    }
    if (!any) game.events.push({ type: 'explode', kind, x, z, owner, car: -1 });
  }

  /** Impacto do gelo: congela (menos o dono) os carros no raio; mais perto, mais tempo. */
  iceBurst(game, x, y, z, owner) {
    game.events.push({ type: 'iceBurst', x, y, z, owner, radius: ICE.radius });
    for (const c of game.cars) {
      if (!c.alive || c.state === 'falling' || c.id === owner) continue;
      const d = Math.hypot(c.x - x, c.z - z);
      if (d > ICE.radius || Math.abs(c.y - y) > 4) continue;
      game.freezeCar(c, ICE.time * (1 - 0.35 * (d / ICE.radius)));
    }
  }

  /** Usa o item guardado pelo carro. Retorna o tipo usado ou null. */
  use(car, game) {
    if (!car.item || !car.alive || car.locked || car.state === 'falling' || car.state === 'stun' || car.freeze > 0) return null;
    const item = car.item;
    car.item = null;
    const fx = Math.cos(car.h), fz = Math.sin(car.h);
    if (item === 'nitro') {
      car.boost = 2;
    } else if (item === 'mine') {
      this.mines.push({ x: car.x - fx * 3, z: car.z - fz * 3, owner: car.id, age: 0 });
    } else if (item === 'missile') {
      this.missiles.push({
        id: this.nextId++, x: car.x + fx * 2.6, z: car.z + fz * 2.6, h: car.h,
        owner: car.id, age: 0, alarm: 0, near: null,
      });
    } else if (item === 'ice') {
      const sx = car.x + fx * 1.5, sz = car.z + fz * 1.5, sy = car.y + 1.8, T = ICE.flight;
      const tx = car.x + fx * ICE.range, tz = car.z + fz * ICE.range;
      const ty = this.track.groundAt(tx, tz, -1, { y: 0, nx: 0, ny: 1, nz: 0 }).y;
      this.mortars.push({
        id: this.nextId++, x: sx, y: sy, z: sz, vx: (tx - sx) / T, vz: (tz - sz) / T,
        vy: (ty - sy + 0.5 * ICE.gravity * T * T) / T, tx, ty, tz, owner: car.id, age: 0, hint: -1,
      });
    } else if (item === 'whomp') {
      this.shocks.push({ x: car.x, z: car.z, r: 0, owner: car.id, hit: new Set() });
    }
    game.events.push({ type: 'use', car: car.id, item });
    return item;
  }
}
