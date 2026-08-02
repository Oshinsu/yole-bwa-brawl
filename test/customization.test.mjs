import assert from "node:assert/strict";
import * as THREE from "./mock-three.module.js";
import { DEFAULT_SETTINGS, SettingsStore } from "../src/core/settings.js";
import {
  CREW_KITS,
  DEFAULT_CUSTOMIZATION,
  GUNWALE_ACCENTS,
  HULL_PAINTS,
  RIG_VISUAL_PROFILES,
  WOOD_FINISHES,
  normalizeCatalogIndex,
  normalizeCustomization
} from "../src/game/customization.js";
import { RIGS, SAIL_LIVERIES } from "../src/game/balance.js";
import { YoleVisual } from "../src/render/yole-visual.js";

for (const catalog of [HULL_PAINTS, GUNWALE_ACCENTS, WOOD_FINISHES, CREW_KITS, RIG_VISUAL_PROFILES]) {
  assert.equal(Object.isFrozen(catalog), true, "a customization catalog must be immutable");
  assert.equal(Object.isFrozen(catalog[0]), true, "catalog entries must be immutable");
}
assert.equal(RIG_VISUAL_PROFILES.length, RIGS.length);
assert.deepEqual(RIG_VISUAL_PROFILES.map(({ key }) => key), RIGS.map(({ key }) => key));

assert.equal(normalizeCatalogIndex(2, HULL_PAINTS), 2);
assert.equal(normalizeCatalogIndex("2", HULL_PAINTS), 0);
assert.equal(normalizeCatalogIndex(2.5, HULL_PAINTS), 0);
assert.equal(normalizeCatalogIndex(99, HULL_PAINTS, 1), 1);

const corrupt = normalizeCustomization({
  hullColor: HULL_PAINTS.length,
  accentColor: -1,
  woodFinish: "2",
  crewKit: 1.2,
  sailLivery: 99,
  rig: -10
});
assert.deepEqual(corrupt, DEFAULT_CUSTOMIZATION);
assert.equal(Object.isFrozen(corrupt), true);

assert.ok(DEFAULT_SETTINGS.hullColor >= 0 && DEFAULT_SETTINGS.hullColor < HULL_PAINTS.length);
assert.ok(DEFAULT_SETTINGS.accentColor >= 0 && DEFAULT_SETTINGS.accentColor < GUNWALE_ACCENTS.length);
assert.ok(DEFAULT_SETTINGS.woodFinish >= 0 && DEFAULT_SETTINGS.woodFinish < WOOD_FINISHES.length);
assert.ok(DEFAULT_SETTINGS.crewKit >= 0 && DEFAULT_SETTINGS.crewKit < CREW_KITS.length);
assert.ok(DEFAULT_SETTINGS.sailLivery >= 0 && DEFAULT_SETTINGS.sailLivery < SAIL_LIVERIES.length);
assert.ok(DEFAULT_SETTINGS.rig >= 0 && DEFAULT_SETTINGS.rig < RIGS.length);

class MemoryStorage {
  constructor(seed = {}) { this.data = new Map(Object.entries(seed)); }
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, String(value)); }
}

const storageKey = "yole-bwa-brawl-v3-2-settings";
const settings = new SettingsStore(new MemoryStorage({
  [storageKey]: JSON.stringify({ hullColor: 999, accentColor: 2, woodFinish: "3", crewKit: -1, rig: 0 })
}));
assert.equal(settings.get("hullColor"), DEFAULT_CUSTOMIZATION.hullColor);
assert.equal(settings.get("accentColor"), 2);
assert.equal(settings.get("woodFinish"), DEFAULT_CUSTOMIZATION.woodFinish);
assert.equal(settings.get("crewKit"), DEFAULT_CUSTOMIZATION.crewKit);
assert.equal(settings.get("rig"), 0);
settings.set("accentColor", 999);
assert.equal(settings.get("accentColor"), DEFAULT_CUSTOMIZATION.accentColor);

function makeTexture() {
  return {
    repeat: new THREE.Vector2(1, 1),
    offset: new THREE.Vector2(0, 0),
    needsUpdate: false,
    clone: makeTexture
  };
}

const atlas = makeTexture();
const assets = {
  texture(key) { return key === "sailAtlas" ? atlas : null; },
  get() { return null; },
  has() { return false; },
  hasRig() { return false; },
  instantiate() { return null; }
};

const identityColor = 0x1de1e8;
const visual = new YoleVisual(THREE, identityColor, 0xf3ffff, 0, assets);
const applied = visual.applyCustomization({
  hullColor: 2,
  accentColor: 4,
  woodFinish: 3,
  crewKit: 5,
  sailLivery: 3,
  rig: 2
});

assert.deepEqual(applied, {
  hullColor: 2,
  accentColor: 4,
  woodFinish: 3,
  crewKit: 5,
  sailLivery: 3,
  rig: 2
});
assert.equal(Object.isFrozen(applied), true);
assert.equal(visual.hullMaterial.color.hex, HULL_PAINTS[2].color);
assert.equal(visual.accentMaterial.color.hex, GUNWALE_ACCENTS[4].color);
assert.equal(visual.woodMaterial.color.hex, WOOD_FINISHES[3].color);
assert.equal(visual.woodMaterial.roughness, WOOD_FINISHES[3].roughness);
assert.equal(visual.crew[0].visual.jerseyMaterial.color.hex, CREW_KITS[5].jersey);
assert.equal(visual.crew[0].visual.shortsMaterial.color.hex, CREW_KITS[5].shorts);

assert.equal(visual.sailLiveryIndex, 3);
assert.equal(visual.sailAtlasTexture.repeat.x, 0.5);
assert.equal(visual.sailAtlasTexture.repeat.y, 0.5);
assert.equal(visual.sailAtlasTexture.offset.x, 0.5);
assert.equal(visual.sailAtlasTexture.offset.y, 0);
assert.equal(visual.sailAtlasTexture.needsUpdate, true);

assert.equal(visual.rigProfileIndex, 2);
assert.equal(visual.rigMain.scale.y, RIG_VISUAL_PROFILES[2].height);
assert.equal(visual.rigMain.scale.z, RIG_VISUAL_PROFILES[2].chord);

// La peinture ne doit jamais remplacer le signal d'équipe.
assert.equal(visual.identityColor, identityColor);
assert.equal(visual.color, identityColor);
assert.equal(visual.identityMark.material.color.hex, identityColor);

assert.equal(visual.setSailLivery(999), DEFAULT_CUSTOMIZATION.sailLivery);
assert.equal(visual.setRigProfile(999), DEFAULT_CUSTOMIZATION.rig);
assert.equal(visual.rigMain.scale.y, RIG_VISUAL_PROFILES[DEFAULT_CUSTOMIZATION.rig].height);

console.log(JSON.stringify({
  catalogs: {
    hull: HULL_PAINTS.length,
    accent: GUNWALE_ACCENTS.length,
    wood: WOOD_FINISHES.length,
    crew: CREW_KITS.length
  },
  normalized: applied,
  identitySeparated: true
}, null, 2));
