// Editor de mapa dedicado: vista 3D da pista real (mesmo render do jogo), edicao visual dos pontos da pista,
// rampas/colinas, precipicios, pontes, materiais e objetos colocados a mao. Salva na mesma chave do editor F4
// (localStorage "rw-debug-track:<id>"), entao "Testar no jogo" abre a partida ja com a pista editada.
import * as THREE from 'three';
import { createScene } from '/host/render/scene.js';
import { buildWorld } from '/host/render/world.js';
import { buildTrack } from '/sim/track.js';
import testCircuit from '/sim/tracks/testcircuit.js';
import downtown from '/sim/tracks/downtown.js';

const LS_TRACK = 'rw-debug-track';
const qs = new URLSearchParams(location.search);
const BASES = { [testCircuit.id]: testCircuit, [downtown.id]: downtown }; // ?track=<id> escolhe a pista
const TRACK_ID = BASES[qs.get('track')] ? qs.get('track') : testCircuit.id;
const BASE = BASES[TRACK_ID];
const quality = qs.get('q') === 'high' ? 'high' : 'low';
const SURF_NAME = ['asfalto', 'madeira', 'terra', 'paralelepípedo'];
const OBJ_TYPES = { tree: { label: 'Árvore', color: 0x3fbf5a, r: 2.2 }, rock: { label: 'Pedra', color: 0x9aa3b2, r: 2.6 }, house: { label: 'Casa', color: 0xe0a060, r: 5.5 } };
const clone = (o) => JSON.parse(JSON.stringify(o));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ------------------------------------------------------------------ estado
function loadDef() {
  try { const d = JSON.parse(localStorage.getItem(LS_TRACK + ':' + TRACK_ID) || 'null'); if (d && Array.isArray(d.points)) return d; } catch { /* sem edicao salva */ }
  return clone(BASE);
}
let def = loadDef();
def.objects ||= [];
let track = null, world = null, tool = 'select', sel = null; // sel: {kind:'point'|'obj'|'hills'|'chasms'|'bridges'|'surfaces'|'box', i}
let dirty = false, buildTimer = 0, draft = null; // draft: trecho em criacao {kind, from, to}

const sc = createScene(document.getElementById('gl'), quality);
sc.scene.fog = null;
const { renderer, scene, camera } = sc;
const ov = new THREE.Group(); // marcadores do editor (sempre visiveis por cima do mundo)
scene.add(ov);
const $tools = document.getElementById('tools'), $side = document.getElementById('side'), $status = document.getElementById('status');

// ------------------------------------------------------------------ camera orbital
const cam = { x: 0, z: 0, yaw: -Math.PI / 2, pitch: 1.0, dist: 520 };
function placeCamera() {
  const cp = Math.cos(cam.pitch);
  camera.position.set(cam.x + Math.cos(cam.yaw) * cp * cam.dist, Math.sin(cam.pitch) * cam.dist, cam.z + Math.sin(cam.yaw) * cp * cam.dist);
  camera.lookAt(cam.x, 0, cam.z);
  camera.near = Math.max(0.5, cam.dist * 0.01); camera.far = 4000;
  camera.updateProjectionMatrix(); camera.updateMatrixWorld();
}
function fitView() {
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const [x, z] of def.points) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const k = def.scale || 1;
  cam.x = ((x0 + x1) / 2) * k; cam.z = ((z0 + z1) / 2) * k;
  cam.dist = Math.max(200, Math.max(x1 - x0, z1 - z0) * k * 1.15);
}

// ------------------------------------------------------------------ construcao
function rebuildTrack() {
  try {
    const t = buildTrack(def);
    track = t;
    return true;
  } catch (e) {
    status('Pista inválida: ' + e.message, true);
    return false;
  }
}
function disposeGroup(g, skip) {
  g.traverse((o) => { if (!skip || !isInside(o, skip)) o.geometry?.dispose?.(); });
}
function isInside(o, root) { for (let p = o; p; p = p.parent) if (p === root) return true; return false; }
function rebuildWorld() {
  if (!track) return;
  if (world) { scene.remove(world.group); disposeGroup(world.group); }
  try {
    sc.applyTheme(track.theme);
    world = buildWorld(track, quality);
    scene.add(world.group);
  } catch (e) { world = null; status('Erro ao montar o mundo: ' + e.message, true); }
}
/** Reconstrucao em tempo real (pista, rampas, cercas, portico): reaproveita o cenario decorativo do mundo anterior. */
function rebuildWorldLive() {
  if (!track) return;
  const decor = world?.group.children.find((c) => c.userData.decor);
  if (world) { scene.remove(world.group); disposeGroup(world.group, decor); }
  try {
    world = buildWorld(track, quality, { fast: true });
    if (decor) { decor.removeFromParent(); world.group.add(decor); }
    scene.add(world.group);
  } catch (e) { world = null; status('Erro ao montar o mundo: ' + e.message, true); }
}
let liveQueued = false;
/** Pede atualizacao ao vivo (no maximo uma por quadro): pista + marcadores + malha; depois do arrasto vem a final completa. */
function live() {
  dirty = true;
  if (liveQueued) return;
  liveQueued = true;
  requestAnimationFrame(() => {
    liveQueued = false;
    if (!rebuildTrack()) return;
    rebuildWorldLive();
    refreshOverlay();
  });
}
/** Chamado a cada alteracao: remonta a pista na hora e o mundo (pesado) com atraso. */
function changed({ panel = false, now = false } = {}) {
  dirty = true;
  if (!rebuildTrack()) return;
  refreshOverlay();
  clearTimeout(buildTimer);
  const go = () => { track.scenery = undefined; rebuildWorld(); status(summary()); };
  if (now) go(); else buildTimer = setTimeout(go, 350);
  if (panel) renderSide();
}
function summary() {
  const mr = track.minRadius();
  const warn = [];
  if (def.points.length < 4) warn.push('poucos pontos (mín. 4)');
  if (mr < track.halfWidth + track.verge) warn.push(`curva muito fechada (raio ${mr.toFixed(0)} < largura ${(track.halfWidth + track.verge).toFixed(0)})`);
  return `${def.name || def.id} — ${def.points.length} pontos, volta de ${track.length.toFixed(0)} u, raio mínimo ${mr.toFixed(0)}${warn.length ? ' ⚠ ' + warn.join('; ') : ''}${dirty ? ' • não salvo' : ''}`;
}
function status(msg, err = false) { $status.textContent = msg; $status.className = err ? 'err' : ''; }

// ------------------------------------------------------------------ marcadores
const sphereG = new THREE.SphereGeometry(1, 14, 10), discG = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
const mat = (c, o = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthTest: false });
const markers = []; // {mesh, kind, i, scale: 'screen'|number}
function clearOverlay() {
  for (const o of [...ov.children]) { ov.remove(o); o.geometry !== sphereG && o.geometry !== discG && o.geometry?.dispose?.(); }
  markers.length = 0;
}
function addMarker(mesh, kind, i, size) {
  mesh.renderOrder = 10;
  ov.add(mesh);
  markers.push({ mesh, kind, i, size });
}
function rangeLine(from, to, color) {
  const N = track.N, pos = [];
  const a = Math.floor(from * N);
  let b = Math.ceil(to * N);
  if (to < from) b += N;
  for (let i = a; i <= b; i++) { const k = ((i % N) + N) % N; pos.push(track.X[k], 1.2 + track.ELEV[k], track.Z[k]); }
  const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color, depthTest: false, linewidth: 2 }));
  l.renderOrder = 9;
  ov.add(l);
}
function refreshOverlay() {
  clearOverlay();
  if (!track) return;
  const k = def.scale || 1;
  // linha de centro
  const pos = [];
  for (let i = 0; i <= track.N; i += 2) { const j = i % track.N; pos.push(track.X[j], 0.8, track.Z[j]); }
  const cl = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthTest: false }));
  cl.renderOrder = 8; ov.add(cl);
  // trechos (destaque do selecionado)
  const colors = { hills: 0xffa133, chasms: 0xff4d4d, bridges: 0x4dd2ff, surfaces: 0xb07cff };
  for (const kind of Object.keys(colors)) (def[kind] || []).forEach((it, i) => rangeLine(it.from, it.to, sel && sel.kind === kind && sel.i === i ? 0xffffff : colors[kind]));
  // trecho em criacao (clique 1 colocou o inicio; o fim acompanha o mouse)
  if (draft && draft.to != null) rangeLine(draft.from, draft.to, 0xffffff);
  // alcas do trecho selecionado: inicio, fim e (rampas) altura, subida e descida
  if (sel && LISTS[sel.kind] && def[sel.kind]?.[sel.i]) {
    const it = def[sel.kind][sel.i], L = track.length;
    const at = (f, up, color, kind, size) => {
      const p = track.pointAt(((f % 1) + 1) % 1 * L);
      const m = new THREE.Mesh(sphereG, mat(color, 0.95));
      m.position.set(p.x, up, p.z); addMarker(m, kind, sel.i, size);
    };
    const e0 = (f) => track.elevAt((((f % 1) + 1) % 1) * L);
    at(it.from, e0(it.from) + 1.6, 0x00ff88, 'rfrom', 1.1);
    at(it.to, e0(it.to) + 1.6, 0xff5577, 'rto', 1.1);
    if (sel.kind === 'hills') {
      const mid = it.from + (((it.to - it.from) % 1 + 1) % 1) / 2;
      at(mid, (it.height ?? 3) + 2.5, 0xffd60a, 'rheight', 1.5);
      if (it.rise) at(it.from - it.rise / L, e0(it.from - it.rise / L) + 1.6, 0xffa133, 'rrise', 0.9);
      if (it.fall) at(it.to + it.fall / L, e0(it.to + it.fall / L) + 1.6, 0xffa133, 'rfall', 0.9);
    }
  }
  // largada
  const m0 = new THREE.Mesh(sphereG, mat(0x00ff88)); m0.position.set(track.X[0], 1, track.Z[0]); addMarker(m0, 'start', 0, 1.4);
  // pontos de controle
  def.points.forEach(([x, z], i) => {
    const m = new THREE.Mesh(sphereG, mat(sel && sel.kind === 'point' && sel.i === i ? 0xffd60a : 0x3da5ff, 0.95));
    m.position.set(x * k, 1, z * k); addMarker(m, 'point', i, 1);
  });
  // objetos
  def.objects.forEach((o, i) => {
    if (o.x === undefined) return; // props urbanos posicionados na pista (at: [fracao, deslocamento]) nao tem marcador
    const t = OBJ_TYPES[o.type] || OBJ_TYPES.tree;
    const m = new THREE.Mesh(discG, mat(sel && sel.kind === 'obj' && sel.i === i ? 0xffd60a : t.color, 0.8));
    m.position.set(o.x * k, 0.9, o.z * k); m.scale.setScalar(t.r * (o.s ?? 1)); addMarker(m, 'obj', i, 0);
  });
  // caixas de item
  (def.boxGroups || []).forEach((f, i) => {
    const p = track.pointAt(f * track.length);
    const m = new THREE.Mesh(sphereG, mat(sel && sel.kind === 'box' && sel.i === i ? 0xffffff : 0xffd60a, 0.9));
    m.position.set(p.x, 2.2 + track.elevAt(f * track.length), p.z); addMarker(m, 'box', i, 0.9);
  });
}
function scaleMarkers() {
  for (const m of markers) if (m.size) m.mesh.scale.setScalar(m.size * Math.max(1.5, cam.dist * 0.012));
}

// ------------------------------------------------------------------ picking
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.8), hit = new THREE.Vector3();
function ground(ev) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray.ray.intersectPlane(plane, hit) ? { x: hit.x, z: hit.z } : null;
}
function pickMarker(g) {
  let best = null, bd = Infinity;
  const tol = Math.max(3, cam.dist * 0.018);
  for (const m of markers) {
    if (m.kind === 'start') continue;
    const isHandle = m.kind[0] === 'r';
    if (m.kind === 'rheight') continue; // a alca de altura e pega pelo raio na tela (pickHeight)
    const d = Math.hypot(m.mesh.position.x - g.x, m.mesh.position.z - g.z) - (m.kind === 'obj' ? m.mesh.scale.x * 0.5 : 0);
    if (d < tol * (m.kind === 'point' || isHandle ? 1.3 : 1) && d < bd) { bd = d; best = m; }
  }
  return best;
}

// ------------------------------------------------------------------ interacao
let drag = null;
const RANGE_TOOLS = { ramp: 'hills', bridge: 'bridges', chasm: 'chasms', surface: 'surfaces' };
/** Alca de altura da rampa selecionada: pega por distancia na tela (ela fica no ar, em cima do plato). */
function pickHeight(ev) {
  const m = markers.find((k) => k.kind === 'rheight');
  if (!m) return null;
  const r = renderer.domElement.getBoundingClientRect();
  const v = m.mesh.position.clone().project(camera);
  const px = (v.x * 0.5 + 0.5) * r.width + r.left, py = (-v.y * 0.5 + 0.5) * r.height + r.top;
  return Math.hypot(px - ev.clientX, py - ev.clientY) < 22 ? { x: m.mesh.position.x, z: m.mesh.position.z } : null;
}
/** Altura mundial sob o mouse num plano vertical que passa por (x,z) virado para a camera. */
const vplane = new THREE.Plane(), vtmp = new THREE.Vector3(), vhit = new THREE.Vector3();
function heightAt(ev, x, z) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  camera.getWorldDirection(vtmp); vtmp.y = 0; vtmp.normalize();
  vplane.setFromNormalAndCoplanarPoint(vtmp, vhit.set(x, 0, z));
  return ray.ray.intersectPlane(vplane, vhit) ? vhit.y : null;
}
const el = renderer.domElement;
el.addEventListener('contextmenu', (e) => e.preventDefault());
el.addEventListener('pointerdown', (e) => {
  el.setPointerCapture(e.pointerId);
  if (e.button === 2) { drag = { mode: 'orbit', x: e.clientX, y: e.clientY }; return; }
  if (e.button === 1 || e.shiftKey) { drag = { mode: 'pan', x: e.clientX, y: e.clientY }; return; }
  if (e.button !== 0) return;
  const g = ground(e);
  if (!g) return;
  const k = def.scale || 1;
  const m = pickMarker(g);
  const near = () => track.nearest(g.x, g.z, -1, track.newNear());
  if (RANGE_TOOLS[tool]) {
    // clique 1: inicio; clique 2: fim (cria o trecho e seleciona para ajustar com as alcas)
    const f = Math.round((near().s / track.length) * 1000) / 1000;
    if (!draft) { draft = { kind: RANGE_TOOLS[tool], from: f, to: null }; status('Clique no fim do trecho (Esc cancela)'); return; }
    let a = draft.from, b = f;
    if (b < a) [a, b] = [b, a];
    if (b - a < 0.004) b = Math.min(1, a + 0.01);
    const kind = draft.kind;
    (def[kind] ||= []).push({ ...clone(LISTS[kind].add), from: a, to: b });
    sel = { kind, i: def[kind].length - 1 }; draft = null; tool = 'select'; renderTools();
    changed({ panel: true, now: true });
    return;
  }
  if (tool === 'select') {
    const hh = sel?.kind === 'hills' ? pickHeight(e) : null;
    if (hh) { drag = { mode: 'height', plane: hh, y0: heightAt(e, hh.x, hh.z) ?? 0, h0: def.hills[sel.i].height ?? 3 }; return; }
    if (m && m.kind[0] === 'r') { drag = { mode: m.kind }; return; }
    if (m && (m.kind === 'point' || m.kind === 'obj')) { sel = { kind: m.kind, i: m.i }; drag = { mode: 'move' }; refreshOverlay(); renderSide(); }
    else if (m && m.kind === 'box') { sel = { kind: 'box', i: m.i }; drag = { mode: 'move' }; refreshOverlay(); renderSide(); }
    else {
      // clicou na pista dentro de uma rampa/ponte/precipicio/piso: seleciona o trecho
      const nr = near(), fr = nr.s / track.length;
      const inR = (it) => { const a = it.from, b = it.to; return a <= b ? fr >= a && fr <= b : fr >= a || fr <= b; };
      let hit = null;
      if (Math.abs(nr.d) < track.halfWidth + track.verge) for (const kind of Object.keys(LISTS)) { const i = (def[kind] || []).findIndex(inR); if (i >= 0) { hit = { kind, i }; break; } }
      sel = hit; refreshOverlay(); renderSide();
      if (!hit) drag = { mode: 'pan', x: e.clientX, y: e.clientY };
    }
  } else if (tool === 'addPoint') {
    const P = def.points, n = P.length;
    let bi = 0, bd = Infinity;
    for (let i = 0; i < n; i++) {
      const [ax, az] = P[i], [bx, bz] = P[(i + 1) % n];
      const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((g.x / k - ax) * dx + (g.z / k - az) * dz) / (dx * dx + dz * dz || 1)));
      const d = Math.hypot(ax + dx * t - g.x / k, az + dz * t - g.z / k);
      if (d < bd) { bd = d; bi = i; }
    }
    P.splice(bi + 1, 0, [Math.round(g.x / k), Math.round(g.z / k)]);
    sel = { kind: 'point', i: bi + 1 }; changed({ panel: true });
  } else if (tool === 'delPoint') {
    if (m && m.kind === 'point' && def.points.length > 4) { def.points.splice(m.i, 1); sel = null; changed({ panel: true }); }
  } else if (OBJ_TYPES[tool]) {
    def.objects.push({ type: tool, x: Math.round((g.x / k) * 10) / 10, z: Math.round((g.z / k) * 10) / 10, yaw: 0, s: 1 });
    sel = { kind: 'obj', i: def.objects.length - 1 }; changed({ panel: true });
  } else if (tool === 'box') {
    const near = track.nearest(g.x, g.z, -1, track.newNear());
    (def.boxGroups ||= []).push(Math.round((near.s / track.length) * 1000) / 1000);
    sel = { kind: 'box', i: def.boxGroups.length - 1 }; changed({ panel: true });
  } else if (tool === 'delObj') {
    if (m && m.kind === 'obj') { def.objects.splice(m.i, 1); sel = null; changed({ panel: true }); }
    else if (m && m.kind === 'box') { def.boxGroups.splice(m.i, 1); sel = null; changed({ panel: true }); }
  }
});
el.addEventListener('pointermove', (e) => {
  if (!drag && draft && track) { // previa do trecho: o fim segue o mouse
    const g = ground(e);
    if (g) { draft.to = Math.round((track.nearest(g.x, g.z, -1, track.newNear()).s / track.length) * 1000) / 1000; refreshOverlay(); }
    return;
  }
  if (!drag) return;
  if (drag.mode === 'height' && sel?.kind === 'hills') {
    const y = heightAt(e, drag.plane.x, drag.plane.z);
    if (y != null) { def.hills[sel.i].height = Math.max(0.2, Math.min(60, Math.round((drag.h0 + y - drag.y0) * 10) / 10)); drag.moved = true; live(); }
    return;
  }
  if ((drag.mode === 'rfrom' || drag.mode === 'rto' || drag.mode === 'rrise' || drag.mode === 'rfall') && sel && def[sel.kind]) {
    const g = ground(e); if (!g) return;
    const it = def[sel.kind][sel.i], L = track.length;
    const f = Math.round((track.nearest(g.x, g.z, -1, track.newNear()).s / L) * 1000) / 1000;
    if (drag.mode === 'rfrom') it.from = f;
    else if (drag.mode === 'rto') it.to = f;
    else if (drag.mode === 'rrise') it.rise = Math.max(1, Math.round((((it.from - f) % 1 + 1) % 1) * L));
    else it.fall = Math.max(1, Math.round((((f - it.to) % 1 + 1) % 1) * L));
    drag.moved = true; live();
    return;
  }
  if (drag.mode === 'orbit') {
    cam.yaw -= (e.clientX - drag.x) * 0.006; cam.pitch = Math.max(0.15, Math.min(1.5, cam.pitch + (e.clientY - drag.y) * 0.005));
    drag.x = e.clientX; drag.y = e.clientY;
  } else if (drag.mode === 'pan') {
    const s = cam.dist * 0.0011, dx = (e.clientX - drag.x) * s, dy = (e.clientY - drag.y) * s;
    const rx = Math.sin(cam.yaw), rz = -Math.cos(cam.yaw), fx = -Math.cos(cam.yaw), fz = -Math.sin(cam.yaw);
    cam.x += -rx * dx + fx * dy; cam.z += -rz * dx + fz * dy; // o mapa acompanha o cursor
    drag.x = e.clientX; drag.y = e.clientY;
  } else if (drag.mode === 'move' && sel) {
    const g = ground(e); if (!g) return;
    const k = def.scale || 1, rx = Math.round((g.x / k) * 10) / 10, rz = Math.round((g.z / k) * 10) / 10;
    if (sel.kind === 'point') { def.points[sel.i] = [Math.round(rx), Math.round(rz)]; }
    else if (sel.kind === 'obj') { def.objects[sel.i].x = rx; def.objects[sel.i].z = rz; }
    else if (sel.kind === 'box') { const near = track.nearest(g.x, g.z, -1, track.newNear()); def.boxGroups[sel.i] = Math.round((near.s / track.length) * 1000) / 1000; }
    drag.moved = true;
    if (sel.kind === 'point' || sel.kind === 'box') live(); else refreshOverlay();
  }
});
el.addEventListener('pointerup', () => {
  if (drag && drag.moved && (drag.mode === 'move' || drag.mode === 'height' || drag.mode[0] === 'r')) changed({ panel: true });
  drag = null;
});
el.addEventListener('wheel', (e) => { e.preventDefault(); cam.dist = Math.max(30, Math.min(2500, cam.dist * Math.exp(e.deltaY * 0.0012))); }, { passive: false });
const keys = new Set();
addEventListener('keydown', (e) => {
  if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '')) return;
  const k = e.key.toLowerCase();
  keys.add(k);
  const hot = { 1: 'select', 2: 'addPoint', 3: 'delPoint', 4: 'tree', 5: 'rock', 6: 'house', 7: 'box', 8: 'delObj', 9: 'ramp', 0: 'bridge', c: 'chasm', p: 'surface' };
  if (hot[k]) { tool = hot[k]; draft = null; renderTools(); }
  if (k === 'escape') { tool = 'select'; sel = null; draft = null; refreshOverlay(); renderTools(); renderSide(); }
  if ((k === 'delete' || k === 'backspace') && sel) removeSel();
  if (k === 'f') { fitView(); }
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
function removeSel() {
  if (!sel) return;
  if (sel.kind === 'point' && def.points.length > 4) def.points.splice(sel.i, 1);
  else if (sel.kind === 'obj') def.objects.splice(sel.i, 1);
  else if (sel.kind === 'box') def.boxGroups.splice(sel.i, 1);
  else if (def[sel.kind]) def[sel.kind].splice(sel.i, 1);
  sel = null; changed({ panel: true });
}

// ------------------------------------------------------------------ barra de ferramentas
const TOOLS = [
  ['select', '↖ Mover (1)'], ['addPoint', '＋ Ponto (2)'], ['delPoint', '－ Ponto (3)'], ['|'],
  ['tree', '🌲 Árvore (4)'], ['rock', '🪨 Pedra (5)'], ['house', '🏠 Casa (6)'], ['box', '📦 Caixa (7)'], ['delObj', '🗑 Apagar obj (8)'], ['|'],
  ['ramp', '⛰ Rampa (9)'], ['bridge', '🌉 Ponte (0)'], ['chasm', '🕳 Precipício (C)'], ['surface', '🎨 Piso (P)'], ['|'],
  ['fit', '⤢ Enquadrar (F)'],
];
function renderTools() {
  $tools.innerHTML = TOOLS.map(([id, label]) => (id === '|' ? '<span class="sep"></span>' : `<button data-tool="${id}" class="${tool === id ? 'on' : ''}">${label}</button>`)).join('');
}
$tools.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.tool === 'fit') fitView(); else { tool = b.dataset.tool; draft = null; }
  renderTools();
});

// ------------------------------------------------------------------ painel lateral
const getP = (path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), def);
function setP(path, v) {
  const ks = path.split('.'), last = ks.pop();
  const o = ks.reduce((a, k) => a[k], def);
  if (v === '' || v === undefined) delete o[last]; else o[last] = v;
}
function field(path, label, kind = 'num', opt = {}) {
  const v = getP(path);
  let inp;
  if (kind === 'select') inp = `<select data-p="${path}" data-t="${opt.num ? 'n' : 's'}">${opt.options.map(([val, txt]) => `<option value="${val}" ${String(v ?? opt.def) === String(val) ? 'selected' : ''}>${txt}</option>`).join('')}</select>`;
  else if (kind === 'bool') inp = `<input type="checkbox" data-p="${path}" data-t="b" ${(v ?? opt.def) ? 'checked' : ''}>`;
  else if (kind === 'frac') inp = `<input type="range" min="0" max="1" step="0.0025" data-p="${path}" data-t="n" value="${v ?? 0}"><input type="number" step="0.005" data-p="${path}" data-t="n" value="${v ?? 0}" style="max-width:62px">`;
  else if (kind === 'text') inp = `<input type="text" data-p="${path}" data-t="s" value="${esc(v ?? '')}">`;
  else inp = `<input type="number" step="${opt.step ?? 1}" data-p="${path}" data-t="n" value="${v ?? opt.def ?? ''}">`;
  return `<div class="row"><label>${esc(label)}</label>${inp}</div>`;
}
const SURF_OPTS = SURF_NAME.map((n, i) => [i, n]);
const LISTS = {
  hills: { title: 'Rampas / colinas', add: { from: 0.4, to: 0.45, height: 3.4, rise: 20, fall: 0, rails: true }, f: (p) => field(p + '.from', 'início', 'frac') + field(p + '.to', 'fim', 'frac') + field(p + '.height', 'altura') + field(p + '.rise', 'subida (u)') + field(p + '.fall', 'descida (u, 0=lábio)') + field(p + '.rails', 'grades', 'bool', { def: true }) },
  chasms: { title: 'Precipícios', add: { from: 0.5, to: 0.6, side: -1, width: 55 }, f: (p) => field(p + '.from', 'início', 'frac') + field(p + '.to', 'fim', 'frac') + field(p + '.side', 'lado', 'select', { num: true, options: [[-1, 'esquerda'], [1, 'direita'], [0, 'os dois']] }) + field(p + '.width', 'largura') },
  bridges: { title: 'Pontes', add: { from: 0.1, to: 0.15 }, f: (p) => field(p + '.from', 'início', 'frac') + field(p + '.to', 'fim', 'frac') },
  surfaces: { title: 'Materiais do piso', add: { from: 0.3, to: 0.4, type: 2 }, f: (p) => field(p + '.from', 'início', 'frac') + field(p + '.to', 'fim', 'frac') + field(p + '.type', 'material', 'select', { num: true, options: SURF_OPTS }) },
};
function renderSide() {
  const k = def.scale || 1;
  let h = `<h3>Arquivo</h3>
    ${field('name', 'nome', 'text')}
    <div class="row"><button data-a="save">💾 Salvar</button><button data-a="test">▶ Testar no jogo</button></div>
    <div class="row"><button data-a="export">⬇ Exportar JSON</button><button data-a="import">⬆ Importar</button><input type="file" id="imp" accept=".json,application/json" hidden></div>
    <div class="row"><button data-a="reset">↺ Original</button><button data-a="oval">○ Nova (oval)</button></div>
    <p class="small">Botão esquerdo: usar a ferramenta. Botão direito: girar. Shift/botão do meio/arrastar o fundo: mover. Roda: zoom. Delete: remover seleção. <b>Rampa/ponte/precipício/piso (9, 0, C, P)</b>: clique no início e no fim sobre a pista; depois arraste as bolinhas (verde = início, vermelha = fim, amarela = <b>altura</b>, laranja = subida/descida) e veja a pista mudar ao vivo. Clicar num trecho da pista o seleciona. O jogo usa a pista salva ao abrir com <b>?debug</b>.</p>
    <h3>Pista</h3>
    ${field('scale', 'escala', 'num', { step: 0.1 })}${field('halfWidth', 'meia largura')}${field('verge', 'acostamento', 'num', { step: 0.5 })}
    ${field('deckHeight', 'altura da ponte', 'num', { step: 0.1, def: 1.6 })}${field('rampLength', 'rampa da ponte', 'num', { def: 45 })}${field('riverHalf', 'meia larg. do rio', 'num', { def: 34 })}
    ${field('baseSurface', 'piso base', 'select', { num: true, def: 0, options: SURF_OPTS })}
    ${field('boundary', 'borda', 'select', { def: 'wall', options: [['wall', 'muro'], ['void', 'abismo']] })}
    ${field('openLand', 'terra aberta', 'bool')}
    <h3>Cenário aleatório</h3>
    ${field('scenery.trees', 'árvores', 'num', { def: 300 })}${field('scenery.rocks', 'pedras', 'num', { def: 90 })}${field('scenery.houses', 'casas', 'num', { def: 22 })}`;
  if (sel && sel.kind === 'point') h += `<h3>Ponto ${sel.i + 1}/${def.points.length} <button data-a="del">remover</button></h3>
    <div class="row"><label>x</label><input type="number" data-pt="0" value="${def.points[sel.i][0]}"></div><div class="row"><label>z</label><input type="number" data-pt="1" value="${def.points[sel.i][1]}"></div>`;
  if (sel && sel.kind === 'obj') { const p = 'objects.' + sel.i; h += `<h3>Objeto: ${OBJ_TYPES[def.objects[sel.i].type]?.label} <button data-a="del">remover</button></h3>${field(p + '.x', 'x', 'num', { step: 0.5 })}${field(p + '.z', 'z', 'num', { step: 0.5 })}${field(p + '.yaw', 'rotação (rad)', 'num', { step: 0.1 })}${field(p + '.s', 'tamanho', 'num', { step: 0.1, def: 1 })}`; }
  for (const [kind, L] of Object.entries(LISTS)) {
    h += `<h3>${L.title} <button data-a="add" data-k="${kind}">＋</button></h3>`;
    (def[kind] || []).forEach((it, i) => {
      h += `<div class="card ${sel && sel.kind === kind && sel.i === i ? 'sel' : ''}" data-sel="${kind}:${i}"><div class="hd"><span>#${i + 1}</span><button data-a="rm" data-k="${kind}" data-i="${i}">remover</button></div>${L.f(`${kind}.${i}`)}</div>`;
    });
  }
  h += `<h3>Caixas de item (${(def.boxGroups || []).length})</h3><p class="small">Ferramenta 📦: clique na pista. Cada grupo vira 3–5 caixas conforme a copa.</p>`;
  (def.boxGroups || []).forEach((f, i) => { h += `<div class="row"><label>grupo ${i + 1}</label><input type="number" step="0.005" data-p="boxGroups.${i}" data-t="n" value="${f}"><button data-a="rm" data-k="boxGroups" data-i="${i}">×</button></div>`; });
  h += `<h3>Objetos (${def.objects.length})</h3>`;
  def.objects.forEach((o, i) => { h += `<div class="row"><button data-sel="obj:${i}" style="flex:1;text-align:left">${OBJ_TYPES[o.type]?.label || o.type} ${i + 1} (${o.x ?? 's=' + o.at?.[0]}, ${o.z ?? o.at?.[1]})</button></div>`; });
  void k;
  $side.innerHTML = h;
}
$side.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.pt !== undefined && sel && sel.kind === 'point') { def.points[sel.i][+t.dataset.pt] = +t.value; changed({ panel: true }); return; }
  if (t.dataset.p === undefined) return;
  let v = t.dataset.t === 'n' ? (t.value === '' ? '' : +t.value) : t.dataset.t === 'b' ? t.checked : t.value;
  if (t.dataset.t === 'n' && v !== '' && !Number.isFinite(v)) return;
  setP(t.dataset.p, v);
  if (t.dataset.p === 'openLand' && !v) delete def.openLand;
  changed({ panel: true });
});
$side.addEventListener('input', (e) => { // sliders e numeros: atualiza a pista e a malha ao vivo
  const t = e.target;
  if (t.dataset.p !== undefined && t.type === 'number' && t.value !== '' && Number.isFinite(+t.value)) { setP(t.dataset.p, +t.value); live(); return; }
  if (t.type !== 'range') return;
  setP(t.dataset.p, +t.value);
  const n = t.parentElement.querySelector('input[type=number]'); if (n) n.value = t.value;
  live();
});
$side.addEventListener('pointerup', (e) => { if (e.target.type === 'range') changed(); });
$side.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  const card = e.target.closest('[data-sel]');
  if (!b && card && !/INPUT|SELECT/.test(e.target.tagName)) {
    const [kind, i] = card.dataset.sel.split(':'); sel = { kind, i: +i }; refreshOverlay(); renderSide(); return;
  }
  if (!b) return;
  if (b.dataset.sel) { const [kind, i] = b.dataset.sel.split(':'); sel = { kind, i: +i }; refreshOverlay(); renderSide(); return; }
  const a = b.dataset.a;
  if (a === 'add') { (def[b.dataset.k] ||= []).push(clone(LISTS[b.dataset.k].add)); sel = { kind: b.dataset.k, i: def[b.dataset.k].length - 1 }; changed({ panel: true }); }
  else if (a === 'rm') { def[b.dataset.k].splice(+b.dataset.i, 1); sel = null; changed({ panel: true }); }
  else if (a === 'del') removeSel();
  else if (a === 'save') save();
  else if (a === 'test') { save(); window.open('../?debug&track=' + TRACK_ID, '_blank'); }
  else if (a === 'export') exportJson();
  else if (a === 'import') document.getElementById('imp').click();
  else if (a === 'reset') { if (confirm('Descartar as edições e voltar à pista original?')) { localStorage.removeItem(LS_TRACK + ':' + TRACK_ID); def = clone(BASE); def.objects ||= []; sel = null; fitView(); changed({ panel: true, now: true }); dirty = false; } }
  else if (a === 'oval') { if (confirm('Substituir a pista atual por um oval simples?')) newOval(); }
});
$side.addEventListener('change', (e) => {
  if (e.target.id !== 'imp' || !e.target.files[0]) return;
  e.target.files[0].text().then((txt) => {
    try {
      const d = JSON.parse(txt);
      if (!Array.isArray(d.points) || d.points.length < 4) throw new Error('JSON sem "points" (mín. 4)');
      def = d; def.objects ||= []; sel = null; fitView(); changed({ panel: true, now: true });
    } catch (err) { status('Importação falhou: ' + err.message, true); }
  });
});

function save() {
  try { localStorage.setItem(LS_TRACK + ':' + TRACK_ID, JSON.stringify(def)); dirty = false; status('Salvo. ' + summary()); }
  catch (e) { status('Não foi possível salvar: ' + e.message, true); }
}
function exportJson() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(def, null, 2)], { type: 'application/json' }));
  a.download = (def.id || 'pista') + '.json';
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function newOval() {
  const pts = [];
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; pts.push([Math.round(Math.cos(a) * 200), Math.round(Math.sin(a) * 120)]); }
  def = { id: TRACK_ID, name: 'Nova pista', scale: 2, halfWidth: 14, verge: 1.5, boundary: 'wall', baseSurface: 0, points: pts, boxGroups: [0.2, 0.5, 0.8], objects: [], theme: {} };
  sel = null; fitView(); changed({ panel: true, now: true });
}

// ------------------------------------------------------------------ laco principal
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const sp = cam.dist * (keys.has('shift') ? 2.2 : 0.9) * dt;
  const fx = -Math.cos(cam.yaw), fz = -Math.sin(cam.yaw), rx = Math.sin(cam.yaw), rz = -Math.cos(cam.yaw);
  const mv = (keys.has('w') ? 1 : 0) - (keys.has('s') ? 1 : 0), st = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
  cam.x += (fx * mv + rx * st) * sp; cam.z += (fz * mv + rz * st) * sp;
  placeCamera(); scaleMarkers();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

renderTools();
fitView();
rebuildTrack();
rebuildWorld();
refreshOverlay();
renderSide();
status(summary());
requestAnimationFrame(frame);
