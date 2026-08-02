import assert from "node:assert/strict";
import * as THREE from "../vendor/three.module.min.js";
import { TOUR_STAGES } from "../src/game/balance.js";
import {
  WorldStreamer,
  distanceToIslandCollider,
  routeCenter
} from "../src/render/world.js";

const MARGIN = 1.48;
const world = new WorldStreamer(THREE, new THREE.Scene(), 0x7a11e);

function boatAt(x, z, vx = 0, vz = 0) {
  const dynamics = { x, z, vx, vz };
  return {
    dynamics,
    get x() { return this.dynamics.x; },
    get z() { return this.dynamics.z; }
  };
}

function allStreamedIslands() {
  return world.chunks.flatMap((chunk) => chunk.islands);
}

function assertVisualInsideCollider(island) {
  const hill = island.visualHill;
  if (!hill?.geometry?.attributes?.position?.array) return;
  const positions = hill.geometry.attributes.position.array;
  const cosine = Math.cos(hill.rotation.y);
  const sine = Math.sin(hill.rotation.y);
  for (let index = 0; index < positions.length; index += 3) {
    const localX = positions[index] * hill.scale.x;
    const localZ = positions[index + 2] * hill.scale.z;
    const dx = cosine * localX + sine * localZ;
    const dz = -sine * localX + cosine * localZ;
    const contact = distanceToIslandCollider(island, island.x + dx, island.z + dz, {});
    assert.ok(
      contact.distance <= 1e-4,
      `visual vertex outside collider by ${contact.distance.toFixed(4)}m`
    );
  }
}

let collisionSamples = 0;
const archetypes = new Set();
for (let stageIndex = 0; stageIndex < TOUR_STAGES.length; stageIndex++) {
  const stage = TOUR_STAGES[stageIndex];
  const seed = (0x91ab + Math.imul(stageIndex + 1, 0x9e3779b9)) >>> 0;
  world.setStage(seed ^ 0x77ad, stage.palette, stage.environment, stage.distance);
  archetypes.add(world.stageProfile.archetype);

  const islands = allStreamedIslands();
  assert.ok(islands.length >= 12, `stage ${stageIndex + 1} must stream a populated coast`);
  assert.ok(world.landmarkIslands.length >= 1, `stage ${stageIndex + 1} must own a landmark`);
  for (let z = 0; z <= Math.min(stage.distance, 1300); z += 15) {
    assert.ok(
      world.nearestSurface(routeCenter(z), z, {}).distance > 8,
      `stage ${stageIndex + 1}: the racing centerline must stay clear at z=${z}`
    );
  }

  for (const island of islands) {
    assertVisualInsideCollider(island);
    for (let degrees = 0; degrees < 360; degrees += 6) {
      const angle = degrees * Math.PI / 180;
      for (const fraction of [0, 0.02, 0.18, 0.42, 0.76, 1, 1.08]) {
        collisionSamples++;
        const boat = boatAt(
          island.x + Math.cos(angle) * island.rx * fraction,
          island.z + Math.sin(angle) * island.rz * fraction,
          -Math.cos(angle) * 28,
          -Math.sin(angle) * 28
        );
        const before = world.nearestSurface(boat.x, boat.z, {});
        const result = world.resolveBoatCollision(boat, MARGIN, {});
        assert.equal(result.hit, before.distance < MARGIN);
        const after = world.nearestSurface(boat.x, boat.z, {});
        assert.ok(
          after.distance >= MARGIN - 1e-4,
          `stage ${stageIndex + 1}: unresolved coast penetration ${after.distance.toFixed(5)}m`
        );
        assert.ok(Number.isFinite(boat.x) && Number.isFinite(boat.z));
      }
    }
  }

  const cameraIsland = islands[0];
  const towardRoute = Math.sign(routeCenter(cameraIsland.z) - cameraIsland.x) || 1;
  const cameraTarget = new THREE.Vector3(
    cameraIsland.x + towardRoute * (cameraIsland.rx + 12),
    1,
    cameraIsland.z
  );
  const cameraDesired = new THREE.Vector3(
    cameraIsland.x - towardRoute * (cameraIsland.rx + 12),
    8,
    cameraIsland.z
  );
  const constrained = world.constrainCamera(cameraTarget, cameraDesired, new THREE.Vector3());
  assert.ok(
    world.nearestSurface(constrained.x, constrained.z, {}).distance >= 2.2,
    `stage ${stageIndex + 1}: chase camera must not cross terrain`
  );

  // Le streamer doit conserver la même garantie après recyclage des dix chunks.
  world.update(1180);
  for (const island of allStreamedIslands()) {
    const boat = boatAt(island.x, island.z, 28, 28);
    world.resolveBoatCollision(boat, MARGIN, {});
    assert.ok(world.nearestSurface(boat.x, boat.z, {}).distance >= MARGIN - 1e-4);
  }
}

assert.deepEqual(
  [...archetypes].sort(),
  ["islets", "lagoon", "volcanic"],
  "the Tour must expose three readable environment families"
);

console.log(`world collision torture ok · ${collisionSamples} contacts · 8 stages · 3 archetypes`);
