import assert from "node:assert/strict";
import { AIM_MAX_RADIANS, InputSystems } from "../src/game/input.js";
import { ACTION_WAVE } from "../src/game/balance.js";

function fakeElement({ hidden = true } = {}) {
  const classes = new Set(hidden ? ["hidden"] : []);
  const attributes = new Map();
  return {
    hidden: false,
    inert: false,
    focused: false,
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name),
      toggle(name, force) {
        const add = force === undefined ? !classes.has(name) : Boolean(force);
        if (add) classes.add(name);
        else classes.delete(name);
        return add;
      }
    },
    setAttribute: (name, value) => attributes.set(name, String(value)),
    removeAttribute: (name) => attributes.delete(name),
    getAttribute: (name) => attributes.get(name) ?? null,
    focus() { this.focused = true; }
  };
}

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
  let pointerResets = 0;
  game.dashTapSide = 1;
  game.joyDashLatch = -1;
  game.resetPointerInputs = () => { pointerResets++; };
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
  assert.equal(game.dashTapSide, 0, "central reset clears keyboard dash gestures");
  assert.equal(game.joyDashLatch, 0, "central reset clears touch dash gestures");
  assert.equal(pointerResets, 1, "central reset also releases free steering pointers");
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
  game.countdown = 0;
  game.tour = { stage: 0 };
  game.boats[0].isPlayer = true;
  game.boats[0].tourFinished = true;
  game.input.actions = ACTION_WAVE;
  game.input.steer = 0.9;
  game.input.trim = 1;
  let applied = 0;
  game.applyActionMask = () => { applied++; };
  assert.equal(game.playerInputLocked(), true, "crossing the Tour finish line locks all new player input");
  assert.equal(game.applyPendingPlayerActions(), false);
  assert.equal(game.input.actions, 0, "queued actions are discarded after the finish line");
  assert.equal(applied, 0, "no weapon/action may alter rivals after the player has finished");
  const spectatorInput = game.controlledInputFor(game.boats[0]);
  assert.notEqual(spectatorInput, game.input);
  assert.deepEqual(
    { steer: spectatorInput.steer, trim: spectatorInput.trim, actions: spectatorInput.actions },
    { steer: 0, trim: 0.58, actions: 0 },
    "the finished yole must glide straight with its sail eased, regardless of live keys"
  );
  game.boats[0].tourFinished = false;
  game.input.actions = ACTION_WAVE;
  assert.equal(game.applyPendingPlayerActions(), true);
  assert.equal(applied, 1, "the same action still executes before the finish line");
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
  assert.match(messages.at(-1), /ARME 3.+INDISPONIBLE/);
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

  let activeWeaponCalls = 0;
  let cycleCalls = 0;
  game.useActiveWeapon = () => { activeWeaponCalls++; };
  game.cycleWeapon = () => { cycleCalls++; };
  game.fireHarpoon = () => {};
  game.dropMine = () => {};
  game.triggerPlayerShift = () => {};
  game.triggerForwardBoost = () => {};
  game.triggerLateralBoost = () => {};
  game.adjustCameraZoom = () => {};

  try {
    buttons[0].pressed = true;
    game.pollGamepad();
    assert.equal(activeWeaponCalls, 0, "A must not fire while paused");
    assert.equal(game.gamepadPrev[0], true, "paused buttons are consumed");

    game.paused = false;
    game.pollGamepad();
    assert.equal(activeWeaponCalls, 0, "a button held through resume must not fire");

    buttons[0].pressed = false;
    game.pollGamepad();
    buttons[0].pressed = true;
    game.pollGamepad();
    assert.equal(activeWeaponCalls, 1, "a fresh A press fires the active weapon");

    buttons[0].pressed = false;
    buttons[2].pressed = true;
    game.pollGamepad();
    assert.equal(cycleCalls, 1, "X cycles the active weapon");

    pad.axes[2] = 0.6;
    pad.axes[3] = -0.5;
    game.pollGamepad();
    assert.equal(game.input.aim, 0.6, "right stick aims horizontally");
    assert.equal(game.input.aimPitch, 0.5, "right stick aims vertically with screen-up positive");
    assert.equal(game.input.aimActive, true);

    let rematchCalls = 0;
    game.mode = "ended";
    game.ui.rematch = { onclick() { rematchCalls++; } };
    const hiddenResultDialog = {
      hidden: false,
      classList: { contains: (name) => name === "hidden" }
    };
    game.ui.pause = hiddenResultDialog;
    game.ui.customScreen = hiddenResultDialog;
    game.ui.controlsScreen = hiddenResultDialog;
    game.ui.onboardingScreen = hiddenResultDialog;
    game.ui.leaveScreen = hiddenResultDialog;
    buttons[2].pressed = false;
    buttons[9].pressed = true;
    game.pollGamepad();
    assert.equal(rematchCalls, 1, "Start on results activates the real rematch/next-stage CTA");

    // Une confirmation placée au-dessus des résultats garde la priorité :
    // Start ne doit pas déclencher le CTA de revanche resté en dessous.
    game.gamepadPrev = [];
    game.ui.leaveScreen = {
      hidden: false,
      classList: { contains: () => false }
    };
    game.ui.pause = hiddenResultDialog;
    game.ui.customScreen = hiddenResultDialog;
    game.ui.controlsScreen = hiddenResultDialog;
    game.ui.onboardingScreen = hiddenResultDialog;
    buttons[9].pressed = true;
    game.pollGamepad();
    assert.equal(rematchCalls, 1, "Start must not launch a rematch behind the leave confirmation");
  } finally {
    if (oldNavigator) Object.defineProperty(globalThis, "navigator", oldNavigator);
    else delete globalThis.navigator;
  }
}

// Start ne doit jamais traverser une modale de menu. Les panneaux statiques
// vivent dans `ui`; Tour, replayothèque et À propos sont des <dialog> montés à
// la demande et sont détectés via `dialog[open]`.
{
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false }));
  const pad = { connected: true, axes: [0, 0], buttons };
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const oldDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { getGamepads: () => [pad] }
  });
  const hidden = () => ({ hidden: false, classList: { contains: (name) => name === "hidden" } });
  const visible = () => ({ hidden: false, classList: { contains: () => false } });

  try {
    for (const key of ["pause", "customScreen", "controlsScreen", "onboardingScreen", "leaveScreen"]) {
      const game = makeContext();
      game.mode = "menu";
      game.paused = false;
      game.gamepadPrev = [];
      game.ui = {
        pause: hidden(),
        customScreen: hidden(),
        controlsScreen: hidden(),
        onboardingScreen: hidden(),
        leaveScreen: hidden(),
        versusScreen: hidden(),
        [key]: visible()
      };
      let starts = 0;
      game.setInputDevice = () => {};
      game.startWithOnboarding = (start) => start();
      game.startMatch = () => { starts++; };
      buttons[9].pressed = true;
      game.pollGamepad();
      buttons[9].pressed = false;
      assert.equal(starts, 0, `Start must not cross the visible ${key} modal`);
    }

    for (const dialogId of ["tourHub", "replayLibrary", "infoHub"]) {
      const game = makeContext();
      game.mode = "menu";
      game.paused = false;
      game.gamepadPrev = [];
      game.ui = {
        pause: hidden(),
        customScreen: hidden(),
        controlsScreen: hidden(),
        onboardingScreen: hidden(),
        leaveScreen: hidden(),
        versusScreen: hidden()
      };
      let starts = 0;
      game.setInputDevice = () => {};
      game.startWithOnboarding = (start) => start();
      game.startMatch = () => { starts++; };
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: {
          querySelector: (selector) => selector === "dialog[open]" ? { id: dialogId } : null
        }
      });
      buttons[9].pressed = true;
      game.pollGamepad();
      buttons[9].pressed = false;
      assert.equal(starts, 0, `Start must not cross the open ${dialogId} dialog`);
    }
  } finally {
    if (oldNavigator) Object.defineProperty(globalThis, "navigator", oldNavigator);
    else delete globalThis.navigator;
    if (oldDocument) Object.defineProperty(globalThis, "document", oldDocument);
    else delete globalThis.document;
  }
}

// Quand une sous-modale est ouverte au-dessus d'une partie en pause, Start est
// consommé mais ne reprend pas la simulation derrière cette sous-modale.
{
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false }));
  const pad = { connected: true, axes: [0, 0], buttons };
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { getGamepads: () => [pad] }
  });
  const hidden = () => ({ hidden: false, classList: { contains: (name) => name === "hidden" } });
  const visible = () => ({ hidden: false, classList: { contains: () => false } });

  try {
    for (const key of ["controlsScreen", "leaveScreen"]) {
      const game = makeContext();
      game.mode = "playing";
      game.paused = true;
      game.gamepadPrev = [];
      game.ui = {
        pause: visible(),
        customScreen: hidden(),
        controlsScreen: hidden(),
        onboardingScreen: hidden(),
        leaveScreen: hidden(),
        [key]: visible()
      };
      let toggles = 0;
      game.setInputDevice = () => {};
      game.togglePause = () => { toggles++; };
      buttons[9].pressed = true;
      game.pollGamepad();
      buttons[9].pressed = false;
      assert.equal(toggles, 0, `Start must not resume behind the visible ${key} modal`);
      assert.equal(game.paused, true, `the game must remain paused behind ${key}`);
    }
  } finally {
    if (oldNavigator) Object.defineProperty(globalThis, "navigator", oldNavigator);
    else delete globalThis.navigator;
  }
}

// Le parcours complet au pad doit rester autonome : Back ouvre la
// confirmation, B l'annule, Start ne la traverse pas et A active bien le
// contrôle confirmé après navigation à la croix.
{
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false }));
  const pad = { connected: true, axes: [0, 0], buttons };
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const oldDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const documentMock = {
    activeElement: null,
    body: null,
    documentElement: {
      dataset: {},
      style: { removeProperty() {} }
    },
    getElementById: () => null,
    querySelector: () => null
  };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { getGamepads: () => [pad] }
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: documentMock
  });

  const hidden = () => fakeElement();
  const pause = fakeElement({ hidden: false });
  const leave = fakeElement();
  const menu = fakeElement();
  const makePadButton = (onclick = null) => {
    const control = fakeElement({ hidden: false });
    control.onclick = onclick;
    control.focus = () => {
      control.focused = true;
      documentMock.activeElement = control;
    };
    control.click = () => control.onclick?.();
    return control;
  };

  try {
    const game = makeContext();
    const pauseMenu = makePadButton();
    const leaveCancel = makePadButton(() => game.cancelReturnToMenu());
    const leaveConfirm = makePadButton(() => game.returnToMenu());
    leave.querySelectorAll = () => [leaveCancel, leaveConfirm];
    pause.querySelectorAll = () => [pauseMenu];
    game.ui = {
      ...game.ui,
      pause,
      pauseMenu,
      leaveScreen: leave,
      leaveCancel,
      leaveConfirm,
      customScreen: hidden(),
      controlsScreen: hidden(),
      onboardingScreen: hidden(),
      end: hidden(),
      versusScreen: hidden(),
      versusHud: hidden(),
      rotate: hidden(),
      hud: fakeElement({ hidden: false }),
      menu,
      play: makePadButton(),
      pauseBtn: makePadButton(),
      settingsBtn: makePadButton(),
      customBtn: makePadButton(),
      versusBtn: makePadButton(),
      menuSettings: makePadButton(),
      joyKnob: { style: { transform: "" } }
    };
    game.setInputDevice = () => {};
    game.resize = () => {};
    pauseMenu.focus();

    const tap = (index) => {
      buttons[index].pressed = true;
      game.pollGamepad();
      buttons[index].pressed = false;
      game.pollGamepad();
    };

    tap(8);
    assert.equal(leave.classList.contains("hidden"), false, "Back must open the leave confirmation");
    assert.equal(documentMock.activeElement, leaveCancel, "confirmation opens on its safe cancel action");

    tap(9);
    assert.equal(leave.classList.contains("hidden"), false, "Start must not cross the leave confirmation");
    assert.equal(game.paused, true, "Start must not resume behind the leave confirmation");

    tap(1);
    assert.equal(leave.classList.contains("hidden"), true, "B must cancel the leave confirmation");
    assert.equal(game.paused, true, "cancelling must keep the game paused");
    assert.equal(documentMock.activeElement, pauseMenu, "B must restore focus to the pause action");

    tap(8);
    tap(13);
    assert.equal(documentMock.activeElement, leaveConfirm, "D-pad down must select the confirm action");
    tap(0);
    assert.equal(game.mode, "menu", "A on the confirm action must return to the main menu");
    assert.equal(game.paused, false);
    assert.equal(leave.classList.contains("hidden"), true);
    assert.equal(menu.classList.contains("hidden"), false);
  } finally {
    if (oldNavigator) Object.defineProperty(globalThis, "navigator", oldNavigator);
    else delete globalThis.navigator;
    if (oldDocument) Object.defineProperty(globalThis, "document", oldDocument);
    else delete globalThis.document;
  }
}

// Le retour au menu depuis Pause est un vrai parcours à deux étapes. La
// confirmation neutralise la modale sous-jacente, l'annulation la restaure et
// la validation ferme toute la session.
{
  const game = makeContext();
  const pause = fakeElement({ hidden: false });
  const leave = fakeElement();
  const menu = fakeElement();
  const hud = fakeElement({ hidden: false });
  const end = fakeElement();
  const custom = fakeElement();
  const controls = fakeElement();
  const onboarding = fakeElement();
  const versus = fakeElement();
  const play = fakeElement();
  const pauseMenu = fakeElement({ hidden: false });
  game.ui = {
    ...game.ui,
    pause,
    leaveScreen: leave,
    leaveCancel: fakeElement({ hidden: false }),
    pauseMenu,
    menu,
    hud,
    end,
    customScreen: custom,
    controlsScreen: controls,
    onboardingScreen: onboarding,
    versusScreen: versus,
    versusHud: fakeElement(),
    rotate: fakeElement(),
    play,
    pauseBtn: fakeElement({ hidden: false }),
    settingsBtn: fakeElement({ hidden: false }),
    customBtn: fakeElement({ hidden: false }),
    versusBtn: fakeElement({ hidden: false }),
    menuSettings: fakeElement({ hidden: false }),
    joyKnob: { style: { transform: "" } }
  };
  game.audio = { stopBeds() {} };
  game.music = { setScene() {} };
  game.setVersusMode = () => {};
  game.resize = () => {};

  assert.equal(game.requestReturnToMenu(pauseMenu), true);
  assert.equal(leave.classList.contains("hidden"), false, "confirmation must become visible");
  assert.equal(pause.inert, true, "pause underneath confirmation must be inert");
  assert.equal(pause.getAttribute("aria-hidden"), "true");
  assert.equal(game.cancelReturnToMenu(), true);
  assert.equal(leave.classList.contains("hidden"), true);
  assert.equal(pause.inert, false, "cancelling must restore the pause dialog");
  assert.equal(pause.getAttribute("aria-hidden"), null);

  game.requestReturnToMenu(pauseMenu);
  assert.equal(game.returnToMenu(), true);
  assert.equal(game.mode, "menu");
  assert.equal(game.paused, false);
  assert.equal(menu.classList.contains("hidden"), false, "menu must be visible");
  assert.equal(hud.classList.contains("hidden"), true, "HUD must be closed");
  assert.equal(pause.classList.contains("hidden"), true, "pause must be closed");
  assert.equal(leave.classList.contains("hidden"), true, "confirmation must be closed");
  assert.equal(custom.classList.contains("hidden"), true, "garage must not survive the session");
  assert.equal(play.focused, true, "focus must return to the primary menu action");
}

{
  const values = { loadout: ["wave", "harpoon"] };
  const game = {
    settings: {
      get: (key) => values[key],
      set: (key, value) => { values[key] = value; }
    },
    ui: {}
  };
  Object.assign(game, InputSystems);
  assert.deepEqual(game.selectLoadoutWeapon("mine"), ["wave", "mine"], "a new garage choice preserves slot 1 and replaces slot 2");
  assert.deepEqual(game.selectLoadoutWeapon("mine"), ["mine", "wave"], "touching slot 2 promotes it to the primary slot");
  assert.deepEqual(game.selectLoadoutWeapon("invalid"), ["mine", "wave"], "the garage always keeps two valid weapons");
}

{
  let resetCalls = 0;
  let muteTarget = null;
  let qualityCalls = 0;
  let impactCalls = 0;
  let inputClears = 0;
  let uiRefreshes = 0;
  const defaults = { cameraZoom: 1.18 };
  const game = {
    mode: "menu",
    settings: {
      reset() { resetCalls++; },
      get(key) { return defaults[key]; }
    },
    audio: {
      muted: true,
      master: { gain: { value: 0 } },
      setMuted(muted) {
        this.muted = muted;
        muteTarget = muted ? 0 : 0.62;
        this.master.gain.value = muteTarget;
      }
    },
    quality: { setAutomatic() { qualityCalls++; } },
    impact: { reset() { impactCalls++; } },
    clearLiveInput() { inputClears++; },
    applySettingsUI() { uiRefreshes++; }
  };
  Object.assign(game, InputSystems);
  game.clearLiveInput = () => { inputClears++; };
  assert.equal(game.resetAllSettings(), true);
  assert.equal(resetCalls, 1);
  assert.equal(game.audio.muted, false, "reset must restore the audio engine mute state");
  assert.equal(muteTarget, 0.62, "reset must restore the master gain through setMuted");
  assert.equal(game.audio.master.gain.value, 0.62);
  assert.equal(game.cameraZoom, 1.18);
  assert.deepEqual(
    { qualityCalls, impactCalls, inputClears, uiRefreshes },
    { qualityCalls: 1, impactCalls: 1, inputClears: 1, uiRefreshes: 1 }
  );
}

{
  const game = makeContext();
  game.paused = false;
  game.countdown = 0;
  game.showMessage = () => {};
  assert.equal(game.pauseForInterruption("visibility"), true);
  assert.equal(game.paused, true, "backgrounding auto-pauses active play");
  assert.equal(game.pauseReason, "visibility");
  assert.equal(game.resumeCountdownPending, true);
  game.togglePause(false);
  assert.equal(game.paused, false);
  assert.ok(game.countdown >= 3.8, "returning from an interruption gets a fresh 3-2-1");
  assert.equal(game.resumeCountdownPending, false);
}

// Le menu principal se parcourt comme un vrai menu console : une première
// direction acquiert le focus, la suivante respecte la géométrie des cartes,
// A valide et gauche/droite ajuste directement un curseur.
{
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false }));
  const pad = { connected: true, axes: [0, 0], buttons };
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const oldDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const documentMock = { activeElement: null, querySelectorAll: () => [] };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { getGamepads: () => [pad] }
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: documentMock
  });

  const control = (top, { primary = false } = {}) => {
    const classes = new Set(primary ? ["primary"] : []);
    return {
      hidden: false,
      tagName: "BUTTON",
      type: "button",
      classList: { contains: (name) => classes.has(name) },
      closest: () => null,
      getClientRects: () => [1],
      getBoundingClientRect: () => ({ left: 20, top, width: 260, height: 70 }),
      focus() { documentMock.activeElement = this; },
      click() { this.clicks = (this.clicks ?? 0) + 1; }
    };
  };
  const combat = control(20, { primary: true });
  const tour = control(110);
  const menu = {
    hidden: false,
    classList: { contains: () => false },
    getAttribute: () => null,
    querySelectorAll: () => [combat, tour],
    contains: (node) => node === combat || node === tour
  };

  try {
    const game = makeContext();
    game.mode = "menu";
    game.paused = false;
    game.gamepadPrev = [];
    game.gamepadMenuAxes = { x: 0, y: 0 };
    game.setInputDevice = () => {};
    game.ui = { menu };

    const tap = (index) => {
      buttons[index].pressed = true;
      game.pollGamepad();
      buttons[index].pressed = false;
      game.pollGamepad();
    };

    tap(13);
    assert.equal(documentMock.activeElement, combat, "first D-pad direction focuses the primary mode");
    tap(13);
    assert.equal(documentMock.activeElement, tour, "D-pad down follows the card layout");
    tap(0);
    assert.equal(tour.clicks, 1, "A activates the focused menu card");

    let inputEvents = 0;
    const range = {
      tagName: "INPUT",
      type: "range",
      min: "0",
      max: "100",
      step: "10",
      value: "50",
      dispatchEvent(event) { if (event.type === "input") inputEvents++; }
    };
    assert.equal(game.adjustFocusedRange(range, 1), true);
    assert.equal(range.value, "60");
    assert.equal(inputEvents, 1, "range navigation dispatches the real input event");
  } finally {
    if (oldNavigator) Object.defineProperty(globalThis, "navigator", oldNavigator);
    else delete globalThis.navigator;
    if (oldDocument) Object.defineProperty(globalThis, "document", oldDocument);
    else delete globalThis.document;
  }
}

console.log("input pause test: ok");
