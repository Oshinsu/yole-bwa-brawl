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

console.log(JSON.stringify({
  ok: true,
  spectatorFleet: "removed",
  shippedModels: 0,
  offlineEntries: 0
}, null, 2));
