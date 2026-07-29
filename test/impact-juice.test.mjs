import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { IMPACT_MIXES } from "../src/core/audio.js";
import { HAPTIC_PATTERNS, scaleHapticPattern } from "../src/game/game.js";
import { YOLE_TEXTURES } from "../src/render/assets.js";
import { ImpactDirector, IMPACT_TIERS } from "../src/render/impact.js";
import { JUICE_VFX } from "../src/render/vfx.js";
import { RNG } from "../src/core/rng.js";

assert.deepEqual(Object.values(JUICE_VFX), [0, 1, 2, 3]);
assert.equal(YOLE_TEXTURES.juiceVfx.file, "v7/juice/juice_vfx_atlas.webp");

for (const kind of ["harpoon", "coconut", "mine", "slam", "takedown"]) {
  const mix = IMPACT_MIXES[kind];
  assert.ok(mix, `mix audio absent: ${kind}`);
  assert.ok(mix.layers.length >= 2, `impact ${kind} non stratifié`);
  assert.ok(mix.duck > 0 && mix.release > 0, `ducking absent: ${kind}`);
}
assert.ok(IMPACT_MIXES.mine.duck > IMPACT_MIXES.harpoon.duck);
assert.ok(IMPACT_TIERS.mine.aftershock > IMPACT_TIERS.coconut.aftershock);
assert.ok(IMPACT_TIERS.coconut.kick > IMPACT_TIERS.harpoon.kick);

const settings = {
  get(key) {
    if (key === "impact") return 1;
    if (key === "reduceFlash") return true;
    return false;
  }
};
const director = new ImpactDirector(new RNG(20260727), settings);
director.trigger("mine", { dirX: 1, dirZ: 0, intensity: 1 });
assert.ok(director.freeze <= 0.16, "hitstop dépasse le budget de contrôle");
assert.ok(director.aftershock >= 0.5, "queue basse fréquence absente");
assert.ok(director.flash <= 0.16, "FLASH RÉDUIT laisse un pic trop lumineux");
const initialAftershock = director.aftershock;
for (let frame = 0; frame < 60; frame++) director.update(1 / 60);
assert.ok(director.aftershock < initialAftershock * 0.02, "aftershock ne se purge pas");

const fullMine = scaleHapticPattern(HAPTIC_PATTERNS.mineImpact, 1);
const softMine = scaleHapticPattern(HAPTIC_PATTERNS.mineImpact, 0.5);
assert.equal(fullMine.length, 5);
assert.equal(softMine.length, 5);
assert.ok(softMine[0] < fullMine[0] && softMine[4] < fullMine[4]);
assert.equal(softMine[1], fullMine[1], "le rythme haptique ne doit pas changer en DOUX");
assert.equal(scaleHapticPattern(HAPTIC_PATTERNS.mineImpact, 0), 0);

/**
 * Dimensions d'un WebP, lues dans l'en-tête.
 *
 * ⚠️ DEUX CONTENEURS POSSIBLES, et il faut gérer les deux. Un WebP sans
 * transparence est un simple `VP8 ` : largeur et hauteur sur 14 bits aux
 * octets 26-29. Dès qu'il y a un canal alpha, l'encodeur emballe le tout dans
 * un `VP8X` étendu, où les dimensions sont sur 24 bits aux octets 24-29 et
 * stockées MOINS UN. Les atlas de VFX sont transparents, les fonds ne le sont
 * pas : ce fichier lit les deux.
 */
function webpSize(relative) {
  const buffer = readFileSync(new URL(`../${relative}`, import.meta.url));
  assert.equal(buffer.toString("ascii", 0, 4), "RIFF", `${relative}: conteneur RIFF`);
  assert.equal(buffer.toString("ascii", 8, 12), "WEBP", `${relative}: signature WEBP`);
  const forme = buffer.toString("ascii", 12, 16);
  if (forme === "VP8X") {
    const largeur = buffer.readUIntLE(24, 3) + 1;
    const hauteur = buffer.readUIntLE(27, 3) + 1;
    return [largeur, hauteur];
  }
  assert.equal(forme, "VP8 ", `${relative}: conteneur VP8 ou VP8X attendu, reçu ${forme}`);
  return [buffer.readUInt16LE(26) & 0x3fff, buffer.readUInt16LE(28) & 0x3fff];
}

for (const name of [
  "harpoon_anchor_tear",
  "coconut_shockwave",
  "mine_detonation",
  "perfect_counterheel"
]) {
  assert.deepEqual(webpSize(`assets/textures/v7/juice/${name}.webp`), [512, 512]);
}
assert.deepEqual(webpSize("assets/textures/v7/juice/juice_vfx_atlas.webp"), [1024, 1024]);

console.log(JSON.stringify({
  ok: true,
  impactTiers: {
    harpoon: IMPACT_TIERS.harpoon,
    coconut: IMPACT_TIERS.coconut,
    mine: IMPACT_TIERS.mine
  },
  audioLayers: Object.fromEntries(
    Object.entries(IMPACT_MIXES).map(([kind, mix]) => [kind, mix.layers.length])
  ),
  haptic: { fullMine, softMine },
  atlas: "1024x1024 · 2x2 · 1 draw call"
}, null, 2));
