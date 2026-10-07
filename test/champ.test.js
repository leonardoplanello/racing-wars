import test from 'node:test';
import assert from 'node:assert/strict';
import { Championship, playlistFrom } from '../sim/champ.js';

const race = (order) => order.map((id, i) => ({ id, place: i + 1, points: [10, 8, 6, 5][i] ?? 0 }));

test('campeonato acumula pontos e avanca pelas pistas', () => {
  const c = new Championship(['a', 'b', 'c'], [0, 1, 2]);
  assert.equal(c.trackId, 'a');
  let s = c.addRace(race([1, 0, 2]));
  assert.deepEqual(s.map((r) => [r.id, r.points]), [[1, 10], [0, 8], [2, 6]]);
  assert.ok(c.advance());
  assert.equal(c.trackId, 'b');
  assert.equal(c.nextTrackId, 'c');
  s = c.addRace(race([0, 1, 2]));
  assert.deepEqual(s.map((r) => [r.id, r.points]), [[0, 18], [1, 18], [2, 12]]);
  assert.ok(c.advance());
  assert.ok(c.isLast);
  assert.equal(c.advance(), false);
  assert.equal(c.nextTrackId, null);
});

test('desempate: vitorias, depois colocacao na ultima pista', () => {
  const c = new Championship(['a', 'b'], [0, 1]);
  c.addRace(race([1, 0])); // 1: 10, 0: 8
  c.advance();
  const s = c.addRace(race([0, 1])); // 0: 18, 1: 18; uma vitoria cada -> vence quem foi melhor na ultima
  assert.deepEqual(s.map((r) => r.id), [0, 1]);
  assert.deepEqual(s.map((r) => r.place), [1, 2]);
});

test('playlistFrom volta ao comeco e respeita o tamanho', () => {
  const list = ['m1', 'm2', 'm3', 'm4'];
  assert.deepEqual(playlistFrom(list, 'm3', 3), ['m3', 'm4', 'm1']);
  assert.deepEqual(playlistFrom(list, 'm2', 1), ['m2']);
  assert.deepEqual(playlistFrom(list, 'm2', 9), ['m2', 'm3', 'm4', 'm1']);
  assert.deepEqual(playlistFrom(list, 'x', 2), ['m1', 'm2']);
});
