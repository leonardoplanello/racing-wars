// Editor do modo debug (F3 abre o debug, F4 abre este painel):
//  - edita TODOS os valores numericos de carro, camera, itens, regras e IA ao vivo (e salva no navegador);
//  - edita os parametros da pista (tamanho, largura, colinas, precipicios, pontos...) e reconstroi a pista;
//  - seleciona uma area do mapa (tecla E + arrastar o mouse) e descreve o que tem dentro, para colar na conversa.
// So mexe em objetos de configuracao e no render; com o painel fechado nada muda.
import * as THREE from 'three';
import { CAR } from '/sim/car.js';
import { BOX, BOX_WRECK, WHEEL } from '/sim/body.js';
import { CAMERA } from '/sim/camera.js';
import { WHOMP, TRAIL, ICE, MISSILE, POWER } from '/sim/items.js';
import { FREECAM } from './debug.js';
import { RULES, CATCHUP } from '/sim/game.js';
import { AI, DIFFICULTY } from '/sim/ai.js';
import { ITEMS } from '/shared/protocol.js';
import { describe } from './debug-desc.js';

const LS_VALUES = 'rw-debug-values', LS_TRACK = 'rw-debug-track';
const SURF_NAME = ['asfalto', 'madeira', 'terra', 'paralelepipedo'];
const RAD = Math.PI / 180;

/** Grupos de valores. `sl` = slider [min, max, passo]; `deg` = guarda em radianos, mostra em graus. */
const GROUPS = [
  { id: 'camera', name: 'Câmera (ajuste fino)', open: true, objs: { CAMERA }, sl: {
    pitch: [20, 80, 0.5], fov: [30, 90, 1], hMin: [8, 60, 0.5], hMax: [12, 90, 0.5], leaderNy: [0, 0.9, 0.01], topNy: [0, 1, 0.01], rearNy: [-1, 0, 0.01], cutNy: [-2, -0.5, 0.01], cutNx: [0.8, 4, 0.05],
    yawLook: [0, 60, 1], carY: [0, 3, 0.1], shakeMax: [0, 4, 0.05], kAlong: [1, 20, 0.1], kLat: [0.3, 12, 0.1], kYaw: [0.3, 12, 0.1], kHUp: [0.3, 12, 0.1], kHDown: [0.1, 12, 0.1],
    yawDead: [0, 0.2, 0.001], hDead: [0, 3, 0.05], lead: [0, 2, 0.05] }, deg: ['pitch'] },
  { id: 'car', name: 'Carro', objs: { CAR, BOX, BOX_WRECK, WHEEL } },
  { id: 'items', name: 'Itens', objs: { POWER, WHOMP, TRAIL, ICE, MISSILE } },
  { id: 'free', name: 'Freecam', objs: { FREECAM } },
  { id: 'rules', name: 'Regras', objs: { RULES, CATCHUP } },
  { id: 'ai', name: 'IA dos bots', objs: { AI, DIFFICULTY } },
];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clone = (o) => JSON.parse(JSON.stringify(o));
const stepFor = (v) => (Math.abs(v) >= 100 ? 1 : Math.abs(v) >= 10 ? 0.5 : Math.abs(v) >= 1 ? 0.05 : 0.005);

export class DebugEditor {
  /**
   * opts: { dbg, sc, getGame(), getTrackId(), baseDef(id), applyTrack(def) }
   */
  constructor(opts) {
    Object.assign(this, opts);
    this.fields = []; // { obj, key, idx, deg, path, def }
    this.diff = {};
    this.trackDef = null;
    this.open = false;
    this.sel = null; // area selecionada { x0, z0, x1, z1 }
    this.selLines = null;
    this.drag = null;
    this.root = document.createElement('div');
    this.root.id = 'dbged';
    this.root.hidden = true;
    document.body.appendChild(this.root);
    this.overlay = document.createElement('div');
    this.overlay.id = 'dbgsel';
    this.overlay.hidden = true;
    document.body.appendChild(this.overlay);
    const st = document.createElement('style');
    st.textContent = `
#dbged{position:fixed;left:0;top:0;bottom:0;width:340px;overflow:auto;background:rgba(8,10,18,.94);color:#cfe;font:11px/1.35 ui-monospace,Consolas,monospace;z-index:60;padding:8px 10px;box-sizing:border-box;user-select:text}
#dbged summary{cursor:pointer;font-weight:700;color:#ffd54a;margin:6px 0 2px}
#dbged .row{display:flex;align-items:center;gap:4px;margin:1px 0}
#dbged .row label{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#9ab}
#dbged input[type=number]{width:74px;background:#111827;color:#fff;border:1px solid #345;border-radius:3px;padding:1px 3px;font:inherit}
#dbged input[type=range]{width:90px}
#dbged .rv{padding:0 5px;margin:0;line-height:16px;visibility:hidden}
#dbged .rv.on{visibility:visible;color:#ffb74d}
#dbged button{background:#243b55;color:#fff;border:1px solid #456;border-radius:4px;padding:3px 7px;margin:2px 3px 2px 0;cursor:pointer;font:inherit}
#dbged button:hover{background:#2f5075}
#dbged textarea{width:100%;height:92px;background:#0c1220;color:#cfe;border:1px solid #345;font:inherit;box-sizing:border-box}
#dbged h4{margin:8px 0 2px;color:#7fdcff}
#dbged .mod{color:#ffb74d}
#dbgsel{position:fixed;border:2px dashed #ffd54a;background:rgba(255,213,74,.12);z-index:55;pointer-events:none}`;
    document.head.appendChild(st);

    this.root.addEventListener('input', (e) => this.onInput(e));
    this.root.addEventListener('click', (e) => this.onClick(e));
    const cv = this.sc.renderer.domElement;
    cv.addEventListener('pointerdown', (e) => this.selDown(e));
    addEventListener('pointermove', (e) => this.selMove(e));
    addEventListener('pointerup', (e) => this.selUp(e));
    this.snapshot = clone(this.collect());
    this.loadSaved();
  }

  // ------------------------------------------------------------------ valores
  /** Estado atual de todos os grupos (para snapshot). */
  collect() {
    const out = {};
    for (const g of GROUPS) for (const [n, o] of Object.entries(g.objs)) out[n] = o;
    return out;
  }

  /** Resolve 'CAR.steerMax' / 'DIFFICULTY.easy.tau' / 'DIFFICULTY.easy.skill.0' no objeto vivo. */
  resolve(path) {
    const parts = path.split('.');
    let o = this.collect()[parts[0]];
    for (let i = 1; i < parts.length - 1 && o; i++) o = o[parts[i]];
    return { o, k: parts[parts.length - 1] };
  }

  loadSaved() {
    try {
      const d = JSON.parse(localStorage.getItem(LS_VALUES) || '{}');
      for (const [path, v] of Object.entries(d)) { const { o, k } = this.resolve(path); if (o && typeof o[k] === 'number') { o[k] = v; this.diff[path] = v; } }
    } catch { /* sem storage */ }
  }
  save() { try { localStorage.setItem(LS_VALUES, JSON.stringify(this.diff)); } catch { /* ok */ } }

  /** Linhas HTML de um objeto (recursivo). */
  rows(obj, base, g) {
    let h = '';
    for (const [k, v] of Object.entries(obj)) {
      const path = base + '.' + k;
      if (typeof v === 'number') h += this.row(path, k, v, obj, k, g);
      else if (Array.isArray(v) && v.every((x) => typeof x === 'number')) v.forEach((x, i) => { h += this.row(path + '.' + i, k + '[' + i + ']', x, v, i, g); });
      else if (v && typeof v === 'object') h += `<details><summary>${esc(k)}</summary>${this.rows(v, path, g)}</details>`;
    }
    return h;
  }
  row(path, label, v, obj, key, g) {
    const idx = this.fields.length;
    const deg = g.deg && g.deg.includes(String(key));
    const shown = deg ? v / RAD : v;
    const sl = g.sl && g.sl[String(key)];
    this.fields.push({ obj, key, deg, path, def: v });
    const modded = path in this.diff ? ' mod' : '';
    return `<div class="row"><label class="${modded}" title="${esc(describe(path))}\n(${esc(path)})">${esc(label)}</label>` +
      (sl ? `<input type="range" data-f="${idx}" min="${sl[0]}" max="${sl[1]}" step="${sl[2]}" value="${+shown.toFixed(4)}">` : '') +
      `<input type="number" data-f="${idx}" step="${sl ? sl[2] : stepFor(v)}" value="${+shown.toFixed(4)}">` +
      `<button class="rv${modded ? ' on' : ''}" data-a="rv" data-f="${idx}" title="Voltar ao valor original">↺</button></div>`;
  }

  /** Reconstroi o painel inteiro. */
  render() {
    this.fields = [];
    let h = `<div><b style="color:#fff">EDITOR (F4)</b> &nbsp; <button data-a="copy">Copiar mudanças</button><button data-a="reset">Resetar tudo</button><button data-a="close">Fechar</button></div>`;
    h += `<div style="color:#789">Mudanças salvas no navegador. Valores vivos; pista: "Aplicar pista".</div>`;
    h += this.selectionHtml();
    h += `<details open><summary>Itens (dar ao jogador)</summary><div>${ITEMS.map((it, i) => `<button data-a="item" data-item="${it}" title="Dá o item ${it} (tecla ${i + 1})">${i + 1} ${it}</button>`).join('')}</div></details>`;
    for (const g of GROUPS) {
      h += `<details ${g.open ? 'open' : ''}><summary>${esc(g.name)}</summary>`;
      for (const [name, obj] of Object.entries(g.objs)) h += `<h4>${name}</h4>` + this.rows(obj, name, g);
      h += '</details>';
    }
    h += this.trackHtml();
    this.root.innerHTML = h;
  }

  onInput(e) {
    const el = e.target;
    if (el.dataset.t !== undefined) return this.onTrackInput(el);
    if (el.dataset.note !== undefined) return;
    const f = this.fields[Number(el.dataset.f)];
    if (!f) return;
    const v = Number(el.value);
    if (!Number.isFinite(v)) return;
    const raw = f.deg ? v * RAD : v;
    f.obj[f.key] = raw;
    this.diff[f.path] = raw;
    this.save();
    // mantem o par slider/numero sincronizado
    for (const o of this.root.querySelectorAll(`input[data-f="${el.dataset.f}"]`)) if (o !== el) o.value = el.value;
    this.markRow(el.dataset.f, true);
  }

  /** Marca/desmarca a linha como modificada (cor do rotulo e botao de reset visivel). */
  markRow(idx, on) {
    const row = this.root.querySelector(`input[data-f="${idx}"]`)?.closest('.row');
    if (!row) return;
    row.querySelector('label')?.classList.toggle('mod', on);
    row.querySelector('.rv')?.classList.toggle('on', on);
  }

  /** Volta UM valor ao original (snapshot tirado antes dos valores salvos). */
  resetField(idx) {
    const f = this.fields[Number(idx)];
    if (!f) return;
    const s = this.resolveIn(this.snapshot, f.path);
    if (typeof s !== 'number') return;
    f.obj[f.key] = s;
    delete this.diff[f.path];
    this.save();
    const shown = f.deg ? s / RAD : s;
    for (const o of this.root.querySelectorAll(`input[data-f="${idx}"]`)) o.value = +shown.toFixed(4);
    this.markRow(idx, false);
  }

  // ------------------------------------------------------------------ pista
  baseTrackDef() { return clone(this.baseDef(this.getTrackId())); }
  currentTrackDef() {
    if (!this.trackDef || this.trackDef.id !== this.getTrackId()) {
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem(LS_TRACK + ':' + this.getTrackId()) || 'null'); } catch { /* ok */ }
      this.trackDef = saved || this.baseTrackDef();
    }
    return this.trackDef;
  }
  /** Definicao editada da pista (ou null se nao houve edicao): usada ao iniciar partidas no debug. */
  trackOverride(id) {
    try { return JSON.parse(localStorage.getItem(LS_TRACK + ':' + id) || 'null'); } catch { return null; }
  }

  trackHtml() {
    const d = this.currentTrackDef();
    const num = (path, label, v) => `<div class="row"><label>${esc(label)}</label><input type="number" data-t="${esc(path)}" step="${stepFor(v)}" value="${+Number(v).toFixed(4)}"></div>`;
    let h = `<details><summary>Pista: ${esc(d.name || d.id)}</summary>`;
    for (const k of ['scale', 'halfWidth', 'verge', 'deckHeight', 'rampLength', 'riverHalf']) if (d[k] !== undefined || ['scale', 'halfWidth', 'verge'].includes(k)) h += num(k, k, d[k] ?? (k === 'scale' ? 1 : 0));
    h += `<h4>Cenário (quantidade)</h4>`;
    for (const k of ['trees', 'rocks', 'houses']) h += num('scenery.' + k, k, d.scenery?.[k] ?? { trees: 300, rocks: 90, houses: 22 }[k]);
    const list = (key, title, fields, mk) => {
      h += `<h4>${title} <button data-a="add" data-k="${key}">+</button></h4>`;
      (d[key] || []).forEach((it, i) => {
        h += `<div style="border-left:2px solid #345;padding-left:4px;margin:2px 0"><b>${i}</b> <button data-a="del" data-k="${key}" data-i="${i}">remover</button>`;
        for (const f of fields) h += num(`${key}.${i}.${f}`, f, it[f] ?? 0);
        if (key === 'hills') h += `<div class="row"><label>rails (cerca)</label><input type="checkbox" data-t="hills.${i}.rails" ${it.rails === false ? '' : 'checked'}></div>`;
        h += '</div>';
      });
      void mk;
    };
    list('hills', 'Colinas / rampas (fração da volta)', ['from', 'to', 'height', 'rise', 'fall']);
    list('chasms', 'Precipícios', ['from', 'to', 'side', 'width']);
    list('surfaces', 'Superfícies (0 asfalto, 1 madeira, 2 terra, 3 pedra)', ['from', 'to', 'type']);
    list('bridges', 'Pontes', ['from', 'to']);
    h += `<h4>Pontos de controle (x, z antes da escala)</h4>`;
    (d.points || []).forEach(([x, z], i) => { h += `<div class="row"><label>${i}</label><input type="number" data-t="points.${i}.0" step="1" value="${x}"><input type="number" data-t="points.${i}.1" step="1" value="${z}"></div>`; });
    h += `<h4>Caixas de item (fração da volta)</h4>`;
    (d.boxGroups || []).forEach((v, i) => { h += num('boxGroups.' + i, String(i), v); });
    h += `<div style="margin-top:6px"><button data-a="apply">Aplicar pista (reconstrói e reinicia)</button><button data-a="trackreset">Restaurar pista original</button></div></details>`;
    return h;
  }

  onTrackInput(el) {
    const d = this.currentTrackDef();
    const parts = el.dataset.t.split('.');
    let o = d;
    for (let i = 0; i < parts.length - 1; i++) {
      if (o[parts[i]] === undefined) o[parts[i]] = {};
      o = o[parts[i]];
    }
    const k = parts[parts.length - 1];
    if (el.type === 'checkbox') o[k] = el.checked;
    else { const v = Number(el.value); if (Number.isFinite(v)) o[k] = v; }
  }

  persistTrack() { try { localStorage.setItem(LS_TRACK + ':' + this.getTrackId(), JSON.stringify(this.currentTrackDef())); } catch { /* ok */ } }

  // ------------------------------------------------------------------ cliques
  onClick(e) {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    const a = b.dataset.a;
    if (a === 'close') this.toggle(false);
    else if (a === 'rv') this.resetField(b.dataset.f);
    else if (a === 'item') this.dbg.pending.push({ type: 'item', item: b.dataset.item });
    else if (a === 'copy') this.copy(JSON.stringify(this.changes(), null, 2));
    else if (a === 'reset') {
      for (const path of Object.keys(this.diff)) { const { o, k } = this.resolve(path); const s = this.resolveIn(this.snapshot, path); if (o && s !== undefined) o[k] = s; }
      this.diff = {}; this.save(); this.render();
    } else if (a === 'apply') { this.persistTrack(); this.applyTrack(clone(this.currentTrackDef())); }
    else if (a === 'trackreset') { try { localStorage.removeItem(LS_TRACK + ':' + this.getTrackId()); } catch { /* ok */ } this.trackDef = null; this.render(); this.applyTrack(this.baseTrackDef()); }
    else if (a === 'add' || a === 'del') {
      const d = this.currentTrackDef(), k = b.dataset.k;
      if (a === 'del') (d[k] || []).splice(Number(b.dataset.i), 1);
      else (d[k] = d[k] || []).push({ hills: { from: 0.1, to: 0.12, height: 3, rise: 20, fall: 0, rails: true }, chasms: { from: 0.1, to: 0.15, side: -1, width: 50 }, surfaces: { from: 0.1, to: 0.15, type: 2 }, bridges: { from: 0.1, to: 0.15 } }[k]);
      this.render();
    } else if (a === 'selcopy') this.copy(this.selectionText());
    else if (a === 'selclear') { this.clearSel(); this.render(); }
    else if (a === 'selmode') this.toggleSelect();
  }
  resolveIn(root, path) { let o = root; for (const p of path.split('.')) { if (o === undefined) return undefined; o = o[p]; } return o; }
  /** Todas as mudancas: valores vivos + pista editada. */
  changes() {
    const out = { valores: this.diff };
    const t = this.trackOverride(this.getTrackId());
    if (t) out.pista = t;
    return out;
  }
  copy(text) { navigator.clipboard?.writeText(text).catch(() => {}); const ta = this.root.querySelector('textarea[data-out]'); if (ta) ta.value = text; }

  // ------------------------------------------------------------------ painel
  toggle(v) {
    this.open = v ?? !this.open;
    this.root.hidden = !this.open;
    if (this.open) this.render();
  }
  hide() { this.root.hidden = true; this.overlay.hidden = true; this.setSelLines(false); if (this.dbg.selecting) this.toggleSelect(); }

  // ------------------------------------------------------------------ selecao de area
  toggleSelect() {
    this.dbg.selecting = !this.dbg.selecting;
    this.sc.renderer.domElement.style.cursor = this.dbg.selecting ? 'crosshair' : '';
    if (this.open) this.render();
  }
  selDown(e) {
    if (!this.dbg.on || !this.dbg.selecting || e.button !== 0) return;
    this.drag = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY };
    this.overlay.hidden = false;
    this.drawOverlay();
  }
  selMove(e) { if (!this.drag) return; this.drag.x1 = e.clientX; this.drag.y1 = e.clientY; this.drawOverlay(); }
  selUp() {
    if (!this.drag) return;
    const d = this.drag;
    this.drag = null;
    this.overlay.hidden = true;
    if (Math.abs(d.x1 - d.x0) < 6 || Math.abs(d.y1 - d.y0) < 6) return;
    const pts = [[d.x0, d.y0], [d.x1, d.y0], [d.x1, d.y1], [d.x0, d.y1]].map(([x, y]) => this.groundAt(x, y)).filter(Boolean);
    if (pts.length < 3) return;
    this.sel = {
      x0: Math.min(...pts.map((p) => p.x)), x1: Math.max(...pts.map((p) => p.x)),
      z0: Math.min(...pts.map((p) => p.z)), z1: Math.max(...pts.map((p) => p.z)),
    };
    this.setSelLines(true);
    if (!this.open) this.toggle(true); else this.render();
  }
  drawOverlay() {
    const d = this.drag, s = this.overlay.style;
    s.left = Math.min(d.x0, d.x1) + 'px'; s.top = Math.min(d.y0, d.y1) + 'px';
    s.width = Math.abs(d.x1 - d.x0) + 'px'; s.height = Math.abs(d.y1 - d.y0) + 'px';
  }
  /** Ponto do chao (y=0) sob um pixel da tela. */
  groundAt(px, py) {
    const cv = this.sc.renderer.domElement, r = cv.getBoundingClientRect();
    const ndc = new THREE.Vector2(((px - r.left) / r.width) * 2 - 1, -((py - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.sc.camera);
    const hit = new THREE.Vector3();
    return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit) ? { x: hit.x, z: hit.z } : null;
  }
  setSelLines(on) {
    if (this.selLines) { this.sc.scene.remove(this.selLines); this.selLines = null; }
    if (!on || !this.sel) return;
    const { x0, x1, z0, z1 } = this.sel;
    const pts = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([x, z]) => new THREE.Vector3(x, 0.5, z));
    this.selLines = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffd54a, depthTest: false }));
    this.selLines.renderOrder = 30;
    this.sc.scene.add(this.selLines);
  }
  clearSel() { this.sel = null; this.setSelLines(false); }

  /** Descricao da area selecionada (para o usuario colar na conversa). */
  selectionInfo() {
    const s = this.sel, g = this.getGame();
    if (!s) return null;
    const out = { area: { x: [s.x0, s.x1].map((v) => +v.toFixed(1)), z: [s.z0, s.z1].map((v) => +v.toFixed(1)), tamanho: [+(s.x1 - s.x0).toFixed(1), +(s.z1 - s.z0).toFixed(1)] } };
    if (!g) return out;
    const t = g.track, L = t.length, inside = (x, z) => x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1;
    const idx = [];
    for (let i = 0; i < t.N; i++) if (inside(t.X[i], t.Z[i])) idx.push(i);
    if (idx.length) {
      const sMin = Math.min(...idx) * t.ds, sMax = Math.max(...idx) * t.ds;
      out.pista = {
        trecho_m: [Math.round(sMin), Math.round(sMax)], fracao_volta: [+(sMin / L).toFixed(3), +(sMax / L).toFixed(3)],
        superficies: [...new Set(idx.map((i) => SURF_NAME[t.SURFACE[i]]))],
        altura_max: +Math.max(...idx.map((i) => t.ELEV[i])).toFixed(1),
        ponte: idx.some((i) => t.BRIDGE[i]), precipicio: idx.some((i) => t.CH[i] !== 0), cerca: idx.some((i) => t.RAILS[i] === 1),
      };
    }
    const def = t.def, sc = def.scale || 1;
    const pts = [];
    (def.points || []).forEach(([x, z], i) => { if (inside(x * sc, z * sc)) pts.push(i); });
    if (pts.length) out.pontos_de_controle = pts;
    const frac = idx.length ? [Math.min(...idx) * t.ds / L, Math.max(...idx) * t.ds / L] : null;
    if (frac) {
      const hit = (arr, f) => (arr || []).map((h, i) => [h, i]).filter(([h]) => h.from <= frac[1] + 0.001 && (h.to ?? h.from) >= frac[0] - 0.001).map(([, i]) => f + '[' + i + ']');
      const ov = [...hit(def.hills, 'hills'), ...hit(def.chasms, 'chasms'), ...hit(def.surfaces, 'surfaces'), ...hit(def.bridges, 'bridges')];
      if (ov.length) out.definicoes_no_trecho = ov;
    }
    const sc0 = t.scenery;
    if (sc0) out.cenario = { arvores: sc0.trees.filter((o) => inside(o.x, o.z)).length, pedras: sc0.rocks.filter((o) => inside(o.x, o.z)).length, casas: sc0.houses.filter((o) => inside(o.x, o.z)).length };
    out.caixas_de_item = g.items.boxes.filter((b) => inside(b.x, b.z)).length;
    out.carros = g.cars.filter((c) => inside(c.x, c.z)).map((c) => c.id);
    return out;
  }
  selectionText() {
    const info = this.selectionInfo();
    if (!info) return '';
    const note = this.root.querySelector('textarea[data-note]')?.value?.trim();
    return `[Área do mapa selecionada no debug]\n${JSON.stringify(info, null, 2)}${note ? `\n\nPedido: ${note}` : ''}`;
  }
  selectionHtml() {
    let h = `<details open><summary>Seleção de área (mapa)</summary><div><button data-a="selmode">${this.dbg.selecting ? '■ sair da seleção' : '▢ selecionar área (E)'}</button>`;
    if (this.sel) h += `<button data-a="selclear">limpar</button><button data-a="selcopy">Copiar descrição</button>`;
    h += `</div>`;
    if (this.sel) {
      h += `<pre style="white-space:pre-wrap;color:#cfe">${esc(JSON.stringify(this.selectionInfo(), null, 1))}</pre>`;
      h += `<div style="color:#9ab">O que editar nessa área (opcional, vai junto na cópia):</div><textarea data-note placeholder="ex.: tirar as árvores e colocar uma rampa aqui"></textarea>`;
    } else h += `<div style="color:#789">Ligue a seleção e arraste um retângulo no chão (use a câmera livre, F).</div>`;
    h += `<textarea data-out placeholder="a cópia também aparece aqui"></textarea></details>`;
    return h;
  }
}
