// Interface DOM do host: menus, HUD, banners, rotulos e marcadores de perigo.
import qrcode from 'qrcode';
import { COLORS, ITEM_ICON } from '/shared/protocol.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function qrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 6, margin: 0, scalable: true });
}

export class UI {
  constructor() {
    this.screen = $('screen');
    this.hud = $('hud');
    this.bannerEl = $('banner');
    this.labelsEl = $('labels');
    this.nav = () => {};
    this.chips = new Map();
    this.labelEls = new Map();
    this.dangerEls = new Map();
    this.bannerTimer = 0;
    this.screen.addEventListener('click', (e) => {
      const t = e.target.closest('[data-nav]');
      if (t) this.nav(t.dataset.nav, t.dataset.i !== undefined ? Number(t.dataset.i) : undefined);
    });
    const p = new URLSearchParams(location.search).get('safe');
    if (p) {
      const [t, r, b, l] = p.split(',').map((n) => `${Number(n) || 0}px`);
      const s = document.documentElement.style;
      s.setProperty('--u-t', t); s.setProperty('--u-r', r); s.setProperty('--u-b', b); s.setProperty('--u-l', l);
    }
  }

  clear() { this.screen.innerHTML = ''; }

  splash() {
    this.screen.innerHTML = `<div class="scr" data-nav="ok">
      <div class="logo">RACING<br>WARS<small>ATÉ 8 JOGADORES · CELULAR É O CONTROLE</small></div>
      <button class="btn" data-nav="ok">▶ CLIQUE PARA COMEÇAR</button>
      <a class="btn btn2" href="editor/" onclick="event.stopPropagation()">🗺 EDITOR DE MAPA</a>
      <div class="hint">Isto libera o som. Depois escaneie o QR Code com o celular.</div></div>`;
  }

  lobby(o) {
    const slots = o.slots.map((s, i) => {
      if (!s) return `<div class="slot" style="--c:${COLORS[i].hex}"><span class="dot" style="opacity:.25"></span><span style="opacity:.4">livre</span></div>`;
      const tag = s.kind === 'phone' ? (s.master ? '👑 MASTER' : '📱') : s.kind === 'bot' ? '🤖 BOT' : '⌨ TECLADO';
      return `<div class="slot on" style="--c:${COLORS[i].hex}"><span class="dot"></span>${esc(s.name)}<span class="tag">${tag}${s.connected === false ? ' · off' : ''}</span></div>`;
    }).join('');
    this.screen.innerHTML = `<div class="scr">
      <div class="logo" style="font-size:min(7vw,70px)">RACING WARS</div>
      <div class="lobby">
        <div style="display:flex;flex-direction:column;gap:10px;align-items:center">
          <div class="qr">${o.qr}</div>
          <div class="hint">Sala</div><div class="code">${o.code}</div>
          <div class="url">${esc(o.padUrl)}</div>
          ${o.ips > 1 ? `<div class="hint">IP errado? Aperte <b>I</b> para trocar (${o.ipIdx + 1}/${o.ips})</div>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;gap:14px;align-items:center">
          <div class="slots">${slots}</div>
          <div class="hint">Bots: <b>${o.bots}</b> &nbsp; <button class="btn" style="font-size:16px;padding:6px 16px" data-nav="left">−</button> <button class="btn" style="font-size:16px;padding:6px 16px" data-nav="right">+</button>
            &nbsp; Teclado (<b>K</b>): <b>${o.kbd ? 'ligado' : 'desligado'}</b></div>
          <div class="hint">Dificuldade dos bots (<b>G</b> ou ▲▼): <button class="btn" style="font-size:16px;padding:6px 16px" data-nav="up">${o.difficulty} ▸</button></div>
          <div class="hint">Câmera (<b>C</b>): <button class="btn" style="font-size:16px;padding:6px 16px" data-nav="cam">${o.cam === 'split' ? '🎮 Tela dividida (kart) ▸' : '🎥 Estilo atual ▸'}</button></div>
          <button class="btn" data-nav="ok">ESCOLHER COPA ▶</button>
          <div class="hint">${o.masterName ? `<b>${esc(o.masterName)}</b> (Master) controla os menus pelo celular.` : 'Conecte um celular para ser o Master, ou use o teclado (Enter).'}</div>
        </div>
      </div></div>`;
  }

  cups(list, sel) {
    this.screen.innerHTML = `<div class="scr"><h2>Escolha a copa</h2>
      <div class="cards">${list.map((c, i) => `<div class="card ${i === sel ? 'sel' : ''}" data-nav="pick" data-i="${i}"><h3>${c.icon} ${c.name}</h3><p>${c.desc}</p></div>`).join('')}</div>
      <div class="hint"><b>◀ ▶</b> escolher · <b>OK</b> confirmar · <b>VOLTAR</b> lobby</div>
      <button class="btn" data-nav="ok">CONFIRMAR</button></div>`;
  }

  tracks(list, sel) {
    this.screen.innerHTML = `<div class="scr"><h2>Escolha o circuito</h2>
      <div class="cards">${list.map((c, i) => `<div class="card ${i === sel ? 'sel' : ''} ${c.locked ? 'lock' : ''}" data-nav="pick" data-i="${i}"><h3>${c.icon} ${c.name}</h3><p>${c.desc}</p></div>`).join('')}</div>
      <div class="hint"><b>◀ ▶</b> escolher · <b>OK</b> largar · <b>VOLTAR</b> copas</div>
      <button class="btn" data-nav="ok">LARGAR!</button></div>`;
  }

  pause() {
    this.screen.innerHTML = `<div class="scr clear"><h2 style="font-size:60px">PAUSADO</h2><button class="btn" data-nav="ok">CONTINUAR</button><button class="btn" data-nav="back" style="background:#ff6b6b;box-shadow:0 6px 0 #a33">SAIR DA PARTIDA</button></div>`;
  }

  results(rows, title, reason) {
    const body = rows.map((r, i) => `<tr class="${i === 0 ? 'first' : ''}" style="--c:${COLORS[r.color].hex}"><td>${i === 0 ? '🏆' : i + 1 + 'º'}</td><td><span class="dot"></span>${esc(r.name)}</td><td>${r.points} pts</td></tr>`).join('');
    this.screen.innerHTML = `<div class="scr"><div class="logo" style="font-size:min(9vw,84px)">${esc(title)}</div>
      <div class="hint">${reason === 'points' ? 'Chegou ao máximo de pontos!' : 'Fim das 3 voltas — vence quem tem mais pontos.'}</div>
      <table class="table">${body}</table><button class="btn" data-nav="ok">VOLTAR AO LOBBY</button></div>`;
  }

  // ---------- HUD ----------
  initHud(game, names) {
    this.vpRoot = null; this.vpEls = null; this.vpKey = '';
    this.hud.innerHTML = '<div class="cards"></div><div class="lap"><b>LAP <span class="lapn">1/3</span></b><small class="info"></small></div><div class="kill"></div>';
    this.chips.clear();
    const top = this.hud.querySelector('.cards');
    const GLYPH = ['▲', '●', '■', '◆', '★', '✚', '⬢', '♥'];
    for (const c of game.cars) {
      const el = document.createElement('div');
      el.className = 'card-p';
      el.style.setProperty('--c', COLORS[c.color].hex);
      const ticks = Array.from({ length: 10 }, () => '<i></i>').join('');
      el.innerHTML = `<div class="av">${GLYPH[c.color % 8]}</div><div class="bd"><div class="l1"><span class="nm">${esc(names.get(c.id) || 'Piloto')}</span><span class="rk"></span><span class="it"></span></div><div class="bar">${ticks}</div></div>`;
      top.appendChild(el);
      this.chips.set(c.id, { el, it: el.querySelector('.it'), rk: el.querySelector('.rk'), ticks: [...el.querySelectorAll('.bar i')], last: -1 });
    }
    this.info = this.hud.querySelector('.info');
    this.killEl = this.hud.querySelector('.kill');
    for (const e of this.labelEls.values()) e.remove();
    for (const e of this.dangerEls.values()) e.remove();
    this.labelEls.clear();
    this.dangerEls.clear();
    for (const c of game.cars) {
      this.labelEls.set(c.id, null); // sem nametags sobre os carros
      const d = document.createElement('div');
      d.className = 'danger';
      d.style.color = d.style.borderColor = COLORS[c.color].hex;
      d.style.display = 'none';
      this.labelsEl.appendChild(d);
      this.dangerEls.set(c.id, d);
    }
  }

  clearHud() {
    this.vpRoot = null; this.vpEls = null; this.vpKey = '';
    document.body.classList.remove('split');
    this.hud.innerHTML = '';
    this.labelsEl.innerHTML = '';
    this.chips.clear();
    this.labelEls.clear();
    this.dangerEls.clear();
  }

  /** Colocacao: vivos por progresso; mortos por ordem inversa de morte. */
  order(game) {
    const alive = game.ranking().map((c) => c.id);
    const dead = game.deaths.slice().reverse().filter((id) => !alive.includes(id));
    const order = [...alive, ...dead];
    for (const c of game.cars) if (!order.includes(c.id)) order.push(c.id);
    return order;
  }

  updateHud(game) {
    const order = this.order(game);
    const ord = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];
    for (const c of game.cars) {
      const ch = this.chips.get(c.id);
      if (!ch) continue;
      const pts = game.points.get(c.id);
      if (ch.last !== pts) {
        if (ch.last >= 0) { ch.el.classList.add('pop'); setTimeout(() => ch.el.classList.remove('pop'), 350); }
        ch.ticks.forEach((t, i) => t.classList.toggle('on', i < pts));
        ch.last = pts;
      }
      ch.el.classList.toggle('dead', !c.alive);
      const pos = order.indexOf(c.id);
      ch.el.style.order = pos;
      ch.rk.textContent = ord[pos] || '';
      const ic = c.alive && c.item ? c.item : '';
      if (ch.itKind !== ic) { ch.itKind = ic; if (ic === 'mine') ch.it.innerHTML = '<span class="mine-ico"></span>'; else ch.it.textContent = ic ? ITEM_ICON[ic] : ''; }
    }
    const lead = game.ranking()[0];
    const lap = lead ? Math.min(game.lapOf(lead), 3) : 1;
    this.hud.querySelector('.lapn').textContent = `${lap}/3`;
    this.info.textContent = `Rodada ${game.round} · ${game.aliveCars().length} vivos`;
  }

  killfeed(text, color) {
    if (!this.killEl) return;
    const s = document.createElement('span');
    s.innerHTML = `<b style="color:${color}">●</b> ${esc(text)}`;
    this.killEl.appendChild(s);
    setTimeout(() => s.remove(), 4200);
    while (this.killEl.children.length > 5) this.killEl.firstChild.remove();
  }

  updateLabels(game, project, cam) {
    const W = innerWidth, H = innerHeight;
    for (const c of game.cars) {
      const d = this.dangerEls.get(c.id);
      if (!d) continue;
      if (!c.alive || c.hidden) { d.style.display = 'none'; continue; }
      // perigo: o carro esta perto de ficar para tras (borda de baixo) ou de sair pelos lados
      const r = game.state === 'RACING' ? Math.max(cam.edgeRatio(c.x, c.z, c.y), game.offroadRatio(c)) : 0;
      if (r > 0.72) {
        const q = project(c.x, c.y, c.z);
        const m = 30;
        d.style.display = 'block';
        d.style.left = Math.max(m, Math.min(W - m, q.behind ? W / 2 : q.x)) + 'px';
        d.style.top = (q.behind ? H - m : Math.max(m, Math.min(H - m, q.y))) + 'px';
      } else d.style.display = 'none';
    }
  }

  /** Esconde os avisos de perigo da camera compartilhada (na tela dividida cada celula tem o seu). */
  hideDanger() { for (const d of this.dangerEls.values()) d.style.display = 'none'; }

  // ---------- tela dividida ----------
  /**
   * Monta/atualiza o HUD de cada celula. cells: [{ id, rect, warn }]; spare = retangulo livre (classificacao) ou null.
   * Sem cells (modo normal) remove tudo e devolve o HUD de sempre.
   */
  splitHud(game, cells, spare, names) {
    document.body.classList.toggle('split', !!cells);
    const cardsEl = this.hud.querySelector('.cards');
    if (cardsEl) {
      if (cells && spare) Object.assign(cardsEl.style, { left: spare.x + 8 + 'px', top: spare.y + 8 + 'px', display: 'flex', maxHeight: spare.h - 16 + 'px' });
      else if (cells) cardsEl.style.display = 'none';
      else { cardsEl.style.left = cardsEl.style.top = cardsEl.style.maxHeight = ''; cardsEl.style.display = ''; }
    }
    if (!cells) { if (this.vpRoot) { this.vpRoot.remove(); this.vpRoot = null; this.vpEls = null; this.vpKey = ''; } return; }
    const key = cells.map((c) => `${c.id}:${c.rect.x | 0},${c.rect.y | 0},${c.rect.w | 0},${c.rect.h | 0}`).join('|');
    if (!this.vpRoot) { this.vpRoot = document.createElement('div'); this.vpRoot.id = 'vps'; this.hud.appendChild(this.vpRoot); }
    if (key !== this.vpKey) {
      this.vpKey = key;
      this.vpRoot.innerHTML = '';
      this.vpEls = new Map();
      for (const c of cells) {
        const car = game.carById(c.id);
        const el = document.createElement('div');
        el.className = 'vp';
        el.style.cssText = `left:${c.rect.x}px;top:${c.rect.y}px;width:${c.rect.w}px;height:${c.rect.h}px;--c:${COLORS[car ? car.color : c.id].hex}`;
        el.innerHTML = '<div class="vp-top"><span class="vp-name"></span><span class="vp-lap"></span></div><div class="vp-rank"></div><div class="vp-item"></div><div class="vp-pts"></div><div class="vp-warn">⚠ VOLTE PARA O PELOTÃO!</div>';
        this.vpRoot.appendChild(el);
        this.vpEls.set(c.id, { el, name: el.querySelector('.vp-name'), lap: el.querySelector('.vp-lap'), rank: el.querySelector('.vp-rank'), item: el.querySelector('.vp-item'), pts: el.querySelector('.vp-pts'), warn: el.querySelector('.vp-warn') });
      }
    }
    const order = this.order(game);
    const ord = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];
    for (const c of cells) {
      const e = this.vpEls.get(c.id), car = game.carById(c.id);
      if (!e || !car) continue;
      const nm = names.get(c.id) || 'Piloto';
      if (e.name.textContent !== nm) e.name.textContent = nm;
      e.lap.textContent = `LAP ${Math.min(game.lapOf(car), game.track.def.laps ?? 3)}/${game.track.def.laps ?? 3}`;
      e.rank.textContent = car.alive ? ord[order.indexOf(c.id)] || '' : '✖';
      e.rank.classList.toggle('dead', !car.alive);
      const ic = car.alive && car.item ? car.item : '';
      if (e.itemKind !== ic) { e.itemKind = ic; if (ic === 'mine') e.item.innerHTML = '<span class="mine-ico"></span>'; else e.item.textContent = ic ? ITEM_ICON[ic] : ''; e.item.classList.toggle('on', !!ic); }
      const pts = game.points.get(c.id) ?? 0;
      if (e.ptsV !== pts) { e.ptsV = pts; e.pts.textContent = '●'.repeat(pts) + '○'.repeat(Math.max(0, 10 - pts)); }
      e.warn.style.display = c.warn ? 'block' : 'none';
    }
  }

  /** Aviso curto no topo da tela (ex.: troca de camera). */
  toast(text, ms = 1400) {
    if (!this.toastEl) { this.toastEl = document.createElement('div'); this.toastEl.id = 'toast'; document.body.appendChild(this.toastEl); }
    this.toastEl.textContent = text;
    this.toastEl.classList.add('on');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('on'), ms);
  }

  // ---------- banner ----------
  banner(html, ms = 0) {
    this.bannerEl.innerHTML = html;
    clearTimeout(this.bannerTimer);
    if (ms) this.bannerTimer = setTimeout(() => (this.bannerEl.innerHTML = ''), ms);
  }
  bannerClear() { clearTimeout(this.bannerTimer); this.bannerEl.innerHTML = ''; }
}
