import assert from "node:assert/strict";
import { Boat } from "../src/game/boat.js";
import { InputSystems } from "../src/game/input.js";
import { MatchDirector } from "../src/game/match.js";
import {
  VersusSystems,
  createVersusInput,
  quantizeVersusInput,
  versusCameraFrame,
  versusPilotLabel
} from "../src/game/versus.js";
import {
  ACTION_WAVE,
  ACTION_BOOST_FORWARD,
  ACTION_BOOST_LATERAL,
  ACTION_SHIFT
} from "../src/game/balance.js";

const classList = () => ({
  values: new Set(),
  add(name) { this.values.add(name); },
  remove(name) { this.values.delete(name); },
  toggle(name, force) {
    if (force === undefined ? !this.values.has(name) : force) this.values.add(name);
    else this.values.delete(name);
  },
  contains(name) { return this.values.has(name); }
});

{
  const input = createVersusInput();
  input.steer = 1.23456;
  input.trim = 0.67891;
  input.actions = -1;
  input.cycleQueued = 4;
  quantizeVersusInput(input);
  assert.equal(input.steer, 1, "J2 steer is clamped and quantized");
  assert.equal(input.trim, 0.679, "J2 trim uses the same 1/1000 precision as solo");
  assert.equal(input.actions, 0xffffffff, "J2 actions keep an unsigned fixed-tick mask");
  assert.equal(input.cycleQueued, 1, "multiple DOM repeats collapse to one cycle per tick");
}

{
  const p1 = { id: 0, x: -8, y: 1, z: 20, dynamics: { heading: 0 } };
  const p2 = { id: 1, x: 12, y: 3, z: 50, dynamics: { heading: 0 } };
  const frame = versusCameraFrame(p1, p2);
  assert.deepEqual(
    { x: frame.x, y: frame.y, z: frame.z },
    { x: 2, y: 2, z: 35 },
    "shared camera targets the exact midpoint"
  );
  assert.ok(Math.abs(frame.separation - Math.hypot(20, 30)) < 1e-12);
  assert.equal(frame.heading, 0);
  assert.equal(versusPilotLabel(p1), "J1");
  assert.equal(versusPilotLabel(p2), "J2");
  assert.match(versusPilotLabel({ id: 2, name: "KALBASS" }), /^IA/);
}

{
  const menuClasses = classList();
  const lobbyClasses = classList();
  lobbyClasses.add("hidden");
  let startOptions = null;
  const game = {
    mode: "menu",
    ui: {
      menu: { classList: menuClasses },
      versusScreen: { classList: lobbyClasses }
    },
    startMatch(options) { startOptions = options; }
  };
  Object.assign(game, VersusSystems);
  assert.equal(game.openVersusLobby(), true);
  assert.equal(lobbyClasses.contains("hidden"), false, "versus button opens its lobby");
  game.closeVersusLobby();
  assert.equal(lobbyClasses.contains("hidden"), true);
  assert.equal(menuClasses.contains("hidden"), false, "closing the lobby returns to menu");
  game.startVersusMatch();
  assert.deepEqual(startOptions, { versus: true }, "lobby launch requests the versus match contract");
}

{
  // A local-controlled boat must consume the supplied fixed input and never
  // invoke UtilityBrain, even though isPlayer deliberately remains false.
  const stepped = [];
  let aiCalls = 0;
  const boat = Object.create(Boat.prototype);
  boat.dynamics = {
    eliminated: false,
    spray: 0,
    fixedStep(dt, input) { stepped.push({ dt, ...input }); },
    consumeEvents(out) { out.mask = 0; return out; }
  };
  Object.assign(boat, {
    isPlayer: false,
    localControlled: true,
    cooldowns: { rhum: 0, wave: 0, harpoon: 0, mine: 0 },
    eventScratch: {},
    updateAI() { aiCalls++; },
    lastWakeAt: 0,
    lastSprayAt: 0,
    game: { time: 0, onBoatDynamicsEvent() {} }
  });
  boat.fixedUpdate(1 / 60, { steer: -0.625, trim: 0.82 }, {});
  assert.equal(aiCalls, 0, "boat[1] cannot run AI during local versus");
  assert.deepEqual(stepped[0], { dt: 1 / 60, steer: -0.625, trim: 0.82 });
}

{
  let waveCalls = 0;
  let forwardCalls = 0;
  let dashCalls = 0;
  let shiftCalls = 0;
  const p2 = {
    id: 1,
    eliminated: false,
    roll: 0,
    x: 0,
    y: 0,
    z: 0,
    dynamics: { crewTarget: 0, structure: { hull: 1 } },
    ammo: { wave: 1, harpoon: 0, mine: 0, rhum: 0, barik: 0, chadron: 0, lanbi: 0, pwason: 0 },
    cooldowns: { wave: 0 },
    activeWeapon: "wave",
    triggerShift() {
      shiftCalls++;
      return { critical: false, precision: 0, cut: 0 };
    }
  };
  const game = {
    mode: "playing",
    paused: false,
    playback: null,
    versusLocal: true,
    input: { left: false, right: false, actions: 0 },
    input2: createVersusInput(),
    boats: [{ id: 0, eliminated: false }, p2],
    ui: {},
    waveField: { sample: () => ({ height: 0 }) },
    waterScratch: {},
    time: 1,
    telemetry: { track() {} },
    fireWave() { waveCalls++; },
    fireHarpoon() {},
    dropMine() {},
    triggerForwardBoost() { forwardCalls++; },
    triggerLateralBoost() { dashCalls++; },
    drinkRhum() {},
    dropBarik() {},
    sowChadron() {},
    blowLanbi() {},
    firePwason() {}
  };
  Object.assign(game, InputSystems, VersusSystems);
  game.triggerForwardBoost = () => { forwardCalls++; };
  game.triggerLateralBoost = () => { dashCalls++; };
  const key = (down, code, repeat = false) => game.handleKeyboardInput(down, {
    code,
    repeat,
    target: null,
    preventDefault() {}
  });

  key(true, "KeyJ");
  assert.equal(game.input2.left, true);
  key(true, "KeyI");
  key(true, "KeyU");
  key(true, "KeyM");
  key(true, "KeyK");
  assert.equal(waveCalls, 0, "keyboard events only queue J2 weapon actions");
  assert.ok(game.input2.actions & ACTION_WAVE);
  assert.ok(game.input2.actions & ACTION_BOOST_FORWARD);
  assert.ok(game.input2.actions & ACTION_BOOST_LATERAL);
  assert.ok(game.input2.actions & ACTION_SHIFT);
  game.applyVersusActionMask(game.input2.actions);
  assert.deepEqual(
    { waveCalls, forwardCalls, dashCalls, shiftCalls },
    { waveCalls: 1, forwardCalls: 1, dashCalls: 1, shiftCalls: 1 },
    "all J2 actions execute from the fixed-tick mask"
  );
  key(false, "KeyJ");
  assert.equal(game.input2.left, false);
}

{
  const p1 = { id: 0, name: "J1", isPlayer: true, score: 3, stats: { takedowns: 2 } };
  const p2 = { id: 1, name: "J2", isPlayer: false, score: 5, stats: { takedowns: 4 } };
  const ai1 = { id: 2, name: "KALBASS", isPlayer: false, score: 1, stats: { takedowns: 0 } };
  const ai2 = { id: 3, name: "TI-MOUN", isPlayer: false, score: 2, stats: { takedowns: 1 } };
  let replayFinished = false;
  const ui = {
    hud: { classList: classList() },
    versusHud: { classList: classList() },
    end: { classList: classList() },
    endIcon: {},
    endTitle: {},
    endCopy: {},
    statTakedowns: {},
    statPerfects: {},
    statSpeed: {},
    rematch: {},
    replay: {},
    downloadReplay: {},
    replayStatus: {}
  };
  const game = {
    mode: "playing",
    versusLocal: true,
    time: 12,
    tick: 720,
    boats: [p1, p2, ai1, ai2],
    stats: { takedowns: 2, perfects: 1, maxSpeed: 42 },
    telemetry: { track() {} },
    playback: null,
    latestReplay: { inputs: [{ tick: 1 }] },
    replay: { finish() { replayFinished = true; } },
    replayVault: { save() {} },
    ui,
    audio: { play() {} }
  };
  Object.assign(game, MatchDirector);
  game.endMatch(p2);
  assert.equal(game.mode, "ended");
  assert.match(ui.endTitle.textContent, /J2 REMPORTE/);
  assert.match(ui.endCopy.textContent, /J1 3 · J2 5/);
  assert.equal(replayFinished, false, "versus must never finish or overwrite a solo replay");
  assert.equal(ui.replay.disabled, true);
  assert.equal(ui.downloadReplay.disabled, true);
  assert.match(ui.replayStatus.textContent, /Replay désactivé/);
  assert.match(ui.rematch.textContent, /REVANCHE MÊLÉE LOCALE/);
}

console.log("versus-mode contracts: deterministic J2 input, no AI, shared camera and replay isolation OK");
