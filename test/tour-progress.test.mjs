import assert from "node:assert/strict";
import {
  TOUR_PROGRESS_KEY,
  TourProgressStore,
  normalizeTourProgress,
  rankTourBoats
} from "../src/game/tour-progress.js";
import {
  MatchDirector,
  resolveTourStageClassification
} from "../src/game/match.js";

class MemoryStorage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
}

class ThrowingStorage {
  getItem() { return null; }
  setItem() { throw new Error("quota or private mode"); }
  removeItem() { throw new Error("storage unavailable"); }
}

const progress = {
  status: "active",
  stage: 2,
  baseSeed: 1234,
  points: [7, 5, 4, 1],
  results: [{
    stage: 0,
    places: [0, 1, 2, 3],
    points: [4, 3, 2, 1],
    finishTicks: [1200, 1300, 1450, 1600]
  }],
  cumulativeStats: { takedowns: 3, perfects: 5, maxSpeed: 31.2 }
};

const unavailableStore = new TourProgressStore(null);
assert.equal(unavailableStore.save(progress), null, "an absent storage cannot report a saved Tour");
assert.equal(unavailableStore.clear(), false, "an absent storage cannot report a successful clear");

const throwingStore = new TourProgressStore(new ThrowingStorage());
assert.equal(throwingStore.save(progress), null, "a failed setItem cannot report a saved Tour");
assert.equal(throwingStore.clear(), false, "a failed removeItem cannot report a successful clear");

const storage = new MemoryStorage();
const store = new TourProgressStore(storage);
const saved = store.save(progress);

assert.equal(saved.stage, 2);
assert.equal(store.hasActive(), true);
assert.deepEqual(store.load().points, [7, 5, 4, 1]);
assert.equal(store.load().cumulativeStats.maxSpeed, 31.2);
assert.ok(storage.getItem(TOUR_PROGRESS_KEY));

assert.equal(normalizeTourProgress({ schema: 99 }), null);
assert.equal(normalizeTourProgress({ schema: 1, stage: "bad", points: [4] }).stage, 0);

const ranking = rankTourBoats(
  [8, 8, 8, 5],
  [
    { places: [1, 0, 2, 3], finishTicks: [1100, 1000, 1300, 1500] },
    { places: [0, 2, 1, 3], finishTicks: [1000, 1300, 1150, 1500] }
  ]
);
assert.deepEqual(ranking.map((entry) => entry.id), [0, 1, 2, 3], "wins puis podiums départagent les égalités");

const boats = [
  { id: 0, z: 500, tourFinished: true, finishTick: 1000, eliminated: false },
  { id: 1, z: 490, tourFinished: false, finishTick: 0, eliminated: false },
  { id: 2, z: 480, tourFinished: false, finishTick: 0, eliminated: false },
  { id: 3, z: 470, tourFinished: false, finishTick: 0, eliminated: false }
];
let endCalls = 0;
let skippedClassification = null;
const skipContext = {
  tour: { finishOrder: [boats[0]] },
  mode: "playing",
  boats,
  roundEnding: 0,
  endTourStage() {
    endCalls++;
    skippedClassification = resolveTourStageClassification(this.boats, this.tour.finishOrder);
  }
};
assert.equal(
  MatchDirector.skipTourSpectating.call(skipContext),
  false,
  "spectator skip must not turn rivals still racing into artificial DNFs"
);
assert.equal(endCalls, 0);

boats[1].tourFinished = true;
boats[1].finishTick = 1100;
boats[2].tourFinished = true;
boats[2].finishTick = 1200;
boats[3].tourFinished = true;
boats[3].finishTick = 1300;
skipContext.tour.finishOrder.push(boats[1], boats[2], boats[3]);
const waitedClassification = resolveTourStageClassification(boats, skipContext.tour.finishOrder);
skipContext.roundEnding = 2.2;
assert.equal(MatchDirector.skipTourSpectating.call(skipContext), true);
assert.equal(endCalls, 1);
assert.deepEqual(
  skippedClassification.awarded,
  waitedClassification.awarded,
  "skipping only the decided delay must award exactly the same points as waiting"
);
assert.deepEqual(skippedClassification.awarded, [4, 3, 2, 1]);

const persistenceContext = {
  tour: progress,
  _tourProgressStore: {
    save: () => null,
    clear: () => false
  },
  tourStore: MatchDirector.tourStore
};
assert.equal(MatchDirector.saveTourProgress.call(persistenceContext), null);
assert.equal(persistenceContext.tourPersistenceAvailable, false);
assert.equal(MatchDirector.clearTourProgress.call(persistenceContext), false);
assert.equal(persistenceContext.tourPersistenceAvailable, false);
persistenceContext._tourProgressStore = {
  save: (value) => value,
  clear: () => true
};
assert.ok(MatchDirector.saveTourProgress.call(persistenceContext));
assert.equal(persistenceContext.tourPersistenceAvailable, true);
assert.equal(MatchDirector.clearTourProgress.call(persistenceContext), true);
assert.equal(persistenceContext.tourPersistenceAvailable, true);

assert.equal(store.clear(), true, "memory storage clear succeeds");
assert.equal(store.load(), null);

console.log("tour progress tests: OK");
