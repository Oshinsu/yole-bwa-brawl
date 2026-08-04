import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { BALANCE, TOUR_STAGES } from "../src/game/balance.js";
import { WaveField } from "../src/sim/waves.js";

const root = new URL("../", import.meta.url);
const [gameSource, hudSource, inputSource, matchSource, cameraSource, styleSource] = await Promise.all([
  readFile(new URL("src/game/game.js", root), "utf8"),
  readFile(new URL("src/game/hud.js", root), "utf8"),
  readFile(new URL("src/game/input.js", root), "utf8"),
  readFile(new URL("src/game/match.js", root), "utf8"),
  readFile(new URL("src/game/camera.js", root), "utf8"),
  readFile(new URL("style.css", root), "utf8")
]);

assert.ok(BALANCE.rhum.duration <= 3, "le Rhum ne doit plus offrir cinq secondes d'invulnérabilité");

assert.equal(TOUR_STAGES.length, 8);
const signatures = new Set();
const profiles = new Set();
for (const stage of TOUR_STAGES) {
  const profile = stage.gameplay;
  assert.ok(profile, `${stage.slug}: profil gameplay absent`);
  assert.ok(profile.signature, `${stage.slug}: signature joueur absente`);
  assert.ok(profile.trackHalfWidth >= 44 && profile.trackHalfWidth <= 60);
  assert.ok(profile.swellScale >= 0.8 && profile.swellScale <= 1.3);
  assert.ok(profile.windScale >= 0.85 && profile.windScale <= 1.2);
  signatures.add(profile.signature);
  profiles.add([
    profile.windScale,
    profile.swellScale,
    profile.crossSea,
    profile.stormSpeed,
    profile.trackHalfWidth,
    profile.sargasseSpacing,
    profile.pickupSpacing
  ].join(":"));
}
assert.equal(signatures.size, TOUR_STAGES.length, "chaque étape doit annoncer une signature unique");
assert.ok(profiles.size >= 7, "les étapes ne doivent pas être de simples recolorations");

const baseline = new WaveField();
baseline.setWeather(0.25);
const baselineAmplitude = baseline.globalAmplitude;
const longSwell = new WaveField();
longSwell.setWeather(0.25, TOUR_STAGES[4].gameplay);
assert.ok(longSwell.globalAmplitude > baselineAmplitude * 1.18, "la longue houle doit se sentir en physique");
const crossed = new WaveField();
crossed.setWeather(0, TOUR_STAGES[2].gameplay);
assert.ok(crossed.crossSea >= 0.3, "la mer croisée doit changer la direction des vagues");

assert.match(gameSource, /this\.trainingMode \? "peyi" : this\.playerAiLevel\(\)/);
assert.match(gameSource, /TAKEDOWN \+1 · DERNIER DEBOUT \+2 · PREMIER À 5/);
assert.match(gameSource, /spectatorFastForward[\s\S]*simTime \* 4/);
assert.match(gameSource, /idleFrameInterval = 1000 \/ 30/);
assert.match(inputSource, /startMatch\?\.\(\{ training \}\)/);
assert.match(cameraSource, /cycleSpectatorCamera/);
assert.match(cameraSource, /toggleSpectatorFastForward/);
assert.match(hudSource, /this\.sargasses/);
assert.match(hudSource, /this\.pickups/);
assert.match(hudSource, /KO \+1 · DERNIER DEBOUT \+2/);
assert.match(matchSource, /player\?\.eliminatedReason/);
assert.match(matchSource, /\+2 DERNIER DEBOUT/);
assert.match(
  styleSource,
  /#hud:has\(\.spectateur:not\(\.hidden\)\) \.perf-stats\s*\{\s*display:none!important\s*\}/,
  "les diagnostics ne doivent pas recouvrir les actions du mode spectateur"
);

console.log("player fun pass test: ok");
