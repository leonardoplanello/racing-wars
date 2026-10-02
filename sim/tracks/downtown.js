// Downtown: metropole ao entardecer, ~4 min por volta (7,6 mil unidades de linha central).
// Grade de quarteirões de 165 u: avenida da largada, quarteiroes tecnicos, posto de gasolina, bairro antigo de
// paralelepipedo, patio das cegonhas, viaduto com salto para a rodovia e retorno pela avenida.
// Os pontos foram gerados em tools/ (cantos de 40 u de raio ligados por retas); edite no /editor/.

// ---- posto de gasolina na esquina de (660, 990): o atalho passa pelo canal estreito entre duas ilhas de bombas
// (sob a cobertura); bater numa bomba explode tudo. O resto do posto e a esquina larga normal.
const M = [610, 941]; // centro do canal
const D = [-0.822, 0.57]; // direcao de quem corta (de leste/norte para oeste/sul)
const Pn = [0.57, 0.822]; // lateral do canal
const at = (a, b) => [Math.round((M[0] + D[0] * a + Pn[0] * b) * 10) / 10, Math.round((M[1] + D[1] * a + Pn[1] * b) * 10) / 10];
const yawD = Math.atan2(D[1], D[0]);
const station = [];
for (const sg of [-1, 1]) for (const k of [-1, 1]) { const [x, z] = at(k * 1.25, sg * 3.3); station.push({ type: 'pump', x, z, yaw: yawD }); }
for (const sa of [-1, 1]) for (const sb of [-1, 1]) { const [x, z] = at(sa * 3.2, sb * 8.2); station.push({ type: 'pillar', x, z, render: true }); }
for (const x of [571, 580, 589]) station.push({ type: 'bldg', x, z: 914, h: 7, render: false });
station.push({ type: 'pillar', x: 598, z: 905, render: false }); // poste do totem

// ---- atalhos (cantos internos abertos): praca com fonte (esquina de (660,495)), beco entre predios (esquina de (-330,1650))
// e canteiro de obras (ao lado do trecho das obras). Todos opcionais: cortam caminho, mas tem obstaculos.
const shortcuts = [
  // A: praca
  { type: 'fountain', x: 697, z: 552 },
  { type: 'crate', x: 727, z: 524 }, { type: 'crate', x: 683, z: 580 },
];
{
  // B: beco de ~8 u de largura ao longo da diagonal do canto, entre dois blocos de predio (cadeias de circulos)
  const u = [-0.707, 0.707], w = [0.707, 0.707], c = [-382, 1597];
  for (const side of [-1, 1]) for (const k of [-1, 0, 1]) {
    shortcuts.push({ type: 'bldg', x: Math.round((c[0] + w[0] * side * 8.6 + u[0] * k * 9.2) * 10) / 10, z: Math.round((c[1] + w[1] * side * 8.6 + u[1] * k * 9.2) * 10) / 10, h: 16, yaw: Math.atan2(u[1], u[0]) });
  }
  // C: canteiro de obras: caixotes e postes de obra soltos no lote
  for (const [x, z] of [[900, 372], [945, 410], [1010, 386], [1060, 425], [975, 440]]) shortcuts.push({ type: 'crate', x, z });
  for (const [x, z] of [[925, 395], [990, 415], [1040, 390], [1085, 405], [958, 372]]) shortcuts.push({ type: 'cone', x, z });
}
export default {
  id: 'downtown',
  name: 'Downtown',
  scale: 1,
  halfWidth: 14,
  verge: 1.5,
  boundary: 'wall',
  baseSurface: 0, // asfalto
  wallStyle: 'building', // fachadas dos dois lados (muro solido)
  points: [
    [0,0], [45,0], [90,0], [136,0], [181,0], [226,0], [271,0], [317,0],
    [362,0], [407,0], [452,0], [498,0], [543,0], [588,0], [633,0], [679,0],
    [724,0], [769,0], [814,0], [860,0], [905,0], [950,0], [976,14], [990,40],
    [990,83], [990,125], [976,151], [950,165], [908,165], [865,165], [839,179], [825,205],
    [825,248], [825,290], [839,316], [865,330], [907,330], [948,330], [990,330], [1032,330],
    [1073,330], [1115,330], [1141,344], [1155,370], [1155,413], [1155,455], [1141,481], [1115,495],
    [1069,495], [1023,495], [977,495], [931,495], [884,495], [838,495], [792,495], [746,495],
    [700,495], [674,509], [660,535], [660,581], [660,627], [660,673], [660,719], [660,766],
    [660,812], [660,858], [660,904], [660,950], [646,976], [620,990], [574,990], [528,990],
    [482,990], [436,990], [389,990], [343,990], [297,990], [251,990], [205,990], [179,1004],
    [165,1030], [165,1073], [165,1115], [151,1141], [125,1155], [83,1155], [42,1155], [0,1155],
    [-42,1155], [-83,1155], [-125,1155], [-151,1141], [-165,1115], [-165,1073], [-165,1030], [-179,1004],
    [-205,990], [-247,990], [-290,990], [-316,1004], [-330,1030], [-330,1075], [-330,1119], [-330,1164],
    [-330,1208], [-330,1253], [-330,1298], [-330,1342], [-330,1387], [-330,1432], [-330,1476], [-330,1521],
    [-330,1565], [-330,1610], [-344,1636], [-370,1650], [-416,1650], [-462,1650], [-508,1650], [-554,1650],
    [-601,1650], [-647,1650], [-693,1650], [-739,1650], [-785,1650], [-811,1636], [-825,1610], [-825,1565],
    [-825,1520], [-825,1475], [-825,1431], [-825,1386], [-825,1341], [-825,1296], [-825,1251], [-825,1206],
    [-825,1161], [-825,1117], [-825,1072], [-825,1027], [-825,982], [-825,937], [-825,892], [-825,847],
    [-825,803], [-825,758], [-825,713], [-825,668], [-825,623], [-825,578], [-825,533], [-825,489],
    [-825,444], [-825,399], [-825,354], [-825,309], [-825,264], [-825,219], [-825,175], [-825,130],
    [-825,85], [-825,40], [-811,14], [-785,0], [-739,0], [-693,0], [-646,0], [-600,0],
    [-554,0], [-508,0], [-462,0], [-416,0], [-369,0], [-323,0], [-277,0], [-231,0],
    [-185,0], [-139,0], [-92,0], [-46,0],
  ],
  // larguras por trecho: bairro antigo estreito, esquina do posto bem larga
  widths: [
    { from: 0.432, to: 0.52, hw: 10 },
    { from: 0.335, to: 0.405, hw: 22 },
  ],
  surfaces: [{ from: 0.432, to: 0.52, type: 3 }], // paralelepipedo no bairro antigo
  // colinas: duas carretas-cegonha em fila (a primeira e a rampa, a segunda e o pouso) e o viaduto (sobe ~300 u, deck plano e
  // labio abrupto: o carro voa e cai na rodovia, que e a continuacao da pista no chao)
  hills: [
    { from: 0.5587, to: 0.5587, height: 5.5, rise: 34, fall: 0, rails: true, skin: 'truck' }, // rampa de carga: o salto
    { from: 0.5632, to: 0.5666, height: 3, rise: 18, fall: 22, rails: true, skin: 'truck' },
    { from: 0.735, to: 0.8, height: 7, rise: 300, fall: 0, rails: true, skin: 'viaduct' },
  ],
  walls: [
    { from: 0.5525, to: 0.572, style: 'jersey' }, // laterais das carretas
    { from: 0.69, to: 0.887, style: 'jersey' }, // viaduto e rodovia
  ],
  openZones: [
    { from: 0.352, to: 0.384, side: 1, floor: 0 }, // posto: o lado de dentro da esquina e aberto (praca do posto)
    { from: 0.296, to: 0.322, side: -1, floor: 0 }, // atalho A: praca com fonte (canto interno)
    { from: 0.6008, to: 0.6185, side: 1, floor: 0 }, // atalho B: beco entre predios
    { from: 0.196, to: 0.215, side: 1, floor: 0 }, // atalho C: canteiro de obras
    { from: 0.548, to: 0.576, side: 1, floor: 26 }, // lote ao lado das carretas: o desvio seguro
    { from: 0.7855, to: 0.7985, side: -1, floor: 0 }, // viaduto: guard-rail quebrado
  ],
  structures: [
    { type: 'floor', x: 690, z: 560, w: 100, d: 100 }, // praca (atalho A)
    { type: 'floor', x: -390, z: 1595, w: 110, d: 110 }, // beco (atalho B)
    { type: 'floor', x: 985, z: 405, w: 250, d: 110 }, // canteiro (atalho C)
    { type: 'gantry', at: 0.84, text: 'CENTRO' },
    { type: 'station', x: M[0], z: M[1], yaw: yawD, fx: 600, fz: 940, w: 90, d: 80, store: { x: 580, z: 914 }, totem: { x: 598, z: 905 } },
  ],
  boxes: [
    { x: M[0], z: M[1] }, // caixa dentro do canal do posto
    { x: -330, z: 1222.5, h: 5.3 }, // caixa flutuando entre as carretas: so quem salta pega
    { x: 990, z: 405 }, // canteiro de obras (atalho C)
    { x: -382, z: 1597 }, // beco (atalho B)
  ],
  // props urbanos: postes ao longo de toda a cidade (calcada), hidrantes alternados
  props: [
    { type: 'lamp', every: 34, from: 0, to: 0.69, side: 0 },
    { type: 'lamp', every: 34, from: 0.887, to: 0, side: 0 },
    { type: 'hydrant', every: 140, from: 0.02, to: 0.69, side: 0 },
  ],
  objects: [
    ...station,
    ...shortcuts,
    { type: 'cone', at: [0.5515, 'R'], inset: -3 },
    { type: 'cone', at: [0.5535, 'R'], inset: -3 },
    { type: 'crate', at: [0.551, 'R'], inset: -9 },
    { type: 'crate', at: [0.5545, 'R'], inset: -9 },
    { type: 'crate', at: [0.558, 'R'], inset: -9 },
    { type: 'crate', at: [0.5615, 'R'], inset: -9 },
    { type: 'cone', at: [0.7835, 'L'], inset: 1.6 },
    { type: 'cone', at: [0.7851, 'L'], inset: 1.6 },
    { type: 'cone', at: [0.7867, 'L'], inset: 1.6 },
    { type: 'cone', at: [0.7883, 'L'], inset: 1.6 },
    { type: 'cone', at: [0.7899, 'L'], inset: 1.6 },
    { type: 'cone', at: [0.7915, 'L'], inset: 1.6 },
    { type: 'cone', at: [0.7931, 'L'], inset: 1.6 },
    { type: 'cone', at: [0.7947, 'L'], inset: 1.6 },
    { type: 'cone', at: [0.7963, 'L'], inset: 1.6 },
    { type: 'cone', at: [0.7979, 'L'], inset: 1.6 },
    { type: 'cone', at: [0.794, -5] },
    { type: 'cone', at: [0.7955, -8.5] },
    { type: 'cone', at: [0.7968, -4] },
    { type: 'light', at: [0.119, 'R'], inset: 0.9 },
    { type: 'light', at: [0.138, 'R'], inset: 0.9 },
    { type: 'light', at: [0.157, 'R'], inset: 0.9 },
    { type: 'light', at: [0.176, 'R'], inset: 0.9 },
    { type: 'light', at: [0.216, 'R'], inset: 0.9 },
    { type: 'light', at: [0.235, 'R'], inset: 0.9 },
    { type: 'light', at: [0.298, 'R'], inset: 0.9 },
    { type: 'light', at: [0.36, 'R'], inset: 0.9 },
    { type: 'light', at: [0.422, 'R'], inset: 0.9 },
    { type: 'light', at: [0.441, 'R'], inset: 0.9 },
    { type: 'light', at: [0.482, 'R'], inset: 0.9 },
    { type: 'light', at: [0.501, 'R'], inset: 0.9 },
    { type: 'light', at: [0.52, 'R'], inset: 0.9 },
    { type: 'sign', at: [0.116, 'L'], inset: 0.8 },
    { type: 'sign', at: [0.173, 'L'], inset: 0.8 },
    { type: 'sign', at: [0.232, 'L'], inset: 0.8 },
    { type: 'sign', at: [0.295, 'L'], inset: 0.8 },
    { type: 'sign', at: [0.357, 'L'], inset: 0.8 },
    { type: 'sign', at: [0.419, 'L'], inset: 0.8 },
    { type: 'sign', at: [0.479, 'L'], inset: 0.8 },
    { type: 'sign', at: [0.517, 'L'], inset: 0.8 },
    { type: 'busstop', at: [0.045, 'L'], inset: 2.0 },
    { type: 'busstop', at: [0.095, 'L'], inset: 2.0 },
    { type: 'busstop', at: [0.21, 'L'], inset: 2.0 },
    { type: 'busstop', at: [0.34, 'L'], inset: 2.0 },
    { type: 'busstop', at: [0.56, 'L'], inset: 2.0 },
    { type: 'busstop', at: [0.93, 'L'], inset: 2.0 },
    { type: 'busstop', at: [0.97, 'L'], inset: 2.0 },
    { type: 'cone', at: [0.19, 5] },
    { type: 'cone', at: [0.1924, -5] },
    { type: 'cone', at: [0.1948, 5] },
    { type: 'cone', at: [0.1972, -5] },
    { type: 'cone', at: [0.1996, 5] },
    { type: 'cone', at: [0.202, -5] },
    { type: 'cone', at: [0.2044, 5] },
    { type: 'cone', at: [0.2068, -5] },
    { type: 'cone', at: [0.2092, 5] },
    { type: 'cone', at: [0.2116, -5] },
  ],
  boxGroups: [0.07, 0.2, 0.46, 0.64, 0.86],
  scenery: { trees: 0, rocks: 0, houses: 0 },
  theme: {
    kind: 'city',
    sky: ['#2b2f63', '#c4687d', '#ffb98a'],
    fog: [0xe0a07f, 160, 760],
    hemi: [0xffd2b0, 0x3b4058, 1.0],
    sun: [0xffb36b, 2.3, -60, 80, 50],
    exposure: 1.0,
  },
};
