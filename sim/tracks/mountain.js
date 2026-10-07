// Passo da Montanha: serra de terra e pedra, ~2,6 min por volta (~5,9 mil u).
// Mesmo estilo da pista de teste (terra, rampas de salto, precipicios sem grade, platô alto) com tres trechos no fim da volta:
// uma PRAIA com o mar a esquerda, a SUBIDA em serpentina (montanha a esquerda, queda a direita, caixas na beirada) e, na descida,
// uma PONTE seguida de uma RAMPA. As rampas de salto ficam sempre em reta: o carro decola reto e pousa na estrada.
// A volta e horaria: a subida curva a esquerda (arco de ~200 graus em volta da montanha) e o grampo do topo volta a direita.
export default {
  id: 'mountain',
  name: 'Passo da Montanha',
  scale: 2.3,
  halfWidth: 14,
  verge: 1.5,
  boundary: 'wall',
  baseSurface: 2, // terra
  openLand: true, // em terra da para sair da estrada (muros solidos so na ponte e na parede da montanha)
  points: [
    [0, -110], [80, -112], [160, -104], [228, -70],
    [250, -10], [226, 50], [176, 82], [210, 124],
    [250, 168], [226, 214], [166, 238], [105, 234],
    [44, 233], [-16, 228], [-72, 218], [-128, 206],
    [-180, 170], [-212, 112], [-204, 48], [-222, -10],
    [-226.1, -56.5], [-227, -126.1], [-225.2, -191.3], [-223.9, -256.5],
    [-211.2, -287.3], [-180.4, -300], [-149.2, -306.9], [-123.8, -326.4],
    [-109, -354.8], [-107.6, -386.7], [-119.9, -416.3], [-143.5, -437.9],
    [-174, -447.5], [-205.7, -443.4], [-235.7, -444.9], [-256, -466.9],
    [-254.7, -496.8], [-232.6, -517.1], [-143.5, -539.1], [-73.9, -545.7],
    [-43.2, -532.9], [-30.4, -502.2], [-30.4, -434.8], [-30.4, -369.6],
    [-30.4, -300], [-31.3, -217.4], [-30.4, -173.9], [-27, -145.7],
    [-17.4, -123.9],
  ],
  surfaces: [
    { from: 0.4967, to: 0.5786, type: 8 }, // praia: areia
    { from: 0.2493, to: 0.352, type: 3 }, // trecho de pedra nos grampos
    { from: 0.5803, to: 0.7578, type: 3 }, // pedra na subida
  ],
  bridges: [
    { from: 0.988, to: 0.0594 }, // ponte de madeira sobre o desfiladeiro, passa pela largada
    { from: 0.8585, to: 0.8824 }, // ponte da descida (reta, ao nivel do chao)
  ],
  hills: [
    { from: 0.1782, to: 0.2257, height: 7, rise: 80, fall: 40, rails: false }, // subida da serra ate um patamar
    { from: 0.3004, to: 0.3004, height: 3.6, rise: 20, fall: 0, rails: true }, // rampa de salto (em reta)
    { from: 0.3497, to: 0.3497, height: 3.6, rise: 20, fall: 0, rails: true }, // rampa de salto (em reta)
    { from: 0.4295, to: 0.4826, height: 12, rise: 70, fall: 70, rails: false }, // platô do cume
    { from: 0.7083, to: 0.7561, height: 22, rise: 620, fall: 480, rails: false }, // subida em volta da montanha, cume e descida
    { from: 0.9251, to: 0.9251, height: 3.6, rise: 20, fall: 0, rails: true }, // rampa de salto apos a ponte (em reta)
  ],
  // precipicios sem cerca: nas curvas de serra, a direita da subida (queda), no grampo do topo e o MAR a esquerda da praia
  chasms: [
    { from: 0.095, to: 0.1603, side: -1, width: 60 },
    { from: 0.2611, to: 0.2939, side: 1, width: 55 },
    { from: 0.5001, to: 0.5701, side: -1, gap: 30, width: 420, water: true }, // oceano
    { from: 0.6013, to: 0.7578, side: 1, width: 70 }, // queda a direita da subida
    { from: 0.6998, to: 0.7578, side: -1, width: 60 },
  ],
  solidWalls: [{ from: 0.6013, to: 0.6998, side: -1 }], // a montanha: parede solida a esquerda da subida
  widths: [{ from: 0.0594, to: 0.101, hw: 11 }], // garganta estreita depois da ponte
  boxGroups: [0.0416, 0.1188, 0.19, 0.2669, 0.3383, 0.4057, 0.538, 0.905],
  boxRows: [{ from: 0.6093, to: 0.751, every: 60, side: 'R', inset: 4 }], // caixas na beirada da queda
  scenery: { trees: 420, rocks: 220, houses: 0 },
  theme: {
    kind: 'mountain',
    sky: ['#3d6fb0', '#8fb8e0', '#e6f0f7'],
    fog: [0xc3d6e6, 170, 780],
    hemi: [0xd8e8ff, 0x5c6068, 1.1],
    sun: [0xfff4e0, 2.5, -50, 95, 35],
    exposure: 1.05,
  },
};
