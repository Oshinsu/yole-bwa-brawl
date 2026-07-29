import assert from "node:assert/strict";
import { AIM_MAX_RADIANS, InputSystems } from "../src/game/input.js";
import { ACTION_WAVE } from "../src/game/balance.js";

function makeContext() {
  const context = {
    mode: "playing",
    paused: true,
    playback: null,
    isApplyingReplay: false,
    input: {
      left: true,
      right: true,
      actions: ACTION_WAVE,
      steer: 0.75,
      trim: 0.6,
      joy: true,
      joyId: 7,
      aim: 0.65,
      aimActive: true,
      aimPointerId: 19
    },
    gamepadPrev: [],
    gamepadSteer: 0.5,
    gamepadTrim: 0.7,
    hadLocalSteer: true,
    hadGamepadTrim: true,
    boats: [{
      eliminated: false,
      roll: 0,
      dynamics: { heading: 0.25 },
      ammo: { wave: 1, harpoon: 1, mine: 0, rhum: 2 },
      activeWeapon: "wave"
    }],
    ui: {
      pause: { classList: { toggle() {} } },
      joyKnob: { style: { transform: "translate(10px, 4px)" } }
    },
    startMatch() {}
  };
  Object.assign(context, InputSystems);
  return context;
}

{
  const game = makeContext();
  assert.equal(game.playerInputLocked(), true, "pause must lock player actions");
  game.clearLiveInput();
  assert.deepEqual(
    {
      left: game.input.left,
      right: game.input.right,
      actions: game.input.actions,
      steer: game.input.steer,
      trim: game.input.trim,
      joy: game.input.joy,
      joyId: game.input.joyId,
      aim: game.input.aim,
      aimActive: game.input.aimActive,
      aimPointerId: game.input.aimPointerId
    },
    {
      left: false,
      right: false,
      actions: 0,
      steer: 0,
      trim: 0.82,
      joy: false,
      joyId: null,
      aim: 0,
      aimActive: false,
      aimPointerId: null
    }
  );
  assert.equal(game.ui.joyKnob.style.transform, "");
}

{
  const game = makeContext();
  game.paused = false;
  game.input.aimActive = false;
  game.input.aimPointerId = null;
  let fireCalls = 0;
  game.useActiveWeapon = () => { fireCalls++; };
  const pointer = {
    pointerType: "mouse",
    button: 2,
    pointerId: 41,
    clientX: 200,
    preventDefault() {}
  };
  assert.equal(game.beginAimPointer(pointer, false, 400), true, "right mouse must start aim");
  assert.equal(game.input.aim, 0);
  assert.equal(game.input.aimActive, true);
  assert.equal(game.input.aimPointerId, 41);
  game.updateAimPointer({ ...pointer, clientX: 256 });
  assert.ok(Math.abs(game.input.aim - 0.5) < 1e-12, "horizontal drag must map to normalized aim");
  assert.equal(game.endAimPointer({ ...pointer, clientX: 256 }, true), true);
  assert.equal(game.input.aimActive, false);
  assert.equal(game.input.aimPointerId, null);
  assert.equal(fireCalls, 1, "releasing aim must fire the active weapon");
}

{
  const game = makeContext();
  game.paused = false;
  game.input.aimActive = false;
  game.input.aimPointerId = null;
  game.input.steer = -0.61;
  let fireCalls = 0;
  game.useActiveWeapon = () => { fireCalls++; };
  const secondFinger = {
    pointerType: "touch",
    button: 0,
    pointerId: 12,
    clientX: 300,
    preventDefault() {}
  };
  assert.equal(game.beginAimPointer(secondFinger, false, 640), false, "first touch remains steering");
  assert.equal(game.beginAimPointer(secondFinger, true, 640), true, "second touch must start aim");
  game.updateAimPointer({ ...secondFinger, clientX: 100 });
  assert.equal(game.input.aim, -1, "touch aim must clamp to -1");
  game.endAimPointer({ ...secondFinger, clientX: 100 }, true);
  assert.equal(game.input.steer, -0.61, "releasing the second finger must not cancel steering");
  assert.equal(fireCalls, 1);
}

{
  const game = makeContext();
  game.paused = false;
  game.input.aim = 0.5;
  const player = game.boats[0];
  const originalHeading = player.dynamics.heading;
  let headingDuringShot = null;
  game.fireWave = (owner) => { headingDuringShot = owner.dynamics.heading; };
  game.applyActionMask(ACTION_WAVE);
  // ⚠️ SIGNE NÉGATIF. Ce test encodait `+` et verrouillait donc l'inversion :
  // la droite de l'écran est −X (caméra le long de +Z, Y vers le haut), alors
  // que le viseur part à droite pour un `aim` positif. Glisser à droite tirait
  // à gauche. Mesuré par projection écran : viseur à 74 % de largeur, tir à
  // −0,187 en NDC. Le test suit désormais l'écran, pas la convention interne.
  assert.ok(
    Math.abs(headingDuringShot - (originalHeading - AIM_MAX_RADIANS * 0.5)) < 1e-12,
    "weapon execution must see the deterministic angular offset (screen-right = negative heading)"
  );
  assert.equal(player.dynamics.heading, originalHeading, "aim must not mutate the boat heading after firing");
}

{
  const game = makeContext();
  game.paused = false;
  const messages = [];
  game.showMessage = (message) => messages.push(message);
  let prevented = 0;
  const press = (code) => game.handleKeyboardInput(true, {
    code,
    target: null,
    repeat: false,
    preventDefault() { prevented++; }
  });
  press("Digit2");
  assert.equal(game.boats[0].activeWeapon, "harpoon", "Digit2 selects the physical harpoon slot");
  press("Digit3");
  assert.equal(game.boats[0].activeWeapon, "harpoon", "an empty physical slot must not replace the active weapon");
  assert.match(messages.at(-1), /SOUTE 3.+VIDE/);
  press("Digit4");
  assert.equal(game.boats[0].activeWeapon, "rhum", "Digit4 selects the physical rhum slot");
  assert.equal(prevented, 3);
}

{
  const game = makeContext();
  let weaponCalls = 0;
  game.useActiveWeapon = () => { weaponCalls++; };
  game.input.actions = 0;

  game.handleKeyboardInput(true, { code: "Space", target: null, preventDefault() {} });
  assert.equal(weaponCalls, 0, "Space must not fire while paused");
  assert.equal(game.input.actions, 0, "pause must not queue an action");

  game.paused = false;
  const focusedButton = { closest: () => ({ tagName: "BUTTON" }) };
  game.handleKeyboardInput(true, { code: "Space", target: focusedButton, preventDefault() {} });
  assert.equal(weaponCalls, 0, "Space on a focused menu button belongs to the DOM");

  game.handleKeyboardInput(true, { code: "Space", target: null, preventDefault() {} });
  assert.equal(weaponCalls, 1, "Space still fires during active play");

  game.input.actions = ACTION_WAVE;
  game.input.left = true;
  let prevented = false;
  game.handleKeyboardInput(true, {
    code: "Escape",
    target: focusedButton,
    preventDefault() { prevented = true; }
  });
  assert.equal(game.paused, true, "Escape must still open pause");
  assert.equal(game.input.actions, 0, "opening pause clears queued actions");
  assert.equal(game.input.left, false, "opening pause clears held steering");
  assert.equal(prevented, true);
}

{
  const game = makeContext();
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false }));
  const pad = { connected: true, axes: [0, 0], buttons };
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { getGamepads: () => [pad] }
  });

  let waveCalls = 0;
  game.fireWave = () => { waveCalls++; };
  game.fireHarpoon = () => {};
  game.dropMine = () => {};
  game.triggerPlayerShift = () => {};
  game.triggerForwardBoost = () => {};
  game.triggerLateralBoost = () => {};
  game.useRevenge = () => {};
  game.adjustCameraZoom = () => {};

  try {
    buttons[0].pressed = true;
    game.pollGamepad();
    assert.equal(waveCalls, 0, "A must not fire while paused");
    assert.equal(game.gamepadPrev[0], true, "paused buttons are consumed");

    game.paused = false;
    game.pollGamepad();
    assert.equal(waveCalls, 0, "a button held through resume must not fire");

    buttons[0].pressed = false;
    game.pollGamepad();
    buttons[0].pressed = true;
    game.pollGamepad();
    assert.equal(waveCalls, 1, "a fresh gameplay press must still fire");
  } finally {
    if (oldNavigator) Object.defineProperty(globalThis, "navigator", oldNavigator);
    else delete globalThis.navigator;
  }
}

console.log("input pause test: ok");
