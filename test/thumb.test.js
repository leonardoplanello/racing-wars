import test from 'node:test';
import assert from 'node:assert/strict';
import { thumbSvg, thumbUri } from '../shared/thumb.js';
import testCircuit from '../sim/tracks/testcircuit.js';
import mountain from '../sim/tracks/mountain.js';

test('miniatura: SVG valido com o traçado dentro da caixa', () => {
  for (const def of [testCircuit, mountain]) {
    const svg = thumbSvg(def.points, { w: 200, h: 120 });
    assert.match(svg, /^<svg [^>]*viewBox="0 0 200 120"/);
    assert.match(svg, /<path d="M[\d.,\-L]+Z"/);
    // todo vertice do traçado cai dentro da caixa 200x120
    const d = svg.match(/<path d="(M[^"]+)"/)[1];
    for (const [x, y] of d.replace(/[MZ]/g, '').split('L').filter(Boolean).map((p) => p.split(',').map(Number))) {
      assert.ok(x >= 0 && x <= 200 && y >= 0 && y <= 120, `fora da caixa: ${x},${y}`);
    }
  }
});

test('miniatura: pista degenerada e data URI', () => {
  assert.ok(thumbSvg([[0, 0]]).includes('<svg'));
  assert.ok(thumbUri(testCircuit.points).startsWith('data:image/svg+xml;utf8,'));
});
