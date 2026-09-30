// Mundo 3D: ponte/estrada com texturas, rio, muros por trecho, largada e cenario (tudo procedural).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeRng } from '/sim/rng.js';
import { gridSlot } from '/sim/game.js';
import * as TX from './textures.js';
import { buildStartGantry } from './models.js';

const RIVER_HALF = 34; // meia-largura do rio em volta da ponte
const WATER_Y = -1.1;

const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), eu = new THREE.Euler(), ps = new THREE.Vector3(), sc = new THREE.Vector3();

function matrix(x, y, z, yaw, sx, sy, sz, roll = 0) {
  eu.set(0, -yaw, roll, 'YXZ');
  qt.setFromEuler(eu);
  return m4.compose(ps.set(x, y, z), qt, sc.set(sx, sy, sz)).clone();
}

function instanced(geo, mat, mats, { cast = true, receive = true } = {}) {
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, mats.length));
  mats.forEach((m, i) => im.setMatrixAt(i, m));
  im.count = mats.length;
  im.castShadow = cast;
  im.receiveShadow = receive;
  im.instanceMatrix.needsUpdate = true;
  return im;
}

function colored(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex);
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.deleteAttribute('uv');
  return g;
}

export function buildWorld(track, quality = 'high') {
  const low = quality === 'low';
  const group = new THREE.Group();
  const rng = makeRng(99);
  const { N, X, Z, TX: TXs, TZ: TZs, NX, NZ, ELEV, BRIDGE, SURFACE } = track;
  const hw = track.halfWidth, edge = hw + track.verge;
  const L = track.length, ds = track.ds;

  // ------------------------------------------------------------ materiais
  const rep = (t, x, y) => { t.repeat.set(x, y); return t; };
  const M = {
    wood: new THREE.MeshStandardMaterial({ map: TX.woodTexture(), roughness: 0.85 }),
    asphalt: new THREE.MeshStandardMaterial({ map: TX.asphaltTexture(), roughness: 0.92 }),
    dirt: new THREE.MeshStandardMaterial({ map: TX.dirtTexture(), roughness: 1 }),
    stone: new THREE.MeshStandardMaterial({ map: TX.stoneTexture(), roughness: 0.9 }),
    steel: new THREE.MeshStandardMaterial({ map: TX.steelTexture(), roughness: 0.5, metalness: 0.4 }),
    logs: new THREE.MeshStandardMaterial({ map: TX.woodTexture(), roughness: 0.9, color: 0xd9b48a }),
    paint: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    yellow: new THREE.MeshStandardMaterial({ color: 0xffd23a, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  };
  M.stone.map = M.stone.map.clone(); M.stone.map.needsUpdate = true;
  const skirtDirt = new THREE.MeshStandardMaterial({ map: TX.dirtTexture(), roughness: 1, side: THREE.DoubleSide });
  for (const k of ['wood', 'asphalt', 'dirt', 'stone', 'logs']) M[k].side = THREE.DoubleSide;

  // ------------------------------------------------------------ faixas (pista)
  const classOf = (i) => (BRIDGE[i] ? 'wood' : SURFACE[i] === 2 ? 'dirt' : SURFACE[i] === 1 ? 'wood' : 'asphalt');
  const runs = [];
  {
    let s = 0;
    for (let i = 1; i <= N; i++) if (i === N || classOf(i) !== classOf(s)) { runs.push({ cls: classOf(s), a: s, b: i }); s = i; }
  }

  function strip(a, b, o0, o1, yOff, uSc, vSc, step = 1) {
    const pos = [], uv = [], idx = [];
    const list = [];
    for (let i = a; i < b; i += step) list.push(i);
    list.push(b);
    let vi = 0;
    for (const i of list) {
      const k = i % N;
      const y = ELEV[k] + yOff;
      const v = (i * ds) / vSc;
      pos.push(X[k] + NX[k] * o0, y, Z[k] + NZ[k] * o0, X[k] + NX[k] * o1, y, Z[k] + NZ[k] * o1);
      uv.push(o0 / uSc, v, o1 / uSc, v);
      if (vi > 0) idx.push(vi - 2, vi - 1, vi, vi - 1, vi + 1, vi);
      vi += 2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const n = g.getAttribute('normal');
    for (let i = 0; i < n.count; i++) if (n.getY(i) < 0) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
    return g;
  }
  const add = (geo, mat, { receive = true, cast = false } = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = receive;
    m.castShadow = cast;
    group.add(m);
    return m;
  };

  for (const r of runs) {
    const half = r.cls === 'wood' && BRIDGE[r.a] ? edge : hw;
    add(strip(r.a, r.b, -half, half, 0.02, 6.4, 6.4), M[r.cls]);
    if (r.cls !== 'wood' || !BRIDGE[r.a]) {
      // berma de pedra entre a pista e o muro
      add(strip(r.a, r.b, hw, edge, 0.01, 6.4, 6.4), M.stone);
      add(strip(r.a, r.b, -edge, -hw, 0.01, 6.4, 6.4), M.stone);
    }
    // linhas laterais brancas
    add(strip(r.a, r.b, hw - 1.3, hw - 0.8, 0.06, 1, 1, 2), M.paint, { receive: false });
    add(strip(r.a, r.b, -hw + 0.8, -hw + 1.3, 0.06, 1, 1, 2), M.paint, { receive: false });
  }
  // tracejado central (so asfalto/terra)
  {
    const pos = [], idx = [];
    let vi = 0;
    for (let s = 0; s < L; s += 12) {
      const i0 = Math.floor(s / ds) % N;
      if (BRIDGE[i0] || SURFACE[i0] === 1) continue;
      const i1 = (i0 + 5) % N;
      const w = 0.3;
      for (const [k, sg] of [[i0, 1], [i1, 1]]) {
        pos.push(X[k] + NX[k] * w, ELEV[k] + 0.06, Z[k] + NZ[k] * w, X[k] - NX[k] * w, ELEV[k] + 0.06, Z[k] - NZ[k] * w);
      }
      idx.push(vi, vi + 1, vi + 2, vi + 1, vi + 3, vi + 2);
      vi += 4;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const n = g.getAttribute('normal');
    for (let i = 0; i < n.count; i++) if (n.getY(i) < 0) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
    const mm = add(g, new THREE.MeshStandardMaterial({ color: 0xffd23a, roughness: 0.6, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), { receive: false });
    mm.name = 'dashes';
  }

  // taludes/fachada laterais onde a pista fica acima do chao
  {
    const build = (bridgeOnly) => {
      const pos = [], idx = [];
      let base = 0, open = false;
      for (let i = 0; i <= N; i++) {
        const k = i % N;
        const isB = BRIDGE[k] === 1;
        const ok = ELEV[k] >= 0.02 && isB === bridgeOnly;
        if (!ok) { open = false; continue; }
        for (const sg of [1, -1]) {
          const o = edge * sg, bottom = isB ? -1.3 : 0;
          pos.push(X[k] + NX[k] * o, ELEV[k] + 0.02, Z[k] + NZ[k] * o, X[k] + NX[k] * o, bottom, Z[k] + NZ[k] * o);
        }
        const n4 = pos.length / 3;
        if (open) {
          const a = n4 - 8; // quatro vertices do passo anterior, quatro deste
          idx.push(a, a + 1, a + 4, a + 1, a + 5, a + 4); // lado +
          idx.push(a + 2, a + 3, a + 6, a + 3, a + 7, a + 6); // lado -
        }
        open = true;
      }
      if (!pos.length) return null;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const uv = [];
      for (let i = 0; i < pos.length / 3; i++) uv.push(pos[i * 3] / 6, (pos[i * 3 + 1]) / 3);
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    };
    const gd = build(false), gb = build(true);
    if (gd) add(gd, skirtDirt);
    if (gb) add(gb, new THREE.MeshStandardMaterial({ map: TX.steelTexture(), roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide }));
  }

  // ------------------------------------------------------------ rio e terreno
  const W = RIVER_HALF;
  const bridgeRuns = [];
  {
    let i = 0;
    while (i < N && BRIDGE[i]) i++; // avanca ate fora da ponte (se comecar dentro)
    const start = i;
    let cur = null;
    for (let n = 0; n < N; n++) {
      const k = (start + n) % N;
      if (BRIDGE[k]) { if (!cur) { cur = []; bridgeRuns.push(cur); } cur.push(k); } else cur = null;
    }
    if (!BRIDGE.some((v) => v)) bridgeRuns.length = 0;
  }
  const waterTex = TX.waterTexture();
  const holes = [];
  const poly = [];
  for (const run of bridgeRuns) {
    const pts = [];
    const pick = run.filter((_, j) => j % 4 === 0 || j === run.length - 1);
    for (const k of pick) pts.push([X[k] + NX[k] * W, Z[k] + NZ[k] * W]);
    for (const k of pick.slice().reverse()) pts.push([X[k] - NX[k] * W, Z[k] - NZ[k] * W]);
    poly.push(pts);
  }
  {
    // centro e tamanho da area
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let i = 0; i < N; i++) { x0 = Math.min(x0, X[i]); x1 = Math.max(x1, X[i]); z0 = Math.min(z0, Z[i]); z1 = Math.max(z1, Z[i]); }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, R = 1400;
    const shape = new THREE.Shape();
    shape.moveTo(cx - R, -(cz - R)); shape.lineTo(cx + R, -(cz - R)); shape.lineTo(cx + R, -(cz + R)); shape.lineTo(cx - R, -(cz + R)); shape.closePath();
    for (const pts of poly) {
      const h = new THREE.Path();
      pts.forEach(([x, z], i) => (i ? h.lineTo(x, -z) : h.moveTo(x, -z)));
      h.closePath();
      shape.holes.push(h);
      holes.push(pts);
    }
    const gg = new THREE.ShapeGeometry(shape);
    gg.rotateX(-Math.PI / 2);
    const grassT = TX.grassTexture();
    grassT.repeat.set(1 / 9, 1 / 9);
    const uv = gg.getAttribute('uv'), p = gg.getAttribute('position');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i), p.getZ(i));
    const ground = new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ map: grassT, roughness: 1 }));
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    group.add(ground);

    // agua + barrancos
    for (const pts of holes) {
      const wg = new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z))));
      wg.rotateX(-Math.PI / 2);
      const wuv = wg.getAttribute('uv'), wp = wg.getAttribute('position');
      for (let i = 0; i < wuv.count; i++) wuv.setXY(i, wp.getX(i) / 14, wp.getZ(i) / 14);
      const water = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ map: waterTex, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.93 }));
      water.position.y = WATER_Y;
      water.receiveShadow = true;
      group.add(water);
      // barranco
      const bp = [], bi = [];
      pts.forEach(([x, z], i) => {
        bp.push(x, -0.02, z, x, WATER_Y - 0.6, z);
        if (i) bi.push(i * 2 - 2, i * 2 - 1, i * 2, i * 2 - 1, i * 2 + 1, i * 2);
      });
      const n = pts.length;
      bi.push(n * 2 - 2, n * 2 - 1, 0, n * 2 - 1, 1, 0);
      const bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
      const buv = [];
      for (let i = 0; i < n; i++) buv.push(i * 0.5, 0, i * 0.5, 1);
      bg.setAttribute('uv', new THREE.Float32BufferAttribute(buv, 2));
      bg.setIndex(bi);
      bg.computeVertexNormals();
      group.add(new THREE.Mesh(bg, skirtDirt));
    }
  }
  if (!poly.length) {
    const gg = new THREE.PlaneGeometry(2800, 2800).rotateX(-Math.PI / 2);
    const grassT = TX.grassTexture();
    grassT.repeat.set(2800 / 9, 2800 / 9);
    const ground = new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ map: grassT, roughness: 1 }));
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    group.add(ground);
  }

  // ------------------------------------------------------------ pilares da ponte
  {
    const pil = [], beams = [];
    for (const run of bridgeRuns) {
      for (let j = 0; j < run.length; j += Math.round(18 / ds)) {
        const k = run[j];
        const yaw = Math.atan2(TZs[k], TXs[k]);
        const h = ELEV[k] + 2.4;
        for (const sg of [-1, 1]) {
          const o = sg * (hw * 0.62);
          pil.push(matrix(X[k] + NX[k] * o, ELEV[k] - h / 2 + 0.1, Z[k] + NZ[k] * o, yaw, 1.8, h, 1.8));
        }
        beams.push(matrix(X[k], ELEV[k] - 1, Z[k], yaw, 1.6, 1.4, edge * 2));
      }
    }
    if (pil.length) {
      group.add(instanced(new THREE.BoxGeometry(1, 1, 1), M.steel, pil));
      group.add(instanced(new THREE.BoxGeometry(1, 1, 1), M.steel, beams));
    }
  }

  // ------------------------------------------------------------ muros por trecho
  {
    const posts = [], rails = [], diags = [];
    const lposts = [], lrails = [];
    const H = 6.2, seg = Math.round(6 / ds);
    for (const r of runs) {
      const isBridge = !!BRIDGE[r.a];
      for (const sg of [-1, 1]) {
        const o = (edge + 0.45) * sg;
        let flip = 1;
        for (let i = r.a; i < r.b; i += seg) {
          const j = Math.min(i + seg, r.b);
          const k0 = i % N, k1 = j % N;
          const x0 = X[k0] + NX[k0] * o, z0 = Z[k0] + NZ[k0] * o, y0 = ELEV[k0];
          const x1 = X[k1] + NX[k1] * o, z1 = Z[k1] + NZ[k1] * o, y1 = ELEV[k1];
          const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz) || 1;
          const yaw = Math.atan2(dz, dx);
          if (isBridge) {
            posts.push(matrix(x0, y0 + H / 2, z0, yaw, 0.9, H, 0.9));
            rails.push(matrix((x0 + x1) / 2, y0 + H, (z0 + z1) / 2, yaw, len, 0.85, 0.85));
            rails.push(matrix((x0 + x1) / 2, y0 + 0.5, (z0 + z1) / 2, yaw, len, 0.9, 0.9));
            const dl = Math.hypot(len, H - 0.5);
            diags.push(matrix((x0 + x1) / 2, y0 + H / 2 + 0.25, (z0 + z1) / 2, yaw, dl, 0.5, 0.5, flip * Math.atan2(H - 0.5, len)));
            flip = -flip;
          } else {
            lposts.push(matrix(x0, y0 + 1.1, z0, yaw, 0.8, 2.2, 0.8));
            lrails.push(matrix((x0 + x1) / 2, y0 + 0.6, (z0 + z1) / 2, yaw, len, 0.8, 0.8));
            lrails.push(matrix((x0 + x1) / 2, y0 + 1.6, (z0 + z1) / 2, yaw, len, 0.8, 0.8));
          }
        }
      }
    }
    const box = new THREE.BoxGeometry(1, 1, 1);
    if (posts.length) {
      group.add(instanced(box, M.steel, posts));
      group.add(instanced(box, M.steel, rails));
      group.add(instanced(box, M.steel, diags));
    }
    if (lposts.length) {
      group.add(instanced(box, M.logs, lposts));
      group.add(instanced(new THREE.CylinderGeometry(0.42, 0.42, 1, 8).rotateZ(Math.PI / 2), M.logs, lrails));
    }
  }

  // ------------------------------------------------------------ largada: linha, vagas e portico
  let gantry = null;
  {
    const p0 = track.pointAt(0);
    const ang = Math.atan2(p0.tz, p0.tx);
    const y0 = track.elevAt(0);
    const cols = 2, rows = Math.round((hw * 2) / 1.6);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(3.2, hw * 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: TX.checkerTexture(cols, rows) }));
    line.position.set(p0.x, y0 + 0.07, p0.z);
    line.rotation.y = -ang;
    group.add(line);

    // vagas pintadas em "U" (abertas para a frente), uma por carro
    const slots = [];
    for (let i = 0; i < 8; i++) {
      const sl = gridSlot(i);
      const pr = -4 - sl.back;
      const p = track.pointAt(pr);
      const d = sl.side * hw * 0.36;
      const cx = p.x + p.nx * d, cz = p.z + p.nz * d, y = track.elevAt(pr) + 0.09;
      const yaw = Math.atan2(p.tz, p.tx);
      const bar = (lx, lz, sx, sz) => {
        const c = Math.cos(yaw), s = Math.sin(yaw);
        // local x = frente, local z = direita
        const wx = cx + c * lx + -s * lz, wz = cz + s * lx + c * lz;
        slots.push(matrix(wx, y, wz, yaw, sx, 0.05, sz));
      };
      bar(-2.6, 0, 0.3, 3.4);
      bar(0, -1.6, 5.4, 0.3);
      bar(0, 1.6, 5.4, 0.3);
    }
    group.add(instanced(new THREE.BoxGeometry(1, 1, 1), M.paint, slots, { cast: false, receive: false }));

    gantry = buildStartGantry(edge + 2.5);
    const pg = track.pointAt(9);
    gantry.group.position.set(pg.x, track.elevAt(9), pg.z);
    gantry.group.rotation.y = -Math.atan2(pg.tz, pg.tx);
    group.add(gantry.group);
  }

  // ------------------------------------------------------------ cenario
  addScenery(group, track, { rng, low, bridgeRuns, W, edge });

  // nuvens
  {
    const ct = TX.cloudTexture();
    for (let i = 0; i < (low ? 6 : 14); i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ct, transparent: true, opacity: 0.9, fog: false, depthWrite: false }));
      const a = rng() * Math.PI * 2, r = 380 + rng() * 240;
      s.position.set(Math.cos(a) * r, 130 + rng() * 70, Math.sin(a) * r);
      s.scale.set(180 + rng() * 140, 80 + rng() * 40, 1);
      group.add(s);
    }
  }

  return {
    group,
    gantry,
    update(t) {
      waterTex.offset.set(t * 0.015, t * 0.01);
    },
  };
}

// ---------------------------------------------------------------- decoracao
function addScenery(group, track, { rng, low, bridgeRuns, W, edge }) {
  const { N, X, Z, NX, NZ, ELEV, BRIDGE } = track;
  // hash espacial das amostras da pista para medir distancia
  const cell = 24, grid = new Map();
  const key = (cx, cz) => (cx * 73856093) ^ (cz * 19349663);
  for (let i = 0; i < N; i += 2) {
    const k = key(Math.floor(X[i] / cell), Math.floor(Z[i] / cell));
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  }
  const dist = (x, z, onlyBridge = false) => {
    let m = Infinity;
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
      const l = grid.get(key(cx + a, cz + b));
      if (!l) continue;
      for (const i of l) {
        if (onlyBridge && !BRIDGE[i]) continue;
        m = Math.min(m, Math.hypot(x - X[i], z - Z[i]));
      }
    }
    return m;
  };
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (let i = 0; i < N; i++) { x0 = Math.min(x0, X[i]); x1 = Math.max(x1, X[i]); z0 = Math.min(z0, Z[i]); z1 = Math.max(z1, Z[i]); }
  const pad = 150;
  const clear = edge + 9;
  const spots = (n, minD, maxD = Infinity) => {
    const out = [];
    let guard = n * 60;
    while (out.length < n && guard-- > 0) {
      const x = x0 - pad + rng() * (x1 - x0 + pad * 2), z = z0 - pad + rng() * (z1 - z0 + pad * 2);
      const d = dist(x, z);
      if (d < clear + minD || d > maxD) continue;
      if (bridgeRuns.length && dist(x, z, true) < W + 4) continue;
      out.push([x, z]);
    }
    return out;
  };
  const f = low ? 0.4 : 1;
  const tint = new THREE.Color();

  // arvores redondas (copa dupla + tronco) e pinheiros
  const trunkG = colored(new THREE.CylinderGeometry(0.5, 0.75, 4, 7).translate(0, 2, 0), 0x7a4e2b);
  const crownG = mergeGeometries([
    colored(new THREE.IcosahedronGeometry(3.4, 1).translate(0, 6.2, 0), 0xffffff),
    colored(new THREE.IcosahedronGeometry(2.5, 1).translate(1.4, 8.3, 0.5), 0xffffff),
  ]);
  const treeM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });
  const trees = spots(Math.round(300 * f), 2);
  const crown = new THREE.InstancedMesh(crownG, new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true }), trees.length);
  const trunk = new THREE.InstancedMesh(trunkG, treeM, trees.length);
  crown.castShadow = trunk.castShadow = true;
  trees.forEach(([x, z], i) => {
    const s = 0.8 + rng() * 1.1;
    const m = matrix(x, 0, z, rng() * 6.28, s, s * (0.9 + rng() * 0.4), s);
    crown.setMatrixAt(i, m);
    trunk.setMatrixAt(i, m);
    tint.setHSL(0.26 + rng() * 0.07, 0.62, 0.34 + rng() * 0.14);
    crown.setColorAt(i, tint);
  });
  group.add(crown, trunk);

  // palmeiras
  {
    const parts = [colored(new THREE.CylinderGeometry(0.35, 0.6, 9, 6).translate(0, 4.5, 0), 0x9a6a3a)];
    for (let i = 0; i < 7; i++) {
      const frond = new THREE.ConeGeometry(0.9, 6.5, 4).rotateZ(Math.PI / 2 + 0.55).translate(3.2, 9.3, 0);
      frond.scale(1, 0.25, 1);
      frond.rotateY((i / 7) * Math.PI * 2);
      parts.push(colored(frond, 0x2f9e3f));
    }
    const palmG = mergeGeometries(parts);
    const palms = spots(Math.round(70 * f), 0, edge + 60);
    const pm = new THREE.InstancedMesh(palmG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true, side: THREE.DoubleSide }), palms.length);
    pm.castShadow = true;
    palms.forEach(([x, z], i) => pm.setMatrixAt(i, matrix(x, 0, z, rng() * 6.28, 1 + rng() * 0.5, 1 + rng() * 0.5, 1 + rng() * 0.5)));
    group.add(pm);
  }

  // arbustos e pedras
  {
    const bush = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.6, 1), new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), Math.round(220 * f));
    const bs = spots(bush.count, -4, edge + 70);
    bush.count = bs.length;
    bs.forEach(([x, z], i) => {
      const s = 0.7 + rng() * 1.1;
      bush.setMatrixAt(i, matrix(x, 0.5, z, rng() * 6, s * 1.3, s, s));
      tint.setHSL(0.27 + rng() * 0.08, 0.6, 0.3 + rng() * 0.12);
      bush.setColorAt(i, tint);
    });
    bush.castShadow = true;
    group.add(bush);
    const rocks = spots(Math.round(90 * f), -3);
    const rk = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1.6, 0), new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), rocks.length);
    rocks.forEach(([x, z], i) => {
      const s = 0.5 + rng() * 1.6;
      rk.setMatrixAt(i, matrix(x, 0.2, z, rng() * 6, s * 1.3, s * 0.8, s));
      tint.setHSL(0.08, 0.05, 0.4 + rng() * 0.2);
      rk.setColorAt(i, tint);
    });
    rk.castShadow = true;
    group.add(rk);
  }

  // tufos de grama (planos cruzados com alfa)
  {
    const gt = new THREE.PlaneGeometry(2.6, 2.0).translate(0, 1.0, 0);
    const cross = mergeGeometries([gt.clone(), gt.clone().rotateY(Math.PI / 2), gt.clone().rotateY(Math.PI / 4)]);
    const mat = new THREE.MeshStandardMaterial({ map: TX.tuftTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 });
    const n = Math.round(2600 * f);
    const tufts = [];
    let guard = n * 30;
    while (tufts.length < n && guard-- > 0) {
      const i = Math.floor(rng() * N);
      const side = rng() < 0.5 ? -1 : 1;
      const o = (edge + 2.5 + rng() * 55) * side;
      const x = X[i] + NX[i] * o + (rng() - 0.5) * 6, z = Z[i] + NZ[i] * o + (rng() - 0.5) * 6;
      if (dist(x, z) < edge + 2.2) continue;
      if (bridgeRuns.length && dist(x, z, true) < W + 2) continue;
      tufts.push([x, z]);
    }
    const im = new THREE.InstancedMesh(cross, mat, tufts.length);
    tufts.forEach(([x, z], i) => {
      const s = 0.8 + rng() * 1.1;
      im.setMatrixAt(i, matrix(x, 0, z, rng() * 6.28, s, s * (0.8 + rng() * 0.6), s));
      tint.setHSL(0.27 + rng() * 0.08, 0.55, 0.62 + rng() * 0.3);
      im.setColorAt(i, tint);
    });
    group.add(im);
  }

  // cercas brancas dos dois lados (so em terra)
  {
    const posts = [], railsA = [], railsB = [];
    const step = Math.round(2.2 / track.ds) || 2;
    for (const sg of [-1, 1]) {
      for (let i = 0; i < N; i += step) {
        const j = (i + step) % N;
        if (BRIDGE[i] || BRIDGE[j] || ELEV[i] > 0.05 || dist(X[i] + NX[i] * sg * (edge + 6), Z[i] + NZ[i] * sg * (edge + 6), true) < W + 5) continue;
        const o = (edge + 6) * sg;
        const x0 = X[i] + NX[i] * o, z0 = Z[i] + NZ[i] * o, x1 = X[j] + NX[j] * o, z1 = Z[j] + NZ[j] * o;
        const yaw = Math.atan2(z1 - z0, x1 - x0), len = Math.hypot(x1 - x0, z1 - z0);
        posts.push(matrix(x0, 0.85, z0, yaw, 0.28, 1.7, 0.16));
        posts.push(matrix((x0 + x1) / 2, 0.75, (z0 + z1) / 2, yaw, 0.22, 1.5, 0.12));
        railsA.push(matrix((x0 + x1) / 2, 0.55, (z0 + z1) / 2, yaw, len, 0.14, 0.1));
        railsB.push(matrix((x0 + x1) / 2, 1.2, (z0 + z1) / 2, yaw, len, 0.14, 0.1));
      }
    }
    const white = new THREE.MeshStandardMaterial({ color: 0xf6f3ea, roughness: 0.7 });
    const box = new THREE.BoxGeometry(1, 1, 1);
    group.add(instanced(box, white, posts, { receive: false }));
    group.add(instanced(box, white, railsA, { receive: false }));
    group.add(instanced(box, white, railsB, { receive: false }));
  }

  // casinhas (tijolo ou parede branca), com janela
  {
    const houses = spots(Math.round(22 * f), 14, edge + 110);
    const bodyG = new THREE.BoxGeometry(11, 7, 9).translate(0, 3.5, 0);
    const roofG = new THREE.ConeGeometry(9, 5, 4).rotateY(Math.PI / 4).translate(0, 9.5, 0);
    const brick = new THREE.InstancedMesh(bodyG, new THREE.MeshStandardMaterial({ map: TX.brickTexture(), roughness: 0.85 }), houses.length);
    const white = new THREE.InstancedMesh(bodyG, new THREE.MeshStandardMaterial({ map: TX.wallTexture(), roughness: 0.85 }), houses.length);
    const roofs = new THREE.InstancedMesh(roofG, new THREE.MeshStandardMaterial({ map: TX.roofTexture(), roughness: 0.8 }), houses.length);
    const wins = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshStandardMaterial({ map: TX.windowTexture(), roughness: 0.6 }), houses.length * 2);
    let bi = 0, wi = 0, wn = 0;
    houses.forEach(([x, z]) => {
      const yaw = Math.floor(rng() * 4) * (Math.PI / 2);
      const m = matrix(x, 0, z, yaw, 1, 1, 1);
      if (rng() < 0.5) brick.setMatrixAt(bi++, m); else white.setMatrixAt(wi++, m);
      roofs.setMatrixAt(wn, m);
      for (const off of [-2.6, 2.6]) {
        const c = Math.cos(yaw), s = Math.sin(yaw);
        const lx = 5.52, lz = off; // parede "da frente" em local +x
        const wm = matrix(x + c * lx - s * lz, 3.7, z + s * lx + c * lz, yaw, 1, 1, 1);
        // plano olha para +z local: gira para +x local
        eu.set(0, -yaw + Math.PI / 2, 0, 'YXZ');
        qt.setFromEuler(eu);
        m4.compose(ps.set(x + c * lx - s * lz, 3.7, z + s * lx + c * lz), qt, sc.set(1, 1, 1));
        wins.setMatrixAt(wn * 2 + (off > 0 ? 1 : 0), m4);
        void wm;
      }
      wn++;
    });
    brick.count = bi; white.count = wi; roofs.count = wn; wins.count = wn * 2;
    for (const im of [brick, white, roofs]) im.castShadow = true;
    group.add(brick, white, roofs, wins);
  }
}
