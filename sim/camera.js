// Camera de perseguicao: fica SEMPRE atras do pelotao, olhando ao longo da pista, com o grupo
// de carros no MEIO da tela. Toda a matematica (enquadramento, zoom e corte) e pura, sem Three.
//
// Regras:
//  - a ancora e o ponto medio entre o lider e o ultimo carro: o pelotao fica no centro da tela;
//  - o zoom out (altura) aumenta para caber lider (em cima) e ultimo (embaixo), ate um LIMITE fixo;
//  - passando do limite, a ancora favorece o LIDER: ele nunca sai pela frente; so quem fica para
//    TRAS (borda de baixo) ou foge muito pelos lados e cortado.

const RAD = Math.PI / 180;

export const CAMERA = {
  pitch: 60 * RAD, // inclinacao para baixo (mais de cima: carros ao meio da tela)
  fov: 52, // graus, vertical
  hMin: 31, // altura minima
  hMax: 48, // LIMITE do zoom-out
  topNy: 0.5, // o lider nunca passa disso (fica abaixo da placa de voltas)
  sideNx: 0.78, // os carros tambem cabem na largura
  rearNy: -0.52, // o zoom tenta manter o ultimo carro acima disso
  cutNy: -0.86, // abaixo disso o carro e destruido (ficou para tras)
  cutNx: 2.0, // lateral: so se for muito longe (explorar o cenario e permitido)
  yawLook: 22, // antecipacao do rumo (unidades ao longo da pista)
  carY: 0.5,
};

const T = Math.tan((CAMERA.fov * RAD) / 2);
/** distancia horizontal atras da ancora por unidade de altura (a ancora fica no centro da tela) */
const BACK_PER_H = 1 / Math.tan(CAMERA.pitch);

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
    this.ax = 0; this.az = 0; this.yaw = 0; this.H = CAMERA.hMin + 3;
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
    let leader = cars[0], rear = cars[0];
    for (const c of cars) {
      if (c.progress > leader.progress) leader = c;
      if (c.progress < rear.progress) rear = c;
    }
    const p = track.pointAt((leader.near ? leader.near.s : track.wrapS(leader.progress)) + CAMERA.yawLook);
    const yaw = Math.atan2(p.tz, p.tx);
    this.tyaw = yaw;

    const tmp = { x: 0, y: 0, z: 0 }, o = { nx: 0, ny: 0, d: 0 };
    // extremos verticais da tela dos carros para uma ancora e altura dadas
    const extent = (ax, az, H) => {
      this.posFor(ax, az, yaw, H, tmp);
      let lo = Infinity, hi = -Infinity, wide = 0;
      for (const c of cars) {
        projectWith(tmp.x, tmp.y, tmp.z, yaw, this.aspect, c.x, CAMERA.carY, c.z, o);
        const ny = o.d > 0.1 ? o.ny : -9;
        if (ny < lo) lo = ny;
        if (ny > hi) hi = ny;
        if (Math.abs(o.nx) > wide) wide = Math.abs(o.nx);
      }
      return [lo, hi, wide];
    };
    const fits = (ax, az, H) => { const [lo, hi, wide] = extent(ax, az, H); return lo >= CAMERA.rearNy && hi <= CAMERA.topNy && wide <= CAMERA.sideNx; };

    // ancora = ponto medio entre o lider e o ultimo
    let ax = (leader.x + rear.x) / 2, az = (leader.z + rear.z) / 2;
    if (fits(ax, az, CAMERA.hMin)) this.tH = CAMERA.hMin;
    else if (fits(ax, az, CAMERA.hMax)) {
      let lo = CAMERA.hMin, hi = CAMERA.hMax;
      for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (fits(ax, az, mid)) hi = mid; else lo = mid; }
      this.tH = hi;
    } else {
      // nao cabe: zoom maximo e a ancora vai ao lider ate ele caber no topo (so o ultimo sai por baixo)
      this.tH = CAMERA.hMax;
      let lo = 0, hi = 1; // fracao do caminho da ancora ate o lider
      for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2;
        const bx = ax + (leader.x - ax) * mid, bz = az + (leader.z - az) * mid;
        this.posFor(bx, bz, yaw, CAMERA.hMax, tmp);
        projectWith(tmp.x, tmp.y, tmp.z, yaw, this.aspect, leader.x, CAMERA.carY, leader.z, o);
        if (o.ny > CAMERA.topNy) lo = mid; else hi = mid;
      }
      // ancora ainda mais perto do lider por seguranca (o lider nunca pode sair pela frente)
      ax += (leader.x - ax) * hi; az += (leader.z - az) * hi;
    }
    // compensa o atraso da suavizacao (filtro de 1a ordem a 9/s): sem isso o grupo aparece deslocado para frente
    this.tax = ax + (((leader.vx || 0) + (rear.vx || 0)) / 2) / 9;
    this.taz = az + (((leader.vz || 0) + (rear.vz || 0)) / 2) / 9;
  }

  /** Foco fechado em um carro (zoom do sobrevivente). */
  focus(car, track, H = 9) {
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
