// Arènes de la Combat Box (passe 80) : catalogue, sélection, décor, lien de
// défi, replay. La torture de collision des côtes vit dans world-collision.
import assert from "node:assert/strict";
import * as THREE from "../vendor/three.module.min.js";
import {
  ARENAS,
  ARENA_DISTANCE,
  ARENA_SCHOOL_SLUG,
  TOUR_STAGES,
  arenaForSeed,
  arenaIndexForSeed,
  resolveArena
} from "../src/game/balance.js";
import { WorldStreamer } from "../src/render/world.js";
import { buildChallengeUrl, readChallenge } from "../src/game/growth.js";
import { GAMEPLAY_VERSION, ReplayRecorder } from "../src/sim/replay.js";

// ── Catalogue ────────────────────────────────────────────────────────────────
assert.ok(ARENAS.length >= 8, "la Combat Box promet au moins huit cartes");
assert.equal(new Set(ARENAS.map((arena) => arena.slug)).size, ARENAS.length, "slugs uniques");
for (const arena of ARENAS) {
  assert.match(arena.slug, /^[a-z0-9-]+$/, `${arena.slug} : slug utilisable dans une URL`);
  for (const key of ["name", "short", "tagline", "accent"]) {
    assert.equal(typeof arena[key], "string", `${arena.slug}.${key}`);
    assert.ok(arena[key].length > 0, `${arena.slug}.${key} vide`);
  }
  assert.ok(arena.short.length <= 16, `${arena.slug} : le nom court tient dans le bouton de réglage`);
  for (const key of ["sand", "shallowRock", "green", "darkGreen", "leaf"]) {
    assert.equal(typeof arena.palette[key], "number", `${arena.slug} : palette.${key}`);
  }
  for (const key of ["deep", "mid", "shallow", "foam"]) {
    assert.equal(typeof arena.environment.water[key], "number", `${arena.slug} : eau.${key}`);
  }
  assert.equal(typeof arena.environment.archetype, "string");
  assert.equal(typeof arena.environment.landmark?.type, "string", `${arena.slug} : un repère par arène`);
  for (const key of ["windScale", "swellScale", "crossSea", "stormSpeed", "sargasseSpacing", "pickupSpacing"]) {
    assert.equal(typeof arena.gameplay[key], "number", `${arena.slug} : gameplay.${key}`);
  }
  // Signature de mer légère : une arène change la carte, pas l'équilibre du jeu.
  assert.ok(arena.gameplay.windScale >= 0.9 && arena.gameplay.windScale <= 1.1, `${arena.slug} : vent ±10 %`);
  assert.ok(arena.gameplay.swellScale >= 0.78 && arena.gameplay.swellScale <= 1.3, `${arena.slug} : houle bornée`);
}
const archetypes = new Set(ARENAS.map((arena) => arena.environment.archetype));
assert.ok(archetypes.size >= 6, `au moins six familles de côte, ${archetypes.size} trouvées`);
for (const nouvelle of ["mangrove", "cayes", "cliffs"]) {
  assert.ok(archetypes.has(nouvelle), `la famille ${nouvelle} doit être utilisée par une arène`);
}

// ── Résolution ───────────────────────────────────────────────────────────────
assert.equal(resolveArena(ARENA_SCHOOL_SLUG)?.environment.archetype, "lagoon", "l'arène-école est le lagon");
assert.equal(resolveArena("auto"), null);
assert.equal(resolveArena(""), null);
assert.equal(resolveArena(null), null);
assert.equal(resolveArena(42), null);
assert.equal(resolveArena("nulle-part"), null);

// ── Sélection par graine : déterministe, la rotation couvre tout le catalogue ─
for (const seed of [0, 1, 0x0b0a2026, 0xffffffff, 12345, 0x91ab]) {
  assert.equal(arenaIndexForSeed(seed), arenaIndexForSeed(seed), `graine ${seed} : même carte deux fois`);
  const couverture = new Set();
  for (let rotation = 0; rotation < ARENAS.length; rotation++) couverture.add(arenaIndexForSeed(seed, rotation));
  assert.equal(couverture.size, ARENAS.length, `graine ${seed} : la rotation passe par chaque carte`);
  assert.equal(arenaForSeed(seed, ARENAS.length).slug, arenaForSeed(seed, 0).slug, "la rotation boucle");
}
// Des graines voisines ne tombent pas toutes sur la même carte.
const premieres = new Set([0x0b0a2026, 0x0b0a2027, 0x0b0a2028, 0x0b0a2029, 0x0b0a202a, 0x0b0a202b].map((seed) => arenaIndexForSeed(seed)));
assert.ok(premieres.size >= 3, `six graines voisines donnent au moins trois cartes (${premieres.size})`);

// ── Décor : chaque arène pose son profil, sa palette, son repère ─────────────
const world = new WorldStreamer(THREE, new THREE.Scene(), 0x7a11e);
for (const arena of ARENAS) {
  world.setStage(0x0b0a2026 ^ 0x77ad, arena.palette, arena.environment, ARENA_DISTANCE);
  assert.equal(world.stageProfile.archetype, arena.environment.archetype, `${arena.slug} : archétype posé`);
  assert.equal(world.stagePalette.sand, arena.palette.sand, `${arena.slug} : palette posée`);
  assert.ok(world.landmarkIslands.length >= 1, `${arena.slug} : repère construit`);
  const premiereCote = world.chunks.map((chunk) => chunk.islands.map((island) => [island.x, island.z, island.rx, island.rz]));
  world.setStage(0x0b0a2026 ^ 0x77ad, arena.palette, arena.environment, ARENA_DISTANCE);
  const secondeCote = world.chunks.map((chunk) => chunk.islands.map((island) => [island.x, island.z, island.rx, island.rz]));
  assert.deepEqual(secondeCote, premiereCote, `${arena.slug} : la côte est déterministe`);
  if (world.stageProfile.extraIsletChance > 0) {
    assert.ok(
      world.chunks.some((chunk) => chunk.islands.length >= 3),
      `${arena.slug} : la seconde rangée d'îlots doit apparaître`
    );
  }
}
// Les côtes du Tour ne tirent jamais de second îlot : leur suite RNG est contractuelle.
for (const stage of TOUR_STAGES) {
  world.setStage(0x91ab ^ 0x77ad, stage.palette, stage.environment, stage.distance);
  assert.ok(!(world.stageProfile.extraIsletChance > 0), `${stage.slug} : pas de second îlot dans le Tour`);
  assert.ok(world.chunks.every((chunk) => chunk.islands.length <= 2), `${stage.slug} : un îlot par bord au plus`);
}

// ── Lien de défi : même mer, même seed, même carte ───────────────────────────
const lienCombat = buildChallengeUrl({ href: "https://example.com/yole/", seed: 0xabc, mode: "combat", arena: "cayes-du-sud" });
assert.ok(lienCombat.includes("arena=cayes-du-sud"), "le lien de Combat Box porte l'arène");
assert.equal(readChallenge(new URL(lienCombat).search).arena, "cayes-du-sud");
const lienTour = buildChallengeUrl({ href: "https://example.com/yole/", seed: 0xabc, mode: "tour", stage: 2, arena: "cayes-du-sud" });
assert.ok(!lienTour.includes("arena="), "une étape du Tour n'a pas d'arène");
assert.equal(readChallenge(new URL(lienTour).search).arena, "");
const lienSans = buildChallengeUrl({ href: "https://example.com/yole/", seed: 0xabc, mode: "combat" });
assert.ok(!lienSans.includes("arena="), "sans arène, le lien reste celui d'avant");

// ── Replay : l'arène voyage avec la graine ───────────────────────────────────
const enregistreur = new ReplayRecorder(0x42, 60);
enregistreur.arena = "mangrove-du-robert";
const payload = enregistreur.export();
assert.equal(payload.arena, "mangrove-du-robert");
assert.equal(payload.gameplayVersion, GAMEPLAY_VERSION);
assert.match(GAMEPLAY_VERSION, /arenes/, "la version de gameplay dit que les arènes ont changé la mer");
assert.equal(new ReplayRecorder(0x42, 60).export().arena, null, "une étape du Tour exporte arena: null");

console.log(`arenas ok · ${ARENAS.length} arènes · ${archetypes.size} archétypes · repère et rotation vérifiés`);
