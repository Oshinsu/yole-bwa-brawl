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
