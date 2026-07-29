import { performance } from 'node:perf_hooks';
import { WaveField } from '../src/sim/waves.js';
import { YoleDynamics } from '../src/sim/yole-physics.js';

const waves = new WaveField();
const boats = Array.from({ length: 4 }, (_, id) => {
  const boat = new YoleDynamics(id, waves);
  boat.reset((id - 1.5) * 5.2, -id * 2.4, 0);
  return boat;
});
const dt = 1 / 60;
const ticks = 120000;
const environment = {
  time: 0, windX: 4.0, windZ: 15.0, coastPenalty: 0,
  waveScratch: {}, pointScratch: {}, centerScratch: {},
  sampleDisturbance: () => 0
};
const start = performance.now();
for (let tick = 0; tick < ticks; tick++) {
  environment.time = tick * dt;
  waves.setWeather(Math.min(0.7, tick / ticks));
  for (let id = 0; id < boats.length; id++) {
    boats[id].fixedStep(dt, { steer: Math.sin(tick * 0.003 + id) * 0.5, trim: 0.82 }, environment);
    if (tick % 1800 === id * 97) boats[id].triggerShift();
  }
}
const elapsedMs = performance.now() - start;
const steps = ticks * boats.length;
const boatStepsPerSecond = Math.round(steps / (elapsedMs / 1000));
console.log(JSON.stringify({
  ok: true, ticks, boats: boats.length, boatSteps: steps,
  elapsedMs: Number(elapsedMs.toFixed(2)),
  boatStepsPerSecond
}, null, 2));

// Garde-fou anti-régression : la référence mesurée est ~106k pas-yole/s (voir TEST_REPORT.md).
// Le seuil reste volontairement large pour tolérer les machines lentes ; YOLE_BENCH_MIN le durcit.
const minRate = Number(process.env.YOLE_BENCH_MIN ?? 60000);
if (boatStepsPerSecond < minRate) {
  console.error(`benchmark regression: ${boatStepsPerSecond} pas-yole/s < seuil ${minRate} (YOLE_BENCH_MIN)`);
  process.exit(1);
}
