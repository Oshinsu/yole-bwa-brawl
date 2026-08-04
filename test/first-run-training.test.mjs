import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  ACTION_BOOST_FORWARD,
  ACTION_HARPOON,
  ACTION_MINE,
  ACTION_SHIFT,
  ACTION_WAVE,
  FIRST_RUN_TRAINING,
  advanceFirstRunTraining,
  createFirstRunTrainingState,
  trainingActionMask
} from "../src/game/balance.js";
import { InputSystems } from "../src/game/input.js";
import { Game } from "../src/game/game.js";

function playLearningSequence() {
  const state = createFirstRunTrainingState();
  const events = [];
  for (let tick = 0; tick < 30; tick++) {
    const transition = advanceFirstRunTraining(state, {
      dt: 1 / 60,
      steer: 0.7,
      actions: 0,
      roll: 0
    });
    if (transition.event) events.push([tick, transition.event]);
  }
  assert.equal(state.step, 1, "diriger n'a pas ouvert l'étape de contre-gîte");

  let transition = advanceFirstRunTraining(state, {
    dt: 1 / 60,
    steer: 0,
    actions: ACTION_SHIFT,
    roll: 0.04,
    shiftKind: 1
  });
  assert.equal(transition.event, "shift_early");
  assert.equal(state.step, 1, "un Shift à plat a validé une fausse contre-gîte");

  transition = advanceFirstRunTraining(state, {
    dt: 1 / 60,
    steer: 0,
    actions: ACTION_SHIFT,
    roll: 0.42,
    shiftKind: 2
  });
  assert.equal(transition.event, "shift_complete");
  assert.equal(state.step, 2);

  // Même si un bit Harpon brut était injecté, le filtre autoritaire ne laisse
  // entrer que Coco/Shift pendant la révélation.
  const blockedHarpoon = trainingActionMask(state, ACTION_HARPOON);
  assert.equal(blockedHarpoon, 0);
  transition = advanceFirstRunTraining(state, {
    dt: 1 / 60,
    actions: blockedHarpoon
  });
  assert.equal(transition.event, "");
  assert.equal(state.step, 2);

  transition = advanceFirstRunTraining(state, {
    dt: 1 / 60,
    actions: trainingActionMask(state, ACTION_WAVE)
  });
  assert.equal(transition.event, "completed");
  assert.equal(state.step, 3);
  assert.equal(state.advancedUnlocked, true);
  return { state, events };
}

const first = playLearningSequence();
const second = playLearningSequence();
assert.deepEqual(second, first, "la révélation n'est pas déterministe");

{
  const state = createFirstRunTrainingState();
  let transition = null;
  for (let tick = 0; tick < 60 * 39; tick++) {
    transition = advanceFirstRunTraining(state, { dt: 1 / 60 });
    if (transition.event === "timeout") break;
  }
  assert.equal(state.advancedUnlocked, true, "le filet temporel n'a pas libéré l'arsenal");
  assert.equal(state.unlockReason, "timeout");
  assert.ok(
    state.elapsed >= 30 && state.elapsed <= 45,
    `l'arsenal s'ouvre hors de la fenêtre 30–45 s : ${state.elapsed}`
  );
}

{
  const locked = createFirstRunTrainingState();
  const requested = ACTION_WAVE | ACTION_SHIFT | ACTION_HARPOON | ACTION_MINE | ACTION_BOOST_FORWARD;
  assert.equal(
    trainingActionMask(locked, requested),
    ACTION_WAVE | ACTION_SHIFT,
    "les actions avancées atteignent encore la simulation pendant l'école"
  );
  locked.advancedUnlocked = true;
  assert.equal(trainingActionMask(locked, requested), requested);
  assert.equal(trainingActionMask(null, requested), requested, "le mode normal a été filtré");
}

// Contrat au point d'exécution : applyActionMask filtre lui-même, même si un
// outil ou une manette contourne requestAction.
{
  const state = createFirstRunTrainingState();
  const calls = { wave: 0, harpoon: 0, mine: 0, boost: 0, shift: 0 };
  const harness = {
    trainingMode: true,
    trainingGuide: state,
    boats: [{ roll: 0, eliminated: false }],
    input: { steer: 0, actions: 0 },
    withPlayerAim(_boat, callback) { return callback(); },
    fireWave() { calls.wave++; },
    fireHarpoon() { calls.harpoon++; },
    dropMine() { calls.mine++; },
    triggerPlayerShift() { calls.shift++; },
    triggerForwardBoost() { calls.boost++; },
    triggerLateralBoost() { calls.boost++; },
    drinkRhum() {},
    dropBarik() {},
    sowChadron() {},
    blowLanbi() {},
    firePwason() {},
    playerInputLocked() { return false; },
    flashActionControl() {}
  };
  harness.trainingBasicsLocked = InputSystems.trainingBasicsLocked;
  harness.allowedTrainingActionMask = InputSystems.allowedTrainingActionMask;
  InputSystems.applyActionMask.call(
    harness,
    ACTION_WAVE | ACTION_HARPOON | ACTION_MINE | ACTION_BOOST_FORWARD
  );
  assert.deepEqual(calls, { wave: 1, harpoon: 0, mine: 0, boost: 0, shift: 0 });

  assert.equal(InputSystems.requestAction.call(harness, ACTION_HARPOON), false);
  assert.equal(harness.input.actions, 0);
  assert.equal(InputSystems.requestAction.call(harness, ACTION_WAVE), true);
  assert.equal(harness.input.actions, ACTION_WAVE);
}

// La progression visuelle ne doit jamais écraser les états métier (`.hidden`)
// de la caisse ou du réticule : un seul état est posé sur la racine du HUD.
{
  const classes = new Set();
  const attributes = new Map();
  const hud = {
    classList: {
      toggle(name, force) {
        if (force) classes.add(name);
        else classes.delete(name);
      }
    },
    setAttribute(name, value) { attributes.set(name, String(value)); }
  };
  const harness = { ui: { hud } };
  Game.prototype.setTrainingAdvancedVisibility.call(harness, false);
  assert.equal(classes.has("training-advanced-locked"), true);
  assert.equal(attributes.get("data-training-advanced"), "locked");
  Game.prototype.setTrainingAdvancedVisibility.call(harness, true);
  assert.equal(classes.has("training-advanced-locked"), false);
  assert.equal(attributes.get("data-training-advanced"), "unlocked");
}

// Le verrou porte aussi sur les arsenaux IA : aucun Harpon/Mine caché ne peut
// partir avant la révélation. La dernière caisse ramassée est rendue ensuite.
{
  const state = createFirstRunTrainingState();
  const boats = [
    {
      id: 0,
      loadout: ["wave", "harpoon"],
      activeWeapon: "harpoon",
      ammo: { wave: Infinity, harpoon: Infinity, mine: 0, rhum: 0 },
      cooldowns: { wave: 0, harpoon: 0, mine: 0, rhum: 0 }
    },
    {
      id: 1,
      loadout: ["mine", "rhum"],
      activeWeapon: "mine",
      ammo: { wave: 0, harpoon: 0, mine: Infinity, rhum: Infinity },
      cooldowns: { wave: 0, harpoon: 0, mine: 0, rhum: 0 }
    }
  ];
  const harness = {
    trainingMode: true,
    trainingGuide: state,
    round: 1,
    tick: 80,
    time: 1.3,
    boats,
    visibility: null,
    settings: {
      trainingCompleted: false,
      onboardingSeen: false,
      set(key, value) {
        if (key === "trainingCompleted") this.trainingCompleted = value;
        if (key === "onboardingSeen") this.onboardingSeen = value;
      }
    },
    setTrainingAdvancedVisibility(value) { this.visibility = value; },
    showMessage() {},
    telemetry: { track() {} }
  };
  harness.snapshotTrainingArsenal = Game.prototype.snapshotTrainingArsenal;
  Game.prototype.enforceTrainingBasics.call(harness);
  assert.deepEqual([...boats[0].loadout], ["wave"]);
  assert.deepEqual([...boats[1].loadout], ["wave"]);
  assert.equal(boats[0].ammo.harpoon, 0);
  assert.equal(boats[1].ammo.mine, 0);
  assert.equal(boats[1].ammo.wave, Infinity);

  boats[0].ammo.mine = 1;
  assert.equal(Game.prototype.deferTrainingPickup.call(harness, boats[0], "mine"), true);
  assert.equal(boats[0].ammo.mine, 0);
  assert.deepEqual(state.deferredPickups[0], { weapon: "mine", amount: 1 });

  Game.prototype.revealTrainingArsenal.call(harness, "completed");
  assert.deepEqual(boats[0].loadout, ["wave", "harpoon"]);
  assert.equal(boats[0].ammo.harpoon, Infinity);
  assert.equal(boats[0].ammo.mine, 1);
  assert.deepEqual(boats[1].loadout, ["mine", "rhum"]);
  assert.equal(boats[1].ammo.wave, 0);
  assert.equal(boats[1].ammo.mine, Infinity);
  assert.equal(state.arsenalRestored, true);
  assert.equal(harness.visibility, true);
  assert.equal(harness.settings.trainingCompleted, true, "la réussite doit mémoriser la fin de l'initiation");
  assert.equal(harness.settings.onboardingSeen, true, "la réussite live remplace aussi le carton statique");
}

// Le premier clic lance directement la manche-école ; le manuel statique reste
// une aide volontaire. Quitter avant la fin repropose l'école ; une réussite
// mémorisée rend ensuite le chemin normal.
{
  let trainingCompleted = false;
  let onboardingSeen = false;
  let onboardingCalls = 0;
  const starts = [];
  const harness = {
    settings: {
      get: (key) => key === "trainingCompleted" ? trainingCompleted : onboardingSeen,
      set: (key, value) => {
        if (key === "trainingCompleted") trainingCompleted = value;
        if (key === "onboardingSeen") onboardingSeen = value;
      }
    },
    clearActiveChallenge() {},
    startMatch(options) { starts.push(options); },
    startWithOnboarding(callback) { onboardingCalls++; callback(); }
  };
  InputSystems.startCombatFromMenu.call(harness);
  assert.deepEqual(starts[0], { training: true });
  assert.equal(onboardingCalls, 0);
  onboardingSeen = true;
  InputSystems.startCombatFromMenu.call(harness);
  assert.deepEqual(starts[1], { training: true });
  assert.equal(onboardingCalls, 0, "lire le carton statique ne doit pas supprimer la manche-école");
  trainingCompleted = true;
  InputSystems.startCombatFromMenu.call(harness);
  assert.deepEqual(starts[2], { training: false });
  assert.equal(onboardingCalls, 1);
}

const gameSource = await readFile(new URL("../src/game/game.js", import.meta.url), "utf8");
const inputSource = await readFile(new URL("../src/game/input.js", import.meta.url), "utf8");
assert.match(gameSource, /this\.trainingMode \? "peyi" : this\.playerAiLevel\(\)/);
assert.match(gameSource, /firstRunTraining/);
assert.match(gameSource, /enforceTrainingBasics\(\);[\s\S]*countdown > 0/);
assert.match(gameSource, /TAKEDOWN \+1 · DERNIER DEBOUT \+2 · PREMIER À 5/);
assert.doesNotMatch(gameSource, /SURVIE \+2/);
assert.doesNotMatch(inputSource, /SURVIE \+2/);
assert.equal(FIRST_RUN_TRAINING.playerLoadout[0], "wave");
assert.deepEqual([...FIRST_RUN_TRAINING.visibleLoadout], ["wave"]);

console.log("first-run progressive training tests: ok");
