import assert from "node:assert/strict";
import { handlingCue, handlingWaterMix } from "../src/game/handling-feedback.js";

assert.equal(handlingCue({}, 0).mode, "stable");
assert.equal(handlingCue({ surf: 0.72, slip: 0.1 }, 0.1).mode, "surf");
assert.equal(handlingCue({ surf: 0.1, slip: 0.48, counterSteer: 0.05 }, 0.1).mode, "drift");
assert.equal(handlingCue({ surf: 0.1, slip: 0.48, counterSteer: 0.52 }, 0.1).mode, "recover");
assert.equal(handlingCue({ surf: 1, slip: 1, counterSteer: 1 }, 0.7).mode, "danger",
  "danger must always override positive handling cues");
assert.equal(handlingCue({ surf: 1, slip: 1, counterSteer: 1 }, 0.9).mode, "critical");

const calm = handlingWaterMix({}, 0.2, 0);
const fast = handlingWaterMix({}, 0.9, 0.2);
const surfing = handlingWaterMix({ surf: 0.9 }, 0.9, 0.2);
const recovery = handlingWaterMix({ surf: 0.9, slip: 0.7, counterSteer: 0.8 }, 0.9, 0.2);
assert.ok(fast.gain > calm.gain && fast.rate > calm.rate);
assert.ok(surfing.gain > fast.gain && surfing.rate > fast.rate);
assert.ok(recovery.gain > surfing.gain && recovery.rate > surfing.rate);
assert.ok(recovery.gain <= 0.72, "continuous water bed must remain bounded below combat transients");
assert.deepEqual(
  handlingWaterMix({ surf: 5, slip: 5, counterSteer: 5 }, 5, 5),
  handlingWaterMix({ surf: 1, slip: 1, counterSteer: 1 }, 1, 1),
  "untrusted/debug state must be clamped"
);

console.log(JSON.stringify({
  ok: true,
  cues: ["stable", "surf", "drift", "recover", "danger", "critical"],
  waterMix: { calm, fast, surfing, recovery }
}, null, 2));
