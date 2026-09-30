// Modelos procedurais: picape 4x4 "de brinquedo" e semaforo de largada.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { steelTexture, glowTexture } from './textures.js';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.1, ...o });
const rbox = (w, h, d, r = 0.15) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01));

const shared = {};
function mats() {
  if (shared.ready) return shared;
  shared.white = std(0xf3f5f9, { roughness: 0.45 });
  shared.dark = std(0x1b1d24, { roughness: 0.75 });
  shared.tire = std(0x15161b, { roughness: 0.9 });
  shared.glass = std(0x16233d, { roughness: 0.12, metalness: 0.7 });
  shared.head = std(0xfff4b8, { emissive: 0xfff0a0, emissiveIntensity: 1.3 });
  shared.tail = std(0xff2a2a, { emissive: 0xff1010, emissiveIntensity: 0.9 });
  shared.geo = {
    wheel: new THREE.CylinderGeometry(0.82, 0.82, 0.78, 18).rotateX(Math.PI / 2),
    rim: new THREE.CylinderGeometry(0.46, 0.46, 0.82, 14).rotateX(Math.PI / 2),
    hub: new THREE.CylinderGeometry(0.16, 0.16, 0.9, 8).rotateX(Math.PI / 2),
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
  add(G.cabin, body, -0.35, 2.3, 0);
  add(G.glass, m.glass, -0.35, 2.36, 0, false);
  add(G.roof, body, -0.35, 2.88, 0);
  // cacamba com barra de protecao
  add(G.bedWall, body, -1.6, 2.0, 1.12);
  add(G.bedWall, body, -1.6, 2.0, -1.12);
  add(G.tailgate, body, -2.27, 2.0, 0);
  add(rbox(1.6, 0.06, 1.9, 0.03), m.dark, -1.5, 1.78, 0, false);
  for (const z of [0.95, -0.95]) {
    const bar = add(G.bar, m.white, -1.25, 2.55, z);
    bar.scale.y = 1.1;
  }
  const top = add(G.bar, m.white, -1.25, 3.1, 0);
  top.rotation.x = Math.PI / 2;
  top.scale.y = 1.9;
  // para-choques, grade, farois, lanternas
  add(G.bumperF, m.white, 2.4, 1.0, 0);
  add(G.bumperR, m.white, -2.4, 1.0, 0);
  add(G.grille, m.dark, 2.3, 1.75, 0, false);
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
    const hub = new THREE.Mesh(G.hub, m.dark);
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

  return {
    group: g,
    flame,
    wheels,
    setSteer(s) { for (const w of wheels) if (w.front) w.pivot.rotation.y = -s * 0.5; },
    spin(rad) { for (const w of wheels) w.tire.rotation.z -= rad; },
  };
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
