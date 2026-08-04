import assert from "node:assert/strict";

import { YOLE_HANDLING } from "../src/sim/yole-physics.js";
import {
  ACTION_BOOST_FORWARD,
  ACTION_BOOST_LATERAL
} from "../src/game/balance.js";
import { InputSystems } from "../src/game/input.js";

function makeBoat(id, { player = false } = {}) {
  const boat = {
    id,
    isPlayer: player,
    localControlled: false,
    x: 0,
    z: 0,
    speed: 14,
    roll: 0,
    steer: 0,
    eliminated: false,
    dynamics: {
      heading: 0,
      flow: 0.8,
      boostCooldown: 0
    },
    get flow() {
      return this.dynamics.flow;
    },
    forward(out = {}) {
      out.x = 0;
      out.z = 1;
      return out;
    },
    triggerForwardBoost() {
      this.physicalForwardCalls = (this.physicalForwardCalls ?? 0) + 1;
      if (this.eliminated || this.dynamics.boostCooldown > 0 || this.flow < 0.16) return false;
      this.feedbackDuringForwardMutation = this.game.boostHudFeedback;
      this.dynamics.flow -= 0.24;
      this.dynamics.boostCooldown = YOLE_HANDLING.boostCooldown;
      return true;
    },
    triggerLateralBoost(side) {
      this.physicalLateralCalls = (this.physicalLateralCalls ?? 0) + 1;
      this.lastSide = side;
      if (this.eliminated || this.dynamics.boostCooldown > 0 || this.flow < 0.22) return false;
      this.feedbackDuringLateralMutation = this.game.boostHudFeedback;
      this.dynamics.flow -= 0.25;
      this.dynamics.boostCooldown = YOLE_HANDLING.lateralBoostCooldown;
      return true;
    }
  };
  return boat;
}

function makeHarness() {
  const player = makeBoat(0, { player: true });
  const ai = makeBoat(1);
  const game = {
    mode: "playing",
    paused: false,
    countdown: 0,
    playback: null,
    isApplyingReplay: false,
    versusLocal: false,
    trainingMode: false,
    trainingGuide: null,
    tour: null,
    time: 2,
    input: { actions: 0, steer: 0 },
    boats: [player, ai],
    stats: { boosts: 0 },
    particleBudget: 1,
    visualRng: {},
    waterScratch: {},
    waveField: { sample: () => ({ height: 0 }) },
    ocean: { wake: { trail() {}, burst() {} } },
    particles: { emitBurst() {} },
    rings: { burst() {} },
    sprays: { spawn() {} },
    spellVfx: { spawn() {} },
    audio: { play() {} },
    postFX: { pulse() {} },
    telemetry: { track() {} },
    messageCount: 0,
    showMessage() { this.messageCount++; },
    haptic() {},
    panFor: () => 0,
    vfxScreenRotation: () => 0
  };
  player.game = game;
  ai.game = game;
  Object.assign(game, InputSystems);
  game.flashActionControl = () => {};
  return { game, player, ai };
}

const { game, player, ai } = makeHarness();
const snapshots = [];
const remember = () => snapshots.push(game.boostHudFeedback);

// Une confirmation n'existe qu'après que la mutation physique a renvoyé true.
assert.equal(game.triggerForwardBoost(player), true);
assert.equal(player.feedbackDuringForwardMutation, undefined);
assert.deepEqual(game.boostHudFeedback, {
  serial: 1,
  outcome: "confirmed",
  kind: "forward",
  reason: null,
  cooldownTotal: YOLE_HANDLING.boostCooldown
});
assert.equal(Object.isFrozen(game.boostHudFeedback), true);
assert.equal(game.messageCount, 1, "le feedback de succès existant reste inchangé");
remember();

// Le masque écrit par une activation immédiate à la manette repasse au tick
// fixe pour le replay. Ce n'est pas une seconde tentative et son refus attendu
// par cooldown ne doit pas écraser la confirmation.
const directConfirmation = game.boostHudFeedback;
game.applyActionMask(ACTION_BOOST_FORWARD);
assert.equal(game.boostHudFeedback, directConfirmation);

// Le verrou partagé est la première cause physique de refus.
assert.equal(game.triggerForwardBoost(player), false);
assert.deepEqual(game.boostHudFeedback, {
  serial: 2,
  outcome: "rejected",
  kind: "forward",
  reason: "cooldown",
  cooldownTotal: YOLE_HANDLING.boostCooldown
});
assert.equal(game.messageCount, 1, "un refus ne doit pas créer de grand toast");
remember();

player.dynamics.boostCooldown = 0;
player.dynamics.flow = 0.15;
assert.equal(game.triggerForwardBoost(player), false);
assert.equal(game.boostHudFeedback.serial, 3);
assert.equal(game.boostHudFeedback.reason, "flow");
assert.equal(game.boostHudFeedback.kind, "forward");
remember();

// Les rejets qui ont lieu avant le tick fixe sont tout de même publiés.
game.trainingMode = true;
game.trainingGuide = { advancedUnlocked: false };
assert.equal(game.requestAction(ACTION_BOOST_FORWARD), false);
assert.equal(game.boostHudFeedback.serial, 4);
assert.equal(game.boostHudFeedback.outcome, "rejected");
assert.equal(game.boostHudFeedback.reason, "locked");
remember();

game.trainingMode = false;
game.trainingGuide = null;
game.paused = true;
assert.equal(game.requestAction(ACTION_BOOST_LATERAL), false);
assert.equal(game.boostHudFeedback.serial, 5);
assert.equal(game.boostHudFeedback.kind, "lateral");
assert.equal(game.boostHudFeedback.reason, "locked");
assert.equal(game.boostHudFeedback.cooldownTotal, YOLE_HANDLING.lateralBoostCooldown);
remember();

game.paused = false;
player.eliminated = true;
assert.equal(game.requestAction(ACTION_BOOST_FORWARD), false);
assert.equal(game.boostHudFeedback.serial, 6);
assert.equal(game.boostHudFeedback.reason, "eliminated");
remember();

// Accepter une touche ne suffit pas à la confirmer. L'événement confirmé
// apparaît seulement lorsque applyActionMask atteint et réussit la physique.
player.eliminated = false;
player.dynamics.flow = 0.8;
player.dynamics.boostCooldown = 0;
game.input.actions = 0;
const beforeQueuedLateral = game.boostHudFeedback;
assert.equal(game.requestAction(ACTION_BOOST_LATERAL), true);
assert.equal(game.boostHudFeedback, beforeQueuedLateral);
game.applyActionMask(game.input.actions);
assert.equal(game.pendingBoostHudAttemptMask, 0);
assert.equal(player.feedbackDuringLateralMutation, beforeQueuedLateral);
assert.deepEqual(game.boostHudFeedback, {
  serial: 7,
  outcome: "confirmed",
  kind: "lateral",
  reason: null,
  cooldownTotal: YOLE_HANDLING.lateralBoostCooldown
});
remember();

// Le cooldown est partagé : tenter un Turbo pendant la récupération d'un Dash
// conserve le total autoritaire de 15 s, même si la tentative est "forward".
assert.equal(game.triggerForwardBoost(player), false);
assert.deepEqual(game.boostHudFeedback, {
  serial: 8,
  outcome: "rejected",
  kind: "forward",
  reason: "cooldown",
  cooldownTotal: YOLE_HANDLING.lateralBoostCooldown
});
remember();

// Un refus physique futur, sans cooldown ni manque de Flow identifiable,
// demeure un verrou explicite au lieu d'être annoncé comme succès.
player.dynamics.boostCooldown = 0;
player.dynamics.flow = 0.8;
const originalForward = player.triggerForwardBoost;
player.triggerForwardBoost = () => false;
assert.equal(game.triggerForwardBoost(player), false);
assert.equal(game.boostHudFeedback.serial, 9);
assert.equal(game.boostHudFeedback.reason, "locked");
remember();
player.triggerForwardBoost = originalForward;

// Les appels IA gardent exactement leur chemin physique et ne publient rien
// dans le canal HUD du joueur.
ai.dynamics.boostCooldown = 0;
ai.dynamics.flow = 0.8;
const playerFeedbackBeforeAi = game.boostHudFeedback;
assert.equal(game.triggerForwardBoost(ai), true);
assert.equal(ai.physicalForwardCalls, 1);
assert.equal(game.boostHudFeedback, playerFeedbackBeforeAi);
ai.dynamics.boostCooldown = 4;
assert.equal(game.triggerForwardBoost(ai), false);
assert.equal(ai.physicalForwardCalls, 2);
assert.equal(game.boostHudFeedback, playerFeedbackBeforeAi);

assert.equal(YOLE_HANDLING.boostCooldown, 10);
assert.equal(YOLE_HANDLING.lateralBoostCooldown, 15);
assert.deepEqual(
  snapshots.map((feedback) => feedback.serial),
  [1, 2, 3, 4, 5, 6, 7, 8, 9],
  "chaque tentative joueur doit produire un serial strictement croissant"
);
for (const feedback of snapshots.filter((entry) => entry.outcome === "rejected")) {
  assert.ok(
    ["cooldown", "flow", "locked", "eliminated"].includes(feedback.reason),
    `raison de rejet hors contrat : ${feedback.reason}`
  );
}

console.log("boost HUD feedback contract: ok");
