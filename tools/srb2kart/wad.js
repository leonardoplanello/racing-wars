// Leitor de WAD (IWAD/PWAD; o SRB2Kart usa PWAD nos .kart e no .srb). Cabecalho: 'PWAD', n lumps, offset do diretorio;
// cada entrada do diretorio: pos(int32) size(int32) nome(8 bytes).
import fs from 'node:fs';

export class Wad {
  constructor(buf) {
    this.buf = buf;
    const magic = buf.toString('latin1', 0, 4);
    if (magic !== 'PWAD' && magic !== 'IWAD') throw new Error(`nao e um WAD: ${magic}`);
    const n = buf.readInt32LE(4), dir = buf.readInt32LE(8);
    this.lumps = [];
    this.index = new Map(); // nome -> indices (em ordem)
    for (let i = 0; i < n; i++) {
      const o = dir + i * 16;
      let end = o + 8;
      while (end < o + 16 && buf[end] !== 0) end++;
      const name = buf.toString('latin1', o + 8, end).toUpperCase();
      this.lumps.push({ name, pos: buf.readInt32LE(o), size: buf.readInt32LE(o + 4) });
      if (!this.index.has(name)) this.index.set(name, []);
      this.index.get(name).push(i);
    }
  }

  static open(file) { return new Wad(fs.readFileSync(file)); }

  data(i) { const l = this.lumps[i]; return this.buf.subarray(l.pos, l.pos + l.size); }

  /** Ultimo lump com esse nome (os arquivos carregados depois vencem), ou -1. */
  find(name) { const a = this.index.get(name.toUpperCase()); return a ? a[a.length - 1] : -1; }

  /** Dados do lump com esse nome, ou null. */
  get(name) { const i = this.find(name); return i < 0 ? null : this.data(i); }

  /** Lumps entre dois marcadores (ex.: F_START..F_END), sem os marcadores. */
  between(start, end) {
    const a = this.find(start), b = this.find(end);
    if (a < 0 || b < 0 || b < a) return [];
    return this.lumps.slice(a + 1, b).map((l, k) => ({ ...l, i: a + 1 + k }));
  }
}

const MAP_LABEL = /^MAP[0-9A-Z]{2}$/;
export const isMapLabel = (name) => MAP_LABEL.test(name);

/** Rotulos de mapa (MAP01, MAPB0...) na ordem em que aparecem. */
export function mapLabels(wad) {
  const out = [];
  wad.lumps.forEach((l, i) => { if (isMapLabel(l.name) && wad.lumps[i + 1]?.name === 'THINGS') out.push({ name: l.name, i }); });
  return out;
}

/** Numero do mapa -> nome do lump (G_BuildMapName do SRB2: 1..99 = MAPnn; depois MAPA0.. em base 36). */
export function mapName(n) {
  if (n >= 1 && n <= 99) return 'MAP' + String(n).padStart(2, '0');
  const m = n - 100, c0 = Math.floor(m / 36), c1 = m % 36;
  const ch = (k) => (k < 10 ? String(k) : String.fromCharCode(65 + k - 10));
  return 'MAP' + String.fromCharCode(65 + c0) + ch(c1);
}

/** Nome do lump -> numero do mapa (inverso de mapName). */
export function mapNumber(name) {
  const m = /^MAP(..)$/.exec(name.toUpperCase());
  if (!m) return 0;
  if (/^\d\d$/.test(m[1])) return Number(m[1]);
  const v = (c) => (c >= '0' && c <= '9' ? c.charCodeAt(0) - 48 : c.charCodeAt(0) - 65 + 10);
  const c0 = m[1].charCodeAt(0) - 65, c1 = v(m[1][1]);
  return 100 + c0 * 36 + c1;
}
