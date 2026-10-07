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
    this.anims = { f: new Map(), t: new Map() }; // ANIMDEFS: nome de qualquer quadro -> { frames: [nomes], tics, i0 }
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
      const an = w.get('ANIMDEFS');
      if (an) this.parseAnims(an.toString('latin1'), w);
    }
    if (!this.palette) throw new Error('PLAYPAL nao encontrado');
    // sprites (S_START..S_END) do srb2.srb e do gfx.kart: nome do lump -> { wad, i }
    this.spriteLump = new Map();
    for (const f of ['srb2.srb', 'gfx.kart']) {
      try { const w = Wad.open(path.join(dir, f)); for (const l of w.between('S_START', 'S_END')) if (l.size > 0) this.spriteLump.set(l.name, { wad: w, i: l.i }); } catch { /* sem o arquivo */ }
    }
  }

  /**
   * Sprite 'NOME' + quadro (0 = A, 26 = '0', 36 = 'a') -> { w, h, ox, oy, rgba, flip } ou null. Usa a rotacao 0 (ou a 1 / espelhada).
   * ox/oy: deslocamento do patch (pixels a esquerda do ponto de ancora / acima dele), como no jogo.
   */
  sprite(name, frame) {
    const key = 's' + name + frame;
    if (this.cache.has(key)) return this.cache.get(key);
    const ch = frame < 26 ? String.fromCharCode(65 + frame) : frame < 36 ? String(frame - 26) : String.fromCharCode(97 + frame - 36);
    let hit = null, flip = false;
    for (const rot of ['0', '1']) {
      const n = name + ch + rot;
      if (this.spriteLump.has(n)) { hit = this.spriteLump.get(n); break; }
    }
    if (!hit) { // lump com dois quadros (NOMEA2A8: o segundo e a versao espelhada)
      for (const [n, e] of this.spriteLump) {
        if (!n.startsWith(name) || n.length !== 10) continue;
        if (n[4] === ch && (n[5] === '1' || n[5] === '0')) { hit = e; break; }
        if (n[6] === ch && (n[7] === '1' || n[7] === '0')) { hit = e; flip = true; break; }
      }
    }
    let out = null;
    if (hit) {
      const d = hit.wad.data(hit.i);
      const pt = this.decodePatchData(d);
      if (pt) { const t = this.toRgba(pt.w, pt.h, pt.idx); out = { ...t, ox: d.readInt16LE(4), oy: d.readInt16LE(6), flip }; }
    }
    this.cache.set(key, out);
    return out;
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

  /**
   * ANIMDEFS ("Flat|Texture [Optional] INICIO Range FIM Tics N"): os quadros sao os flats consecutivos no WAD (ou as texturas
   * consecutivas na lista, ou a numeracao do nome). Cada nome de quadro aponta para o ciclo inteiro e a sua posicao nele.
   */
  parseAnims(text, wad) {
    const re = /^\s*(flat|texture)\s+(?:optional\s+)?(\S+)\s+range\s+(\S+)\s+tics\s+(\d+)/gim;
    let m;
    while ((m = re.exec(text))) {
      const kind = m[1].toLowerCase() === 'flat' ? 'f' : 't', a = m[2].toUpperCase(), b = m[3].toUpperCase(), tics = Number(m[4]);
      let frames = [];
      if (kind === 'f') {
        const ea = this.flatLump.get(a), eb = this.flatLump.get(b);
        if (ea && eb && ea.wad === eb.wad && eb.i >= ea.i) for (let i = ea.i; i <= eb.i; i++) if (ea.wad.lumps[i].size > 0) frames.push(ea.wad.lumps[i].name);
      } else {
        const names = [...this.defs.keys()], ia = names.indexOf(a), ib = names.indexOf(b);
        if (ia >= 0 && ib >= ia) frames = names.slice(ia, ib + 1);
      }
      if (frames.length < 2) { // fallback: o numero final do nome (NOME1..NOME4)
        const pa = /^(.*?)(\d+)$/.exec(a), pb = /^(.*?)(\d+)$/.exec(b);
        if (pa && pb && pa[1] === pb[1]) { frames = []; for (let n = Number(pa[2]); n <= Number(pb[2]); n++) frames.push(pa[1] + String(n).padStart(pa[2].length, '0')); }
      }
      if (frames.length < 2) continue;
      frames.forEach((f, i) => this.anims[kind].set(f, { frames, tics, i0: i }));
    }
  }

  /** Patch do jogo (colunas com posts) -> { w, h, idx: Int16Array(-1 = vazio) } */
  decodePatch(name) {
    const e = this.patchLump.get(name);
    if (!e) return null;
    return this.decodePatchData(e.wad.data(e.i));
  }

  decodePatchData(d) {
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

/**
 * Espalha a cor dos pixels opacos para os transparentes vizinhos (alfa continua 0). Sem isso o mipmap/filtro mistura o RGB=0 dos
 * pixels transparentes com a borda e as grades/cercas ganham um halo escuro (e somem a distancia).
 */
export function bleedAlpha(img, passes = 6) {
  const { w, h, rgba } = img;
  for (let p = 0; p < passes; p++) {
    const next = rgba.slice();
    let changed = false;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (rgba[i + 3]) continue;
        let r = 0, g = 0, b = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            const j = (yy * w + xx) * 4;
            if (rgba[j + 3] || rgba[j] + rgba[j + 1] + rgba[j + 2] > 0) { r += rgba[j]; g += rgba[j + 1]; b += rgba[j + 2]; n++; }
          }
        }
        if (n && (rgba[i] + rgba[i + 1] + rgba[i + 2] === 0)) { next[i] = r / n; next[i + 1] = g / n; next[i + 2] = b / n; changed = true; }
      }
    }
    rgba.set(next);
    if (!changed) break;
  }
  return img;
}
