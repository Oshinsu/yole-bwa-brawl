import assert from "node:assert/strict";
import * as THREE from "./mock-three.module.js";
import { stepDampedSpring } from "../src/core/math.js";
import { YoleVisual } from "../src/render/yole-visual.js";

function integrate(rate, target = 1, omega = 11.5, zeta = 0.82) {
  const spring = { value: 0, velocity: 0 };
  for (let frame = 0; frame < rate; frame++) {
    stepDampedSpring(spring, target, omega, zeta, 1 / rate);
  }
  return spring;
}

// Solution analytique : une cible constante donne le même résultat quelle que
// soit la cadence d'affichage.
{
  const at30 = integrate(30);
  const at60 = integrate(60);
  const at144 = integrate(144);
  assert.ok(Math.abs(at30.value - at60.value) < 1e-10);
  assert.ok(Math.abs(at30.velocity - at60.velocity) < 1e-10);
  assert.ok(Math.abs(at30.value - at144.value) < 1e-10);
  assert.ok(Math.abs(at30.velocity - at144.velocity) < 1e-10);

  const under = { value: 0, velocity: 0 };
  let maximum = 0;
  for (let frame = 0; frame < 180; frame++) {
    maximum = Math.max(maximum, stepDampedSpring(under, 1, 9, 0.58, 1 / 60));
  }
  assert.ok(maximum > 1.02, "le ressort sous-amorti ne produit aucun poids/rebond");

  const critical = integrate(60, 1, 9, 1);
  assert.ok(critical.value > 0.998 && critical.value < 1);
  const invalid = { value: NaN, velocity: Infinity };
  assert.equal(stepDampedSpring(invalid, NaN, NaN, NaN, NaN), 0);
  assert.ok(Number.isFinite(invalid.velocity));
}

function crewState(overrides = {}) {
  return {
    x: 0,
    y: 0.5,
    z: 0,
    heading: 0,
    speed: 12,
    roll: 0.42,
    pitch: 0,
    driveForce: 1,
    drive: 1,
    surf: 0,
    slip: 0,
    slipAngle: 0,
    counterSteer: 0,
    counterHeel: 0,
    counterSettle: 0,
    activeCrew: 6,
    crewPositions: new Float64Array(6).fill(0.58),
    crewVelocities: new Float64Array(6).fill(2.8),
    crewShift: 0.58,
    crewStumble: 0,
    crewStartDelays: new Float64Array(6),
    shiftTimer: 0.6,
    shiftDuration: 0.82,
    shiftElapsed: 0.24,
    shiftPrecision: 0.9,
    shiftKind: 2,
    shiftCatchTriggered: false,
    shiftLoadTargetAbs: 0.74,
    sailPower: 0.9,
    arcadeBoostForward: 0,
    arcadeBoostLateral: 0,
    lateralBoostDirection: 0,
    yawRate: 0,
    flow: 0.5,
    centerWaterHeight: 0.35,
    lastBowWaterHeight: 0.35,
    waterMassKg: 0,
    flooding: new Float64Array(6),
    eliminated: false,
    sink: 0,
    cohesion: 1,
    structure: {
      hull: 1,
      mast: 1,
      sail: 1,
      bwa: new Float64Array([1, 1, 1, 1])
    },
    ...overrides
  };
}

// Le front physique charge le ressort une seule fois. Un booléen collant ne
// doit pas transformer le bwa en trampoline permanent.
{
  const visual = new YoleVisual(THREE, 0xffb000, 0x25e0ff, 0);
  const weather = { stormAmount: 0 };
  const state = crewState();
  const before = JSON.stringify(state);
  visual.update(state, 0, 1 / 60, weather);
  assert.equal(visual.counterHeelLoadSpring.value, 0);
  assert.ok(visual.crewMomentumSpring.value > 0);
  assert.equal(JSON.stringify(state), before, "le ressort visuel a muté la simulation");

  state.shiftCatchTriggered = true;
  visual.update(state, 1 / 60, 1 / 60, weather);
  const firstLoad = visual.counterHeelLoadSpring.value;
  assert.ok(firstLoad > 0.18, `prise de charge trop légère: ${firstLoad}`);
  assert.equal(visual.counterHeelCatchSeen, true);
  assert.ok(
    visual.beams.some((entry) => Math.abs(entry.root.rotation.z) > 0.003),
    "la vraie prise de charge ne fléchit aucun bwa"
  );

  for (let frame = 0; frame < 120; frame++) {
    state.shiftElapsed += 1 / 60;
    visual.update(state, (frame + 2) / 60, 1 / 60, weather);
  }
  assert.ok(
    Math.abs(visual.counterHeelLoadSpring.value) < 1e-5,
    "le booléen collant réinjecte la prise de charge"
  );
  assert.equal(visual.counterHeelCatchSeen, true);

  // Nouveau geste : le recul d'elapsed et le front false/true réarment une seule
  // impulsion même si le rendu avait manqué une frame intermédiaire.
  state.shiftElapsed = 0;
  state.shiftCatchTriggered = false;
  visual.update(state, 2.1, 1 / 60, weather);
  state.shiftElapsed = 0.24;
  state.shiftCatchTriggered = true;
  visual.update(state, 2.1 + 1 / 60, 1 / 60, weather);
  assert.ok(visual.counterHeelLoadSpring.value > 0.18);

  const reset = crewState({
    driveForce: 0,
    drive: 0,
    roll: 0,
    crewPositions: new Float64Array(6),
    crewVelocities: new Float64Array(6),
    crewShift: 0,
    shiftTimer: 0,
    shiftDuration: 0,
    shiftElapsed: 0,
    shiftPrecision: 0,
    shiftKind: 0,
    shiftCatchTriggered: false,
    shiftLoadTargetAbs: 0
  });
  visual.update(reset, 3, 1 / 60, weather);
  assert.deepEqual(visual.crewMomentumSpring, { value: 0, velocity: 0 });
  assert.deepEqual(visual.counterHeelLoadSpring, { value: 0, velocity: 0 });
  assert.equal(visual.counterHeelCatchSeen, false);
}

console.log(JSON.stringify({
  ok: true,
  springRates: [30, 60, 144],
  momentum: { omega: 11.5, zeta: 0.82 },
  load: { omega: 17, zeta: 0.68 }
}, null, 2));
