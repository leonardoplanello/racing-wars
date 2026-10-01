// Caixas de item, minas, misseis e ondas Whomp.
import { ITEMS } from '../shared/protocol.js';
import { CAR } from './car.js';

const BOX_RADIUS = 2.3;
const BOX_RESPAWN = 6;
const MINE_TRIGGER = 2.3;
const MISSILE = { speed: 90, life: 4, hit: 1.6, blast: 3.2 };
// rastro do nitro: segmentos de fogo que explodem quem passar (menos o dono)
export const TRAIL = { gap: 1.1, life: 3, radius: 1.5 };
// Whomp: forca exponencial com a distancia (curto alcance): F = push * exp(-d / lambda)
export const WHOMP = { radius: 16, speed: 40, push: 110, lambda: 3.5, lift: 11 };

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
    // rastro do nitro: quem aciona deixa fogo no chao; outros carros que cruzarem explodem
    for (const c of cars) {
      if (!c.alive || c.state === 'falling' || !(c.boost > 0)) continue;
      const last = this.trails.length ? this.lastTrail.get(c.id) : null;
      const bx = c.x - Math.cos(c.h) * 1.9, bz = c.z - Math.sin(c.h) * 1.9;
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
      if (t.age < 0.25) continue; // o fogo nasce atras do dono: da tempo dele se afastar
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
        c.vx += nx * k;
        c.vz += nz * k;
        c.w += (nx * Math.sin(c.h) - nz * Math.cos(c.h)) * k * 0.05;
        c.vy = Math.max(c.vy, WHOMP.lift * e); // sai do chao
        c.y = Math.max(c.y, 0.05);
        if (c.state === 'run' || c.state === 'grid') {
          c.state = 'stun'; c.stun = 0.5 + 1.0 * e;
          c.w += (nx * Math.sin(c.h) - nz * Math.cos(c.h) > 0 ? 1 : -1) * (4 + 10 * e); // giro real: o carro fica virado onde parar
        }
        if (c.state === 'stun' || c.state === 'wreck') {
          c.pitchVel += (nx * Math.cos(c.h) + nz * Math.sin(c.h)) * 9 * e; // capota para longe da onda
          c.rollVel += (nx * Math.sin(c.h) - nz * Math.cos(c.h)) * 9 * e;
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
        owner: car.id, age: 0, alarm: 0, near: null,
      });
    } else if (item === 'whomp') {
      this.shocks.push({ x: car.x, z: car.z, r: 0, owner: car.id, hit: new Set() });
    }
    game.events.push({ type: 'use', car: car.id, item });
    return item;
  }
}
