// Caixas de item, minas, misseis e ondas Whomp.
import { ITEMS } from '../shared/protocol.js';
import { CAR, HULL, hullPos, impulseCar } from './car.js';

// parametros gerais dos poderes (editaveis no F4). speedScale multiplica a velocidade de missil, onda whomp e morteiro
export const POWER = { boxRadius: 2.3, boxRespawn: 6, mineRadius: 1.0, mineTouch: 0.4, mineReachY: 2.2, speedScale: 1 };
export const MISSILE = { speed: 90, life: 4, hit: 1.6, blast: 3.2 };
// rastro do nitro: segmentos de fogo que explodem quem passar (menos o dono)
// curto e colado no carro: ~0,3 s de fogo (uns 15 u a 52 u/s)
export const TRAIL = { gap: 0.8, life: 0.3, radius: 1.5, grace: 0.06, back: 1.5 };
// Whomp: forca exponencial com a distancia (curto alcance): F = push * exp(-d / lambda)
export const WHOMP = { radius: 30, speed: 55, push: 160, lambda: 8, lift: 14, liveFrac: 0.5, maxSpin: 1.8, sceneryRadius: 18 };

// canhao de gelo: morteiro (arco bem alto, tipo morteiro) que cai a distancia fixa e congela os carros da area.
// lob = altura do apogeu (u) acima do ponto mais alto; flight = tempo minimo de voo (s). A velocidade do carro
// congelado esta em CAR.iceKeep / CAR.iceDecel
export const ICE = { range: 45, flight: 0.02, radius: 13, time: 4, gravity: 200, lob: 14 };

export const CUP_BOX_DENSITY = { fast: 0, super: 1, war: 2 };

/** Intensidade (0..1) do Whomp a uma distancia d do carro que o soltou. */
export function whompFactor(d) {
  return d > WHOMP.radius ? 0 : Math.exp(-d / WHOMP.lambda);
}

/** Menor distancia da borda de um circulo do casco do carro ate o ponto (x,z). */
export function hullDist(car, x, z) {
  let best = Infinity;
  for (let i = 0; i < HULL.length; i++) {
    const p = hullPos(car, i, HP);
    const d = Math.hypot(p.x - x, p.z - z) - CAR.circleR;
    if (d < best) best = d;
  }
  return best;
}
const HP = { x: 0, z: 0 };

/** Casco a casco: distancia minima entre as bordas dos circulos de dois carros. */
export function hullGap(a, b) {
  let best = Infinity;
  for (let i = 0; i < HULL.length; i++) {
    const p = hullPos(a, i, HP);
    const d = hullDist(b, p.x, p.z) - CAR.circleR;
    if (d < best) best = d;
  }
  return best;
}

/**
 * Distancia entre os circulos TRASEIROS do carro a e os circulos de b que estao ATRAS dele (a bomba so pega
 * quem encosta na traseira: lado a lado ou na frente nao conta).
 */
export function rearGap(a, b) {
  const ca = Math.cos(a.h), sa = Math.sin(a.h);
  let best = Infinity;
  for (let k = 0; k < HULL.length; k++) {
    const q = hullPos(b, k, HQ);
    if ((q.x - a.x) * ca + (q.z - a.z) * sa > -1.6) continue; // so circulos de b atras da traseira de a
    for (let i = 0; i < HULL.length; i++) {
      if (!HULL[i].rear) continue;
      const p = hullPos(a, i, HP);
      const d = Math.hypot(p.x - q.x, p.z - q.z) - 2 * CAR.circleR;
      if (d < best) best = d;
    }
  }
  return best;
}
const HQ = { x: 0, z: 0 };

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
    // caixas avulsas (`def.boxes`: {x, z, h?} em coordenadas do mundo; h = altura extra: so quem esta no ar pega)
    for (const bx of this.track.def.boxes || []) {
      const nr = this.track.nearest(bx.x, bx.z, -1, this.track.newNear());
      // `y` (opcional) = altura absoluta da caixa (pistas de mapa); sem ela vale a altura da pista em `s`
      const gy = bx.y !== undefined ? bx.y - (bx.h ?? 0) : bx.h ? this.track.elevAt(nr.s) : 0;
      this.boxes.push({ x: bx.x, z: bx.z, active: true, timer: 0, s: nr.s, h: bx.h ?? 0, gy, fixed: true, y: bx.y });
    }
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
        if (b.h && (!c.air || Math.abs(c.y - (b.gy + b.h)) > 3)) continue; // caixa suspensa: so no ar, na altura do salto
        const dx = c.x - b.x, dz = c.z - b.z;
        if (dx * dx + dz * dz < POWER.boxRadius * POWER.boxRadius) {
          c.item = this.randomItem();
          b.active = false;
          b.timer = POWER.boxRespawn;
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
        if (c.id === m.owner && !m.armed) { // a mina nasce no carro: o dono so a aciona depois de sair de cima dela
          if (hullDist(c, m.x, m.z) > POWER.mineRadius + 0.3) m.armed = true;
          continue;
        }
        if (Math.abs(c.y - m.y) > POWER.mineReachY) continue; // mina no ar: so pega quem passa na mesma altura
        if (hullDist(c, m.x, m.z) < POWER.mineRadius) {
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
      m.x += Math.cos(m.h) * MISSILE.speed * POWER.speedScale * dt;
      m.z += Math.sin(m.h) * MISSILE.speed * POWER.speedScale * dt;
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
      if (!boom && this.track.scenery) {
        // o missil arrebenta em arvore/pedra/casa e quebra cercas no caminho
        m.fx = (m.fx || 0) - dt;
        if (m.fx <= 0) { m.fx = 0.05; events.push({ type: 'blast', x: m.x, z: m.z, radius: 2.2, kind: 'missileFly' }); }
        for (const o of this.track.scenery.query(m.x, m.z, 4, this._sq || (this._sq = []))) {
          if (Math.hypot(o.x - m.x, o.z - m.z) < o.r + 0.6) { boom = true; break; }
        }
      }
      if (!boom) {
        m.near = this.track.nearest(m.x, m.z, m.near ? m.near.idx : -1, m.near || this.track.newNear());
        if (Math.abs(m.near.d) > this.track.edgeAt(m.near.idx)) boom = true;
      }
      if (boom) {
        this.explode(game, m.x, m.z, 'missile', 3.2, m.owner, hit);
        this.missiles.splice(i, 1);
      }
    }
    // morteiros de gelo: voo balistico; ao tocar o chao congelam quem estiver na area
    for (let i = this.mortars.length - 1; i >= 0; i--) {
      const m = this.mortars[i];
      const kd = dt * POWER.speedScale; // tempo do morteiro escala por inteiro: o arco e o alcance nao mudam
      m.age += kd;
      m.vy -= ICE.gravity * kd;
      m.x += m.vx * kd; m.y += m.vy * kd; m.z += m.vz * kd;
      const gy = this.track.groundAt(m.x, m.z, m.hint, this._gp || (this._gp = { y: 0, nx: 0, ny: 1, nz: 0 })).y;
      if (this.track._gn) m.hint = this.track._gn.idx;
      if (m.age > 0.25 && (m.y <= gy || m.age > m.T + 1)) {
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
      s.r += WHOMP.speed * POWER.speedScale * dt;
      // a onda derruba arvores/pedras e quebra cercas ate WHOMP.sceneryRadius
      if (s.r <= WHOMP.sceneryRadius) this.blastWorld(game, s.x, s.z, s.r, 'whomp');
      for (const c of cars) {
        if (!(c.alive || c.state === 'wreck') || c.state === 'falling' || c.id === s.owner || s.hit.has(c.id)) continue;
        const dx = c.x - s.x, dz = c.z - s.z;
        const d = Math.hypot(dx, dz);
        if (d > s.r || d > WHOMP.radius) continue;
        s.hit.add(c.id);
        const e = whompFactor(d);
        const k = WHOMP.push * e;
        if (k < 0.8) continue;
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

  /** Poder que acerta o mundo: destroi arvores/pedras no raio e avisa o render (cercas quebram, cenario some). */
  blastWorld(game, x, z, radius, kind) {
    game.events.push({ type: 'blast', x, z, radius, kind });
    const sc = this.track.scenery;
    if (!sc) return;
    for (const h of sc.blast(x, z, radius)) game.events.push({ type: 'sceneryHit', kind: h.kind, idx: h.idx, x: h.x, z: h.z, h: h.h, from: kind });
  }

  /** Explosao de mina/missil: o carro atingido (e vizinhos no raio) EXPLODE e vira carcaca. */
  explode(game, x, z, kind, power, owner, direct) {
    const radius = kind === 'missile' ? MISSILE.blast : 2.6;
    this.blastWorld(game, x, z, radius + 0.5, kind);
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
    game.events.push({ type: 'blast', x, z, radius: ICE.radius, kind: 'ice' });
    const sc = this.track.scenery;
    if (sc) for (const h of sc.freeze(x, z, ICE.radius)) game.events.push({ type: 'sceneryFreeze', kind: h.kind, idx: h.idx, x: h.x, z: h.z });
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
      // alguem encostado na TRASEIRA do carro com a bomba: ela explode nele na hora
      let touched = false;
      for (const o of game.cars) {
        if (o === car || !o.alive || o.state === 'falling' || Math.abs(o.y - car.y) > 2) continue;
        if (rearGap(car, o) < POWER.mineTouch) { this.explode(game, o.x, o.z, 'mine', 2.6, car.id, o); touched = true; }
      }
      // fica parada exatamente onde foi ativada, inclusive no ar
      if (!touched) this.mines.push({ x: car.x, y: car.y, z: car.z, owner: car.id, age: 0 });
    } else if (item === 'missile') {
      this.missiles.push({
        id: this.nextId++, x: car.x + fx * 2.6, z: car.z + fz * 2.6, h: car.h,
        owner: car.id, age: 0, alarm: 0, near: null,
      });
    } else if (item === 'ice') {
      // morteiro: sobe ate `lob` acima do ponto mais alto (saida ou alvo) e despenca no alvo; flight = tempo minimo
      const sx = car.x + fx * 1.5, sz = car.z + fz * 1.5, sy = car.y + 1.8, g = ICE.gravity;
      const tx = car.x + fx * ICE.range, tz = car.z + fz * ICE.range;
      const ty = this.track.groundAt(tx, tz, -1, { y: 0, nx: 0, ny: 1, nz: 0 }).y;
      const rise = Math.max(ICE.lob, 0.5) + Math.max(0, ty - sy);
      let vy = Math.sqrt(2 * g * rise);
      let T = vy / g + Math.sqrt(Math.max(0, 2 * (sy + rise - ty) / g));
      if (T < ICE.flight) { T = ICE.flight; vy = (ty - sy + 0.5 * g * T * T) / T; }
      this.mortars.push({
        id: this.nextId++, x: sx, y: sy, z: sz, vx: (tx - sx) / T, vz: (tz - sz) / T,
        vy, T, tx, ty, tz, owner: car.id, age: 0, hint: -1,
      });
    } else if (item === 'whomp') {
      this.shocks.push({ x: car.x, z: car.z, r: 0, owner: car.id, hit: new Set() });
    }
    game.events.push({ type: 'use', car: car.id, item });
    return item;
  }
}
