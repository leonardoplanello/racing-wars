// Pistas importadas do SRB2Kart. Os dados (public/tracks/srb2kart/*.json) saem de `node tools/srb2kart/build.js` a partir
// do instalador do jogo e nao vao para o git: sem eles estes testes sao pulados.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildMapTrack } from '../sim/maptrack.js';
import { MapWorld } from '../sim/mapworld.js';
import { Game } from '../sim/game.js';
import { DT, CAR } from '../sim/car.js';
import { makeBrain, think } from '../sim/ai.js';
import { makeRng } from '../sim/rng.js';
import { KartCamera, camBlocked } from '../sim/camera.js';

const FILE = new URL('../public/tracks/srb2kart/srb2kart-map51.json', import.meta.url);
const have = fs.existsSync(FILE);
const t = (name, fn) => test(name, { skip: have ? false : 'sem os dados do SRB2Kart (rode tools/srb2kart/build.js)' }, fn);
const data = have ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : null;
const players = (n) => Array.from({ length: n }, (_, i) => ({ id: i, name: 'P' + i, color: i, isBot: true }));

t('MapWorld: a BSP acha o setor das largadas e das caixas, com piso alcancavel', () => {
  const w = new MapWorld(data);
  const out = { y: 0, sec: 0, fof: -1, nx: 0, ny: 1, nz: 0 };
  for (const p of [...data.starts, ...data.boxes]) {
    const si = w.locate(p.x, p.z);
    assert.equal(si, p.sec, 'setor do thing');
    assert.ok(!w.isVoid(si));
    assert.ok(w.surfaceIn(si, p.x, p.z, w.floorAt(si, p.x, p.z), out));
  }
});

t('buildMapTrack: pista fechada, meia largura positiva e altura coerente', () => {
  const track = buildMapTrack(data);
  assert.ok(track.length > 1000 && track.length < 6000, 'comprimento ' + track.length);
  const a = { x: track.X[0], z: track.Z[0] }, b = { x: track.X[track.N - 1], z: track.Z[track.N - 1] };
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 2.5, 'fecha');
  for (let i = 0; i < track.N; i++) assert.ok(track.HW[i] >= 2);
  // o carro posicionado na linha central tem chao sob ele (nao vazio)
  const w = track.map, out = { y: 0, sec: 0, fof: -1, nx: 0, ny: 1, nz: 0 };
  for (let i = 0; i < track.N; i += 25) {
    w.groundAt(track.X[i], track.Z[i], track.ELEV[i] + 0.1, out);
    assert.ok(!w.isVoid(out.si ?? w.locate(track.X[i], track.Z[i])), 'vazio na linha central em ' + i);
    assert.ok(Math.abs(out.y - track.ELEV[i]) < 3, 'altura em ' + i);
  }
});

t('paredes do mapa: o carro nao atravessa a borda do mapa e nao sai do chao', () => {
  const track = buildMapTrack(data);
  const game = new Game(players(6), { track, cup: 'fast', seed: 3 });
  game.debug.infinite = true; game.debug.noCut = true;
  const rng = makeRng(7);
  const brains = new Map(game.cars.map((c) => [c.id, makeBrain(rng, 0.85)]));
  let under = 0;
  for (let tm = 0; tm < 40; tm += 1 / 60) {
    for (const c of game.cars) if (c.alive && c.near) { const r = think(brains.get(c.id), c, game, 1 / 60); game.setInput(c.id, r.steer, r.fire, r.rev); }
    game.update(1 / 60);
    for (const c of game.cars) {
      if (c.state === 'dead' || c.state === 'falling' || c.state === 'wreck') continue;
      assert.ok(Number.isFinite(c.x) && Number.isFinite(c.z) && Number.isFinite(c.y), 'posicao finita');
      if (c.y < track.map.groundAt(c.x, c.z, c.y + 0.5).y - 0.5) under++;
    }
  }
  assert.equal(under, 0, 'carros abaixo do chao');
});

t('bots completam voltas na pista importada', () => {
  const track = buildMapTrack(data);
  const game = new Game(players(8), { track, cup: 'fast', seed: 5 });
  game.debug.infinite = true; game.debug.noCut = true;
  const rng = makeRng(7);
  const brains = new Map(game.cars.map((c) => [c.id, makeBrain(rng, 0.85)]));
  let best = 0;
  const fell = new Set();
  for (let tm = 0; tm < 200; tm += 1 / 60) {
    for (const c of game.cars) if (c.alive && c.near) { const r = think(brains.get(c.id), c, game, 1 / 60); game.setInput(c.id, r.steer, r.fire, r.rev); }
    game.update(1 / 60);
    for (const c of game.cars) { if (c.alive) best = Math.max(best, c.progress); if (c.state === 'falling') fell.add(c.id); }
  }
  assert.ok(best > track.length * 0.98, `volta completa: ${(best / track.length).toFixed(2)}`);
});

// ---- respawn e linha central (corrida em pista de mapa)
function raceRun(secs, setup) {
  const track = buildMapTrack(data);
  const game = new Game(players(8), { track, cup: 'fast', seed: 5, mode: 'race' });
  game.debug.infinite = true; game.debug.noCut = true;
  const rng = makeRng(7);
  const brains = new Map(game.cars.map((c) => [c.id, makeBrain(rng, 0.85)]));
  const events = [];
  for (let s = 0; s < secs; s += 1 / 60) {
    for (const c of game.cars) if (c.alive && c.near) { const r = think(brains.get(c.id), c, game, 1 / 60); game.setInput(c.id, r.steer, r.fire, r.rev); }
    game.update(1 / 60);
    for (const e of game.drainEvents()) events.push({ ...e, at: game.time });
  }
  return { game, track, events };
}

t('MAP51: a linha central fica sobre chao de verdade (sem vazio nem morte) e o y bate com a superficie', () => {
  const w = new MapWorld(data), c = data.center, tmp = { y: 0, sec: 0, fof: -1, nx: 0, ny: 1, nz: 0 }, info = { off: 0, death: false };
  let bad = 0;
  for (let i = 0; i < c.x.length; i += 3) {
    if (c.air[i]) continue;
    const si = w.locate(c.x[i], c.z[i]);
    const ok = w.surfaceIn(si, c.x[i], c.z[i], c.y[i] + 0.05, tmp) && !(w.isVoid(si) && tmp.fof < 0);
    w.surfaceInfo(tmp.sec, info);
    if (!ok || info.death || Math.abs(tmp.y - c.y[i]) > 1.5) bad++;
  }
  assert.equal(bad, 0);
});

t('MAP51: o vigia de progresso nao dispara na largada e nao ha loop de respawn', () => {
  const { events } = raceRun(60);
  const resp = events.filter((e) => e.type === 'respawn');
  assert.ok(!resp.some((e) => e.cause === 'stuck' && e.at < 12), 'respawn por travamento logo depois da largada');
  // renasceu e caiu/travou de novo em menos de 2,5 s (mesmo carro) = loop
  const last = new Map();
  let loops = 0;
  for (const e of resp) { if (e.at - (last.get(e.car) ?? -99) < 2.5) loops++; last.set(e.car, e.at); }
  assert.equal(loops, 0);
});

t('respawn: renasce em chao valido, no sentido da pista, com escudo e velocidade', () => {
  const track = buildMapTrack(data);
  const game = new Game(players(2), { track, cup: 'fast', seed: 5, mode: 'race' });
  const c = game.cars[0];
  for (let s = 0; s < 8; s += 1 / 60) game.update(1 / 60); // largada + um pouco de corrida
  game.drainEvents();
  c.safes = [{ x: c.x, z: c.z, y: c.y, h: c.h, progress: c.progress, d: 0, t: game.time }];
  game.respawn(c, 'fall');
  assert.equal(c.state, 'run');
  assert.ok(c.shield > 0);
  assert.ok(Math.hypot(c.vx, c.vz) > 5);
  const g = track.map.groundAt(c.x, c.z, c.y + 1, { y: 0, sec: 0, fof: -1, nx: 0, ny: 1, nz: 0 });
  assert.ok(!(track.map.isVoid(g.si) && g.fof < 0), 'renasceu no vazio');
  assert.ok(Math.abs(g.y - c.y) < 1.5, 'altura do respawn diferente do chao');
  const ev = game.drainEvents().find((e) => e.type === 'respawn');
  assert.ok(ev && ev.cause === 'fall');
});

t('respawn: travar de novo no mesmo trecho avanca pela linha central (pula o obstaculo)', () => {
  const track = buildMapTrack(data);
  const game = new Game(players(2), { track, cup: 'fast', seed: 5, mode: 'race' });
  const c = game.cars[0];
  for (let s = 0; s < 6; s += 1 / 60) game.update(1 / 60);
  const p0 = c.progress;
  c.safes = [{ x: c.x, z: c.z, y: c.y, h: c.h, progress: c.progress - 3, d: 0, t: game.time }]; // ponto seguro logo atras (nao depende de onde o carro parado foi parar)
  game.respawn(c, 'stuck');
  const first = c.progress;
  game.respawn(c, 'stuck');
  const second = c.progress;
  assert.ok(second > first + 10, `o segundo respawn deveria avancar (${first.toFixed(0)} -> ${second.toFixed(0)}), partiu de ${p0.toFixed(0)}`);
});

t('MAP51: as cameras (de kart e de cima) nunca ficam acima do teto nem dentro de estruturas ao longo da corrida', () => {
  const track = buildMapTrack(data);
  const game = new Game(players(4), { track, cup: 'fast', seed: 5, mode: 'race' });
  const rng = makeRng(7);
  const brains = new Map(game.cars.map((c) => [c.id, makeBrain(rng, 0.9)]));
  const kc = new KartCamera();
  let bad = 0, frames = 0, shrunk = 0;
  for (let s = 0; s < 150; s += DT) {
    for (const c of game.cars) if (c.alive && c.near && !c.locked) { const r = think(brains.get(c.id), c, game, DT); game.setInput(c.id, r.steer, r.fire, r.rev); }
    game.update(DT);
    game.drainEvents();
    const tgt = game.cars[0].alive ? game.cars[0] : game.cars[1];
    kc.update(DT, tgt, { top: CAR.cruise, track });
    const cam = game.camera;
    frames++;
    if (kc.dFrac < 0.9) shrunk++;
    if (camBlocked(track, kc.x, kc.z, kc.vy, false, 1, tgt.y + 1.2) || camBlocked(track, cam.vx, cam.vz, cam.vy, false, 1, cam.ay + 1.2)) bad++;
  }
  assert.ok(bad <= frames * 0.002, `camera em teto/estrutura em ${bad} de ${frames} quadros (${shrunk} com a de kart encurtada)`);
});
