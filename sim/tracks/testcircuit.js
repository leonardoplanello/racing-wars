// Pista de teste: ~1,5 min por volta (as pistas finais terao ~5 min).
// Ponte de madeira sobre o rio na largada, estrada de terra com sulcos, rampas de salto, curvas fechadas,
// praca de paralelepipedo e uma area alta (plateau) sem guardrails: dali da para cair.
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
    [0, -100], [90, -100], [175, -95], // ponte e reta de largada
    [240, -60], [268, 0], [255, 62], // curva longa a direita
    [215, 108], [165, 138], // reta para a rampa de salto 1
    [112, 152], [72, 176], [32, 150], [-6, 178], [-50, 160], // zigue-zague de curvas fechadas
    [-100, 150], [-150, 124], [-188, 78], // rampa de salto 2 e curva
    [-204, 20], [-200, -34], // area alta sem guardrails
    [-176, -80], [-134, -102], [-90, -106], // volta ao topo
  ],
  surfaces: [{ from: 0.5, to: 0.64, type: 3 }], // praca de paralelepipedo no zigue-zague
  bridges: [{ from: 0.94, to: 0.12 }], // ponte de madeira sobre o rio, passa pela largada
  // rampas de salto: sobe suave e termina em labio; plateau alto com subida e descida suaves e sem cerca
  hills: [
    { from: 0.37, to: 0.37, height: 3.4, rise: 20, fall: 0, rails: true },
    { from: 0.64, to: 0.64, height: 3.4, rise: 20, fall: 0, rails: true },
    { from: 0.77, to: 0.84, height: 9, rise: 46, fall: 46, rails: false },
  ],
  // precipicio na parte externa da curva grande do leste: fosso fundo sem cerca (quem cai morre)
  chasms: [{ from: 0.17, to: 0.29, side: -1, width: 55 }],
  boxGroups: [0.08, 0.2, 0.3, 0.45, 0.58, 0.7, 0.88],
  theme: {},
};
