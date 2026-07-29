import assert from 'node:assert/strict';
import { WaveField } from '../src/sim/waves.js';
import { YoleDynamics } from '../src/sim/yole-physics.js';
import { checksumBoats, ReplayRecorder } from '../src/sim/replay.js';
import { QualityManager } from '../src/core/quality.js';

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

function runDeterministicScenario() {
  const waves = new WaveField();
  waves.setWeather(0.32);
  const boat = new YoleDynamics(0, waves);
  const env = environment(waves);
  const replay = new ReplayRecorder(0xb0a2026, 60);
  let maxSpeed = 0;
  let maxRoll = 0;
  let minY = Infinity;
  let maxY = -Infinity;

  for (let tick = 0; tick < 18000; tick++) {
    env.time = tick * FIXED;
    const steer = Math.sin(tick * 0.0047) * 0.38;
    if (tick === 2400 || tick === 6150 || tick === 9800 || tick === 14200) boat.triggerShift();
    if (tick === 7200) boat.applyHit({ rollImpulse: 0.52, yawImpulse: -0.11, waterKg: 32, cohesionDamage: 0.08 });
    if (tick === 11200) boat.applyHit({ rollImpulse: -0.44, waterKg: 18, structure: { sail: 0.04 } });
    boat.fixedStep(FIXED, { steer, trim: 0.82 }, env);
    replay.recordInput(tick, { steer, actions: 0 });
    replay.checkpoint(tick, [boat]);

    for (const value of [boat.x, boat.y, boat.z, boat.vx, boat.vy, boat.vz, boat.roll, boat.pitch]) {
      assert.ok(Number.isFinite(value), `non-finite value at tick ${tick}`);
    }
    maxSpeed = Math.max(maxSpeed, boat.speed);
    maxRoll = Math.max(maxRoll, Math.abs(boat.roll));
    minY = Math.min(minY, boat.y);
    maxY = Math.max(maxY, boat.y);
  }

  return {
    checksum: checksumBoats([boat]),
    checkpoints: replay.checkpoints,
    maxSpeed,
    maxRoll,
    minY,
    maxY,
    boat
  };
}

const first = runDeterministicScenario();
const second = runDeterministicScenario();
assert.equal(first.checksum, second.checksum, 'same inputs did not reproduce the same final checksum');
assert.deepEqual(first.checkpoints, second.checkpoints, 'checkpoint replay diverged');
assert.ok(first.maxSpeed < 34.6, `planar speed escaped its physical budget: ${first.maxSpeed}`);
assert.ok(first.maxRoll < 1.16, `slalom unexpectedly capsized: ${first.maxRoll}`);
assert.ok(first.maxY - first.minY < 2.4, `vertical energy diverged: ${first.minY}..${first.maxY}`);
assert.equal(first.boat.eliminated, false);

function recovery(useShift, sign = 1) {
  const waves = new WaveField();
  const boat = new YoleDynamics(0, waves);
  const env = environment(waves);
  boat.roll = sign * 0.78;
  boat.rollVel = sign * 0.34;
  if (useShift) boat.triggerShift();
  let recoveryTick = null;
  let maximum = Math.abs(boat.roll);
  for (let tick = 0; tick < 360; tick++) {
    env.time = tick * FIXED;
    boat.fixedStep(FIXED, { steer: 0, trim: 0.76 }, env);
    maximum = Math.max(maximum, Math.abs(boat.roll));
    if (recoveryTick === null && Math.abs(boat.roll) < 0.2) recoveryTick = tick;
  }
  return { recoveryTick, maximum, boat };
}

const passive = recovery(false);
const shifted = recovery(true);
const shiftedOtherSide = recovery(true, -1);
assert.ok(shifted.recoveryTick < passive.recoveryTick, `Bwa Shift did not accelerate recovery (${shifted.recoveryTick} >= ${passive.recoveryTick})`);
assert.ok(shifted.maximum < 0.9, `Bwa Shift over-corrected: ${shifted.maximum}`);
assert.ok(shiftedOtherSide.maximum < 0.9, `mirrored Bwa Shift over-corrected: ${shiftedOtherSide.maximum}`);
assert.ok(shifted.boat.flow > 0, 'critical Bwa Shift did not award flow');


// Arcade boosts consume Flow, preserve finite state and create distinct forward/lateral motion.
const boostWaves = new WaveField();
const boostBoat = new YoleDynamics(3, boostWaves);
const boostEnv = environment(boostWaves);
boostBoat.vx = 0; boostBoat.vz = 15;
const beforeForward = boostBoat.speed;
assert.equal(boostBoat.triggerForwardBoost(), true);
boostEnv.time += FIXED;
boostBoat.fixedStep(FIXED, { steer: 0, trim: 0.84 }, boostEnv);
assert.ok(boostBoat.speed > beforeForward + 2.5, `forward boost too weak: ${beforeForward} -> ${boostBoat.speed}`);

// Le turbo COÛTE de l'équilibre. Sans ça il n'y a aucune décision à prendre :
// appuyer serait toujours le bon choix.
assert.ok(Math.abs(boostBoat.rollVel) > 0.2, `forward boost must destabilise: rollVel=${boostBoat.rollVel}`);

// Le cooldown est RÉEL : une seconde plus tard le bouton refuse encore.
for (let tick = 0; tick < 60; tick++) { boostEnv.time += FIXED; boostBoat.fixedStep(FIXED, { steer: 0, trim: 0.84 }, boostEnv); }
boostBoat.flow = Math.max(boostBoat.flow, 0.6);
assert.equal(boostBoat.triggerLateralBoost(1), false, 'boost cooldown must still block after 1 s');
// Le turbo est une RESSOURCE, pas un bouton de croisière : son cooldown se
// compte en secondes pleines. Le seuil encode l'intention, pas la valeur exacte,
// pour qu'un réglage de playtest ne casse pas le test sans rien apprendre.
assert.ok(
  boostBoat.boostCooldown > 6,
  `boost cooldown too short to be a real resource: ${boostBoat.boostCooldown}`
);

// Toujours bloqué à 5 s : c'est bien un compteur long, pas une temporisation.
for (let tick = 0; tick < 240; tick++) { boostEnv.time += FIXED; boostBoat.fixedStep(FIXED, { steer: 0, trim: 0.84 }, boostEnv); }
boostBoat.flow = Math.max(boostBoat.flow, 0.6);
assert.equal(boostBoat.triggerLateralBoost(1), false, 'boost cooldown must still block after 5 s');

// Une fois purgé, le dash latéral produit bien son impulsion de côté.
for (let tick = 0; tick < 400; tick++) { boostEnv.time += FIXED; boostBoat.fixedStep(FIXED, { steer: 0, trim: 0.84 }, boostEnv); }
boostBoat.flow = Math.max(boostBoat.flow, 0.6);
const beforeLateralX = boostBoat.vx;
assert.equal(boostBoat.triggerLateralBoost(1), true);
assert.ok(boostBoat.vx > beforeLateralX + 5, 'lateral boost did not create a side impulse');
assert.ok(Number.isFinite(boostBoat.rollVel));

// INVARIANT de vitesse : aucune impulsion hors fixedStep ne doit franchir le
// plafond. Mesuré : sans cette borne, l'IA au turbo atteignait 37,85 m/s.
const ceilingBoat = new YoleDynamics(9, boostWaves);
ceilingBoat.vx = 0;
ceilingBoat.vz = 32.5;
ceilingBoat.flow = 1;
ceilingBoat.triggerForwardBoost();
assert.ok(
  Math.hypot(ceilingBoat.vx, ceilingBoat.vz) <= 34.5,
  `forward boost broke the speed ceiling: ${Math.hypot(ceilingBoat.vx, ceilingBoat.vz)}`
);
ceilingBoat.triggerSlingshot(0, 1, 1.5);
assert.ok(
  Math.hypot(ceilingBoat.vx, ceilingBoat.vz) <= 34.5,
  `slingshot broke the speed ceiling: ${Math.hypot(ceilingBoat.vx, ceilingBoat.vz)}`
);

// La fenêtre de contre-gîte doit être LISIBLE depuis l'extérieur, sinon le HUD
// ne peut pas l'enseigner — et un joueur perd du Flow sans savoir pourquoi.
const cueBoat = new YoleDynamics(10, boostWaves);
cueBoat.roll = 0.10;
assert.equal(cueBoat.shiftQuality().state, 'idle', 'shift window must be closed at low heel');
cueBoat.roll = 0.64;
cueBoat.rollVel = 0.4;
const cueOpen = cueBoat.shiftQuality();
assert.equal(cueOpen.state, 'critical');
assert.ok(cueOpen.precision > 0.8, `optimal heel should read as a strong window: ${cueOpen.precision}`);
// Fonction pure : la consulter ne doit rien changer.
const rollBefore = cueBoat.roll;
const flowBefore = cueBoat.flow;
cueBoat.shiftQuality();
assert.equal(cueBoat.roll, rollBefore);
assert.equal(cueBoat.flow, flowBefore);

const damageWaves = new WaveField();
const damaged = new YoleDynamics(1, damageWaves);
damaged.applyHit({
  waterKg: 70,
  cohesionDamage: 0.24,
  crewLoss: 1,
  structure: { hull: 0.12, mast: 0.08, sail: 0.14, bwaIndex: 2, bwa: 0.22 }
});
assert.equal(damaged.activeCrew, 5);
assert.equal(damaged.waterMassKg, 70);
assert.ok(damaged.structure.hull < 0.9);
assert.ok(damaged.structure.bwa[2] < 0.8);

let appliedTier = -1;
globalThis.devicePixelRatio = 2;
const quality = new QualityManager((_profile, tier) => { appliedTier = tier; }, 2);
for (let i = 0; i < 280; i++) quality.update(25);
assert.ok(appliedTier <= 1, 'quality manager did not downgrade sustained slow frames');

console.log(JSON.stringify({
  ok: true,
  ticksPerDeterminismRun: 18000,
  checksum: first.checksum,
  replayCheckpoints: first.checkpoints.length,
  maxSpeed: first.maxSpeed,
  maxRoll: first.maxRoll,
  verticalRange: [first.minY, first.maxY],
  passiveRecoveryTicks: passive.recoveryTick,
  shiftedRecoveryTicks: shifted.recoveryTick,
  finalQualityTier: appliedTier
}, null, 2));
