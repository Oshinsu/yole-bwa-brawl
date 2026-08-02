import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  REPLAY_LIBRARY_LIMIT,
  describeReplayEntry,
  listReplayEntries,
  removeReplayFromVault
} from "../src/game/replay-library.js";
import {
  GAMEPLAY_VERSION,
  ReplayVault,
  REPLAY_SCHEMA_VERSION,
  SIMULATION_VERSION
} from "../src/sim/replay.js";

const VAULT_KEY = "yole-bwa-brawl-replays-v3-2";

function compatibleReplay(seed = 0x1a2b3c4d) {
  return {
    schemaVersion: REPLAY_SCHEMA_VERSION,
    simulationVersion: SIMULATION_VERSION,
    gameplayVersion: GAMEPLAY_VERSION,
    fixedHz: 60,
    seed,
    finalTick: 600,
    finalChecksum: "deadbeef",
    checkpoints: [{ tick: 600, checksum: "deadbeef" }],
    inputs: [],
    metadata: {}
  };
}

function memoryStorage(items = []) {
  const values = new Map([[VAULT_KEY, JSON.stringify(items)]]);
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}

const hostileMode = `<img src=x onerror="globalThis.pwned=true">`;
const item = {
  id: "safe-1",
  createdAt: "2026-07-30T14:30:00.000Z",
  summary: { mode: hostileMode },
  replay: compatibleReplay()
};
const description = describeReplayEntry(item);
assert.equal(description.mode, hostileMode, "untrusted labels must remain plain text, not transformed into markup");
assert.equal(description.seed, "0x1A2B3C4D");
assert.equal(description.checksum, "deadbeef");
assert.equal(description.compatible, true);
assert.equal(description.compatibility, "Compatible");
assert.notEqual(description.date, "Date inconnue");

const tour = describeReplayEntry({
  ...item,
  summary: {},
  replay: {
    ...compatibleReplay(3),
    metadata: { tourStage: 2, stage: "Le Robert → Trinité" }
  }
});
assert.equal(tour.mode, "Grand Tour · étape 3");

const incompatible = describeReplayEntry({
  ...item,
  replay: { ...compatibleReplay(), gameplayVersion: "ancienne-version" }
});
assert.equal(incompatible.compatible, false);
assert.equal(incompatible.compatibility, "Ancienne version");

const elevenItems = Array.from({ length: 11 }, (_, index) => ({
  id: `r-${index}`,
  createdAt: "2026-07-30T14:30:00.000Z",
  replay: compatibleReplay(index)
}));
const cappedVault = new ReplayVault(memoryStorage(elevenItems), REPLAY_LIBRARY_LIMIT);
assert.equal(listReplayEntries(cappedVault).length, 8, "the library must never expose more than eight entries");

const storage = memoryStorage(elevenItems.slice(0, 3));
const vault = new ReplayVault(storage, REPLAY_LIBRARY_LIMIT);
assert.equal(removeReplayFromVault(vault, "r-1"), true);
assert.deepEqual(vault.list().map((entry) => entry.id), ["r-0", "r-2"], "single deletion must preserve IDs and ordering");
assert.equal(removeReplayFromVault(vault, "missing"), false);
assert.equal(removeReplayFromVault(vault, "r-0"), true);
assert.equal(removeReplayFromVault(vault, "r-2"), true);
assert.deepEqual(vault.list(), [], "deleting the last entry must clear storage");
assert.equal(vault.clear(), true, "a successful storage clear must be reported");
const failingVault = new ReplayVault({
  getItem() { return "[]"; },
  removeItem() { throw new Error("quota/storage unavailable"); }
});
assert.equal(failingVault.clear(), false, "storage failures must reach the UI instead of faking success");

const source = await readFile(new URL("../src/game/replay-library.js", import.meta.url), "utf8");
assert.doesNotMatch(source, /\.innerHTML\s*=/, "untrusted replay data must never enter innerHTML");
assert.match(source, /textContent\s*=/, "dynamic replay labels should be assigned through textContent");
assert.match(source, /addEventListener\("cancel"/, "Escape must be handled through the dialog cancel event");
assert.match(source, /event\.target === dialog/, "clicking the backdrop must close the library");
assert.match(source, /event\.key !== "Tab"/, "the non-modal fallback must trap keyboard focus");
assert.match(source, /libraryDialog\.hidden = false/);
assert.match(source, /libraryDialog\.hidden = true/);
assert.match(source, /globalThis\.confirm/, "destructive actions require explicit confirmation");

console.log("replay library: capped vault, compatibility, safe labels, deletion and dialog contracts OK");
