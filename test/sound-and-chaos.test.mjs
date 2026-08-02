import assert from "node:assert/strict";

import { AudioEngine, SOUNDSCAPE_BEDS } from "../src/core/audio.js";
import { ObstacleSystems, SARGASSE } from "../src/game/obstacles.js";
import { weaponHit } from "../src/game/weapons.js";
import { YoleDynamics } from "../src/sim/yole-physics.js";

assert.deepEqual(
  Object.keys(SOUNDSCAPE_BEDS),
  ["water", "storm", "cable", "sail", "wood", "sargasse"],
  "le soundscape doit exposer les six lits réactifs"
);

{
  let playedSource = null;
  const audio = new AudioEngine({ signed: () => 0 });
  audio.context = {
    currentTime: 4,
    createBufferSource() {
      playedSource = {
        playbackRate: { value: 1 },
        connect() {},
        start() {}
      };
      return playedSource;
    },
    createGain() {
      return {
        gain: { value: 0 },
        connect() {}
      };
    }
  };
  audio.sfxGain = {};
  audio.buffers = new Map([["cocoBoom", { duration: 1 }]]);
  audio.sampled.add("cocoBoom");
  audio.ensure = () => true;
  audio.play("cocoBoom", { rate: 0.72, spread: 0, gap: 0 });
  assert.equal(
    playedSource.playbackRate.value,
    0.72,
    "un sample réel doit respecter le pitch demandé"
  );
}

{
  const direct = weaponHit({ rollImpulse: 1 });
  assert.equal(direct.fromWeapon, true, "un impact d'arme doit être identifiable");
  assert.equal(direct.crewLoss, 1, "un impact direct doit éjecter un yoleur");

  const residual = weaponHit({ rollImpulse: 1, ejectCrew: false });
  assert.equal(
    residual.crewLoss,
    undefined,
    "un effet résiduel ne doit pas éjecter en boucle"
  );
}

{
  const dynamics = new YoleDynamics(0, {});
  dynamics.applyHit({ crewLoss: 7 });
  assert.equal(
    dynamics.activeCrew,
    0,
    "les six postes de rappel doivent pouvoir être vidés"
  );
}

{
  const boat = {
    id: 1,
    x: 12,
    z: 34,
    isPlayer: false,
    inSargasse: 0,
    lastSargasseFxAt: 0,
    dynamics: {
      vx: 10,
      vz: 20,
      rollVel: 0,
      structure: { hull: 1 },
      addWater() {}
    }
  };
  const harness = {
    sargasses: [{ row: 2, slot: 0, x: boat.x, z: boat.z, size: SARGASSE.radius }],
    sargasseFirstRow: 2,
    time: 0,
    collectAlive: () => [boat],
    placeSargasse() {},
    refreshSargasseVisuals() {},
    particles: { emitBurst() {} }
  };

  ObstacleSystems.updateObstacles.call(harness, 0);
  assert.ok(Math.abs(boat.dynamics.vx - 3.5) < 1e-9);
  assert.ok(Math.abs(boat.dynamics.vz - 7) < 1e-9);

  ObstacleSystems.updateObstacles.call(harness, 0);
  assert.ok(
    Math.abs(boat.dynamics.vx - 3.5) < 1e-9,
    "le frein d'entrée ne doit pas se répéter à chaque frame"
  );
}

console.log("sound and chaos tests: ok");
