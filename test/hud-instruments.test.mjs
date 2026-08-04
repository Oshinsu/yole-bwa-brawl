import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  HudSystems,
  advanceBalanceNeedle,
  advanceHudDiagnostics,
  elanHudPresentation,
  trainingHudPresentation
} from "../src/game/hud.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const readText = (relative) => readFile(resolve(root, relative), "utf8");

function fakeClassList(initial = []) {
  const classes = new Set(initial);
  return {
    add: (...names) => names.forEach((name) => classes.add(name)),
    remove: (...names) => names.forEach((name) => classes.delete(name)),
    contains: (name) => classes.has(name),
    toggle(name, force) {
      const enabled = force === undefined ? !classes.has(name) : Boolean(force);
      if (enabled) classes.add(name);
      else classes.delete(name);
      return enabled;
    }
  };
}

function fakeStyle() {
  const properties = new Map();
  return {
    width: "",
    color: "",
    background: "",
    setProperty: (name, value) => properties.set(name, String(value)),
    getPropertyValue: (name) => properties.get(name) ?? ""
  };
}

function fakeElement({ hidden = false } = {}) {
  const attributes = new Map();
  return {
    classList: fakeClassList(hidden ? ["hidden"] : []),
    style: fakeStyle(),
    textContent: "",
    offsetWidth: 1,
    closest: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    setAttribute(name, value) { attributes.set(name, String(value)); },
    removeAttribute(name) { attributes.delete(name); },
    getAttribute(name) { return attributes.get(name) ?? null; }
  };
}

function makeHudHarness() {
  const status = fakeElement();
  const roundCard = fakeElement();
  const balanceBar = fakeElement();
  balanceBar.closest = (selector) => selector === ".status" ? status : null;
  const roundLabel = fakeElement();
  roundLabel.closest = (selector) => selector === ".round-card" ? roundCard : null;
  const systemIntegrity = fakeElement();
  const flowMeter = fakeElement();
  const flowBar = fakeElement();
  flowBar.parentElement = flowMeter;
  const structure = {
    hull: 1,
    mast: 1,
    sail: 1,
    bwa: [1, 1, 1, 1, 1, 1]
  };
  const player = {
    score: 0,
    speed: 8,
    roll: 0,
    flow: 0.8,
    activeCrew: 6,
    water: 0,
    z: 180,
    eliminated: false,
    tourFinished: false,
    activeWeapon: "",
    loadout: [],
    ammo: {},
    cooldowns: {},
    dynamics: {
      structure,
      slip: 0,
      surf: 0,
      counterSteer: 0,
      boostCooldown: 0,
      arcadeBoostForward: 0,
      arcadeBoostLateral: 0,
      shiftQuality: () => null
    }
  };
  const ui = {
    hud: fakeElement(),
    roundLabel,
    roundSub: fakeElement(),
    timer: fakeElement(),
    speed: fakeElement(),
    balanceBar,
    balanceText: fakeElement(),
    flowMeter,
    flowBar,
    flowState: fakeElement(),
    flowText: fakeElement(),
    flowHint: fakeElement(),
    flowRisk: fakeElement(),
    crewDots: fakeElement(),
    trimText: fakeElement(),
    waterText: fakeElement(),
    hullBar: fakeElement(),
    hullText: fakeElement(),
    mastBar: fakeElement(),
    sailBar: fakeElement(),
    bwaIntegrityBar: fakeElement(),
    systemIntegrity,
    stormDistance: fakeElement(),
    storm: fakeElement()
  };
  const game = {
    mode: "playing",
    time: 0,
    paused: false,
    tour: null,
    versusLocal: false,
    round: 1,
    roundTime: 0,
    roundEnding: 0,
    countdown: 0,
    stormZ: 0,
    boats: [player],
    input: { trim: 0.82, aim: 0, aimPitch: 0, aimActive: false },
    atmosphere: { weather: { stormAmount: 0, windSpeed: 8 } },
    music: { scene: "course", setScene() {} },
    ui,
    uiFeedback: {
      ammo: Object.create(null),
      weaponReady: Object.create(null),
      roundToken: "combat:1",
      handlingMode: "stable"
    },
    syncAudioSettings() {},
    updateMinimap() {},
    updateLeaderboard() {},
    activeWeapon: () => null,
    applyTrainingHud: HudSystems.applyTrainingHud
  };
  return { game, player, structure, ui, status };
}

// La cible conserve le signe exact de la gîte, mais l'aiguille de rendu possède
// maintenant une masse propre : elle doit converger sans téléportation.
{
  const { game, player, ui } = makeHudHarness();
  const cases = [
    { roll: -2, expected: -50, side: "bâbord borné" },
    { roll: -0.575, expected: -25, side: "bâbord" },
    { roll: 0, expected: 0, side: "centre" },
    { roll: 0.575, expected: 25, side: "tribord" },
    { roll: 2, expected: 50, side: "tribord borné" }
  ];
  for (const { roll, expected, side } of cases) {
    player.roll = roll;
    HudSystems.updateUI.call(game);
    const target = ui.balanceBar.style.getPropertyValue("--balance-target");
    const needle = ui.balanceBar.style.getPropertyValue("--balance-offset");
    assert.match(target, /^-?(?:\d+(?:\.\d+)?|\.\d+)%$/, `${side}: target must be a percentage`);
    assert.match(needle, /^-?(?:\d+(?:\.\d+)?|\.\d+)%$/, `${side}: needle must be a percentage`);
    assert.ok(
      Math.abs(Number.parseFloat(target) - expected) < 1e-9,
      `${side}: roll ${roll} must map to ${expected}%, got ${target}`
    );
  }
}

{
  const needle = { position: 0, velocity: 0 };
  advanceBalanceNeedle(needle, 50, 0.08);
  assert.ok(
    needle.position > 0 && needle.position < 50,
    "l'aiguille doit commencer à charger sans atteindre instantanément la cible"
  );
  const first = needle.position;
  for (let index = 0; index < 24; index++) advanceBalanceNeedle(needle, 50, 0.08);
  assert.ok(needle.position > first, "l'aiguille doit poursuivre sa course");
  assert.ok(
    Math.abs(needle.position - 50) < 0.4,
    `l'aiguille ne converge pas vers la charge: ${needle.position}`
  );
  advanceBalanceNeedle(needle, -50, 0.08);
  assert.ok(needle.position > -50, "l'inversion de gîte ne doit pas téléporter l'aiguille");
}

// Les bandes d'Élan ont des frontières exactes : 16 % ouvre le turbo, 22 %
// ouvre aussi le dash et 95 % devient une pleine charge lisible.
{
  const cases = [
    { flow: 0, band: "empty", state: "low", text: "ÉLAN BAS" },
    { flow: 0.159, band: "low", state: "low", text: "ÉLAN BAS" },
    { flow: 0.16, band: "turbo-ready", state: "ready", text: "TURBO PRÊT" },
    { flow: 0.219, band: "turbo-ready", state: "ready", text: "TURBO PRÊT" },
    { flow: 0.22, band: "dash-ready", state: "ready", text: "TURBO + DASH" },
    { flow: 0.949, band: "dash-ready", state: "ready", text: "TURBO + DASH" },
    { flow: 0.95, band: "high", state: "ready", text: "PLEINE CHARGE" },
    { flow: 0.999, band: "high", state: "ready", text: "PLEINE CHARGE" },
    { flow: 1, band: "full", state: "ready", text: "PLEINE CHARGE" }
  ];
  for (const expected of cases) {
    const presentation = elanHudPresentation({ flow: expected.flow });
    assert.equal(presentation.band, expected.band, `wrong band at ${expected.flow}`);
    assert.equal(presentation.state, expected.state, `wrong state at ${expected.flow}`);
    assert.equal(presentation.text, expected.text, `wrong copy at ${expected.flow}`);
  }

  const activeCooldown = elanHudPresentation({
    flow: 0.8,
    cooldown: 7.2,
    cooldownTotal: 15,
    active: true
  });
  assert.equal(activeCooldown.state, "cooldown");
  assert.equal(activeCooldown.text, "ACTIF", "active thrust has priority over recovery copy");
  assert.ok(Math.abs(activeCooldown.cooldownLevel - 0.48) < 1e-12);
  assert.equal(
    elanHudPresentation({ flow: 1, cooldown: 4, disabled: true }).state,
    "disabled",
    "elimination has priority over cooldown"
  );
  assert.equal(
    elanHudPresentation({ flow: 1, locked: true, disabled: true }).state,
    "locked",
    "the initiation lock is the highest-priority state"
  );
}

// Le parent sémantique reçoit l'état durable et les cues ponctuels. Un même
// serial ne doit jamais relancer le reflow d'animation.
{
  const { game, player, ui } = makeHudHarness();
  let cueReflows = 0;
  Object.defineProperty(ui.flowMeter, "offsetWidth", {
    configurable: true,
    get() {
      cueReflows++;
      return 1;
    }
  });

  HudSystems.updateUI.call(game);
  assert.equal(ui.flowMeter.getAttribute("data-turbo-state"), "ready");
  assert.equal(ui.flowMeter.getAttribute("data-flow-band"), "dash-ready");
  assert.equal(ui.flowMeter.getAttribute("data-dash-ready"), "true");
  assert.equal(ui.flowMeter.getAttribute("aria-valuenow"), "80");
  assert.match(ui.flowMeter.getAttribute("aria-valuetext"), /turbo et dash disponibles/i);
  assert.equal(ui.flowMeter.getAttribute("aria-live"), null, "the meter must never become a live region");
  assert.equal(ui.flowMeter.style.getPropertyValue("--flow-level"), "0.8");
  assert.equal(ui.flowMeter.style.getPropertyValue("--flow-empty"), "20%");
  assert.equal(ui.flowMeter.style.getPropertyValue("--cooldown-level"), "0");
  assert.equal(ui.flowState.textContent, "TURBO + DASH");
  assert.equal(ui.flowText.textContent, "80%");
  assert.equal(ui.flowHint.textContent, "F TURBO · X DASH");
  assert.match(ui.flowMeter.getAttribute("aria-valuetext"), /F TURBO · X DASH/);

  player.dynamics.boostCooldown = 7.2;
  game.boostHudFeedback = {
    serial: 1,
    outcome: "rejected",
    kind: "lateral",
    reason: "cooldown",
    cooldownTotal: 15
  };
  HudSystems.updateUI.call(game);
  assert.equal(ui.flowMeter.getAttribute("data-turbo-state"), "cooldown");
  assert.equal(ui.flowState.textContent, "REPRISE 8s");
  assert.equal(ui.flowText.textContent, "80%");
  assert.equal(ui.flowHint.textContent, "SOUFFLE DE L’ÉQUIPAGE");
  assert.equal(ui.flowMeter.style.getPropertyValue("--cooldown-level"), "0.48");
  assert.equal(ui.flowMeter.classList.contains("turbo-rejected"), true);
  assert.equal(ui.flowMeter.getAttribute("data-boost-kind"), "lateral");
  assert.equal(ui.flowMeter.getAttribute("data-reject-reason"), "cooldown");
  assert.equal(cueReflows, 1);

  HudSystems.updateUI.call(game);
  assert.equal(cueReflows, 1, "an unchanged serial must not restart the cue");

  player.dynamics.boostCooldown = 10;
  player.dynamics.arcadeBoostForward = 0.8;
  game.boostHudFeedback = {
    serial: 2,
    outcome: "confirmed",
    kind: "forward",
    reason: null,
    cooldownTotal: 10
  };
  HudSystems.updateUI.call(game);
  assert.equal(ui.flowState.textContent, "ACTIF");
  assert.equal(ui.flowHint.textContent, "POUSSÉE · REDRESSE APRÈS");
  assert.equal(ui.flowMeter.classList.contains("turbo-confirmed"), true);
  assert.equal(ui.flowMeter.classList.contains("turbo-rejected"), false);
  assert.equal(ui.flowMeter.getAttribute("data-reject-reason"), null);
  assert.equal(cueReflows, 2);

  player.dynamics.arcadeBoostForward = 0;
  player.dynamics.boostCooldown = 9.1;
  HudSystems.updateUI.call(game);
  assert.equal(ui.flowState.textContent, "REPRISE 10s");

  delete ui.flowMeter;
  player.dynamics.boostCooldown = 0;
  player.flow = 0.1;
  HudSystems.updateUI.call(game);
  assert.equal(
    ui.flowBar.parentElement.getAttribute("data-turbo-state"),
    "low",
    "flowBar.parentElement is the runtime fallback while main.js has no flowMeter binding"
  );

  game.trainingMode = true;
  game.trainingGuide = { step: 0, advancedUnlocked: false };
  HudSystems.updateUI.call(game);
  assert.equal(ui.flowBar.parentElement.getAttribute("data-turbo-state"), "locked");
  assert.equal(ui.flowState.textContent, "VERROUILLÉ");

  game.trainingMode = false;
  game.trainingGuide = null;
  player.eliminated = true;
  HudSystems.updateUI.call(game);
  assert.equal(ui.flowBar.parentElement.getAttribute("data-turbo-state"), "disabled");
  assert.equal(ui.flowState.textContent, "HORS COURSE");
}

// Un dash demandé avec seulement la réserve Turbo explique précisément son
// refus, puis efface son cartouche ponctuel même si les animations sont coupées.
{
  const { game, player, ui } = makeHudHarness();
  player.flow = 0.18;
  game.boostHudFeedback = {
    serial: 1,
    outcome: "rejected",
    kind: "lateral",
    reason: "flow",
    cooldownTotal: 15
  };
  HudSystems.updateUI.call(game);
  assert.equal(ui.flowState.textContent, "TURBO PRÊT");
  assert.equal(ui.flowHint.textContent, "DASH : ÉLAN BAS");
  assert.equal(ui.flowMeter.classList.contains("turbo-rejected"), true);
  await new Promise((resolve) => setTimeout(resolve, 560));
  assert.equal(ui.flowMeter.classList.contains("turbo-rejected"), false);
  assert.equal(ui.flowMeter.getAttribute("data-boost-outcome"), null);

  game.time = 1.1;
  HudSystems.updateUI.call(game);
  assert.equal(ui.flowHint.textContent, "F TURBO · X DASH");
}

// La microcopie suit le dernier périphérique et n'invite pas à déclencher une
// poussée quand la yole est déjà trop couchée.
{
  const { game, player, ui } = makeHudHarness();
  game.inputDevice = "touch";
  HudSystems.updateUI.call(game);
  assert.equal(ui.flowHint.textContent, "2× EAU · 2× JOYSTICK");

  player.roll = 0.45;
  HudSystems.updateUI.call(game);
  assert.equal(ui.flowMeter.getAttribute("data-heel-risk"), "true");
  assert.equal(ui.flowRisk.textContent, "REDRESSE D’ABORD");
  assert.equal(ui.flowRisk.getAttribute("aria-hidden"), "false");
  assert.match(ui.flowMeter.getAttribute("aria-valuetext"), /Redresse d’abord/);

  player.roll = 0.1;
  game.inputDevice = "gamepad";
  HudSystems.updateUI.call(game);
  assert.equal(ui.flowMeter.getAttribute("data-heel-risk"), "false");
  assert.equal(ui.flowHint.textContent, "RB TURBO · LB DASH");
  assert.equal(ui.flowRisk.textContent, "");
  assert.equal(ui.flowRisk.getAttribute("aria-hidden"), "true");
}

// Le HUD se replie au calme, mémorise brièvement un impact et reste ouvert
// pendant un vrai danger. Le rail Mât/Voile/BWA ne s'ouvre que pour sa cause.
{
  const { game, player, structure, ui } = makeHudHarness();
  HudSystems.updateUI.call(game);
  assert.equal(ui.systemIntegrity.classList.contains("hidden"), true, "intact secondary systems stay hidden");
  assert.equal(ui.hud.getAttribute("data-diagnostics"), "calm");
  assert.equal(ui.hud.classList.contains("hud-diagnostics-visible"), false);

  structure.hull = 0.4;
  HudSystems.updateUI.call(game);
  assert.equal(
    ui.systemIntegrity.classList.contains("hidden"),
    true,
    "hull damage alone must not reveal the intact secondary-system rail"
  );
  assert.equal(ui.hud.getAttribute("data-diagnostics"), "notice");
  assert.equal(ui.hud.classList.contains("hud-diagnostic-hull"), true);
  assert.equal(ui.hud.classList.contains("hud-diagnostics-visible"), true);

  game.time = 3.5;
  HudSystems.updateUI.call(game);
  assert.equal(ui.hud.getAttribute("data-diagnostics"), "calm", "a stable old hit must fold away");
  assert.equal(ui.hud.getAttribute("data-diagnostics-worn"), "true", "wear remains queryable by CSS");

  structure.sail = 0.82;
  HudSystems.updateUI.call(game);
  assert.equal(ui.systemIntegrity.classList.contains("hidden"), false, "fresh sail damage must reveal its rail");
  assert.equal(ui.hud.classList.contains("hud-diagnostic-sail"), true);

  game.time = 7;
  HudSystems.updateUI.call(game);
  assert.equal(ui.systemIntegrity.classList.contains("hidden"), true, "a stable old sail hit must fold away");

  structure.bwa[3] = 0.82;
  game.time = 7.1;
  HudSystems.updateUI.call(game);
  assert.equal(ui.hud.classList.contains("hud-diagnostic-bwa"), true);
  assert.equal(ui.systemIntegrity.classList.contains("hidden"), false, "fresh BWA damage must reveal its rail");

  game.time = 11;
  HudSystems.updateUI.call(game);
  player.activeCrew = 5;
  player.water = 25;
  HudSystems.updateUI.call(game);
  assert.equal(ui.hud.classList.contains("hud-diagnostic-crew"), true);
  assert.equal(ui.hud.classList.contains("hud-diagnostic-water"), true);
  assert.match(ui.hud.getAttribute("data-diagnostic-reasons"), /crew/);

  player.roll = 0.72;
  HudSystems.updateUI.call(game);
  assert.equal(ui.hud.getAttribute("data-diagnostics"), "danger");
  assert.equal(ui.hud.classList.contains("hud-diagnostic-danger"), true);
  game.time = 20;
  HudSystems.updateUI.call(game);
  assert.equal(
    ui.hud.getAttribute("data-diagnostics"),
    "danger",
    "a dangerous heel must stay visible beyond the transient timeout"
  );
}

// La machine d'état peut aussi être testée sans DOM : une perte légère est
// transitoire, un seuil critique ne l'est pas.
{
  const memory = {};
  advanceHudDiagnostics(memory, {
    hull: 1, sail: 1, bwa: 1, crew: 6, water: 0, danger: false
  }, 0);
  advanceHudDiagnostics(memory, {
    hull: 0.92, sail: 1, bwa: 1, crew: 6, water: 0, danger: false
  }, 0.1);
  assert.equal(memory.level, "notice");
  advanceHudDiagnostics(memory, {
    hull: 0.92, sail: 1, bwa: 1, crew: 6, water: 0, danger: false
  }, 4);
  assert.equal(memory.level, "calm");
  advanceHudDiagnostics(memory, {
    hull: 0.3, sail: 1, bwa: 1, crew: 6, water: 0, danger: false
  }, 8);
  assert.equal(memory.level, "danger");
}

// L'initiation divulgue les commandes dans l'ordre réellement enseigné.
{
  const { game, ui } = makeHudHarness();
  ui.bwa = fakeElement();
  ui.weaponSlot = fakeElement();
  ui.weaponHold2 = fakeElement();
  ui.weaponCrate = fakeElement({ hidden: true });
  ui.weaponShortcuts = fakeElement();
  ui.reticle = fakeElement({ hidden: true });
  ui.aimHelp = fakeElement();
  game.trainingMode = true;
  game.trainingGuide = { step: 0 };

  HudSystems.updateUI.call(game);
  assert.equal(ui.hud.getAttribute("data-training-active"), "true");
  assert.equal(ui.hud.getAttribute("data-training-systems"), "helm sail balance");
  assert.equal(ui.roundLabel.textContent, "INITIATION 1/3");
  assert.equal(ui.roundSub.textContent, "Q/D + ↑/↓ · BARRE + VOILE");
  assert.equal(ui.bwa.classList.contains("training-locked"), true);
  assert.equal(ui.weaponSlot.classList.contains("training-locked"), true);
  assert.equal(ui.flowMeter.getAttribute("data-training-locked"), "true");

  game.trainingGuide.step = 1;
  HudSystems.updateUI.call(game);
  assert.match(ui.hud.getAttribute("data-training-systems"), /\bshift\b/);
  assert.equal(ui.roundSub.textContent, "SHIFT · QUAND ELLE PENCHE");
  assert.equal(ui.bwa.classList.contains("training-locked"), false);
  assert.equal(ui.weaponSlot.classList.contains("training-locked"), true);

  game.trainingGuide.step = 2;
  HudSystems.updateUI.call(game);
  assert.match(ui.hud.getAttribute("data-training-systems"), /\bweapons\b/);
  assert.equal(ui.roundSub.textContent, "ESPACE · TIRE COCO");
  assert.equal(ui.weaponSlot.classList.contains("training-locked"), false);
  assert.equal(
    ui.weaponCrate.classList.contains("hidden"),
    true,
    "training unlock must preserve an empty crate's business visibility"
  );
  assert.equal(ui.flowMeter.getAttribute("data-training-locked"), "true");

  game.trainingGuide.advancedUnlocked = true;
  game.trainingGuide.arsenalRestored = true;
  HudSystems.updateUI.call(game);
  assert.equal(
    ui.hud.getAttribute("data-training-active"),
    "false",
    "trainingMode stays true after reveal, but the initiation HUD must close"
  );
  assert.equal(ui.hud.getAttribute("data-training-step"), "complete");
  assert.equal(ui.roundLabel.textContent, "MANCHE 1");
  assert.match(ui.hud.getAttribute("data-training-systems"), /\bboost\b/);
  assert.equal(ui.flowMeter.getAttribute("data-training-locked"), "false");

  game.trainingMode = false;
  game.trainingGuide = null;
  HudSystems.updateUI.call(game);
  assert.equal(ui.hud.getAttribute("data-training-step"), "complete");
  assert.match(ui.hud.getAttribute("data-training-systems"), /\bboost\b/);
  assert.equal(ui.flowMeter.getAttribute("data-training-locked"), "false");
  assert.equal(ui.reticle.classList.contains("hidden"), true, "unlocking must preserve reticle business visibility");
  assert.equal(ui.reticle.getAttribute("aria-hidden"), null, "unlocking removes the training override");
}

// Le poste central traduit la vraie fenêtre physique sans écrire dans la
// simulation, puis disparaît avec les armes dès que le joueur est spectateur.
{
  const { game, player, ui } = makeHudHarness();
  const bwa = fakeElement();
  const bwaCopy = fakeElement();
  bwa.querySelector = (selector) => selector === "small" ? bwaCopy : null;
  ui.bwa = bwa;
  ui.hud = fakeElement();
  player.dynamics.shiftQuality = () => ({
    state: "critical",
    precision: 0.8,
    roll: 0.29,
    rollOffset: 0
  });

  HudSystems.updateUI.call(game);
  assert.equal(bwa.classList.contains("shift-open"), true);
  assert.equal(bwa.classList.contains("shift-perfect"), true);
  assert.equal(bwaCopy.textContent, "MAINTENANT !");
  assert.ok(
    Number(bwa.style.getPropertyValue("--shift-meter")) > 0.8,
    "the central timing rail must visibly charge inside the perfect window"
  );
  assert.equal(ui.hud.classList.contains("spectator-controls-hidden"), false);

  player.eliminated = true;
  HudSystems.updateUI.call(game);
  assert.equal(
    ui.hud.classList.contains("spectator-controls-hidden"),
    true,
    "dead controls must leave the spectator camera"
  );
}

const expectedAssets = [
  "assets/textures/v8/hud/status_frame.webp",
  "assets/textures/v8/hud/balance_track.webp",
  "assets/textures/v8/hud/hull_silhouette.webp",
  "assets/textures/v8/hud/flow_sail.webp"
];

// Les quatre rasters V8 sont des images alpha réelles, pas des placeholders
// renommés. On valide directement conteneur, dimensions et canal alpha.
//
// ⚠️ ILS ÉTAIENT EN PNG, ILS SONT EN WEBP DEPUIS LE 2 AOÛT 2026. C'était le
// seul pack du dépôt encore en PNG, et les quatre sont précachés : 604 Ko
// téléchargés par tout joueur au premier lancement, contre 166 Ko en WebP q88
// (37,9 à 40,8 dB de PSNR sur RGB prémultiplié — visuellement transparent).
//
// L'intention du contrôle ne change pas d'un pouce : prouver qu'il y a une
// vraie image et un vrai alpha derrière le nom de fichier. Le WebP la sert même
// mieux — on exige le chunk ALPH lui-même, pas seulement un octet de type.
for (const relative of expectedAssets) {
  const absolute = resolve(root, relative);
  const data = await readFile(absolute);
  const info = await stat(absolute);
  assert.ok(info.size >= 256, `${relative} is unexpectedly small`);
  assert.equal(data.subarray(0, 4).toString("ascii"), "RIFF", `${relative} must be a RIFF container`);
  assert.equal(data.subarray(8, 12).toString("ascii"), "WEBP", `${relative} must be WEBP`);
  // VP8X est la forme étendue : la seule qui porte un drapeau alpha explicite.
  assert.equal(data.subarray(12, 16).toString("ascii"), "VP8X", `${relative} must use the extended VP8X header`);
  assert.ok((data[20] & 0x10) !== 0, `${relative} must declare alpha in its VP8X flags`);
  // Dimensions VP8X : deux entiers 24 bits little-endian, stockés moins un.
  const width = data.readUIntLE(24, 3) + 1;
  const height = data.readUIntLE(27, 3) + 1;
  assert.ok(width >= 32 && height >= 16, `${relative} has invalid dimensions ${width}x${height}`);
  // Le drapeau peut mentir ; le chunk, non. On parcourt le RIFF.
  const chunks = [];
  for (let offset = 12; offset + 8 <= data.length;) {
    const identifier = data.subarray(offset, offset + 4).toString("ascii");
    const size = data.readUInt32LE(offset + 4);
    chunks.push(identifier);
    offset += 8 + size + (size & 1);
  }
  assert.ok(chunks.includes("ALPH"), `${relative} declares alpha but carries no ALPH chunk`);
}

// Le nouveau module ÉLAN ne télécharge pas douze images : ses douze états sont
// détourés dans un seul atlas WebP, suffisamment léger pour rester précaché sur
// mobile. Dimensions divisibles par la grille = cadrage pixel-stable en CSS.
{
  const relative = "assets/textures/v9/hud/turbo_elan_atlas.webp";
  const data = await readFile(resolve(root, relative));
  const info = await stat(resolve(root, relative));
  assert.ok(info.size <= 240_000, `${relative} is too heavy for a HUD-only mobile asset`);
  assert.equal(data.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(data.subarray(8, 12).toString("ascii"), "WEBP");
  assert.equal(data.subarray(12, 16).toString("ascii"), "VP8X");
  assert.ok((data[20] & 0x10) !== 0, `${relative} must declare alpha`);
  const width = data.readUIntLE(24, 3) + 1;
  const height = data.readUIntLE(27, 3) + 1;
  assert.equal(width, 1448);
  assert.equal(height, 1086);
  assert.equal(width % 4, 0);
  assert.equal(height % 3, 0);

  const chunks = [];
  for (let offset = 12; offset + 8 <= data.length;) {
    const identifier = data.subarray(offset, offset + 4).toString("ascii");
    const size = data.readUInt32LE(offset + 4);
    chunks.push(identifier);
    offset += 8 + size + (size & 1);
  }
  assert.ok(chunks.includes("ALPH"), `${relative} must carry a real alpha chunk`);

  const [manifestSource, promptSource, css, serviceWorker, html, mainSource] = await Promise.all([
    readText("assets/textures/v9/asset-pack.json"),
    readText("art-source/ui/TURBO_ELAN_PROMPT.json"),
    readText("style.css"),
    readText("service-worker.js"),
    readText("index.html"),
    readText("src/main.js")
  ]);
  const manifest = JSON.parse(manifestSource);
  const prompt = JSON.parse(promptSource);
  const entry = manifest.assets.find((asset) => asset.path === relative);
  assert.ok(entry, "the Turbo atlas needs a traceable V9 manifest entry");
  assert.equal(entry.sha256, createHash("sha256").update(data).digest("hex"));
  assert.equal(prompt.layout.grid, "4x3");
  assert.equal(prompt.layout.cellOrder.length, 12);
  assert.ok(css.includes(relative));
  assert.ok(serviceWorker.includes(`./${relative}`));
  assert.match(html, /id="flowMeter"[^>]*role="progressbar"/);
  assert.match(mainSource, /flowState:\s*byId\("flowState"\)/);
  assert.match(mainSource, /flowHint:\s*byId\("flowHint"\)/);
}

// Présence seule ne suffit pas : le pack, la feuille de style et le cache
// hors-ligne doivent tous référencer les mêmes chemins.
{
  const [manifestSource, css, serviceWorker, hudSource, html, mainSource] = await Promise.all([
    readText("assets/textures/v8/asset-pack.json"),
    readText("style.css"),
    readText("service-worker.js"),
    readText("src/game/hud.js"),
    readText("index.html"),
    readText("src/main.js")
  ]);
  const manifest = JSON.parse(manifestSource);
  assert.equal(manifest.schemaVersion, 1);
  assert.match(String(manifest.pack?.version ?? manifest.pack?.id ?? ""), /8/);
  for (const relative of expectedAssets) {
    assert.ok(manifestSource.includes(relative), `${relative} missing from V8 manifest`);
    assert.ok(css.includes(relative), `${relative} missing from CSS`);
    assert.ok(serviceWorker.includes(`./${relative}`), `${relative} missing from service-worker precache`);
  }
  assert.ok(
    serviceWorker.includes("./assets/textures/v8/asset-pack.json"),
    "V8 manifest itself must be available offline"
  );
  assert.match(css, /transform\s*:[^;}]*var\(--balance-offset\)/, "CSS must consume the signed balance offset");
  assert.match(hudSource, /setCssVariable\(\s*this\.ui\.balanceBar\s*,\s*["']--balance-offset["']/);
  assert.doesNotMatch(hudSource, /balanceBar\.style\.width/, "balance marker must not regress to an unsigned fill width");
  assert.match(html, /id="systemIntegrity"/);
  assert.match(mainSource, /systemIntegrity:\s*byId\("systemIntegrity"\)/);

  // Le manifeste doit être traçable vers les octets livrés quand il publie des
  // empreintes. Ce garde tolère un manifeste minimal, mais interdit une empreinte
  // mensongère.
  const visit = (value, entries = []) => {
    if (!value || typeof value !== "object") return entries;
    if (!Array.isArray(value) && typeof value.path === "string") entries.push(value);
    for (const child of Array.isArray(value) ? value : Object.values(value)) visit(child, entries);
    return entries;
  };
  const entries = visit(manifest);
  for (const relative of expectedAssets) {
    const entry = entries.find((candidate) => candidate.path === relative);
    assert.ok(entry, `${relative} needs a manifest entry`);
    if (entry.sha256) {
      const actual = createHash("sha256").update(await readFile(resolve(root, relative))).digest("hex");
      assert.equal(entry.sha256, actual, `${relative} manifest checksum is stale`);
    }
  }
}

console.log("HUD instruments: signed balance, contextual systems and V8 assets OK");
