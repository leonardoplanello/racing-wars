// Controle do celular: direcao cega (metade esquerda) + item (metade direita).
import { encodeInput, BTN_FIRE, BTN_AWAY } from '/shared/protocol.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch {} return null; };

let clientId = store('rw-cid');
if (!clientId) { clientId = Math.random().toString(36).slice(2) + Date.now().toString(36); store('rw-cid', clientId); }

const S = { ws: null, room: '', joined: false, mode: 'join', master: false, retry: 0, steer: 0, fire: false, seq: 0, rtt: 0, timer: 0 };
const buf = new Uint8Array(4);

// ------------------------------------------------------------------ rede
function connect() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${location.host}/ws`);
  S.ws = ws;
  ws.onopen = () => {
    S.retry = 0;
    ws.send(JSON.stringify({ t: 'join', room: S.room, clientId, name: store('rw-name') || '' }));
  };
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    switch (m.t) {
      case 'joined':
        S.joined = true; S.master = m.master;
        try { sessionStorage.setItem('rw-room', S.room); } catch {}
        $('join').hidden = true; $('pad').hidden = false;
        document.body.classList.add('landscape');
        showMode('wait', { title: 'Conectado!' });
        break;
      case 'err':
        S.joined = false;
        $('pad').hidden = true; $('join').hidden = false;
        document.body.classList.remove('landscape');
        $('err').textContent = m.reason === 'noroom' ? 'Sala não encontrada. Confira o código.' : 'Sala cheia (8 jogadores).';
        S.room = '';
        ws.onclose = null;
        ws.close();
        break;
      case 'role': S.master = m.master; break;
      case 'st': applyState(m); break;
      case 'vib': if (navigator.vibrate) navigator.vibrate(m.p); break;
      case 'pong': S.rtt = Math.round(performance.now() - m.ts); $('ping').style.color = S.rtt < 60 ? '#4dff88' : S.rtt < 140 ? '#ffd60a' : '#ff6b6b'; send({ t: 'rtt', ms: S.rtt }); break;
      case 'hostgone': showMode('wait', { title: 'Tela principal desconectada', sub: 'Aguardando reconexão…' }); break;
    }
  };
  ws.onclose = () => {
    if (!S.room) return;
    if (S.joined) showMode('wait', { title: 'Reconectando…' });
    setTimeout(connect, Math.min(3000, 300 * ++S.retry));
  };
  ws.onerror = () => ws.close();
}
const send = (o) => { if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify(o)); };

// ------------------------------------------------------------------ estados
function applyState(m) {
  S.master = m.master;
  document.body.style.background = m.color;
  document.documentElement.style.setProperty('--bg', m.color);
  $('who').textContent = m.name;
  $('pts').textContent = m.pts !== undefined && m.mode !== 'menu' && m.mode !== 'wait' ? `${m.pts} pts` : '';
  if (m.mode === 'drive') {
    $('drive').hidden = false; $('menu').hidden = true; $('msg').hidden = true;
    const [label, id] = (m.item || '').split('|');
    $('ico').textContent = { nitro: '🚀', mine: '💣', missile: '🎯', whomp: '🧲' }[id] || '';
    $('itl').textContent = label || '';
    $('firehint').textContent = m.item ? 'TOQUE PARA USAR' : 'SEM ITEM';
    S.mode = 'drive';
  } else if (m.mode === 'menu') {
    showMode('menu', m);
  } else if (m.mode === 'dead') {
    showMode('msg', { title: 'ELIMINADO', sub: `${m.pts} pontos · aguarde a próxima rodada` });
  } else showMode('wait', { title: m.title || 'Aguardando…', sub: m.master ? '' : 'O Master controla os menus' });
}

function showMode(kind, m) {
  $('drive').hidden = kind !== 'drive';
  $('menu').hidden = kind !== 'menu';
  $('msg').hidden = kind !== 'msg' && kind !== 'wait';
  S.mode = kind;
  S.steer = 0; S.fire = false;
  if (kind === 'menu') $('mtitle').textContent = m.title || '';
  if (kind === 'msg' || kind === 'wait') $('msg').innerHTML = `${m.title || ''}${m.sub ? `<small>${m.sub}</small>` : ''}`;
}

// ------------------------------------------------------------------ toque
const STEER_RANGE = 60, DEAD = 5;
let steerId = null, anchorX = 0;
const fireIds = new Set();

function sendInput() {
  if (!S.ws || S.ws.readyState !== 1 || !S.joined) return;
  const buttons = (S.fire ? BTN_FIRE : 0) | (document.hidden ? BTN_AWAY : 0);
  S.ws.send(encodeInput(S.steer, buttons, S.seq++, buf));
}

function touchStart(e) {
  if (S.mode !== 'drive') return;
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.clientX < innerWidth / 2) {
      if (steerId === null) {
        steerId = t.identifier; anchorX = t.clientX;
        const a = $('anchor'); a.style.display = 'block'; a.style.left = t.clientX + 'px'; a.style.top = t.clientY + 'px'; a.style.setProperty('--dx', '0px');
      }
    } else {
      fireIds.add(t.identifier);
      S.fire = true;
      $('drive').querySelector('.right').classList.add('flash');
      if (navigator.vibrate) navigator.vibrate(8);
    }
  }
  sendInput();
}
function touchMove(e) {
  if (S.mode !== 'drive') return;
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.identifier === steerId) {
      let dx = t.clientX - anchorX;
      dx = Math.abs(dx) < DEAD ? 0 : dx - Math.sign(dx) * DEAD;
      S.steer = Math.max(-1, Math.min(1, dx / (STEER_RANGE - DEAD)));
      $('anchor').style.setProperty('--dx', S.steer * 30 + 'px');
    }
  }
  sendInput();
}
function touchEnd(e) {
  for (const t of e.changedTouches) {
    if (t.identifier === steerId) { steerId = null; S.steer = 0; $('anchor').style.display = 'none'; }
    if (fireIds.delete(t.identifier) && fireIds.size === 0) { S.fire = false; $('drive').querySelector('.right').classList.remove('flash'); }
  }
  if (S.mode === 'drive') { e.preventDefault(); sendInput(); }
}
const opt = { passive: false };
document.addEventListener('touchstart', touchStart, opt);
document.addEventListener('touchmove', touchMove, opt);
document.addEventListener('touchend', touchEnd, opt);
document.addEventListener('touchcancel', touchEnd, opt);
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());

// mouse (teste no desktop): esquerda = arrastar, direita = clicar
let mouseDown = false;
document.addEventListener('mousedown', (e) => {
  if (S.mode !== 'drive') return;
  if (e.clientX < innerWidth / 2) { mouseDown = true; anchorX = e.clientX; }
  else { S.fire = true; sendInput(); }
});
document.addEventListener('mousemove', (e) => {
  if (!mouseDown) return;
  const dx = e.clientX - anchorX;
  S.steer = Math.max(-1, Math.min(1, dx / STEER_RANGE));
  sendInput();
});
document.addEventListener('mouseup', () => { mouseDown = false; S.steer = 0; S.fire = false; if (S.mode === 'drive') sendInput(); });

// botoes de menu (Master)
$('menu').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-k]');
  if (!b) return;
  if (navigator.vibrate) navigator.vibrate(12);
  send({ t: 'menu', k: b.dataset.k });
});

// tela cheia
$('fs').addEventListener('click', () => {
  const el = document.documentElement;
  (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el)?.then?.(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
});

// ------------------------------------------------------------------ entrada
function join() {
  const code = $('code').value.trim().toUpperCase();
  if (code.length !== 4) { $('err').textContent = 'O código tem 4 letras.'; return; }
  store('rw-name', $('name').value.trim());
  $('err').textContent = '';
  S.room = code;
  if (S.ws) { S.ws.onclose = null; S.ws.close(); }
  connect();
}
$('go').addEventListener('click', join);
$('code').addEventListener('keydown', (e) => e.key === 'Enter' && join());
$('name').value = store('rw-name') || '';
let saved = null;
try { saved = sessionStorage.getItem('rw-room'); } catch {}
const urlRoom = (params.get('room') || '').toUpperCase();
$('code').value = urlRoom || saved || '';
if (urlRoom.length === 4 || (saved && saved.length === 4)) join();

// heartbeat de entrada + ping
setInterval(() => { if (S.joined && S.mode === 'drive') sendInput(); }, 33);
setInterval(() => { if (S.joined && S.mode !== 'drive') sendInput(); }, 500);
setInterval(() => send({ t: 'ping', ts: performance.now() }), 2000);
document.addEventListener('visibilitychange', () => sendInput());
