import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { HudSystems, advanceBalanceNeedle } from "../src/game/hud.js";

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
  return {
    classList: fakeClassList(hidden ? ["hidden"] : []),
    style: fakeStyle(),
    textContent: "",
    offsetWidth: 1,
    closest: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    setAttribute() {}
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
      shiftQuality: () => null
    }
  };
  const ui = {
    roundLabel,
    roundSub: fakeElement(),
    timer: fakeElement(),
    speed: fakeElement(),
    balanceBar,
    balanceText: fakeElement(),
    flowBar: fakeElement(),
    flowText: fakeElement(),
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
    activeWeapon: () => null
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

// Le rail secondaire Mât/Voile/BWA ne doit prendre de place qu'en cas de
// dommage. La coque possède déjà sa silhouette et sa jauge principales.
{
  const { game, structure, ui } = makeHudHarness();
  HudSystems.updateUI.call(game);
  assert.equal(ui.systemIntegrity.classList.contains("hidden"), true, "intact secondary systems stay hidden");

  structure.hull = 0.4;
  HudSystems.updateUI.call(game);
  assert.equal(
    ui.systemIntegrity.classList.contains("hidden"),
    true,
    "hull damage alone must not reveal the intact secondary-system rail"
  );

  for (const damage of [
    () => { structure.mast = 0.82; },
    () => { structure.mast = 1; structure.sail = 0.82; },
    () => { structure.sail = 1; structure.bwa[3] = 0.82; }
  ]) {
    damage();
    HudSystems.updateUI.call(game);
    assert.equal(ui.systemIntegrity.classList.contains("hidden"), false, "damaged Mât/Voile/BWA must reveal the rail");
  }

  structure.bwa.fill(1);
  HudSystems.updateUI.call(game);
  assert.equal(ui.systemIntegrity.classList.contains("hidden"), true, "repairing every secondary system hides the rail again");
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
