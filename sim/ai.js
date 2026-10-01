// IA dos bots: seguem a linha de corrida (por dentro das curvas), desviam de carros, carcacas, pneus soltos, minas e
// arvores, evitam a borda do plateau e do precipicio, mantem a faixa da vaga na largada/spawn e usam itens.
// Tres dificuldades; no Facil o bot que esta na frente comete erros de vez em quando e alivia o ritmo se disparar
// (mais de `rubber.after` s na frente) ate o grupo chegar perto.
import { CAR } from './car.js';

export const DIFFICULTY_LABEL = { easy: 'Fácil', medium: 'Médio', hard: 'Difícil' };
export const DIFFICULTY_ORDER = ['easy', 'medium', 'hard'];

/** Parametros por dificuldade (editaveis no painel de debug). */
export const DIFFICULTY = {
  easy: { skill: [0.42, 0.58], tau: 0.22, look: 0.8, noise: 1.0, avoid: 0.7, itemHold: [2.5, 6], leaderMistakes: true, mistakeEvery: [4, 9], mistakeDur: [0.7, 1.4], mistakeStrength: 0.95, nitroCurves: true, rubber: { after: 5, near: 0.8, throttle: 0.7 } },
  medium: { skill: [0.66, 0.8], tau: 0.1, look: 1.0, noise: 0.5, avoid: 1.0, itemHold: [0.8, 3.5], leaderMistakes: false, mistakeEvery: [8, 12], mistakeDur: [0.5, 1], mistakeStrength: 0.6, nitroCurves: false },
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

const buf = [];
const LANE_OFFS = [-0.4, -0.2, 0, 0.2, 0.4];

/** Retorna { steer, fire } para o bot. */
export function think(brain, car, game, dt) {
  const track = game.track, d = brain.d, skill = brain.skill;
  const near = car.near, hw = track.halfWidth;
  brain.wobbleT += dt;
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
  const look = (AI.lookBase + car.speed * AI.lookSpeed * (0.9 + 0.2 * skill)) * d.look;
  const p = track.pointAt(near.s + look);
  const p2 = track.pointAt(near.s + look * 2);
  const turn = angDiff(Math.atan2(p2.tz, p2.tx), Math.atan2(p.tz, p.tx)); // > 0: vira para a direita

  // faixa alvo: preferencia do bot + linha de corrida (por dentro da curva); na largada, a faixa da vaga
  let lane = brain.laneBias * 0.6 + Math.sin(brain.wobbleT * 0.7) * (1 - skill) * 0.5 * d.noise;
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
  lane = clamp(lane, -0.78, 0.78);

  const tx = p.x + p.nx * lane * hw, tz = p.z + p.nz * lane * hw;
  let steer = clamp(angDiff(Math.atan2(tz - car.z, tx - car.x), car.h) * (1.7 + skill), -1, 1);

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
  const risky = track.RAILS[idx] === 0 || track.ELEV[idx] > 1.2 || track.CH[idx] === side || track.CH[idx] === 2;
  const margin = risky ? AI.riskMargin : AI.edgeMargin;
  const edge = hw + track.verge - Math.abs(near.d);
  if (edge < margin) steer -= side * (risky ? 1 : 0.7) * (1 - Math.max(0, edge) / margin) * (edge < 0 ? 1.5 : 1);
  brain.dbg = { line: steerLine, avoid: steerAvoid, edge: steer - steerLine - steerAvoid, lane, turn, spawn };
  // no ar nao ha o que fazer: segura reto para pousar alinhado
  if (car.air) steer = 0;

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

  // Facil: se esta na frente por mais de `rubber.after` s, alivia o ritmo ate o grupo chegar perto
  const rb = d.rubber;
  if (rb && racing) {
    const rank = game.ranking();
    let sum = 0, n = 0;
    for (const o of rank) if (o.id !== car.id) { sum += o.progress; n++; }
    const gapT = n ? (car.progress - sum / n) / Math.max(car.speed, 12) : 0; // s a frente da media do grupo
    if (rank[0] === car && gapT > rb.near) brain.aheadT += dt; else if (gapT < rb.near * 0.5 || rank[0] !== car) { brain.aheadT = 0; brain.slow = false; }
    if (brain.aheadT > rb.after) brain.slow = true;
  } else brain.slow = false;
  car.throttle = brain.slow ? d.rubber.throttle : 1;

  steer = clamp(steer, -1, 1);
  // reflexo: o volante nao salta de um valor para outro (mais lento no Facil)
  brain.steerCmd += (steer - brain.steerCmd) * (1 - Math.exp(-dt / Math.max(0.001, d.tau * (1 - 0.7 * spawn)))); // controle alto na largada
  steer = brain.steerCmd;

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
        // o morteiro cai ~45 u a frente: atira se ha carros por la (raio de 9 u)
        const tx2 = car.x + fx * 45, tz2 = car.z + fz * 45;
        ok = rank.some((c) => c.id !== car.id && c.freeze <= 0 && Math.hypot(c.x - tx2, c.z - tz2) < 8);
      }
      if (ok) { fire = true; brain.holdT = 0; brain.hold = pick(brain.rng, d.itemHold); }
    }
  }
  return { steer, fire };
}

