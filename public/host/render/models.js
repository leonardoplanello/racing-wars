// Modelos procedurais: picape 4x4 "de brinquedo" e semaforo de largada.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { steelTexture, glowTexture, iceTexture } from './textures.js';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.1, ...o });
const rbox = (w, h, d, r = 0.15) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01));

const shared = {};
function mats() {
  if (shared.ready) return shared;
  shared.white = std(0xf3f5f9, { roughness: 0.45 });
  shared.dark = std(0x1b1d24, { roughness: 0.75 });
  shared.tire = std(0x15161b, { roughness: 0.9 });
  shared.glass = std(0x2a4f86, { roughness: 0.1, metalness: 0.4 });
  shared.hubMat = std(0xffd23a, { roughness: 0.4 });
  shared.head = std(0xfff4b8, { emissive: 0xfff0a0, emissiveIntensity: 1.3 });
  shared.tail = std(0xff2a2a, { emissive: 0xff1010, emissiveIntensity: 0.9 });
  shared.geo = {
    wheel: new THREE.CylinderGeometry(0.82, 0.82, 0.78, 18).rotateX(Math.PI / 2),
    rim: new THREE.CylinderGeometry(0.46, 0.46, 0.82, 14).rotateX(Math.PI / 2),
    hub: new THREE.CylinderGeometry(0.27, 0.27, 0.9, 12).rotateX(Math.PI / 2),
    lug: new THREE.BoxGeometry(0.22, 0.12, 0.8),
    chassis: rbox(4.5, 0.95, 2.3, 0.34),
    hood: rbox(1.7, 0.6, 2.1, 0.24),
    cabin: rbox(2.0, 1.05, 2.0, 0.34),
    roof: rbox(1.95, 0.2, 2.02, 0.09),
    glass: rbox(2.07, 0.52, 2.08, 0.16),
    under: new THREE.BoxGeometry(4.1, 0.35, 2.0),
    bumperF: rbox(0.4, 0.45, 2.6, 0.14),
    bumperR: rbox(0.36, 0.4, 2.5, 0.12),
    grille: new THREE.BoxGeometry(0.06, 0.38, 1.4),
    lamp: rbox(0.14, 0.32, 0.46, 0.05),
    arch: rbox(1.7, 0.22, 0.34, 0.08),
    bedWall: rbox(1.35, 0.5, 0.15, 0.05),
    tailgate: rbox(0.15, 0.5, 2.32, 0.05),
    bar: new THREE.CylinderGeometry(0.075, 0.075, 1, 8),
    stripe: new THREE.BoxGeometry(4.46, 0.13, 2.34),
  };
  shared.ready = true;
  return shared;
}

/** Pneu solto (mesmo desenho do pneu da picape; eixo = z local). */
export function buildWheel() {
  const m = mats(), G = m.geo;
  const tire = new THREE.Mesh(G.wheel, m.tire);
  tire.castShadow = true;
  tire.add(new THREE.Mesh(G.rim, m.white), new THREE.Mesh(G.hub, m.hubMat));
  for (let i = 0; i < 6; i++) {
    const lug = new THREE.Mesh(G.lug, m.tire);
    const a = (i / 6) * Math.PI * 2;
    lug.position.set(Math.cos(a) * 0.86, Math.sin(a) * 0.86, 0);
    lug.rotation.z = a + Math.PI / 2;
    tire.add(lug);
  }
  const g = new THREE.Group();
  g.add(tire);
  return g;
}

/** Picape 4x4. Frente = +x. Retorna {group, wheels:[{pivot,tire,front}], setSteer, spin}. */
export function buildTruck(hex) {
  const m = mats(), G = m.geo;
  const body = std(hex, { roughness: 0.38, metalness: 0.2 });
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z, cast = true) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = cast;
    g.add(mesh);
    return mesh;
  };
  add(G.under, m.dark, 0, 0.85, 0, false);
  add(G.chassis, body, 0, 1.3, 0);
  add(G.stripe, m.white, 0, 1.0, 0, false);
  add(G.hood, body, 1.45, 1.95, 0);
  add(G.cabin, body, -0.45, 2.3, 0);
  add(G.glass, m.glass, -0.45, 2.38, 0, false);
  add(G.roof, body, -0.45, 2.88, 0);
  // faixas brancas de corrida (capo e teto)
  for (const z of [0.3, -0.3]) {
    add(new THREE.BoxGeometry(1.75, 0.03, 0.26), m.white, 1.45, 2.27, z, false);
    add(new THREE.BoxGeometry(1.9, 0.03, 0.26), m.white, -0.45, 3.0, z, false);
  }
  // barra de farois no teto
  add(new THREE.BoxGeometry(0.34, 0.22, 1.5), m.dark, 0.1, 3.12, 0, false);
  for (const z of [-0.55, -0.18, 0.18, 0.55]) add(new THREE.BoxGeometry(0.1, 0.16, 0.26), m.head, 0.3, 3.15, z, false);
  // aerofolio traseiro
  add(rbox(0.5, 0.14, 2.3, 0.05), body, -2.45, 2.55, 0);
  for (const z of [0.8, -0.8]) add(new THREE.BoxGeometry(0.12, 0.6, 0.12), m.dark, -2.35, 2.25, z, false);
  add(G.tailgate, body, -2.27, 1.9, 0);
  // para-choques, grade, farois, lanternas
  add(G.bumperF, m.white, 2.4, 1.0, 0);
  add(G.bumperR, m.white, -2.4, 1.0, 0);
  add(G.grille, m.dark, 2.3, 1.75, 0, false);
  add(new THREE.BoxGeometry(0.5, 0.12, 2.0), m.dark, 2.55, 0.62, 0, false);
  for (const z of [0.82, -0.82]) {
    add(G.lamp, m.head, 2.3, 1.78, z, false);
    add(G.lamp, m.tail, -2.3, 1.55, z, false);
  }
  // caixas de roda
  const wheels = [];
  for (const [x, z] of [[1.6, 1.38], [1.6, -1.38], [-1.6, 1.38], [-1.6, -1.38]]) {
    add(G.arch, m.dark, x, 1.72, z > 0 ? 1.19 : -1.19, false);
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.82, z);
    const tire = new THREE.Mesh(G.wheel, m.tire);
    tire.castShadow = true;
    const rim = new THREE.Mesh(G.rim, m.white);
    const hub = new THREE.Mesh(G.hub, m.hubMat);
    tire.add(rim, hub);
    // cravos do pneu
    for (let i = 0; i < 6; i++) {
      const lug = new THREE.Mesh(G.lug, m.tire);
      const a = (i / 6) * Math.PI * 2;
      lug.position.set(Math.cos(a) * 0.86, Math.sin(a) * 0.86, 0);
      lug.rotation.z = a + Math.PI / 2;
      tire.add(lug);
    }
    pivot.add(tire);
    g.add(pivot);
    wheels.push({ pivot, tire, front: x > 0 });
  }
  // chama do nitro
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.7, 3.4, 8).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffa726 }));
  flame.position.set(-4.3, 1.2, 0);
  flame.visible = false;
  g.add(flame);

  // ---- poderes montados no carro (aparecem ao coletar e somem ao usar) ----
  const items = {};
  const holder = (name) => { const grp = new THREE.Group(); grp.visible = false; g.add(grp); items[name] = grp; return grp; };
  const metal = std(0x8a93a6, { roughness: 0.3, metalness: 0.8 });
  const glowBlue = new THREE.MeshStandardMaterial({ color: 0x1f6bff, emissive: 0x2a8cff, emissiveIntensity: 1.6, transparent: true, opacity: 0.8, roughness: 0.2 });

  // missil armado no teto
  {
    const grp = holder('missile');
    const rail = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.18, 0.6), m.dark);
    rail.position.set(-0.45, 3.2, 0);
    const mis = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 2.2, 10).rotateZ(Math.PI / 2), m.white);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.7, 10).rotateZ(-Math.PI / 2), std(0xd61f2c));
    nose.position.x = 1.45;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.275, 0.275, 0.25, 10).rotateZ(Math.PI / 2), std(0xd61f2c));
    band.position.x = 0.3;
    for (const a of [0, Math.PI / 2]) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.9), std(0xd61f2c));
      fin.position.x = -1.0;
      fin.rotation.x = a;
      mis.add(fin);
    }
    mis.add(body, nose, band);
    mis.position.set(-0.45, 3.55, 0);
    mis.rotation.z = 0.08;
    grp.add(rail, mis);
  }
  // nitro: turbina atras + aerofolio grande
  {
    const grp = holder('nitro');
    const noz = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.8, 1.3, 14).rotateZ(Math.PI / 2), metal);
    noz.position.set(-3.1, 1.75, 0);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.09, 8, 18).rotateY(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x35d6ff, emissive: 0x35d6ff, emissiveIntensity: 1.8 }));
    ring.position.set(-3.76, 1.75, 0);
    const core = new THREE.Mesh(new THREE.CircleGeometry(0.52, 14).rotateY(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff9a2a }));
    core.position.set(-3.74, 1.75, 0);
    const wing = new THREE.Mesh(rbox(1.1, 0.14, 3.0, 0.05), body);
    wing.position.set(-2.55, 3.35, 0);
    grp.add(noz, ring, core, wing);
    for (const z of [1.5, -1.5]) {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 0.08), m.white);
      plate.position.set(-2.55, 3.45, z);
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.9, 0.14), m.dark);
      strut.position.set(-2.4, 2.9, z * 0.7);
      grp.add(plate, strut);
    }
  }
  // magnetico: cubo azul flutuando em cima
  const cube = new THREE.Group();
  {
    const grp = holder('whomp');
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.15, 1.15), glowBlue);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.25, 1.25, 1.25)), new THREE.LineBasicMaterial({ color: 0xbfe6ff }));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('90,170,255'), transparent: true, depthWrite: false, opacity: 0.9 }));
    glow.scale.setScalar(4.2);
    cube.add(box, edges);
    cube.position.set(-0.45, 4.5, 0);
    glow.position.set(-0.45, 4.5, 0);
    grp.add(cube, glow);
  }
  // mina no teto (mesmo modelo da mina solta na pista)
  {
    const grp = holder('mine');
    const mine = buildMine();
    mine.scale.setScalar(0.62);
    mine.position.set(-0.45, 3.3, 0);
    grp.add(mine);
  }
  let curItem = null;
  const charred = std(0x1c1b1d, { roughness: 1, metalness: 0 });
  const orig = new Map();
  let wrecked = false;

  return {
    group: g,
    flame,
    wheels,
    /** Mostra o poder guardado montado no carro (null = nenhum). */
    setItem(kind, time = 0) {
      if (wrecked) kind = null;
      if (kind !== curItem) {
        curItem = kind;
        for (const k of Object.keys(items)) items[k].visible = k === kind;
      }
      if (kind === 'whomp') { cube.rotation.y = time * 2.2; cube.rotation.x = time * 1.3; cube.position.y = 4.5 + Math.sin(time * 3) * 0.15; }
      if (kind === 'mine') items.mine.getObjectByName('led').visible = Math.floor(time * 4) % 2 === 0;
    },
    /** Carcaca: material carbonizado, rodas tortas, sem poderes. */
    setWreck(on) {
      if (on === wrecked) return;
      wrecked = on;
      if (on) {
        for (const k of Object.keys(items)) items[k].visible = false;
        curItem = null;
        flame.visible = false;
        g.traverse((o) => {
          if (o.isMesh && o !== flame && !Array.from(Object.values(items)).some((it) => it.getObjectById(o.id))) {
            orig.set(o, o.material);
            o.material = charred;
          }
        });
        wheels.forEach((w) => { w.pivot.visible = false; }); // os pneus saem do carro como corpos fisicos (sim)
      } else {
        for (const [o, mat] of orig) o.material = mat;
        orig.clear();
        wheels.forEach((w) => { w.pivot.visible = true; w.pivot.rotation.z = 0; w.pivot.position.y = 0.82; });
      }
    },
    setSteer(s) { if (!wrecked) for (const w of wheels) if (w.front) w.pivot.rotation.y = -s * 0.5; },
    spin(rad) { if (!wrecked) for (const w of wheels) w.tire.rotation.z -= rad; },
  };
}

/** Mina: disco achatado com espinhos e LED vermelho piscando (grupo com filho 'led'). */
export function buildMine() {
  const g = new THREE.Group();
  const shell = std(0x2b2e38, { roughness: 0.4, metalness: 0.5 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.3, 16, 8), shell);
  body.scale.y = 0.42;
  body.castShadow = true;
  g.add(body);
  const band = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.12, 6, 20).rotateX(Math.PI / 2), std(0xd9a40a, { roughness: 0.5 }));
  band.position.y = 0.05;
  g.add(band);
  const spike = new THREE.ConeGeometry(0.16, 0.45, 6);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const sp = new THREE.Mesh(spike, shell);
    sp.position.set(Math.cos(a) * 0.85, 0.42, Math.sin(a) * 0.85);
    g.add(sp);
  }
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
  led.position.y = 0.62;
  led.name = 'led';
  g.add(led);
  return g;
}

/** Portico de aco com semaforo. Frente da pista = +x local. Luzes viradas para tras (-x). */
export function buildStartGantry(halfSpan) {
  const steel = new THREE.MeshStandardMaterial({ map: steelTexture(), roughness: 0.55, metalness: 0.35 });
  steel.map.repeat.set(1, 4);
  const g = new THREE.Group();
  const H = 10;
  const beamMat = new THREE.MeshStandardMaterial({ map: steelTexture(), roughness: 0.55, metalness: 0.35 });
  beamMat.map = beamMat.map.clone();
  beamMat.map.repeat.set(10, 1);
  beamMat.map.needsUpdate = true;
  for (const z of [-halfSpan, halfSpan]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(1.6, H, 1.6), steel);
    post.position.set(0, H / 2, z);
    post.castShadow = true;
    g.add(post);
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.7, H * 0.55, 0.7), steel);
    brace.position.set(0, H * 0.75, z * 0.86);
    brace.rotation.x = z > 0 ? -0.33 : 0.33;
    g.add(brace);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.7, halfSpan * 2 + 1.6), beamMat);
  beam.position.set(0, H, 0);
  beam.castShadow = true;
  g.add(beam);

  // semaforo
  const light = new THREE.Group();
  const orange = std(0xf26a1b, { roughness: 0.4 });
  const frame = new THREE.Mesh(rbox(2.6, 7.6, 2.3, 0.5), orange);
  frame.castShadow = true;
  light.add(frame);
  const face = new THREE.Mesh(rbox(0.3, 6.6, 1.9, 0.3), std(0x0e0f14, { roughness: 0.8 }));
  face.position.x = -1.1;
  light.add(face);
  const lamps = [];
  const colors = [0xff2a2a, 0xffb020, 0x35ff6a];
  [2.3, 0, -2.3].forEach((y, i) => {
    const mat = new THREE.MeshStandardMaterial({ color: 0x2a2c33, emissive: colors[i], emissiveIntensity: 0, roughness: 0.3 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.78, 18, 12), mat);
    bulb.scale.x = 0.45;
    bulb.position.set(-1.3, y, 0);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(['255,60,60', '255,190,60', '80,255,120'][i]), transparent: true, depthWrite: false, opacity: 0 }));
    glow.scale.setScalar(5.5);
    glow.position.set(-1.6, y, 0);
    light.add(bulb, glow);
    lamps.push({ mat, glow });
  });
  light.scale.setScalar(0.75);
  light.position.set(0, 6.75, 0);
  g.add(light);

  const set = (on) => lamps.forEach((l, i) => {
    l.mat.emissiveIntensity = on[i] ? 2.4 : 0;
    l.mat.color.setHex(on[i] ? colors[i] : 0x2a2c33);
    l.glow.material.opacity = on[i] ? 0.95 : 0;
  });
  return {
    group: g,
    off: () => set([0, 0, 0]),
    countdown: (n) => set(n >= 3 ? [1, 0, 0] : [1, 1, 0]),
    go: () => set([0, 0, 1]),
  };
}

/**
 * Cubo de gelo: bloco facetado (vertices levemente deslocados, sombreamento chapado), casca translucida com
 * brilho, nucleo leitoso por dentro e arestas claras. `userData.setOpacity(k)` (0..1) escala a transparencia.
 */
export function buildIceCube(w = 5.3, h = 4.1, d = 3.7) {
  const group = new THREE.Group();
  const geo = new THREE.BoxGeometry(w, h, d, 3, 3, 3);
  // desloca os vertices de forma deterministica (mesma posicao => mesmo deslocamento, sem abrir buracos)
  const pos = geo.attributes.position;
  const hash = (x, y, z) => { const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return n - Math.floor(n); };
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const e = (Math.abs(x) > w / 2 - 0.01) + (Math.abs(y) > h / 2 - 0.01) + (Math.abs(z) > d / 2 - 0.01);
    const k = e >= 3 ? 0.5 : 0.16; // cantos mais chanfrados, faces com leve ondulacao
    const sh = 1 - 0.06 * e;
    pos.setXYZ(i, x * sh + (hash(x, y, z) - 0.5) * k, y * sh + (hash(y, z, x) - 0.5) * k, z * sh + (hash(z, x, y) - 0.5) * k);
  }
  geo.computeVertexNormals();
  const shell = new THREE.MeshPhysicalMaterial({
    color: 0xcfefff, map: iceTexture(), transparent: true, opacity: 0.55, roughness: 0.08, metalness: 0,
    clearcoat: 1, clearcoatRoughness: 0.05, emissive: 0x2a7fb5, emissiveIntensity: 0.4, flatShading: true, depthWrite: false,
  });
  const core = new THREE.MeshStandardMaterial({ color: 0xf2fbff, transparent: true, opacity: 0.35, roughness: 0.6, emissive: 0x9fdcff, emissiveIntensity: 0.25, depthWrite: false });
  const edge = new THREE.LineBasicMaterial({ color: 0xf2fcff, transparent: true, opacity: 0.85 });
  const outer = new THREE.Mesh(geo, shell);
  const inner = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0).scale(w * 0.3, h * 0.32, d * 0.3), core);
  inner.rotation.y = 0.6;
  const lines = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), edge);
  group.add(inner, outer, lines);
  group.userData.setOpacity = (k) => { shell.opacity = 0.55 * k; core.opacity = 0.35 * k; edge.opacity = 0.85 * k; };
  return group;
}
