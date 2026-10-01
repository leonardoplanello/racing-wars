// Inspeciona a dinamica do carro: node tools/dyn.js
import { buildTrack } from '../sim/track.js';
import tc from '../sim/tracks/testcircuit.js';
import { makeCar, placeCar, stepCar, updateProgress, DT } from '../sim/car.js';
const mk = (surfaces) => buildTrack({ ...tc, bridges: [], baseSurface: surfaces });
for (const [name, base] of [['asfalto', 0], ['terra', 2]]) {
  const tr = mk(base);
  const car = makeCar(0);
  placeCar(car, tr, 100, 0);
  car.locked = false;
  const log = [];
  for (let i = 0; i < 120 * 6; i++) {
    car.steer = i > 120 * 2 ? 1 : 0;
    stepCar(car, tr, DT, []); updateProgress(car, tr);
    if (i === 120 * 1) log.push(`t=1s speed=${car.speed.toFixed(1)}`);
    if (i === 120 * 2 - 1) log.push(`t=2s speed=${car.speed.toFixed(1)}`);
    if (i === 120 * 3) log.push(`t=3s speed=${car.speed.toFixed(1)} w=${car.w.toFixed(2)} slip=${car.slip.toFixed(1)}`);
    if (i === 120 * 5) log.push(`t=5s speed=${car.speed.toFixed(1)} w=${car.w.toFixed(2)} slip=${car.slip.toFixed(1)} R=${(car.speed / Math.abs(car.w)).toFixed(1)}`);
  }
  console.log(name, log.join(' | '));
}
