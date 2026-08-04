import assert from "node:assert/strict";

import { RNG } from "../src/core/rng.js";
import { UtilityBrain } from "../src/game/utility-ai.js";
import { weaponHit } from "../src/game/weapons.js";
import {
  crewMechanicalAuthority,
  YoleDynamics,
  YoleEventMask
} from "../src/sim/yole-physics.js";

// L'impact reste un gag lisible : exactement une éjection, même si une arme
// demandait accidentellement une perte plus grande.
{
  const direct = weaponHit({ rollImpulse: 0.8, crewLoss: 4 });
  assert.equal(direct.crewLoss, 1);
  assert.equal(direct.fromWeapon, true);
  const residual = weaponHit({ rollImpulse: 0.2, ejectCrew: false });
  assert.equal(residual.crewLoss, undefined);
}

// Le compteur visuel peut aller jusqu'à zéro, mais la peine auxiliaire se
// stabilise après la troisième perte.
assert.equal(crewMechanicalAuthority(6), 1);
assert.equal(crewMechanicalAuthority(5), 0.92);
assert.equal(crewMechanicalAuthority(4), 0.84);
assert.equal(crewMechanicalAuthority(3), 0.76);
assert.equal(crewMechanicalAuthority(0), 0.76);

{
  const dynamics = new YoleDynamics(0, {});
  for (let hit = 0; hit < 6; hit++) dynamics.applyHit(weaponHit({}));
  assert.equal(dynamics.activeCrew, 0, "les six éjections visuelles doivent rester autoritaires");

  dynamics.addWater(100);
  const before = dynamics.waterMassKg;
  dynamics.drainFlooding(1);
  const drained = before - dynamics.waterMassKg;
  assert.ok(drained >= 4.17 && drained <= 4.19, `pompe de survie inattendue: ${drained}`);
}

// Sans équipier, le bouton reste une petite manœuvre de survie, pas une
// contre-gîte parfaite et surtout pas un déplacement de corps invisibles.
{
  const empty = new YoleDynamics(1, {});
  empty.activeCrew = 0;
  empty.roll = 0.64;
  empty.rollVel = 0.65;
  empty.flow = 0.5;
  const before = empty.rollVel;
  const result = empty.triggerShift();
  const emergencyCorrection = before - empty.rollVel;

  const manned = new YoleDynamics(2, {});
  manned.roll = 0.64;
  manned.rollVel = 0.65;
  manned.flow = 0.5;
  const mannedBefore = manned.rollVel;
  const mannedResult = manned.triggerShift();
  const mannedCorrection = mannedBefore - manned.rollVel;

  assert.equal(result.emergency, true);
  assert.equal(result.critical, false);
  assert.equal(mannedResult.critical, true);
  assert.equal(empty.crewTarget, 0);
  assert.deepEqual([...empty.crewTargets], [0, 0, 0, 0, 0, 0]);
  assert.ok(emergencyCorrection > 0, "la manœuvre d'urgence ne corrige plus rien");
  assert.ok(
    emergencyCorrection < mannedCorrection * 0.45,
    `l'urgence (${emergencyCorrection}) est trop proche d'une vraie bordée (${mannedCorrection})`
  );

  for (let tick = 0; tick < 80; tick++) empty.updateCrew(1 / 60);
  assert.equal(
    empty.consumeEvents({}).mask & YoleEventMask.CREW_LOADED,
    0,
    "un équipage absent a produit un événement de charge"
  );
}

function boat(id, x, z) {
  return {
    id,
    x,
    z,
    roll: 0.08,
    water: 0,
    activeCrew: 6,
    eliminated: false,
    lastAggressor: null,
    lastAggressionAt: -99
  };
}

// Une cible déjà réservée par une autre IA doit perdre le duel de score face à
// une cible équivalente. Cela casse les salves à trois sans tirage aléatoire.
{
  const owner = boat(0, 0, 0);
  const claimed = boat(1, 2, 14);
  const free = boat(2, -2, 14);
  const ally = boat(3, 8, 4);
  ally.brain = new UtilityBrain(new RNG(11), {}, "tour");
  ally.brain.focusTargetId = claimed.id;
  ally.brain.focusTimer = 1.2;
  const brain = new UtilityBrain(new RNG(12), {}, "tour");
  const game = { boats: [owner, claimed, free, ally], time: 20 };
  assert.equal(brain.chooseTarget(owner, game).target, free);
}

// Après un impact récent d'un tiers, la mercy doit détourner l'IA vers une
// autre cible comparable.
{
  const owner = boat(0, 0, 0);
  const recentVictim = boat(1, 2, 14);
  const free = boat(2, -2, 14);
  const attacker = boat(3, 10, 0);
  recentVictim.lastAggressor = attacker;
  recentVictim.lastAggressionAt = 19.4;
  const brain = new UtilityBrain(new RNG(13), {}, "tour");
  const game = { boats: [owner, recentVictim, free, attacker], time: 20 };
  assert.equal(brain.chooseTarget(owner, game).target, free);
}

// Choisir réellement un tir doit publier la réservation, puis l'expirer sans
// aucun appel RNG supplémentaire dans update().
{
  const target = boat(1, 0, 5);
  target.roll = 0.75;
  target.water = 80;
  const owner = {
    ...boat(0, 0, 0),
    cooldowns: { wave: 0, harpoon: 9, mine: 9, rhum: 9 },
    ammo: { wave: 1, harpoon: 0, mine: 0, rhum: 0 },
    flow: 0.1,
    dynamics: { crewTarget: 0, boostCooldown: 9, flow: 0.1 }
  };
  const brain = new UtilityBrain(
    new RNG(14),
    { aggression: 1, risk: 0.5, precision: 0.8 },
    "tour"
  );
  const game = { boats: [owner, target], time: 20, nearestPickup: () => null };
  const action = brain.chooseAction(owner, game, 90);
  assert.equal(action.type, "wave");
  assert.equal(brain.focusTargetId, target.id);
  assert.ok(brain.focusTimer > 1);
  brain.update(3);
  assert.equal(brain.focusTargetId, -1);
  assert.equal(brain.focusTimer, 0);
}

console.log("crew anti-snowball tests: ok");
