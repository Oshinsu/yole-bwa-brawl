import assert from "node:assert/strict";
import * as THREE from "../vendor/three.module.min.js";
import { ARENAS, ARENA_DISTANCE, TOUR_STAGES } from "../src/game/balance.js";
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

// Les huit côtes du Tour ET les arènes de la Combat Box (passe 80) passent la
// même torture : côte peuplée, axe de course libre, aucune pénétration après
// résolution, caméra qui ne traverse pas le relief, garantie conservée après
// recyclage des tronçons.
const COTES = [
  ...TOUR_STAGES.map((stage, index) => ({
    label: `stage ${index + 1}`,
    kind: "tour",
    palette: stage.palette,
    environment: stage.environment,
    distance: stage.distance,
    seed: (0x91ab + Math.imul(index + 1, 0x9e3779b9)) >>> 0,
    // Une côte de course est peuplée : au moins douze îlots sur dix tronçons.
    minIslands: 12
  })),
  ...ARENAS.map((arena, index) => ({
    label: `arène ${arena.slug}`,
    kind: "arena",
    palette: arena.palette,
    environment: arena.environment,
    distance: ARENA_DISTANCE,
    seed: (0x0b0a2026 + Math.imul(index + 3, 0x85ebca6b)) >>> 0,
    // La haute mer du Diamant saute plus d'un bord sur deux, exprès.
    minIslands: (arena.environment.skipChance ?? 0) > 0.4 ? 4 : 12
  }))
];

let collisionSamples = 0;
const tourArchetypes = new Set();
const arenaArchetypes = new Set();
for (const cote of COTES) {
  world.setStage(cote.seed ^ 0x77ad, cote.palette, cote.environment, cote.distance);
  (cote.kind === "tour" ? tourArchetypes : arenaArchetypes).add(world.stageProfile.archetype);

  const islands = allStreamedIslands();
  assert.ok(islands.length >= cote.minIslands, `${cote.label} must stream a populated coast (${islands.length})`);
  assert.ok(world.landmarkIslands.length >= 1, `${cote.label} must own a landmark`);
  for (let z = 0; z <= Math.min(cote.distance, 1300); z += 15) {
    assert.ok(
      world.nearestSurface(routeCenter(z), z, {}).distance > 8,
      `${cote.label}: the racing centerline must stay clear at z=${z}`
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
          `${cote.label}: unresolved coast penetration ${after.distance.toFixed(5)}m`
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
    `${cote.label}: chase camera must not cross terrain`
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
  [...tourArchetypes].sort(),
  ["islets", "lagoon", "volcanic"],
  "the Tour must expose three readable environment families"
);
assert.deepEqual(
  [...arenaArchetypes].sort(),
  ["cayes", "cliffs", "islets", "lagoon", "mangrove", "tropical", "volcanic"],
  "the Combat Box arenas must cover the seven coast archetypes"
);

console.log(`world collision torture ok · ${collisionSamples} contacts · ${TOUR_STAGES.length} stages · ${ARENAS.length} arènes · ${arenaArchetypes.size} archetypes`);
