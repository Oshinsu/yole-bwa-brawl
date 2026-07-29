import assert from 'node:assert/strict';
import {
  ReplayRecorder,
  ReplayPlayer,
  ReplayVault,
  checksumBoats,
  replayFilename,
  SIMULATION_VERSION,
  isReplayCompatible
} from '../src/sim/replay.js';

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}

const seed = 0x0b0a2026;
const recorder = new ReplayRecorder(seed, 60);
const expected = new Map();
let steer = 0;
let trim = 0.82;
let aim = 0;
let aimActive = false;
for (let tick = 0; tick < 720; tick++) {
  if (tick % 90 === 0) steer = Math.round(Math.sin(tick * 0.019) * 700) / 1000;
  if (tick === 210) trim = 0.68;
  if (tick === 420) trim = 0.91;
  if (tick === 150) { aim = -0.375; aimActive = true; }
  if (tick === 165) aim = 0.625;
  if (tick === 180) aimActive = false;
  const actions = (tick === 120 ? 1 : 0) | (tick === 360 ? 8 : 0) | (tick === 610 ? 4 : 0);
  recorder.recordInput(tick, { steer, trim, aim, aimActive, actions });
  expected.set(tick, { steer, trim, aim, aimActive, actions });
}

const fakeBoats = [{
  x: 4.25, y: 0.31, z: 132.7,
  vx: 1.2, vy: -0.03, vz: 13.8,
  heading: 0.2, roll: -0.11, pitch: 0.04,
  waterMassKg: 24, activeCrew: 5, eliminated: false,
  structure: { hull: 0.88, mast: 0.93, sail: 0.79 }
}];
recorder.checkpoint(600, fakeBoats);
recorder.recordEvent(610, 'MINE_DROPPED', { boatId: 0 });
recorder.markRound(0, 1, seed);
recorder.finish(fakeBoats, { tick: 719, champion: 'BWA FATAL' });
const replay = recorder.export();

assert.equal(replay.schemaVersion, 2);
assert.equal(replay.simulationVersion, SIMULATION_VERSION);
assert.equal(isReplayCompatible(replay), true);
assert.equal(isReplayCompatible({ ...replay, simulationVersion: '3.5.0' }), false);
assert.equal(replay.seed, seed >>> 0);
assert.equal(replay.fixedHz, 60);
assert.equal(replay.finalTick, 719);
assert.equal(replay.finalChecksum, checksumBoats(fakeBoats));
assert.ok(replay.inputs.length < 40, `input stream was not compressed: ${replay.inputs.length}`);
assert.equal(replay.checkpoints.length, 1);
assert.equal(replay.events[0].type, 'MINE_DROPPED');

const player = new ReplayPlayer(replay);
let currentSteer = 0;
let currentTrim = 0.82;
let currentAim = 0;
let currentAimActive = false;
let emittedActions = 0;
for (let tick = 0; tick < 720; tick++) {
  const frame = player.inputAt(tick, {});
  const expectedFrame = expected.get(tick);
  currentSteer = expectedFrame.steer;
  currentTrim = expectedFrame.trim;
  currentAim = expectedFrame.aim;
  currentAimActive = expectedFrame.aimActive;
  assert.equal(frame.steer, currentSteer, `steer mismatch at tick ${tick}`);
  assert.equal(frame.trim, currentTrim, `trim mismatch at tick ${tick}`);
  assert.equal(frame.aim, currentAim, `aim mismatch at tick ${tick}`);
  assert.equal(frame.aimActive, currentAimActive, `aimActive mismatch at tick ${tick}`);
  assert.equal(frame.actions, expectedFrame.actions, `actions mismatch at tick ${tick}`);
  emittedActions |= frame.actions;
}
assert.equal(emittedActions, 1 | 8 | 4);
assert.equal(player.complete, true);
player.reset();
assert.equal(player.inputAt(0, {}).steer, expected.get(0).steer);

const legacyPlayer = new ReplayPlayer({ inputs: [{ tick: 0, steer: 0.2, trim: 0.8, actions: 0 }] });
assert.deepEqual(
  legacyPlayer.inputAt(0, {}),
  { steer: 0.2, trim: 0.8, aim: 0, aimActive: false, actions: 0 },
  "legacy replay frames must default aim to neutral"
);

const storage = new MemoryStorage();
const vault = new ReplayVault(storage, 2);
const first = vault.save(replay, { champion: 'BWA FATAL' });
assert.ok(first?.id);
assert.equal(vault.latest().replay.finalChecksum, replay.finalChecksum);
assert.equal(vault.load(first.id).summary.champion, 'BWA FATAL');

vault.save({ ...replay, seed: 2 }, { champion: 'CARACOLI' });
vault.save({ ...replay, seed: 3 }, { champion: 'CHANFLOR X' });
assert.equal(vault.list().length, 2, 'vault limit was not enforced');
assert.equal(vault.latest().replay.seed, 3);
assert.match(replayFilename(replay), /^yole-bwa-brawl-[0-9a-f]{8}-[0-9a-f]{8}\.json$/);
vault.clear();
assert.deepEqual(vault.list(), []);

console.log(JSON.stringify({
  ok: true,
  compressedFrames: replay.inputs.length,
  sourceTicks: 720,
  compressionRatio: Math.round((replay.inputs.length / 720) * 10000) / 100,
  finalChecksum: replay.finalChecksum,
  checkpointCount: replay.checkpoints.length,
  vaultLimit: 2
}, null, 2));
