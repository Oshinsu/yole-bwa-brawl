import assert from 'node:assert/strict';

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...items) { items.forEach((item) => this.values.add(item)); }
  remove(...items) { items.forEach((item) => this.values.delete(item)); }
  toggle(item, force) {
    if (force === undefined) force = !this.values.has(item);
    if (force) this.values.add(item); else this.values.delete(item);
    return force;
  }
  contains(item) { return this.values.has(item); }
}

class FakeGradient { addColorStop() {} }
class FakeContext2D {
  constructor() { this.fillStyle = '#000'; this.strokeStyle = '#fff'; this.globalCompositeOperation = 'source-over'; this.lineWidth = 1; }
  fillRect() {} save() {} restore() {} translate() {} rotate() {} scale() {}
  beginPath() {} ellipse() {} fill() {} arc() {} stroke() {}
  createRadialGradient() { return new FakeGradient(); }
}
class FakeCanvas {
  constructor(width = 256, height = 256) {
    this.width = width;
    this.height = height;
    this.style = {};
    this.listeners = new Map();
  }
  getContext(kind) { return kind === '2d' ? new FakeContext2D() : {}; }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  dispatchEvent(event) {
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
  }
}
class FakeElement {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.classList = new FakeClassList();
    this.style = {};
    this.children = [];
    this.textContent = '';
    this.innerHTML = '';
    this.onclick = null;
    this.className = '';
  }
  appendChild(child) { this.children.push(child); return child; }
  prepend(child) { this.children.unshift(child); return child; }
  remove() { this.removed = true; }
  addEventListener() {}
  setPointerCapture() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 140, height: 140 }; }
}

const document = {
  createElement(tag) { return tag === 'canvas' ? new FakeCanvas() : new FakeElement(tag); }
};
globalThis.document = document;
globalThis.window = globalThis;
globalThis.OffscreenCanvas = FakeCanvas;
Object.defineProperty(globalThis, 'navigator', { value: { vibrate() {} }, configurable: true });
globalThis.location = { search: '?seed=smoke-v2', reload() {} };
globalThis.innerWidth = 1280;
globalThis.innerHeight = 720;
globalThis.devicePixelRatio = 1;
globalThis.addEventListener = () => {};
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
globalThis.setInterval = () => 0;
globalThis.clearInterval = () => {};
globalThis.setTimeout = (fn) => { fn?.(); return 0; };
globalThis.performance = { now: () => 0 };

const THREE = await import('./mock-three.module.js');
const { Game } = await import('../src/game/game.js');

const uiKeys = [
  'viewport','loading','fatal','fatalText','play','rematch','retry','pauseBtn','resume','restart','sound','quality',
  'weaponSlot','weaponSlotIco','weaponSlotName','weaponSlotCd','bwa','weaponHold2','weaponCrate','zoomIn','zoomOut','zoomValue','joystick','joyKnob','menu','hud','end',
  'pause','rotate','message','damage','stormVignette','killfeed','damageNumbers','countdown','spectateur','leaderboard','roundLabel',
  'timer','speed','balanceBar','balanceText','flowBar','flowText','crewDots','trimText','waterText',
  'storm','stormDistance','reticle','perf','endIcon',
  'endTitle','endCopy','statTakedowns','statPerfects','statSpeed','replay','downloadReplay','replayStatus','weatherChip','hullBar','hullText','mastBar','sailBar','bwaIntegrityBar'
];
const ui = Object.fromEntries(uiKeys.map((key) => [key, new FakeElement()]));
ui.viewport = new FakeElement('main');
ui.fatal.classList.add('hidden');

const game = new Game(THREE, ui);
game.audio.muted = true;
game.audio.ensure = () => {};

let contextLossPrevented = false;
game.renderer.domElement.dispatchEvent({
  type: 'webglcontextlost',
  preventDefault() { contextLossPrevented = true; }
});
assert.equal(contextLossPrevented, true, 'WebGL context loss must be made restorable');
assert.equal(game.webglContextLost, true);
assert.equal(game.paused, true);
assert.equal(game.renderer.loop, null);
assert.equal(ui.fatal.classList.contains('hidden'), false);
game.renderer.domElement.dispatchEvent({ type: 'webglcontextrestored' });
assert.equal(game.webglContextLost, false);
assert.equal(game.paused, false);
assert.equal(typeof game.renderer.loop, 'function');
assert.equal(ui.fatal.classList.contains('hidden'), true);

Object.assign(game.input, {
  aimPitch: 0.91,
  trimUp: true,
  trimDown: true,
  lookBack: true
});
game.playbackInput.aimPitch = -0.77;
game.gamepadSteer = 0.65;
game.gamepadTrim = 0.2;
game.hadLocalSteer = true;
game.hadGamepadTrim = true;
game.startMatch();
assert.equal(game.input.aimPitch, 0);
assert.equal(game.input.trimUp, false);
assert.equal(game.input.trimDown, false);
assert.equal(game.input.lookBack, false);
assert.equal(game.playbackInput.aimPitch, 0);
assert.equal(game.gamepadSteer, null);
assert.equal(game.gamepadTrim, null);
assert.equal(game.hadLocalSteer, false);
assert.equal(game.hadGamepadTrim, false);
// ⚠️ ON SAUTE LE 3 · 2 · 1 · GO. Depuis qu'il existe, `fixedUpdate` GÈLE tout
// tant que `countdown > 0` : les yoles ne bougent pas, rien ne se simule. Un
// test qui enchaîne startMatch() puis fixedUpdate() ne mesurerait donc que du
// vide. On force le rebours à zéro pour reprendre au premier tick réel.
game.countdown = 0;

let maxRoll = 0;
let maxSpeed = 0;
let roundsSeen = new Set();
for (let tick = 0; tick < 30000; tick++) {
  game.input.steer = Math.sin(tick * 0.007) * 0.64;
  if (tick % 410 === 0) game.requestAction(1);
  if (tick % 690 === 0) game.requestAction(2);
  if (tick % 970 === 0) game.requestAction(4);
  if (tick % 260 === 0) game.requestAction(8);
  if (tick % 540 === 0) game.requestAction(32);
  if (tick % 830 === 0) game.triggerLateralBoost(game.boats[0], Math.sin(tick) >= 0 ? 1 : -1);
  game.fixedUpdate(1 / 60);
  roundsSeen.add(game.round);

  const state = game.debugState();
  for (const boat of state.boats) {
    for (const key of ['x', 'y', 'z', 'speed', 'roll', 'pitch', 'water']) {
      assert.ok(Number.isFinite(boat[key]), `${key} non-finite at tick ${tick}`);
    }
    maxRoll = Math.max(maxRoll, Math.abs(boat.roll));
    maxSpeed = Math.max(maxSpeed, boat.speed);
  }
  if (game.mode === 'ended') { game.startMatch(); game.countdown = 0; }
}

// Checksum de scenario mesure sur la simulation pure. Le hitstop ne retire que
// du temps reel dans frame() : il ne doit jamais deplacer cette valeur.
const scenarioChecksum = game.debugState().checksum;

let renderFrames = 0;
let now = 0;
for (let frame = 0; frame < 240; frame++) {
  now += 1000 / 60;
  game.frame(now);
  renderFrames++;
}
assert.ok(game.ocean.wake.texture.needsUpdate, 'wake canvas was never uploaded');
assert.equal(game.ocean.rings.length, 4, 'ocean clipmap ring count changed');
assert.ok(game.particles.geometry.drawRange.count >= 0, 'particle pool failed');

const final = game.debugState();
assert.equal(final.boats.length, 4);
assert.ok(final.checksum, 'missing deterministic checksum');
assert.ok(roundsSeen.size >= 2, 'round director never advanced');
assert.ok(maxSpeed < 35, `unbounded speed ${maxSpeed}`);
console.log(JSON.stringify({
  ok: true,
  ticks: 30000,
  scenarioChecksum,
  renderFrames,
  roundsSeen: [...roundsSeen].slice(0, 12),
  maxRoll,
  maxSpeed,
  final
}, null, 2));

// End-to-end game replay: gameplay weather advances on the fixed clock, inputs are
// quantized before simulation, and the same seed must reproduce the final checksum.
game.startMatch();
// ⚠️ Meme saut de rebours que partout ailleurs : c'est la manche qui sert a
// ENREGISTRER le replay, elle doit partir du meme etat que la relecture.
game.countdown = 0;
const liveReplayChecksums = [];
for (let tick = 1; tick <= 1800 && game.mode === 'playing'; tick++) {
  game.input.steer = Math.sin(tick * 0.0123) * 0.71;
  game.input.trim = 0.78 + Math.sin(tick * 0.0031) * 0.08;
  game.input.aim = Math.sin(tick * 0.0171) * 0.84;
  game.input.aimPitch = Math.cos(tick * 0.0137) * 0.72;
  game.input.aimActive = tick % 240 < 126;
  if (tick % 377 === 0) game.requestAction(1);
  if (tick % 613 === 0) game.requestAction(2);
  if (tick % 941 === 0) game.requestAction(4);
  if (tick % 251 === 0) game.requestAction(8);
  if (tick % 457 === 0) game.requestAction(32);
  if (tick % 701 === 0) game.requestAction(64);
  game.fixedUpdate(1 / 60);
  const liveState = game.debugState();
  liveReplayChecksums.push(liveState.checksum);
}
if (game.mode === 'playing') game.endMatch(game.boats[0]);
const capturedReplay = structuredClone(game.latestReplay);
assert.ok(capturedReplay?.finalTick > 0, 'game replay was not captured');
assert.ok(capturedReplay.inputs.length > 0, 'game replay contains no inputs');
assert.ok(capturedReplay.inputs.some((frame) => Math.abs(frame.aim) > 0.2), 'game replay contains no non-neutral aim');
assert.ok(capturedReplay.inputs.some((frame) => Math.abs(frame.aimPitch) > 0.2), 'game replay contains no vertical aim');
assert.ok(capturedReplay.inputs.some((frame) => frame.aimActive), 'game replay contains no active aiming interval');
const expectedReplayChecksum = capturedReplay.finalChecksum;
game.startReplay(capturedReplay);
// ⚠️ MÊME TRAITEMENT QUE LE RUN DIRECT. Celui-ci a sauté le 3 · 2 · 1 ; si la
// relecture le joue, elle gèle `fixedUpdate` pendant que le run direct
// avançait, et les checksums divergent des le premier tick compare. Le rebours
// n'entre pas dans le replay — il n'avance pas `tick` et ne touche a aucun
// etat de simulation — mais les deux cotes doivent le traiter pareil.
game.countdown = 0;
const replayCheckpoints = new Map(capturedReplay.checkpoints.map((entry) => [entry.tick, entry.checksum]));
for (let tick = 0; tick < capturedReplay.finalTick && game.mode === 'playing'; tick++) {
  game.fixedUpdate(1 / 60);
  const replayState = game.debugState();
  assert.equal(
    replayState.checksum,
    liveReplayChecksums[tick],
    `game replay first diverged at tick ${game.tick}`
  );
  const expectedCheckpoint = replayCheckpoints.get(game.tick);
  if (expectedCheckpoint) {
    const actualCheckpoint = game.debugState().checksum;
    assert.equal(actualCheckpoint, expectedCheckpoint, `game replay diverged at checkpoint ${game.tick}: ${actualCheckpoint} !== ${expectedCheckpoint}`);
  }
}
const replayedGameChecksum = game.debugState().checksum;
assert.equal(replayedGameChecksum, expectedReplayChecksum, `game replay diverged: ${replayedGameChecksum} !== ${expectedReplayChecksum}`);
assert.equal(game.mode, "ended", "validated Combat replay must stop on its result screen");
game.ui.rematch.onclick();
assert.equal(game.mode, "playing");
assert.equal(game.playback?.replay, capturedReplay, "Replay result CTA must replay the same Combat payload");

console.log(JSON.stringify({
  replayOk: true,
  replayTicks: capturedReplay.finalTick,
  replayFrames: capturedReplay.inputs.length,
  replayChecksum: replayedGameChecksum
}, null, 2));

// Tour des Yoles : les 8 étapes s'enchaînent, chaque place distribue 4/3/2/1 points
// (0 pour les non-finisseurs) et le classement général sacre le meilleur total.
game.startTour();
let tourGuard = 0;
let capturedTourStageReplay = null;
const firstTourStageChecksums = [];
while (!game.tour.champion && tourGuard < 300000) {
  game.input.steer = Math.sin(tourGuard * 0.011) * 0.55;
  if (tourGuard % 457 === 0) game.requestAction(32);
  game.fixedUpdate(1 / 60);
  if (game.tour?.stage === 0 && game.tick > 0) {
    firstTourStageChecksums[game.tick - 1] = game.debugState().checksum;
  }
  if (game.mode === 'ended' && !game.tour.champion) {
    capturedTourStageReplay ??= structuredClone(game.latestReplay);
    const nextStage = game.tour.stage + 1;
    assert.ok(nextStage < 8, 'tour ended without champion before stage 8');
    game.startTourStage(nextStage);
  }
  tourGuard++;
}
assert.ok(game.tour.champion, 'tour produced no champion');
assert.equal(game.tour.results.length, 8, 'tour should record 8 stage results');
for (const result of game.tour.results) {
  assert.equal(new Set(result.places).size, 4, 'each stage must rank the 4 yoles exactly once');
}
assert.equal(
  game.tour.champion.score,
  Math.max(...game.tour.points),
  'tour champion is not the best cumulative score'
);
console.log(JSON.stringify({
  tourOk: true,
  tourTicks: tourGuard,
  tourPoints: game.tour.points,
  tourChampion: game.tour.champion.name
}, null, 2));

assert.ok(capturedTourStageReplay, "the first Tour stage must expose a replay");
assert.equal(capturedTourStageReplay.metadata?.tourStage, 0);
assert.ok(Array.isArray(capturedTourStageReplay.metadata?.tourPoints));
assert.equal(game.startReplay(capturedTourStageReplay), true);
assert.equal(game.tour?.stage, 0, "Tour replay must restore its stage context");
game.countdown = 0;
for (let tick = 0; tick < capturedTourStageReplay.finalTick && game.mode === "playing"; tick++) {
  game.fixedUpdate(1 / 60);
  assert.equal(
    game.debugState().checksum,
    firstTourStageChecksums[tick],
    `Tour replay first diverged at tick ${game.tick}`
  );
}
assert.equal(
  game.debugState().checksum,
  capturedTourStageReplay.finalChecksum,
  "Tour replay must restore the same coast, rules and final checksum"
);
assert.equal(game.replayValidation?.complete, true, "Tour replay final checksum must be validated");
assert.equal(game.mode, "ended", "a validated Tour replay must stop on a readable result screen");
game.ui.rematch.onclick();
assert.equal(game.mode, "playing");
assert.equal(game.tour?.stage, 0);
assert.equal(game.playback?.replay, capturedTourStageReplay, "Tour replay CTA must replay the same stage payload");
console.log(JSON.stringify({
  tourReplayOk: true,
  stage: capturedTourStageReplay.metadata.tourStage + 1,
  ticks: capturedTourStageReplay.finalTick,
  checksum: capturedTourStageReplay.finalChecksum
}, null, 2));
