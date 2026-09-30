// Pista de teste: circuito simples de ~1 min por volta (as pistas finais terao ~5 min).
export default {
  id: 'test',
  name: 'Ponte do Rio (teste)',
  scale: 1.7,
  halfWidth: 10,
  verge: 3,
  boundary: 'wall',
  // reta de largada no topo (z negativo = parte de cima da tela), sentido horario na tela
  points: [
    [0, -70], [70, -70],
    [120, -60], [150, -25], [140, 20], [100, 48],
    [55, 32], [20, 52], [-20, 72],
    [-70, 82], [-125, 62], [-150, 15], [-140, -35], [-110, -62],
    [-70, -70],
  ],
  surfaces: [{ from: 0.55, to: 0.68, type: 2 }], // trecho de terra (menos aderencia)
  bridges: [{ from: 0.94, to: 0.2 }], // ponte de madeira sobre o rio, passa pela largada
  boxGroups: [0.1, 0.22, 0.34, 0.46, 0.58, 0.7, 0.82, 0.93],
  theme: { ground: 0x4fae4f, road: 0x3b3f46, edge: 0xf4f4f4, wall: 0xd94f4f, wallTop: 0xffffff, dirt: 0xb0824a, sky: 0x8fd3ff },
};
