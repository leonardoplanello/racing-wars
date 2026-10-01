// Pista de teste: ~1 min por volta (as pistas finais terao ~5 min).
// Estrada de terra com sulcos, praca de paralelepipedo e ponte de madeira sobre o rio.
export default {
  id: 'test',
  name: 'Ponte do Rio (teste)',
  scale: 2.1,
  halfWidth: 14,
  verge: 1.5,
  boundary: 'wall',
  baseSurface: 2, // terra
  openLand: true, // em terra da para sair da estrada (so a ponte tem muros solidos)
  // reta de largada no topo (z negativo = parte de cima da tela), sentido horario na tela
  points: [
    [0, -70], [70, -70],
    [120, -60], [150, -25], [140, 20], [100, 48],
    [55, 32], [20, 52], [-20, 72],
    [-70, 82], [-125, 62], [-150, 15], [-140, -35], [-110, -62],
    [-70, -70],
  ],
  surfaces: [{ from: 0.42, to: 0.56, type: 3 }], // praca de paralelepipedo
  bridges: [{ from: 0.94, to: 0.2 }], // ponte de madeira sobre o rio, passa pela largada
  boxGroups: [0.1, 0.22, 0.34, 0.46, 0.58, 0.7, 0.82, 0.93],
  theme: {},
};
