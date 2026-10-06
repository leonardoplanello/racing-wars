// Lista as fases do maps.kart com os dados do SOC_MAIN e um resumo do que cada mapa tem.
//   node tools/srb2kart/list.js [race|battle|all]
import path from 'node:path';
import { Wad, mapLabels } from './wad.js';
import { readMap } from './map.js';
import { parseSoc } from './soc.js';
import { DEFAULT_OUT } from './extract.js';

const which = process.argv[2] || 'race';
const wad = Wad.open(path.join(DEFAULT_OUT, 'maps.kart'));
const soc = parseSoc(wad.get('SOC_MAIN').toString('latin1'));
for (const { name, i } of mapLabels(wad)) {
  const h = soc.get(name);
  if (which === 'race' && !h?.race) continue;
  if (which === 'battle' && !h?.battle) continue;
  const m = readMap(wad, i);
  const t = (type) => m.things.filter((x) => x.type === type).length;
  const starts = m.things.filter((x) => x.type >= 1 && x.type <= 16).length;
  console.log(`${name} ${(h?.name || '?').padEnd(24)} ${(h?.subtitle || '').padEnd(22)} voltas=${h?.laps ?? '?'} setores=${String(m.sectors.length).padStart(5)} linhas=${String(m.lines.length).padStart(5)} largadas=${starts} caixas=${t(2000)} waypoints=${t(292)} starposts=${t(502)} fof=${m.lines.filter((l) => l.special >= 100 && l.special <= 259).length} rampas=${m.lines.filter((l) => (l.special >= 700 && l.special <= 722)).length}`);
}
