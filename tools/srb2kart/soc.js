// Cabecalhos de fase do SRB2Kart (lump SOC_MAIN): blocos "Level N" seguidos de "Chave = Valor" ate a linha em branco
// (dehacked.c: readlevelheader). N e decimal (1..99) ou letras em base 36 (AA..ZZ).
import { mapName } from './wad.js';

const num = (s) => {
  if (/^\d+$/.test(s)) return Number(s);
  const m = /^([A-Z])([0-9A-Z])$/i.exec(s);
  if (!m) return 0;
  const v = (c) => (c >= '0' && c <= '9' ? c.charCodeAt(0) - 48 : c.toUpperCase().charCodeAt(0) - 65 + 10);
  return 100 + (m[1].toUpperCase().charCodeAt(0) - 65) * 36 + v(m[2]);
};

/** Devolve um Map nomeDoMapa -> { name, subtitle, race, battle, laps, sky, music, weather, sectionRace, noZone }. */
export function parseSoc(text) {
  const out = new Map();
  let cur = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) { cur = null; continue; }
    const head = /^Level\s+(\S+)$/i.exec(line);
    if (head) {
      const n = num(head[1]);
      if (!n) { cur = null; continue; }
      cur = { number: n, map: mapName(n), name: '', subtitle: '', types: [], laps: 3, sky: 1, music: '', weather: '', sectionRace: false, noZone: false };
      out.set(cur.map, cur);
      continue;
    }
    if (!cur) continue;
    const kv = /^([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!kv) continue;
    const k = kv[1].toLowerCase(), v = kv[2].trim();
    if (k === 'levelname') cur.name = v;
    else if (k === 'subtitle') cur.subtitle = v;
    else if (k === 'typeoflevel') cur.types = v.split(',').map((t) => t.trim().toLowerCase());
    else if (k === 'numlaps') cur.laps = Number(v) || 3;
    else if (k === 'skynum') cur.sky = Number(v) || 1;
    else if (k === 'music') cur.music = v;
    else if (k === 'weather') cur.weather = v;
    else if (k === 'sectionrace') cur.sectionRace = /^(true|yes|1)$/i.test(v);
    else if (k === 'nozone') cur.noZone = /^(true|yes|1)$/i.test(v);
  }
  for (const l of out.values()) { l.race = l.types.includes('race'); l.battle = l.types.includes('battle') || l.types.includes('match'); }
  return out;
}
