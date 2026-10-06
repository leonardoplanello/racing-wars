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
    for (const c of game.cars) if (c.alive && c.near) { const r = think(brains.get(c.id), c, game, 1 / 60); game.setInput(c.id, r.steer, r.fire); }
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
    for (const c of game.cars) if (c.alive && c.near) { const r = think(brains.get(c.id), c, game, 1 / 60); game.setInput(c.id, r.steer, r.fire); }
    game.update(1 / 60);
    for (const c of game.cars) { if (c.alive) best = Math.max(best, c.progress); if (c.state === 'falling') fell.add(c.id); }
  }
  assert.ok(best > track.length * 0.98, `volta completa: ${(best / track.length).toFixed(2)}`);
});
