// Camera de perseguicao: fica SEMPRE atras do pelotao, olhando ao longo da pista, mais horizontal (como na v0.3),
// e acompanha as curvas pelo rumo da pista a frente do lider. Toda a matematica (enquadramento, zoom e corte de
// carros) e pura, sem Three, para ser testada.
//
// Regras:
//  - a camera segue a MEDIA de todos os carros, com a ancora perto do centro (muita pista a frente);
//  - o zoom afasta para o carro da frente nao passar de topNy;
//  - o zoom out (altura/distancia) aumenta para encaixar o carro mais atrasado, ate um LIMITE fixo;
//  - so e cortado quem fica para TRAS (borda de baixo) ou foge muito pelos lados. Nunca pela frente;
//  - a camera sobe e desce com o chao sob o lider (rampas, plateau), suavizada; nada de tremor por colisoes.

const RAD = Math.PI / 180;

export const CAMERA = {
  pitch: 44 * RAD, // inclinacao para baixo (mais alta que a v0.3, ainda longe de vertical)
  fov: 52, // graus, vertical
  hMin: 24, // altura minima
  hMax: 44, // LIMITE do zoom-out
  leaderNy: 0.1, // posicao vertical da ancora (media do pelotao) na tela (-1 baixo .. +1 topo); baixo = mais pista a frente
  topNy: 0.8, // o carro da frente nunca passa disso (o zoom afasta)
  rearNy: -0.8, // o zoom tenta manter o ultimo carro acima disso
  cutNy: -1.05, // abaixo disso o carro e destruido (ficou para tras)
  cutNx: 2.0, // lateral: so se for muito longe (explorar o cenario e permitido)
  yawLook: 18, // antecipacao do rumo (unidades ao longo da pista)
  carY: 0.6,
  shakeMax: 0.8, // teto do tremor (unidades de mundo)
  // suavizacao (1/s; menor = mais calma). A ancora segue o lider devagar na LATERAL para nao acompanhar o balanco do carro.
  kAlong: 6, // ancora ao longo da pista
  kLat: 1.8, // ancora lateral
  kYaw: 2.4, // rumo da camera
  kHUp: 2.5, // zoom out
  kHDown: 0.7, // zoom in
  yawDead: 0.015, // rad: diferencas menores que isso nao mexem a camera
  hDead: 0.5, // unidades: o alvo de altura so muda se passar disso
  lead: 1, // compensacao do atraso da ancora (0 = desliga)
};

// derivados lidos ao vivo (o painel de debug pode mexer em CAMERA)
const tanHalf = () => Math.tan((CAMERA.fov * RAD) / 2);
/** distancia horizontal atras do lider por unidade de altura */
const backPerH = () => 1 / Math.tan(CAMERA.pitch - Math.atan(CAMERA.leaderNy * tanHalf()));

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
  const T = tanHalf();
  out.nx = (dx * rx + dz * rz) / d / (T * aspect);
  out.ny = (dx * ux + dy * uy + dz * uz) / d / T;
  return out;
}

export class ChaseCamera {
  constructor(aspect = 16 / 9) {
    this.aspect = aspect;
    this.ax = 0; this.az = 0; this.ay = 0; this.yaw = 0; this.H = CAMERA.hMin + 4;
    this.tax = 0; this.taz = 0; this.tay = 0; this.tyaw = 0; this.tH = this.H; this.tHs = this.H;
    this.lvx = 0; this.lvz = 0; this.svx = 0; this.svz = 0; // velocidade do lider (filtrada) para compensar o atraso
    this.fast = 1; // multiplicador da suavizacao (last stand)
    this.shake = 0;
    this.t = 0;
    this.x = 0; this.y = 0; this.z = 0;
    this.place();
  }

  /** Posicao da camera a partir de ancora (ax,az), yaw, altura H acima do chao `ay`. */
  posFor(ax, az, yaw, H, out = {}, ay = 0) {
    const back = H * backPerH();
    out.x = ax - Math.cos(yaw) * back;
    out.z = az - Math.sin(yaw) * back;
    out.y = ay + H;
    return out;
  }
  place() { this.posFor(this.ax, this.az, this.yaw, this.H, this, this.ay); }

  /** Projeta um ponto do mundo. nx,ny em [-1,1] quando visivel; d = profundidade (<=0: atras da camera). */
  project(px, py, pz, out = { nx: 0, ny: 0, d: 0 }) {
    return projectWith(this.x, this.y, this.z, this.yaw, this.aspect, px, py, pz, out);
  }

  /** Tremor suave (ruido continuo, sem sorteio por frame) a somar na posicao da camera. */
  shakeOffset(out = { x: 0, y: 0, z: 0 }) {
    const s = Math.min(this.shake, CAMERA.shakeMax), t = this.t;
    out.x = Math.sin(t * 41) * Math.sin(t * 17.3) * s * 0.45;
    out.y = Math.sin(t * 37.7 + 1) * Math.sin(t * 13.1) * s * 0.3;
    out.z = Math.sin(t * 29.3 + 2) * Math.sin(t * 19.7) * s * 0.45;
    return out;
  }

  /** Altura do chao sob o carro (tabuleiro da pista; 0 fora dele). */
  groundOf(c, track) {
    if (c.near && c.near.d !== undefined) return track.groundFromNear(c.near, this._g || (this._g = { y: 0, nx: 0, ny: 1, nz: 0 })).y;
    return track.elevAt(c.near ? c.near.s : track.wrapS(c.progress));
  }

  /** Define o alvo a partir dos carros vivos. `track` fornece o rumo e o chao da pista. */
  computeTarget(cars, track) {
    if (!cars.length) return;
    if (!(this.aspect > 0.3 && this.aspect < 10)) this.aspect = 16 / 9;
    // ancora = MEDIA de todos os carros (posicao, velocidade, chao e progresso), nao so o lider
    let ax = 0, az = 0, ay = 0, vx = 0, vz = 0, pr = 0;
    for (const c of cars) {
      ax += c.x; az += c.z; ay += this.groundOf(c, track);
      vx += c.vx || 0; vz += c.vz || 0; pr += c.progress;
    }
    const n = cars.length;
    this.tax = ax / n;
    this.taz = az / n;
    this.tay = ay / n;
    this.lvx = vx / n;
    this.lvz = vz / n;
    const p = track.pointAt(pr / n + CAMERA.yawLook);
    this.tyaw = Math.atan2(p.tz, p.tx);

    // menor altura que mantem o ultimo carro (embaixo) e o primeiro (em cima) visiveis (busca binaria; monotonica)
    const tmp = { x: 0, y: 0, z: 0 }, o = { nx: 0, ny: 0, d: 0 };
    const fits = (H) => {
      this.posFor(this.tax, this.taz, this.tyaw, H, tmp, this.tay);
      for (const c of cars) {
        projectWith(tmp.x, tmp.y, tmp.z, this.tyaw, this.aspect, c.x, (c.y || 0) + CAMERA.carY, c.z, o);
        const ny = o.d > 0.1 ? o.ny : -9;
        if (ny < CAMERA.rearNy || ny > CAMERA.topNy) return false;
      }
      return true;
    };
    let H;
    if (fits(CAMERA.hMin)) H = CAMERA.hMin;
    else if (!fits(CAMERA.hMax)) H = CAMERA.hMax;
    else {
      let lo = CAMERA.hMin, hi = CAMERA.hMax;
      for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) hi = mid; else lo = mid;
      }
      H = hi;
    }
    // zona morta: o alvo de altura so muda de verdade se passar de hDead (ou chegar nos limites); acaba com o "respirar"
    if (H <= CAMERA.hMin + 1e-6 || H >= CAMERA.hMax - 1e-6 || Math.abs(H - this.tHs) > CAMERA.hDead) this.tHs = H;
    this.tH = this.tHs;
  }

  /** Foco fechado em um carro (zoom do sobrevivente). */
  focus(car, track, H = 11) {
    this.tax = car.x; this.taz = car.z;
    this.tay = this.groundOf(car, track);
    this.lvx = this.lvz = 0;
    const p = track.pointAt((car.near ? car.near.s : track.wrapS(car.progress)) + CAMERA.yawLook);
    this.tyaw = Math.atan2(p.tz, p.tx);
    this.tH = this.tHs = H;
  }

  update(dt) {
    const f = this.fast;
    this.t += dt;
    const ka = 1 - Math.exp(-CAMERA.kAlong * f * dt);
    const kl = 1 - Math.exp(-CAMERA.kLat * f * dt);
    const ky = 1 - Math.exp(-CAMERA.kYaw * f * dt);
    const kg = 1 - Math.exp(-3 * f * dt); // o chao (rampas) e acompanhado devagar
    const kh = 1 - Math.exp(-(this.tH > this.H ? CAMERA.kHUp : CAMERA.kHDown) * f * dt);
    // velocidade do lider filtrada: compensa o atraso da suavizacao (so ao longo da pista) sem passar o ruido das batidas
    const kv = 1 - Math.exp(-6 * dt);
    this.svx += (this.lvx - this.svx) * kv;
    this.svz += (this.lvz - this.svz) * kv;
    const fx = Math.cos(this.yaw), fz = Math.sin(this.yaw);
    const ex = this.tax + (this.svx * CAMERA.lead) / CAMERA.kAlong - this.ax, ez = this.taz + (this.svz * CAMERA.lead) / CAMERA.kAlong - this.az;
    const ea = ex * fx + ez * fz, el = -ex * fz + ez * fx; // erro ao longo da pista e lateral
    const da = ea * ka, dl = el * kl;
    this.ax += fx * da - fz * dl;
    this.az += fz * da + fx * dl;
    this.ay += (this.tay - this.ay) * kg;
    let ey = wrap(this.tyaw - this.yaw);
    ey = Math.sign(ey) * Math.max(0, Math.abs(ey) - CAMERA.yawDead);
    this.yaw += ey * ky;
    this.H += (this.tH - this.H) * kh;
    this.shake = Math.min(this.shake, CAMERA.shakeMax) * Math.exp(-5 * dt);
    this.place();
  }

  snap() {
    this.ax = this.tax + (this.lvx * CAMERA.lead) / CAMERA.kAlong; this.az = this.taz + (this.lvz * CAMERA.lead) / CAMERA.kAlong;
    this.svx = this.lvx; this.svz = this.lvz;
    this.ay = this.tay; this.yaw = this.tyaw; this.H = this.tH; this.tHs = this.tH;
    this.place();
  }

  /** Quao perto do corte esta o ponto (>1 = sera destruido). Pela frente nunca passa de 0. */
  edgeRatio(x, z, y = 0) {
    const o = this._o || (this._o = { nx: 0, ny: 0, d: 0 });
    this.project(x, y + CAMERA.carY, z, o);
    if (o.d <= 0.1) return 9;
    const rear = Math.max(0, o.ny / CAMERA.cutNy);
    const side = Math.abs(o.nx) / CAMERA.cutNx;
    return Math.max(rear, side);
  }

  /** O carro saiu do quadro por tras ou pelos lados? (nunca pela frente) */
  isCut(x, z, y = 0) { return this.edgeRatio(x, z, y) > 1; }
}
