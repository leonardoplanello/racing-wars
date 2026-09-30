// Caixas de item, minas, misseis e ondas Whomp.
import { ITEMS } from '../shared/protocol.js';
import { CAR, hitCar } from './car.js';

const BOX_RADIUS = 2.6;
const BOX_RESPAWN = 6;
const MINE_TRIGGER = 2.3;
const MISSILE = { speed: 46, turn: 3.6, life: 5, hit: 1.9, blast: 3.4 };
const WHOMP = { radius: 17, speed: 58, push: 30 };

export const CUP_BOX_DENSITY = { fast: 0, super: 1, war: 2 };

export class Items {
  constructor(track, cup, rng) {
    this.track = track;
    this.cup = cup;
    this.rng = rng;
    this.boxes = [];
    this.mines = [];
    this.missiles = [];
    this.shocks = [];
    this.nextId = 1;
    this.buildBoxes();
  }

  buildBoxes() {
    const dens = CUP_BOX_DENSITY[this.cup] ?? 1;
    this.boxes.length = 0;
    if (dens === 0) return;
    const groups = this.track.def.boxGroups || [];
    groups.forEach((frac, gi) => {
      if (dens === 1 && gi % 2 === 1) return; // Super Cup: metade dos grupos
      const s = frac * this.track.length;
      const p = this.track.pointAt(s);
      const hw = this.track.halfWidth;
      const offs = dens === 2 ? [-0.55, 0, 0.55] : [-0.4, 0.4];
      for (const o of offs) {
        this.boxes.push({ x: p.x + p.nx * hw * o, z: p.z + p.nz * hw * o, active: true, timer: 0, s });
      }
    });
  }

  reset() {
    for (const b of this.boxes) { b.active = true; b.timer = 0; }
    this.mines.length = 0;
    this.missiles.length = 0;
    this.shocks.length = 0;
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
      const target = game.carById(m.target);
      if (target && target.alive) {
        const want = Math.atan2(target.z - m.z, target.x - m.x);
        let diff = Math.atan2(Math.sin(want - m.h), Math.cos(want - m.h));
        const maxT = MISSILE.turn * dt;
        diff = Math.max(-maxT, Math.min(maxT, diff));
        m.h += diff;
        // alarme sonoro/haptico no alvo
        m.alarm -= dt;
        const dist = Math.hypot(target.x - m.x, target.z - m.z);
        if (m.alarm <= 0 && dist < 36) {
          m.alarm = 0.26;
          events.push({ type: 'alarm', car: target.id });
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
    // ondas whomp
    for (let i = this.shocks.length - 1; i >= 0; i--) {
      const s = this.shocks[i];
      s.r += WHOMP.speed * dt;
      for (const c of cars) {
        if (!c.alive || c.state === 'falling' || c.id === s.owner || s.hit.has(c.id)) continue;
        const dx = c.x - s.x, dz = c.z - s.z;
        const d = Math.hypot(dx, dz);
        if (d <= s.r) {
          s.hit.add(c.id);
          const k = WHOMP.push * (1 - Math.min(1, d / WHOMP.radius)) + 15;
          const nx = d > 0.01 ? dx / d : 1, nz = d > 0.01 ? dz / d : 0;
          c.vx += nx * k;
          c.vz += nz * k;
          if (c.state === 'run') { c.state = 'stun'; c.stun = 0.55; c.vy = 3; c.y = 0.01; c.spinVel = 7; }
          events.push({ type: 'whompHit', car: c.id, by: s.owner });
        }
      }
      if (s.r >= WHOMP.radius) this.shocks.splice(i, 1);
    }
  }

  /** Explosao: atinge o carro `direct` e vizinhos no raio. */
  explode(game, x, z, kind, power, owner, direct) {
    game.events.push({ type: 'explode', kind, x, z, owner });
    const radius = kind === 'missile' ? MISSILE.blast : 3;
    for (const c of game.cars) {
      if (!c.alive || c.state === 'falling') continue;
      if (c === direct || (c.id !== owner && Math.hypot(c.x - x, c.z - z) < radius)) {
        hitCar(c, kind === 'missile' ? 1.25 : 1);
        game.events.push({ type: 'hit', car: c.id, by: owner, kind });
      }
    }
  }

  /** Usa o item guardado pelo carro. Retorna o tipo usado ou null. */
  use(car, game) {
    if (!car.item || !car.alive || car.locked || car.state === 'falling' || car.state === 'stun') return null;
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
        owner: car.id, target: game.missileTarget(car), age: 0, alarm: 0, near: null,
      });
    } else if (item === 'whomp') {
      this.shocks.push({ x: car.x, z: car.z, r: 0, owner: car.id, hit: new Set() });
    }
    game.events.push({ type: 'use', car: car.id, item });
    return item;
  }
}
