// HUD : classement, messages, killfeed, jauges et écran de réglages.
//
// Ne lit que l'état du jeu et écrit dans le DOM. Aucune décision de gameplay
// ne doit apparaître ici.

import { clamp, formatTime } from "../core/math.js";
import { routeCenter } from "../render/world.js";
import { checksumBoats } from "../sim/replay.js";
import { YOLE_HANDLING } from "../sim/yole-physics.js";
import { BALANCE, CONFIG, CREW_DOTS, WEAPONS, STORM_RANGE, resolveAiLevel, COUNTDOWN_GO_SECONDS } from "./balance.js";
import { AIM_MAX_RADIANS } from "./input.js";
import { handlingCue } from "./handling-feedback.js";

// Vivier de chiffres de dégâts. 14 couvre une mêlée à quatre yoles sans jamais
// allouer en cours de partie.
const DAMAGE_POOL = 14;
const DAMAGE_LIFE = 1.15;        // secondes
const DAMAGE_RISE_WORLD = 2.4;   // mètres de montée sur la durée de vie
const DIAGNOSTIC_HOLD_SECONDS = 3.4;
const DIAGNOSTIC_REASONS = Object.freeze([
  "hull", "sail", "bwa", "crew", "water", "danger"
]);
const ELAN_STATES = Object.freeze(["locked", "disabled", "cooldown", "low", "ready"]);
const ELAN_BANDS = Object.freeze([
  "empty", "low", "turbo-ready", "dash-ready", "high", "full"
]);
const TURBO_FLOW_THRESHOLD = 0.16;
const DASH_FLOW_THRESHOLD = 0.22;
const FULL_FLOW_THRESHOLD = 0.95;

const colorCss = (color) => `#${Number(color ?? 0xffffff).toString(16).padStart(6, "0")}`;
const restartUiCue = (element, className) => {
  if (!element?.classList) return;
  element.classList.remove(className);
  // La lecture de layout est volontaire et locale : elle ne se produit qu'à
  // une transition d'état, jamais à chaque frame.
  void element.offsetWidth;
  element.classList.add(className);
};
const setCssVariable = (element, name, value) => {
  if (!element?.style) return;
  if (element.style.setProperty) element.style.setProperty(name, value);
  else element.style[name] = value;
};
const setAttributeIfChanged = (element, name, value) => {
  if (!element?.setAttribute) return;
  const next = String(value);
  if (element.getAttribute?.(name) === next) return;
  element.setAttribute(name, next);
};

/**
 * Mémoire purement visuelle des diagnostics.
 *
 * Un dégât léger n'a pas à occuper le HUD pendant toute la manche : il ouvre
 * une fenêtre assez longue pour être lu, puis se replie. Un seuil critique ou
 * une gîte dangereuse reste visible tant que le danger existe.
 */
export function advanceHudDiagnostics(state, sample, now = 0) {
  const memory = state && typeof state === "object" ? state : {};
  const current = {
    hull: clamp(Number.isFinite(sample?.hull) ? sample.hull : 1, 0, 1),
    sail: clamp(Number.isFinite(sample?.sail) ? sample.sail : 1, 0, 1),
    bwa: clamp(Number.isFinite(sample?.bwa) ? sample.bwa : 1, 0, 1),
    crew: Math.max(0, Math.trunc(Number.isFinite(sample?.crew) ? sample.crew : 6)),
    water: Math.max(0, Number.isFinite(sample?.water) ? sample.water : 0),
    danger: Boolean(sample?.danger)
  };
  const time = Number.isFinite(now) ? now : 0;
  const previous = memory.sample;
  const triggered = [];
  const dropped = (key, epsilon = 0.002) => (
    previous && current[key] < previous[key] - epsilon
  );

  if (previous) {
    if (dropped("hull")) triggered.push("hull");
    if (dropped("sail")) triggered.push("sail");
    if (dropped("bwa")) triggered.push("bwa");
    if (current.crew < previous.crew) triggered.push("crew");
    const crossedWaterBand = Math.floor(current.water / 20) > Math.floor(previous.water / 20);
    if (current.water > previous.water + 4 || crossedWaterBand) triggered.push("water");
    if (current.danger && !previous.danger) triggered.push("danger");
  } else {
    if (current.hull < 0.985) triggered.push("hull");
    if (current.sail < 0.985) triggered.push("sail");
    if (current.bwa < 0.985) triggered.push("bwa");
    if (current.crew < 6) triggered.push("crew");
    if (current.water >= 10) triggered.push("water");
    if (current.danger) triggered.push("danger");
  }

  if (triggered.length > 0) {
    const stillOpen = time < (memory.until ?? 0);
    memory.latchedReasons = [...new Set([
      ...(stillOpen ? memory.latchedReasons ?? [] : []),
      ...triggered
    ])];
    memory.until = time + DIAGNOSTIC_HOLD_SECONDS;
  }

  const criticalReasons = [];
  if (current.hull <= 0.35) criticalReasons.push("hull");
  if (current.sail <= 0.40) criticalReasons.push("sail");
  if (current.bwa <= 0.42) criticalReasons.push("bwa");
  if (current.crew <= 2) criticalReasons.push("crew");
  if (current.water >= 80) criticalReasons.push("water");
  if (current.danger) criticalReasons.push("danger");

  const noticeOpen = time < (memory.until ?? 0);
  const reasons = [...new Set([
    ...(noticeOpen ? memory.latchedReasons ?? [] : []),
    ...criticalReasons
  ])];
  memory.sample = current;
  memory.visible = reasons.length > 0;
  memory.level = criticalReasons.length > 0 ? "danger" : memory.visible ? "notice" : "calm";
  memory.reasons = reasons;
  memory.worn = (
    current.hull < 0.985
    || current.sail < 0.985
    || current.bwa < 0.985
    || current.crew < 6
    || current.water >= 10
  );
  if (!memory.visible) memory.latchedReasons = [];
  return memory;
}

export function trainingHudPresentation(trainingMode, guide) {
  // `trainingMode` reste volontairement vrai jusqu'à la fin de la partie :
  // l'arsenal, lui, peut être révélé en cours de manche. Une initiation déjà
  // validée ne doit donc plus conserver le HUD en étape 3 ni le turbo verrouillé.
  const active = Boolean(trainingMode && guide && !guide.advancedUnlocked);
  const step = active ? clamp(Math.trunc(guide.step ?? 0), 0, 2) : 3;
  const systems = ["helm", "sail", "balance"];
  if (step >= 1) systems.push("shift");
  if (step >= 2) systems.push("weapons");
  if (!active) systems.push("boost");
  return {
    active,
    step,
    systems,
    shiftUnlocked: !active || step >= 1,
    weaponsUnlocked: !active || step >= 2,
    boostUnlocked: !active
  };
}

/**
 * Présentation de la réserve d'Élan, sans aucune décision de gameplay.
 *
 * La disponibilité et la bande de ressource sont séparées : une jauge pleine
 * peut être en reprise, tandis que 16 % suffisent au turbo mais pas au dash.
 */
export function elanHudPresentation({
  flow = 0,
  cooldown = 0,
  cooldownTotal = YOLE_HANDLING.boostCooldown,
  locked = false,
  disabled = false,
  active = false
} = {}) {
  const level = clamp(Number.isFinite(flow) ? flow : 0, 0, 1);
  const percent = Math.round(level * 100);
  const remaining = Math.max(0, Number.isFinite(cooldown) ? cooldown : 0);
  const total = Math.max(
    0.001,
    Number.isFinite(cooldownTotal) && cooldownTotal > 0
      ? cooldownTotal
      : YOLE_HANDLING.boostCooldown
  );

  const band = level <= 0
    ? "empty"
    : level < TURBO_FLOW_THRESHOLD
      ? "low"
      : level < DASH_FLOW_THRESHOLD
        ? "turbo-ready"
        : level < FULL_FLOW_THRESHOLD
          ? "dash-ready"
          : level < 1
            ? "high"
            : "full";
  const state = locked
    ? "locked"
    : disabled
      ? "disabled"
      : remaining > 0
        ? "cooldown"
        : level < TURBO_FLOW_THRESHOLD
          ? "low"
          : "ready";
  const activeNow = Boolean(active && state !== "locked" && state !== "disabled");
  const seconds = Math.max(1, Math.ceil(remaining));
  const dashReady = state === "ready" && level >= DASH_FLOW_THRESHOLD;

  let text = "TURBO PRÊT";
  let ariaValueText = `Élan prêt, réserve ${percent} pour cent`;
  if (state === "locked") {
    text = "VERROUILLÉ";
    ariaValueText = `Élan verrouillé pendant l’initiation, réserve ${percent} pour cent`;
  } else if (state === "disabled") {
    text = "HORS COURSE";
    ariaValueText = `Élan indisponible, réserve ${percent} pour cent`;
  } else if (activeNow) {
    text = "ACTIF";
    ariaValueText = `Élan actif, réserve ${percent} pour cent`;
  } else if (state === "cooldown") {
    text = `REPRISE ${seconds}s`;
    ariaValueText = `Élan en reprise, ${seconds} seconde${seconds > 1 ? "s" : ""}, réserve ${percent} pour cent`;
  } else if (state === "low") {
    text = "ÉLAN BAS";
    ariaValueText = `Élan bas, ${percent} pour cent, turbo disponible à partir de 16 pour cent`;
  } else if (level >= FULL_FLOW_THRESHOLD) {
    text = "PLEINE CHARGE";
    ariaValueText = `Pleine charge d’élan, réserve ${percent} pour cent`;
  } else if (dashReady) {
    text = "TURBO + DASH";
    ariaValueText = `Élan prêt, turbo et dash disponibles, réserve ${percent} pour cent`;
  } else {
    text = "TURBO PRÊT";
    ariaValueText = `Élan prêt, turbo disponible, réserve ${percent} pour cent`;
  }

  return {
    level,
    percent,
    cooldown: remaining,
    cooldownTotal: total,
    cooldownLevel: clamp(remaining / total, 0, 1),
    state,
    band,
    active: activeNow,
    dashReady,
    text,
    ariaValueText
  };
}

const applyElanState = (meter, presentation) => {
  if (!meter) return;
  for (const state of ELAN_STATES) {
    meter.classList?.toggle?.(`turbo-${state}`, presentation.state === state);
  }
  for (const band of ELAN_BANDS) {
    meter.classList?.toggle?.(`flow-${band}`, presentation.band === band);
  }
  meter.classList?.toggle?.("turbo-active", presentation.active);
  setAttributeIfChanged(meter, "data-turbo-state", presentation.state);
  setAttributeIfChanged(meter, "data-flow-band", presentation.band);
  setAttributeIfChanged(meter, "data-turbo-active", presentation.active);
  setAttributeIfChanged(meter, "data-dash-ready", presentation.dashReady);
  setAttributeIfChanged(meter, "aria-valuenow", presentation.percent);
  setAttributeIfChanged(meter, "aria-valuetext", presentation.ariaValueText);
  // Trois décimales dépassent déjà la résolution visuelle du rail et évitent
  // d'invalider le style pour du bruit flottant sans pixel observable.
  setCssVariable(meter, "--flow-level", String(Math.round(presentation.level * 1000) / 1000));
  setCssVariable(meter, "--flow-empty", `${Math.round((1 - presentation.level) * 1000) / 10}%`);
  setCssVariable(
    meter,
    "--cooldown-level",
    String(Math.round(presentation.cooldownLevel * 1000) / 1000)
  );
};

const applyDiagnosticState = (element, state) => {
  if (!element) return;
  element.classList?.toggle?.("hud-diagnostics-visible", Boolean(state.visible));
  element.classList?.toggle?.("hud-diagnostics-calm", state.level === "calm");
  element.classList?.toggle?.("hud-diagnostics-notice", state.level === "notice");
  element.classList?.toggle?.("hud-diagnostics-danger", state.level === "danger");
  element.classList?.toggle?.("hud-diagnostics-worn", Boolean(state.worn));
  for (const reason of DIAGNOSTIC_REASONS) {
    element.classList?.toggle?.(`hud-diagnostic-${reason}`, state.reasons.includes(reason));
  }
  element.setAttribute?.("data-diagnostics", state.level);
  element.setAttribute?.("data-diagnostic-reasons", state.reasons.join(" "));
  element.setAttribute?.("data-diagnostics-visible", String(Boolean(state.visible)));
  element.setAttribute?.("data-diagnostics-worn", String(Boolean(state.worn)));
};

const applyTrainingLock = (element, system, unlocked) => {
  if (!element) return;
  const locked = !unlocked;
  element.classList?.toggle?.("training-locked", locked);
  element.classList?.toggle?.("training-unlocked", !locked);
  element.setAttribute?.("data-training-system", system);
  element.setAttribute?.("data-training-locked", String(locked));
  // Ne jamais écrire `aria-hidden=false` ni toucher `.hidden` : le réticule,
  // l'aide de visée et la caisse possèdent leurs propres états métier.
  if (locked) element.setAttribute?.("aria-hidden", "true");
  else element.removeAttribute?.("aria-hidden");
};

// Instrument de rendu uniquement : la simulation garde son roulis exact, mais
// l'aiguille possède sa propre masse. Le sous-pas borne l'intégration quand le
// HUD revient après une pause ou un onglet masqué.
export function advanceBalanceNeedle(state, target, dt = 0.08) {
  const needle = state && typeof state === "object" ? state : {};
  if (!Number.isFinite(needle.position)) needle.position = 0;
  if (!Number.isFinite(needle.velocity)) needle.velocity = 0;
  const destination = clamp(Number.isFinite(target) ? target : 0, -50, 50);
  const elapsed = clamp(Number.isFinite(dt) ? dt : 0.08, 0, 0.16);
  const steps = Math.max(1, Math.ceil(elapsed / 0.04));
  const step = elapsed / steps;
  for (let index = 0; index < steps; index++) {
    const acceleration = (destination - needle.position) * 42 - needle.velocity * 10;
    needle.velocity += acceleration * step;
    needle.position += needle.velocity * step;
  }
  needle.position = clamp(needle.position, -52, 52);
  needle.velocity = clamp(needle.velocity, -180, 180);
  return needle;
}

export const HudSystems = {
  syncAudioSettings() {
    const volume = (key, fallback) => {
      const value = Number(this.settings?.get?.(key));
      return Number.isFinite(value) ? clamp(value, 0, 1) : fallback;
    };
    const musicVolume = volume("musicVolume", 0.8);
    const sfxVolume = volume("sfxVolume", 1);
    const soundEnabled = this.settings?.get?.("audio") !== false && !this.audio?.muted;
    this.music?.setVolume?.(soundEnabled ? musicVolume : 0);
    const parameter = this.audio?.sfxGain?.gain;
    if (parameter && (
      this.audioUiCache?.parameter !== parameter
      || this.audioUiCache?.sfx !== sfxVolume
      || this.audioUiCache?.enabled !== soundEnabled
    )) {
      const now = this.audio?.context?.currentTime ?? 0;
      parameter.setTargetAtTime?.(soundEnabled ? sfxVolume : 0, now, 0.04);
      if (!parameter.setTargetAtTime) parameter.value = soundEnabled ? sfxVolume : 0;
    }
    this.audioUiCache = { parameter, sfx: sfxVolume, music: musicVolume, enabled: soundEnabled };
    if (this.ui?.musicVolume) this.ui.musicVolume.value = String(Math.round(musicVolume * 100));
    this.ui?.musicVolume?.style?.setProperty?.("--range-level", `${Math.round(musicVolume * 100)}%`);
    if (this.ui?.musicVolumeValue) this.ui.musicVolumeValue.textContent = `${Math.round(musicVolume * 100)}%`;
    if (this.ui?.sfxVolume) this.ui.sfxVolume.value = String(Math.round(sfxVolume * 100));
    this.ui?.sfxVolume?.style?.setProperty?.("--range-level", `${Math.round(sfxVolume * 100)}%`);
    if (this.ui?.sfxVolumeValue) this.ui.sfxVolumeValue.textContent = `${Math.round(sfxVolume * 100)}%`;
    if (this.ui?.sound) {
      this.ui.sound.textContent = soundEnabled ? "🔊" : "🔇";
      this.ui.sound.setAttribute?.("aria-pressed", String(soundEnabled));
      this.ui.sound.setAttribute?.("aria-label", soundEnabled ? "Son activé" : "Son coupé");
    }
    return { soundEnabled, musicVolume, sfxVolume };
  },

  applySettingsUI() {
    const setToggle = (element, active, text) => {
      if (!element) return;
      element.classList.toggle("active", Boolean(active));
      element.setAttribute?.("aria-pressed", String(Boolean(active)));
      const small = element.querySelector?.("small") || element.children?.[2];
      if (small) small.textContent = text;
    };
    const storedHaptics = this.settings.get("haptics");
    const hapticsLevel = storedHaptics === true
      ? 1
      : storedHaptics === false
        ? 0
        : [1, 0.5, 0].includes(storedHaptics) ? storedHaptics : 1;
    if (storedHaptics !== hapticsLevel) this.settings.set("haptics", hapticsLevel);
    setToggle(
      this.ui.hapticsToggle,
      hapticsLevel > 0,
      hapticsLevel >= 1 ? "TOTAL" : hapticsLevel > 0 ? "DOUX" : "SANS"
    );
    const cameraStability = clamp(this.settings.get("cameraRoll"), 0, 1);
    const cameraStabilityLabel = cameraStability >= 0.9
      ? "STABLE"
      : cameraStability <= 0.75
        ? "VIVANTE"
        : "ÉQUIL.";
    setToggle(this.ui.stableCameraToggle, cameraStability >= 0.9, cameraStabilityLabel);
    this.ui.stableCameraToggle?.setAttribute?.(
      "aria-label",
      `Stabilisation caméra : ${cameraStabilityLabel.toLowerCase()}, ${Math.round(cameraStability * 100)} %`
    );
    setToggle(this.ui.flashToggle, this.settings.get("reduceFlash"), this.settings.get("reduceFlash") ? "OUI" : "NON");
    const impactLevel = this.settings.get("impact");
    setToggle(this.ui.impactToggle, impactLevel > 0, impactLevel >= 1 ? "TOTAL" : impactLevel > 0 ? "DOUX" : "SANS");
    // Le niveau d'IA ne s'applique qu'au LANCEMENT d'une partie : le changer en
    // pleine manche ne doit pas modifier des adversaires déjà tirés, sinon le
    // replay en cours cesserait d'être relisible.
    const aiLevel = resolveAiLevel(this.settings.get("aiLevel"));
    setToggle(this.ui.difficultyToggle, aiLevel.key !== "peyi", aiLevel.label);
    this.ui.difficultyToggle?.setAttribute?.("aria-label", `Adversaires : ${aiLevel.label} — ${aiLevel.detail}. Prend effet à la prochaine partie.`);
    setToggle(this.ui.leftHandedToggle, this.settings.get("leftHanded"), this.settings.get("leftHanded") ? "OUI" : "NON");
    setToggle(this.ui.perfToggle, this.settings.get("showPerf"), this.settings.get("showPerf") ? "VISIBLE" : "MASQUÉ");
    setToggle(this.ui.autoQualityToggle, !this.quality?.manual, !this.quality?.manual ? "ACTIF" : "MANUEL");
    const tierLabel = ["LQ", "MQ", "HQ"][this.quality?.tier ?? 2] ?? "HQ";
    setToggle(this.ui.qualityTierToggle, Boolean(this.quality?.manual), this.quality?.manual ? tierLabel : `AUTO · ${tierLabel}`);
    this.ui.qualityTierToggle?.setAttribute?.(
      "aria-label",
      `Palier graphique : ${this.quality?.manual ? tierLabel : `automatique, actuellement ${tierLabel}`}. Activer pour passer au palier suivant.`
    );
    const ghostOn = this.settings.get("ghost") !== false;
    setToggle(this.ui.ghostToggle, ghostOn, ghostOn ? "OUI" : "NON");
    this.ui.ghostToggle?.setAttribute?.(
      "aria-label",
      `Fantôme de ta dernière course sur la même mer : ${ghostOn ? "affiché" : "masqué"}. Prend effet à la prochaine partie.`
    );
    document.body?.classList.toggle("left-handed", this.settings.get("leftHanded"));
    document.body?.classList.toggle("hide-perf", !this.settings.get("showPerf"));
    document.body?.classList.toggle("reduce-flash", Boolean(this.settings.get("reduceFlash")));
    document.body?.classList.toggle("reduced-impact", impactLevel < 1);
    document.body?.classList.toggle("minimal-impact", impactLevel <= 0);
    this.postFX?.setReduceFlash(this.settings.get("reduceFlash"));
    this.syncAudioSettings();
    const qualityLabel = this.qualityProfile?.label || this.ui.quality?.textContent || "HQ";
    this.ui.quality?.setAttribute?.("aria-label", `Qualité graphique : ${qualityLabel}, activer pour changer`);
    const zoomPercent = Math.round(this.cameraZoom * 100);
    if (this.ui.zoomValue) this.ui.zoomValue.textContent = `${zoomPercent}%`;
    this.ui.zoomReset?.setAttribute?.("aria-label", `Réinitialiser le zoom, actuellement ${zoomPercent} %`);
  },

  toggleSetting(key, values = [false, true]) {
    const current = this.settings.get(key);
    const index = values.findIndex((value) => value === current);
    const next = values[(index + 1 + values.length) % values.length];
    this.settings.set(key, next);
    this.applySettingsUI();
    return next;
  },


  // ── NOMBRES DE DÉGÂTS FLOTTANTS ──────────────────────────────────────────
  //
  // On ne voyait rien de ce que faisaient les armes : la coque baissait dans
  // une jauge, sans jamais dire combien ni à cause de quoi.
  //
  // ⚠️ ENTIÈREMENT CÔTÉ RENDU. La liste vit hors de la boucle fixe, avance en
  // temps RÉEL, et ne consomme que `visualRng` — rien ici n'entre dans le
  // checksum de replay. Le point de capture (Boat.applyHit) lit l'état APRÈS
  // coup et n'ajoute aucun tirage.

  /** Prépare le vivier de divs. Idempotent, et silencieux sans DOM réel. */
  initDamageNumbers() {
    if (this.damageNumbers) return this.damageNumbers;
    this.damageNumbers = [];
    const hote = this.ui?.damageNumbers;
    if (!hote || typeof document === "undefined" || !document.createElement) return this.damageNumbers;
    for (let index = 0; index < DAMAGE_POOL; index++) {
      const element = document.createElement("div");
      element.className = "damage-number";
      hote.appendChild(element);
      this.damageNumbers.push({ element, life: 0, x: 0, y: 0, z: 0, monte: 0 });
    }
    return this.damageNumbers;
  },

  /**
   * Un coup vient d'ôter `fraction` de coque à `boat`.
   *
   * `fraction` est la perte RÉELLEMENT infligée, pas celle demandée : le rhum
   * annule tout (yole-physics.js) et la coque est bornée à 0, donc un coup
   * fatal sur une épave à 3 % n'enlève que 3 %. Afficher le montant demandé
   * mentirait au joueur.
   */
  pushDamageNumber(boat, fraction, source) {
    const vivier = this.initDamageNumbers();
    if (!vivier.length) return;
    const pourcent = Math.round(fraction * 100);
    if (pourcent < 1) return;
    // On recycle le plus ancien plutôt que d'ignorer le coup : dans une mêlée,
    // ce sont les DERNIERS chiffres qui intéressent.
    let creneau = vivier.find((item) => item.life <= 0)
      || vivier.reduce((a, b) => (a.life <= b.life ? a : b));
    const joueur = this.boats?.[0];
    const subi = boat === joueur;
    const inflige = Boolean(source) && source === joueur && !subi;
    creneau.element.className = "damage-number "
      + (subi ? "dn-subi" : inflige ? "dn-inflige" : "dn-tiers")
      + (pourcent >= 18 ? " dn-gros" : "");
    creneau.element.textContent = `-${pourcent}%`;
    creneau.life = DAMAGE_LIFE;
    creneau.x = boat.x;
    creneau.y = (boat.y ?? 0) + 3.2;
    creneau.z = boat.z;
    // Dispersion latérale : deux coups quasi simultanés ne doivent pas se
    // superposer exactement et n'en donner l'air que d'un seul.
    creneau.monte = this.visualRng ? this.visualRng.range(-0.5, 0.5) : 0;
  },

  /** Avance et repositionne les chiffres. Appelée avec le temps RÉEL. */
  updateDamageNumbers(dt) {
    const vivier = this.damageNumbers;
    if (!vivier || !vivier.length) return;
    const camera = this.camera;
    const scratch = this.damageScratch
      || (this.damageScratch = this.THREE?.Vector3 ? new this.THREE.Vector3() : null);
    // `project` n'existe pas sur le three.js simulé des tests Node : sans cette
    // garde, toute la suite tomberait sur un TypeError.
    const projetable = Boolean(camera && scratch && typeof scratch.project === "function");
    const largeur = this.ui?.viewport?.clientWidth || globalThis.innerWidth || 1280;
    const hauteur = this.ui?.viewport?.clientHeight || globalThis.innerHeight || 720;
    for (const item of vivier) {
      if (item.life <= 0) continue;
      item.life -= dt;
      if (item.life <= 0) { item.element.style.opacity = "0"; continue; }
      const age = 1 - item.life / DAMAGE_LIFE;
      if (!projetable) continue;
      scratch.set(item.x + item.monte * 1.6, item.y + age * DAMAGE_RISE_WORLD, item.z);
      scratch.project(camera);
      // z > 1 : le point est DERRIÈRE la caméra. Sans ce test, il réapparaît
      // en miroir de l'autre côté de l'écran.
      if (scratch.z > 1) { item.element.style.opacity = "0"; continue; }
      const px = (scratch.x * 0.5 + 0.5) * largeur;
      const py = (-scratch.y * 0.5 + 0.5) * hauteur;
      item.element.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) translate(-50%, -50%)`;
      // Apparition franche, disparition douce : le chiffre doit être lisible
      // tout de suite, c'est une information, pas une décoration.
      item.element.style.opacity = String(age < 0.12 ? age / 0.12 : Math.min(1, item.life / 0.45));
    }
  },

  showMessage(text, duration = 0.8) {
    this.ui.message.textContent = text;
    const normalized = String(text).toLocaleUpperCase("fr");
    // ⚠️ `GRAIN` -> `BRUME|SABLE`. Cette regex décide du style d'URGENCE d'un
    // message ; l'oublier aurait rendu les alertes de brume visuellement
    // identiques à un message anodin, alors que ce sont les plus critiques.
    const critical = /DANGER|CHAVIR|ÉLIMIN|BRUME|SABLE|VIDE|RECHARGE/.test(normalized);
    const positive = /VICTOIRE|PARFAIT|PRÊT|SÉLECTIONNÉ|TURBO/.test(normalized);
    this.ui.message.classList.toggle("message-critical", critical);
    this.ui.message.classList.toggle("message-positive", !critical && positive);
    this.ui.message.setAttribute?.("aria-live", critical ? "assertive" : "polite");
    this.ui.message.classList.remove("hidden");
    this.messageTimer = duration;
  },

  addKill(text) {
    const element = document.createElement("div");
    element.className = "kill";
    element.textContent = text;
    element.setAttribute?.("role", "listitem");
    if (this.versusLocal && this.boats?.length >= 2) {
      const p1At = text.indexOf(this.boats[0]?.name ?? "");
      const p2At = text.indexOf(this.boats[1]?.name ?? "");
      if (p1At >= 0 && (p2At < 0 || p1At < p2At)) element.classList.add("kill-p1");
      else if (p2At >= 0) element.classList.add("kill-p2");
    }
    this.ui.killfeed.prepend(element);
    setTimeout(() => element.remove(), 3800);
  },

  createLeaderboardRows() {
    // Lignes créées une seule fois ; la mise à jour ne touche que le texte
    // et les classes (l'ancien innerHTML reconstruisait tout 12 fois par seconde).
    this.leaderRows = this.boats.map((boat) => {
      const row = document.createElement("div");
      row.className = `leader-row${boat.isPlayer ? " player" : ""}${boat.localControlled ? " player-two" : ""}`;
      const rank = document.createElement("b");
      const name = document.createElement("span");
      const dot = document.createElement("i");
      dot.className = "leader-dot";
      dot.style.display = "inline-block";
      dot.style.color = `#${boat.color.toString(16).padStart(6, "0")}`;
      dot.style.background = "currentColor";
      const label = document.createElement("span");
      label.textContent = ` ${boat.name}`;
      name.appendChild(dot);
      name.appendChild(label);
      const score = document.createElement("strong");
      score.className = "leader-score";
      row.appendChild(rank);
      row.appendChild(name);
      row.appendChild(score);
      this.ui.leaderboard.appendChild(row);
      return { boat, row, rank, score, lastRank: -1, lastScore: -1, lastEliminated: null };
    });
  },

  updateLeaderboard() {
    if (!this.leaderRows) this.createLeaderboardRows();
    const sorted = this.leaderSortScratch;
    sorted.length = 0;
    for (const entry of this.leaderRows) sorted.push(entry);
    sorted.sort((a, b) => b.boat.score - a.boat.score || b.boat.z - a.boat.z);
    for (let index = 0; index < sorted.length; index++) {
      const entry = sorted[index];
      const rank = index + 1;
      const score = entry.boat.score;
      const eliminated = Boolean(entry.boat.eliminated);
      if (entry.lastRank !== rank) { entry.rank.textContent = String(rank); entry.lastRank = rank; }
      if (entry.lastScore !== score) { entry.score.textContent = String(score); entry.lastScore = score; }
      if (entry.lastEliminated !== eliminated) { entry.row.classList.toggle("eliminated", eliminated); entry.lastEliminated = eliminated; }
      entry.row.classList.toggle("player-two", Boolean(entry.boat.localControlled));
      // appendChild sur un nœud déjà inséré le déplace : réordonnancement sans recréation.
      this.ui.leaderboard.appendChild(entry.row);
    }
  },

  updateMinimap(player) {
    const canvas = this.ui.minimapCanvas;
    if (!canvas?.getContext) return;
    if (!this.minimapContext) {
      this.minimapContext = canvas.getContext("2d", { alpha: false });
      if (!this.minimapContext) return;
    }

    const ctx = this.minimapContext;
    const width = canvas.width || 320;
    const height = canvas.height || 320;
    const pad = 14;
    const zBehind = 72;
    const zAhead = 258;
    const zMin = player.z - zBehind;
    const zMax = player.z + zAhead;
    const zSpan = zMax - zMin;
    const xSpan = 310;
    const xMid = routeCenter((zMin + zMax) * 0.5);
    const xMin = xMid - xSpan * 0.5;
    const mapWidth = width - pad * 2;
    const mapHeight = height - pad * 2;
    const mapX = (x) => pad + ((x - xMin) / xSpan) * mapWidth;
    const mapY = (z) => height - pad - ((z - zMin) / zSpan) * mapHeight;
    const visible = (x, z, margin = 16) => {
      const px = mapX(x);
      const py = mapY(z);
      return px >= -margin && px <= width + margin && py >= -margin && py <= height + margin;
    };

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const sea = ctx.createLinearGradient(0, 0, 0, height);
    sea.addColorStop(0, "#082d43");
    sea.addColorStop(0.55, "#07526a");
    sea.addColorStop(1, "#05273b");
    ctx.fillStyle = sea;
    ctx.fillRect(0, 0, width, height);

    // Le Grain reste lisible derrière le joueur sans transformer la carte en
    // alarme rouge permanente.
    if (this.stormZ > zMin) {
      const stormY = clamp(mapY(this.stormZ), 0, height);
      const storm = ctx.createLinearGradient(0, stormY, 0, height);
      storm.addColorStop(0, "rgba(255,75,84,.08)");
      storm.addColorStop(1, "rgba(111,13,48,.62)");
      ctx.fillStyle = storm;
      ctx.fillRect(0, stormY, width, height - stormY);
      if (this.stormZ < zMax) {
        ctx.save();
        ctx.setLineDash([8, 6]);
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(255,90,94,.92)";
        ctx.shadowColor = "rgba(255,48,77,.85)";
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(0, stormY);
        ctx.lineTo(width, stormY);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Quadrillage nautique discret : 50 m dans l'axe de course.
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(133,234,240,.10)";
    for (let z = Math.ceil(zMin / 50) * 50; z < zMax; z += 50) {
      const y = mapY(z);
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(width - pad, y);
      ctx.stroke();
    }
    for (let x = Math.ceil(xMin / 50) * 50; x < xMin + xSpan; x += 50) {
      const px = mapX(x);
      ctx.beginPath();
      ctx.moveTo(px, pad);
      ctx.lineTo(px, height - pad);
      ctx.stroke();
    }
    ctx.restore();

    // Îlots réellement streamés autour de la flotte.
    const islands = this.world?.nearestIslands?.((zMin + zMax) * 0.5, 14) ?? [];
    for (const island of islands) {
      if (!visible(island.x, island.z, 42)) continue;
      const x = mapX(island.x);
      const y = mapY(island.z);
      const rx = Math.max(3, island.rx / xSpan * mapWidth);
      const rz = Math.max(3, island.rz / zSpan * mapHeight);
      ctx.beginPath();
      ctx.ellipse(x, y, rx + 2.8, rz + 2.8, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(240,207,133,.94)";
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x, y, rx, rz, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#27764e";
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x - rx * 0.16, y - rz * 0.12, rx * 0.56, rz * 0.55, -0.25, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(91,158,88,.72)";
      ctx.fill();
    }

    // Couloir de course sinueux, volontairement plus fin que les marqueurs.
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let sample = 0; sample <= 38; sample++) {
      const z = zMin + (zSpan * sample) / 38;
      const x = mapX(routeCenter(z));
      const y = mapY(z);
      if (sample === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "rgba(64,238,235,.17)";
    ctx.lineWidth = 11;
    ctx.stroke();
    ctx.strokeStyle = "rgba(135,255,242,.72)";
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();

    // Ligne d'arrivée du Tour quand elle entre dans la fenêtre tactique.
    if (this.tour) {
      const finishZ = this.tourCourseLength();
      if (finishZ >= zMin && finishZ <= zMax) {
        const finishY = mapY(finishZ);
        const finishX = mapX(routeCenter(finishZ));
        ctx.save();
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = "#ffe36e";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(finishX - 28, finishY);
        ctx.lineTo(finishX + 28, finishY);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Bouées de parcours et de ligne, sans recopier les îlots comme décor.
    for (const buoy of this.buoys ?? []) {
      if (!visible(buoy.x, buoy.z, 4)) continue;
      ctx.beginPath();
      ctx.arc(mapX(buoy.x), mapY(buoy.z), 2.6, 0, Math.PI * 2);
      ctx.fillStyle = "#ffe36e";
      ctx.fill();
    }

    // Les deux décisions lourdes doivent être anticipables : la sargasse ne
    // ressemble plus à une panne de commandes et la caisse peut être choisie
    // avant d'être déjà dépassée.
    ctx.save();
    for (const patch of this.sargasses ?? []) {
      if (!visible(patch.x, patch.z, patch.size + 4)) continue;
      const radiusX = Math.max(3, patch.size / xSpan * mapWidth);
      const radiusZ = Math.max(3, patch.size / zSpan * mapHeight);
      ctx.beginPath();
      ctx.ellipse(mapX(patch.x), mapY(patch.z), radiusX, radiusZ, patch.phase ?? 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(176,137,41,.52)";
      ctx.fill();
      ctx.strokeStyle = "rgba(239,205,87,.82)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    for (const pickup of this.pickups ?? []) {
      if (!pickup.active || !visible(pickup.x, pickup.z, 7)) continue;
      const x = mapX(pickup.x);
      const y = mapY(pickup.z);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = colorCss(pickup.color ?? 0x54f8ff);
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 7;
      ctx.fillRect(-3.6, -3.6, 7.2, 7.2);
      ctx.restore();
    }
    ctx.restore();

    const standings = this.minimapStandingScratch || (this.minimapStandingScratch = []);
    standings.length = 0;
    for (const boat of this.boats) standings.push(boat);
    standings.sort((a, b) => Number(a.eliminated) - Number(b.eliminated) || b.z - a.z);
    const place = Math.max(1, standings.indexOf(player) + 1);

    // Rivaux d'abord, joueur par-dessus : aucun marqueur ne peut cacher "TOI".
    for (const boat of this.boats) {
      if (boat === player || !visible(boat.x, boat.z)) continue;
      const x = mapX(boat.x);
      const y = mapY(boat.z);
      const color = colorCss(boat.color);
      ctx.save();
      ctx.globalAlpha = boat.eliminated ? 0.32 : 1;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(x, y, 6.5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(3,14,25,.92)";
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = color;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#ffffff";
      ctx.font = "800 9px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(boat.id + 1), x, y + 0.5);
      ctx.restore();
    }

    if (visible(player.x, player.z)) {
      const x = mapX(player.x);
      const y = mapY(player.z);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(player.dynamics?.heading ?? 0);
      ctx.shadowColor = "#ffe66d";
      ctx.shadowBlur = 11;
      ctx.beginPath();
      ctx.moveTo(0, -11);
      ctx.lineTo(7.5, 8);
      ctx.lineTo(0, 5);
      ctx.lineTo(-7.5, 8);
      ctx.closePath();
      ctx.fillStyle = "#ffe45f";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#23170a";
      ctx.stroke();
      ctx.restore();
    }

    // Vignette interne : elle fond la carte dans son panneau sans masque coûteux.
    const shade = ctx.createRadialGradient(width * 0.5, height * 0.48, width * 0.22, width * 0.5, height * 0.5, width * 0.72);
    shade.addColorStop(0, "rgba(1,10,20,0)");
    shade.addColorStop(1, "rgba(1,10,20,.52)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, width, height);

    const stormDistance = Math.max(0, player.z - this.stormZ);
    const remaining = this.tour ? Math.max(0, this.tourCourseLength() - player.z) : 0;
    const nearestPickup = this.nearestPickup?.(player, 150) ?? null;
    const pickupDistance = nearestPickup
      ? Math.round(Math.hypot(nearestPickup.x - player.x, nearestPickup.z - player.z))
      : 0;
    if (this.ui.minimapMode) this.ui.minimapMode.textContent = this.tour ? `ÉTAPE ${this.tour.stage + 1}/8` : `MANCHE ${this.round}`;
    if (this.ui.minimapStatus) {
      const position = player.eliminated ? `ÉLIMINÉ ${place}/${this.boats.length}` : `POSITION ${place}/${this.boats.length}`;
      const primary = this.tour
        ? `${position} · ARRIVÉE ${Math.round(remaining)} M`
        : `${position} · BRUME ${Math.round(stormDistance)} M`;
      this.ui.minimapStatus.textContent = nearestPickup
        ? `${primary} · CAISSE ${pickupDistance} M`
        : primary;
    }
    this.ui.minimap?.classList.toggle("storm-near", stormDistance < STORM_RANGE.hudProche);
  },

  applyTrainingHud(presentation) {
    const hud = this.ui?.hud;
    hud?.classList?.toggle?.("hud-training", presentation.active);
    for (let step = 0; step <= 2; step++) {
      hud?.classList?.toggle?.(`hud-training-step-${step}`, presentation.active && presentation.step === step);
    }
    hud?.setAttribute?.("data-training-active", String(presentation.active));
    hud?.setAttribute?.("data-training-step", presentation.active ? String(presentation.step) : "complete");
    hud?.setAttribute?.("data-training-systems", presentation.systems.join(" "));

    applyTrainingLock(this.ui?.bwa, "shift", presentation.shiftUnlocked);
    for (const weaponControl of [
      this.ui?.weaponSlot,
      this.ui?.weaponHold2,
      this.ui?.weaponCrate,
      this.ui?.weaponShortcuts
    ]) {
      applyTrainingLock(weaponControl, "weapons", presentation.weaponsUnlocked);
    }
    // Ces éléments possèdent déjà leur propre règle de visibilité. On expose
    // seulement le verrou : le CSS peut les filtrer sans que le HUD ne force
    // un réticule inactif à apparaître à la fin de l'initiation.
    applyTrainingLock(this.ui?.reticle, "weapons", presentation.weaponsUnlocked);
    applyTrainingLock(this.ui?.aimHelp, "weapons", presentation.weaponsUnlocked);
    applyTrainingLock(this.ui?.flowMeter ?? this.ui?.flowBar, "boost", presentation.boostUnlocked);
  },

  updateUI() {
    if (this.mode !== "playing") return;
    this.syncAudioSettings();
    const player = this.boats[0];
    const feedback = this.uiFeedback ??= {
      ammo: Object.create(null),
      weaponReady: Object.create(null)
    };
    const trainingHud = trainingHudPresentation(this.trainingMode, this.trainingGuide);
    // Après élimination (ou arrivée du Tour), les commandes ne peuvent plus
    // agir. Les laisser brillantes faisait croire à un bug de saisie et
    // surchargeait la caméra spectateur. L'état visuel suit donc l'autorité de
    // l'input : information de course conservée, commandes retirées.
    this.ui.hud?.classList.toggle(
      "spectator-controls-hidden",
      Boolean(player.eliminated || player.tourFinished)
    );
    const roundToken = this.tour
      ? `tour:${this.tour.stage}:${this.round}`
      : `${this.versusLocal ? "versus" : "combat"}:${this.round}`;
    if (feedback.roundToken !== roundToken) {
      restartUiCue(this.ui.roundLabel?.closest?.(".round-card"), "round-cue");
      feedback.roundToken = roundToken;
    }
    this.updateVersusHud?.();
    if (this.versusLocal) {
      this.ui.roundLabel.textContent = `MÊLÉE LOCALE · MANCHE ${this.round}`;
      if (this.ui.roundSub) {
        this.ui.roundSub.textContent = `J1 ${this.boats[0].score} · J2 ${this.boats[1].score} · PREMIER À ${CONFIG.targetScore}`;
      }
      const p1Score = this.boats[0].score;
      const p2Score = this.boats[1].score;
      this.ui.versusHud?.classList.toggle("p1-leading", p1Score > p2Score);
      this.ui.versusHud?.classList.toggle("p2-leading", p2Score > p1Score);
      this.ui.versusHud?.classList.toggle("score-tied", p1Score === p2Score);
      if (Number.isFinite(feedback.p1Score) && p1Score > feedback.p1Score) {
        restartUiCue(this.ui.versusP1Status?.closest?.(".versus-hud-player"), "score-cue");
      }
      if (Number.isFinite(feedback.p2Score) && p2Score > feedback.p2Score) {
        restartUiCue(this.ui.versusP2Status?.closest?.(".versus-hud-player"), "score-cue");
      }
      if (
        (Number.isFinite(feedback.p1Score) && p1Score !== feedback.p1Score)
        || (Number.isFinite(feedback.p2Score) && p2Score !== feedback.p2Score)
      ) {
        const announcer = this.ui.versusHud?.querySelector?.("#versusAnnouncer");
        if (announcer) announcer.textContent = `Score de la mêlée : joueur 1, ${p1Score}; joueur 2, ${p2Score}`;
      }
      feedback.p1Score = p1Score;
      feedback.p2Score = p2Score;
    } else if (this.tour) {
      this.ui.roundLabel.textContent = `ÉTAPE ${this.tour.stage + 1}/8`;
      if (this.ui.roundSub) {
        const remaining = Math.max(0, this.tourCourseLength() - player.z);
        let ahead = 0;
        for (const boat of this.boats) {
          if (boat === player) continue;
          if (boat.tourFinished || (!boat.eliminated && boat.z > player.z)) ahead++;
        }
        this.ui.roundSub.textContent = player.tourFinished ? "LIGNE FRANCHIE" : `${Math.round(remaining)} M · ${ahead + 1}E/4`;
      }
    } else {
      const trainingDevice = this.inputDevice === "touch"
        ? "touch"
        : this.inputDevice === "gamepad" ? "gamepad" : "keyboard";
      const trainingStepCopy = {
        keyboard: [
          "Q/D + ↑/↓ · BARRE + VOILE",
          "SHIFT · QUAND ELLE PENCHE",
          "ESPACE · TIRE COCO"
        ],
        touch: [
          "GLISSE · BARRE + VOILE",
          "BWA CENTRAL · QUAND ELLE PENCHE",
          "COCO · TOUCHE POUR TIRER"
        ],
        gamepad: [
          "STICK G · BARRE + VOILE",
          "B · QUAND ELLE PENCHE",
          "A · TIRE COCO"
        ]
      }[trainingDevice];
      this.ui.roundLabel.textContent = trainingHud.active
        ? `INITIATION ${trainingHud.step + 1}/3`
        : `MANCHE ${this.round}`;
      if (this.ui.roundSub) {
        this.ui.roundSub.textContent = trainingHud.active
          ? trainingStepCopy[trainingHud.step]
          : `KO +1 · DERNIER DEBOUT +2 · 1ER À ${CONFIG.targetScore}`;
      }
    }
    this.ui.timer.textContent = formatTime(this.roundTime);
    const speedKmh = Math.round(player.speed * 3.6);
    if (feedback.speedKmh !== speedKmh) this.ui.speed.textContent = speedKmh;
    feedback.speedKmh = speedKmh;
    const danger = clamp(Math.abs(player.roll) / 1.15, 0, 1);
    // Le remplissage absolu perdait l'information la plus importante : de quel
    // côté l'équipage doit se déplacer. Le pointeur conserve maintenant le
    // signe de la gîte et se déplace sur la vraie bwa du pack V8.
    const balanceTarget = clamp(player.roll / 1.15, -1, 1) * 50;
    const balanceNeedle = advanceBalanceNeedle(
      feedback.balanceNeedle ??= { position: 0, velocity: 0 },
      balanceTarget,
      0.08
    );
    const balanceOffset = balanceNeedle.position;
    setCssVariable(this.ui.balanceBar, "--balance-target", `${balanceTarget}%`);
    setCssVariable(this.ui.balanceBar, "--balance-offset", `${balanceOffset}%`);
    const balanceLoad = clamp(Math.abs(balanceTarget - balanceOffset) / 24, 0, 1);
    setCssVariable(this.ui.balanceBar, "--balance-load", String(balanceLoad));
    setCssVariable(this.ui.balanceBar, "--balance-glow", `${5 + balanceLoad * 8}px`);
    setCssVariable(this.ui.balanceBar, "--balance-trail-opacity", String(0.18 + balanceLoad * 0.56));
    const balanceSide = balanceTarget < -3 ? "Bâbord" : balanceTarget > 3 ? "Tribord" : "Centré";
    this.ui.balanceBar?.parentElement?.setAttribute?.("aria-valuenow", String(Math.round(balanceTarget)));
    this.ui.balanceBar?.parentElement?.setAttribute?.("aria-valuetext", balanceSide);
    const handling = handlingCue(player.dynamics, danger);
    const handlingMode = handling.mode;
    this.ui.balanceText.textContent = handling.label;
    const statusPanel = this.ui.balanceBar?.closest?.(".status");
    statusPanel?.classList.toggle("heel-port", balanceTarget < -3);
    statusPanel?.classList.toggle("heel-starboard", balanceTarget > 3);
    statusPanel?.classList.toggle("status-danger", danger > 0.55);
    statusPanel?.classList.toggle("status-critical", danger > 0.82);
    statusPanel?.classList.toggle("status-surf", handlingMode === "surf");
    statusPanel?.classList.toggle("status-drift", handlingMode === "drift");
    statusPanel?.classList.toggle("status-recover", handlingMode === "recover");
    this.ui.hud?.classList.toggle(
      "hud-focus",
      danger > 0.55
        || Boolean(this.input.aimActive)
        || (this.impact?.aftershock ?? 0) > 0.035
    );
    if (feedback.handlingMode !== undefined && feedback.handlingMode !== handlingMode) {
      restartUiCue(statusPanel, "handling-cue");
    }
    feedback.handlingMode = handlingMode;

    // FENÊTRE DE CONTRE-GÎTE.
    //
    // Elle existait depuis toujours dans la simulation — trois issues selon la
    // gîte, avec une pénalité de Flow si on appuie hors fenêtre — et RIEN à
    // l'écran ne la signalait. Un joueur pouvait donc perdre du Flow sans jamais
    // apprendre pourquoi, et conclure que la contre-gîte « ne sert à rien ».
    //
    // `shiftQuality()` est une fonction pure de la simulation : elle calcule ce
    // que rendrait un appui MAINTENANT sans rien écrire. Aucune autorité, aucun
    // effet sur le checksum.
    const shiftCue = player.dynamics.shiftQuality?.(this.shiftCueScratch || (this.shiftCueScratch = {}));
    if (this.ui.bwa && shiftCue) {
      const bwa = this.ui.bwa;
      const ouverte = shiftCue.state === "critical";
      // « MAINTENANT » n'est affiché que dans le vrai coeur de la fenêtre, pas
      // dès qu'elle s'ouvre : un repère qui reste allumé n'enseigne pas un timing.
      const parfait = ouverte && shiftCue.precision > 0.62;
      const disponibilite = ouverte
        ? clamp(0.22 + shiftCue.precision * 0.78, 0, 1)
        : shiftCue.state === "recovery"
          ? 0.52
          : clamp(shiftCue.roll / 0.34, 0, 1) * 0.5;
      setCssVariable(bwa, "--shift-meter", String(disponibilite));
      bwa.classList.toggle("shift-open", ouverte);
      bwa.classList.toggle("shift-perfect", parfait);
      bwa.classList.toggle("shift-recovery", shiftCue.state === "recovery");
      const small = bwa.querySelector?.("small");
      if (small) {
        const texte = parfait
          ? "MAINTENANT !"
          : ouverte
            ? (shiftCue.rollOffset < 0 ? "PRESQUE — LAISSE GÎTER" : "VITE, TU PARS TROP LOIN")
            : shiftCue.state === "recovery"
              ? "RATTRAPE LA DÉRIVE"
              // ⚠️ « BWA SHIFT » NOMME UNE TOUCHE QUI N'EXISTE PAS AU DOIGT.
              //
              // Les autres indices du HUD se déclinent déjà par appareil
              // (`controlHint`, les pas d'initiation). Celui-ci était resté en
              // dur : sur un téléphone, le bouton CONTRE-GÎTE annonçait un
              // raccourci clavier — et le libellé, trop long pour la tuile,
              // était rendu tronqué en « BWA SHIFT · A… ». Au doigt, la tuile
              // EST la commande : elle n'a pas à nommer de touche.
              : this.inputDevice === "touch"
                ? "ATTENDS LA GÎTE"
                : this.inputDevice === "gamepad"
                  ? "GÂCHETTE · ATTENDS LA GÎTE"
                  : "BWA SHIFT · ATTENDS LA GÎTE";
        if (small.textContent !== texte) small.textContent = texte;
      }
      if (feedback.shiftPerfect === false && parfait) restartUiCue(bwa, "ready-cue");
      feedback.shiftPerfect = parfait;
    }

    const flowMeter = this.ui.flowMeter ?? this.ui.flowBar?.parentElement ?? null;
    const boostSignal = this.boostHudFeedback;
    const signalSerial = boostSignal?.serial;
    const signalChanged = signalSerial !== undefined
      && signalSerial !== null
      && signalSerial !== feedback.boostHudSerial;
    const signalOutcome = boostSignal?.outcome === "confirmed" || boostSignal?.outcome === "rejected"
      ? boostSignal.outcome
      : null;
    const signalKind = boostSignal?.kind === "forward" || boostSignal?.kind === "lateral"
      ? boostSignal.kind
      : null;

    if (signalChanged) {
      feedback.boostHudSerial = signalSerial;
      if (signalKind) feedback.boostHudKind = signalKind;
      if (Number.isFinite(boostSignal?.cooldownTotal) && boostSignal.cooldownTotal > 0) {
        feedback.boostHudCooldownTotal = boostSignal.cooldownTotal;
      } else if (signalKind) {
        feedback.boostHudCooldownTotal = signalKind === "lateral"
          ? YOLE_HANDLING.lateralBoostCooldown
          : YOLE_HANDLING.boostCooldown;
      }

      // Le reflow ne sert qu'à réarmer une animation ponctuelle. Le `serial`
      // garantit qu'un même résultat conservé par le jeu ne la relance pas à
      // chaque rafraîchissement du HUD.
      if (flowMeter && signalOutcome) {
        if (feedback.boostHudCueTimer) {
          globalThis.clearTimeout?.(feedback.boostHudCueTimer);
          feedback.boostHudCueTimer = null;
        }
        flowMeter.classList?.remove?.("turbo-confirmed", "turbo-rejected");
        void flowMeter.offsetWidth;
        flowMeter.classList?.add?.(`turbo-${signalOutcome}`);
        setAttributeIfChanged(flowMeter, "data-boost-outcome", signalOutcome);
        setAttributeIfChanged(flowMeter, "data-boost-kind", signalKind ?? "none");
        if (signalOutcome === "rejected" && boostSignal?.reason) {
          setAttributeIfChanged(flowMeter, "data-reject-reason", boostSignal.reason);
        } else {
          flowMeter.removeAttribute?.("data-reject-reason");
        }
        const cueSerial = signalSerial;
        const cueTimer = globalThis.setTimeout?.(() => {
          if (feedback.boostHudSerial !== cueSerial) return;
          flowMeter.classList?.remove?.("turbo-confirmed", "turbo-rejected");
          flowMeter.removeAttribute?.("data-boost-outcome");
          feedback.boostHudCueTimer = null;
        }, 520);
        cueTimer?.unref?.();
        feedback.boostHudCueTimer = cueTimer ?? null;
      }
      if (signalOutcome === "rejected" && boostSignal?.reason === "flow") {
        feedback.boostHudNotice = signalKind === "lateral"
          ? "DASH : ÉLAN BAS"
          : "TURBO : ÉLAN BAS";
        feedback.boostHudNoticeUntil = (this.time ?? 0) + 1;
      }
    }

    const boostCooldown = Math.max(0, player.dynamics.boostCooldown ?? 0);
    const physicalBoostActive = (
      (player.dynamics.arcadeBoostForward ?? 0) > 0.015
      || (player.dynamics.arcadeBoostLateral ?? 0) > 0.015
    );
    const justConfirmed = signalChanged && signalOutcome === "confirmed";
    const rememberedKind = signalKind ?? feedback.boostHudKind ?? null;
    const inferredCooldownTotal = rememberedKind === "lateral"
      ? YOLE_HANDLING.lateralBoostCooldown
      : boostCooldown > YOLE_HANDLING.boostCooldown
        ? YOLE_HANDLING.lateralBoostCooldown
        : YOLE_HANDLING.boostCooldown;
    const elan = elanHudPresentation({
      flow: player.flow,
      cooldown: boostCooldown,
      cooldownTotal: feedback.boostHudCooldownTotal ?? inferredCooldownTotal,
      locked: !trainingHud.boostUnlocked,
      disabled: Boolean(player.eliminated || player.tourFinished),
      active: physicalBoostActive || justConfirmed
    });
    applyElanState(flowMeter, elan);
    const readyNow = elan.state === "ready";
    if (feedback.elanReady === false && readyNow) restartUiCue(flowMeter, "turbo-ready-cue");
    feedback.elanReady = readyNow;

    const activeKind = (player.dynamics.arcadeBoostLateral ?? 0) > (player.dynamics.arcadeBoostForward ?? 0)
      ? "lateral"
      : rememberedKind;
    const inputDevice = this.inputDevice === "touch"
      ? "touch"
      : this.inputDevice === "gamepad" ? "gamepad" : "keyboard";
    const controlHint = {
      keyboard: "F TURBO · X DASH",
      touch: "2× EAU · 2× JOYSTICK",
      gamepad: "RB TURBO · LB DASH"
    }[inputDevice];
    const heelRisk = (readyNow || elan.active) && Math.abs(player.roll ?? 0) >= 0.40;
    let flowHint = controlHint;
    if (elan.state === "locked") flowHint = "APRÈS L’INITIATION";
    else if (elan.state === "disabled") flowHint = "COMMANDES COUPÉES";
    else if (elan.active) {
      flowHint = activeKind === "lateral"
        ? "DASH · REPRENDS LA BARRE"
        : "POUSSÉE · REDRESSE APRÈS";
    } else if (elan.state === "cooldown") flowHint = "SOUFFLE DE L’ÉQUIPAGE";
    else if (elan.state === "low") flowHint = "SURF + CONTRE-GÎTE = ÉLAN";
    if ((feedback.boostHudNoticeUntil ?? -1) > (this.time ?? 0)) {
      flowHint = feedback.boostHudNotice;
    }
    setAttributeIfChanged(flowMeter, "data-heel-risk", heelRisk);
    if (this.ui.flowHint && feedback.flowHint !== flowHint) this.ui.flowHint.textContent = flowHint;
    if (this.ui.flowRisk) {
      const riskCopy = heelRisk ? "REDRESSE D’ABORD" : "";
      if (feedback.flowRisk !== riskCopy) this.ui.flowRisk.textContent = riskCopy;
      setAttributeIfChanged(this.ui.flowRisk, "aria-hidden", !heelRisk);
      feedback.flowRisk = riskCopy;
    }
    feedback.flowHint = flowHint;
    setAttributeIfChanged(
      flowMeter,
      "aria-valuetext",
      `${elan.ariaValueText}. ${flowHint}${heelRisk ? ". Redresse d’abord" : ""}.`
    );

    // Compatibilité avec le remplissage V8 actuel, qui lit encore la variable
    // sur l'enfant. Le nouveau contrat stable appartient au parent.
    setCssVariable(this.ui.flowBar, "--meter-level", String(elan.level));
    if (this.ui.flowState && feedback.flowState !== elan.text) {
      this.ui.flowState.textContent = elan.text;
    }
    const flowPercent = `${elan.percent}%`;
    if (this.ui.flowText && feedback.flowPercent !== elan.percent) {
      this.ui.flowText.textContent = flowPercent;
    }
    feedback.flowState = elan.text;
    feedback.flowPercent = elan.percent;
    this.ui.crewDots.textContent = CREW_DOTS[player.activeCrew] ?? CREW_DOTS[0];
    if (this.ui.trimText) {
      // L'écoute est désormais pilotable au clavier : la jauge doit dire non
      // seulement où elle est, mais dans quel sens elle travaille.
      const trim = this.input.trim ?? 0.82;
      const etat = trim > 0.90 ? "BORDÉE" : trim < 0.68 ? "CHOQUÉE" : "CROISIÈRE";
      this.ui.trimText.textContent = `VOILE ${Math.round(trim * 100)}% · ${etat}`;
    }
    this.ui.waterText.textContent = `${Math.round(player.water)} KG`;
    const structure = player.dynamics.structure;
    if (this.ui.hullBar) {
      setCssVariable(this.ui.hullBar, "--meter-level", String(clamp(structure.hull, 0, 1)));
      this.ui.hullBar.parentElement?.setAttribute?.("aria-valuenow", String(Math.round(clamp(structure.hull, 0, 1) * 100)));
    }
    if (this.ui.hullText) {
      const coque = Math.round(clamp(structure.hull, 0, 1) * 100);
      this.ui.hullText.textContent = `${coque}%`;
      // La coque est le SEUL élément qui ralentisse vraiment : on prévient au
      // moment où ça commence à coûter cher, pas quand c'est fini.
      this.ui.hullText.style.color = coque < 35 ? "#ff6b8a" : coque < 65 ? "#ffc531" : "";
    }
    const bwaIntegrity = clamp(structure.bwa.reduce((sum, value) => sum + value, 0) / structure.bwa.length, 0, 1);
    const bwaWeakest = clamp(Math.min(...structure.bwa), 0, 1);
    if (this.ui.mastBar) this.ui.mastBar.style.width = `${clamp(structure.mast, 0, 1) * 100}%`;
    if (this.ui.sailBar) this.ui.sailBar.style.width = `${clamp(structure.sail, 0, 1) * 100}%`;
    if (this.ui.bwaIntegrityBar) this.ui.bwaIntegrityBar.style.width = `${bwaIntegrity * 100}%`;
    const stormDistance = Math.max(0, player.z - this.stormZ);
    const diagnosticState = advanceHudDiagnostics(
      feedback.diagnostics ??= {},
      {
        hull: structure.hull,
        sail: Math.min(structure.mast, structure.sail),
        bwa: bwaWeakest,
        crew: player.activeCrew,
        water: player.water,
        danger: !player.eliminated && (danger > 0.55 || stormDistance < STORM_RANGE.hudDanger)
      },
      this.time ?? this.roundTime ?? 0
    );
    applyDiagnosticState(this.ui.hud, diagnosticState);
    applyDiagnosticState(statusPanel, diagnosticState);
    applyDiagnosticState(this.ui.systemIntegrity, diagnosticState);

    // Le rail Mât/Voile/BWA s'ouvre seulement lorsqu'un de ces systèmes vient
    // d'être touché, ou reste critique. Les classes posées sur le HUD permettent
    // au CSS de révéler en parallèle coque, équipage et eau selon la vraie cause.
    const secondaryRelevant = diagnosticState.visible && (
      diagnosticState.reasons.includes("sail")
      || diagnosticState.reasons.includes("bwa")
    );
    this.ui.systemIntegrity?.classList?.toggle?.("hidden", !secondaryRelevant);
    const liveWeather = this.atmosphere.weather;
    if (this.ui.weatherChip) {
      const label = liveWeather.stormAmount > 0.72 ? "🌪 BRUME TOTALE" : liveWeather.stormAmount > 0.38 ? "🌧 MER CROISÉE" : liveWeather.windSpeed > 11 ? "💨 ALIZÉS FORTS" : "☀ ALIZÉS STABLES";
      this.ui.weatherChip.textContent = `${label} · ${Math.round(liveWeather.windSpeed)} m/s`;
      this.ui.weatherChip.style.background = liveWeather.stormAmount > 0.5 ? "rgba(73,25,96,.82)" : "rgba(2,44,59,.72)";
    }
    this.updateGhostChip?.();
    this.ui.stormDistance.textContent = `${Math.round(stormDistance)} m`;
    this.ui.storm.classList.toggle("hidden", stormDistance > STORM_RANGE.hudProche || player.eliminated);
    // La musique suit le Grain. `Carnival Apocalypse` est la piste la plus dense
    // du lot à la mesure (RMS 0,205, 154 BPM) : elle n'a de sens que là.
    // Hystérésis 52/78 m — sans elle, un joueur qui oscille autour du seuil
    // déclencherait un fondu enchaîné toutes les deux secondes.
    if (this.mode === "playing" && !this.versusLocal) {
      const sousLeGrain = this.music?.scene === "grain";
      if (!sousLeGrain && stormDistance < STORM_RANGE.musiqueEntree && !player.eliminated) this.music?.setScene?.("grain");
      else if (sousLeGrain && (stormDistance > STORM_RANGE.musiqueSortie || player.eliminated)) {
        this.music?.setScene?.(this.tour ? "tour" : "course");
      }
    }
    // ── 3 · 2 · 1 · GO ───────────────────────────────────────────────────
    if (this.ui.countdown) {
      const reste = this.countdown ?? 0;
      const actif = reste > 0;
      this.ui.countdown.classList.toggle("hidden", !actif);
      if (actif) {
        // Au-dessus de COUNTDOWN_GO_SECONDS il reste des chiffres ; en dessous
        // c'est le GO, qui s'affiche pendant qu'on démarre déjà.
        const chiffres = reste - COUNTDOWN_GO_SECONDS;
        const texte = chiffres > 0 ? String(Math.ceil(chiffres)) : "GO";
        if (this.countdownTexte !== texte) {
          this.countdownTexte = texte;
          const gros = this.ui.countdown.querySelector?.("b");
          if (gros) gros.textContent = texte;
          const dessous = this.ui.countdown.querySelector?.("small");
          if (dessous) dessous.textContent = texte === "GO" ? "" : "TIENS BON LA BARRE";
          this.ui.countdown.classList.toggle("go", texte === "GO");
          // ⚠️ Le son est relancé À CHAQUE changement de chiffre, pas à chaque
          // image : ce bloc ne s'exécute que sur transition.
          this.audio?.play?.(texte === "GO" ? "turbo" : "buoy",
                             { gain: texte === "GO" ? 0.5 : 0.34, rate: texte === "GO" ? 1 : 1.3 });
          restartUiCue(this.ui.countdown, "countdown-tick");
        }
      } else this.countdownTexte = null;
    }

    // ── CAMÉRA FANTÔME ───────────────────────────────────────────────────
    // Éliminé, on se retrouvait derrière une autre yole sans rien qui l'explique.
    if (this.ui.spectateur) {
      const mort = Boolean(player.eliminated);
      const arrive = Boolean(this.tour && player.tourFinished);
      const spectating = mort || arrive;
      const tourResultReady = Boolean(this.tour && spectating && this.roundEnding > 0);
      let liveRivals = 0;
      for (const boat of this.boats) if (!boat.eliminated) liveRivals++;
      this.ui.spectateur.classList.toggle("hidden", !spectating);
      this.ui.skipSpectating?.classList?.toggle?.("hidden", !tourResultReady);
      this.ui.spectatorCycle?.classList?.toggle?.("hidden", !(mort && liveRivals > 1));
      this.ui.spectatorFast?.classList?.toggle?.(
        "hidden",
        !(mort && liveRivals > 0 && !this.playback && !this.versusLocal)
      );
      if (this.ui.spectatorFast) {
        this.ui.spectatorFast.textContent = this.spectatorFastForward ? "VITESSE ×1" : "FIN ×4";
        this.ui.spectatorFast.setAttribute?.("aria-pressed", String(Boolean(this.spectatorFastForward)));
      }
      if (spectating) {
        const titre = this.ui.spectateur.querySelector?.("b");
        if (titre) titre.textContent = arrive ? "ARRIVÉE FRANCHIE" : "ÉLIMINÉ";
        const suivi = this.cameraFollowName ?? null;
        const cible = this.ui.spectateur.querySelector?.("em");
        if (cible) cible.textContent = arrive
          ? "ÉTAPE TERMINÉE · LES RIVAUX FINISSENT"
          : `${player.eliminatedReason || "HORS COURSE"} · ${
              suivi ? `CAMÉRA SUR ${suivi}` : "CAMÉRA SUR TON ÉPAVE"
            }`;
        const bas = this.ui.spectateur.querySelector?.("small");
        if (bas) {
          bas.textContent = tourResultReady
            ? "RÉSULTATS PRÊTS · TU PEUX ÉCOURTER LE DÉLAI"
            : arrive
              ? "LES RIVAUX FINISSENT · CLASSEMENT EN COURS"
              : this.tour
                ? "ABANDON · ATTENDS LA FIN DE L'ÉTAPE"
                : liveRivals > 1
                  ? "ÉLIMINÉ · CHANGE DE CAMÉRA PENDANT LA FIN"
                  : "ÉLIMINÉ · DERNIER DUEL EN COURS";
        }
      }
    }

    this.updateMinimap(player);

    // L'arme active pilote le viseur. Les trois tuiles tactiles restent fixes :
    // deux armes de soute et l'arme de caisse portée.
    const weapon = this.activeWeapon(player);
    // ⚠️ LA TUILE 1 MONTRE SA SOUTE, PAS L'ARME ACTIVE. Elle affichait
    // `activeWeapon`, donc elle changeait de visage dès qu'on tirait autre
    // chose : trois tuiles fixes dont une qui bouge, on ne sait plus laquelle
    // fait quoi. Chaque tuile désigne son arme et ne la quitte jamais.
    const armeSoute1 = WEAPONS.find((e) => e.key === (player.loadout ?? [])[0]) ?? null;
    const gainedWeapons = new Set();
    for (const entry of WEAPONS) {
      const ammo = player.ammo?.[entry.key] ?? 0;
      const previous = feedback.ammo[entry.key];
      if (Number.isFinite(previous) && ammo > previous) gainedWeapons.add(entry.key);
      feedback.ammo[entry.key] = ammo;
    }
    if (this.ui.weaponSlot) {
      const slot = this.ui.weaponSlot;
      const weapon = armeSoute1;
      const ammo = weapon ? player.ammo[weapon.key] : 0;
      const cooldown = weapon ? player.cooldowns[weapon.key] : 0;
      // On garde la clé courante cote JEU, pas dans le DOM : relire un dataset
      // couple le HUD a l'implementation de l'element, et le mock de test n'en
      // a pas — c'est lui qui a attrape le defaut.
      if (this.weaponSlotKey !== (weapon?.key ?? "")) {
        this.weaponSlotKey = weapon?.key ?? "";
        for (const entry of WEAPONS) slot.classList.toggle(entry.cls, entry === weapon);
        if (this.ui.weaponSlotIco) this.ui.weaponSlotIco.className = `ico ${weapon?.ico ?? "i0"}`;
        if (this.ui.weaponSlotName) this.ui.weaponSlotName.textContent = weapon?.label ?? "SOUTE VIDE";
      }
      if (feedback.weaponKey !== undefined && feedback.weaponKey !== (weapon?.key ?? "")) {
        restartUiCue(slot, "weapon-changed");
      }
      if (weapon && gainedWeapons.has(weapon.key)) restartUiCue(slot, "charge-gained");
      feedback.weaponKey = weapon?.key ?? "";
      slot.classList.toggle("empty", !weapon);
      slot.classList.toggle("cooldown", !weapon || cooldown > 0);
      const cooldownDuration = weapon
        ? BALANCE.baseCooldowns[weapon.key] ?? BALANCE.cooldowns[weapon.key] ?? 1
        : 1;
      const cooldownRatio = weapon ? clamp(cooldown / cooldownDuration, 0, 1) : 0;
      setCssVariable(slot, "--cooldown-angle", `${cooldownRatio}turn`);
      const ready = Boolean(weapon) && cooldown <= 0 && !player.eliminated;
      if (weapon && feedback.weaponReady[weapon.key] === false && ready) restartUiCue(slot, "ready-cue");
      if (weapon) feedback.weaponReady[weapon.key] = ready;
      slot.setAttribute?.("aria-disabled", String(!ready));
      slot.setAttribute?.(
        "aria-label",
        !weapon
          ? "Soute vide"
          : `${weapon.label}, ${Number.isFinite(ammo) ? `${ammo} charge${ammo > 1 ? "s" : ""}` : "munitions illimitées"}, ${cooldown > 0 ? `recharge ${cooldown.toFixed(1)} secondes` : "prêt"}, Espace pour tirer`
      );
      if (this.ui.weaponSlotCd) {
        // Une arme de base n'a pas de compteur de charges : afficher « ×∞ »
        // ferait croire à une ressource. On dit PRÊT, et c'est tout.
        this.ui.weaponSlotCd.textContent = !weapon
          ? "—"
          : cooldown > 0 ? `${cooldown.toFixed(1)}s` : Number.isFinite(ammo) && ammo > 1 ? `×${ammo}` : "PRÊT";
      }
    }
    const shortcutNodes = this.ui.weaponShortcuts?.querySelectorAll?.("[data-weapon]") ?? [];
    for (let index = 0; index < shortcutNodes.length; index++) {
      const shortcut = shortcutNodes[index];
      const shortcutWeapon = WEAPONS[index];
      const ammo = shortcutWeapon ? player.ammo?.[shortcutWeapon.key] ?? 0 : 0;
      shortcut.classList.toggle("active", Boolean(shortcutWeapon) && player.activeWeapon === shortcutWeapon.key);
      shortcut.classList.toggle("disabled", ammo <= 0);
      if (shortcutWeapon && gainedWeapons.has(shortcutWeapon.key)) restartUiCue(shortcut, "charge-gained");
      shortcut.setAttribute?.(
        "aria-label",
        shortcutWeapon
          ? `${index + 1}, ${shortcutWeapon.label}, ${Number.isFinite(ammo) ? `${ammo} charge${ammo > 1 ? "s" : ""}` : "toujours disponible"}`
          : ""
      );
    }
    // ── LES DEUX AUTRES TUILES ───────────────────────────────────────────
    // La première (`weaponSlot`) garde son affichage détaillé plus haut ; ces
    // deux-là sont plus simples : l'icône, le nom, l'anneau de recharge et
    // l'état « vide ». Assez pour décider d'un coup d'œil, sans rien ajouter au
    // bruit du HUD.
    const peindreTuile = (element, entree) => {
      if (!element) return;
      const munition = entree ? player.ammo?.[entree.key] ?? 0 : 0;
      const dispo = Boolean(entree) && munition > 0;
      const recharge = entree ? player.cooldowns?.[entree.key] ?? 0 : 0;
      const duree = entree
        ? BALANCE.baseCooldowns[entree.key] ?? BALANCE.cooldowns[entree.key] ?? 1
        : 1;
      element.classList.toggle("empty", !dispo);
      element.classList.toggle("cooldown", !dispo || recharge > 0);
      setCssVariable(element, "--cooldown-angle", `${clamp(recharge / duree, 0, 1)}turn`);
      element.setAttribute?.("aria-disabled", String(!dispo || recharge > 0));
      // Les sous-éléments n'ont PAS d'identifiant : trois tuiles × trois enfants
      // auraient coûté neuf entrées dans `main.js`, dans six listes de mock et
      // dans `verify_static`, pour du texte que personne n'interroge.
      const icone = element.querySelector?.(".ico");
      if (icone) icone.className = `ico ${entree?.ico ?? "i0"}`;
      const nom = element.querySelector?.("b");
      if (nom) nom.textContent = entree?.label ?? "VIDE";
      const detail = element.querySelector?.("small");
      if (detail) {
        detail.textContent = !entree ? "—"
          : recharge > 0 ? `${recharge.toFixed(1)}s`
          : Number.isFinite(munition) ? `×${munition}` : "PRÊT";
      }
    };
    const soute = player.loadout ?? [];
    peindreTuile(this.ui.weaponHold2, WEAPONS.find((e) => e.key === soute[1]) ?? null);
    peindreTuile(this.ui.weaponCrate, this.crateWeapon?.(player) ?? null);

    // Le viseur suit l'arme de soute. Les trois silhouettes raster ont une
    // grammaire distincte : verrouillage, tir tendu/conique et pose de zone.
    // L'information critique reste du texte DOM pour l'accessibilite.
    if (this.ui.reticle) {
      const cooldown = weapon ? player.cooldowns[weapon.key] : Infinity;
      const ready = Boolean(weapon) && cooldown <= 0 && !player.eliminated;
      const aim = clamp(this.input.aim ?? 0, -1, 1);
      const aiming = Boolean(this.input.aimActive) && Boolean(weapon) && !player.eliminated;
      const aimDegrees = Math.round(aim * AIM_MAX_RADIANS * 180 / Math.PI);
      let mode = "";
      let label = "";
      let target = null;
      if (ready && weapon.key === "harpoon") {
        mode = "harpoon";
        // ⚠️ LE VISEUR MENTAIT. Il utilisait `findAimedTarget`, un test de
        // CÔNE, alors que le tir utilise `raycastHarpoon`, un COULOIR de
        // 3,2 m de large. Le réticule annonçait donc « VERROUILLÉ » sur des
        // cibles que le harpon manquait, et restait muet sur des cibles qu'il
        // touchait. Maintenant il interroge exactement la même fonction que le tir.
        target = this.raycastHarpoon ? this.raycastHarpoon(player) : null;
        label = target ? "HARPON ALIGNÉ" : "HARPON — VISE UNE COQUE";
      } else if (ready && weapon.key === "wave") {
        mode = "cannon";
        target = this.findAimedTarget(player, BALANCE.coconut.speed * BALANCE.coconut.life, 0.42);
        label = target ? "COCO — CIBLE ALIGNÉE" : "COCO — VISE DROIT";
      } else if (ready && weapon.key === "lanbi") {
        mode = "cannon";
        target = this.findAimedTarget(player, BALANCE.lanbi.range, Math.cos(BALANCE.lanbi.halfAngle));
        label = target ? "KONK — CIBLE DANS LE CÔNE" : "KONK — CÔNE DE SOUFFLE";
      } else if (ready && weapon.key === "pwason") {
        mode = "cannon";
        target = this.findAimedTarget(player, BALANCE.pwason.speed * BALANCE.pwason.life, 0.5);
        label = target ? "PWASON — CIBLE ACQUISE" : "PWASON — RECHERCHE";
      } else if (ready && ["mine", "barik", "chadron"].includes(weapon.key)) {
        mode = "mine";
        label = weapon.key === "chadron" ? "CHADRON — PIÈGE DEVANT" : `${weapon.key === "barik" ? "BARIK" : "MINE"} — LARGAGE ARRIÈRE`;
      }
      if (aiming) {
        if (!mode) mode = ["mine", "barik", "chadron"].includes(weapon.key) ? "mine" : weapon.key === "harpoon" ? "harpoon" : "cannon";
        const signedDegrees = aimDegrees > 0 ? `+${aimDegrees}` : String(aimDegrees);
        const hausseTexte = Math.abs(this.input.aimPitch ?? 0) < 0.12
          ? ""
          : (this.input.aimPitch > 0 ? " · CLOCHE" : " · TENDU");
        label = ready
          ? `VISÉE ${signedDegrees}°${hausseTexte} · RELÂCHE POUR TIRER`
          : `VISÉE ${signedDegrees}°${hausseTexte} · ARME EN RECHARGE`;
      }
      const visible = aiming || (Boolean(mode) && (mode !== "harpoon" || Boolean(target)));
      this.ui.reticle.style.left = `${50 + aim * 24}%`;
      // La hausse doit se VOIR, sinon le joueur règle une cloche à l'aveugle.
      // Le viseur monte quand on lobe, descend quand on tend le tir.
      const hausse = clamp(this.input.aimPitch ?? 0, -1, 1);
      this.ui.reticle.style.top = `${42 - hausse * 13}%`;
      this.ui.reticle.classList.toggle("hidden", !visible);
      for (const name of ["harpoon", "cannon", "mine"]) this.ui.reticle.classList.toggle(`reticle-${name}`, visible && mode === name);
      this.ui.reticle.classList.toggle("has-target", Boolean(target));
      this.ui.reticle.classList.toggle("aim-active", aiming);
      if (aiming && feedback.aiming !== true) {
        restartUiCue(this.ui.reticle, "aim-enter-cue");
        restartUiCue(this.ui.aimHelp, "aim-enter-cue");
      }
      if (target && feedback.aimTarget !== true) restartUiCue(this.ui.reticle, "target-cue");
      feedback.aiming = aiming;
      feedback.aimTarget = Boolean(target);
      if (this.ui.reticleLabel) this.ui.reticleLabel.textContent = label;
      this.ui.reticle.setAttribute?.("aria-label", label || "Viseur inactif");
      if (this.ui.aimHelp) {
        this.ui.aimHelp.classList.toggle("active", aiming);
        this.ui.aimHelp.textContent = aiming
          ? label
          : "VISÉE · CLIC DROIT OU 2E DOIGT · GLISSER · RELÂCHER";
      }
    }
    this.applyTrainingHud?.(trainingHud);
    this.updateLeaderboard();

    if (this.ui.perf) {
      const info = this.lastRenderStats || { calls: 0, triangles: 0 };
      const wake = this.ocean.wake.energy();
      const activeDebris = this.debris.items.reduce((sum, item) => sum + (item.active ? 1 : 0), 0);
      this.ui.perf.textContent = `${this.qualityProfile.label} · ${this.quality.frameAverage.toFixed(1)} ms · ${info.calls ?? 0} DC · ${info.triangles ?? 0} tris · wake ${wake.toFixed(3)} · debris ${activeDebris} · ${checksumBoats(this.dynamicsList())}`;
    }
  }
};
