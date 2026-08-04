// Entrées : manette, actions du joueur, zoom, liaison des contrôles de l'UI.
//
// Les actions passent par le même masque de bits que les replays, afin qu'une
// relecture rejoue exactement ce que le joueur a déclenché.

import { clamp } from "../core/math.js";
import { downloadReplay } from "../sim/replay.js";
import { YOLE_HANDLING } from "../sim/yole-physics.js";
import { SPELL_VFX } from "../render/vfx.js";
import { openTourHub } from "./tour-hub.js";
import { openReplayLibrary } from "./replay-library.js";
import { openInfoHub } from "./info-hub.js";
import {
  CREW_KITS, DEFAULT_CUSTOMIZATION, GUNWALE_ACCENTS, HULL_PAINTS,
  WOOD_FINISHES, normalizeCustomization
} from "./customization.js";
import {
  ACTION_BOOST_FORWARD, ACTION_BOOST_LATERAL, ACTION_RHUM, ACTION_HARPOON,
  ACTION_MINE, ACTION_SHIFT, ACTION_WAVE, ACTION_BARIK,
  ACTION_CHADRON, ACTION_LANBI, ACTION_PWASON, AI_LEVELS, WEAPONS, RIGS,
  SAIL_LIVERIES, TOUR_STAGES, ZOOM_MAX, ZOOM_MIN, CRATE_WEAPONS,
  LOADOUT_POOL, resolveLoadout, COUNTDOWN_SECONDS, COUNTDOWN_GO_SECONDS,
  trainingActionMask
} from "./balance.js";

// Écoute de voile au clavier.
//
// `min` est calé sur `YOLE_HANDLING.trimFeathered` (0,58) : c'est là que la
// poussée tombe à 24 % et que le frein de choque est plein. `max` à 1,0 est le
// plein bord. `cruise` (0,82) est la valeur que le clavier imposait AVANT, en
// dur : la yole y démarre donc exactement comme avant, et rien n'est perdu pour
// qui ne touche jamais aux flèches.
//
// La rampe est en unités PAR TICK FIXE, pas par image : l'accélérateur doit
// donner le même résultat à 30, 60 et 144 Hz, et surtout être rejouable.
export const KEYBOARD_TRIM = Object.freeze({
  min: 0.58,
  max: 1.0,
  cruise: 0.82,
  borderRate: 0.85,
  easeRate: 1.30,
  returnRate: 0.42
});

// Fenêtre du double-tap de barre qui déclenche le Bwa Dash, en millisecondes.
// 260 ms : au-delà, deux corrections de cap successives seraient prises pour un
// dash ; en deçà, il faut taper trop vite pour que ce soit jouable au clavier.
export const DASH_DOUBLE_TAP_MS = 260;
// Équivalent TACTILE du double-tap A/D, sur le joystick.
//
// ⚠️ Fenêtre plus large que celle du clavier (260 ms) : pousser deux fois un
// joystick au pouce est plus lent que taper deux fois une touche. À 260 ms le
// geste échouait presque toujours.
export const JOY_DASH_DOUBLE_TAP_MS = 340;
// Fraction de la course du joystick au-delà de laquelle on compte une poussée.
// Sous ce seuil, on barre ; au-dessus, on peut armer un dash.
export const JOY_DASH_THRESHOLD = 0.55;

export const AIM_MAX_RADIANS = Math.PI * 22 / 180;

// Débattement VERTICAL de la visée, en multiplicateur de vitesse ascensionnelle.
// À ±0,80 le coco part entre 20 % et 180 % de sa hausse nominale : tir tendu
// rasant vers le bas, cloche haute vers le haut.
//
// ⚠️ Les angles extrêmes sont ASSUMÉS, y compris ceux qu'aucun lanceur réel ne
// produirait — c'est un choix de jeu explicite. Le tir doit rester expressif,
// pas plausible.
export const AIM_PITCH_RANGE = 0.80;
const AIM_DRAG_VIEWPORT_RATIO = 0.28;
const AIM_DRAG_MIN_PX = 100;
const AIM_DRAG_MAX_PX = 240;

const isInteractiveKeyTarget = (target) => Boolean(target?.closest?.(
  "button,input,select,textarea,a[href],[contenteditable='true']"
));

const CONTROL_DEVICES = Object.freeze(["keyboard", "touch", "gamepad"]);
const LOADOUT_DETAILS = Object.freeze({
  wave: "COCO BOUM · impact direct et vague de recul",
  harpoon: "SPIDER HARPON · accroche puis slingshot",
  mine: "MINE TSUNAMI · piège arrière et onde circulaire",
  rhum: "RHUM · boost risqué pour renverser une poursuite"
});
const LOADOUT_GLYPHS = Object.freeze({ wave: "🥥", harpoon: "🕸", mine: "🌊", rhum: "🍹" });
const WORKSHOP_PART_LABELS = Object.freeze({
  paint: "COQUE & BORDAGE",
  sail: "VOILE & LIVRÉE",
  wood: "BWA & GRÉEMENT",
  crew: "ÉQUIPAGE",
  rig: "PROFIL DE GRÉEMENT",
  loadout: "SOUTE & ARMEMENT"
});
const WORKSHOP_SETTING_KEYS = Object.freeze([
  "hullColor", "accentColor", "woodFinish", "crewKit", "sailLivery", "rig", "loadout"
]);
const cssHex = (value) => `#${Math.max(0, Number(value) || 0).toString(16).padStart(6, "0").slice(-6)}`;
const BOOST_FLOW_THRESHOLD = Object.freeze({
  forward: 0.16,
  lateral: 0.22
});

export const InputSystems = {
  trainingBasicsLocked() {
    return Boolean(
      this.trainingMode
      && this.trainingGuide
      && !this.trainingGuide.advancedUnlocked
    );
  },

  allowedTrainingActionMask(actions) {
    return this.trainingMode
      ? trainingActionMask(this.trainingGuide, actions)
      : (Number.isInteger(actions) ? actions >>> 0 : 0);
  },

  publishBoostHudFeedback(kind, outcome, reason = null) {
    const previousSerial = Number.isSafeInteger(this.boostHudFeedbackSerial)
      ? this.boostHudFeedbackSerial
      : Number.isSafeInteger(this.boostHudFeedback?.serial)
        ? this.boostHudFeedback.serial
        : 0;
    const serial = previousSerial + 1;
    const nominalCooldown = kind === "lateral"
      ? YOLE_HANDLING.lateralBoostCooldown
      : YOLE_HANDLING.boostCooldown;
    // Le verrou est partagé. Après un Dash, une tentative de Turbo doit encore
    // annoncer un total de 15 s, pas recalculer son anneau sur les 10 s propres
    // au Turbo. La dernière confirmation physique est la source d'autorité.
    const activeCooldown = (
      reason === "cooldown"
      && (
        this.boostHudCooldownTotal === YOLE_HANDLING.boostCooldown
        || this.boostHudCooldownTotal === YOLE_HANDLING.lateralBoostCooldown
      )
    ) ? this.boostHudCooldownTotal : nominalCooldown;
    if (outcome === "confirmed") this.boostHudCooldownTotal = nominalCooldown;
    this.boostHudFeedbackSerial = serial;
    this.boostHudFeedback = Object.freeze({
      serial,
      outcome,
      kind,
      reason: outcome === "confirmed" ? null : reason,
      cooldownTotal: activeCooldown
    });
    return this.boostHudFeedback;
  },

  boostRejectionReason(boat, kind) {
    if (!boat || boat.eliminated) return "eliminated";
    const dynamics = boat.dynamics ?? boat;
    if ((dynamics.boostCooldown ?? 0) > 0) return "cooldown";
    const flow = Number.isFinite(boat.flow)
      ? boat.flow
      : Number.isFinite(dynamics.flow)
        ? dynamics.flow
        : 0;
    if (flow < BOOST_FLOW_THRESHOLD[kind]) return "flow";
    // La physique peut refuser pour un garde futur que l'input ne connaît pas
    // encore. Il doit rester visible comme verrou, jamais comme faux succès.
    return "locked";
  },

  // Pendant une relecture, seul le replay a le droit de piloter. Les handlers de
  // l'UI, le clavier et la manette restaient actifs et mutaient directement les
  // dynamics : la relecture divergeait de l'enregistrement dès qu'on touchait un
  // bouton. Le garde `isApplyingReplay` ne protégeait que l'ENREGISTREMENT du
  // bit, pas la mutation physique.
  playerInputLocked() {
    // ⚠️ Le rebours verrouille AUSSI. Sans ça on pourrait tirer et border
    // pendant le 3-2-1 : les entrées seraient acceptées alors que la
    // simulation est gelée, et elles partiraient toutes d'un coup sur le GO.
    return Boolean(this.paused)
      || this.countdown > 0
      || Boolean(this.tour && this.boats?.[0]?.tourFinished)
      || (Boolean(this.playback) && !this.isApplyingReplay);
  },

  applyPendingPlayerActions() {
    // Après la ligne, le joueur devient spectateur : aucune action nouvellement
    // injectée (DOM, manette ou outil externe) ne doit encore toucher les IA.
    if (!this.playback && this.tour && this.boats?.[0]?.tourFinished) {
      this.input.actions = 0;
      this.pendingBoostHudAttemptMask = 0;
      return false;
    }
    this.applyActionMask(this.input.actions);
    return true;
  },

  controlledInputFor(boat) {
    if (!this.playback && this.tour && boat?.isPlayer && boat.tourFinished) {
      return this.finishedTourInput ??= {
        steer: 0,
        trim: KEYBOARD_TRIM.min,
        aim: 0,
        aimPitch: 0,
        aimActive: false,
        actions: 0
      };
    }
    return this.input;
  },

  collectExtendedUI() {
    const byId = (id) => globalThis.document?.getElementById?.(id) ?? null;
    Object.assign(this.ui, {
      menuSettings: byId("menuSettingsBtn"),
      controlsBtn: byId("controlsBtn"),
      replaysBtn: byId("replaysBtn"),
      aboutBtn: byId("aboutBtn"),
      challengeBanner: byId("challengeBanner"),
      challengeBannerLabel: byId("challengeBannerLabel"),
      challengeSeed: byId("challengeSeed"),
      challengeStart: byId("challengeStartBtn"),
      dailyChallenge: byId("dailyChallengeBtn"),
      shareChallenge: byId("shareChallengeBtn"),
      shareStatus: byId("shareStatus"),
      endInstall: byId("endInstallBtn"),
      pauseControls: byId("pauseControlsBtn"),
      resetSettings: byId("resetSettingsBtn"),
      controlsScreen: byId("controlsScreen"),
      controlsClose: byId("controlsCloseBtn"),
      replayOnboarding: byId("replayOnboardingBtn"),
      onboardingScreen: byId("onboardingScreen"),
      onboardingNext: byId("onboardingNextBtn"),
      onboardingSkip: byId("onboardingSkipBtn"),
      onboardingProgress: byId("onboardingProgress"),
      leaveScreen: byId("leaveScreen"),
      leaveCancel: byId("leaveCancelBtn"),
      leaveConfirm: byId("leaveConfirmBtn"),
      pauseMenu: byId("pauseMenuBtn"),
      endMenu: byId("endMenuBtn"),
      skipSpectating: byId("skipSpectatingBtn"),
      spectatorCycle: byId("spectateurCycleBtn"),
      spectatorFast: byId("spectateurFastBtn"),
      musicVolume: byId("musicVolumeSlider"),
      musicVolumeValue: byId("musicVolumeValue"),
      sfxVolume: byId("sfxVolumeSlider"),
      sfxVolumeValue: byId("sfxVolumeValue"),
      pauseStateLabel: byId("pauseStateLabel"),
      pauseIcon: byId("pauseIcon"),
      loadoutChoices: byId("loadoutChoices"),
      loadoutDetail: byId("loadoutDetail"),
      hullChoices: byId("hullChoices"),
      accentChoices: byId("accentChoices"),
      woodChoices: byId("woodChoices"),
      crewChoices: byId("crewChoices"),
      customCancel: byId("customCancelBtn"),
      customReset: byId("customResetBtn"),
      menuWorkshop: byId("menuWorkshopBtn"),
      menuBuildTitle: byId("menuBuildTitle"),
      menuBuildCopy: byId("menuBuildCopy"),
      menuHullSwatch: byId("menuHullSwatch"),
      menuAccentSwatch: byId("menuAccentSwatch"),
      menuCrewSwatch: byId("menuCrewSwatch"),
      menuLoadoutIcons: byId("menuLoadoutIcons"),
      menuLoadoutCopy: byId("menuLoadoutCopy"),
      workshopOrbitZone: byId("workshopOrbitZone"),
      workshopRotateLeft: byId("workshopRotateLeftBtn"),
      workshopRotateRight: byId("workshopRotateRightBtn"),
      workshopPartLabel: byId("workshopPartLabel"),
      workshopSummary: byId("workshopSummary"),
      workshopSummaryDetail: byId("workshopSummaryDetail"),
      rigPowerBar: byId("rigPowerBar"),
      rigPowerValue: byId("rigPowerValue"),
      rigStabilityBar: byId("rigStabilityBar"),
      rigStabilityValue: byId("rigStabilityValue")
    });
    this.ui.controlTabs = [...(globalThis.document?.querySelectorAll?.("[data-control-device]") ?? [])];
    this.ui.controlPanels = [...(globalThis.document?.querySelectorAll?.("[data-control-panel]") ?? [])];
    this.ui.onboardingSteps = [...(globalThis.document?.querySelectorAll?.("[data-onboarding-step]") ?? [])];
    this.ui.onboardingDots = [...(globalThis.document?.querySelectorAll?.(".onboarding-dots i") ?? [])];
    this.ui.customTabs = [...(globalThis.document?.querySelectorAll?.("[data-custom-tab]") ?? [])];
    this.ui.customPanels = [...(globalThis.document?.querySelectorAll?.("[data-custom-panel]") ?? [])];
  },

  setInputDevice(device) {
    const next = CONTROL_DEVICES.includes(device) ? device : "keyboard";
    if (this.inputDevice === next && this.uiDeviceApplied) return next;
    this.inputDevice = next;
    this.uiDeviceApplied = true;
    const body = globalThis.document?.body;
    for (const candidate of CONTROL_DEVICES) body?.classList?.toggle?.(`input-${candidate}`, candidate === next);
    for (const tab of this.ui?.controlTabs ?? []) {
      const active = tab.dataset?.controlDevice === next;
      tab.classList?.toggle?.("active", active);
      tab.setAttribute?.("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    }
    for (const panel of this.ui?.controlPanels ?? []) {
      panel.classList?.toggle?.("hidden", panel.dataset?.controlPanel !== next);
    }
    const aimCopy = {
      keyboard: "VISÉE · CLIC DROIT · GLISSER · RELÂCHER",
      touch: "VISÉE · GARDE LA BARRE + 2E DOIGT · GLISSER · RELÂCHER",
      gamepad: "VISÉE · STICK DROIT · A POUR TIRER"
    }[next];
    if (this.ui?.aimHelp) this.ui.aimHelp.textContent = aimCopy;
    const joyCopy = this.ui?.joystick?.querySelector?.(":scope > span");
    if (joyCopy) joyCopy.textContent = next === "touch" ? "GLISSE ICI OU SUR L’EAU" : "JOYSTICK TACTILE";
    return next;
  },

  handleControlTabKey(event, tab) {
    const key = event?.key;
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(key)) return false;
    const tabs = [...(this.ui?.controlTabs ?? [])];
    const index = tabs.indexOf(tab);
    if (index < 0 || !tabs.length) return false;
    let nextIndex = index;
    if (key === "Home") nextIndex = 0;
    else if (key === "End") nextIndex = tabs.length - 1;
    else nextIndex = (index + (key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    const next = tabs[nextIndex];
    event.preventDefault?.();
    this.setInputDevice(next?.dataset?.controlDevice);
    next?.focus?.();
    return true;
  },

  preferredInputDevice() {
    const pads = typeof navigator !== "undefined" ? navigator.getGamepads?.() : null;
    if (pads && [...pads].some((pad) => pad?.connected)) return "gamepad";
    if (globalThis.matchMedia?.("(pointer:coarse)")?.matches) return "touch";
    return "keyboard";
  },

  openControls(returnFocus = null) {
    const screen = this.ui?.controlsScreen;
    if (!screen) return false;
    this.controlsReturnFocus = returnFocus || globalThis.document?.activeElement || this.ui.controlsBtn;
    this.setInputDevice(this.inputDevice || this.preferredInputDevice());
    screen.classList.remove("hidden");
    this.ui.controlsBtn?.setAttribute?.("aria-expanded", "true");
    const activeTab = (this.ui.controlTabs ?? []).find((tab) => tab.dataset?.controlDevice === this.inputDevice);
    activeTab?.focus?.();
    return true;
  },

  closeControls({ restoreFocus = true } = {}) {
    if (!this.ui?.controlsScreen) return false;
    this.ui.controlsScreen.classList.add("hidden");
    this.ui.controlsBtn?.setAttribute?.("aria-expanded", "false");
    if (restoreFocus) this.controlsReturnFocus?.focus?.();
    this.controlsReturnFocus = null;
    return true;
  },

  updateOnboardingStep(index = 0) {
    const steps = this.ui?.onboardingSteps ?? [];
    if (!steps.length) return false;
    this.onboardingStep = clamp(index | 0, 0, steps.length - 1);
    steps.forEach((step, stepIndex) => step.classList?.toggle?.("hidden", stepIndex !== this.onboardingStep));
    (this.ui.onboardingDots ?? []).forEach((dot, stepIndex) => dot.classList?.toggle?.("active", stepIndex === this.onboardingStep));
    if (this.ui.onboardingProgress) {
      this.ui.onboardingProgress.textContent = steps.length === 1
        ? "3 GESTES"
        : `${this.onboardingStep + 1} / ${steps.length}`;
    }
    if (this.ui.onboardingNext) this.ui.onboardingNext.textContent = this.onboardingStep === steps.length - 1
      ? (this.pendingOnboardingStart ? "À L’EAU !" : "TERMINER")
      : "SUIVANT";
    if (this.ui.onboardingSkip) {
      this.ui.onboardingSkip.textContent = this.pendingOnboardingStart ? "PASSER & JOUER" : "FERMER";
    }
    return true;
  },

  openOnboarding(startCallback = null, returnFocus = null) {
    if (!this.ui?.onboardingScreen) {
      startCallback?.();
      return false;
    }
    this.pendingOnboardingStart = typeof startCallback === "function" ? startCallback : null;
    this.onboardingReturnFocus = returnFocus || globalThis.document?.activeElement || this.ui.play;
    this.setInputDevice(this.inputDevice || this.preferredInputDevice());
    this.updateOnboardingStep(0);
    this.ui.onboardingScreen.classList.remove("hidden");
    this.ui.onboardingNext?.focus?.();
    return true;
  },

  finishOnboarding({ completed = true } = {}) {
    if (!this.ui?.onboardingScreen) return false;
    const callback = this.pendingOnboardingStart;
    const returnFocus = this.onboardingReturnFocus;
    this.pendingOnboardingStart = null;
    this.onboardingReturnFocus = null;
    this.ui.onboardingScreen.classList.add("hidden");
    if (completed) this.settings?.set?.("onboardingSeen", true);
    if (completed && callback) callback();
    else returnFocus?.focus?.();
    return true;
  },

  startWithOnboarding(callback) {
    if (globalThis.__YOLE_DEBUG_ENABLE__ || this.settings?.get?.("onboardingSeen")) {
      callback?.();
      return false;
    }
    return this.openOnboarding(callback);
  },

  requestReturnToMenu(returnFocus = null) {
    if (!this.ui?.leaveScreen) return false;
    this.leaveReturnFocus = returnFocus || globalThis.document?.activeElement;
    const copy = globalThis.document?.getElementById?.("leaveCopy");
    if (copy) {
      copy.textContent = this.playback
        ? "La relecture est terminée. Tu reviens choisir un mode sans modifier la progression."
        : this.tour
          ? this.tourPersistenceAvailable === false
            ? "Cette étape s’arrête ici. Le stockage local est indisponible : cette progression sera perdue en quittant."
            : "Cette étape s’arrête ici. Ta progression du Tour déjà sauvegardée restera disponible."
        : this.mode === "ended"
          ? "Le résultat reste enregistré, puis tu reviens choisir un mode."
          : "La manche en cours s’arrête ici et tu reviens choisir un mode.";
    }
    const pauseVisible = this.ui?.pause
      && !this.ui.pause.classList?.contains?.("hidden");
    this.leavePausedUnderlying = Boolean(pauseVisible);
    if (pauseVisible) {
      this.ui.pause.setAttribute?.("aria-hidden", "true");
      this.ui.pause.inert = true;
    }
    this.ui.leaveScreen.classList.remove("hidden");
    this.ui.leaveCancel?.focus?.();
    return true;
  },

  cancelReturnToMenu() {
    if (!this.ui?.leaveScreen) return false;
    this.ui.leaveScreen.classList.add("hidden");
    if (this.leavePausedUnderlying && this.ui?.pause) {
      this.ui.pause.removeAttribute?.("aria-hidden");
      this.ui.pause.inert = false;
    }
    this.leaveReturnFocus?.focus?.();
    this.leaveReturnFocus = null;
    this.leavePausedUnderlying = false;
    return true;
  },

  returnToMenu() {
    if (this.tour && this.mode === "playing" && !this.playback) this.saveTourProgress?.("active");
    this.mode = "menu";
    this.paused = false;
    this.playback = null;
    this.tour = null;
    this.setVersusMode?.(false);
    this.clearLiveInput();
    this.audio?.stopBeds?.();
    this.music?.setScene?.("menu");
    this.ui?.pause?.removeAttribute?.("aria-hidden");
    if (this.ui?.pause) this.ui.pause.inert = false;
    for (const screen of [
      this.ui?.leaveScreen,
      this.ui?.pause,
      this.ui?.end,
      this.ui?.customScreen,
      this.ui?.controlsScreen,
      this.ui?.onboardingScreen,
      this.ui?.versusScreen
    ]) screen?.classList?.add?.("hidden");
    this.ui?.hud?.classList?.add?.("hidden");
    this.ui?.versusHud?.classList?.add?.("hidden");
    this.ui?.rotate?.classList?.add?.("hidden");
    this.ui?.menu?.classList?.remove?.("hidden");
    this.ui?.pauseBtn?.setAttribute?.("aria-expanded", "false");
    this.ui?.settingsBtn?.setAttribute?.("aria-expanded", "false");
    this.settingsFromMenu = false;
    this.workshopActive = false;
    this.workshopMenuWasVisible = false;
    this.pauseReason = null;
    this.resumeCountdownPending = false;
    this.leaveReturnFocus = null;
    this.leavePausedUnderlying = false;
    for (const control of [this.ui?.customBtn, this.ui?.versusBtn, this.ui?.menuSettings, this.ui?.settingsBtn, this.ui?.pauseBtn]) {
      control?.setAttribute?.("aria-expanded", "false");
    }
    const root = globalThis.document?.documentElement;
    if (root?.dataset) delete root.dataset.tourStage;
    root?.style?.removeProperty?.("--tour-accent");
    this.resize?.();
    this.ui?.play?.focus?.();
    return true;
  },

  hasBlockingMenuDialog({ includePause = true } = {}) {
    const blockingScreen = [
      includePause ? this.ui?.pause : null,
      this.ui?.customScreen,
      this.ui?.controlsScreen,
      this.ui?.onboardingScreen,
      this.ui?.leaveScreen
    ].some((screen) => screen
      && screen.hidden !== true
      && !screen.classList?.contains?.("hidden"));
    if (blockingScreen) return true;
    // Tour, replayothèque et À propos sont créés à la demande et ne vivent pas
    // dans `ui`. Leur attribut `open` est la source de vérité native.
    return Boolean(globalThis.document?.querySelector?.("dialog[open]"));
  },

  activatePrimaryAction() {
    // Start ne doit jamais activer le CTA situé sous une confirmation ou une
    // aide. Le garde vaut aussi sur l'écran de résultats : auparavant,
    // « Retour au port ? » restait visible pendant qu'une revanche démarrait.
    if (this.hasBlockingMenuDialog()) return false;
    if (this.mode === "ended") {
      if (typeof this.ui?.rematch?.onclick === "function") this.ui.rematch.onclick();
      else if (this.versusLocal) this.startVersusMatch?.();
      else if (this.tour && this.tour.stage + 1 < TOUR_STAGES.length) this.startTourStage?.(this.tour.stage + 1);
      else if (this.tour) this.startTour?.();
      else this.startMatch?.();
      return true;
    }
    if (this.mode !== "menu") return false;
    if (this.ui?.versusScreen && !this.ui.versusScreen.classList?.contains?.("hidden")) {
      this.startWithOnboarding(() => this.startVersusMatch?.());
      return true;
    }
    return this.startCombatFromMenu();
  },

  startCombatFromMenu() {
    const training = !this.settings?.get?.("trainingCompleted");
    const start = () => {
      this.clearActiveChallenge?.();
      this.startMatch?.({ training });
    };
    if (training) {
      // Le manuel statique reste consultable depuis Aide, mais la première
      // partie enseigne désormais en jouant. Le drapeau ne sera consommé qu'au
      // troisième geste (ou au filet de 38 s), afin qu'un départ accidentel ne
      // prive pas le joueur de l'aide lors de sa prochaine mise à l'eau.
      start();
      return true;
    }
    this.startWithOnboarding(start);
    return true;
  },

  isPortraitCombat() {
    const width = Number(globalThis.innerWidth) || 0;
    const height = Number(globalThis.innerHeight) || 0;
    return width > 0 && height > width * 1.15;
  },

  updatePauseDialog() {
    const fromMenu = Boolean(this.settingsFromMenu);
    const portrait = this.pauseReason === "orientation";
    const background = this.pauseReason === "visibility";
    if (this.ui?.pauseStateLabel) this.ui.pauseStateLabel.textContent = fromMenu
      ? "RÉGLAGES"
      : portrait ? "ÉCRAN VERTICAL" : background ? "RETOUR À BORD" : "PAUSE";
    if (this.ui?.pauseIcon) {
      this.ui.pauseIcon.textContent = "";
      if (this.ui.pauseIcon.dataset) {
        this.ui.pauseIcon.dataset.pauseVisual = fromMenu
          ? "settings"
          : portrait ? "orientation" : "pause";
      }
    }
    const title = globalThis.document?.getElementById?.("pauseTitle");
    const copy = globalThis.document?.getElementById?.("pauseCopy");
    if (title) title.textContent = fromMenu ? "CALE DE PILOTAGE" : portrait ? "TOURNE TA YOLE" : "MER SUSPENDUE";
    if (copy) copy.textContent = fromMenu
      ? "Règle le son, le pilotage et la lisibilité avant de prendre la mer."
      : portrait
        ? "La partie est en pause. Repasse en paysage pour reprendre."
        : background
          ? "Tout est resté en pause pendant ton absence. Reprends quand tu es prêt."
          : "La mer et tes rivaux sont suspendus.";
    if (this.ui?.resume) this.ui.resume.textContent = fromMenu ? "FERMER" : portrait ? "TOURNE L’ÉCRAN" : "REPRENDRE";
  },

  pauseForInterruption(reason) {
    if (this.mode !== "playing" || this.paused) return false;
    this.pauseReason = reason;
    this.resumeCountdownPending = true;
    if (reason === "orientation") this.ui?.rotate?.classList?.remove?.("hidden");
    this.togglePause(true);
    this.updatePauseDialog();
    return true;
  },

  restartInputCue(element, className = "input-confirmed") {
    if (!element?.classList) return;
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
  },

  flashActionControl(bit) {
    let control = null;
    if (bit === ACTION_SHIFT) control = this.ui?.bwa;
    else if (bit === ACTION_BOOST_FORWARD) control = this.ui?.boostForward;
    else if (bit === ACTION_BOOST_LATERAL) control = this.ui?.boostLateral;
    else if (WEAPONS.some((weapon) => weapon.action === bit)) control = this.ui?.weaponSlot;
    this.restartInputCue(control);
  },

  trapDialogFocus(event) {
    if (event.code !== "Tab") return false;
    const dialog = [
      this.ui?.leaveScreen,
      this.ui?.onboardingScreen,
      this.ui?.controlsScreen,
      this.ui?.versusScreen,
      this.ui?.customScreen,
      this.ui?.pause,
      this.ui?.end,
      this.ui?.fatal
    ].find((element) => element && !element.classList?.contains?.("hidden"));
    if (!dialog?.querySelectorAll) return false;
    // ⚠️ `summary` AJOUTE. Le panneau de raccourcis de l'écran de pause est un
    // <details>/<summary> : le navigateur le rend focusable nativement, mais ce
    // sélecteur ne le connaissait pas. La tabulation l'aurait donc sauté dans le
    // calcul d'enroulement, et le focus serait sorti du dialogue.
    const focusable = [...dialog.querySelectorAll(
      "button:not([disabled]),a[href],summary,input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])"
    )].filter((element) => {
      if (element.hidden || element.getAttribute?.("aria-hidden") === "true") return false;
      // `hidden` ne voit ni display:none via une classe/ancêtre, ni le contenu
      // d'un <details> fermé. getClientRects couvre les deux sans exclure les
      // contrôles positionnés en fixed.
      if (typeof element.getClientRects === "function" && element.getClientRects().length === 0) return false;
      return true;
    });
    if (!focusable.length) return false;
    const active = globalThis.document?.activeElement;
    const index = focusable.indexOf(active);
    const target = event.shiftKey
      ? index <= 0 ? focusable.at(-1) : null
      : index < 0 || index === focusable.length - 1 ? focusable[0] : null;
    if (!target) return false;
    event.preventDefault?.();
    target.focus?.();
    return true;
  },

  focusWhenDialogOpens(screen, target) {
    const Observer = globalThis.MutationObserver;
    if (!Observer || !screen?.classList || !target) return null;
    let hidden = screen.classList.contains("hidden");
    const observer = new Observer(() => {
      const nextHidden = screen.classList.contains("hidden");
      if (hidden && !nextHidden) target.focus?.();
      hidden = nextHidden;
    });
    observer.observe(screen, { attributes: true, attributeFilter: ["class"] });
    (this.dialogFocusObservers ??= []).push(observer);
    return observer;
  },

  clearLiveInput() {
    if (!this.input) return;
    this.input.left = false;
    this.input.right = false;
    this.input.actions = 0;
    this.pendingBoostHudAttemptMask = 0;
    this.input.steer = 0;
    this.input.trim = KEYBOARD_TRIM.cruise;
    this.input.trimUp = false;
    this.input.trimDown = false;
    this.input.lookBack = false;
    this.input.joy = false;
    this.input.joyId = null;
    this.input.aim = 0;
    this.input.aimPitch = 0;
    this.input.aimActive = false;
    this.input.aimPointerId = null;
    this.aimOriginX = 0;
    this.aimOriginY = 0;
    this.aimDragSpan = AIM_DRAG_MIN_PX;
    this.gamepadSteer = null;
    this.gamepadTrim = null;
    this.hadLocalSteer = false;
    this.hadGamepadTrim = false;
    this.dashTapSide = 0;
    this.dashTapAt = -1e9;
    this.dashDoubleTapSide = 0;
    this.joyDashSide = 0;
    this.joyDashAt = -1e9;
    this.joyDashLatch = 0;
    this.resetPointerInputs?.();
    this.clearVersusInput?.();
    if (this.ui?.joyKnob?.style) this.ui.joyKnob.style.transform = "";
  },

  beginAimPointer(event, steeringActive = false, viewportWidth = 0) {
    if (this.mode !== "playing" || this.playerInputLocked() || this.input.aimActive) return false;
    const mouseAim = event.pointerType === "mouse" && event.button === 2;
    const touchAim = event.pointerType === "touch" && steeringActive;
    if (!mouseAim && !touchAim) return false;
    const width = viewportWidth || event.currentTarget?.clientWidth || this.ui?.viewport?.clientWidth || 640;
    this.aimOriginX = Number.isFinite(event.clientX) ? event.clientX : 0;
    this.aimDragSpan = clamp(width * AIM_DRAG_VIEWPORT_RATIO, AIM_DRAG_MIN_PX, AIM_DRAG_MAX_PX);
    this.input.aim = 0;
    this.input.aimPitch = 0;
    this.aimOriginY = Number.isFinite(event.clientY) ? event.clientY : 0;
    this.input.aimActive = true;
    this.input.aimPointerId = event.pointerId;
    this.restartInputCue(this.ui?.aimHelp);
    event.preventDefault?.();
    return true;
  },

  updateAimPointer(event) {
    if (
      this.paused
      || !this.input.aimActive
      || event.pointerId !== this.input.aimPointerId
    ) return false;
    const dx = (Number.isFinite(event.clientX) ? event.clientX : this.aimOriginX) - this.aimOriginX;
    this.input.aim = clamp(dx / Math.max(1, this.aimDragSpan), -1, 1);
    // Axe VERTICAL. L'écran a son y vers le bas : glisser vers le HAUT doit
    // lever le tir, d'où le signe. Sans cet axe, la balistique n'était réglable
    // qu'en gauche/droite et la cloche du coco était figée.
    const dy = (Number.isFinite(event.clientY) ? event.clientY : this.aimOriginY) - this.aimOriginY;
    this.input.aimPitch = clamp(-dy / Math.max(1, this.aimDragSpan), -1, 1);
    event.preventDefault?.();
    return true;
  },

  endAimPointer(event, fire = true) {
    if (event.pointerId !== this.input.aimPointerId) return false;
    this.updateAimPointer(event);
    this.input.aimActive = false;
    this.input.aimPointerId = null;
    event.preventDefault?.();
    if (fire && !this.playerInputLocked()) this.useActiveWeapon();
    return true;
  },

  withPlayerAim(player, callback) {
    const dynamics = player?.dynamics;
    if (!dynamics || player !== this.boats?.[0]) return callback();
    const originalHeading = dynamics.heading;
    // ⚠️ SIGNE NÉGATIF, et il n'est pas décoratif : la visée était INVERSÉE.
    //
    // La caméra regarde le long de +Z avec Y vers le haut, donc la droite de
    // l'écran est −X. Or `heading + aim` fait tourner l'avant de +Z vers +X,
    // c'est-à-dire vers la GAUCHE de l'écran, pendant que le viseur, lui, part
    // à droite (`left: 50 + aim * 24 %`). Glisser à droite tirait à gauche.
    //
    // Mesuré par projection écran, sans hypothèse sur la base de la caméra :
    // à `aim = +1`, viseur à 74 % de largeur et tir à −0,187 en NDC. Les deux
    // étaient opposés dans les deux sens.
    dynamics.heading = originalHeading - clamp(this.input.aim ?? 0, -1, 1) * AIM_MAX_RADIANS;
    try {
      return callback();
    } finally {
      dynamics.heading = originalHeading;
    }
  },

  findAimedTarget(owner, range, cone) {
    return this.withPlayerAim(owner, () => this.findTarget(owner, range, cone));
  },

  moveDialogFocus(scope, direction = 1) {
    const controls = [...(scope?.querySelectorAll?.(
      "button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])"
    ) ?? [])].filter((control) => control.hidden !== true);
    if (!controls.length) return false;
    const active = globalThis.document?.activeElement;
    const current = controls.indexOf(active);
    const next = (current + (direction < 0 ? -1 : 1) + controls.length) % controls.length;
    controls[next]?.focus?.();
    return true;
  },

  activeMenuNavigationScope() {
    const doc = globalThis.document;
    if (!doc) return null;
    const visible = (node) => Boolean(node)
      && node.hidden !== true
      && !node.classList?.contains?.("hidden")
      && node.getAttribute?.("aria-hidden") !== "true"
      && (typeof node.getClientRects !== "function" || node.getClientRects().length > 0);
    const openDialogs = [...(doc.querySelectorAll?.("dialog[open]") ?? [])].filter(visible);
    if (openDialogs.length) return openDialogs.at(-1);
    const ordered = [
      this.ui?.leaveScreen,
      this.ui?.onboardingScreen,
      this.ui?.controlsScreen,
      this.ui?.customScreen,
      this.ui?.versusScreen,
      this.ui?.end,
      this.ui?.fatal,
      this.ui?.pause,
      this.ui?.menu
    ];
    return ordered.find(visible) ?? null;
  },

  menuFocusableItems(scope) {
    return [...(scope?.querySelectorAll?.(
      "button:not([hidden]):not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex='-1'])"
    ) ?? [])].filter((control) => {
      if (control.hidden === true || control.closest?.(".hidden,[inert]")) return false;
      return typeof control.getClientRects !== "function" || control.getClientRects().length > 0;
    });
  },

  adjustFocusedRange(control, direction) {
    if (control?.tagName !== "INPUT" || control.type !== "range" || !direction) return false;
    const minimum = Number(control.min || 0);
    const maximum = Number(control.max || 100);
    const step = Math.max(Number(control.step || 1), Number.EPSILON);
    const value = clamp(Number(control.value || minimum) + Math.sign(direction) * step, minimum, maximum);
    control.value = String(value);
    const EventCtor = globalThis.Event;
    if (typeof EventCtor === "function") {
      control.dispatchEvent?.(new EventCtor("input", { bubbles: true }));
      control.dispatchEvent?.(new EventCtor("change", { bubbles: true }));
    }
    return true;
  },

  moveMenuFocus(scope, directionX = 0, directionY = 0) {
    const controls = this.menuFocusableItems(scope);
    if (!controls.length) return false;
    const doc = globalThis.document;
    const active = doc?.activeElement;
    if (directionX && this.adjustFocusedRange(active, directionX)) return true;
    if (!controls.includes(active)) {
      const preferred = controls.find((control) => control.classList?.contains?.("primary"))
        ?? controls[0];
      preferred?.focus?.();
      return true;
    }
    const origin = active.getBoundingClientRect?.();
    if (!origin || (!directionX && !directionY)) return this.moveDialogFocus(scope, directionY < 0 || directionX < 0 ? -1 : 1);
    const originX = origin.left + origin.width * .5;
    const originY = origin.top + origin.height * .5;
    let best = null;
    let bestScore = Infinity;
    for (const candidate of controls) {
      if (candidate === active) continue;
      const rect = candidate.getBoundingClientRect?.();
      if (!rect) continue;
      const dx = rect.left + rect.width * .5 - originX;
      const dy = rect.top + rect.height * .5 - originY;
      const forward = dx * directionX + dy * directionY;
      if (forward <= 3) continue;
      const lateral = Math.abs(dx * directionY - dy * directionX);
      const score = forward + lateral * 2.35;
      if (score < bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    if (!best) {
      // Rebouclage spatial : partir du bord opposé sans perdre la colonne ou la
      // rangée visuelle donne un comportement prévisible dans les grilles.
      let wrapScore = Infinity;
      for (const candidate of controls) {
        if (candidate === active) continue;
        const rect = candidate.getBoundingClientRect?.();
        if (!rect) continue;
        const cx = rect.left + rect.width * .5;
        const cy = rect.top + rect.height * .5;
        const edge = cx * directionX + cy * directionY;
        const lateral = Math.abs((cx - originX) * directionY - (cy - originY) * directionX);
        const score = edge + lateral * 2.35;
        if (score < wrapScore) {
          best = candidate;
          wrapScore = score;
        }
      }
    }
    best?.focus?.();
    return Boolean(best);
  },

  cancelMenuNavigation(scope) {
    if (!scope) return false;
    if (scope === this.ui?.leaveScreen) return Boolean(this.cancelReturnToMenu?.());
    if (scope === this.ui?.controlsScreen) return Boolean(this.closeControls?.());
    if (scope === this.ui?.onboardingScreen) return Boolean(this.finishOnboarding?.({ completed: false }));
    if (scope === this.ui?.customScreen) return Boolean(this.closeWorkshop?.({ save: false }));
    if (scope === this.ui?.versusScreen) {
      this.ui?.versusClose?.click?.();
      return true;
    }
    if (scope.matches?.("dialog[open]")) {
      const close = scope.querySelector?.(
        ".tour-hub__close,.info-hub__close,[aria-label^='Fermer']"
      );
      close?.click?.();
      return Boolean(close);
    }
    if (scope === this.ui?.end && this.ui?.endMenu) {
      this.requestReturnToMenu?.(this.ui.endMenu);
      return true;
    }
    return false;
  },

  pollGamepad() {
    // Filet de sécurité pour une partie lancée alors que le téléphone est déjà
    // vertical : aucun événement `resize` n'est alors garanti après le clic.
    if (this.mode === "playing" && !this.paused && this.isPortraitCombat()) {
      this.pauseForInterruption("orientation");
    }
    const pads = typeof navigator !== "undefined" ? navigator.getGamepads?.() : null;
    let pad = null;
    if (pads) {
      for (const candidate of pads) {
        if (candidate?.connected) { pad = candidate; break; }
      }
    }
    if (!pad) {
      this.gamepadPrev.length = 0;
      this.gamepadSteer = null;
      this.gamepadTrim = null;
      this.gamepadMenuAxes = { x: 0, y: 0 };
      return;
    }
    const prev = this.gamepadPrev;
    const pressed = (index) => {
      const now = Boolean(pad.buttons[index]?.pressed);
      const was = prev[index] || false;
      prev[index] = now;
      return now && !was;
    };
    const hasPadActivity = [...(pad.axes ?? [])].some((axis) => Math.abs(axis ?? 0) > 0.18)
      || [...(pad.buttons ?? [])].some((button) => button?.pressed);
    if (hasPadActivity) this.setInputDevice("gamepad");
    const startPressed = pressed(9);
    // Menus et écran de fin : Start emprunte le CTA réellement affiché. C'est
    // essentiel en Tour, où un `startMatch()` générique abandonnerait l'étape
    // suivante au lieu d'activer le bouton de résultats.
    if (this.mode !== "playing") {
      const acceptPressed = pressed(0);
      const cancelPressed = pressed(1);
      const upPressed = pressed(12);
      const downPressed = pressed(13);
      const leftPressed = pressed(14);
      const rightPressed = pressed(15);
      const axisX = Math.abs(pad.axes?.[0] ?? 0) > .62 ? Math.sign(pad.axes[0]) : 0;
      const axisY = Math.abs(pad.axes?.[1] ?? 0) > .62 ? Math.sign(pad.axes[1]) : 0;
      const previousAxes = this.gamepadMenuAxes ?? { x: 0, y: 0 };
      const axisXPressed = axisX && axisX !== previousAxes.x ? axisX : 0;
      const axisYPressed = axisY && axisY !== previousAxes.y ? axisY : 0;
      this.gamepadMenuAxes = { x: axisX, y: axisY };
      for (let index = 0; index < pad.buttons.length; index++) {
        if (![0, 1, 9, 12, 13, 14, 15].includes(index)) {
          prev[index] = Boolean(pad.buttons[index]?.pressed);
        }
      }
      const scope = this.activeMenuNavigationScope();
      const directionX = rightPressed ? 1 : leftPressed ? -1 : axisXPressed;
      const directionY = downPressed ? 1 : upPressed ? -1 : axisYPressed;
      if (cancelPressed) this.cancelMenuNavigation(scope);
      else if (directionX || directionY) this.moveMenuFocus(scope, directionX, directionY);
      else if (acceptPressed) {
        const active = globalThis.document?.activeElement;
        if (active && scope?.contains?.(active)) active.click?.();
        else this.moveMenuFocus(scope, 0, 1);
      } else if (startPressed) {
        this.activatePrimaryAction();
      }
      return;
    }
    // En pause, la manette pilote le vrai dialogue : auparavant tout sauf Start
    // était consommé, donc « Menu principal » devenait un cul-de-sac au pad.
    if (this.paused) {
      const acceptPressed = pressed(0);
      const cancelPressed = pressed(1);
      const backPressed = pressed(8);
      const upPressed = pressed(12);
      const downPressed = pressed(13);
      for (let index = 0; index < pad.buttons.length; index++) {
        if (![0, 1, 8, 9, 12, 13].includes(index)) prev[index] = Boolean(pad.buttons[index]?.pressed);
      }
      this.clearLiveInput();
      const leaveOpen = this.ui?.leaveScreen
        && !this.ui.leaveScreen.classList?.contains?.("hidden");
      if (leaveOpen) {
        if (cancelPressed) this.cancelReturnToMenu();
        else if (upPressed || downPressed) this.moveDialogFocus(this.ui.leaveScreen, upPressed ? -1 : 1);
        else if (acceptPressed) globalThis.document?.activeElement?.click?.();
        return;
      }
      const nestedDialogOpen = this.hasBlockingMenuDialog({ includePause: false });
      if (nestedDialogOpen) {
        if (cancelPressed && this.ui?.controlsScreen
          && !this.ui.controlsScreen.classList?.contains?.("hidden")) this.closeControls?.();
        return;
      }
      if (backPressed) this.requestReturnToMenu(this.ui?.pauseMenu);
      else if (upPressed || downPressed) this.moveDialogFocus(this.ui?.pause, upPressed ? -1 : 1);
      else if (acceptPressed) globalThis.document?.activeElement?.click?.();
      else if (startPressed || cancelPressed) this.togglePause(false);
      return;
    }
    // Entrer en pause consomme tous les autres fronts : Start+A ne peut pas
    // tirer au premier tick derrière le dialogue.
    if (startPressed) {
      for (let index = 0; index < pad.buttons.length; index++) {
        if (index !== 9) prev[index] = Boolean(pad.buttons[index]?.pressed);
      }
      this.clearLiveInput();
      this.togglePause(true);
      return;
    }
    // Le stick est lu ici mais appliqué dans la boucle fixe (cf. fixedUpdate),
    // pour rester déterministe et enregistrable dans les replays.
    const axisX = pad.axes[0] ?? 0;
    const axisY = pad.axes[1] ?? 0;
    const aimX = pad.axes[2] ?? 0;
    const aimY = pad.axes[3] ?? 0;
    const dpadX = (pad.buttons[15]?.pressed ? 1 : 0) - (pad.buttons[14]?.pressed ? 1 : 0);
    if (Math.abs(axisX) > 0.18) this.gamepadSteer = clamp(axisX, -1, 1);
    else if (dpadX) this.gamepadSteer = dpadX;
    else this.gamepadSteer = null;
    this.gamepadTrim = Math.abs(axisY) > 0.22
      ? clamp(KEYBOARD_TRIM.cruise - axisY * 0.22, KEYBOARD_TRIM.min, KEYBOARD_TRIM.max)
      : null;
    if (this.inputDevice === "gamepad" || Math.hypot(aimX, aimY) > 0.18) {
      this.input.aim = Math.abs(aimX) > 0.18 ? clamp(aimX, -1, 1) : 0;
      this.input.aimPitch = Math.abs(aimY) > 0.18 ? clamp(-aimY, -1, 1) : 0;
      this.input.aimActive = Math.hypot(aimX, aimY) > 0.18;
      this.input.aimPointerId = null;
    }
    // Mapping standard : 0=A/✕ 1=B/○ 2=X/□ 3=Y/△ 4=LB 5=RB 8=Back 9=Start 12/13=croix haut/bas.
    if (pressed(0)) this.useActiveWeapon();
    if (pressed(2)) this.cycleWeapon();
    if (pressed(3)) this.fireWeaponKey(this.crateWeapon()?.key ?? this.boats[0]?.loadout?.[1]);
    if (pressed(1)) this.triggerPlayerShift();
    if (pressed(5)) this.triggerForwardBoost(this.boats[0]);
    if (pressed(4)) this.triggerLateralBoost(this.boats[0], this.input.steer || -this.boats[0].roll || 1);
    if (pressed(12)) this.adjustCameraZoom(-0.14);
    if (pressed(13)) this.adjustCameraZoom(0.14);
  },

  handleKeyboardInput(down, event) {
    const code = event.code;
    // Un contrôle ciblé peut avoir déjà consommé la touche avant que
    // l'événement remonte à ce listener global. C'est notamment le cas des
    // flèches du tablist : rebasculer ici vers « clavier » annulerait l'onglet
    // tactile/manette que son propre handler vient de sélectionner.
    if (down && !event.defaultPrevented) this.setInputDevice("keyboard");
    if (down && code === "Tab" && this.trapDialogFocus(event)) return;
    if (down && code === "Escape") {
      if (this.ui?.leaveScreen && !this.ui.leaveScreen.classList?.contains?.("hidden")) {
        event.preventDefault?.();
        this.cancelReturnToMenu();
        return;
      }
      if (this.ui?.onboardingScreen && !this.ui.onboardingScreen.classList?.contains?.("hidden")) {
        event.preventDefault?.();
        this.finishOnboarding({ completed: false });
        return;
      }
      if (this.ui?.controlsScreen && !this.ui.controlsScreen.classList?.contains?.("hidden")) {
        event.preventDefault?.();
        this.closeControls();
        return;
      }
      if (this.settingsFromMenu && this.ui?.pause && !this.ui.pause.classList?.contains?.("hidden")) {
        event.preventDefault?.();
        this.togglePause(false);
        return;
      }
    }
    if (down && code === "Escape" && this.mode !== "playing") {
      let returnTarget = this.dialogReturnFocus;
      let closed = false;
      if (this.ui?.versusScreen && !this.ui.versusScreen.classList?.contains?.("hidden")) {
        this.closeVersusLobby?.();
        this.ui.versusBtn?.setAttribute?.("aria-expanded", "false");
        returnTarget ??= this.ui.versusBtn;
        closed = true;
      } else if (this.ui?.customScreen && !this.ui.customScreen.classList?.contains?.("hidden")) {
        this.closeWorkshop?.({ save: false });
        returnTarget = null;
        closed = true;
      }
      if (closed) {
        event.preventDefault?.();
        returnTarget?.focus?.();
        if (returnTarget) this.dialogReturnFocus = null;
        return;
      }
    }
    const pauseKey = code === "Escape" || code === "KeyP";
    if (down && pauseKey && this.mode === "playing") {
      event.preventDefault?.();
      this.togglePause();
      return;
    }

    // Une touche qui active un bouton du modal appartient au DOM, pas à la
    // yole. En pause, aucune touche de gameplay ne peut non plus mettre un bit
    // en attente pour la reprise.
    if (this.mode !== "playing" || this.playerInputLocked() || isInteractiveKeyTarget(event.target)) {
      if (!down) {
        if (code === "ArrowLeft" || code === "KeyA") this.input.left = false;
        if (code === "ArrowRight" || code === "KeyD") this.input.right = false;
        if (code === "KeyC") this.input.lookBack = false;
        if (code === "ArrowUp") this.input.trimUp = false;
        if (code === "ArrowDown") this.input.trimDown = false;
        if (code === "KeyJ" && this.input2) this.input2.left = false;
        if (code === "KeyL" && this.input2) this.input2.right = false;
      }
      return;
    }

    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space", "KeyC"].includes(code)) event.preventDefault?.();
    // ÉCOUTE / BORDER : l'accélérateur du clavier.
    //
    // Le clavier figeait `trim` à 0,82, au-dessus du seuil `trimPowered` (0,70) :
    // `trimDrive` valait donc 1 en permanence et la yole était à plein gaz du
    // départ à l'arrivée. Toute la mécanique de voile existait déjà côté physique
    // — 24 % à 100 % de poussée, plus un frein de choque — mais aucune touche ne
    // l'atteignait. Il ne manquait que ça.
    // Maintenir C (ou la touche de vue) retourne la caméra vers la poupe.
    if (code === "KeyC") this.input.lookBack = down;
    if (code === "ArrowUp") this.input.trimUp = down;
    if (code === "ArrowDown") this.input.trimDown = down;
    if (this.versusLocal && ["KeyJ", "KeyL", "KeyI", "KeyO", "KeyU", "KeyM", "KeyK"].includes(code)) {
      event.preventDefault?.();
      if (code === "KeyJ") this.input2.left = down;
      if (code === "KeyL") this.input2.right = down;
      if (!down || event.repeat) return;
      let accepted = false;
      if (code === "KeyI") accepted = this.requestVersusWeapon();
      if (code === "KeyO") accepted = this.requestVersusCycle();
      if (code === "KeyU") accepted = this.requestVersusAction(ACTION_BOOST_FORWARD);
      if (code === "KeyM") accepted = this.requestVersusAction(ACTION_BOOST_LATERAL);
      if (code === "KeyK") accepted = this.requestVersusAction(ACTION_SHIFT);
      if (accepted) this.restartInputCue(this.ui?.versusHud?.querySelector?.(".p2"));
      return;
    }
    const gauche = code === "ArrowLeft" || code === "KeyA";
    const droite = code === "ArrowRight" || code === "KeyD";
    if (gauche) this.input.left = down;
    if (droite) this.input.right = down;
    // BWA DASH AU DOUBLE-TAP. Deux appuis du même côté dans la fenêtre lancent
    // le dash de ce côté-là — c'est le geste des jeux de combat, et il évite
    // d'avoir à lâcher la barre pour atteindre une touche dédiée. `X` et `Ctrl`
    // restent branchés pour qui préfère.
    if (down && !event.repeat && (gauche || droite)) {
      const cote = droite ? 1 : -1;
      // ⚠️ Horloge MURALE, pas l'horloge de simulation : ce handler tourne dans
      // le DOM, hors du tick fixe. C'est sans risque pour le replay, qui
      // n'enregistre que le BIT d'action produit, jamais le timing du tap.
      const maintenant = (globalThis.performance?.now?.() ?? 0);
      if (this.dashTapSide === cote && maintenant - (this.dashTapAt ?? -1e9) <= DASH_DOUBLE_TAP_MS) {
        this.dashTapSide = 0;
        this.dashTapAt = -1e9;
        this.dashDoubleTapSide = cote;
        this.requestAction(ACTION_BOOST_LATERAL);
      } else {
        this.dashTapSide = cote;
        this.dashTapAt = maintenant;
      }
    }
    if (!down) return;
    // ⚠️ HUIT SLOTS, ET ILS TIRENT.
    //
    // Avant : quatre touches qui ne faisaient que SÉLECTIONNER, puis il fallait
    // Espace pour tirer. Deux gestes pour une action, alors que le geste évident
    // — « j'appuie sur & pour envoyer un coco » — ne marchait pas. Et les quatre
    // armes de CAISSE n'avaient aucune touche : il fallait cycler avec E.
    const weaponDigit = /^Digit([1-8])$/.exec(code);
    if (weaponDigit) {
      event.preventDefault?.();
      if (!event.repeat) this.fireWeaponShortcut(Number(weaponDigit[1]) - 1);
      return;
    }
    if (code === "Space") this.useActiveWeapon();
    if (code === "KeyE") this.cycleWeapon();
    if (code === "ShiftLeft" || code === "ShiftRight") this.requestAction(ACTION_SHIFT);
    if (code === "KeyW" || code === "KeyF") this.requestAction(ACTION_BOOST_FORWARD);
    if (code === "KeyX" || code === "ControlLeft" || code === "ControlRight") this.requestAction(ACTION_BOOST_LATERAL);
    if (code === "Equal" || code === "NumpadAdd") this.adjustCameraZoom(-0.12);
    if (code === "Minus" || code === "NumpadSubtract") this.adjustCameraZoom(0.12);
    if (code === "F3") this.toggleSetting("showPerf");
  },

  adjustCameraZoom(delta) {
    this.cameraZoom = clamp(this.cameraZoom + delta, ZOOM_MIN, ZOOM_MAX);
    this.settings.set("cameraZoom", Math.round(this.cameraZoom * 100) / 100);
    if (this.ui.zoomValue) this.ui.zoomValue.textContent = `${Math.round(this.cameraZoom * 100)}%`;
    return this.cameraZoom;
  },

  triggerPlayerShift() {
    if (this.playerInputLocked()) return;
    const player = this.boats[0];
    if (!player || player.eliminated) return;
    const result = player.triggerShift();
    const water = this.waveField.sample(player.x, player.z, this.time, this.waterScratch);
    // Réponse de commande courte seulement. La vraie reprise de charge est
    // déclenchée plus tard par l'événement physique CREW_LOADED.
    this.spellVfx?.spawn(player.x, water.height + 1.05, player.z, SPELL_VFX.BWA_SHIFT, result.critical ? 2.8 : 2.2, result.critical ? 0.25 : 0.21, {
      flipX: player.dynamics.crewTarget < 0
    });
    this.telemetry.track("bwa_shift", { critical: result.critical, precision: result.precision, cut: result.cut }, this.time);
    if (!this.isApplyingReplay) this.input.actions |= ACTION_SHIFT;
  },

  triggerForwardBoost(boat = this.boats[0]) {
    const playerAttempt = Boolean(boat && boat === this.boats?.[0]);
    const queuedFeedback = Boolean(this.pendingBoostHudAttemptMask & ACTION_BOOST_FORWARD);
    if (this.isApplyingReplay && queuedFeedback) {
      this.pendingBoostHudAttemptMask &= ~ACTION_BOOST_FORWARD;
    }
    // Une action manette réussie est appliquée immédiatement puis inscrite dans
    // le masque du replay. Son second passage au tick fixe est seulement l'écho
    // d'enregistrement : il ne doit pas remplacer « confirmé » par un faux
    // « cooldown ». Les actions clavier/tactile posent, elles, le marqueur.
    const feedbackAttempt = playerAttempt && (
      !this.isApplyingReplay
      || Boolean(this.playback)
      || queuedFeedback
    );
    if (this.trainingBasicsLocked()) {
      if (feedbackAttempt) this.publishBoostHudFeedback("forward", "rejected", boat.eliminated ? "eliminated" : "locked");
      return false;
    }
    if (playerAttempt && this.playerInputLocked()) {
      if (feedbackAttempt) this.publishBoostHudFeedback("forward", "rejected", boat.eliminated ? "eliminated" : "locked");
      return false;
    }
    if (!boat || boat.eliminated) {
      if (feedbackAttempt) this.publishBoostHudFeedback("forward", "rejected", "eliminated");
      return false;
    }
    if (!boat.triggerForwardBoost()) {
      if (feedbackAttempt) {
        this.publishBoostHudFeedback(
          "forward",
          "rejected",
          this.boostRejectionReason(boat, "forward")
        );
      }
      return false;
    }
    // Confirmation uniquement après mutation physique réussie. Le HUD peut
    // ensuite consommer le serial à son rythme, sans aucun toast de rejet ici.
    if (feedbackAttempt) this.publishBoostHudFeedback("forward", "confirmed");
    const forward = boat.forward(this.boostForwardScratch || (this.boostForwardScratch = { x: 0, z: 0 }));
    const tailX = boat.x - forward.x * 4.5;
    const tailZ = boat.z - forward.z * 4.5;
    const water = this.waveField.sample(tailX, tailZ, this.time, this.waterScratch);
    this.ocean.wake.trail(tailX, tailZ, boat.dynamics.heading, boat.speed + 12, 2.0);
    this.particles.emitBurst(this.visualRng, { x: tailX, y: water.height + 0.22, z: tailZ }, 0xffea79, Math.floor(18 * this.particleBudget), {
      speed: 2.8, upward: 1.25, lifeMin: 0.22, lifeMax: 0.55, sizeMax: 0.48, gravity: 4.2
    });
    this.rings.burst(tailX, water.height, tailZ, 0xffd451, 0.7, 0.42);
    this.audio.play("turbo", { gain: boat.isPlayer ? 0.42 : 0.16, rate: 0.98, pan: this.panFor(boat.x), gap: 0.05 });
    if (boat.isPlayer) {
      this.stats.boosts++;
      this.showMessage("🔥 TURBO LANMÈ !", 0.48);
      this.postFX.pulse(0.28);
      this.haptic?.("turbo");
      if (!this.isApplyingReplay) this.input.actions |= ACTION_BOOST_FORWARD;
    }
    this.telemetry.track("boost_forward", { boat: boat.id }, this.time);
    return true;
  },

  triggerLateralBoost(boat = this.boats[0], direction = null) {
    const playerAttempt = Boolean(boat && boat === this.boats?.[0]);
    const queuedFeedback = Boolean(this.pendingBoostHudAttemptMask & ACTION_BOOST_LATERAL);
    if (this.isApplyingReplay && queuedFeedback) {
      this.pendingBoostHudAttemptMask &= ~ACTION_BOOST_LATERAL;
    }
    const feedbackAttempt = playerAttempt && (
      !this.isApplyingReplay
      || Boolean(this.playback)
      || queuedFeedback
    );
    if (this.trainingBasicsLocked()) {
      if (feedbackAttempt) this.publishBoostHudFeedback("lateral", "rejected", boat.eliminated ? "eliminated" : "locked");
      return false;
    }
    if (playerAttempt && this.playerInputLocked()) {
      if (feedbackAttempt) this.publishBoostHudFeedback("lateral", "rejected", boat.eliminated ? "eliminated" : "locked");
      return false;
    }
    if (!boat || boat.eliminated) {
      if (feedbackAttempt) this.publishBoostHudFeedback("lateral", "rejected", "eliminated");
      return false;
    }
    const side = Math.sign(direction ?? boat.steer ?? this.input.steer ?? -boat.roll ?? 1) || 1;
    if (!boat.triggerLateralBoost(side)) {
      if (feedbackAttempt) {
        this.publishBoostHudFeedback(
          "lateral",
          "rejected",
          this.boostRejectionReason(boat, "lateral")
        );
      }
      return false;
    }
    if (feedbackAttempt) this.publishBoostHudFeedback("lateral", "confirmed");
    const forward = boat.forward(this.boostSideForwardScratch || (this.boostSideForwardScratch = { x: 0, z: 0 }));
    const rightX = forward.z;
    const rightZ = -forward.x;
    const water = this.waveField.sample(boat.x, boat.z, this.time, this.waterScratch);
    this.ocean.wake.burst(boat.x - rightX * side * 1.8, boat.z - rightZ * side * 1.8, 3.6, 1.15);
    this.rings.burst(boat.x, water.height, boat.z, side > 0 ? 0xff4eb8 : 0x55f5ff, 0.82, 0.46);
    this.particles.emitBurst(this.visualRng, { x: boat.x - rightX * side * 1.2, y: water.height + 0.28, z: boat.z - rightZ * side * 1.2 }, side > 0 ? 0xff75d0 : 0x89ffff, Math.floor(24 * this.particleBudget), {
      speed: 2.5, upward: 1.7, lifeMin: 0.20, lifeMax: 0.52, sizeMax: 0.52, gravity: 5.1
    });
    // La traînée de dash n'existait pas : seul un anneau plat marquait le coup.
    this.sprays?.spawn(boat.x - rightX * side * 2.4, water.height + 0.8, boat.z - rightZ * side * 2.4, 3.1, 0.5);
    this.spellVfx?.spawn(boat.x - rightX * side * 1.4, water.height + 1.0, boat.z - rightZ * side * 1.4, SPELL_VFX.BWA_DASH, 4.4, 0.48, {
      rotation: this.vfxScreenRotation(rightX * side, rightZ * side, 0)
    });
    this.audio.play("dash", { gain: boat.isPlayer ? 0.40 : 0.15, rate: 1.06, pan: this.panFor(boat.x), gap: 0.04 });
    if (boat.isPlayer) {
      this.stats.boosts++;
      this.showMessage(side > 0 ? "💨 BWA DASH DROITE !" : "💨 BWA DASH GAUCHE !", 0.50);
      this.postFX.pulse(0.34);
      this.haptic?.("dash");
      if (!this.isApplyingReplay) this.input.actions |= ACTION_BOOST_LATERAL;
    }
    this.telemetry.track("boost_lateral", { boat: boat.id, side }, this.time);
    return true;
  },

  // Le joueur DEMANDE une action ; elle s'exécute au point unique de
  // fixedUpdate, jamais au moment de l'événement DOM. C'est ce qui garantit que
  // le direct et la relecture empruntent le même chemin au même instant du tick
  // — l'en-tête de ce fichier le promettait déjà, le code ne le tenait pas.
  // L'arme active est la dernière sélectionnée ou tirée. Si elle tombe à zéro,
  // on retombe sur la première encore disponible : le joueur n'a jamais un
  // emplacement mort alors qu'il lui reste des munitions.
  activeWeapon(boat) {
    const held = WEAPONS.filter((w) => (
      (boat?.ammo?.[w.key] ?? 0) > 0
      && (!this.trainingBasicsLocked() || w.key === "wave")
    ));
    if (!held.length) return null;
    return held.find((w) => w.key === boat.activeWeapon) || held[0];
  },

  useActiveWeapon() {
    const weapon = this.activeWeapon(this.boats[0]);
    if (!weapon) return;
    this.requestAction(weapon.action);
  },

  // Clavier seulement : au tactile, chaque tuile tire directement son arme.
  cycleWeapon() {
    if (this.trainingBasicsLocked()) return false;
    const boat = this.boats[0];
    const held = WEAPONS.filter((w) => (boat?.ammo?.[w.key] ?? 0) > 0);
    if (held.length < 2) return;
    const index = held.findIndex((w) => w.key === boat.activeWeapon);
    boat.activeWeapon = held[(index + 1 + held.length) % held.length].key;
    this.restartInputCue(this.ui?.weaponSlot);
  },

  /** L'arme de caisse actuellement portée, s'il y en a une. */
  crateWeapon(boat) {
    if (this.trainingBasicsLocked()) return null;
    const porte = boat ?? this.boats[0];
    if (!porte) return null;
    // Un seul emplacement de caisse depuis la refonte : la première trouvée
    // avec de la munition EST la bonne.
    return WEAPONS.find((entry) => CRATE_WEAPONS.includes(entry.key)
      && Number.isFinite(porte.ammo?.[entry.key])
      && porte.ammo[entry.key] > 0) ?? null;
  },

  /**
   * Tire une arme DÉSIGNÉE, sans passer par la sélection.
   *
   * ⚠️ C'est le geste tactile qui manquait. `cycleWeapon` n'existe qu'au
   * clavier (touche E) : au doigt, on tirait ce que `activeWeapon` valait et on
   * ne pouvait JAMAIS sortir sa deuxième arme de soute. Une tuile désigne son
   * arme, l'appui la tire — pas de mode, pas de sélection à faire pendant qu'on
   * barre.
   *
   * On pose quand même `activeWeapon` au passage : la barre d'espace et le
   * réticule continuent de suivre ce qu'on vient d'utiliser.
   */
  fireWeaponKey(key) {
    if (!key) return false;
    if (this.trainingBasicsLocked() && key !== "wave") return false;
    const index = WEAPONS.findIndex((entry) => entry.key === key);
    if (index < 0) return false;
    return this.fireWeaponShortcut(index);
  },

  /**
   * Une touche chiffre = SÉLECTIONNER PUIS TIRER.
   *
   * Appuyer sur « & » envoie un coco sans seconde confirmation. Si l'arme
   * correspondante n'est pas disponible, le raccourci est refusé.
   */
  fireWeaponShortcut(slotIndex) {
    if (!this.selectWeaponShortcut(slotIndex)) return false;
    // ⚠️ `useActiveWeapon` ne RENVOIE rien : elle se contente d'empiler le bit
    // d'action, qui sera rejoué par `applyActionMask` dans le pas fixe. Faire
    // `return this.useActiveWeapon()` propageait donc `undefined` — le tir
    // partait mais l'appelant croyait qu'il avait échoué.
    this.useActiveWeapon();
    return true;
  },

  selectWeaponShortcut(slotIndex) {
    if (this.playerInputLocked()) return false;
    const player = this.boats[0];
    const weapon = WEAPONS[slotIndex];
    // Huit armes, huit raccourcis : les quatre armes exclusivement en caisse ont
    // désormais leur touche au lieu de n'être joignables qu'en cyclant avec E.
    if (!player || !weapon || slotIndex < 0 || slotIndex >= WEAPONS.length) return false;
    if (this.trainingBasicsLocked() && weapon.key !== "wave") return false;
    const ammo = player.ammo?.[weapon.key] ?? 0;
    const shortcut = this.ui?.weaponShortcuts?.querySelectorAll?.("[data-weapon]")?.[slotIndex];
    if (ammo <= 0) {
      this.restartInputCue(shortcut, "input-rejected");
      this.showMessage?.(`ARME ${slotIndex + 1} · INDISPONIBLE`, 0.48);
      return false;
    }
    player.activeWeapon = weapon.key;
    this.restartInputCue(shortcut);
    this.restartInputCue(this.ui?.weaponSlot);
    this.showMessage?.(`${slotIndex + 1} · ${weapon.label}`, 0.5);
    this.telemetry?.track?.("weapon_select", { slot: slotIndex + 1, weapon: weapon.key }, this.time);
    return true;
  },

  playerCustomization() {
    const snapshot = this.settings?.snapshot?.() ?? Object.fromEntries(
      ["hullColor", "accentColor", "woodFinish", "crewKit", "sailLivery", "rig"]
        .map((key) => [key, this.settings?.get?.(key)])
    );
    return normalizeCustomization(snapshot);
  },

  applyPlayerCustomization() {
    const profile = this.playerCustomization();
    this.boats?.[0]?.visual?.applyCustomization?.(profile);
    this.updateGarageSummary(profile);
    return profile;
  },

  updateGarageSummary(profile = this.playerCustomization()) {
    const hull = HULL_PAINTS[profile.hullColor];
    const accent = GUNWALE_ACCENTS[profile.accentColor];
    const wood = WOOD_FINISHES[profile.woodFinish];
    const crew = CREW_KITS[profile.crewKit];
    const rig = RIGS[profile.rig];
    const livery = SAIL_LIVERIES[profile.sailLivery];
    const loadout = this.playerLoadout();
    const weaponLabels = loadout.map((key) => WEAPONS.find((entry) => entry.key === key)?.label ?? key);
    const weaponIcons = loadout.map((key) => LOADOUT_GLYPHS[key] ?? "◆");

    if (this.ui?.menuBuildTitle) this.ui.menuBuildTitle.textContent = `${rig.label} · ${livery}`;
    if (this.ui?.menuBuildCopy) {
      this.ui.menuBuildCopy.textContent = `Coque ${hull.label} · bordage ${accent.label} · ${wood.label}`;
    }
    const swatches = [
      [this.ui?.menuHullSwatch, hull.color],
      [this.ui?.menuAccentSwatch, accent.color],
      [this.ui?.menuCrewSwatch, crew.jersey]
    ];
    for (const [element, color] of swatches) element?.style?.setProperty?.("--swatch", cssHex(color));
    if (this.ui?.menuLoadoutIcons) this.ui.menuLoadoutIcons.textContent = weaponIcons.join(" · ");
    if (this.ui?.menuLoadoutCopy) this.ui.menuLoadoutCopy.textContent = `${weaponLabels.join(" + ")} en soute`;
    if (this.ui?.workshopSummary) this.ui.workshopSummary.textContent = `${rig.label} · ${livery}`;
    if (this.ui?.workshopSummaryDetail) {
      this.ui.workshopSummaryDetail.textContent = `${hull.label} · ${accent.label} · ${wood.label} · ${crew.label}`;
    }
    if (this.ui?.rigDetail) this.ui.rigDetail.textContent = rig.detail;
    const power = Math.round(rig.sail * 100);
    const stability = Math.round(100 / rig.heel);
    if (this.ui?.rigPowerValue) this.ui.rigPowerValue.textContent = String(power);
    if (this.ui?.rigStabilityValue) this.ui.rigStabilityValue.textContent = String(stability);
    this.ui?.rigPowerBar?.style?.setProperty?.("--value", `${clamp(power / 120 * 100, 8, 100)}%`);
    this.ui?.rigStabilityBar?.style?.setProperty?.("--value", `${clamp(stability / 120 * 100, 8, 100)}%`);
    return profile;
  },

  // Showroom : chaque choix s'applique au matériau ou au gréement du vrai
  // modèle 3D. La sauvegarde reste transactionnelle : ×/Échap restaure l'état
  // d'ouverture, le CTA du bas le valide.
  buildCustomScreen() {
    const profile = this.playerCustomization();
    const remplir = (hote, entrees, actuel, key, couleur = null) => {
      if (!hote) return;
      hote.textContent = "";
      entrees.forEach((entree, index) => {
        const bouton = document.createElement("button");
        bouton.type = "button";
        bouton.textContent = entree.label ?? entree;
        bouton.dataset.option = entree.key ?? String(index);
        const active = index === actuel;
        bouton.classList.toggle("active", active);
        bouton.setAttribute?.("aria-pressed", String(active));
        const swatch = couleur?.(entree);
        if (Number.isFinite(swatch)) bouton.style?.setProperty?.("--swatch", cssHex(swatch));
        bouton.onclick = () => {
          this.settings.set(key, index);
          this.applyPlayerCustomization();
          this.buildCustomScreen();
          hote.children?.[index]?.focus?.();
        };
        hote.appendChild(bouton);
      });
    };
    remplir(this.ui.hullChoices, HULL_PAINTS, profile.hullColor, "hullColor", (entry) => entry.color);
    remplir(this.ui.accentChoices, GUNWALE_ACCENTS, profile.accentColor, "accentColor", (entry) => entry.color);
    remplir(this.ui.woodChoices, WOOD_FINISHES, profile.woodFinish, "woodFinish", (entry) => entry.color);
    remplir(this.ui.crewChoices, CREW_KITS, profile.crewKit, "crewKit", (entry) => entry.jersey);
    remplir(this.ui.rigChoices, RIGS, profile.rig, "rig");
    remplir(this.ui.liveryChoices, SAIL_LIVERIES, profile.sailLivery, "sailLivery");
    const soute = this.playerLoadout();
    if (this.ui.loadoutChoices) {
      this.ui.loadoutChoices.textContent = "";
      for (const key of LOADOUT_POOL) {
        const weapon = WEAPONS.find((entry) => entry.key === key);
        if (!weapon) continue;
        const order = soute.indexOf(key);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "loadout-choice";
        button.dataset.weapon = key;
        button.classList.toggle("active", order >= 0);
        button.setAttribute?.("aria-pressed", String(order >= 0));
        button.setAttribute?.("aria-label", `${weapon.label}${order >= 0 ? `, arme ${order + 1} de la soute` : ", non sélectionnée"}`);
        const icon = document.createElement("span");
        icon.className = `loadout-choice-icon ${weapon.ico}`;
        icon.setAttribute?.("aria-hidden", "true");
        const label = document.createElement("strong");
        label.textContent = weapon.label;
        const badge = document.createElement("em");
        badge.textContent = order >= 0 ? String(order + 1) : "";
        badge.setAttribute?.("aria-hidden", "true");
        button.append(icon, label, badge);
        button.onclick = () => {
          this.selectLoadoutWeapon(key);
          this.buildCustomScreen();
          this.ui.loadoutChoices?.querySelector?.(`[data-weapon="${key}"]`)?.focus?.();
        };
        this.ui.loadoutChoices.appendChild(button);
      }
    }
    if (this.ui.loadoutDetail) {
      const labels = soute.map((key) => WEAPONS.find((entry) => entry.key === key)?.label ?? key);
      this.ui.loadoutDetail.textContent = `${labels.join(" + ")} · une nouvelle arme remplace l’emplacement 2 ; touche l’arme 2 pour la passer en tête.`;
    }
    this.updateGarageSummary(profile);
    this.setWorkshopTab(this.workshopTab ?? "paint");
  },

  setWorkshopTab(key) {
    const selected = WORKSHOP_PART_LABELS[key] ? key : "paint";
    this.workshopTab = selected;
    for (const tab of this.ui?.customTabs ?? []) {
      const active = tab.dataset?.customTab === selected;
      tab.classList?.toggle?.("active", active);
      tab.setAttribute?.("aria-selected", String(active));
    }
    for (const panel of this.ui?.customPanels ?? []) {
      panel.classList?.toggle?.("hidden", panel.dataset?.customPanel !== selected);
    }
    if (this.ui?.workshopPartLabel) this.ui.workshopPartLabel.textContent = WORKSHOP_PART_LABELS[selected];
    return selected;
  },

  openWorkshop(returnFocus = null) {
    if (!this.ui?.customScreen) return false;
    this.dialogReturnFocus = returnFocus || globalThis.document?.activeElement || this.ui.customBtn;
    // Le menu est lui aussi une couche plein écran au-dessus du canvas. Le
    // laisser visible sous l'atelier faisait apparaître ses cartes dans la
    // baie centrale à la place de la yole 3D.
    this.workshopMenuWasVisible = Boolean(
      this.ui?.menu && !this.ui.menu.classList?.contains?.("hidden")
    );
    if (this.workshopMenuWasVisible) this.ui.menu.classList.add("hidden");
    this.workshopOriginal = Object.fromEntries(WORKSHOP_SETTING_KEYS.map((key) => {
      const value = this.settings?.get?.(key);
      return [key, Array.isArray(value) ? [...value] : value];
    }));
    this.workshopActive = true;
    this.workshopOrbit = { yaw: -0.42, pitch: 0.26, distance: 13.8, dragging: false };
    this.buildCustomScreen();
    this.ui.customScreen.classList.remove("hidden");
    this.ui.customBtn?.setAttribute?.("aria-expanded", "true");
    this.setWorkshopTab("paint");
    (this.ui.customTabs?.[0] || this.ui.workshopOrbitZone || this.ui.customClose)?.focus?.();
    return true;
  },

  closeWorkshop({ save = true, restoreFocus = true } = {}) {
    if (!this.ui?.customScreen) return false;
    if (!save && this.workshopOriginal) {
      for (const key of WORKSHOP_SETTING_KEYS) {
        if (key in this.workshopOriginal) this.settings?.set?.(key, this.workshopOriginal[key]);
      }
    }
    this.applyPlayerCustomization();
    this.workshopActive = false;
    if (this.workshopOrbit) this.workshopOrbit.dragging = false;
    this.ui.customScreen.classList.add("hidden");
    this.ui.customBtn?.setAttribute?.("aria-expanded", "false");
    if (this.workshopMenuWasVisible) this.ui?.menu?.classList?.remove?.("hidden");
    const returnTarget = this.dialogReturnFocus || this.ui.customBtn;
    this.dialogReturnFocus = null;
    this.workshopOriginal = null;
    this.workshopMenuWasVisible = false;
    if (restoreFocus) returnTarget?.focus?.();
    return true;
  },

  resetWorkshopCustomization() {
    for (const key of ["hullColor", "accentColor", "woodFinish", "crewKit", "sailLivery", "rig"]) {
      this.settings?.set?.(key, DEFAULT_CUSTOMIZATION[key]);
    }
    this.settings?.set?.("loadout", ["wave", "harpoon"]);
    this.applyPlayerCustomization();
    this.buildCustomScreen();
    return true;
  },

  adjustWorkshopOrbit(delta) {
    if (!this.workshopOrbit || typeof this.workshopOrbit !== "object") {
      this.workshopOrbit = { yaw: -0.42, pitch: 0.26, distance: 13.8, dragging: false };
    }
    this.workshopOrbit.yaw += Number(delta) || 0;
    return this.workshopOrbit.yaw;
  },

  bindWorkshopOrbitControls() {
    if (this.workshopOrbitBound) return;
    const zone = this.ui?.workshopOrbitZone;
    if (!zone) return;
    this.workshopOrbitBound = true;
    zone.onpointerdown = (event) => {
      if (!this.workshopActive) return;
      event.preventDefault?.();
      event.stopPropagation?.();
      this.workshopPointerId = event.pointerId;
      this.workshopPointerX = event.clientX ?? 0;
      this.workshopOrbit.dragging = true;
      zone.setPointerCapture?.(event.pointerId);
    };
    zone.onpointermove = (event) => {
      if (!this.workshopActive || this.workshopPointerId !== event.pointerId) return;
      const nextX = event.clientX ?? this.workshopPointerX ?? 0;
      this.adjustWorkshopOrbit((this.workshopPointerX - nextX) * 0.012);
      this.workshopPointerX = nextX;
    };
    const finish = (event) => {
      if (this.workshopPointerId !== event.pointerId) return;
      this.workshopOrbit.dragging = false;
      this.workshopPointerId = null;
      zone.releasePointerCapture?.(event.pointerId);
    };
    zone.onpointerup = finish;
    zone.onpointercancel = finish;
    zone.onkeydown = (event) => {
      if (event.code !== "ArrowLeft" && event.code !== "ArrowRight") return;
      event.preventDefault?.();
      event.stopPropagation?.();
      this.adjustWorkshopOrbit(event.code === "ArrowLeft" ? -0.16 : 0.16);
    };
    if (this.ui.workshopRotateLeft) {
      this.ui.workshopRotateLeft.onclick = () => this.adjustWorkshopOrbit(-0.24);
    }
    if (this.ui.workshopRotateRight) {
      this.ui.workshopRotateRight.onclick = () => this.adjustWorkshopOrbit(0.24);
    }
  },

  playerLoadout() {
    return [...resolveLoadout(this.settings.get("loadout"))];
  },

  selectLoadoutWeapon(key) {
    if (!LOADOUT_POOL.includes(key)) return this.playerLoadout();
    const current = this.playerLoadout();
    const index = current.indexOf(key);
    let next = current;
    if (index === 1) next = [current[1], current[0]];
    else if (index < 0) next = [current[0], key];
    this.settings.set("loadout", next);
    if (this.ui?.loadoutDetail) this.ui.loadoutDetail.textContent = LOADOUT_DETAILS[key] ?? "";
    this.updateGarageSummary?.();
    return [...next];
  },

  // Bornage AU POINT D'ENTREE, pas au point d'usage : load() fusionne un JSON
  // arbitraire, et c'est la premiere fois qu'un reglage persiste touche la
  // simulation. Une valeur hors bornes retombe sur l'option mediane, celle qui
  // est numeriquement identique au jeu d'avant.
  playerRig() {
    const brut = this.settings.get("rig");
    return Number.isInteger(brut) && brut >= 0 && brut < RIGS.length ? brut : 1;
  },

  playerAiLevel() {
    const brut = this.settings.get("aiLevel");
    return AI_LEVELS.some((level) => level.key === brut) ? brut : "tour";
  },

  playerLivery() {
    const brut = this.settings.get("sailLivery");
    return Number.isInteger(brut) && brut >= 0 && brut < SAIL_LIVERIES.length ? brut : 0;
  },

  resetAllSettings() {
    this.settings.reset();
    // Ne jamais écrire `audio.muted` directement : setMuted remet aussi le
    // gain maître WebAudio à 0,62 après une session coupée.
    this.audio?.setMuted?.(false);
    this.cameraZoom = clamp(this.settings.get("cameraZoom"), ZOOM_MIN, ZOOM_MAX);
    this.quality.setAutomatic();
    this.impact.reset();
    this.clearLiveInput();
    this.applySettingsUI();
    if (this.mode === "playing") this.showMessage("RÉGLAGES RÉINITIALISÉS", 1.1);
    return true;
  },

  requestAction(bit) {
    const player = this.boats[0];
    const boostKind = bit === ACTION_BOOST_FORWARD
      ? "forward"
      : bit === ACTION_BOOST_LATERAL
        ? "lateral"
        : null;
    const rejectBoost = (reason) => {
      if (boostKind) this.publishBoostHudFeedback(boostKind, "rejected", reason);
      return false;
    };
    if (this.playerInputLocked()) {
      return rejectBoost(player?.eliminated ? "eliminated" : "locked");
    }
    if (!player || player.eliminated) return rejectBoost("eliminated");
    if (this.allowedTrainingActionMask(bit) !== (bit >>> 0)) return rejectBoost("locked");
    if (boostKind) {
      this.pendingBoostHudAttemptMask = (this.pendingBoostHudAttemptMask ?? 0) | bit;
    }
    this.input.actions |= bit;
    this.flashActionControl(bit);
    return true;
  },

  applyActionMask(actions) {
    actions = this.allowedTrainingActionMask(actions);
    if (!actions) return;
    this.isApplyingReplay = true;
    const player = this.boats[0];
    const aimed = (callback) => this.withPlayerAim(player, callback);
    if (actions & ACTION_WAVE) aimed(() => this.fireWave(player));
    if (actions & ACTION_HARPOON) aimed(() => this.fireHarpoon(player));
    if (actions & ACTION_MINE) aimed(() => this.dropMine(player));
    if (actions & ACTION_SHIFT) this.triggerPlayerShift();
    if (actions & ACTION_BOOST_FORWARD) this.triggerForwardBoost(player);
    if (actions & ACTION_BOOST_LATERAL) {
      // ⚠️ La direction est convertie en repère MONDE. `steer` et le double-tap
      // sont désormais relatifs à l'ÉCRAN (positif = droite), alors que
      // triggerLateralBoost pousse le long de (cos θ, −sin θ), qui pointe vers
      // la gauche de l'écran. D'où le signe.
      const ecran = this.dashDoubleTapSide || this.input.steer || player.roll || -1;
      this.dashDoubleTapSide = 0;
      this.triggerLateralBoost(player, -Math.sign(ecran));
    }
    if (actions & ACTION_RHUM) this.drinkRhum(player);
    if (actions & ACTION_BARIK) aimed(() => this.dropBarik(player));
    if (actions & ACTION_CHADRON) aimed(() => this.sowChadron(player));
    if (actions & ACTION_LANBI) aimed(() => this.blowLanbi(player));
    if (actions & ACTION_PWASON) aimed(() => this.firePwason(player));
    this.isApplyingReplay = false;
  },

  bindUI() {
    const ui = this.ui;
    this.collectExtendedUI();
    this.setInputDevice(this.preferredInputDevice());
    // Installation, défi quotidien et liens déterministes sont liés au moment
    // de valeur : le navigateur peut proposer l'installation tôt, mais le jeu
    // ne l'affiche qu'après une course terminée.
    this.bindGrowthHooks();
    // ⚠️ LA MUSIQUE MOURAIT AU PREMIER PASSAGE EN ARRIÈRE-PLAN.
    //
    // Sur mobile, quitter l'onglet met en pause les HTMLAudioElement. Au
    // retour, `setScene(nom)` sort immédiatement sur sa garde d'idempotence
    // (`this.scene === nom`) : la scène courante est déjà « course », donc
    // aucun `play()` n'est rappelé et la piste reste en pause pour le RESTE de
    // la session. Les bruitages, eux, revenaient — `AudioEngine.ensure()`
    // reprend le contexte suspendu à chaque image. Le joueur se retrouvait donc
    // avec les effets mais sans musique, sans comprendre pourquoi.
    //
    // On remet `scene` à null avant de rappeler `setScene` : ça contourne la
    // garde sans la supprimer, et le fondu enchaîné repart proprement.
    const gererVisibilite = () => {
      if (globalThis.document?.visibilityState !== "visible") {
        this.pauseForInterruption("visibility");
        return;
      }
      this.audio?.ensure?.();
      this.syncAudioSettings?.();
      const scene = this.music?.scene;
      if (scene) {
        this.music.scene = null;
        this.music.setScene(scene);
      }
      if (this.paused && this.pauseReason === "visibility") this.updatePauseDialog();
    };
    if (globalThis.document?.addEventListener) globalThis.document.addEventListener("visibilitychange", gererVisibilite);
    else globalThis.addEventListener?.("visibilitychange", gererVisibilite);
    const verifierOrientation = () => {
      if (this.mode !== "playing") return;
      if (this.isPortraitCombat()) this.pauseForInterruption("orientation");
      else if (this.paused && this.pauseReason === "orientation") {
        this.pauseReason = null;
        this.ui?.rotate?.classList?.add?.("hidden");
        this.updatePauseDialog();
      }
    };
    globalThis.addEventListener?.("resize", verifierOrientation, { passive: true });
    globalThis.addEventListener?.("orientationchange", verifierOrientation, { passive: true });
    // ⚠️ La musique de menu ne peut PAS démarrer au chargement : tout navigateur
    // suspend le contexte audio tant qu'aucun geste utilisateur n'a eu lieu.
    // On l'arme donc au premier pointeur, une seule fois, sans rien bloquer.
    const armerMusique = () => {
      if (this.audio?.ensure?.()) {
        this.syncAudioSettings?.();
        if (this.mode === "menu") this.music?.setScene?.("menu");
      }
    };
    globalThis.addEventListener?.("pointerdown", armerMusique, { once: true });
    globalThis.addEventListener?.("keydown", armerMusique, { once: true });
    globalThis.addEventListener?.("pointerdown", (event) => {
      if (event.pointerType === "touch") this.setInputDevice("touch");
      else if (event.pointerType === "mouse") this.setInputDevice("keyboard");
    }, { passive: true });
    ui.play.onclick = () => this.startCombatFromMenu();
    if (ui.versusBtn) ui.versusBtn.onclick = () => {
      this.dialogReturnFocus = globalThis.document?.activeElement || ui.versusBtn;
      if (this.openVersusLobby()) {
        ui.versusBtn.setAttribute?.("aria-expanded", "true");
        const overflow = (ui.versusScreen?.scrollHeight ?? 0) > (ui.versusScreen?.clientHeight ?? Infinity) + 1;
        (overflow ? ui.versusClose : ui.versusStart)?.focus?.();
        if (overflow && ui.versusScreen) ui.versusScreen.scrollTop = 0;
      }
    };
    if (ui.versusClose) ui.versusClose.onclick = () => {
      const returnTarget = this.dialogReturnFocus || ui.versusBtn;
      this.closeVersusLobby();
      ui.versusBtn?.setAttribute?.("aria-expanded", "false");
      returnTarget?.focus?.();
      this.dialogReturnFocus = null;
    };
    if (ui.versusStart) ui.versusStart.onclick = () => {
      this.startWithOnboarding(() => {
        this.clearActiveChallenge?.();
        ui.versusBtn?.setAttribute?.("aria-expanded", "false");
        this.startVersusMatch();
      });
    };
    if (ui.customBtn) ui.customBtn.onclick = () => this.openWorkshop(ui.customBtn);
    if (ui.menuWorkshop) ui.menuWorkshop.onclick = () => this.openWorkshop(ui.menuWorkshop);
    if (ui.customClose) ui.customClose.onclick = () => this.closeWorkshop({ save: true });
    if (ui.customCancel) ui.customCancel.onclick = () => this.closeWorkshop({ save: false });
    if (ui.customReset) ui.customReset.onclick = () => this.resetWorkshopCustomization();
    for (const tab of ui.customTabs ?? []) {
      tab.onclick = () => this.setWorkshopTab(tab.dataset?.customTab);
    }
    this.bindWorkshopOrbitControls();
    this.applyPlayerCustomization();
    if (ui.tourBtn) ui.tourBtn.onclick = () => this.startWithOnboarding(() => {
      this.clearActiveChallenge?.();
      openTourHub(this);
    });
    if (ui.menuSettings) ui.menuSettings.onclick = () => {
      this.settingsFromMenu = true;
      this.pauseReturnFocus = globalThis.document?.activeElement || ui.menuSettings;
      this.togglePause(true);
    };
    if (ui.controlsBtn) ui.controlsBtn.onclick = () => this.openControls(ui.controlsBtn);
    if (ui.replaysBtn) ui.replaysBtn.onclick = () => openReplayLibrary(this);
    if (ui.aboutBtn) ui.aboutBtn.onclick = () => openInfoHub();
    if (ui.pauseControls) ui.pauseControls.onclick = () => this.openControls(ui.pauseControls);
    for (const tab of ui.controlTabs ?? []) {
      tab.onclick = () => this.setInputDevice(tab.dataset?.controlDevice);
      tab.onkeydown = (event) => this.handleControlTabKey(event, tab);
    }
    if (ui.controlsClose) ui.controlsClose.onclick = () => this.closeControls();
    if (ui.replayOnboarding) ui.replayOnboarding.onclick = () => {
      const returnFocus = this.controlsReturnFocus || ui.controlsBtn;
      this.closeControls({ restoreFocus: false });
      this.openOnboarding(null, returnFocus);
    };
    if (ui.onboardingNext) ui.onboardingNext.onclick = () => {
      const last = Math.max(0, (ui.onboardingSteps?.length ?? 1) - 1);
      if ((this.onboardingStep ?? 0) >= last) this.finishOnboarding();
      else this.updateOnboardingStep((this.onboardingStep ?? 0) + 1);
    };
    if (ui.onboardingSkip) ui.onboardingSkip.onclick = () => this.finishOnboarding();
    ui.rematch.onclick = () => {
      if (this.playback?.replay) { this.startReplay(this.playback.replay); return; }
      if (this.versusLocal) { this.startVersusMatch(); return; }
      if (!this.tour) { this.startMatch(); return; }
      if (this.tour.challenge) { this.startTourStage(this.tour.stage); return; }
      const nextStage = this.tour.stage + 1;
      if (nextStage < TOUR_STAGES.length) this.startTourStage(nextStage);
      else this.startTour();
    };
    ui.retry.onclick = () => location.reload();
    ui.pauseBtn.onclick = () => this.togglePause();
    if (ui.settingsBtn) ui.settingsBtn.onclick = () => this.togglePause(true);
    ui.resume.onclick = () => this.togglePause(false);
    if (ui.pauseMenu) ui.pauseMenu.onclick = () => this.requestReturnToMenu(ui.pauseMenu);
    if (ui.endMenu) ui.endMenu.onclick = () => this.requestReturnToMenu(ui.endMenu);
    if (ui.leaveCancel) ui.leaveCancel.onclick = () => this.cancelReturnToMenu();
    if (ui.leaveConfirm) ui.leaveConfirm.onclick = () => this.returnToMenu();
    if (ui.skipSpectating) ui.skipSpectating.onclick = () => this.skipTourSpectating?.();
    if (ui.spectatorCycle) ui.spectatorCycle.onclick = () => this.cycleSpectatorCamera?.();
    if (ui.spectatorFast) ui.spectatorFast.onclick = () => this.toggleSpectatorFastForward?.();
    ui.restart.onclick = () => {
      if (this.versusLocal) this.startVersusMatch();
      else if (this.tour) this.startTourStage(this.tour.stage);
      else this.startMatch();
    };
    ui.sound.onclick = () => {
      const enabled = this.settings.get("audio") !== false && !this.audio.muted;
      this.audio.setMuted(enabled);
      this.settings.set("audio", !enabled);
      if (!enabled) this.audio.ensure?.();
      this.applySettingsUI();
    };
    const bindVolume = (control, output, key) => {
      if (!control) return;
      control.oninput = () => {
        const value = clamp(Number(control.value) / 100, 0, 1);
        control.style?.setProperty?.("--range-level", `${Math.round(value * 100)}%`);
        this.settings.set(key, value);
        if (output) output.textContent = `${Math.round(value * 100)}%`;
        this.audio?.ensure?.();
        this.syncAudioSettings?.();
      };
    };
    bindVolume(ui.musicVolume, ui.musicVolumeValue, "musicVolume");
    bindVolume(ui.sfxVolume, ui.sfxVolumeValue, "sfxVolume");
    if (ui.replay) ui.replay.onclick = () => this.latestReplay && this.startReplay(this.latestReplay);
    if (ui.downloadReplay) ui.downloadReplay.onclick = () => this.latestReplay && downloadReplay(this.latestReplay);
    if (ui.downloadTelemetry) ui.downloadTelemetry.onclick = () => this.downloadTelemetry();
    ui.quality.onclick = () => {
      const tier = this.quality.cycleManual();
      this.settings.set("quality", ["LQ", "MQ", "HQ"][tier]);
      this.applySettingsUI();
    };
    if (ui.hapticsToggle) ui.hapticsToggle.onclick = () => this.toggleSetting("haptics", [1, 0.5, 0]);
    // Trois paliers nommés : le défaut équilibré ouvre naturellement vers le
    // confort, puis vers la caméra vivante, sans le saut ambigu 82 → 72 %.
    if (ui.stableCameraToggle) ui.stableCameraToggle.onclick = () => this.toggleSetting("cameraRoll", [0.82, 0.94, 0.72]);
    if (ui.flashToggle) ui.flashToggle.onclick = () => this.toggleSetting("reduceFlash");
    // SANS doit vraiment produire zéro mouvement caméra, pas un mouvement atténué.
    if (ui.impactToggle) ui.impactToggle.onclick = () => {
      this.toggleSetting("impact", [1, 0.5, 0]);
      this.impact.reset();
    };
    if (ui.difficultyToggle) {
      ui.difficultyToggle.onclick = () => {
        this.toggleSetting("aiLevel", AI_LEVELS.map((level) => level.key));
        if (this.mode === "playing") this.showMessage("ADVERSAIRES : PROCHAINE PARTIE", 0.85);
      };
    }
    if (ui.leftHandedToggle) ui.leftHandedToggle.onclick = () => this.toggleSetting("leftHanded");
    if (ui.perfToggle) ui.perfToggle.onclick = () => this.toggleSetting("showPerf");
    if (ui.autoQualityToggle) ui.autoQualityToggle.onclick = () => {
      if (this.quality.manual) { this.quality.setAutomatic(); this.settings.set("quality", "auto"); }
      else { this.quality.setTier(this.quality.tier, true); this.settings.set("quality", ["LQ", "MQ", "HQ"][this.quality.tier]); }
      this.applySettingsUI();
    };
    if (ui.resetSettings) ui.resetSettings.onclick = () => {
      if (typeof globalThis.confirm === "function"
        && !globalThis.confirm("Rétablir tous les réglages, le garage et l’initiation par défaut ?")) return;
      this.resetAllSettings();
    };
    ui.bwa.onclick = () => this.requestAction(ACTION_SHIFT);
    // ── TROIS TUILES D'ARME, TIR DIRECT ──────────────────────────────────
    // La tuile TURBO est partie : elle doublonnait le double-tap sur l'eau,
    // déjà en place. Les trois tuiles rendues désignent chacune leur arme.
    const soute = (rang) => this.boats[0]?.loadout?.[rang] ?? null;
    if (ui.weaponSlot) ui.weaponSlot.onclick = () => this.fireWeaponKey(soute(0));
    if (ui.weaponHold2) ui.weaponHold2.onclick = () => this.fireWeaponKey(soute(1));
    if (ui.weaponCrate) {
      ui.weaponCrate.onclick = () => this.fireWeaponKey(this.crateWeapon()?.key ?? null);
    }
    // ⚠️ Le rétro est MAINTENU, donc il ne peut pas passer par `onclick` :
    // il faut le front descendant. Et `pointercancel` est obligatoire — sans
    // lui, un glissement hors du bouton laisserait la caméra retournée.
    if (ui.lookBack) {
      const regarder = (actif) => { this.input.lookBack = actif; };
      ui.lookBack.addEventListener("pointerdown", (event) => {
        event.preventDefault?.();
        regarder(true);
        ui.lookBack.setPointerCapture?.(event.pointerId);
      });
      for (const nom of ["pointerup", "pointercancel", "pointerleave"]) {
        ui.lookBack.addEventListener(nom, () => regarder(false));
      }
    }
    if (ui.zoomIn) ui.zoomIn.onclick = () => this.adjustCameraZoom(-0.14);
    if (ui.zoomOut) ui.zoomOut.onclick = () => this.adjustCameraZoom(0.14);
    if (ui.zoomReset) ui.zoomReset.onclick = () => this.adjustCameraZoom(1.18 - this.cameraZoom);
    addEventListener("keydown", (event) => this.handleKeyboardInput(true, event));
    addEventListener("keyup", (event) => this.handleKeyboardInput(false, event));
    this.focusWhenDialogOpens(ui.end, ui.rematch);
    this.focusWhenDialogOpens(ui.fatal, ui.retry);

    const joystickMove = (event) => {
      if (this.paused || !this.input.joy || event.pointerId !== this.input.joyId) return;
      const dx = event.clientX - this.input.joyCenterX;
      const dy = event.clientY - this.input.joyCenterY;
      const radius = 45;
      const nx = clamp(dx / radius, -1, 1);
      const ny = clamp(dy / radius, -1, 1);
      this.input.steer = nx;

      // ── BWA DASH AU DOUBLE-COUP DE JOYSTICK ────────────────────────────
      //
      // ⚠️ SANS CE GESTE, LE DASH EST INJOUABLE AU DOIGT. Ses trois autres
      // déclencheurs sont `X`, `Ctrl` et le double-tap `A`/`D` — tous au
      // clavier. Le bouton de la barre du bas en était donc le SEUL accès
      // tactile, dans un jeu conçu mobile-first.
      //
      // On détecte un FRONT MONTANT : le manche doit repasser sous le seuil
      // entre deux poussées, donc tenir la barre à fond ne déclenche rien.
      const cote = nx > JOY_DASH_THRESHOLD ? 1 : nx < -JOY_DASH_THRESHOLD ? -1 : 0;
      if (cote === 0) this.joyDashLatch = 0;
      else if (this.joyDashLatch !== cote) {
        this.joyDashLatch = cote;
        // Horloge murale, comme pour le double-tap clavier : ce handler tourne
        // dans le DOM, hors du pas fixe. Le replay n'enregistre que le BIT
        // produit, jamais le timing du geste.
        const maintenant = (globalThis.performance?.now?.() ?? 0);
        if (this.joyDashSide === cote
            && maintenant - (this.joyDashAt ?? -1e9) <= JOY_DASH_DOUBLE_TAP_MS) {
          this.joyDashSide = 0;
          this.joyDashAt = -1e9;
          this.dashDoubleTapSide = cote;
          this.requestAction(ACTION_BOOST_LATERAL);
        } else {
          this.joyDashSide = cote;
          this.joyDashAt = maintenant;
        }
      }
      // Vertical travel doubles as an intuitive mobile sail trim: push up for power,
      // pull down to depower before an impact or a violent gust.
      this.input.trim = clamp(KEYBOARD_TRIM.cruise - ny * 0.22, KEYBOARD_TRIM.min, KEYBOARD_TRIM.max);
      ui.joyKnob.style.transform = `translate(${nx * radius}px,${ny * radius * 0.35}px)`;
    };
    ui.joystick.addEventListener("pointerdown", (event) => {
      if (this.paused || this.mode !== "playing") return;
      this.input.joy = true;
      this.input.joyId = event.pointerId;
      const rect = ui.joystick.getBoundingClientRect();
      this.input.joyCenterX = rect.left + rect.width / 2;
      this.input.joyCenterY = rect.top + rect.height / 2;
      ui.joystick.setPointerCapture(event.pointerId);
      joystickMove(event);
    });
    ui.joystick.addEventListener("pointermove", joystickMove);
    const joystickEnd = (event) => {
      if (event.pointerId !== this.input.joyId) return;
      this.input.joy = false;
      this.input.joyId = null;
      this.input.steer = 0;
      this.input.trim = KEYBOARD_TRIM.cruise;
      // Le verrou retombe au relâchement : la prochaine poussée compte comme un
      // nouveau front, sinon lever le pouce puis repousser du même côté ne
      // serait jamais lu comme un deuxième coup.
      this.joyDashLatch = 0;
      ui.joyKnob.style.transform = "";
    };
    ui.joystick.addEventListener("pointerup", joystickEnd);
    ui.joystick.addEventListener("pointercancel", joystickEnd);

    // ── Barre libre : diriger n'importe où sur l'eau ────────────────────────
    //
    // Le pad reste, mais il cesse d'être le seul point d'entrée. Poser le doigt
    // (ou la souris) sur le viewport crée un centre de barre À CET ENDROIT :
    // c'est plus direct et ça laisse le pouce où il est déjà. Le pad garde son
    // intérêt pour qui veut un repère fixe.
    //
    // DOUBLE TAP = TURBO. Le seuil est en DISTANCE autant qu'en temps : sans le
    // contrôle de distance, un balayage rapide en deux temps déclencherait un
    // turbo que le joueur n'a pas demandé.
    const libre = { actif: false, id: null, x: 0, y: 0, dernierTap: -1, dernierX: 0, dernierY: 0 };
    const RAYON_LIBRE = 62;
    const DOUBLE_TAP_MS = 280;
    const DOUBLE_TAP_PX = 44;
    this.resetPointerInputs = () => {
      libre.actif = false;
      libre.id = null;
      libre.dernierTap = -1;
      libre.dernierX = 0;
      libre.dernierY = 0;
    };

    const barreLibre = (event) => {
      if (this.paused || !libre.actif || event.pointerId !== libre.id) return;
      const dx = clamp((event.clientX - libre.x) / RAYON_LIBRE, -1, 1);
      const dy = clamp((event.clientY - libre.y) / RAYON_LIBRE, -1, 1);
      this.input.steer = dx;
      this.input.trim = clamp(KEYBOARD_TRIM.cruise - dy * 0.22, KEYBOARD_TRIM.min, KEYBOARD_TRIM.max);
    };

    ui.viewport.addEventListener("contextmenu", (event) => event.preventDefault());
    ui.viewport.addEventListener("pointerdown", (event) => {
      const steeringActive = (
        (this.input.joy && event.pointerId !== this.input.joyId)
        || (libre.actif && event.pointerId !== libre.id)
      );
      if (this.beginAimPointer(event, steeringActive, ui.viewport.clientWidth)) {
        ui.viewport.setPointerCapture?.(event.pointerId);
        return;
      }
      if (this.mode !== "playing" || this.paused || this.input.joy || this.input.aimActive) return;
      const maintenant = performance.now();
      const proche = Math.hypot(event.clientX - libre.dernierX, event.clientY - libre.dernierY) < DOUBLE_TAP_PX;
      if (maintenant - libre.dernierTap < DOUBLE_TAP_MS && proche) {
        this.requestAction(ACTION_BOOST_FORWARD);
        libre.dernierTap = -1;
      } else {
        libre.dernierTap = maintenant;
      }
      libre.dernierX = event.clientX;
      libre.dernierY = event.clientY;
      libre.actif = true;
      libre.id = event.pointerId;
      libre.x = event.clientX;
      libre.y = event.clientY;
      ui.viewport.setPointerCapture?.(event.pointerId);
    });
    ui.viewport.addEventListener("pointermove", (event) => {
      if (!this.updateAimPointer(event)) barreLibre(event);
    });
    const finBarreLibre = (event) => {
      if (event.pointerId !== libre.id) return;
      libre.actif = false;
      libre.id = null;
      this.input.steer = 0;
      this.input.trim = KEYBOARD_TRIM.cruise;
    };
    const finVisee = (event, fire) => {
      const pointerId = this.input.aimPointerId;
      if (!this.endAimPointer(event, fire)) return false;
      if (ui.viewport.hasPointerCapture?.(pointerId)) ui.viewport.releasePointerCapture?.(pointerId);
      return true;
    };
    ui.viewport.addEventListener("pointerup", (event) => {
      if (!finVisee(event, true)) finBarreLibre(event);
    });
    ui.viewport.addEventListener("pointercancel", (event) => {
      if (!finVisee(event, false)) finBarreLibre(event);
    });

    const addPressedState = (button) => {
      button.addEventListener("pointerdown", () => button.classList.add("pressed"));
      button.addEventListener("pointerup", () => button.classList.remove("pressed"));
      button.addEventListener("pointercancel", () => button.classList.remove("pressed"));
      button.addEventListener("lostpointercapture", () => button.classList.remove("pressed"));
      button.addEventListener("pointerleave", () => button.classList.remove("pressed"));
      button.addEventListener("blur", () => button.classList.remove("pressed"));
    };
    [ui.weaponSlot, ui.weaponHold2, ui.weaponCrate, ui.bwa].filter(Boolean).forEach(addPressedState);

    this.renderer.domElement.addEventListener?.("wheel", (event) => {
      event.preventDefault?.();
      this.adjustCameraZoom(Math.sign(event.deltaY || 0) * 0.10);
    }, { passive: false });
  }
,
  togglePause(force) {
    if (this.mode !== "playing") {
      if (this.mode !== "menu" || (!this.settingsFromMenu && force !== true)) return;
      const open = force !== false;
      this.settingsFromMenu = open;
      this.ui.pause?.classList?.toggle?.("hidden", !open);
      this.ui.pause?.classList?.toggle?.("menu-settings", open);
      this.ui.menuSettings?.setAttribute?.("aria-expanded", String(open));
      this.updatePauseDialog();
      if (open) this.ui.resume?.focus?.();
      else {
        this.ui.pause?.classList?.remove?.("menu-settings");
        this.pauseReturnFocus?.focus?.();
        this.pauseReturnFocus = null;
      }
      return open;
    }
    const nextPaused = typeof force === "boolean" ? force : !this.paused;
    if (!nextPaused && this.isPortraitCombat()) {
      this.pauseReason = "orientation";
      this.resumeCountdownPending = true;
      this.ui?.rotate?.classList?.remove?.("hidden");
      this.updatePauseDialog();
      this.ui.resume?.focus?.();
      return true;
    }
    if (nextPaused && !this.paused) {
      this.pauseReturnFocus = globalThis.document?.activeElement || this.ui.pauseBtn;
    }
    this.settingsFromMenu = false;
    this.paused = nextPaused;
    this.clearLiveInput();
    this.ui.pause.classList.toggle("hidden", !this.paused);
    this.ui.pause.classList.remove?.("menu-settings");
    this.ui.pauseBtn?.setAttribute?.("aria-expanded", String(this.paused));
    this.ui.settingsBtn?.setAttribute?.("aria-expanded", String(this.paused));
    this.updatePauseDialog();
    if (this.paused) this.ui.resume?.focus?.();
    else {
      if (this.resumeCountdownPending) {
        this.countdown = Math.max(this.countdown ?? 0, COUNTDOWN_SECONDS + COUNTDOWN_GO_SECONDS);
        this.showMessage?.("REPRISE · TIENS BON LA BARRE", 1.1);
      }
      this.resumeCountdownPending = false;
      this.pauseReason = null;
      this.pauseReturnFocus?.focus?.();
      this.pauseReturnFocus = null;
    }
    return this.paused;
  }
};
