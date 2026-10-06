// Desenho de uma pista importada do SRB2Kart: pisos e tetos dos setores (com rampas), paredes (superior/inferior/meio),
// pisos 3D (FOF: topo, base e lados) e agua. Uma malha por textura; as texturas vem dos PNG exportados por
// tools/srb2kart/build.js (public/tracks/srb2kart/tex). Sem texturas o jogo desenha cores lisas.
import * as THREE from 'three';

const SKY = 'F_SKY1';
const safe = (n) => n.replace(/[^A-Za-z0-9_-]/g, (c) => '~' + c.charCodeAt(0).toString(16));
const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return h >>> 0; };

export function buildMapWorld(track, opts = {}) {
  const w = track.map, d = w.d, s = d.scale, inv = 1 / s;
  const base = opts.base || '/tracks/srb2kart/';
  const group = new THREE.Group();
  const loader = new THREE.TextureLoader();
  const texCache = new Map();
  const getTex = (kind, name, info) => {
    const key = kind + name;
    if (texCache.has(key)) return texCache.get(key);
    const t = loader.load(`${base}tex/${kind}_${safe(name)}.png`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    texCache.set(key, t);
    return t;
  };

  // ---- acumuladores por material (textura)
  const acc = new Map();
  const get = (kind, name, info, tint = null) => {
    const key = kind + ':' + name + (info ? '' : ':' + tint);
    let a = acc.get(key);
    if (!a) { a = { kind, name, info, tint, pos: [], uv: [], col: [] }; acc.set(key, a); }
    return a;
  };
  const sectors = d.sectors;
  const ctrlSet = new Set(d.fofs.map((f) => f.ctrl));
  const light = (si) => { const l = sectors[si]?.light ?? 200; return Math.max(0.28, Math.min(1.12, 0.3 + 0.82 * (l / 255))); };

  // vertice -> (x,z)
  const V = d.geo.v;
  const vx = (i) => V[i * 2], vz = (i) => V[i * 2 + 1];
  const ph = (p, x, z) => p[0] * x + p[1] * z + p[2];

  const tri = (a, x0, y0, z0, x1, y1, z1, x2, y2, z2, br, flat, size) => {
    a.pos.push(x0, y0, z0, x1, y1, z1, x2, y2, z2);
    for (const [x, z] of [[x0, z0], [x1, z1], [x2, z2]]) a.uv.push(x / (s * size), -z / (s * size)); // flats alinhados ao mapa (1 texel = 1 unidade)
    for (let k = 0; k < 3; k++) a.col.push(br, br, br);
  };

  // ---- pisos e tetos dos setores; topo/base dos FOFs
  for (const key of Object.keys(d.geo.tri)) {
    const si = +key, S = sectors[si];
    if (ctrlSet.has(si)) continue;
    const T = d.geo.tri[key], br = light(si);
    const flat = (name) => { const info = d.flat[name]; return info ? get('f', name, info) : get('c', name, null, hash(name) & 0xffffff); };
    if (S.fp !== SKY) {
      const a = flat(S.fp), size = a.info ? a.info.w : 64;
      for (let i = 0; i < T.length; i += 3) {
        const [p, q, r] = [T[i], T[i + 1], T[i + 2]];
        const y = (k) => (S.fs ? ph(S.fs, vx(k), vz(k)) : S.f);
        tri(a, vx(p), y(p), vz(p), vx(q), y(q), vz(q), vx(r), y(r), vz(r), br, true, size);
      }
    }
    if (S.cp !== SKY) {
      const a = flat(S.cp), size = a.info ? a.info.w : 64;
      for (let i = 0; i < T.length; i += 3) {
        const [p, q, r] = [T[i], T[i + 1], T[i + 2]];
        const y = (k) => (S.cs ? ph(S.cs, vx(k), vz(k)) : S.c);
        tri(a, vx(p), y(p), vz(p), vx(r), y(r), vz(r), vx(q), y(q), vz(q), br * 0.9, true, size);
      }
    }
    for (const fi of S.fofs) {
      const f = d.fofs[fi];
      if (f.kind !== 'solid' && f.kind !== 'water' && f.kind !== 'reverse') continue;
      const topH = (k) => (typeof f.t === 'number' ? f.t : ph(f.t, vx(k), vz(k)));
      const botH = (k) => (typeof f.b === 'number' ? f.b : ph(f.b, vx(k), vz(k)));
      if (f.kind === 'water') {
        const a = get('w', 'water', null, 0);
        for (let i = 0; i < T.length; i += 3) tri(a, vx(T[i]), topH(T[i]), vz(T[i]), vx(T[i + 1]), topH(T[i + 1]), vz(T[i + 1]), vx(T[i + 2]), topH(T[i + 2]), vz(T[i + 2]), br, true, 64);
        continue;
      }
      const ta = (() => { const info = d.flat[f.topPic]; return info ? get('f', f.topPic, info) : get('c', f.topPic || 'x', null, hash(f.topPic || 'x') & 0xffffff); })();
      const ba = (() => { const info = d.flat[f.botPic]; return info ? get('f', f.botPic, info) : get('c', f.botPic || 'x', null, hash(f.botPic || 'x') & 0xffffff); })();
      for (let i = 0; i < T.length; i += 3) {
        const [p, q, r] = [T[i], T[i + 1], T[i + 2]];
        tri(ta, vx(p), topH(p), vz(p), vx(q), topH(q), vz(q), vx(r), topH(r), vz(r), br, true, ta.info ? ta.info.w : 64);
        tri(ba, vx(p), botH(p), vz(p), vx(r), botH(r), vz(r), vx(q), botH(q), vz(q), br * 0.8, true, ba.info ? ba.info.w : 64);
      }
    }
  }

  // ---- paredes
  const quad = (a, ax, az, bx, bz, yAlo, yAhi, yBlo, yBhi, uA, uB, vAlo, vAhi, vBlo, vBhi, br) => {
    if (yAhi - yAlo < 1e-4 && yBhi - yBlo < 1e-4) return;
    a.pos.push(ax, yAlo, az, bx, yBlo, bz, bx, yBhi, bz, ax, yAlo, az, bx, yBhi, bz, ax, yAhi, az);
    a.uv.push(uA, vAlo, uB, vBlo, uB, vBhi, uA, vAlo, uB, vBhi, uA, vAhi);
    for (let k = 0; k < 6; k++) a.col.push(br, br, br);
  };
  const texOf = (name) => { const info = d.tex[name]; return info ? get('t', name, info) : get('c', name, null, hash(name) & 0xffffff); };

  /** Desenha os trechos visiveis de uma face do linedef: `me` = setor deste lado, `ot` = do outro (-1 = nenhum), sd = sidedef. */
  const wallSide = (l, me, ot, sdIdx, rev) => {
    const sd = d.sides[sdIdx];
    if (!sd || me < 0) return;
    let [x1, z1, x2, z2] = [l[0], l[1], l[2], l[3]];
    if (rev) [x1, z1, x2, z2] = [x2, z2, x1, z1]; // o verso corre de v2 para v1
    const len = Math.hypot(x2 - x1, z2 - z1) * inv;
    const flags = l[4], twosided = ot >= 0;
    const M = sectors[me];
    const fl = (S, x, z) => (S.fs ? ph(S.fs, x, z) : S.f), ce = (S, x, z) => (S.cs ? ph(S.cs, x, z) : S.c);
    const mfA = fl(M, x1, z1), mfB = fl(M, x2, z2), mcA = ce(M, x1, z1), mcB = ce(M, x2, z2);
    const br = light(me);
    const xoff = sd[3], yoff = sd[4];
    const emit = (name, yAlo, yAhi, yBlo, yBhi, anchorMapTop) => {
      if (!name || name === '-' || name[0] === '#') return;
      const a = texOf(name), info = a.info, tw = info ? info.w : 64, th = info ? info.h : 64;
      const uA = (xoff) / tw, uB = (xoff + len) / tw;
      const v = (y) => 1 - (anchorMapTop - y * inv + yoff) / th;
      quad(a, x1, z1, x2, z2, yAlo, yAhi, yBlo, yBhi, uA, uB, v(yAlo), v(yAhi), v(yBlo), v(yBhi), br);
    };
    if (!twosided) {
      // meio de uma parede de um lado: do piso ao teto
      const top = ((mcA + mcB) / 2) * inv, bot = ((mfA + mfB) / 2) * inv;
      const anchor = flags & 16 ? bot + (d.tex[sd[2]]?.h ?? 64) : top;
      emit(sd[2], mfA, mcA, mfB, mcB, anchor);
      return;
    }
    const O = sectors[ot];
    const ofA = fl(O, x1, z1), ofB = fl(O, x2, z2), ocA = ce(O, x1, z1), ocB = ce(O, x2, z2);
    // inferior: o outro piso e mais alto
    if (ofA > mfA + 1e-4 || ofB > mfB + 1e-4) {
      if (!(O.fp === SKY && M.fp === SKY)) {
        const hiTop = Math.max(ofA, ofB) * inv;
        const anchor = flags & 16 ? Math.max((mcA + mcB) / 2, (ocA + ocB) / 2) * inv : hiTop;
        emit(sd[1], mfA, Math.max(mfA, ofA), mfB, Math.max(mfB, ofB), anchor);
      }
    }
    // superior: o outro teto e mais baixo (nao se os dois forem ceu)
    if ((ocA < mcA - 1e-4 || ocB < mcB - 1e-4) && !(O.cp === SKY && M.cp === SKY)) {
      const lowC = Math.min(ocA, ocB) * inv, hiC = Math.max(mcA, mcB) * inv;
      const th = d.tex[sd[0]]?.h ?? 64;
      const anchor = flags & 8 ? hiC : lowC + th;
      emit(sd[0], Math.min(mcA, ocA), mcA, Math.min(mcB, ocB), mcB, anchor);
    }
    // meio de linha de dois lados (grades, janelas): entre os dois pisos e os dois tetos
    if (sd[2] && sd[2] !== '-' && d.tex[sd[2]]) {
      const loA = Math.max(mfA, ofA), loB = Math.max(mfB, ofB), hiA = Math.min(mcA, ocA), hiB = Math.min(mcB, ocB);
      if (hiA > loA || hiB > loB) {
        const th = d.tex[sd[2]].h;
        const anchor = flags & 16 ? Math.max(loA, loB) * inv + th : Math.min(hiA, hiB) * inv;
        emit(sd[2], loA, Math.max(loA, hiA), loB, Math.max(loB, hiB), anchor);
      }
    }
  };
  for (const l of d.lines) {
    const front = l[6], back = l[7];
    if (front === back && front >= 0) continue;
    if ((front >= 0 && ctrlSet.has(front)) || (back >= 0 && ctrlSet.has(back))) continue;
    if (front >= 0) wallSide(l, front, back, l[9], false);
    if (back >= 0) wallSide(l, back, front, l[10], true);
  }

  // ---- lados dos FOFs: a base ao topo ao longo do contorno do setor (textura = parede do linedef de controle)
  const sectorLines = new Map();
  d.lines.forEach((l) => {
    for (const si of [l[6], l[7]]) if (si >= 0) { if (!sectorLines.has(si)) sectorLines.set(si, []); sectorLines.get(si).push(l); }
  });
  sectors.forEach((S, si) => {
    if (ctrlSet.has(si)) return;
    for (const fi of S.fofs) {
      const f = d.fofs[fi];
      if (f.kind !== 'solid' && f.kind !== 'reverse') continue;
      const a = f.tex && f.tex !== '-' ? texOf(f.tex) : get('c', 'fof', null, 0x707070);
      const th = a.info ? a.info.h : 64, tw = a.info ? a.info.w : 64;
      for (const l of sectorLines.get(si) || []) {
        if (l[6] === l[7]) continue;
        const [x1, z1, x2, z2] = l[6] === si ? [l[0], l[1], l[2], l[3]] : [l[2], l[3], l[0], l[1]];
        const len = Math.hypot(x2 - x1, z2 - z1) * inv;
        const tA = typeof f.t === 'number' ? f.t : ph(f.t, x1, z1), tB = typeof f.t === 'number' ? f.t : ph(f.t, x2, z2);
        const bA = typeof f.b === 'number' ? f.b : ph(f.b, x1, z1), bB = typeof f.b === 'number' ? f.b : ph(f.b, x2, z2);
        const anchor = tA * inv;
        const v = (y) => 1 - (anchor - y * inv) / th;
        quad(a, x1, z1, x2, z2, bA, tA, bB, tB, 0, len / tw, v(bA), v(tA), v(bB), v(tB), light(si));
      }
    }
  });

  // ---- malhas
  let tris = 0;
  for (const a of acc.values()) {
    if (!a.pos.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(a.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(a.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(a.col, 3));
    g.computeBoundingSphere();
    let mat;
    if (a.kind === 'w') mat = new THREE.MeshBasicMaterial({ color: 0x3a7bd5, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
    else if (a.info) {
      mat = new THREE.MeshBasicMaterial({ map: getTex(a.kind, a.name, a.info), vertexColors: true, side: THREE.DoubleSide, alphaTest: a.info.a ? 0.5 : 0, toneMapped: false });
    } else mat = new THREE.MeshBasicMaterial({ color: a.tint || 0x808080, vertexColors: true, side: THREE.DoubleSide, toneMapped: false });
    const m = new THREE.Mesh(g, mat);
    m.matrixAutoUpdate = false;
    group.add(m);
    tris += a.pos.length / 9;
  }

  const noop = () => {};
  return {
    group, tris, materials: acc.size,
    gantry: { countdown: noop, go: noop, off: noop },
    breakFencesIn: () => [],
    props: null, burnPump: noop, hideScenery: noop, freezeScenery: noop, restoreScenery: noop,
    update: () => [],
  };
}
