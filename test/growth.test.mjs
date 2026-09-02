import assert from "node:assert/strict";
import {
  buildChallengeUrl,
  challengeCopy,
  dailyChallengeId,
  dailyChallengeSeed,
  deliverChallenge,
  encodeSeed,
  GrowthSystems,
  readChallenge,
  seedFromUrl
} from "../src/game/growth.js";

assert.equal(seedFromUrl("0x00ABCDEF"), 0x00abcdef);
assert.equal(seedFromUrl("n:10"), 36);
assert.equal(seedFromUrl(""), 0x0b0a2026);
assert.equal(encodeSeed(0xabc), "0x00000abc");

const url = buildChallengeUrl({
  href: "https://example.com/yole/?debug=1#hud",
  seed: 0x1234abcd,
  mode: "tour",
  stage: 4,
  daily: "2026-07-30"
});
assert.equal(
  url,
  "https://example.com/yole/?challenge=1&mode=tour&seed=0x1234abcd&stage=4&daily=2026-07-30"
);
assert.deepEqual(readChallenge(new URL(url).search), {
  active: true,
  version: 1,
  mode: "tour",
  stage: 4,
  seed: 0x1234abcd,
  daily: "2026-07-30",
  arena: ""
});
assert.equal(readChallenge("?seed=0x1234abcd"), null);

assert.equal(dailyChallengeId(new Date("2026-07-30T23:59:59Z")), "2026-07-30");
assert.equal(
  dailyChallengeSeed(new Date("2026-07-30T01:00:00Z")),
  dailyChallengeSeed(new Date("2026-07-30T23:00:00Z"))
);

const copy = challengeCopy({
  url,
  mode: "tour",
  stage: 4,
  won: true,
  score: 3,
  daily: "2026-07-30"
});
assert.match(copy.text, /Défi du jour 2026-07-30/);
assert.match(copy.text, /3 takedown/);

let shared = null;
assert.equal(await deliverChallenge(copy, {
  navigatorObject: { share: async (payload) => { shared = payload; } },
  clipboard: null
}), "shared");
assert.equal(shared.url, url);

let copied = "";
assert.equal(await deliverChallenge(copy, {
  navigatorObject: {},
  clipboard: { writeText: async (value) => { copied = value; } }
}), "copied");
assert.match(copied, /https:\/\/example\.com\/yole\//);

const localStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
try {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new DOMException("opaque origin", "SecurityError");
    }
  });
  const opaqueOriginGame = Object.assign({ ui: {}, stats: {}, telemetry: null }, GrowthSystems);
  assert.doesNotThrow(() => GrowthSystems.initGrowth.call(opaqueOriginGame, new URLSearchParams()));
  assert.doesNotThrow(() => GrowthSystems.noteRunCompleted.call(opaqueOriginGame));
  assert.equal(opaqueOriginGame.hasCompletedRun, true);
} finally {
  if (localStorageDescriptor) {
    Object.defineProperty(globalThis, "localStorage", localStorageDescriptor);
  } else {
    delete globalThis.localStorage;
  }
}

console.log("growth challenge tests passed");
