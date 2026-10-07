// IA dos bots: seguem a linha de corrida (por dentro das curvas), desviam de carros, carcacas, pneus soltos, minas e
// arvores, evitam a borda do plateau e do precipicio, mantem a faixa da vaga na largada/spawn e usam itens.
// Tres dificuldades; no Facil o bot que esta na frente comete erros de vez em quando e alivia o ritmo se disparar
// (mais de `rubber.after` s na frente) ate o grupo chegar perto.
import { CAR } from './car.js';
import { ICE } from './items.js';
import { SURF_MU } from './track.js';

export const DIFFICULTY_LABEL = { easy: 'Fácil', medium: 'Médio', hard: 'Difícil' };
export const DIFFICULTY_ORDER = ['easy', 'medium', 'hard'];

/** Parametros por dificuldade (editaveis no painel de debug). */
export const DIFFICULTY = {
  easy: { skill: [0.42, 0.58], tau: 0.22, look: 0.8, noise: 1.0, avoid: 0.7, itemHold: [2.5, 6], leaderMistakes: true, mistakeEvery: [4, 9], mistakeDur: [0.6, 1.1], mistakeStrength: 0.8, nitroCurves: true, rubber: { after: 5, near: 0.8, throttle: 0.7, humanGap: 0.8, humanThrottle: 0.6 } },
  medium: { skill: [0.66, 0.8], tau: 0.1, look: 1.0, noise: 0.5, avoid: 1.0, itemHold: [0.8, 3.5], leaderMistakes: false, mistakeEvery: [8, 12], mistakeDur: [0.5, 1], mistakeStrength: 0.6, nitroCurves: false, rubber: { humanGap: 1.3, humanThrottle: 0.75 } },
  hard: { skill: [0.9, 1.0], tau: 0.04, look: 1.2, noise: 0.15, avoid: 1.3, itemHold: [0.3, 1.5], leaderMistakes: false, mistakeEvery: [8, 12], mistakeDur: [0.5, 1], mistakeStrength: 0.6, nitroCurves: false },
};

/** Ajustes gerais da IA (editaveis no painel de debug). */
export const AI = {
  lookBase: 12, // antecipacao fixa (u)
  lookSpeed: 0.5, // + por unidade de velocidade
  spawnTime: 3.2, // s depois do GO em que o bot segura a faixa da vaga
  racingLine: 0.55, // quanto corta por dentro das curvas
  edgeMargin: 4, // distancia da borda em que comeca a corrigir
  riskMargin: 9, // idem em trechos sem cerca / precipicio / area alta
  hazardRange: 14, // alcance de desvio de obstaculos (u)
  jumpAhead: 36, // pistas de mapa: salto da rota a menos disso a frente = nao freia nem muda de faixa (u)
  assistRange: 30, // pistas de mapa: distancia em que o bot passa a mirar no gatilho de um salto assistido (u)
  edgeSpeed: 0, // pistas de mapa: margem de borda extra por unidade de velocidade (u por u/s)
  edgeNarrow: 0.8, // pistas de mapa: a margem da borda nao passa dessa fracao da meia largura (0 desliga); corredor de 4 u nao aguenta 4 u de margem
  narrowHw: 3.2, // pistas de mapa: meia largura abaixo disso = corredor estreito (segue a linha central, sem variar de faixa)
  wallPush: 0.9, // pistas de mapa: forca do afastamento da parede (0 desliga)
  wallRange: 3.5, // pistas de mapa: distancia da parede em que o bot comeca a se afastar (u)
  latAccel: 40, // pistas de mapa: aceleracao lateral que o bot considera segura em curva (u/s^2; o carro faz ~47 no asfalto)
  brakeDecel: 17, // pistas de mapa: desaceleracao que o bot supoe ao planejar a frenagem (u/s^2; o carro freia ate 26)
  vMin: 13, // pistas de mapa: velocidade minima planejada numa curva (u/s)
  planLead: 0.12, // pistas de mapa: s de antecipacao da velocidade planejada (reacao da frenagem)
  blockTime: 0.9, // pistas de mapa: parado por tanto tempo, o bot engata re
  rayStep: 2.5, // pistas de mapa: passo dos sensores de distancia livre (u)
  rayBase: 9, // ...alcance fixo (u)
  raySpeed: 0.9, // ...+ por unidade de velocidade
  rayTurn: 0.45, // ...custo de desviar do rumo da rota (por rad)
  speedCap: 1, // pistas de mapa: fracao maxima da velocidade de cruzeiro
  centerOnly: 0, // pistas de mapa: 1 = sempre na linha central (sem variar de faixa)
  off: {}, // experimentos: { plan, gov, edge, lane } = true desliga cada ajuste
  reverseTime: 1.3, // ...e fica em re por tanto tempo
  progWin: 1.2, // pistas de mapa: janela (s) em que o bot confere se avancou...
  progMin: 2.5, // ...pelo menos isso (u); senao da re e tenta outra faixa
};

const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = (rng, [a, b]) => a + rng() * (b - a);

/** skill = 0..1 (null: sorteado pela dificuldade); level = 'easy' | 'medium' | 'hard'. */
export function makeBrain(rng, skill = null, level = 'medium') {
  const d = DIFFICULTY[level] || DIFFICULTY.medium;
  const sk = skill ?? pick(rng, d.skill);
  return {
    skill: sk, level, d,
    laneBias: (rng() - 0.5) * 0.9, // fracao da meia-largura
    hold: pick(rng, d.itemHold), // espera antes de usar item
    holdT: 0,
    wobbleT: rng() * 10,
    steerCmd: 0,
    round: -1, spawnT: 0, lane: 0, // faixa da vaga (largada/spawn)
    mistake: null, mistakeIn: pick(rng, d.mistakeEvery),
    aheadT: 0, slow: false, // Facil: tempo na frente / segurando o ritmo
    rng,
  };
}

/**
 * Pistas de mapa: velocidade maxima por ponto da linha central, pela curvatura (v = sqrt(latAccel / kappa)) e propagada para tras com a
 * desaceleracao de frenagem, para o bot ja chegar na curva na velocidade certa. Calculado uma vez por pista (e por parametros).
 */
const plans = new WeakMap();
function speedPlan(track) {
  const key = AI.latAccel + ':' + AI.brakeDecel + ':' + AI.vMin;
  const old = plans.get(track);
  if (old && old.key === key) return old.v;
  const N = track.N, ds = track.ds, W = 8;
  const v = new Float32Array(N), pa = { x: 0, z: 0, tx: 1, tz: 0, nx: 0, nz: 1, idx: 0 }, pb = { ...pa };
  for (let i = 0; i < N; i++) {
    const a = track.pointAt(i * ds - W, pa), ha = Math.atan2(a.tz, a.tx);
    const b = track.pointAt(i * ds + W, pb), hb = Math.atan2(b.tz, b.tx);
    const kappa = Math.abs(angDiff(hb, ha)) / (2 * W);
    v[i] = Math.max(AI.vMin, Math.sqrt(AI.latAccel / Math.max(kappa, 1e-4)));
  }
  for (let pass = 0; pass < 2; pass++) { // propaga a frenagem para tras (a pista e circular)
    for (let k = N * 2 - 1; k >= 0; k--) {
      const i = k % N, j = (i + 1) % N;
      v[i] = Math.min(v[i], Math.sqrt(v[j] * v[j] + 2 * AI.brakeDecel * ds));
    }
  }
  plans.set(track, { key, v });
  return v;
}

/** Pistas de mapa: distancia livre (ate maxD) a partir do carro no rumo `ang`: para na parede/degrau alto demais e no vazio/poco de morte. */
const WG = { y: 0, sec: 0, fof: -1, nx: 0, ny: 1, nz: 0 };
function rayClear(game, w, car, ang, maxD) {
  const step = AI.rayStep, cx = Math.cos(ang), cz = Math.sin(ang);
  let px = car.x, pz = car.z, y = car.y + 0.2;
  for (let d = step; d <= maxD + 1e-6; d += step) {
    const nx = car.x + cx * d, nz = car.z + cz * d;
    if (w.segmentBlocked(px, pz, nx, nz, y)) return d - step * 0.5;
    if (!game.groundOk(nx, nz, y)) return d - step * 0.5;
    w.groundAt(nx, nz, y, WG);
    y = Math.max(WG.y, car.y - 4) + 0.2;
    px = nx; pz = nz;
  }
  return maxD;
}
const RAY_OFFS = [0.2, -0.2, 0.42, -0.42, 0.7, -0.7, 1.05, -1.05];

const buf = [];
const LANE_OFFS = [-0.4, -0.2, 0, 0.2, 0.4];

const nwall = { nx: 0, nz: 0 };
const near0idx = (car) => (car.near ? car.near.idx : 0);

/** Retorna { steer, fire } para o bot. */
export function think(brain, car, game, dt) {
  const track = game.track, d = brain.d, skill = brain.skill;
  const near = car.near, hw = track.hwAt(near0idx(car)); 
  brain.wobbleT += dt;
  // renasceu: o volante, a faixa e os erros de antes nao valem mais
  if (brain.rc !== (car.respawns || 0)) { brain.rc = car.respawns || 0; brain.steerCmd = 0; brain.laneOff = 0; brain.mistake = null; brain.blockT = 0; brain.revT = 0; brain.pa = undefined; brain.noProg = 0; brain.nudgeT = 0; }
  if (car.freeze > 0 || (car.state !== 'run' && car.state !== 'grid')) { brain.steerCmd = 0; return { steer: 0, fire: false }; }
  const racing = game.state === 'RACING';
  if (!racing) { brain.steerCmd = 0; if (brain.round !== game.round) { brain.round = game.round; brain.spawnT = AI.spawnTime; brain.lane = clamp(near.d / hw, -0.7, 0.7); brain.mistake = null; } return { steer: 0, fire: false }; } // na grade/contagem fica parado

  // novo round: guarda a faixa da vaga e so abre depois que a fila se espalha
  if (brain.round !== game.round) {
    brain.round = game.round;
    brain.spawnT = AI.spawnTime;
    brain.lane = clamp(near.d / hw, -0.7, 0.7);
    brain.mistake = null;
    brain.steerCmd = 0;
    brain.aheadT = 0; brain.slow = false;
  }
  if (racing) brain.spawnT = Math.max(0, brain.spawnT - dt);
  const spawn = brain.spawnT / AI.spawnTime; // 1 -> 0

  const fx = Math.cos(car.h), fz = Math.sin(car.h);
  let look = (AI.lookBase + car.speed * AI.lookSpeed * (0.9 + 0.2 * skill)) * d.look;
  // pistas de mapa: curvatura logo a frente (rad/u). Curva fechada = olha menos longe (nao corta a quina) e freia
  let kappa = 0, jumpNear = false;
  if (track.map) {
    // trecho de salto logo a frente: o salto de rampa precisa de velocidade e do rumo da rota
    const n0 = near.idx, steps = Math.ceil(AI.jumpAhead / track.ds);
    for (let k = 0; k <= steps; k++) if (track.AIR[(n0 + k) % track.N]) { jumpNear = true; break; }
    const a = track.pointAt(near.s + 6), b = track.pointAt(near.s + 20);
    kappa = Math.abs(angDiff(Math.atan2(b.tz, b.tx), Math.atan2(a.tz, a.tx))) / 14;
    look *= clamp(1 - 4 * kappa, 0.4, 1);
  }
  const p = track.pointAt(near.s + look);
  const p2 = track.pointAt(near.s + look * 2);
  const turn = angDiff(Math.atan2(p2.tz, p2.tx), Math.atan2(p.tz, p.tx)); // > 0: vira para a direita

  // faixa alvo: preferencia do bot + linha de corrida (por dentro da curva); na largada, a faixa da vaga
  let lane = brain.laneBias * 0.6 + Math.sin(brain.wobbleT * 0.7) * (1 - skill) * 0.5 * d.noise;
  if (track.map && !AI.off.lane) lane *= 1 - clamp(kappa * 30, 0, 0.85); // curva fechada: nada de faixa externa (abre o raio e sai pela borda)
  lane += clamp(turn * 1.6, -0.55, 0.55) * AI.racingLine * skill;
  lane = lane * (1 - spawn) + brain.lane * spawn;
  // faixa menos cheia: entre algumas faixas proximas, escolhe a com mais espaco em volta (nao se amontoa no meio)
  if (spawn < 0.7) {
    let best = brain.laneOff || 0, bestCost = 1e9;
    for (const off of LANE_OFFS) {
      const cl = clamp(lane + off, -0.78, 0.78);
      let cost = 0.5 * Math.abs(off) + (off === (brain.laneOff || 0) ? 0 : 0.25); // histerese: so troca se compensar
      for (const o of game.cars) {
        if (o === car || !(o.alive || o.state === 'wreck') || !o.near || Math.abs(o.y - car.y) > 2.2) continue;
        const ds = o.progress - car.progress;
        if (ds < -10 || ds > 26) continue;
        cost += Math.max(0, 1 - Math.abs(o.near.d / hw - cl) * hw / 4.6) * (o.alive ? 1 : 1.6);
      }
      if (cost < bestCost) { bestCost = cost; best = off; }
    }
    brain.laneOff = best;
    lane += best * (1 - spawn);
  }
  if (track.map && brain.nudgeT > 0) { brain.nudgeT -= dt; lane += brain.nudge; } // depois de destravar: tenta outra faixa
  lane = clamp(lane, -0.78, 0.78);
  if (jumpNear) lane *= 0.25; // salto: segue a linha central
  const narrow = track.map && ((hw < AI.narrowHw && AI.narrowHw > 0) || AI.centerOnly);
  if (narrow) lane = 0; // corredor estreito: nao ha onde variar de faixa

  let tx = p.x + p.nx * lane * hw, tz = p.z + p.nz * lane * hw;
  // pistas de mapa: se a reta ate o alvo atravessa uma parede, mira mais perto
  if (track.map) {
    for (let k = 0; k < 2 && track.map.segmentWalled(car.x, car.z, tx, tz); k++) {
      const q = track.pointAt(near.s + look * (k ? 0.25 : 0.5));
      tx = q.x + q.nx * lane * hw; tz = q.z + q.nz * lane * hw;
    }
  }
  let aim = Math.atan2(tz - car.z, tx - car.x), clearBest = 1e9;
  if (track.map && !AI.off.ray && !car.air && !jumpNear && !brain.assist && car.speed > 4) {
    // sensores: o rumo da rota esta livre? senao escolhe o rumo livre mais proximo (e freia pela distancia livre)
    const maxD = AI.rayBase + car.speed * AI.raySpeed, w = track.map;
    let c0 = rayClear(game, w, car, aim, maxD);
    clearBest = c0;
    if (c0 < maxD * 0.85) {
      let bestScore = c0 / maxD, bestOff = 0;
      for (const off of RAY_OFFS) {
        const c = rayClear(game, w, car, aim + off, maxD);
        const score = c / maxD - AI.rayTurn * Math.abs(off);
        if (score > bestScore) { bestScore = score; bestOff = off; clearBest = c; }
      }
      aim += bestOff;
    }
  }
  brain.clear = clearBest;
  let steer = clamp(angDiff(aim, car.h) * (1.7 + skill), -1, 1);

  const steerLine = steer;
  // desvios: empurra o volante para longe do obstaculo a frente (peso maior perto)
  const range = AI.hazardRange + car.speed * 0.15;
  const avoid = (ox, oz, r, w = 1, ovx = 0, ovz = 0, isCar = false) => {
    const dx = ox - car.x, dz = oz - car.z;
    const ahead = dx * fx + dz * fz, lat = -dx * fz + dz * fx; // lat > 0: obstaculo a direita
    if (ahead < -2 || ahead > range) return;
    const reach = r + (isCar ? 2.8 : 2.2);
    if (Math.abs(lat) >= reach) return;
    // so desvia de quem esta mais lento que eu (parado/lento): carros na mesma velocidade seguem em fila
    const closing = (car.vx - ovx) * fx + (car.vz - ovz) * fz;
    const rel = clamp(closing / 6, isCar ? 0.3 : 0, 1); // carros: sempre um minimo (nada de bater em quem vai na mesma velocidade)
    const sideBySide = Math.abs(ahead) < 3.2 && Math.abs(lat) < 3.6; // lado a lado: afasta
    const wt = sideBySide ? Math.max(rel, 0.6) : rel;
    if (wt <= 0.01) return;
    const side = Math.abs(lat) < 0.25 ? (car.id % 2 ? 1 : -1) : Math.sign(lat);
    steer -= side * (1 - Math.max(0, ahead) / range) * (1 - Math.abs(lat) / reach) * w * wt * d.avoid * (1 + spawn);
  };
  for (const o of game.cars) {
    if (o === car || o.state === 'dead' || o.state === 'falling') continue;
    if (Math.abs(o.y - car.y) > 2.2) continue;
    // carros vivos pesam mais na largada (a fila ainda esta junta); carcacas e cubos de gelo sao obstaculos parados
    avoid(o.x, o.z, 1.6, o.alive && o.freeze <= 0 ? 1 : 1.2, o.vx, o.vz, true);
  }
  for (const w of game.wheels) if (!w.dead) avoid(w.x, w.z, 0.7, 0.8);
  for (const m of game.items.mines) avoid(m.x, m.z, 2.1, 1.1);
  if (track.scenery) {
    const list = track.scenery.query(car.x + fx * 8, car.z + fz * 8, 12, buf);
    for (const o of list) if (car.y <= (o.top ?? 99)) avoid(o.x, o.z, o.r, 0.9);
  }

  const steerAvoid = steer - steerLine;
  // borda: mais cuidado onde nao ha cerca, no plateau e ao lado do precipicio
  const idx = near.idx;
  const side = near.d > 0 ? 1 : -1;
  // em pistas de mapa ELEV e a altura ABSOLUTA do piso (quase sempre > 1,2): nao significa plateau; a parede de verdade vem do mapa
  const risky = track.map ? false : track.RAILS[idx] === 0 || track.ELEV[idx] > 1.2 || track.CH[idx] === side || track.CH[idx] === 2;
  const margin0 = (risky ? AI.riskMargin : AI.edgeMargin) + (track.map ? AI.edgeSpeed * car.speed : 0);
  const margin = track.map && AI.edgeNarrow > 0 ? Math.min(margin0, Math.max(1.2, hw * AI.edgeNarrow)) : margin0;
  const edge = hw + track.verge - Math.abs(near.d);
  if (edge < margin) {
    let k = side * (risky ? 1 : 0.7) * (1 - Math.max(0, edge) / margin) * (edge < 0 ? 1.5 : 1);
    if (track.map && !AI.off.edge) {
      // pistas de mapa: fora da estrada o alvo da linha ja manda de volta (empurrar para o lado contrario so anula o volante e o carro
      // segue reto para o campo); dentro dela o empurrao so vale se o carro aponta para a borda
      const out = side * Math.sin(angDiff(car.h, Math.atan2(near.tz, near.tx)));
      k = edge < 0 ? 0 : k * (0.35 + 0.65 * clamp(out * 3, 0, 1));
    }
    steer -= k;
  }
  if (track.map) {
    // parede do mapa ao redor (as mesmas que o carro enfrenta): empurra o volante para longe da que esta a frente/ao lado
    const wr = Math.min(AI.wallRange, Math.max(1.4, hw * 0.9)); // em corredor estreito as duas paredes caem no alcance: reduz para nao oscilar
    const wd = track.map.nearestWall(car.x, car.z, car.y + 0.05, wr, nwall);
    if (wd < wr) {
      const lat = -nwall.nx * fz + nwall.nz * fx, ahead = nwall.nx * fx + nwall.nz * fz; // lat > 0: parede a direita
      if (ahead > -0.35) steer -= Math.sign(lat || (car.id % 2 ? 1 : -1)) * AI.wallPush * (1 - wd / wr) * Math.min(1, 0.4 + Math.abs(lat) + Math.max(0, ahead) * 0.5);
    }
  }
  if (track.map && track.assists.length) {
    // salto assistido (liga dois pontos que o mapa original vence com rampa/degrau alto/vao): o carro so decola se passar a menos de
    // `r` do gatilho no rumo do salto, entao o bot se alinha e mira nele
    let best = null, bd = 1e9;
    for (const a of track.assists) {
      const dx = a.x - car.x, dz = a.z - car.z, dist = Math.hypot(dx, dz);
      if (dist > AI.assistRange || dist < 0.5 || (dx * fx + dz * fz) / dist < 0.2) continue; // longe ou atras
      if (a.f !== undefined) { // salto de outra perna da pista que cruza aqui
        let sep = Math.abs(near.s - a.f * track.length);
        sep = Math.min(sep, track.length - sep);
        if (sep > 40) continue;
      }
      if (a.f === undefined && (dx * a.dx + dz * a.dz) / dist < 0.3) continue; // dados antigos: o gatilho tem que estar no sentido do salto
      if (dist < bd) { bd = dist; best = a; }
    }
    if (best) {
      const aligned = ((best.x - car.x) * best.dx + (best.z - car.z) * best.dz) / (bd || 1) > 0.5;
      const back = aligned ? clamp(bd * 0.4, 0, 8) : 0; // longe e alinhado: mira um pouco antes, para chegar no rumo; em cotovelo, direto no gatilho
      const ax = best.x - best.dx * back, az = best.z - best.dz * back;
      steer = clamp(angDiff(Math.atan2(az - car.z, ax - car.x), car.h) * (1.7 + skill), -1, 1);
      brain.assist = best;
    } else brain.assist = null;
  }
  brain.dbg = { line: steerLine, avoid: steerAvoid, edge: steer - steerLine - steerAvoid, lane, turn, spawn };
  // no ar nao ha o que fazer: segura reto para pousar alinhado (em mapa, alinha com o rumo da pista: queda pequena nao zera o volante)
  if (car.air) steer = track.map ? clamp(angDiff(Math.atan2(near.tz, near.tx), car.h) * 1.5, -0.6, 0.6) : 0;

  // erros do Facil: o bot que esta na frente escorrega de vez em quando
  if (d.leaderMistakes && racing && game.leaderId() === car.id && !car.air) {
    brain.mistakeIn -= dt;
    if (!brain.mistake && brain.mistakeIn <= 0) {
      brain.mistake = { t: pick(brain.rng, d.mistakeDur), dir: brain.rng() < 0.5 ? -1 : 1, kind: brain.rng() < 0.65 ? 'drift' : 'late' };
    }
  }
  if (brain.mistake) {
    const m = brain.mistake;
    m.t -= dt;
    if (m.kind === 'drift') steer = clamp(steer * 0.3 + m.dir * d.mistakeStrength, -1, 1); // sai da linha
    else steer *= 0.2; // "dorme" na curva
    if (m.t <= 0) { brain.mistake = null; brain.mistakeIn = pick(brain.rng, d.mistakeEvery); }
  }

  // Facil/Medio: bot que abriu vantagem sobre os jogadores REAIS alivia o ritmo ate eles chegarem perto
  const rb = d.rubber;
  if (rb && racing) {
    const rank = game.ranking();
    let bestH = -Infinity;
    for (const o of rank) if (!o.isBot && o.alive && o.progress > bestH) bestH = o.progress;
    if (bestH > -Infinity) {
      const gapH = (car.progress - bestH) / Math.max(car.speed, 12); // s a frente do humano mais adiantado
      if (gapH > rb.humanGap) brain.slowH = true; else if (gapH < rb.humanGap * 0.6) brain.slowH = false;
      brain.aheadT = 0; brain.slow = false;
    } else if (rb.after !== undefined) {
      // so bots na pista: o Facil segura o lider em relacao a media do grupo
      brain.slowH = false;
      let sum = 0, n = 0;
      for (const o of rank) if (o.id !== car.id) { sum += o.progress; n++; }
      const gapT = n ? (car.progress - sum / n) / Math.max(car.speed, 12) : 0; // s a frente da media do grupo
      if (rank[0] === car && gapT > rb.near) brain.aheadT += dt; else if (gapT < rb.near * 0.5 || rank[0] !== car) { brain.aheadT = 0; brain.slow = false; }
      if (brain.aheadT > rb.after) brain.slow = true;
    }
  } else { brain.slow = false; brain.slowH = false; }
  car.throttle = brain.slowH ? d.rubber.humanThrottle : brain.slow ? d.rubber.throttle : 1;
  // pistas de mapa: freia nas curvas fechadas (velocidade segura pela curvatura)
  if (track.map && !jumpNear && !AI.off.plan) {
    const plan = speedPlan(track), N = track.N;
    const vp = plan[(near.idx + Math.round(car.speed * AI.planLead / track.ds)) % N];
    const mu = SURF_MU[car.surf || 0] ?? 1; // terra/grama: menos aderencia lateral
    car.throttle = Math.min(car.throttle, clamp(vp * Math.sqrt(Math.min(1, mu)) / CAR.cruise, 0.2, 1));
  }
  if (track.map && AI.speedCap < 1) car.throttle = Math.min(car.throttle, AI.speedCap);
  if (track.map && clearBest < 1e8) car.throttle = Math.min(car.throttle, clamp(Math.sqrt(2 * AI.brakeDecel * Math.max(0, clearBest - 3)) / CAR.cruise, 0.25, 1));
  if (track.map && !AI.off.gov) {
    // governador de subesterco: volante no limite e o carro ainda correndo = a curva e mais fechada do que o plano achou; tira o pe ate fechar
    const sat = Math.abs(steer) > 0.9 && car.speed > 16 && !car.air && !jumpNear;
    brain.satT = sat ? Math.min(2, (brain.satT || 0) + dt) : Math.max(0, (brain.satT || 0) - dt * 1.5);
    if (brain.satT > 0.12) car.throttle = Math.min(car.throttle, clamp(1 - 0.5 * (brain.satT - 0.12), 0.35, 1));
  }

  steer = clamp(steer, -1, 1);
  // pistas de mapa: parado (encostado em parede/encaixado) engata re e sai virando o nariz para a linha
  let rev = false;
  if (track.map) {
    if (car.speed < 2 && car.state === 'run') brain.blockT = (brain.blockT || 0) + dt; else if (car.speed > 4) brain.blockT = 0;
    // sem progresso (vai-e-vem na parede, rodando fora da pista, preso em outro carro): a cada janela confere o quanto avancou e escala a manobra
    if (brain.pa === undefined || car.air || car.finished) { brain.pa = car.progress; brain.pw = 0; } else if ((brain.pw += dt) >= AI.progWin) {
      brain.noProg = car.progress - brain.pa < AI.progMin ? (brain.noProg || 0) + 1 : 0;
      brain.pa = car.progress; brain.pw = 0;
      if (brain.noProg > 0 && !((brain.revT || 0) > 0)) {
        brain.revT = AI.reverseTime * (1 + 0.5 * Math.min(2, brain.noProg - 1));
        brain.nudge = (brain.noProg % 2 ? 1 : -1) * 0.5 * (brain.noProg > 2 ? 1.3 : 1); brain.nudgeT = 4;
      }
    }
    if ((brain.blockT || 0) > AI.blockTime) { brain.revT = AI.reverseTime; brain.blockT = 0; }
    if ((brain.revT || 0) > 0) { brain.revT -= dt; rev = true; steer = -steer; car.throttle = 1; } // em re o volante age ao contrario
  }
  // reflexo: o volante nao salta de um valor para outro (mais lento no Facil)
  brain.steerCmd += (steer - brain.steerCmd) * (1 - Math.exp(-dt / Math.max(0.001, d.tau * (1 - 0.7 * spawn)))); // controle alto na largada
  steer = rev ? steer : brain.steerCmd;
  if (rev) brain.steerCmd = steer;

  let fire = false;
  if (car.item && !car.locked && car.state === 'run') {
    brain.holdT += dt;
    if (brain.holdT > brain.hold) {
      const rank = game.ranking();
      const i = rank.findIndex((c) => c.id === car.id);
      let ok = false;
      if (car.item === 'nitro') {
        // reta e sem borda perigosa a frente (no Facil nem olha a curva)
        const p3 = track.pointAt(near.s + 60);
        const bend = Math.abs(angDiff(Math.atan2(p3.tz, p3.tx), Math.atan2(near.tz, near.tx)));
        ok = Math.abs(steer) < 0.25 && !car.air && (d.nitroCurves || bend < 0.3) && !risky;
      } else if (car.item === 'mine') ok = i >= 0 && i < rank.length - 1 && rank[i + 1] && Math.abs(rank[i + 1].progress - car.progress) < 30;
      else if (car.item === 'missile') {
        // o missil vai reto: so atira com alguem na linha de tiro
        ok = rank.some((c) => {
          if (c.id === car.id) return false;
          const dx = c.x - car.x, dz = c.z - car.z;
          const ahead = dx * fx + dz * fz, lat = Math.abs(-dx * fz + dz * fx);
          return ahead > 6 && ahead < 70 && lat < 2.4;
        });
      } else if (car.item === 'whomp') ok = rank.some((c) => c.id !== car.id && Math.hypot(c.x - car.x, c.z - car.z) < 13);
      else if (car.item === 'ice') {
        // o morteiro cai ICE.range u a frente: atira se ha carros por la (raio de 9 u)
        const tx2 = car.x + fx * ICE.range, tz2 = car.z + fz * ICE.range;
        ok = rank.some((c) => c.id !== car.id && c.freeze <= 0 && Math.hypot(c.x - tx2, c.z - tz2) < 8);
      }
      if (ok) { fire = true; brain.holdT = 0; brain.hold = pick(brain.rng, d.itemHold); }
    }
  }
  return { steer, fire, rev };
}

