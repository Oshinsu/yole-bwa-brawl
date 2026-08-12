import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const game = readFileSync(resolve(ROOT, "src/game/game.js"), "utf8");
const assets = readFileSync(resolve(ROOT, "src/render/assets.js"), "utf8");
const worker = readFileSync(resolve(ROOT, "service-worker.js"), "utf8");
const singleFileBuilder = readFileSync(resolve(ROOT, "tools/build_single_file.py"), "utf8");

for (const source of [game, assets, worker, singleFileBuilder]) {
  assert.ok(!/SpectatorFleet|spectator-fleet|spectatorCatamaran|spectatorScooter|spectatorDancer/.test(source));
}

assert.equal(
  existsSync(resolve(ROOT, "assets/models/spectators")),
  false,
  "catamarans, scooters et danseuses ne doivent plus être distribués"
);
assert.equal(
  existsSync(resolve(ROOT, "src/render/spectator-fleet.js")),
  false,
  "le runtime de flotte spectatrice ne doit plus être embarqué"
);

// ── LA FLOTTILLE 2026 ─────────────────────────────────────────────────────────
// L'ancienne flotte spectatrice (catamarans + scooters + danseuses) reste
// bannie : elle pesait lourd et ne ressemblait à rien. La flottille demandée
// le 12 août 2026 est un contrat DIFFÉRENT, verrouillé ici : exactement deux
// GLB (catamaran, vedette), 300 Ko maximum chacun, semés par world.js sur un
// RNG dédié — jamais un module runtime séparé.
import { statSync } from "node:fs";

const FLOTTILLE = [
  "assets/models/flottille_catamaran.glb",
  "assets/models/flottille_vedette.glb"
];
const poids = [];
for (const fichier of FLOTTILLE) {
  const octets = statSync(resolve(ROOT, fichier)).size;
  assert.ok(octets <= 300 * 1024, `${fichier} dépasse 300 Ko (${octets})`);
  poids.push(octets);
}
const world = readFileSync(resolve(ROOT, "src/render/world.js"), "utf8");
assert.ok(/scatterFlottille/.test(world), "le semis de flottille vit dans world.js");
assert.ok(/flottilleRng/.test(world), "la flottille tire sur son RNG dédié");
assert.ok(
  !existsSync(resolve(ROOT, "src/render/flottille.js")),
  "pas de module runtime séparé pour la flottille"
);
for (const source of [game, assets, worker]) {
  // Le nom historique reste interdit ; les fichiers flottille_* sont le
  // contrat actuel et doivent être précachés.
  assert.ok(!/spectatorFleet/i.test(source));
}
assert.ok(/flottille_catamaran\.glb/.test(worker), "catamaran précaché");
assert.ok(/flottille_vedette\.glb/.test(worker), "vedette précachée");

console.log(JSON.stringify({
  ok: true,
  spectatorFleet: "removed",
  flottille: { modeles: FLOTTILLE.length, octets: poids },
  offlineEntries: FLOTTILLE.length
}, null, 2));
