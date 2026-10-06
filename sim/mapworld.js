// Mundo de um mapa do SRB2Kart (dados "baked" por tools/srb2kart/bake.js): setores com rampas, pisos 3D (FOF), linhas de
// colisao e BSP para achar o setor de um ponto. Puro (sem DOM/Three): roda no host e nos testes.
// Coordenadas do jogo: x, z no plano, y para cima. Plano de rampa: y = a*x + b*z + c.

const MAX_FOF = 8;

/**
 * Lancamento para ligar dois pontos (molas, dash pads e elos assistidos): `dist` na horizontal e `dy` de altura. Devolve a
 * velocidade vertical `vy` e a horizontal `v` para pousar la depois de T segundos (gravidade g; o carro corre a ~vRef).
 */
export function linkLaunch(dist, dy, g = 26, vRef = 34) {
  let T = Math.max(dist / vRef, 0.25);
  if (dy > 0) T = Math.max(T, 2 * Math.sqrt((2 * dy) / g) + 0.1); // sobe devagar o bastante
  return { vy: dy / T + 0.5 * g * T, v: Math.max(8, dist / T), T };
}
export const SECTOR_SKY = 'F_SKY1';

/** Decodifica o special do setor (nibbles s1..s4). */
export function secNibbles(sp, out = { s1: 0, s2: 0, s3: 0, s4: 0 }) {
  const v = sp & 0xffff;
  out.s1 = v & 15; out.s2 = (v >> 4) & 15; out.s3 = (v >> 8) & 15; out.s4 = (v >> 12) & 15;
  return out;
}

export class MapWorld {
  constructor(d) {
    this.d = d;
    this.s = d.scale;
    this.inv = 1 / d.scale;
    this.sectors = d.sectors;
    this.fofs = d.fofs;
    this.lines = d.lines;
    this.stepUp = d.stepUp;
    this.nodes = d.nodes;
    this.subSector = d.subSector;
    this.nNodes = d.nodes.length / 6;
    this._nb = { s1: 0, s2: 0, s3: 0, s4: 0 };
    // grade espacial de linhas (celula de 16 u)
    this.cell = 16;
    this.grid = new Map();
    d.lines.forEach((l, i) => {
      if (l[6] === l[7]) return; // linha interna (os dois lados no mesmo setor): sem colisao
      const x0 = Math.min(l[0], l[2]), x1 = Math.max(l[0], l[2]), z0 = Math.min(l[1], l[3]), z1 = Math.max(l[1], l[3]);
      for (let cx = Math.floor(x0 / this.cell); cx <= Math.floor(x1 / this.cell); cx++) {
        for (let cz = Math.floor(z0 / this.cell); cz <= Math.floor(z1 / this.cell); cz++) {
          const k = cx * 65537 + cz;
          let a = this.grid.get(k);
          if (!a) this.grid.set(k, (a = []));
          a.push(i);
        }
      }
    });
    this._seen = new Int32Array(d.lines.length);
    this._stamp = 0;
  }

  /** Setor que contem (x,z) (BSP; o ponto e convertido para unidades do mapa). */
  locate(x, z) {
    const mx = x * this.inv, my = -z * this.inv, N = this.nodes;
    let n = this.nNodes - 1;
    if (n < 0) return 0;
    for (let g = 0; g < 80; g++) {
      const o = n * 6, dx = mx - N[o], dy = my - N[o + 1];
      const child = dy * N[o + 2] < N[o + 3] * dx ? N[o + 4] : N[o + 5];
      if (child & 0x8000) return this.subSector[child & 0x7fff] ?? 0;
      n = child;
    }
    return 0;
  }

  static plane(p, x, z) { return p[0] * x + p[1] * z + p[2]; }
  floorAt(si, x, z) { const S = this.sectors[si]; return S.fs ? S.fs[0] * x + S.fs[1] * z + S.fs[2] : S.f; }
  ceilAt(si, x, z) { const S = this.sectors[si]; return S.cs ? S.cs[0] * x + S.cs[1] * z + S.cs[2] : S.c; }
  fofTop(f, x, z) { return typeof f.t === 'number' ? f.t : f.t[0] * x + f.t[1] * z + f.t[2]; }
  fofBottom(f, x, z) { return typeof f.b === 'number' ? f.b : f.b[0] * x + f.b[1] * z + f.b[2]; }

  /**
   * Superficie para pisar em (x,z) dentro do setor `si`, vista por um carro na altura y: a mais alta que o carro alcanca
   * (topo <= y + degrau). Preenche out = {y, sec (setor que da o special), fof (-1 = piso do setor), nx, ny, nz}; devolve false
   * se nem o piso do setor e alcancavel (parede alta demais).
   */
  surfaceIn(si, x, z, y, out) {
    const S = this.sectors[si];
    const lim = y + this.stepUp + 1e-4;
    let best = this.floorAt(si, x, z), sec = si, fof = -1, plane = S.fs;
    let reach = best <= lim;
    for (let k = 0; k < S.fofs.length; k++) {
      const f = this.fofs[S.fofs[k]];
      if (f.kind !== 'solid') continue;
      const top = this.fofTop(f, x, z);
      if (top <= lim && (top > best || !reach)) { best = top; sec = f.ctrl; fof = S.fofs[k]; plane = typeof f.t === 'number' ? 0 : f.t; reach = true; }
    }
    if (!reach) { // nada ao alcance: o piso (o carro fica contra ele)
      out.y = best; out.sec = si; out.fof = -1;
    } else { out.y = best; out.sec = sec; out.fof = fof; }
    // pisos 3D intangiveis (tipo 220-223) carregam o special do setor de controle (poco, fora de pista...) para quem esta dentro da faixa deles
    for (let k = 0; k < S.fofs.length; k++) {
      const f = this.fofs[S.fofs[k]];
      if (f.kind !== 'intangible' || !f.sp) continue;
      if (best >= this.fofBottom(f, x, z) - 0.02 && best <= this.fofTop(f, x, z) + 0.02) { out.sec = f.ctrl; break; }
    }
    if (plane) {
      const a = plane[0], b = plane[1], l = Math.hypot(a, b, 1);
      out.nx = -a / l; out.ny = 1 / l; out.nz = -b / l;
    } else { out.nx = 0; out.ny = 1; out.nz = 0; }
    return reach;
  }

  /** Superficie sob (x,z) para um carro na altura y (localiza o setor). */
  groundAt(x, z, y, out = { y: 0, sec: 0, fof: -1, nx: 0, ny: 1, nz: 0 }) {
    const si = this.locate(x, z);
    this.surfaceIn(si, x, z, y, out);
    out.si = si;
    return out;
  }

  /** Percorre as linhas de colisao a menos de `r` de (x,z). cb(index, linha) */
  forLines(x, z, r, cb) {
    const c = this.cell;
    const stamp = ++this._stamp;
    for (let cx = Math.floor((x - r) / c); cx <= Math.floor((x + r) / c); cx++) {
      for (let cz = Math.floor((z - r) / c); cz <= Math.floor((z + r) / c); cz++) {
        const a = this.grid.get(cx * 65537 + cz);
        if (!a) continue;
        for (let k = 0; k < a.length; k++) {
          const i = a[k];
          if (this._seen[i] === stamp) continue;
          this._seen[i] = stamp;
          cb(i, this.lines[i]);
        }
      }
    }
  }

  /** O setor e vazio/sem piso (ceu) ou um poco/morte? */
  isVoid(si) { return this.sectors[si].fp === SECTOR_SKY; }
  isDeath(sec) {
    const nb = secNibbles(this.sectors[sec].sp, this._nb);
    return nb.s1 === 6 || nb.s1 === 7 || nb.s1 === 8;
  }

  /** Tipo de piso do special do setor: offroad 1-3, sneaker panel, linha de chegada... */
  surfaceInfo(sec, out = { off: 0, boost: false, finish: false, death: false, spring: false, dash: false }) {
    const nb = secNibbles(this.sectors[sec].sp, this._nb);
    out.off = nb.s1 >= 2 && nb.s1 <= 4 ? nb.s1 - 1 : 0;
    out.death = nb.s1 === 6 || nb.s1 === 7 || nb.s1 === 8;
    out.boost = nb.s4 === 6;
    out.finish = nb.s4 === 10;
    out.spring = nb.s3 === 1 || nb.s3 === 3; // painel de mola (256 / 768)
    out.dash = nb.s3 === 5 || nb.s3 === 6; // dash pad (1280 / 1536): a direcao vem de um linedef 4 com a mesma tag
    return out;
  }

  /**
   * Parede mais proxima (as mesmas que o carro enfrenta) de (x,z) a altura y dentro de `R`. Devolve a distancia (ou R se nao ha) e
   * deixa em out a direcao do ponto para a parede (nx,nz).
   */
  nearestWall(x, z, y, R, out = { nx: 0, nz: 0 }) {
    let m = R;
    const tmp = this._tw || (this._tw = { y: 0, sec: 0, fof: -1, nx: 0, ny: 1, nz: 0 });
    this.forLines(x, z, R, (li, l) => {
      const ex = l[2] - l[0], ez = l[3] - l[1], len2 = ex * ex + ez * ez;
      let t = len2 > 0 ? ((x - l[0]) * ex + (z - l[1]) * ez) / len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = l[0] + ex * t, pz = l[1] + ez * t, dist = Math.hypot(px - x, pz - z);
      if (dist >= m) return;
      let block = l[6] < 0 || l[7] < 0 || (l[4] & 1) !== 0;
      if (!block) {
        const cross = ex * (z - l[1]) - ez * (x - l[0]);
        const near = cross > 0 ? l[6] : l[7];
        block = !this.surfaceIn(near === l[6] ? l[7] : l[6], px, pz, y, tmp);
      }
      if (block) { m = dist; out.nx = dist > 1e-6 ? (px - x) / dist : 0; out.nz = dist > 1e-6 ? (pz - z) / dist : 0; }
    });
    return m;
  }

  /** O segmento cruza uma parede de verdade (linha de um lado ou IMPASSIVEL)? Ignora degraus/buracos (usado por saltos). */
  segmentWalled(x0, z0, x1, z1) {
    let hit = false;
    this.forLines((x0 + x1) / 2, (z0 + z1) / 2, Math.hypot(x1 - x0, z1 - z0) / 2 + 0.01, (i, l) => {
      if (!hit && (l[7] < 0 || l[6] < 0 || (l[4] & 1)) && segCross(x0, z0, x1, z1, l[0], l[1], l[2], l[3])) hit = true;
    });
    return hit;
  }

  /**
   * Um segmento (x0,z0)->(x1,z1) esbarra numa parede para um carro na altura y? Usado pela navegacao do importador.
   * Parede = linha de um lado, IMPASSIVEL, ou degrau acima do alcance na proxima superficie.
   */
  segmentBlocked(x0, z0, x1, z1, y) {
    const mx = Math.min(x0, x1), Mx = Math.max(x0, x1), mz = Math.min(z0, z1), Mz = Math.max(z0, z1);
    let hit = false;
    this.forLines((mx + Mx) / 2, (mz + Mz) / 2, Math.hypot(Mx - mx, Mz - mz) / 2 + 0.01, (i, l) => {
      if (hit) return;
      if (!segCross(x0, z0, x1, z1, l[0], l[1], l[2], l[3])) return;
      if (l[7] < 0 || (l[4] & 1) || l[6] < 0) { hit = true; return; }
      // duas faces: o setor do lado de ca do destino (x1,z1) precisa ter uma superficie ao alcance
      const dest = ((l[2] - l[0]) * (z1 - l[1]) - (l[3] - l[1]) * (x1 - l[0])) > 0 ? l[6] : l[7];
      const tmp = this._tmp || (this._tmp = { y: 0, sec: 0, fof: -1, nx: 0, ny: 1, nz: 0 });
      if (!this.surfaceIn(dest, x1, z1, y, tmp)) hit = true;
    });
    return hit;
  }
}

function segCross(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1x = bx - ax, d1y = by - ay, d2x = dx - cx, d2y = dy - cy;
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < 1e-12) return false;
  const t = ((cx - ax) * d2y - (cy - ay) * d2x) / den;
  const u = ((cx - ax) * d1y - (cy - ay) * d1x) / den;
  return t > 0 && t < 1 && u >= 0 && u <= 1;
}
