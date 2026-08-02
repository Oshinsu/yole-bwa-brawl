import assert from "node:assert/strict";
import { WaveField } from "../src/sim/waves.js";
import { YoleDynamics } from "../src/sim/yole-physics.js";

const FIXED = 1 / 60;

function environment(waveField) {
  return {
    time: 0,
    windX: 3.2,
    windZ: 15.2,
    coastPenalty: 0,
    waveScratch: {},
    pointScratch: {},
    centerScratch: {},
    sampleDisturbance: () => 0
  };
}

function scenario(action = "control") {
  const waves = new WaveField();
  waves.setWeather(0.2);
  const boat = new YoleDynamics(7, waves);
  const env = environment(waves);
  boat.x = 0;
  boat.z = 0;
  boat.y = 0.48;
  boat.vx = 0;
  boat.vz = 15;
  boat.heading = 0;
  boat.roll = action === "shift" || action === "passive-heel" ? 0.68 : 0;
  boat.rollVel = action === "shift" || action === "passive-heel" ? 0.25 : 0;
  boat.flow = 0.8;
  boat.boost = 0;
  boat.arcadeBoostForward = 0;
  boat.arcadeBoostLateral = 0;
  boat.boostCooldown = 0;

  let result = null;
  if (action === "turbo") result = boat.triggerForwardBoost();
  if (action === "dash") result = boat.triggerLateralBoost(1);
  if (action === "shift") result = boat.triggerShift();

  const immediate = {
    vx: boat.vx,
    vz: boat.vz,
    flow: boat.flow,
    boost: boat.boost,
    turbo: boat.arcadeBoostForward,
    dash: boat.arcadeBoostLateral,
    rollVel: boat.rollVel
  };
  let sustainedTurbo = 0;
  let rollAtOneSecond = boat.roll;
  for (let tick = 0; tick < 90; tick++) {
    env.time += FIXED;
    boat.fixedStep(FIXED, { steer: 0, trim: 0.84 }, env);
    if (tick === 59) {
      sustainedTurbo = boat.arcadeBoostForward;
      rollAtOneSecond = boat.roll;
    }
  }

  return {
    result,
    immediate,
    sustainedTurbo,
    rollAtOneSecond,
    final: {
      x: boat.x,
      z: boat.z,
      vx: boat.vx,
      vz: boat.vz,
      flow: boat.flow,
      boost: boat.boost,
      roll: boat.roll
    }
  };
}

const control = scenario();
const turbo = scenario("turbo");
const dash = scenario("dash");
const passiveHeel = scenario("passive-heel");
const shift = scenario("shift");

// Turbo: modest launch, then a clearly sustained longitudinal push funded by Flow.
assert.equal(turbo.result, true);
assert.ok(turbo.immediate.vz - 15 > 2.5 && turbo.immediate.vz - 15 < 4.5, "turbo launch became an instantaneous dash");
assert.ok(turbo.immediate.flow < control.immediate.flow - 0.25, "turbo charge did not consume enough Flow");
assert.ok(turbo.sustainedTurbo > 0.25, "turbo thrust did not survive for one second");
assert.ok(turbo.final.z - control.final.z > 8, "turbo lacks sustained longitudinal reach");

// Dash: large transverse impulse, only a small forward nudge, no hidden generic boost.
assert.ok(dash.immediate.vx > 9, "dash lacks a clean lateral impulse");
assert.ok(dash.immediate.vz - 15 > 0.8 && dash.immediate.vz - 15 < 2, "dash forward nudge overlaps the turbo");
assert.equal(dash.immediate.boost, 0, "dash leaked into generic forward boost");
assert.ok(dash.final.x > 4, "dash lacks measurable lateral displacement");
assert.ok(dash.final.z - control.final.z < 2, "dash acquired turbo-like longitudinal reach");

// BWA Shift: timing rewards crew recovery and Flow, never forward boost.
assert.equal(shift.result.critical, true);
assert.ok(shift.result.precision > 0.75, "well-timed Shift missed its precision window");
assert.equal(shift.immediate.boost, 0, "BWA Shift became a boost substitute");
assert.ok(shift.immediate.flow > 0.95, "well-timed Shift did not reward Flow");
assert.ok(
  Math.abs(shift.rollAtOneSecond) < Math.abs(passiveHeel.rollAtOneSecond) * 0.55,
  `BWA Shift did not create decisive counter-heel: shift=${shift.rollAtOneSecond.toFixed(4)}, passive=${passiveHeel.rollAtOneSecond.toFixed(4)}`
);
assert.ok(shift.final.z - control.final.z < 1, "BWA Shift gained turbo-like forward distance");

// Same initial state and inputs must remain bit-for-bit reproducible.
assert.deepEqual(scenario("turbo"), turbo, "turbo is not deterministic");
assert.deepEqual(scenario("dash"), dash, "dash is not deterministic");
assert.deepEqual(scenario("shift"), shift, "BWA Shift is not deterministic");

console.log(JSON.stringify({
  ok: true,
  turbo: {
    launchGain: turbo.immediate.vz - 15,
    flowCost: 0.8 - turbo.immediate.flow,
    thrustAtOneSecond: turbo.sustainedTurbo,
    forwardLeadAtOnePointFiveSeconds: turbo.final.z - control.final.z
  },
  dash: {
    lateralImpulse: dash.immediate.vx,
    forwardNudge: dash.immediate.vz - 15,
    lateralDistanceAtOnePointFiveSeconds: dash.final.x,
    forwardLeadAtOnePointFiveSeconds: dash.final.z - control.final.z
  },
  shift: {
    precision: shift.result.precision,
    immediateBoost: shift.immediate.boost,
    rollAtOneSecond: shift.rollAtOneSecond,
    passiveRollAtOneSecond: passiveHeel.rollAtOneSecond,
    forwardLeadAtOnePointFiveSeconds: shift.final.z - control.final.z
  }
}, null, 2));
