import assert from 'node:assert/strict';
import { WaveField } from '../src/sim/waves.js';
import { YoleDynamics, YoleEventMask } from '../src/sim/yole-physics.js';
import { VerletRope } from '../src/sim/rope.js';
import { capsuleCollision, pointCapsuleDistanceSquared } from '../src/sim/collision.js';
import { UtilityBrain } from '../src/game/utility-ai.js';
import { RNG } from '../src/core/rng.js';
import { ImpactDirector, IMPACT_TIERS } from '../src/render/impact.js';

function environment() {
  return {
    time: 0,
    windX: 1.2,
    windZ: 8.8,
    stormAmount: 0,
    coastPenalty: 0,
    routeCenter: 0,
    waveScratch: {},
    pointScratch: {},
    centerScratch: {},
    sampleDisturbance: () => 0
  };
}

// Individual crew masses must cross in sequence, not teleport as one scalar.
const crewBoat = new YoleDynamics(0, new WaveField());
crewBoat.reset(0, 0, 0);
crewBoat.roll = 0.72;
const shift = crewBoat.triggerShift();
assert.equal(shift.critical, true);
assert.equal(crewBoat.crewStartDelays[0], 0, 'lead dresseur must engage first');
for (let index = 1; index < crewBoat.crewStartDelays.length; index++) {
  assert.ok(
    crewBoat.crewStartDelays[index] > crewBoat.crewStartDelays[index - 1],
    `crew load order collapsed between ${index - 1} and ${index}`
  );
}
assert.ok(crewBoat.crewStartDelays.at(-1) > 0.25, 'last dresseur no longer holds the old side');
const crewEnv = environment();
let loadedTick = -1;
let loadedPrecision = 0;
let loadedKind = 0;
for (let tick = 0; tick < 15; tick++) {
  crewEnv.time += 1 / 60;
  crewBoat.fixedStep(1 / 60, { steer: 0, trim: 0.78 }, crewEnv);
  const event = crewBoat.consumeEvents({});
  if (event.mask & YoleEventMask.CREW_LOADED) {
    loadedTick = tick;
    loadedPrecision = event.shiftCatch;
    loadedKind = event.shiftKind;
  }
}
const earlyPositions = [...crewBoat.crewPositions];
assert.ok(Math.max(...earlyPositions) - Math.min(...earlyPositions) > 0.08, 'crew cascade collapsed into a scalar teleport');
let mostOutboardShift = crewBoat.crewShift;
for (let tick = 0; tick < 85; tick++) {
  crewEnv.time += 1 / 60;
  crewBoat.fixedStep(1 / 60, { steer: 0, trim: 0.78 }, crewEnv);
  const event = crewBoat.consumeEvents({});
  if (event.mask & YoleEventMask.CREW_LOADED) {
    loadedTick = tick + 15;
    loadedPrecision = event.shiftCatch;
    loadedKind = event.shiftKind;
  }
  mostOutboardShift = Math.min(mostOutboardShift, crewBoat.crewShift);
}
assert.ok(mostOutboardShift < -0.55, `crew failed to reach the rescue side: ${mostOutboardShift}`);
assert.ok(loadedTick >= 9 && loadedTick <= 48, `load catch did not follow crew movement: tick ${loadedTick}`);
assert.ok(loadedPrecision > 0.5, `load event lost counterheel precision: ${loadedPrecision}`);
assert.equal(loadedKind, 2, 'critical counterheel load was confused with dash recovery');

// Flooding on opposite sides must create opposite roll response.
function flooded(side) {
  const boat = new YoleDynamics(side > 0 ? 1 : 2, new WaveField());
  boat.reset(0, 0, 0);
  boat.vx = 0; boat.vz = 10;
  boat.addWater(90, side * 0.9, -3.2);
  const env = environment();
  for (let tick = 0; tick < 150; tick++) {
    env.time += 1 / 60;
    boat.fixedStep(1 / 60, { steer: 0, trim: 0.65 }, env);
  }
  return boat;
}
const floodPort = flooded(-1);
const floodStarboard = flooded(1);
assert.ok(floodPort.roll * floodStarboard.roll < 0, `localized flood did not mirror roll: ${floodPort.roll}, ${floodStarboard.roll}`);
assert.ok(Math.abs(floodPort.roll - floodStarboard.roll) > 0.08, 'localized flood response is too weak');

// Rope endpoints and segment lengths stay bounded over a moving 4-second pull.
const rope = new VerletRope(12);
const start = { x: 0, y: 2, z: 0 };
const end = { x: 16, y: 1, z: 4 };
rope.reset(start, end);
for (let tick = 0; tick < 240; tick++) {
  end.x = 16 + Math.sin(tick * 0.03) * 2;
  end.z = 4 + Math.cos(tick * 0.025) * 3;
  rope.step(1 / 60, start, end, { windX: 7, windZ: 2, iterations: 6 });
}
assert.equal(rope.x[0], start.x);
assert.equal(rope.y[0], start.y);
assert.ok(Math.abs(rope.x[rope.count - 1] - end.x) < 1e-5);
let maxSegment = 0;
for (let i = 0; i < rope.count - 1; i++) maxSegment = Math.max(maxSegment, Math.hypot(rope.x[i+1]-rope.x[i], rope.y[i+1]-rope.y[i], rope.z[i+1]-rope.z[i]));
assert.ok(Number.isFinite(maxSegment) && maxSegment < rope.segmentLength * 1.16, `rope stretch exploded: ${maxSegment}`);

// Long narrow hull collision must behave as a capsule, not center-distance circles.
const fakeBoat = (x, z, heading) => ({ x, z, dynamics: { heading } });
const a = fakeBoat(0, 0, 0);
const b = fakeBoat(1.3, 3.5, 0.08);
const c = fakeBoat(8, 0, 0);
assert.equal(capsuleCollision(a, b, {}).hit, true);
assert.equal(capsuleCollision(a, c, {}).hit, false);
assert.ok(pointCapsuleDistanceSquared(0.2, 4.0, a, {}) < 2.0);

// Utility AI must prefer a vulnerable/revenge target and retain deterministic behavior.
const rng = new RNG(0x1234abcd);
const brain = new UtilityBrain(rng, { aggression: 0.8, risk: 0.6, precision: 0.9 });
const owner = { id: 0, x: 0, z: 0, roll: 0, water: 0, activeCrew: 6, cooldowns: { wave: 0, harpoon: 0, mine: 0, rhum: 0 }, ammo: { wave: 1, harpoon: 1, mine: 1, rhum: 0 }, flow: 0.8, dynamics: { crewTarget: 0, boostCooldown: 0, flow: 0.8 } };
const stable = { id: 1, x: 2, z: 16, roll: 0.05, water: 0, activeCrew: 6, eliminated: false };
const vulnerable = { id: 2, x: -2, z: 14, roll: 0.85, water: 120, activeCrew: 4, eliminated: false };
const game = { boats: [owner, stable, vulnerable] };
brain.rememberAttacker(vulnerable);
assert.equal(brain.chooseTarget(owner, game).target, vulnerable);
const action = brain.chooseAction(owner, game, 35);
assert.ok(['wave', 'harpoon', 'mine', 'rhum', 'boost_forward', 'boost_lateral', 'lane', 'none'].includes(action.type));

// ⚠️ `stormGap` PASSE DE 60 À 85 DANS LES DEUX CAS CI-DESSOUS.
//
// Ce n'est pas un assouplissement : 60 encodait « assez loin du Grain pour ne
// pas être en survie ». Le Grain ayant reculé (gapStart 88 → 118), tous les
// seuils en mètres ont été réalignés du même facteur 1,34, dont le turbo de
// survie de l'IA (utility-ai.js, 46 → 62 m). À 60 m l'IA est désormais EN
// PANIQUE et renvoie `boost_forward` avant d'atteindre la branche « cherche
// une caisse » — le test ne mesurait donc plus ce qu'il croyait mesurer.
// 85 m rétablit exactement la même position relative qu'avant.
// Les armes se ramassent : à sec, l'IA ne doit JAMAIS choisir de tirer.
const dryOwner = { ...owner, ammo: { wave: 0, harpoon: 0, mine: 0, rhum: 0 } };
const dryGame = { ...game, nearestPickup: () => null };
for (let attempt = 0; attempt < 40; attempt++) {
  const dry = brain.chooseAction(dryOwner, dryGame, 85);
  assert.ok(!['wave', 'harpoon', 'mine', 'rhum'].includes(dry.type),
    `IA a tiré sans munition: ${dry.type}`);
}

// Et à sec avec une caisse en vue, elle doit s'en approcher.
const crateGame = { ...game, nearestPickup: () => ({ x: owner.x + 12, z: owner.z + 40 }) };
const seeking = Array.from({ length: 40 }, () => brain.chooseAction(dryOwner, crateGame, 85))
  .filter((a) => a.type === 'lane' && a.delta > 0);
assert.ok(seeking.length > 0, "l'IA à sec n'a jamais cherché de caisse");

// Le directeur d'impact ne doit JAMAIS ajouter de temps a la simulation : il ne
// fait qu'en retirer. C'est ce qui garantit que le hitstop laisse la sequence de
// ticks, le checksum et les replays strictement identiques.
const director = new ImpactDirector(new RNG(7), { get: (key) => (key === 'impact' ? 1 : false) });
let leaked = 0;
for (const tier of Object.keys(IMPACT_TIERS)) {
  director.trigger(tier, { dirX: 1, dirZ: 0, intensity: 1.6 });
  for (let frame = 0; frame < 40; frame++) {
    const dt = 1 / 60;
    const simTime = director.consume(dt);
    assert.ok(simTime <= dt + 1e-9, `${tier}: le hitstop a rendu plus de temps qu'il n'en a recu`);
    assert.ok(simTime >= 0, `${tier}: temps de simulation negatif`);
    leaked = Math.max(leaked, simTime - dt);
    director.update(dt);
  }
  assert.equal(director.freeze, 0, `${tier}: gel jamais purge`);
}
// Gel borne : une salve enchainee ne doit pas figer la partie.
for (let burst = 0; burst < 25; burst++) director.trigger('takedown', { intensity: 1.6 });
assert.ok(director.freeze <= 0.16 + 1e-9, `gel cumule non borne: ${director.freeze}`);

// Reglage SANS : zero gel, zero deplacement camera, zero flash.
const silent = new ImpactDirector(new RNG(7), { get: (key) => (key === 'impact' ? 0 : false) });
silent.trigger('takedown', { dirX: 1, dirZ: 1, intensity: 1.6 });
assert.equal(silent.freeze, 0, 'SANS doit produire zero gel');
assert.equal(silent.flash, 0, 'SANS doit produire zero flash');
assert.equal(silent.consume(1 / 60), 1 / 60, 'SANS ne doit rien retirer a la simulation');
const stillCamera = { position: { x: 0, y: 0, z: 0 }, rotation: { z: 0 }, fov: 61 };
silent.applyToCamera(stillCamera);
silent.applyOrientation(stillCamera);
assert.deepEqual(
  [stillCamera.position.x, stillCamera.position.y, stillCamera.position.z, stillCamera.rotation.z, stillCamera.fov],
  [0, 0, 0, 0, 61],
  'SANS doit produire zero mouvement camera'
);

console.log(JSON.stringify({
  ok: true,
  crewEarlySpread: Math.max(...earlyPositions) - Math.min(...earlyPositions),
  crewPeakShift: mostOutboardShift,
  crewLoadedTick: loadedTick,
  floodRolls: [floodPort.roll, floodStarboard.roll],
  maxRopeSegment: maxSegment,
  aiAction: action.type,
  hitstopLeak: leaked,
  hitstopCapped: true
}, null, 2));
