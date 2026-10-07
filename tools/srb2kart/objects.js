// Objetos do SRB2Kart: doomednum (tipo do thing) -> sprite/quadros/tamanho, lidos da info.c do codigo-fonte (other-games/Kart-Public-1.6).
//   node tools/srb2kart/objects.js [doomednum ...]   imprime a tabela (ou so os pedidos)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const INFO_C = path.join(root, 'other-games/Kart-Public-1.6/Kart-Public-1.6/src/info.c');

const FF = { ANIMATE: 0x4000, FULLBRIGHT: 0x8000, PAPER: 0x800, FRAMEMASK: 0x1ff, TRANSMASK: 0xf0000 };

function evalFrame(expr) {
  let v = 0, trans = 0;
  for (const part of expr.split(/[|+]/).map((s) => s.trim()).filter(Boolean)) {
    if (/^\d+$/.test(part)) v += Number(part);
    else if (part === 'FF_FULLBRIGHT') v += FF.FULLBRIGHT;
    else if (part === 'FF_ANIMATE') v += FF.ANIMATE;
    else if (part === 'FF_PAPERSPRITE') v += FF.PAPER;
    else if (/^FF_TRANS(\d)0$/.test(part)) trans = Number(/(\d)0$/.exec(part)[1]);
  }
  return { frame: v & FF.FRAMEMASK, anim: !!(v & FF.ANIMATE), bright: !!(v & FF.FULLBRIGHT), paper: !!(v & FF.PAPER), trans };
}

/** Le a info.c: { states: Map(nome -> estado), types: Map(doomednum -> objeto) } */
export function parseInfo(file = INFO_C) {
  const text = fs.readFileSync(file, 'latin1');
  const states = new Map();
  const re = /^\s*\{(SPR_\w+),\s*([^,]+?),\s*(-?\d+)\s*,\s*\{(\w+)\}\s*,\s*([^,]+?),\s*([^,]+?),\s*(S_\w+)\s*\}\s*,?\s*\/\/\s*(S_\w+)/gm;
  let m;
  while ((m = re.exec(text))) {
    const f = evalFrame(m[2]);
    states.set(m[8], { spr: m[1].slice(4), ...f, tics: Number(m[3]), action: m[4], v1: Number(m[5]) || 0, v2: Number(m[6]) || 0, next: m[7] });
  }
  const types = new Map();
  const at = text.indexOf('mobjinfo_t mobjinfo[NUMMOBJTYPES]');
  const body = text.slice(at, text.indexOf('};', at));
  const blocks = body.split(/\{\s*\/\/\s*(MT_\w+)/).slice(1);
  for (let i = 0; i < blocks.length; i += 2) {
    const mt = blocks[i];
    const vals = blocks[i + 1].split('\n').slice(1, 25).map((l) => l.replace(/\/\/.*$/, '').replace(/,\s*$/, '').trim());
    const dn = Number(vals[0]);
    if (!(dn > 0)) continue;
    const num = (s) => Number((s || '0').replace(/\*FRACUNIT/, '')) || 0;
    types.set(dn, { mt, dn, spawn: vals[1], radius: num(vals[16]), height: num(vals[17]), flags: (vals[22] || '').split('|').map((s) => s.trim().replace(/^MF_/, '')) });
  }
  return { states, types };
}

/** Quadros da animacao de spawn: [{spr, f, t}] (t em tics; ciclo de estados ou FF_ANIMATE), mais flags visuais. */
export function spawnFrames(info, type) {
  const frames = [];
  let name = type.spawn, bright = false, trans = 0, paper = false;
  const seen = new Set();
  while (name && name !== 'S_NULL' && !seen.has(name) && frames.length < 40) {
    seen.add(name);
    const s = info.states.get(name);
    if (!s || s.spr === 'NULL') break;
    bright ||= s.bright; paper ||= s.paper; trans = s.trans || trans;
    if (s.anim) { for (let k = 0; k <= s.v1; k++) frames.push({ spr: s.spr, f: s.frame + k, t: Math.max(1, s.v2) }); }
    else frames.push({ spr: s.spr, f: s.frame, t: s.tics });
    if (s.tics < 0) break;
    name = s.next;
  }
  return { frames, bright, trans, paper };
}

if (process.argv[1]?.endsWith('objects.js')) {
  const info = parseInfo();
  console.log(info.states.size, 'estados', info.types.size, 'tipos');
  const want = process.argv.slice(2).map(Number);
  for (const [dn, t] of info.types) {
    if (want.length && !want.includes(dn)) continue;
    const sf = spawnFrames(info, t);
    console.log(dn, t.mt, `r${t.radius} h${t.height}`, t.flags.join('|'), sf.frames.slice(0, 4).map((f) => f.spr + f.f + '/' + f.t).join(' '), sf.bright ? 'FB' : '');
  }
}
