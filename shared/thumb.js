// Miniatura de uma pista: o traçado (linha central) como SVG. Puro (sem DOM): roda no host e nas ferramentas.

/**
 * points: [[x,z]...] (circuito fechado). Devolve uma string SVG de w x h com o traçado, a largada e o sentido.
 * O eixo z do jogo vira o y da tela (a mesma orientação do mapa original).
 */
export function thumbSvg(points, { w = 200, h = 120, color = '#ffd23f' } = {}) {
  const n = points.length;
  if (n < 3) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"></svg>`;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of points) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  const pad = 12, sc = Math.min((w - pad * 2) / Math.max(1, x1 - x0), (h - pad * 2) / Math.max(1, z1 - z0));
  const ox = (w - (x1 - x0) * sc) / 2, oz = (h - (z1 - z0) * sc) / 2;
  const P = (p) => [ox + (p[0] - x0) * sc, oz + (p[1] - z0) * sc];
  // no maximo ~120 vertices: basta para a miniatura e mantem o arquivo pequeno
  const step = Math.max(1, Math.floor(n / 120));
  const pts = [];
  for (let i = 0; i < n; i += step) pts.push(P(points[i]).map((v) => +v.toFixed(1)));
  const d = 'M' + pts.map((p) => p.join(',')).join('L') + 'Z';
  const s = P(points[0]), t = P(points[Math.min(n - 1, Math.max(1, Math.floor(n / 40)))]);
  const a = Math.atan2(t[1] - s[1], t[0] - s[0]);
  const arrow = [[6, 0], [-4, -4.5], [-4, 4.5]].map(([u, v]) => `${(s[0] + u * Math.cos(a) - v * Math.sin(a)).toFixed(1)},${(s[1] + u * Math.sin(a) + v * Math.cos(a)).toFixed(1)}`).join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">`
    + `<path d="${d}" fill="none" stroke="#000" stroke-opacity=".5" stroke-width="9" stroke-linejoin="round"/>`
    + `<path d="${d}" fill="none" stroke="#2a3a52" stroke-width="7" stroke-linejoin="round"/>`
    + `<path d="${d}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round"/>`
    + `<polygon points="${arrow}" fill="#fff" stroke="#000" stroke-width="1"/></svg>`;
}

/** Data URI da miniatura (para <img src>). */
export function thumbUri(points, opts) {
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(thumbSvg(points, opts));
}
