// Assets graficos do SRB2Kart: paleta (PLAYPAL), flats (pisos/tetos 8 bits quadrados), patches (formato de colunas com posts) e
// texturas compostas (lump TEXTURES: "WallTexture NOME, w, h { Patch P, x, y }"). Tudo vira RGBA 8 bits (alfa 0 = furo).
// Carregue os arquivos na ordem do jogo: os de depois vencem (srb2.srb, textures.kart...).
import path from 'node:path';
import { Wad } from './wad.js';
import { DEFAULT_OUT } from './extract.js';

export class Assets {
  constructor(dir = DEFAULT_OUT, files = ['srb2.srb', 'textures.kart']) {
    this.wads = files.map((f) => Wad.open(path.join(dir, f)));
    this.dir = dir;
    this.palette = null;
    this.patchLump = new Map(); // nome -> { wad, i } (TX_START..TX_END e P_START..P_END)
    this.flatLump = new Map(); // nome -> { wad, i } (F_START..F_END, FF_START..FF_END)
    this.defs = new Map(); // nome -> { w, h, patches: [{name,x,y}] }
    this.cache = new Map();
    for (const w of this.wads) {
      const pal = w.get('PLAYPAL');
      if (pal && pal.length >= 768) this.palette = pal.subarray(0, 768);
      for (const [a, b, map] of [['TX_START', 'TX_END', this.patchLump], ['P_START', 'P_END', this.patchLump], ['F_START', 'F_END', this.flatLump], ['FF_START', 'FF_END', this.flatLump]]) {
        for (const l of w.between(a, b)) if (l.size > 0) map.set(l.name, { wad: w, i: l.i });
      }
      // o textures.kart tem os flats entre F_START e P_START (sem F_END)
      const fs = w.find('F_START'), ps = w.find('P_START');
      if (fs >= 0 && ps > fs && w.find('F_END') < 0) for (let i = fs + 1; i < ps; i++) if (w.lumps[i].size > 0) this.flatLump.set(w.lumps[i].name, { wad: w, i });
      const t = w.get('TEXTURES');
      if (t) this.parseTextures(t.toString('latin1'));
    }
    if (!this.palette) throw new Error('PLAYPAL nao encontrado');
  }

  parseTextures(text) {
    const re = /walltexture\s+([^\s,]+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\{([^}]*)\}/gi;
    let m;
    while ((m = re.exec(text))) {
      const patches = [];
      const pr = /patch\s+([^\s,]+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)/gi;
      let p;
      while ((p = pr.exec(m[4]))) patches.push({ name: p[1].toUpperCase(), x: Number(p[2]), y: Number(p[3]) });
      this.defs.set(m[1].toUpperCase(), { w: Number(m[2]), h: Number(m[3]), patches });
    }
  }

  /** Patch do jogo (colunas com posts) -> { w, h, idx: Int16Array(-1 = vazio) } */
  decodePatch(name) {
    const e = this.patchLump.get(name);
    if (!e) return null;
    const d = e.wad.data(e.i);
    if (d.length > 8 && d[0] === 0x89 && d[1] === 0x50) return null; // PNG: nao suportado aqui
    const w = d.readInt16LE(0), h = d.readInt16LE(2);
    if (w <= 0 || h <= 0 || w > 2048 || h > 2048) return null;
    const idx = new Int16Array(w * h).fill(-1);
    for (let x = 0; x < w; x++) {
      let o = d.readInt32LE(8 + x * 4), prev = -1;
      if (o < 0 || o >= d.length) continue;
      while (o < d.length && d[o] !== 0xff) {
        let top = d[o];
        const len = d[o + 1];
        if (top <= prev) top += prev;
        prev = top;
        for (let k = 0; k < len; k++) { const y = top + k; if (y >= 0 && y < h) idx[y * w + x] = d[o + 3 + k]; }
        o += len + 4;
      }
    }
    return { w, h, idx };
  }

  /** Textura de parede (simples ou composta) -> { w, h, rgba } ou null */
  texture(name) {
    name = name.toUpperCase();
    if (this.cache.has('t' + name)) return this.cache.get('t' + name);
    let out = null;
    const def = this.defs.get(name);
    if (def) {
      const idx = new Int16Array(def.w * def.h).fill(-1);
      for (const p of def.patches) {
        const pt = this.decodePatch(p.name);
        if (!pt) continue;
        for (let y = 0; y < pt.h; y++) {
          const ty = y + p.y;
          if (ty < 0 || ty >= def.h) continue;
          for (let x = 0; x < pt.w; x++) {
            const tx = x + p.x;
            if (tx < 0 || tx >= def.w) continue;
            const v = pt.idx[y * pt.w + x];
            if (v >= 0) idx[ty * def.w + tx] = v;
          }
        }
      }
      out = this.toRgba(def.w, def.h, idx);
    } else {
      const pt = this.decodePatch(name);
      if (pt) out = this.toRgba(pt.w, pt.h, pt.idx);
    }
    this.cache.set('t' + name, out);
    return out;
  }

  /** Flat -> { w, h, rgba } ou null */
  flat(name) {
    name = name.toUpperCase();
    if (this.cache.has('f' + name)) return this.cache.get('f' + name);
    let out = null;
    const e = this.flatLump.get(name);
    if (e) {
      const d = e.wad.data(e.i);
      const side = Math.round(Math.sqrt(d.length));
      if (side * side === d.length && side >= 8 && side <= 2048) {
        const idx = new Int16Array(d.length);
        for (let i = 0; i < d.length; i++) idx[i] = d[i];
        out = this.toRgba(side, side, idx);
      }
    }
    this.cache.set('f' + name, out);
    return out;
  }

  toRgba(w, h, idx) {
    const rgba = new Uint8Array(w * h * 4), P = this.palette;
    for (let i = 0; i < idx.length; i++) {
      const v = idx[i];
      if (v < 0) continue; // furo (alfa 0)
      rgba[i * 4] = P[v * 3]; rgba[i * 4 + 1] = P[v * 3 + 1]; rgba[i * 4 + 2] = P[v * 3 + 2]; rgba[i * 4 + 3] = 255;
    }
    return { w, h, rgba };
  }
}

/** Cor media (0xRRGGBB) de uma imagem RGBA, ignorando pixels transparentes. */
export function averageColor(img) {
  if (!img) return 0x808080;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < img.rgba.length; i += 4) if (img.rgba[i + 3]) { r += img.rgba[i]; g += img.rgba[i + 1]; b += img.rgba[i + 2]; n++; }
  return n ? ((Math.round(r / n) << 16) | (Math.round(g / n) << 8) | Math.round(b / n)) : 0x808080;
}
