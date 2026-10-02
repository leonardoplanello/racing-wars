// Estruturas unicas do mapa (so visuais): posto de gasolina (piso, cobertura, loja, totem) e carretas-cegonha.
// A colisao fica nos props (`def.objects`: pilares, bombas, trechos de predio) e nos `hills` da pista.
import * as THREE from 'three';
import * as TX from './textures.js';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05, ...o });

function station(s, low) {
  const g = new THREE.Group();
  const yaw = s.yaw ?? 0;
  // piso de concreto do posto (abaixo da pista e da berma para nao cobrir o asfalto)
  const floorMap = TX.sidewalkTexture();
  floorMap.repeat.set((s.w ?? 90) / 10, (s.d ?? 80) / 10);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(s.w ?? 90, s.d ?? 80).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: floorMap, roughness: 1 }));
  floor.position.set(s.fx ?? s.x, 0.005, s.fz ?? s.z);
  floor.receiveShadow = true;
  g.add(floor);
  // cobertura sobre as ilhas de bombas
  const roof = new THREE.Group();
  roof.position.set(s.x, 0, s.z);
  roof.rotation.y = -yaw;
  const top = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.7, 21), std(0xf4f4f6));
  top.position.y = 9.3; top.castShadow = !low;
  roof.add(top);
  for (const sg of [-1, 1]) {
    const trim = new THREE.Mesh(new THREE.BoxGeometry(10.7, 0.5, 0.5), std(0xe53935));
    trim.position.set(0, 9.0, sg * 10.4);
    roof.add(trim);
  }
  for (const sx of [-1, 1]) {
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 21.2), std(0xe53935));
    trim.position.set(sx * 5.2, 9.0, 0);
    roof.add(trim);
  }
  // luz de teto
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(9, 0.1, 18), new THREE.MeshBasicMaterial({ color: 0xfff1c9, toneMapped: false }));
  lamp.position.y = 8.9;
  roof.add(lamp);
  g.add(roof);
  // loja de conveniencia
  if (s.store) {
    const st = s.store;
    const body = new THREE.Mesh(new THREE.BoxGeometry(28, 7, 11), std(0xf1e9d8));
    body.position.set(st.x, 3.5, st.z);
    body.castShadow = !low; body.receiveShadow = true;
    const roofB = new THREE.Mesh(new THREE.BoxGeometry(29, 0.6, 12), std(0xe53935));
    roofB.position.set(st.x, 7.3, st.z);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(24, 3.2), new THREE.MeshBasicMaterial({ color: 0xbfe6ff, toneMapped: false }));
    glass.position.set(st.x, 2.6, st.z + 5.52);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 3.2), new THREE.MeshBasicMaterial({ map: TX.neonTexture('LOJA', '#ffd23a'), toneMapped: false }));
    sign.position.set(st.x, 6.0, st.z + 5.55);
    g.add(body, roofB, glass, sign);
  }
  // totem de precos
  if (s.totem) {
    const t = s.totem;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 11, 8), std(0x3b3f4a));
    pole.position.set(t.x, 5.5, t.z);
    const face = new THREE.Mesh(new THREE.BoxGeometry(4.2, 4.2, 0.5), new THREE.MeshBasicMaterial({ map: TX.neonTexture('GAS', '#ffcc33'), toneMapped: false }));
    face.position.set(t.x, 11.8, t.z);
    face.rotation.y = -(t.yaw ?? 0);
    g.add(pole, face);
  }
  return g;
}

/** Piso retangular de concreto (praca, canteiro, lote). */
function floorRect(s) {
  const map = TX.sidewalkTexture();
  map.repeat.set(s.w / 10, s.d / 10);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.d).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map, roughness: 1, color: s.color ?? 0xffffff }));
  m.position.set(s.x, 0.005, s.z);
  m.rotation.y = -(s.yaw ?? 0);
  m.receiveShadow = true;
  return m;
}

/** Portico de sinalizacao sobre a rodovia: dois postes e uma placa verde atravessada. */
function gantry(s, track) {
  const g = new THREE.Group();
  const p = track.pointAt(s.at * track.length);
  const y = track.elevAt(s.at * track.length);
  const e = track.edgeAt(p.idx) + 1.4;
  const post = new THREE.MeshStandardMaterial({ color: 0x8d9199, roughness: 0.6, metalness: 0.4 });
  for (const sg of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.8, 9, 0.8), post);
    m.position.set(p.x + p.nx * e * sg, y + 4.5, p.z + p.nz * e * sg);
    g.add(m);
  }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, e * 2), post);
  bar.position.set(p.x, y + 8.8, p.z);
  bar.rotation.y = -Math.atan2(p.tz, p.tx);
  g.add(bar);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(15, 4.6), new THREE.MeshBasicMaterial({ map: TX.neonTexture(s.text || 'CENTRO', '#9dffb0'), toneMapped: false, side: THREE.DoubleSide }));
  board.position.set(p.x, y + 6.2, p.z);
  board.rotation.y = -Math.atan2(p.tz, p.tx) + Math.PI / 2;
  g.add(board);
  return g;
}

export function buildStructures(track, parent, { low = false } = {}) {
  const out = [];
  for (const s of track.def.structures || []) {
    let o = null;
    if (s.type === 'station') o = station(s, low);
    else if (s.type === 'floor') o = floorRect(s);
    else if (s.type === 'gantry') o = gantry(s, track);
    if (o) { parent.add(o); out.push(o); }
  }
  return out;
}
