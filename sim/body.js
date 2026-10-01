// Corpo rigido 3D para o que sai do chao: carros capotando/carcacas e pneus soltos. Sem DOM/Three.
// Nada aqui e animacao pre-definida: o giro, o quique e o rolamento saem de impulsos de contato com o chao
// (cantos da caixa do carro, aro do pneu), gravidade e atrito.
//
// Eixos: x, z no plano da pista (z para baixo), y para cima. Quaternion [x,y,z,w] com o mesmo referencial do
// modelo 3D: frente = +x local, cima = +y local, direita = +z local. Rumo h: frente = (cos h, 0, sin h);
// girar o rumo h para a direita equivale a omega_y = -dh/dt.

/** Caixa do carro (origem do carro = centro da base, entre as rodas). */
export const BOX = { hx: 1.65, hy: 1.1, hz: 1.0, cg: 1.1, inertia: [0.7, 1.45, 1.31] };
/** Carcaca sem pneus: o casco apoia ~0,45 acima da origem. */
export const BOX_WRECK = { hx: 1.6, hy: 0.85, hz: 0.95, cg: 1.33, inertia: [0.7, 1.45, 1.31] };
/** Pneu solto: cilindro de eixo local z. */
export const WHEEL = { r: 0.6, hw: 0.28, mass: 0.08 };

const EPS = 1e-9;

export function qmul(a, b, o = [0, 0, 0, 1]) {
  const ax = a[0], ay = a[1], az = a[2], aw = a[3], bx = b[0], by = b[1], bz = b[2], bw = b[3];
  o[0] = aw * bx + ax * bw + ay * bz - az * by;
  o[1] = aw * by - ax * bz + ay * bw + az * bx;
  o[2] = aw * bz + ax * by - ay * bx + az * bw;
  o[3] = aw * bw - ax * bx - ay * by - az * bz;
  return o;
}

export function qnorm(q) {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  q[0] /= l; q[1] /= l; q[2] /= l; q[3] /= l;
  return q;
}

/** Matriz de rotacao 3x3 (linha a linha); as COLUNAS sao os eixos locais (frente, cima, direita) no mundo. */
export function qmat(q, m = new Array(9)) {
  const x = q[0], y = q[1], z = q[2], w = q[3];
  m[0] = 1 - 2 * (y * y + z * z); m[1] = 2 * (x * y - z * w); m[2] = 2 * (x * z + y * w);
  m[3] = 2 * (x * y + z * w); m[4] = 1 - 2 * (x * x + z * z); m[5] = 2 * (y * z - x * w);
  m[6] = 2 * (x * z - y * w); m[7] = 2 * (y * z + x * w); m[8] = 1 - 2 * (x * x + y * y);
  return m;
}

/** Orientacao de um carro rodando: rumo h (giro), pitch (nariz para cima +) e roll (lado direito para baixo +). */
export function orient(h, pitch, roll, q = [0, 0, 0, 1]) {
  const a = -h / 2, b = pitch / 2, c = roll / 2;
  const qy = [0, Math.sin(a), 0, Math.cos(a)];
  const qz = [0, 0, Math.sin(b), Math.cos(b)];
  const qx = [Math.sin(c), 0, 0, Math.cos(c)];
  const t = qmul(qy, qz);
  return qmul(t, qx, q);
}

/** Integra a orientacao com velocidade angular de MUNDO w = [x,y,z]. */
export function qintegrate(q, w, dt) {
  const hw = 0.5 * dt;
  const dx = hw * (w[0] * q[3] + w[1] * q[2] - w[2] * q[1]);
  const dy = hw * (w[1] * q[3] + w[2] * q[0] - w[0] * q[2]);
  const dz = hw * (w[2] * q[3] + w[0] * q[1] - w[1] * q[0]);
  const dw = hw * (-w[0] * q[0] - w[1] * q[1] - w[2] * q[2]);
  q[0] += dx; q[1] += dy; q[2] += dz; q[3] += dw;
  return qnorm(q);
}

/** I^-1 * v no mundo, dado R (m) e a inercia do corpo (diagonal) multiplicada por `k`. */
function invIv(m, I, k, v, o) {
  const bx = (m[0] * v[0] + m[3] * v[1] + m[6] * v[2]) / (I[0] * k);
  const by = (m[1] * v[0] + m[4] * v[1] + m[7] * v[2]) / (I[1] * k);
  const bz = (m[2] * v[0] + m[5] * v[1] + m[8] * v[2]) / (I[2] * k);
  o[0] = m[0] * bx + m[1] * by + m[2] * bz;
  o[1] = m[3] * bx + m[4] * by + m[5] * bz;
  o[2] = m[6] * bx + m[7] * by + m[8] * bz;
  return o;
}

const cross = (a, b, o) => { o[0] = a[1] * b[2] - a[2] * b[1]; o[1] = a[2] * b[0] - a[0] * b[2]; o[2] = a[0] * b[1] - a[1] * b[0]; return o; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const T1 = [0, 0, 0], T2 = [0, 0, 0], T3 = [0, 0, 0], RV = [0, 0, 0], TD = [0, 0, 0];

/**
 * Impulso de contato num ponto com braco r (do CG), normal n (unitaria, para fora do chao).
 * v e w (velocidade linear e angular, mundo) sao alterados. Retorna o impulso normal aplicado.
 */
export function contactImpulse(v, w, m, I, k, invM, r, n, e, mu) {
  cross(w, r, T1);
  RV[0] = v[0] + T1[0]; RV[1] = v[1] + T1[1]; RV[2] = v[2] + T1[2];
  const vn = dot(RV, n);
  if (vn >= 0) return 0;
  cross(r, n, T1); invIv(m, I, k, T1, T2); cross(T2, r, T3);
  const kn = invM + dot(T3, n);
  const jn = (-(1 + (vn < -1.4 ? e : 0)) * vn) / kn;
  v[0] += n[0] * jn * invM; v[1] += n[1] * jn * invM; v[2] += n[2] * jn * invM;
  cross(r, n, T1);
  invIv(m, I, k, T1, T2);
  w[0] += T2[0] * jn; w[1] += T2[1] * jn; w[2] += T2[2] * jn;
  // atrito de Coulomb no plano tangente
  const vtx = RV[0] - vn * n[0], vty = RV[1] - vn * n[1], vtz = RV[2] - vn * n[2];
  const vt = Math.hypot(vtx, vty, vtz);
  if (vt > EPS) {
    TD[0] = vtx / vt; TD[1] = vty / vt; TD[2] = vtz / vt;
    cross(r, TD, T1); invIv(m, I, k, T1, T2); cross(T2, r, T3);
    const kt = invM + dot(T3, TD);
    const jt = Math.min(mu * jn, vt / kt);
    v[0] -= TD[0] * jt * invM; v[1] -= TD[1] * jt * invM; v[2] -= TD[2] * jt * invM;
    cross(r, TD, T1); invIv(m, I, k, T1, T2);
    w[0] -= T2[0] * jt; w[1] -= T2[1] * jt; w[2] -= T2[2] * jt;
  }
  return jn;
}

const GN = { y: 0, nx: 0, ny: 1, nz: 0 };
const R3 = [0, 0, 0], N3 = [0, 1, 0], V3 = [0, 0, 0], W3 = [0, 0, 0], M9 = new Array(9);

/**
 * Um passo de corpo livre para um carro (capotando, carcaca ou em queda apos pancada).
 * Le/escreve: car.q, car.vx/vy/vz, car.w (=-omega_y), car.ox/oz, car.y e car.h. A posicao x,z e integrada fora.
 * `p` = { g, heavy, righting }. Retorna true se tocou o chao.
 */
export function tumbleStep(car, track, dt, p) {
  V3[0] = car.vx; V3[1] = car.vy - p.g * dt; V3[2] = car.vz;
  W3[0] = car.ox; W3[1] = -car.w; W3[2] = car.oz;
  // um pouco de arrasto no ar
  const dmp = Math.exp(-0.25 * dt);
  W3[0] *= dmp; W3[1] *= dmp; W3[2] *= dmp;
  qintegrate(car.q, W3, dt);
  car.y += V3[1] * dt;
  qmat(car.q, M9);
  if (Math.hypot(M9[0], M9[6]) > 0.35) car.h = Math.atan2(M9[6], M9[0]);

  const B = p.box || BOX;
  const e = p.heavy ? 0.16 : 0.3, mu = p.heavy ? 0.7 : 0.55;
  const hint = car.near ? car.near.idx : -1;
  let touched = false, worst = 0;
  const cgx = car.x + B.cg * M9[1], cgz = car.z + B.cg * M9[7];
  for (let it = 0; it < 3; it++) {
    worst = 0;
    for (let c = 0; c < 8; c++) {
      const lx = c & 1 ? B.hx : -B.hx, ly = c & 2 ? B.hy : -B.hy, lz = c & 4 ? B.hz : -B.hz;
      R3[0] = M9[0] * lx + M9[1] * ly + M9[2] * lz;
      R3[1] = M9[3] * lx + M9[4] * ly + M9[5] * lz;
      R3[2] = M9[6] * lx + M9[7] * ly + M9[8] * lz;
      const px = cgx + R3[0], pz = cgz + R3[2];
      const py = car.y + B.cg * M9[4] + R3[1];
      track.groundAt(px, pz, hint, GN);
      const pen = GN.y - py;
      if (pen < -0.03) continue;
      touched = true;
      if (pen > worst) worst = Math.min(pen, 1.5);
      N3[0] = GN.nx; N3[1] = GN.ny; N3[2] = GN.nz;
      contactImpulse(V3, W3, M9, B.inertia, 1, 1, R3, N3, e, mu);
    }
    if (worst > 0) car.y += worst * 0.9;
  }
  if (touched) {
    // atrito de rolamento / amortecimento no chao
    const dd = Math.exp(-(p.heavy ? 1.6 : 0.9) * dt);
    W3[0] *= dd; W3[1] *= dd; W3[2] *= dd;
  }
  // endireitar (so carros vivos depois do atordoamento): torque fisico que leva o "cima" do carro para o +y do mundo
  if (p.righting && touched) {
    const ux = M9[1], uy = M9[4], uz = M9[7];
    const tx = -uz, tz = ux; // up x Y
    const k = 22 * dt;
    W3[0] += tx * k; W3[2] += tz * k;
    if (uy < 0) W3[0] += k * (ux >= 0 ? 1 : -1) * 0.5; // de cabeca para baixo: empurra para algum lado
  }
  car.vx = V3[0]; car.vy = V3[1]; car.vz = V3[2];
  car.ox = W3[0]; car.oz = W3[2]; car.w = -W3[1];
  car.upY = M9[4];
  return touched;
}

/** Pitch (nariz para cima +) e roll (direita para baixo +) de um quaternion, para quando o carro volta a rodar. */
export function tiltOf(q, out = { pitch: 0, roll: 0 }) {
  qmat(q, M9);
  out.pitch = Math.asin(Math.max(-1, Math.min(1, M9[3])));
  // direita = coluna 2; sua altura (M9[5]) negativa = lado direito para baixo
  out.roll = Math.asin(Math.max(-1, Math.min(1, -M9[5]))) * 1;
  return out;
}

// ------------------------------------------------------------------ pneus soltos

/** Cria um pneu solto com a velocidade do ponto de onde saiu. */
export function makeWheel(id, x, y, z, v, w, q, hint = -1) {
  return { id, x, y, z, v: v.slice(), w: w.slice(), q: q.slice(), hint, rest: 0, asleep: false, dead: false, age: 0 };
}

const WI = [0.5 * WHEEL.r * WHEEL.r, (3 * WHEEL.r * WHEEL.r + 4 * WHEEL.hw * WHEEL.hw) / 12, 0];

/** Passo de fisica de um pneu: cilindro rigido de eixo local z rolando sobre o terreno. */
export function stepWheel(wh, track, dt, g) {
  if (wh.dead || wh.asleep) return;
  wh.age += dt;
  wh.v[1] -= g * dt;
  const dmp = Math.exp(-0.05 * dt);
  wh.w[0] *= dmp; wh.w[1] *= dmp; wh.w[2] *= dmp;
  qintegrate(wh.q, wh.w, dt);
  qmat(wh.q, M9);
  // eixo local z (cilindro): inercia no corpo = [perp, perp, axial]
  const I = [WI[1], WI[1], WI[0]];
  track.groundAt(wh.x, wh.z, wh.hint, GN);
  if (track._gn) wh.hint = track._gn.idx;
  let touched = false, worst = 0;
  const gyAt = (px, pz) => GN.y - GN.nx / GN.ny * (px - wh.x) - GN.nz / GN.ny * (pz - wh.z);
  for (let it = 0; it < 2; it++) {
    worst = 0;
    for (let s = -1; s <= 1; s += 2) {
      for (let a = 0; a < 8; a++) {
        const th = (a / 8) * Math.PI * 2;
        const lx = Math.cos(th) * WHEEL.r, ly = Math.sin(th) * WHEEL.r, lz = s * WHEEL.hw;
        R3[0] = M9[0] * lx + M9[1] * ly + M9[2] * lz;
        R3[1] = M9[3] * lx + M9[4] * ly + M9[5] * lz;
        R3[2] = M9[6] * lx + M9[7] * ly + M9[8] * lz;
        const py = wh.y + R3[1] + worst;
        const pen = gyAt(wh.x + R3[0], wh.z + R3[2]) - py;
        if (pen < -0.03) continue;
        touched = true;
        if (pen > worst) worst = Math.min(pen, 1);
        N3[0] = GN.nx; N3[1] = GN.ny; N3[2] = GN.nz;
        contactImpulse(wh.v, wh.w, M9, I, 1, 1, R3, N3, 0.32, 0.8);
      }
    }
    if (worst > 0) wh.y += worst * 0.9;
  }
  if (touched) {
    // resistencia ao rolamento: perde velocidade aos poucos, ate parar
    const k = Math.exp(-0.9 * dt);
    wh.w[0] *= k; wh.w[1] *= k; wh.w[2] *= k;
    const sh = Math.hypot(wh.v[0], wh.v[2]);
    if (sh > 1e-6) { const k2 = Math.max(0, sh * Math.exp(-0.9 * dt) - 4 * dt) / sh; wh.v[0] *= k2; wh.v[2] *= k2; }
  }
  wh.x += wh.v[0] * dt; wh.y += wh.v[1] * dt; wh.z += wh.v[2] * dt;
  const sp = Math.hypot(wh.v[0], wh.v[1], wh.v[2]), sw = Math.hypot(wh.w[0], wh.w[1], wh.w[2]);
  if (touched && sp < 0.25 && sw < 0.5) { wh.rest += dt; if (wh.rest > 0.6) { wh.asleep = true; wh.v.fill(0); wh.w.fill(0); } } else wh.rest = 0;
}
