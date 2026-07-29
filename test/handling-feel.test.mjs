import assert from "node:assert/strict";
import { YoleDynamics, YOLE_HANDLING } from "../src/sim/yole-physics.js";

const FIXED = 1 / 60;

class FlatWave {
  constructor(slopeX = 0, slopeZ = 0) {
    this.slopeX = slopeX;
    this.slopeZ = slopeZ;
  }

  sample(_x, _z, _time, out = {}) {
    out.height = 0;
    out.velocityY = 0;
    out.slopeX = this.slopeX;
    out.slopeZ = this.slopeZ;
    return out;
  }
}

function environment(wave, windX = 0, windZ = 0) {
  return {
    time: 0,
    windX,
    windZ,
    coastPenalty: 0,
    waveScratch: {},
    pointScratch: {},
    centerScratch: {},
    sampleDisturbance: () => 0,
    wave
  };
}

function step(boat, env, ticks, input) {
  for (let tick = 0; tick < ticks; tick++) {
    env.time += FIXED;
    boat.fixedStep(FIXED, input, env);
  }
}

function lateralVelocity(boat) {
  return boat.vx * Math.cos(boat.heading) - boat.vz * Math.sin(boat.heading);
}

function driveScenario() {
  const wave = new FlatWave();
  const env = environment(wave, 14, 0);
  const boat = new YoleDynamics(0, wave);
  boat.vx = 0;
  boat.vz = 0;
  boat.flow = 0;
  boat.driveForce = 0;
  boat.drive = 0;

  step(boat, env, 1, { steer: 0, trim: 0.84 });
  const firstTick = { drive: boat.drive, speed: boat.speed };
  step(boat, env, 29, { steer: 0, trim: 0.84 });
  const halfSecond = { drive: boat.drive, speed: boat.speed };
  step(boat, env, 90, { steer: 0, trim: 0.84 });
  const powered = { drive: boat.drive, speed: boat.speed };
  step(boat, env, 1, { steer: 0, trim: 0.58 });
  const brakeFirstTick = { drive: boat.drive, speed: boat.speed };
  step(boat, env, 29, { steer: 0, trim: 0.58 });
  const brakeHalfSecond = { drive: boat.drive, speed: boat.speed };
  return { firstTick, halfSecond, powered, brakeFirstTick, brakeHalfSecond };
}

const drive = driveScenario();
assert.ok(drive.firstTick.drive > 0 && drive.firstTick.drive < drive.halfSecond.drive * 0.2,
  `drive must spool progressively, got ${drive.firstTick.drive} -> ${drive.halfSecond.drive}`);
assert.ok(drive.halfSecond.drive < drive.powered.drive,
  "powered acceleration stopped spooling before reaching its useful plateau");
assert.ok(drive.brakeFirstTick.drive < drive.powered.drive && drive.brakeFirstTick.drive > drive.powered.drive * 0.65,
  "feathering must start braking immediately without snapping propulsion to zero");
assert.ok(drive.brakeHalfSecond.drive < drive.brakeFirstTick.drive * 0.35,
  "feathered sail did not shed propulsion within half a second");
assert.deepEqual(driveScenario(), drive, "drive response is not deterministic");

function brakingScenario(trim) {
  const wave = new FlatWave();
  const env = environment(wave, 14, 0);
  const boat = new YoleDynamics(6, wave);
  boat.vx = 0;
  boat.vz = 18;
  boat.flow = 0.2;
  boat.driveForce = 3000;
  boat.drive = boat.driveForce / 6500;
  step(boat, env, 60, { steer: 0, trim });
  return { speed: boat.speed, drive: boat.drive, z: boat.z };
}

const poweredRun = brakingScenario(0.84);
const featheredRun = brakingScenario(0.58);
assert.ok(featheredRun.speed < poweredRun.speed - 4.5,
  `feathered trim lacks meaningful braking (${featheredRun.speed} vs ${poweredRun.speed})`);
assert.ok(featheredRun.z < poweredRun.z - 2,
  "feathered trim did not shorten the one-second stopping trajectory");

function lowSpeedTurn() {
  const wave = new FlatWave();
  const env = environment(wave);
  const boat = new YoleDynamics(1, wave);
  boat.vx = 0;
  boat.vz = 4;
  boat.flow = 0;
  const startHeading = boat.heading;
  step(boat, env, 60, { steer: 1, trim: 0.58 });
  const headingAfterOneSecond = boat.heading - startHeading;
  const yawBeforeRelease = boat.yawRate;
  step(boat, env, 30, { steer: 0, trim: 0.58 });
  return { headingAfterOneSecond, yawBeforeRelease, yawAfterRelease: boat.yawRate };
}

const lowTurn = lowSpeedTurn();
// ⚠️ On mesure l'AMPLITUDE, pas le signe. La convention de barre a été
// retournée pour que « positif = vers la droite de l'ÉCRAN » (le vecteur droite
// du moteur était l'opposé de la vraie droite en repère main droite). Asserter
// un signe ici reviendrait à re-verrouiller une convention interne qui n'a
// aucune raison d'être visible depuis un test de maniabilité.
assert.ok(Math.abs(lowTurn.headingAfterOneSecond) > 0.42,
  `low-speed helm lacks authority: ${lowTurn.headingAfterOneSecond} rad after 1 s`);
assert.ok(Math.abs(lowTurn.yawAfterRelease) < Math.abs(lowTurn.yawBeforeRelease) * 0.12,
  "released helm leaves an unreadable lingering yaw");

{
  const wave = new FlatWave();
  const env = environment(wave);
  const boat = new YoleDynamics(11, wave);
  boat.vx = 0;
  boat.vz = 0;
  boat.flow = 0;
  step(boat, env, 60, { steer: 1, trim: 0.58 });
  // Amplitude, pas signe : même motif que la barre à basse vitesse.
  assert.ok(Math.abs(boat.heading) > 0.025 && Math.abs(boat.heading) < 0.16,
    `stationary helm became either dead or a pivot turn: ${boat.heading} rad`);
}

function driftScenario(steer, ticks = 20) {
  const wave = new FlatWave();
  const env = environment(wave);
  const boat = new YoleDynamics(2, wave);
  boat.vx = 6;
  boat.vz = 14;
  boat.flow = 0.25;
  step(boat, env, ticks, { steer, trim: 0.70 });
  return {
    lateral: Math.abs(lateralVelocity(boat)),
    slip: boat.slip,
    grip: boat.grip,
    counterSteer: boat.counterSteer,
    driftCommit: boat.driftCommit,
    driftRecovery: boat.driftRecovery,
    flow: boat.flow,
    heading: boat.heading,
    slipAngle: boat.slipAngle,
    speed: boat.speed
  };
}

// ⚠️ Les deux signes sont ÉCHANGÉS par rapport à la version précédente, et
// c'est le sens du test qui l'impose. La yole dérive vers +X (vx = 6) ; contrer
// veut dire braquer DANS la glissade. Depuis que « barre positive » signifie
// « vers la droite de l'écran », c'est-à-dire vers −X, la barre qui contre est
// la négative. Le test décrit toujours le même geste physique.
const counter = driftScenario(-0.72);
const neutral = driftScenario(0);
const committed = driftScenario(0.72);
assert.ok(counter.counterSteer > 0.22 && counter.grip > neutral.grip,
  "counter-steer did not engage the high-grip recovery state");
assert.ok(committed.driftCommit > 0.22 && committed.grip < neutral.grip,
  "committed turn did not preserve a controlled low-grip drift");
assert.ok(counter.slip < committed.slip * 0.72,
  `counter-steer does not clear slip decisively (${counter.slip} vs ${committed.slip})`);
assert.ok(counter.flow > committed.flow + 0.005,
  "clean counter-steer did not return its small Flow skill reward");

{
  const wave = new FlatWave();
  const env = environment(wave);
  const boat = new YoleDynamics(12, wave);
  boat.vx = 6;
  boat.vz = 14;
  boat.flow = 0.25;
  let sawSlip = false;
  let crossingTick = null;
  let reversePeak = 0;
  for (let tick = 0; tick < 120; tick++) {
    env.time += FIXED;
    boat.fixedStep(FIXED, { steer: -0.72, trim: 0.70 }, env);
    if (boat.slipAngle > 0.18) sawSlip = true;
    if (sawSlip && crossingTick === null && Math.abs(boat.slipAngle) < 0.12) crossingTick = tick;
    if (crossingTick !== null && tick <= crossingTick + 45) reversePeak = Math.max(reversePeak, -boat.slipAngle);
  }
  assert.ok(crossingTick !== null && crossingTick < 70,
    `counter-steer never completed recovery: ${crossingTick}`);
  assert.ok(reversePeak < 0.35,
    `counter-steer snapped immediately into reverse drift: ${reversePeak} rad`);
}

const sustainedDrift = driftScenario(0.72, 120);
assert.ok(Math.abs(sustainedDrift.slipAngle) < 0.82,
  `held drift entered a spin instead of self-recovering: ${sustainedDrift.slipAngle} rad`);
assert.ok(sustainedDrift.driftRecovery > 0.10,
  "deep-slip safety envelope never engaged during a sustained drift");
assert.ok(sustainedDrift.speed > 8,
  `deep-slip recovery over-braked the yole: ${sustainedDrift.speed} m/s`);

{
  const wave = new FlatWave(0, -0.2);
  const env = environment(wave);
  const boat = new YoleDynamics(3, wave);
  boat.vx = 0;
  boat.vz = 10;
  boat.flow = 0;
  step(boat, env, 60, { steer: 0, trim: 0.70 });
  const surfAtOneSecond = boat.surf;
  assert.ok(boat.surfing && surfAtOneSecond > 0.45,
    `downhill wave failed to expose surf feedback: ${surfAtOneSecond}`);
  wave.slopeZ = 0;
  step(boat, env, 90, { steer: 0, trim: 0.70 });
  assert.equal(boat.surfing, false, "surf flag remained latched on flat water");
  assert.ok(boat.surf < surfAtOneSecond * 0.04, "surf envelope did not release progressively");
}

function dashScenario(side) {
  const wave = new FlatWave();
  const boat = new YoleDynamics(4, wave);
  boat.vx = 6;
  boat.vz = 15;
  boat.flow = 0.8;
  boat.yawRate = 0.6;
  const result = boat.triggerLateralBoost(side);
  return {
    result,
    flow: boat.flow,
    yawRate: boat.yawRate,
    counterDash: boat.counterDash,
    lateral: lateralVelocity(boat)
  };
}

const correctiveDash = dashScenario(-1);
const extendingDash = dashScenario(1);
assert.equal(correctiveDash.result, true);
assert.ok(correctiveDash.counterDash > 0.7,
  "dash opposite to existing drift was not recognized as corrective");
assert.ok(correctiveDash.flow > extendingDash.flow + 0.04,
  "corrective dash did not refund a measurable portion of Flow");
// ⚠️ Seuil relevé avec l'impulsion de dash (9,35 -> 17,8). Le dash correctif ne
// se contente plus d'annuler la dérive, il la RENVERSE : 6,00 -> −11,80 m/s
// mesurés, contre 6,00 -> +23,80 pour le dash qui l'entretient. L'intention du
// test — les deux gestes restent mécaniquement distincts, et le correctif tue la
// glissade d'origine — est donc exprimée en écart, pas en valeur absolue.
assert.ok(correctiveDash.lateral < 0 && extendingDash.lateral > 20,
  "corrective and extending dashes remain mechanically indistinguishable");
assert.ok(extendingDash.lateral - correctiveDash.lateral > 30,
  `dash lateral authority collapsed: ${correctiveDash.lateral} vs ${extendingDash.lateral}`);
assert.ok(correctiveDash.yawRate < extendingDash.yawRate * 0.75,
  "corrective dash did not damp residual yaw");

function dashShiftScenario(side, useRecovery) {
  const wave = new FlatWave();
  const env = environment(wave);
  const boat = new YoleDynamics(side > 0 ? 8 : 9, wave);
  boat.vx = 0;
  boat.vz = 15;
  boat.flow = 0.8;
  boat.roll = 0;
  boat.rollVel = 0;
  boat.yawRate = 0;
  boat.triggerLateralBoost(side);
  step(boat, env, 8, { steer: 0, trim: 0.82 });
  const forwardX = Math.sin(boat.heading);
  const forwardZ = Math.cos(boat.heading);
  const forwardBefore = boat.vx * forwardX + boat.vz * forwardZ;
  const slipBefore = Math.abs(lateralVelocity(boat));
  const result = useRecovery ? boat.triggerShift() : null;
  const forwardAfterShift = boat.vx * forwardX + boat.vz * forwardZ;
  step(boat, env, 21, { steer: 0, trim: 0.82 });
  return {
    result,
    forwardBefore,
    forwardAfterShift,
    slipBefore,
    slipAfter: Math.abs(lateralVelocity(boat)),
    z: boat.z,
    x: boat.x,
    boost: boat.boost,
    arcadeBoostForward: boat.arcadeBoostForward,
    flow: boat.flow
  };
}

const dashControl = dashShiftScenario(1, false);
const dashRecovered = dashShiftScenario(1, true);
const dashRecoveredMirror = dashShiftScenario(-1, true);
assert.equal(dashRecovered.result?.critical, false,
  "dash recovery must remain distinct from a perfect high-heel Shift");
assert.equal(dashRecovered.result?.recovery, true,
  "Shift inside the dash window did not enter recovery");
assert.ok(dashRecovered.slipAfter < dashControl.slipAfter * 0.65,
  `dash recovery failed to clear at least 35% slip (${dashRecovered.slipAfter} vs ${dashControl.slipAfter})`);
assert.ok(Math.abs(dashRecovered.forwardAfterShift - dashRecovered.forwardBefore) < 1e-9,
  "dash recovery changed forward velocity instead of lateral slip");
assert.equal(dashRecovered.boost, 0, "dash recovery leaked into generic boost");
assert.equal(dashRecovered.arcadeBoostForward, 0, "dash recovery created hidden forward boost");
assert.ok(Math.abs(Math.abs(dashRecoveredMirror.x) - Math.abs(dashRecovered.x)) < 1e-9,
  "dash recovery is not left/right symmetric");
assert.ok(Math.abs(dashRecoveredMirror.z - dashRecovered.z) < 1e-9,
  "mirrored dash recovery changed forward distance");

{
  const wave = new FlatWave();
  const boat = new YoleDynamics(10, wave);
  boat.roll = 0.10;
  boat.slip = 0.7;
  boat.flow = 0.5;
  boat.dashRecoveryWindow = 0;
  const result = boat.triggerShift();
  assert.equal(result.recovery, false, "low-heel Shift outside dash window became a recovery");
  assert.equal(result.critical, false);
  assert.equal(boat.flow, 0.45, "ordinary early Shift no longer carries its timing penalty");
}

{
  const wave = new FlatWave();
  const boat = new YoleDynamics(5, wave);
  boat.roll = 0.64;
  boat.rollVel = 0.40;
  boat.yawRate = 0.6;
  boat.slip = 0.5;
  boat.counterSteer = 0.5;
  boat.flow = 0.35;
  const result = boat.triggerShift();
  assert.equal(result.critical, true);
  assert.ok(boat.counterHeel > 0.8, "well-timed counter-heel did not expose its feedback envelope");
  assert.ok(boat.flow > 0.72, "counter-heel did not convert timing and slip into Flow");
  assert.ok(boat.yawRate < 0.5, "counter-heel failed to settle residual yaw");
}

for (const value of Object.values(YOLE_HANDLING)) {
  assert.ok(Number.isFinite(value), "handling tuning contains a non-finite constant");
}

console.log(JSON.stringify({
  ok: true,
  drive,
  brakingAt18Mps: { powered: poweredRun, feathered: featheredRun },
  lowSpeedTurn: lowTurn,
  drift: { counter, neutral, committed, sustained: sustainedDrift },
  dash: {
    corrective: correctiveDash,
    extending: extendingDash,
    recovery: dashRecovered,
    recoveryControl: dashControl
  }
}, null, 2));
