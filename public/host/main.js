// Host: orquestra menus, rede, simulacao e render.
import { COLORS, ITEM_LABEL, MAX_PLAYERS, BTN_FIRE, BTN_AWAY, BTN_REV } from '/shared/protocol.js';
import { buildTrack } from '/sim/track.js';
import { Game } from '/sim/game.js';
import { CAMERA } from '/sim/camera.js';
import { CAR, HULL } from '/sim/car.js';
import { makeBrain, think, DIFFICULTY_LABEL, DIFFICULTY_ORDER } from '/sim/ai.js';
import { makeRng } from '/sim/rng.js';
import testCircuit from '/sim/tracks/testcircuit.js';
import downtown from '/sim/tracks/downtown.js';
import { HostNet } from './net.js';
import { UI, qrSvg } from './ui.js';
import { GameAudio } from './audio.js?v=2';
import { Keyboard } from './kbd.js';
import { createScene } from './render/scene.js';
import { buildWorld } from './render/world.js';
import { Actors } from './render/cars.js';
import { FX } from './render/fx.js';
import { Debris } from './render/debris.js';
import { DebugTools } from './debug.js';
import { DebugEditor } from './debug-editor.js';

const qs = new URLSearchParams(location.search);
const quality = qs.get('q') === 'low' ? 'low' : 'high';

const CUPS = [
  { id: 'fast', icon: '🏁', name: 'Fast Cup', desc: 'Condução limpa e precisão. Sem armas: só você, a pista e a câmera.' },
  { id: 'super', icon: '⚡', name: 'Super Cup', desc: 'Corrida arcade clássica com itens táticos espaçados na pista.' },
  { id: 'war', icon: '💥', name: 'War Cup', desc: 'Caos total: caixas de item por toda parte. Sobreviva.' },
];
const TRACKS = [
  { id: 'test', icon: '🧪', name: 'Ponte do Rio (teste)', desc: 'Circuito de teste (~1,5 min por volta): ponte sobre o rio, rampas de salto, curvas fechadas e uma area alta sem grades.', def: testCircuit },
  { id: 'downtown', icon: '🏙️', name: 'Downtown', desc: 'Metrópole ao entardecer (~4 min por volta): quarteirões técnicos, posto de gasolina que explode, carretas-rampa e salto do viaduto para a rodovia.', def: downtown },
  { icon: '🌊', name: 'Water Hill', desc: 'Em breve.', locked: true },
  { icon: '🏜️', name: 'Death Mountain', desc: 'Em breve.', locked: true },
  { icon: '🌽', name: 'Farm Jump', desc: 'Em breve.', locked: true },
];

const ui = new UI();
const audio = new GameAudio();
const kbd = new Keyboard();

for (const [id, kind, on, off] of [['mute-music', 'music', '🎵', '🔇'], ['mute-sfx', 'sfx', '🔊', '🔈']]) {
  const b = document.getElementById(id);
  const sync = () => { const m = audio.mute[kind]; b.classList.toggle('off', m); b.textContent = m ? off : on; b.setAttribute('aria-pressed', m); };
  b.addEventListener('click', () => { audio.setMuted(kind, !audio.mute[kind]); sync(); b.blur(); });
  sync();
}
const sc = createScene(document.getElementById('gl'), quality);
const fx = new FX(sc.scene);
const actors = new Actors(sc.scene, { shadows: sc.shadows });
const debris = new Debris(sc.scene);
const dbg = new DebugTools(sc);
const editor = new DebugEditor({
  dbg, sc,
  getGame: () => S.game,
  getTrackId: () => TRACKS[S.trackIdx].id,
  baseDef: (id) => TRACKS.find((t) => t.id === id).def,
  applyTrack: () => { if (S.game) startGame(); }, // a pista editada fica salva; reinicia a partida com ela
});
dbg.onEditor = () => editor.toggle();
dbg.onSelectMode = () => editor.toggleSelect();
dbg.onToggle = (on) => { if (!on) editor.hide(); };
let world = null;

const S = {
  phase: 'splash',
  code: '',
  devices: new Map(), // id -> { id, name, connected, steer, fireHeld, fireQueued, away, rtt, sent }
  bots: new Map(), // color -> { color }
  kbd: null, // color
  masterId: -1,
  cupIdx: 1,
  geysers: [],
  trackIdx: Math.max(0, TRACKS.findIndex((t) => t.id === qs.get('track'))),
  ips: [],
  ipIdx: 0,
  port: location.port || 80,
  game: null,
  brains: new Map(),
  difficulty: 'medium', // dificuldade dos bots: easy | medium | hard
  paused: false,
  names: new Map(),
  resultsTimer: 0,
};

// ---------------------------------------------------------------- jogadores
const phoneName = (d) => d.name || `Jogador ${d.id + 1}`;
function usedColors() {
  const u = new Set(S.devices.keys());
  for (const c of S.bots.keys()) u.add(c);
  if (S.kbd !== null) u.add(S.kbd);
  return u;
}
function freeColor() {
  const u = usedColors();
  for (let i = MAX_PLAYERS - 1; i >= 0; i--) if (!u.has(i)) return i;
  return -1;
}
function addBot() {
  const c = freeColor();
  if (c >= 0) S.bots.set(c, { color: c });
}
function removeBot() {
  const keys = [...S.bots.keys()].sort((a, b) => a - b);
  if (keys.length) S.bots.delete(keys[0]);
}
function slots() {
  const out = Array(MAX_PLAYERS).fill(null);
  for (const d of S.devices.values()) out[d.id] = { kind: 'phone', name: phoneName(d), master: d.id === S.masterId, connected: d.connected };
  for (const c of S.bots.keys()) out[c] = { kind: 'bot', name: 'Bot ' + COLORS[c].name };
  if (S.kbd !== null) out[S.kbd] = { kind: 'kbd', name: 'Teclado' };
  return out;
}
function participants() {
  const list = [];
  slots().forEach((s, i) => {
    if (!s) return;
    if (s.kind === 'phone' && !s.connected) return;
    list.push({ id: i, color: i, name: s.name, isBot: s.kind === 'bot', kind: s.kind });
  });
  return list;
}

// ---------------------------------------------------------------- rede
const net = new HostNet({
  onStatus: () => {},
  onRoom: (code) => { S.code = code; refresh(); },
  onConnect: (m) => {
    let d = S.devices.get(m.id);
    if (!d) { d = { id: m.id, name: '', connected: true, steer: 0, fireHeld: false, fireQueued: false, away: false, rev: false, rtt: 0, sent: '' }; S.devices.set(m.id, d); }
    d.connected = true; d.name = m.name || d.name; d.sent = '';
    if (S.bots.has(m.id)) { S.bots.delete(m.id); addBot(); }
    if (S.kbd === m.id) { S.kbd = null; const c = freeColor(); if (c >= 0) S.kbd = c; }
    audio.play('join');
    refresh();
  },
  onDisconnect: (m) => {
    const d = S.devices.get(m.id);
    if (!d) return;
    if (m.gone || S.phase !== 'game') S.devices.delete(m.id);
    else { d.connected = false; d.steer = 0; }
    refresh();
  },
  onMaster: (id) => { S.masterId = id; refresh(); },
  onInput: (r) => {
    const d = S.devices.get(r.id);
    if (!d) return;
    d.steer = r.steer;
    const fire = !!(r.buttons & BTN_FIRE);
    if (fire && !d.fireHeld) d.fireQueued = true;
    d.fireHeld = fire;
    d.away = !!(r.buttons & BTN_AWAY);
    d.rev = !!(r.buttons & BTN_REV);
  },
  onFrom: (id, m) => {
    const d = S.devices.get(id);
    if (!d) return;
    if (m.t === 'menu' && id === S.masterId) nav(m.k, m.i, true);
    else if (m.t === 'rtt') d.rtt = m.ms;
    else if (m.t === 'name') { d.name = String(m.name || '').slice(0, 14); refresh(); }
  },
});
net.connect();

const vib = (id, pattern) => { if (S.devices.has(id)) net.sendTo(id, { t: 'vib', p: pattern }); };

function phoneView(id) {
  const d = S.devices.get(id);
  const isMaster = id === S.masterId;
  const base = { t: 'st', color: COLORS[id].hex, cname: COLORS[id].name, name: phoneName(d), master: isMaster };
  if (S.phase === 'game' && S.game) {
    const c = S.game.carById(id);
    if (c) return { ...base, mode: S.paused && isMaster ? 'menu' : c.alive ? 'drive' : 'dead', item: c.item ? ITEM_LABEL[c.item] + '|' + c.item : null, pts: S.game.points.get(id), title: S.paused ? 'Jogo pausado' : '' };
    return { ...base, mode: 'wait', title: 'Aguardando a próxima partida' };
  }
  const titles = { splash: 'Clique na tela principal', lobby: 'Lobby: ◀ ▶ bots · OK escolher copa', cups: 'Escolha a copa', tracks: 'Escolha o circuito', results: 'Fim de jogo: OK volta ao lobby' };
  return { ...base, mode: isMaster ? 'menu' : 'wait', title: titles[S.phase] || '' };
}
function syncPhones() {
  for (const d of S.devices.values()) {
    if (!d.connected) continue;
    const v = JSON.stringify(phoneView(d.id));
    if (v !== d.sent) { d.sent = v; net.sendTo(d.id, JSON.parse(v)); }
  }
}
setInterval(syncPhones, 120);

// ---------------------------------------------------------------- menus
async function loadIps() {
  if (window.RW?.static) { refresh(); return; }
  try {
    const r = await (await fetch('/api/lan')).json();
    S.ips = r.ips; S.port = r.port;
  } catch {}
  refresh();
}
loadIps();

function padUrl() {
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (!S.code) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    let c = '';
    for (let i = 0; i < 4; i++) c += chars[Math.floor(Math.random() * chars.length)];
    S.code = c;
  }
  if (!local || location.protocol === 'https:') {
    const basePath = location.pathname.replace(/\/(host\/)?(index\.html)?$/, '');
    const cleanBase = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
    return { base: `${location.host}${cleanBase}`, url: `${location.origin}${cleanBase}/pad/?room=${S.code}` };
  }
  const host = S.ips[S.ipIdx] ? `${S.ips[S.ipIdx]}:${S.port}` : location.host;
  return { base: host, url: `http://${host}/pad?room=${S.code}` };
}

function refresh() {
  if (S.phase === 'lobby') {
    const p = padUrl();
    const m = S.devices.get(S.masterId);
    ui.lobby({
      qr: S.code ? qrSvg(p.url) : '', code: S.code || '····', padUrl: `${p.base}/pad`,
      slots: slots(), bots: S.bots.size, difficulty: DIFFICULTY_LABEL[S.difficulty], kbd: S.kbd !== null, masterName: m ? phoneName(m) : '',
      ips: S.ips.length, ipIdx: S.ipIdx,
    });
  } else if (S.phase === 'cups') ui.cups(CUPS, S.cupIdx);
  else if (S.phase === 'tracks') ui.tracks(TRACKS, S.trackIdx);
  syncPhones();
}

function goto(phase) {
  S.phase = phase;
  refresh();
}

function cycleDifficulty(step) {
  const i = DIFFICULTY_ORDER.indexOf(S.difficulty);
  S.difficulty = DIFFICULTY_ORDER[(i + step + DIFFICULTY_ORDER.length) % DIFFICULTY_ORDER.length];
  refresh();
}

function nav(k, idx, fromPhone = false) {
  if (S.phase === 'splash') {
    if (k === 'ok' || k === 'pick') { audio.init(); goto('lobby'); }
    return;
  }
  audio.init();
  audio.play('menu');
  switch (S.phase) {
    case 'lobby':
      if (k === 'right') { if (participants().length < MAX_PLAYERS) addBot(); refresh(); }
      else if (k === 'left') { removeBot(); refresh(); }
      else if (k === 'up' || k === 'down') cycleDifficulty(k === 'up' ? 1 : -1);
      else if (k === 'ok') goto('cups');
      break;
    case 'cups':
      if (k === 'left') { S.cupIdx = (S.cupIdx + CUPS.length - 1) % CUPS.length; refresh(); }
      else if (k === 'right') { S.cupIdx = (S.cupIdx + 1) % CUPS.length; refresh(); }
      else if (k === 'pick') { S.cupIdx = idx; refresh(); }
      else if (k === 'ok') goto('tracks');
      else if (k === 'back') goto('lobby');
      break;
    case 'tracks':
      if (k === 'left') { S.trackIdx = (S.trackIdx + TRACKS.length - 1) % TRACKS.length; refresh(); }
      else if (k === 'right') { S.trackIdx = (S.trackIdx + 1) % TRACKS.length; refresh(); }
      else if (k === 'pick') { S.trackIdx = idx; refresh(); }
      else if (k === 'ok') { if (!TRACKS[S.trackIdx].locked) startGame(); }
      else if (k === 'back') goto('cups');
      break;
    case 'game':
      if (k === 'back' && !S.paused) { S.paused = true; ui.pause(); audio.setEngine(0, false); }
      else if (S.paused && k === 'ok') { S.paused = false; ui.clear(); }
      else if (S.paused && k === 'back') quitToLobby();
      break;
    case 'results':
      if (k === 'ok' || k === 'back') quitToLobby();
      break;
  }
  syncPhones();
}
ui.nav = nav;
kbd.onNav = (k, repeat) => { if (S.phase === 'game' && !S.paused && k !== 'back') return; if (!repeat || S.phase !== 'game') nav(k); };
kbd.onKey = (ch) => {
  if (S.phase === 'lobby') {
    if (ch === 'b') { if (participants().length < MAX_PLAYERS) addBot(); refresh(); }
    else if (ch === 'k') { if (S.kbd !== null) S.kbd = null; else { const c = freeColor(); if (c >= 0) S.kbd = c; } refresh(); }
    else if (ch === 'g') cycleDifficulty(1);
    else if (ch === 'i') { S.ipIdx = (S.ipIdx + 1) % Math.max(1, S.ips.length); refresh(); }
  }
  if (S.phase === 'game' && ch === 'p') nav('back');
};

// ---------------------------------------------------------------- partida
function startGame() {
  if (participants().length < 2) while (participants().length < 4 && freeColor() >= 0) addBot();
  const list = participants();
  const def = (dbg.on && editor.trackOverride(TRACKS[S.trackIdx].id)) || TRACKS[S.trackIdx].def; // debug: pista editada
  const track = buildTrack(def);
  const cup = CUPS[S.cupIdx].id;
  const game = new Game(list, { track, cup, seed: (Math.random() * 1e9) | 0, aspect: sc.size.aspect });
  S.game = game;
  S.geysers = [];
  S.paused = false;
  S.names = new Map(list.map((p) => [p.id, p.name]));
  S.kinds = new Map(list.map((p) => [p.id, p.kind]));
  const rng = makeRng(game.rng() * 1e9);
  S.brains = new Map(list.filter((p) => p.isBot).map((p) => [p.id, makeBrain(rng, null, S.difficulty)]));
  if (world) sc.scene.remove(world.group);
  sc.applyTheme(track.theme);
  world = buildWorld(track, quality);
  sc.scene.add(world.group);
  actors.setup(game);
  debris.clear();
  fx.clearScorch();
  ui.clear();
  ui.initHud(game, S.names);
  S.phase = 'game';
  audio.setMusic(true);
  handleEvents(game.drainEvents());
  syncPhones();
}

function quitToLobby() {
  clearTimeout(S.resultsTimer);
  audio.setMusic(false);
  audio.setEngine(0, false);
  audio.setSqueal(0);
  ui.bannerClear();
  ui.clearHud();
  actors.clear();
  debris.clear();
  fx.clearScorch();
  S.game = null;
  S.paused = false;
  for (const d of [...S.devices.values()]) if (!d.connected) S.devices.delete(d.id);
  for (const d of S.devices.values()) d.sent = '';
  goto('lobby');
}

function trafficLight(n) {
  const on = n === 'go' ? [0, 0, 1] : n >= 3 ? [1, 0, 0] : [1, 1, 0];
  const lamp = (c, i) => `<i class="${c}${on[i] ? ' on' : ''}"></i>`;
  return `<div class="tl"><div class="lamps">${lamp('r', 0)}${lamp('y', 1)}${lamp('g', 2)}</div><div class="num">${n === 'go' ? 'VAI!' : n}</div></div>`;
}

const nameOf = (id) => S.names.get(id) || 'Piloto';
const hexOf = (id) => COLORS[id].hex;

const gtmp = { y: 0, nx: 0, ny: 1, nz: 0 };
const ptmp = { y: 0, nx: 0, ny: 1, nz: 0 };
/** Chao para os detritos: altura sob (x,z) e se e precipicio/rio (a peca cai em vez de flutuar). */
function debrisProbe(x, z, out) {
  const t = S.game && S.game.track;
  if (!t) { out.y = 0; out.pit = false; return; }
  out.y = t.groundAt(x, z, -1, ptmp).y;
  const nr = t._gn;
  out.pit = !!nr && out.y <= 0.3 && (t.inWater(nr) || (t.hasChasm && t.chasmAt(nr)));
}
debris.probe = debrisProbe;

function handleEvents(events) {
  const g = S.game;
  const cam = g.camera;
  /** altura do chao em (x,z) e do carro `id` (para posicionar efeitos no plateau/rampas) */
  const gnd = (x, z) => g.track.groundAt(x, z, -1, gtmp).y;
  const yOf = (id) => { const c = g.carById(id); return c ? c.y : 0; };
  for (const e of events) {
    switch (e.type) {
      case 'countdown':
        if (e.n === 3) { debris.clear(); fx.clearScorch(); }
        world?.gantry.countdown(e.n);
        ui.banner(trafficLight(e.n), 1100);
        audio.play('count');
        break;
      case 'go':
        world?.gantry.go();
        ui.banner(trafficLight('go'), 900);
        audio.play('go');
        break;
      case 'pickup': audio.play('pickup'); vib(e.car, [25]); fx.sparks(e.x, e.z, 6, 0, 0, yOf(e.car)); break;
      case 'use':
        audio.play(e.item);
        if (e.item === 'whomp') {
          const c0 = g.carById(e.car);
          if (c0) fx.flash(c0.x, c0.z, 1.1, c0.y + 1.4, 0x6fc4ff);
          cam.shake = Math.max(cam.shake, 2.4);
          vib(e.car, [60]);
        }
        break;
      case 'explode': {
        const big = e.kind === 'missile' ? 1.25 : 1;
        const c = e.car >= 0 ? g.carById(e.car) : null;
        const y0 = c ? c.y : gnd(e.x, e.z);
        fx.explosion(e.x, e.z, big, y0);
        if (c) {
          const sp = Math.hypot(c.vx, c.vz) || 1;
          debris.carBlast(e.x, e.z, parseInt(COLORS[c.color % 8].hex.slice(1), 16), c.vx, c.vz, gnd(e.x, e.z), big, c.vx / sp, c.vz / sp);
        }
        audio.play('explode', e.kind === 'missile' ? 2 : 1);
        cam.shake = Math.max(cam.shake, e.kind === 'cut' ? 1.6 : 3.4);
        break;
      }
      case 'hit': vib(e.car, [250]); break;
      case 'blast': {
        // poderes quebram as cercas no raio
        for (const b of world?.breakFencesIn(e.x, e.z, e.radius) || []) {
          debris.fence(b.x, b.z, b.dx, b.dz, b.speed, b.y, b.kind);
          if (b.kind === 'iron') fx.sparks(b.x, b.z, 8, 0, 0, b.y); else fx.woodChips(b.x, b.z, b.dx, b.dz, b.speed, b.y + 1);
        }
        break;
      }
      case 'sceneryHit': {
        world?.hideScenery(e.kind, e.idx);
        fx.leaves(e.x, e.z, 1.2, e.kind === 'rock', gnd(e.x, e.z));
        break;
      }
      case 'propHit': {
        world?.hideScenery(e.kind, e.idx);
        const sp = Math.hypot(e.vx, e.vz) || 1, g0 = gnd(e.x, e.z);
        const col = { cone: 0xff6a1a, sign: 0xd3221f, hydrant: 0xd8392b, busstop: 0x9bd8ff }[e.kind] ?? 0xcccccc;
        for (let i = 0; i < (e.kind === 'busstop' ? 9 : 4); i++) debris.piece({ x: e.x + (Math.random() - 0.5), y: g0 + 0.6 + Math.random(), z: e.z + (Math.random() - 0.5), vx: (e.vx / sp) * (6 + Math.random() * 8) + (Math.random() - 0.5) * 5, vy: 4 + Math.random() * 5, vz: (e.vz / sp) * (6 + Math.random() * 8) + (Math.random() - 0.5) * 5, sx: 0.3 + Math.random() * 0.4, sy: 0.3 + Math.random() * 0.4, sz: 0.3 + Math.random() * 0.4, color: col, gy: g0 });
        if (e.kind === 'hydrant') S.geysers.push({ x: e.x, z: e.z, t: 3.2 });
        break;
      }
      case 'pumpBoom': {
        world?.burnPump(e.idx);
        fx.explosion(e.x, e.z, 1.5, e.y);
        fx.flash(e.x, e.z, 1.6, e.y + 2, 0xffa040);
        fx.scorch(e.x, e.z, 6, e.y + 0.06);
        audio.play('explode', 2);
        cam.shake = Math.max(cam.shake, 3.4);
        break;
      }
      case 'sceneryFreeze': world?.freezeScenery(e.kind, e.idx); break;
      case 'sceneryReset': world?.restoreScenery(); break;
      case 'iceBurst': fx.frost(e.x, e.z, e.y, e.radius); audio.play('iceBurst'); cam.shake = Math.max(cam.shake, 0.6); break;
      case 'freeze': vib(e.car, [60, 40, 60]); break;
      case 'unfreeze': {
        const c = g.carById(e.car);
        debris.iceShards(e.x, e.z, c ? c.vx : 0, c ? c.vz : 0, gnd(e.x, e.z));
        audio.play('shatter');
        break;
      }
      case 'whompHit': {
        vib(e.car, [120]);
        const c = g.carById(e.car);
        if (c) { fx.arcs(c.x, c.z, 10 + Math.round(e.force * 22), c.y); fx.flash(c.x, c.z, 0.35 + e.force * 0.5, c.y + 1.4, 0x6fc4ff); cam.shake = Math.max(cam.shake, 1 + e.force * 2); }
        break;
      }
      case 'wall':
        if (e.what === 'tree' || e.what === 'rock') fx.leaves(e.x, e.z, e.strength, e.what === 'rock', yOf(e.car));
        else fx.sparks(e.x, e.z, 6 + Math.round(e.strength * 8), 0, 0, yOf(e.car));
        audio.play('wall', e.strength);
        cam.shake = Math.max(cam.shake, 0.4 + e.strength);
        vib(e.car, [30 + Math.round(e.strength * 60)]);
        break;
      case 'land': {
        // pouso: poeira em volta e tremor leve; pouso violento (capotou) solta faiscas e treme mais
        const y0 = gnd(e.x, e.z);
        for (let i = 0; i < 4 + Math.round(e.strength * 8); i++) fx.dust(e.x + (Math.random() - 0.5) * 3, e.z + (Math.random() - 0.5) * 3, undefined, y0);
        if (e.crash) fx.sparks(e.x, e.z, 14, 0, 0, y0);
        audio.play('bump', e.strength);
        cam.shake = Math.max(cam.shake, 0.3 + e.strength * 0.7);
        vib(e.car, [40 + Math.round(e.strength * 80)]);
        break;
      }
      case 'bump': fx.sparks(e.x, e.z, 4, 0, 0, yOf(e.a)); audio.play('bump', e.strength); vib(e.a, [30]); vib(e.b, [30]); break;
      case 'alarm': audio.play('alarm'); vib(e.car, [70, 40, 70]); break;
      case 'fall': if (e.cause !== 'chasm') fx.splash(e.x, e.z); audio.play('fall'); break;
      case 'dead': {
        const why = { fall: 'caiu no rio', chasm: 'caiu no precipício', cut: 'ficou para trás', mine: 'pisou numa mina', missile: 'levou um míssil', trail: 'passou no rastro do nitro', offroad: 'se perdeu no mato', pump: 'explodiu no posto' }[e.cause] || 'explodiu';
        ui.killfeed(`${nameOf(e.car)} ${why}`, hexOf(e.car));
        if (e.cause === 'cut') audio.play('cut');
        vib(e.car, [400]);
        break;
      }
      case 'roundEnd': {
        world?.gantry.off();
        const d = e.delta[e.survivor];
        ui.banner(`<div style="position:relative;top:22vh"><div class="mid" style="color:${hexOf(e.survivor)}">${nameOf(e.survivor)} sobreviveu!</div><div class="sub">+${d} pontos</div></div>`, 1100);
        audio.play('win');
        vib(e.survivor, [80, 50, 80, 50, 160]);
        break;
      }
      case 'matchEnd': {
        audio.setMusic(false);
        audio.play('fanfare');
        ui.banner(`<div class="mid" style="color:${hexOf(e.winner)}">🏆 ${nameOf(e.winner)} venceu!</div>`, 0);
        S.resultsTimer = setTimeout(showResults, 2600);
        vib(e.winner, [100, 60, 100, 60, 400]);
        break;
      }
    }
  }
}

function showResults() {
  const g = S.game;
  if (!g) return;
  const rows = g.cars.map((c) => ({ color: c.color, name: nameOf(c.id), points: g.points.get(c.id), prog: c.progress, win: c.id === g.winner }));
  rows.sort((a, b) => (b.win - a.win) || (b.points - a.points) || (b.prog - a.prog));
  ui.bannerClear();
  S.phase = 'results';
  ui.results(rows, `${rows[0].name} venceu!`, g.endReason);
  syncPhones();
}

// ---------------------------------------------------------------- laco principal
let last = performance.now(), fpsAcc = 0, fpsN = 0, fps = 0;
const scr = { x: 0, y: 0 };

function frame(now) {
  requestAnimationFrame(frame);
  tick(Math.min(0.05, (now - last) / 1000), now);
  last = now;
}

function tick(dt, now) {
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) { fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
  const g = S.game;

  if (g && S.phase !== 'splash') {
    if (S.phase === 'game' && !S.paused) {
      g.camera.aspect = sc.size.aspect;
      for (const c of g.cars) {
        const kind = S.kinds.get(c.id);
        if (kind === 'bot') {
          if (c.alive && c.near) {
            const r = think(S.brains.get(c.id), c, g, dt);
            g.setInput(c.id, r.steer, r.fire);
          }
        } else if (dbg.on && dbg.free) {
          // freecam ligada (WASD move a camera): o carro humano dirige sozinho, como um bot
          if (c.alive && c.near) {
            let br = S.brains.get(c.id);
            if (!br) S.brains.set(c.id, (br = makeBrain(makeRng(c.id + 11), null, S.difficulty)));
            const r = think(br, c, g, dt);
            g.setInput(c.id, r.steer, r.fire);
          }
          if (kind === 'kbd') kbd.takeFire(); else { const d = S.devices.get(c.id); if (d) d.fireQueued = false; }
        } else if (kind === 'kbd') {
          g.setInput(c.id, kbd.steer, kbd.takeFire(), kbd.rev);
        } else {
          const d = S.devices.get(c.id);
          if (d) {
            g.setInput(c.id, d.connected && !d.away ? d.steer : 0, d.fireQueued, d.connected && !d.away && d.rev);
            d.fireQueued = false;
          }
        }
      }
      const gd = dbg.flags;
      g.debug.infinite = gd.infinite;
      g.debug.noCut = gd.noCut;
      for (const c of g.cars) c.god = dbg.on && dbg.god && S.kinds.get(c.id) !== 'bot';
      debugActions(g);
      g.update(dt * dbg.timeScale);
      for (let n = dbg.takeStep(); n > 0; n--) g.update(1 / 60); // freeze: avanca so quando pedido
      const ev = g.drainEvents();
      if (ev.length) { handleEvents(ev); syncPhones(); }
      ambient(g, dt * dbg.timeScale);
    }
    sc.frame(g.camera);
    dbg.applyCamera(dt);
    dbg.updateHitboxes(g, HULL, CAR.circleR);
    actors.update(g, now / 1000, dt);
    if (world) {
      for (const b of world.update(now / 1000, g.cars)) {
        debris.fence(b.x, b.z, b.dx, b.dz, b.speed, b.y, b.kind);
        if (b.kind === 'iron') fx.sparks(b.x, b.z, 8); else fx.woodChips(b.x, b.z, b.dx, b.dz, b.speed, b.y + 1);
        audio.play('wall', 0.4);
      }
    }
    ui.updateHud(g);
    ui.updateLabels(g, (x, y, z) => sc.toScreen(x, y, z, scr), g.camera);
    debris.update(S.paused ? 0 : dt * dbg.timeScale);
    fx.update(S.paused ? 0 : dt * dbg.timeScale, sc.renderer.domElement.height / (2 * Math.tan((CAMERA.fov * Math.PI) / 360)));
  }
  sc.render();
  if (dbg.on) {
    const rt = [...S.devices.values()].map((d) => `${d.id}:${d.rtt}ms${d.away ? '(away)' : ''}`).join(' ');
    dbg.text(fps, `fase ${S.phase}${g ? ' · ' + g.state + ' · rodada ' + g.round : ''}
${rt}`);
  }
}

/** Acoes de debug pedidas pelo teclado (dar item, renascer, explodir bots). */
function debugActions(g) {
  for (const a of dbg.takeActions()) {
    const humans = g.cars.filter((c) => S.kinds.get(c.id) !== 'bot');
    if (a.type === 'item') { const tg = humans.some((c) => c.alive) ? humans : g.cars; for (const c of tg) if (c.alive) c.item = a.item; }
    else if (a.type === 'respawn') { for (const c of humans) if (!c.alive && c.state === 'wreck') c.wreckT = 9; }
    else if (a.type === 'killbots') for (const c of g.cars) if (S.kinds.get(c.id) === 'bot') g.explodeCar(c, 'mine');
  }
}

/** Efeitos continuos: fumaca, fogo do nitro, motor e guincho. */
function ambient(g, dt) {
  let vmax = 0, slip = 0;
  for (const m of g.items.mortars) fx.iceTrail(m.x, m.z, m.y);
  for (const c of g.cars) {
    if (c.state === 'wreck') {
      // carcaca: fumaca escura e chamas nos primeiros segundos
      if (Math.random() < dt * (c.wreckT < 4 ? 26 : 9)) fx.smoke(c.x + (Math.random() - 0.5) * 1.5, c.z + (Math.random() - 0.5) * 1.5, 1.4, c.y);
      if (c.wreckT < 4 && Math.random() < dt * 18) fx.fire(c.x, c.z, 0, 0, c.y);
      continue;
    }
    if (!c.alive || c.hidden) continue;
    vmax = Math.max(vmax, c.speed);
    slip = Math.max(slip, c.slip);
    const fx0 = Math.cos(c.h), fz0 = Math.sin(c.h);
    if (c.boost > 0) fx.fire(c.x - fx0 * 2.6, c.z - fz0 * 2.6, fx0, fz0, c.y);
    const onGround = c.state === 'run' && !c.air;
    if (onGround && c.slip > 4 && Math.random() < dt * 40) fx.smoke(c.x - fx0 * 1.5, c.z - fz0 * 1.5, 0.6, c.y);
    if (onGround && c.speed > 8 && (c.onVerge || c.surf === 2) && Math.random() < dt * 30) fx.dust(c.x - fx0 * 1.6, c.z - fz0 * 1.6, undefined, c.y);
    if (c.freeze > 0 && c.speed > 2 && Math.random() < dt * Math.min(90, 20 + c.speed * 2.5)) fx.meltWater(c.x, c.z, c.y, c.vx, c.vz);
    if (c.state === 'stun' && Math.random() < dt * 40) fx.smoke(c.x, c.z, 1, c.y);
    if (c.state === 'stun' && c.stun > 0.3 && Math.random() < dt * 30) fx.arcs(c.x, c.z, 2, c.y);
  }
  // bombas queimadas: fogo e fumaca ate o fim da partida; hidrantes quebrados soltam agua
  const pumps = g.track.scenery?.pumps;
  if (pumps) for (const p of pumps) if (p.burnt) {
    if (Math.random() < dt * 22) fx.fire(p.x + (Math.random() - 0.5) * 0.8, p.z + (Math.random() - 0.5) * 0.8, 0, 0, p.y + 0.8);
    if (Math.random() < dt * 7) fx.smoke(p.x, p.z, 1.6, p.y + 2);
  }
  for (let i = S.geysers.length - 1; i >= 0; i--) {
    const gz = S.geysers[i];
    gz.t -= dt;
    if (gz.t <= 0) { S.geysers.splice(i, 1); continue; }
    if (Math.random() < dt * 50) fx.splash(gz.x + (Math.random() - 0.5) * 0.6, gz.z + (Math.random() - 0.5) * 0.6);
  }
  audio.setEngine(vmax, g.state === 'RACING');
  audio.setSqueal(g.state === 'RACING' ? Math.min(1, Math.max(0, slip - 3) / 8) : 0);
}

requestAnimationFrame(frame);
ui.splash();
window.__rw = S; // depuracao
window.__dbg = dbg;
window.__ed = editor;
window.__start = startGame;
if (qs.has('autostart')) setTimeout(() => startGame(), 300); // atalho de teste
S.tick = (dt = 1 / 60, n = 1) => { for (let i = 0; i < n; i++) tick(dt, performance.now()); };
