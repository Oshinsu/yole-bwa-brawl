import assert from 'node:assert/strict';

class FakeGradient { addColorStop() {} }
class FakeContext2D {
  fillRect() {} save() {} restore() {} translate() {} rotate() {} scale() {}
  beginPath() {} ellipse() {} fill() {} arc() {} stroke() {}
  createRadialGradient() { return new FakeGradient(); }
}
class FakeCanvas {
  constructor(width = 256, height = 256) { this.width = width; this.height = height; }
  getContext() { return new FakeContext2D(); }
}
globalThis.OffscreenCanvas = FakeCanvas;
globalThis.document = { createElement: () => new FakeCanvas() };

const THREE = await import('./mock-three.module.js');
const { PersistentWakeField } = await import('../src/render/ocean.js');
const { WakeGrid } = await import('../src/sim/wake-grid.js');

{
  const grid = new WakeGrid({ resolution: 32, worldSize: 64 });
  grid.centerX = 37;
  grid.centerZ = -18;
  grid.accumulator = 0.021;
  grid.height[5] = 1;
  grid.velocity[5] = 2;
  grid.foam[5] = 3;
  grid.clear();
  assert.equal(grid.centerX, 0, 'clear must reset the inherited wake origin');
  assert.equal(grid.centerZ, 0, 'clear must reset the inherited wake origin');
  assert.equal(grid.accumulator, 0, 'clear must reset the inherited fixed-step phase');
  assert.equal(grid.height[5] + grid.velocity[5] + grid.foam[5], 0);

  grid.recenter(500, -400);
  assert.equal(grid.centerX, 500, 'a large recenter must preserve its requested new origin');
  assert.equal(grid.centerZ, -400, 'a large recenter must preserve its requested new origin');
}

const wake = new PersistentWakeField(THREE, { resolution: 128, worldSize: 120, maxStamps: 16 });
wake.trail(0, 0, 0, 18, 1.2);
const trailInitial = wake.sample(0, 0);
assert.ok(trailInitial > 0.05, `trail was not physically sampleable: ${trailInitial}`);
wake.update(0.4, 0, 0);
const trailAfter = wake.sample(0, 0);
assert.ok(trailAfter > 0 && trailAfter < trailInitial, 'trail did not persist/fade correctly');

wake.burst(8, 3, 5, 2);
const burstNearRing = wake.sample(13, 3);
assert.ok(burstNearRing > 0.05, `burst ring was not sampled: ${burstNearRing}`);
for (let index = 0; index < 420; index++) wake.update(1 / 60, 0, 0);
assert.ok(wake.sample(0, 0) < 0.01, 'wake never decayed');

console.log(JSON.stringify({ ok: true, trailInitial, trailAfter, burstNearRing, activeAfterDecay: wake.stamps.filter((stamp) => stamp.active).length }, null, 2));
