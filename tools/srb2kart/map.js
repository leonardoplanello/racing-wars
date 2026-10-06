// Parser dos lumps de mapa do SRB2Kart (formato Doom classico; sem UDMF). Layouts de src/doomdata.h:
//  THINGS 10 bytes: x,y (int16), angle (graus), type (low 12 bits = tipo; high 4 = extrainfo), options (bit>>4 = Z acima do piso)
//  LINEDEFS 14: v1, v2, flags, special, tag (int16), sidenum[2] (uint16; 0xFFFF = nenhum). sidenum[0] = lado direito de v1->v2
//  SIDEDEFS 30: texoffset, rowoffset, top[8], bottom[8], mid[8], setor
//  VERTEXES 4: x, y (int16)
//  SECTORS 26: piso, teto (int16), flat do piso[8], flat do teto[8], luz, special, tag
import { isMapLabel } from './wad.js';

const str = (buf, o) => {
  let e = o;
  while (e < o + 8 && buf[e] !== 0) e++;
  return buf.toString('latin1', o, e).toUpperCase();
};

export const ML = { IMPASSIBLE: 1, TWOSIDED: 4, DONTPEGTOP: 8, DONTPEGBOTTOM: 16, EFFECT1: 32, NOCLIMB: 64, EFFECT2: 128, EFFECT3: 256, EFFECT4: 512, EFFECT5: 1024, NOSONIC: 2048, NOTAILS: 4096, NOKNUX: 8192, BOUNCY: 16384 };

/** Lumps do mapa que comeca no rotulo `labelIndex` do WAD. */
export function readMap(wad, labelIndex) {
  const name = wad.lumps[labelIndex].name;
  const lumps = {};
  for (let i = labelIndex + 1; i < wad.lumps.length; i++) {
    const n = wad.lumps[i].name;
    if (isMapLabel(n) && wad.lumps[i + 1]?.name === 'THINGS') break;
    if (!['THINGS', 'LINEDEFS', 'SIDEDEFS', 'VERTEXES', 'SEGS', 'SSECTORS', 'NODES', 'SECTORS', 'REJECT', 'BLOCKMAP'].includes(n)) break;
    lumps[n] = wad.data(i);
  }
  for (const need of ['THINGS', 'LINEDEFS', 'SIDEDEFS', 'VERTEXES', 'SECTORS']) if (!lumps[need]) throw new Error(`${name}: falta ${need}`);

  const T = lumps.THINGS, things = [];
  for (let o = 0; o + 10 <= T.length; o += 10) {
    const type = T.readUInt16LE(o + 6), opt = T.readUInt16LE(o + 8);
    things.push({ x: T.readInt16LE(o), y: T.readInt16LE(o + 2), angle: T.readInt16LE(o + 4), type: type & 0xfff, extra: type >> 12, options: opt, z: opt >> 4, flip: !!(opt & 2), special: !!(opt & 4), ambush: !!(opt & 8) });
  }
  const L = lumps.LINEDEFS, lines = [];
  for (let o = 0; o + 14 <= L.length; o += 14) {
    const s0 = L.readUInt16LE(o + 10), s1 = L.readUInt16LE(o + 12);
    lines.push({ v1: L.readInt16LE(o) & 0xffff, v2: L.readInt16LE(o + 2) & 0xffff, flags: L.readUInt16LE(o + 4), special: L.readInt16LE(o + 6), tag: L.readInt16LE(o + 8), side0: s0 === 0xffff ? -1 : s0, side1: s1 === 0xffff ? -1 : s1 });
  }
  const S = lumps.SIDEDEFS, sides = [];
  for (let o = 0; o + 30 <= S.length; o += 30) {
    sides.push({ xoff: S.readInt16LE(o), yoff: S.readInt16LE(o + 2), top: str(S, o + 4), bottom: str(S, o + 12), mid: str(S, o + 20), sector: S.readUInt16LE(o + 28) });
  }
  const V = lumps.VERTEXES, verts = [];
  for (let o = 0; o + 4 <= V.length; o += 4) verts.push({ x: V.readInt16LE(o), y: V.readInt16LE(o + 2) });
  const C = lumps.SECTORS, sectors = [];
  for (let o = 0; o + 26 <= C.length; o += 26) {
    sectors.push({ floor: C.readInt16LE(o), ceil: C.readInt16LE(o + 2), floorPic: str(C, o + 4), ceilPic: str(C, o + 12), light: C.readInt16LE(o + 20), special: C.readInt16LE(o + 22), tag: C.readInt16LE(o + 24) });
  }
  // lados fora de alcance viram o setor 0 (como o motor)
  for (const s of sides) if (s.sector >= sectors.length) s.sector = 0;

  // BSP classica do Doom: NODES 28 bytes (x,y,dx,dy, bbox[2][4], filhos[2] uint16; 0x8000 = subsetor), SSECTORS 4, SEGS 12
  const nodes = [], subs = [], segs = [];
  const N = lumps.NODES, SS = lumps.SSECTORS, SG = lumps.SEGS;
  if (N) for (let o = 0; o + 28 <= N.length; o += 28) nodes.push({ x: N.readInt16LE(o), y: N.readInt16LE(o + 2), dx: N.readInt16LE(o + 4), dy: N.readInt16LE(o + 6), right: N.readUInt16LE(o + 24), left: N.readUInt16LE(o + 26) });
  if (SS) for (let o = 0; o + 4 <= SS.length; o += 4) subs.push({ num: SS.readUInt16LE(o), first: SS.readUInt16LE(o + 2) });
  if (SG) for (let o = 0; o + 12 <= SG.length; o += 12) segs.push({ line: SG.readUInt16LE(o + 6), side: SG.readInt16LE(o + 8) });
  return { name, things, lines, sides, verts, sectors, nodes, subs, segs };
}

/** Linedefs com os dois setores resolvidos: front = lado direito de v1->v2, back = lado esquerdo (-1 se nao houver). */
export function resolveLines(map) {
  return map.lines.map((l, i) => ({ ...l, i, front: l.side0 >= 0 ? map.sides[l.side0].sector : -1, back: l.side1 >= 0 ? map.sides[l.side1].sector : -1 }));
}
