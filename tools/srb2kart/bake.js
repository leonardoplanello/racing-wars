// Converte um mapa do SRB2Kart (unidades do jogo original, y para o norte, z para cima) em dados prontos para o nosso motor:
// coordenadas do jogo x = mx*s, z = -my*s (mantem o sentido visto de cima), altura y = mz*s.
// Planos (rampas) ficam como [a,b,c]: y = a*x + b*z + c. A BSP fica em unidades do mapa (consulta converte o ponto).
import { resolveLines, ML } from './map.js';

export const SCALE = 0.06; // unidades do jogo por unidade do SRB2Kart (o kart original tem raio 16 => ~1 u; o nosso carro e maior)

/** Especiais de linedef que criam FOF (pisos 3D) e o que cada um e para o motor. */
const FOF_SOLID = new Set([100, 101, 102, 103, 104, 105, 140, 141, 142, 150, 151, 152, 160, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 190, 191, 192, 193, 194, 195, 250, 251, 252, 253, 254, 255, 256, 257, 258]);
const FOF_WATER = new Set([120, 121, 122, 123, 124, 125]);
const FOF_INTANGIBLE = new Set([220, 221, 222, 223, 146]);

/** Nibbles do special do setor (GETSECSPECIAL): s1 = dano/fora de pista..., s4 = starpost/linha de chegada/boost... */
export const secSpecial = (sp) => { const v = sp & 0xffff; return { s1: v & 15, s2: (v >> 4) & 15, s3: (v >> 8) & 15, s4: (v >> 12) & 15 }; };

export function bake(map, soc = {}, scale = SCALE) {
  const s = scale;
  const lines = resolveLines(map);
  const V = map.verts;
  const G = (mx) => mx * s; // x do jogo
  const nS = map.sectors.length;

  // ---- BSP (unidades do mapa): ponto -> setor
  const subSector = map.subs.map((ss) => {
    const seg = map.segs[ss.first];
    if (!seg) return 0;
    const l = map.lines[seg.line];
    const side = seg.side === 0 ? l.side0 : l.side1;
    return side >= 0 ? map.sides[side].sector : 0;
  });
  const locateMap = (mx, my) => {
    if (!map.nodes.length) return 0;
    let n = map.nodes.length - 1;
    for (let g = 0; g < 64; g++) {
      const nd = map.nodes[n];
      const dx = mx - nd.x, dy = my - nd.y;
      const child = dy * nd.dx < nd.dy * dx ? nd.right : nd.left; // R_PointOnSide do Doom: right < left => filho 0 (direita)
      if (child & 0x8000) return subSector[child & 0x7fff] ?? 0;
      n = child;
    }
    return 0;
  };

  // ---- setores
  const sectors = map.sectors.map((c, i) => ({ f: c.floor * s, c: c.ceil * s, fs: 0, cs: 0, fp: c.floorPic, cp: c.ceilPic, sp: c.special, tag: c.tag, light: c.light, fofs: [] }));
  const byTag = new Map();
  map.sectors.forEach((c, i) => { if (!byTag.has(c.tag)) byTag.set(c.tag, []); byTag.get(c.tag).push(i); });
  const sectorLines = Array.from({ length: nS }, () => []);
  for (const l of lines) { if (l.front >= 0) sectorLines[l.front].push(l); if (l.back >= 0 && l.back !== l.front) sectorLines[l.back].push(l); }

  // plano a partir de um ponto no mapa (mx,my,mz) e gradiente unitario (nx,ny) com derivada zd (mz por unidade do mapa)
  const planeFrom = (ox, oy, oz, nx, ny, zd) => [zd * nx, -zd * ny, s * (oz - zd * (nx * ox + ny * oy))];

  // ---- rampas por linha (700-703, 710-713): plano pela linha, no vertice mais distante do setor
  const slopeLine = (l) => {
    const sp = l.special;
    const ff = sp === 700 || sp === 702 || sp === 703, bf = sp === 710 || sp === 712 || sp === 713;
    const fc = sp === 701 || sp === 702 || sp === 713, bc = sp === 711 || sp === 712 || sp === 703;
    if (l.front < 0 || l.back < 0) return;
    const a = V[l.v1], b = V[l.v2];
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    const nx = dy / len, ny = -dx / len; // normal da direita (para dentro do setor da frente)
    const ox = a.x + dx / 2, oy = a.y + dy / 2;
    const extent = (sec) => {
      let far = -1;
      for (const m of sectorLines[sec]) {
        if (m === l) continue;
        for (const vi of [m.v1, m.v2]) {
          const p = V[vi];
          const d = Math.abs((p.x - ox) * nx + (p.y - oy) * ny);
          if (d > far) far = d;
        }
      }
      return far;
    };
    const F = map.sectors[l.front], B = map.sectors[l.back];
    if (ff || fc) {
      const E = extent(l.front);
      if (E > 0) {
        if (ff) sectors[l.front].fs = planeFrom(ox, oy, B.floor, nx, ny, (F.floor - B.floor) / E);
        if (fc) sectors[l.front].cs = planeFrom(ox, oy, B.ceil, nx, ny, (F.ceil - B.ceil) / E);
      }
    }
    if (bf || bc) {
      const E = extent(l.back);
      if (E > 0) {
        // para o setor de tras a direcao entra no lado oposto
        if (bf) sectors[l.back].fs = planeFrom(ox, oy, F.floor, -nx, -ny, (B.floor - F.floor) / E);
        if (bc) sectors[l.back].cs = planeFrom(ox, oy, F.ceil, -nx, -ny, (B.ceil - F.ceil) / E);
      }
    }
  };
  for (const l of lines) if ((l.special >= 700 && l.special <= 703) || (l.special >= 710 && l.special <= 713)) slopeLine(l);

  // ---- rampas por 3 vertices (704/705/714/715): things 750 com angle = ID
  const vthings = map.things.filter((t) => t.type === 750);
  const vertexSlope = (l) => {
    const sp = l.special;
    const back = sp === 714 || sp === 715, ceil = sp === 705 || sp === 715;
    const sec = back ? l.back : l.front;
    if (sec < 0) return;
    let ids;
    if (l.flags & ML.NOKNUX) {
      const sd = map.sides[back ? l.side1 : l.side0];
      ids = [l.tag, sd.xoff, sd.yoff];
    } else ids = [l.tag, l.tag, l.tag];
    const pts = [];
    const used = new Set();
    ids.forEach((id, k) => {
      const t = vthings.find((v, vi) => v.angle === id && !used.has(vi));
      if (!t) return;
      used.add(vthings.indexOf(t));
      const z = t.extra ? t.options : map.sectors[locateMap(t.x, t.y)].floor + (t.options >> 4);
      pts[k] = { x: t.x, y: t.y, z };
    });
    if (pts.length < 3 || pts.some((p) => !p)) return;
    const [p, q, r] = pts;
    // plano z = A x + B y + C pelos 3 pontos
    const ux = q.x - p.x, uy = q.y - p.y, uz = q.z - p.z, vx = r.x - p.x, vy = r.y - p.y, vz = r.z - p.z;
    const det = ux * vy - uy * vx;
    if (Math.abs(det) < 1e-9) return;
    const A = (uz * vy - uy * vz) / det, B = (ux * vz - uz * vx) / det, C = p.z - A * p.x - B * p.y;
    const plane = [A, -B, s * C];
    if (ceil) sectors[sec].cs = plane; else sectors[sec].fs = plane;
  };
  for (const l of lines) if (l.special === 704 || l.special === 705 || l.special === 714 || l.special === 715) vertexSlope(l);

  // ---- copia de rampas (720 piso, 721 teto, 722 ambos) do setor com a mesma tag
  for (const l of lines) {
    if (l.special < 720 || l.special > 722 || l.front < 0) continue;
    for (const si of byTag.get(l.tag) || []) {
      if (si === l.front) continue;
      if (((l.special - 719) & 1) && !sectors[l.front].fs && sectors[si].fs) sectors[l.front].fs = sectors[si].fs;
      if (((l.special - 719) & 2) && !sectors[l.front].cs && sectors[si].cs) sectors[l.front].cs = sectors[si].cs;
    }
  }

  // ---- FOFs: o setor de controle (frente da linha) define topo = teto e base = piso nos setores com a mesma tag
  const fofs = [];
  for (const l of lines) {
    const kind = FOF_SOLID.has(l.special) ? 'solid' : FOF_WATER.has(l.special) ? 'water' : FOF_INTANGIBLE.has(l.special) ? 'intangible' : (l.special >= 143 && l.special <= 145) ? 'reverse' : null;
    if (!kind || l.front < 0 || !l.tag) continue;
    const ctrl = sectors[l.front];
    let top = ctrl.cs || ctrl.c, bot = ctrl.fs || ctrl.f;
    const topFlat = typeof top === 'number' ? top : null, botFlat = typeof bot === 'number' ? bot : null;
    if (topFlat !== null && botFlat !== null && topFlat < botFlat) [top, bot] = [bot, top];
    const side = l.side0 >= 0 ? map.sides[l.side0] : null;
    const fi = fofs.length;
    fofs.push({ t: top, b: bot, ctrl: l.front, sp: map.sectors[l.front].special, kind, line: l.special, tex: side ? side.mid : '', topPic: ctrl.cp, botPic: ctrl.fp });
    for (const si of byTag.get(l.tag) || []) if (si !== l.front) sectors[si].fofs.push(fi);
  }

  // ---- linhas para colisao e desenho (coordenadas do jogo)
  const outLines = lines.map((l) => {
    const a = V[l.v1], b = V[l.v2];
    return [+(G(a.x)).toFixed(3), +(-a.y * s).toFixed(3), +(G(b.x)).toFixed(3), +(-b.y * s).toFixed(3), l.flags, l.special, l.front, l.back, l.tag, l.side0, l.side1];
  });

  // ---- things
  const sub = (t) => ({ x: +(t.x * s).toFixed(3), z: +(-t.y * s).toFixed(3), h: +(-(t.angle * Math.PI) / 180).toFixed(5), sec: locateMap(t.x, t.y), zoff: t.z * s, flip: t.flip || t.ambush, angle: t.angle, extra: t.extra, type: t.type });
  const things = {
    starts: map.things.filter((t) => t.type >= 1 && t.type <= 16).sort((a, b) => a.type - b.type).map((t) => ({ ...sub(t), n: t.type })),
    boxes: map.things.filter((t) => t.type === 2000).map(sub),
    waypoints: map.things.filter((t) => t.type === 292).map(sub),
    starposts: map.things.filter((t) => t.type === 502).map(sub),
  };

  // dash pads (sector special s3 = 5/6): direcao e velocidade vem de um linedef 4 com a mesma tag (v1->v2; comprimento = velocidade)
  const pads = {};
  sectors.forEach((S, si) => {
    const s3 = (S.sp & 0xffff) >> 8 & 15;
    if (s3 !== 5 && s3 !== 6) return;
    const ln = lines.find((l) => l.special === 4 && l.tag === S.tag && S.tag !== 0);
    if (!ln) return;
    const a = V[ln.v1], b = V[ln.v2], dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    pads[si] = { dx: +(dx / len).toFixed(4), dz: +(-dy / len).toFixed(4), spd: +len.toFixed(1), noSnap: !!(ln.flags & ML.EFFECT4) };
  });

  const sides = map.sides.map((sd) => [sd.top, sd.bottom, sd.mid, sd.xoff, sd.yoff, sd.sector]);
  return {
    v: 1, map: map.name, scale: s, stepUp: 24 * s, kartR: 16 * s,
    name: soc.name || map.name, subtitle: soc.subtitle || '', laps: soc.laps || 3, sky: soc.sky || 1, weather: soc.weather || '', music: soc.music || '', sectionRace: !!soc.sectionRace,
    sectors, fofs, lines: outLines, sides, pads,
    nodes: map.nodes.flatMap((n) => [n.x, n.y, n.dx, n.dy, n.right, n.left]),
    subSector,
    ...things,
  };
}
