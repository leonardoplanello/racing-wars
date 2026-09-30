// Camera de perseguicao: fica SEMPRE atras do pelotao, olhando ao longo da pista.
// Toda a matematica (enquadramento, zoom e corte de carros) e pura, sem Three, para ser testada.
//
// Regras:
//  - o lider fica ancorado no terco superior da tela (nunca sai pela frente);
//  - o zoom out (altura/distancia) aumenta para encaixar o carro mais atrasado, ate um LIMITE fixo;
//  - so e cortado quem fica para TRAS (borda de baixo) ou foge muito pelos lados. Nunca pela frente.

const RAD = Math.PI / 180;

export const CAMERA = {
  pitch: 36 * RAD, // inclinacao para baixo
  fov: 52, // graus, vertical
  hMin: 16, // altura minima
  hMax: 27, // LIMITE do zoom-out
  leaderNy: 0.5, // posicao vertical do lider na tela (-1 baixo .. +1 topo)
  rearNy: -0.8, // o zoom tenta manter o ultimo carro acima disso
  cutNy: -1.05, // abaixo disso o carro e destruido (ficou para tras)
  cutNx: 1.4, // lateral: fallback para curvas
  yawLook: 18, // antecipacao do rumo (unidades ao longo da pista)
  carY: 0.6,
};

const T = Math.tan((CAMERA.fov * RAD) / 2);
const BETA = Math.atan(CAMERA.leaderNy * T);
/** distancia horizontal atras do lider por unidade de altura */
const BACK_PER_H = 1 / Math.tan(CAMERA.pitch - BETA);

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function projectWith(cx, cy, cz, yaw, aspect, px, py, pz, out) {
  const cp = Math.cos(CAMERA.pitch), sp = Math.sin(CAMERA.pitch);
  const cyw = Math.cos(yaw), syw = Math.sin(yaw);
  // base: frente f, direita r (horizontal), cima u = r x f
  const fx = cyw * cp, fy = -sp, fz = syw * cp;
  const rx = -syw, rz = cyw;
  const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;
  const dx = px - cx, dy = py - cy, dz = pz - cz;
  const d = dx * fx + dy * fy + dz * fz;
  out.d = d;
  if (d <= 1e-6) { out.nx = 0; out.ny = -9; return out; }
  out.nx = (dx * rx + dz * rz) / d / (T * aspect);
  out.ny = (dx * ux + dy * uy + dz * uz) / d / T;
  return out;
}

export class ChaseCamera {
  constructor(aspect = 16 / 9) {
    this.aspect = aspect;
    this.ax = 0; this.az = 0; this.yaw = 0; this.H = CAMERA.hMin + 4;
    this.tax = 0; this.taz = 0; this.tyaw = 0; this.tH = this.H;
    this.fast = 1; // multiplicador da suavizacao (last stand)
    this.shake = 0;
    this.x = 0; this.y = 0; this.z = 0;
    this.place();
  }

  /** Posicao da camera a partir de ancora (ax,az), yaw e altura H. */
  posFor(ax, az, yaw, H, out = {}) {
    const back = H * BACK_PER_H;
    out.x = ax - Math.cos(yaw) * back;
    out.z = az - Math.sin(yaw) * back;
    out.y = H;
    return out;
  }
  place() { this.posFor(this.ax, this.az, this.yaw, this.H, this); }

  /** Projeta um ponto do mundo. nx,ny em [-1,1] quando visivel; d = profundidade (<=0: atras da camera). */
  project(px, py, pz, out = { nx: 0, ny: 0, d: 0 }) {
    return projectWith(this.x, this.y, this.z, this.yaw, this.aspect, px, py, pz, out);
  }

  /** Define o alvo a partir dos carros vivos. `track` fornece o rumo da pista. */
  computeTarget(cars, track) {
    if (!cars.length) return;
    if (!(this.aspect > 0.3 && this.aspect < 10)) this.aspect = 16 / 9;
    let leader = cars[0];
    for (const c of cars) if (c.progress > leader.progress) leader = c;
    this.tax = leader.x;
    this.taz = leader.z;
    const p = track.pointAt((leader.near ? leader.near.s : track.wrapS(leader.progress)) + CAMERA.yawLook);
    this.tyaw = Math.atan2(p.tz, p.tx);

    // menor altura que mantem o carro mais atrasado visivel (busca binaria; monotonica)
    const tmp = { x: 0, y: 0, z: 0 }, o = { nx: 0, ny: 0, d: 0 };
    const minNy = (H) => {
      this.posFor(this.tax, this.taz, this.tyaw, H, tmp);
      let m = Infinity;
      for (const c of cars) {
        projectWith(tmp.x, tmp.y, tmp.z, this.tyaw, this.aspect, c.x, CAMERA.carY, c.z, o);
        m = Math.min(m, o.d > 0.1 ? o.ny : -9);
      }
      return m;
    };
    if (minNy(CAMERA.hMin) >= CAMERA.rearNy) this.tH = CAMERA.hMin;
    else if (minNy(CAMERA.hMax) < CAMERA.rearNy) this.tH = CAMERA.hMax;
    else {
      let lo = CAMERA.hMin, hi = CAMERA.hMax;
      for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2;
        if (minNy(mid) >= CAMERA.rearNy) hi = mid; else lo = mid;
      }
      this.tH = hi;
    }
  }

  /** Foco fechado em um carro (zoom do sobrevivente). */
  focus(car, track, H = 11) {
    this.tax = car.x; this.taz = car.z;
    const p = track.pointAt((car.near ? car.near.s : track.wrapS(car.progress)) + CAMERA.yawLook);
    this.tyaw = Math.atan2(p.tz, p.tx);
    this.tH = H;
  }

  update(dt) {
    const f = this.fast;
    const kp = 1 - Math.exp(-9 * f * dt);
    const ky = 1 - Math.exp(-4.5 * f * dt);
    const kh = 1 - Math.exp(-(this.tH > this.H ? 4.5 : 1.4) * f * dt);
    this.ax += (this.tax - this.ax) * kp;
    this.az += (this.taz - this.az) * kp;
    this.yaw += wrap(this.tyaw - this.yaw) * ky;
    this.H += (this.tH - this.H) * kh;
    this.shake *= Math.exp(-5 * dt);
    this.place();
  }

  snap() {
    this.ax = this.tax; this.az = this.taz; this.yaw = this.tyaw; this.H = this.tH;
    this.place();
  }

  /** Quao perto do corte esta o ponto (>1 = sera destruido). Pela frente nunca passa de 0. */
  edgeRatio(x, z) {
    const o = this._o || (this._o = { nx: 0, ny: 0, d: 0 });
    this.project(x, CAMERA.carY, z, o);
    if (o.d <= 0.1) return 9;
    const rear = Math.max(0, o.ny / CAMERA.cutNy);
    const side = Math.abs(o.nx) / CAMERA.cutNx;
    return Math.max(rear, side);
  }

  /** O carro saiu do quadro por tras ou pelos lados? (nunca pela frente) */
  isCut(x, z) { return this.edgeRatio(x, z) > 1; }
}
