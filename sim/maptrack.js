// Pista a partir de um mapa do SRB2Kart (dados de tools/srb2kart/build.js). Reaproveita o buildTrack para a linha central
// (progresso, IA, camera, voltas) e acrescenta `track.map` (MapWorld): chao com rampas e pisos 3D, paredes pelas linhas do
// mapa e pisos especiais. A fisica do carro (sim/car.js) usa `track.map` quando existe.
import { buildTrack } from './track.js';
import { MapWorld } from './mapworld.js';

const noScenery = {
  pumps: [], props: [], trees: [], rocks: [], houses: [],
  query(x, z, r, buf = []) { buf.length = 0; return buf; },
  restore() {}, blast() { return []; }, freeze() { return []; }, ignite() {},
};

export function buildMapTrack(d) {
  const c = d.center;
  const n = c.x.length;
  const def = {
    name: d.name, id: d.id, laps: d.laps,
    points: c.x.map((x, i) => [x, c.z[i]]),
    halfWidth: c.hw.reduce((a, b) => a + b, 0) / n, verge: 0.5, boundary: 'wall',
    // caixas de item: y = piso do ponto
    boxes: d.boxes.map((b) => ({ x: b.x, z: b.z, y: 0 })),
    theme: d.theme || { sky: [0x5aa8ff, 0xbfe3ff, 0xffffff], fog: [0xbfe3ff, 260, 1100] },
    mapName: d.map, subtitle: d.subtitle,
  };
  const track = buildTrack(def, 1);
  const world = new MapWorld(d);
  const N = track.N;
  // arrays por amostra a partir dos da linha central (mesma ordem, mesmo comprimento aproximado)
  for (let i = 0; i < N; i++) {
    const f = (i / N) * n, a = Math.floor(f) % n, b = (a + 1) % n, t = f - Math.floor(f);
    track.HW[i] = Math.max(2, c.hw[a] + (c.hw[b] - c.hw[a]) * t);
    track.ELEV[i] = c.y[a] + (c.y[b] - c.y[a]) * t;
  }
  // altura (y) de cada caixa e dos pontos de largada
  const tmp = { y: 0, sec: 0, fof: -1, nx: 0, ny: 1, nz: 0 };
  for (let i = 0; i < def.boxes.length; i++) {
    const b = d.boxes[i];
    const si = world.locate(b.x, b.z);
    world.surfaceIn(si, b.x, b.z, world.floorAt(si, b.x, b.z) + b.zoff + world.stepUp, tmp);
    def.boxes[i].y = tmp.y + b.zoff;
    if (b.zoff > 4 * d.scale * 16) def.boxes[i].h = b.zoff; // flutuando bem acima do chao: so quem esta no ar pega
  }
  track.map = world;
  track.stepUp = world.stepUp;
  track.hasElev = false;
  track.scenery = noScenery;
  track.starts = d.starts;
  track.springs = d.springs || {};
  track.assists = d.assists || [];
  track.pads = d.pads || {};
  track.hardWall = () => true;
  // chao em (x,z) para corpos soltos (carro atordoado, carcaca, pneus, minas): o do mapa, na altura y (ou perto da pista)
  const baseGround = track.groundAt.bind(track);
  track.groundAt = (x, z, hint, out = { y: 0, nx: 0, ny: 1, nz: 0 }, y) => {
    const nr = track._gn || (track._gn = track.newNear());
    track.nearest(x, z, hint ?? -1, nr);
    world.groundAt(x, z, y ?? track.elevAt(nr.s) + 1, out);
    return out;
  };
  track.baseGroundAt = baseGround;
  track.groundFromNear = (nr, out) => { out.y = track.elevAt(nr.s); out.nx = 0; out.ny = 1; out.nz = 0; return out; };
  return track;
}
