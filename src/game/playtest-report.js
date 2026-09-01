// Rapport de playtest : ce qu'une session a RÉELLEMENT produit, agrégé pour les
// portes Go/No-Go du MASTER_PLAN, et livrable par le testeur d'un seul geste.
//
// Pourquoi ce module existe. La télémétrie locale (`core/telemetry.js`) est
// remise à zéro à chaque `startMatch()` et ne quitte jamais l'appareil : les
// portes du plan initial — 70 % de premières contre-gîtes réussies, 50 % de
// secondes manches, manche < 75 s, replay vu, défi partagé — n'étaient donc
// mesurables nulle part. Ce module observe le flux de télémétrie pour TOUTE la
// session, réduit chaque événement dans un état borné, et produit un JSON sans
// donnée personnelle que le joueur partage lui-même (feuille de partage,
// presse-papiers ou téléchargement).
//
// ⚠️ TOUT ICI EST HORS SIMULATION. Rien n'entre dans le checksum, rien n'est lu
// par la boucle fixe, aucun tirage aléatoire. Le module est pur (aucun accès
// implicite au DOM) pour rester testable en Node et embarquable tel quel dans
// le monofichier — d'où des noms de haut niveau tous préfixés `playtest*`.

export const PLAYTEST_REPORT_VERSION = 1;
export const PLAYTEST_REPORT_KIND = "yole-bwa-brawl-playtest-report";

// Portes du MASTER_PLAN (§12 « Go/No-Go ») et de la ROADMAP (M4), reprises
// telles quelles. `direction: "min"` veut dire « au moins », `"max"` « au plus ».
// Les deux portes marquées `indicative` n'avaient pas de seuil chiffré dans le
// plan : le seuil proposé sert de repère, pas de couperet.
export const PLAYTEST_GATES = Object.freeze({
  firstShiftSuccess: Object.freeze({ label: "Première contre-gîte réussie", threshold: 0.70, direction: "min", unit: "taux" }),
  secondRound: Object.freeze({ label: "Seconde manche lancée", threshold: 0.50, direction: "min", unit: "taux" }),
  roundMedianSeconds: Object.freeze({ label: "Durée médiane d'une manche", threshold: 75, direction: "max", unit: "s" }),
  takedownUnderstood: Object.freeze({ label: "Au moins un takedown", threshold: 0.50, direction: "min", unit: "taux", indicative: true }),
  weaponDominance: Object.freeze({ label: "Part des éliminations par arme", threshold: 0.65, direction: "max", unit: "taux", indicative: true }),
  replayViewed: Object.freeze({ label: "Replay regardé", threshold: 0.20, direction: "min", unit: "taux" }),
  shared: Object.freeze({ label: "Défi partagé", threshold: 0.05, direction: "min", unit: "taux" }),
  frameP50Ms: Object.freeze({ label: "Intervalle médian entre images", threshold: 20, direction: "max", unit: "ms" })
});

// Budget d'événements bruts conservés en queue de rapport. Les portes ne
// dépendent PAS de cette liste : elles sont réduites au fil de l'eau, donc
// perdre les événements les plus anciens n'efface jamais une première
// contre-gîte ou une initiation.
export const PLAYTEST_EVENT_TAIL = 400;

const PLAYTEST_ROUND_SAMPLES = 64;
const PLAYTEST_TIER_SAMPLES = 32;
const PLAYTEST_USER_AGENT_LIMIT = 160;

function playtestRound3(value) {
  return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0;
}

function playtestFinitePayload(payload) {
  const clean = {};
  for (const [key, value] of Object.entries(payload || {})) {
    if (typeof value === "number") clean[key] = Number.isFinite(value) ? playtestRound3(value) : 0;
    else if (typeof value === "string") clean[key] = value.slice(0, 80);
    else if (typeof value === "boolean" || value === null) clean[key] = value;
  }
  return clean;
}

function playtestMedian(values) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Classe une raison d'élimination (libellé FR affiché au joueur) dans une
 * famille stable. Les libellés changent avec le ton du jeu ; les familles, non.
 */
export function playtestEliminationFamily(reason = "") {
  const text = String(reason).toLocaleUpperCase("fr");
  if (/BRUME|GRAIN|ENSEVELI|SABLE/.test(text)) return "storm";
  if (/CHAVIR/.test(text)) return "capsize";
  if (/CHRONO|HORS TEMPS/.test(text)) return "timer";
  if (/COUL|DÉTRUIT|DETRUIT|EXPLOS|COQUE|STRUCTURE|NOY|ÉQUIPAGE|EQUIPAGE/.test(text)) return "weapon";
  return "other";
}

export function createPlaytestState() {
  return {
    matches: 0,
    matchesByMode: { combat: 0, tour: 0, versus: 0, training: 0, challenge: 0, daily: 0, replay: 0 },
    matchesEnded: 0,
    matchesWon: 0,
    rounds: 0,
    roundsInCurrentMatch: 0,
    maxRoundsInMatch: 0,
    roundSeconds: [],
    shiftAttempts: 0,
    shiftSuccesses: 0,
    firstShiftSuccessAtMs: null,
    shiftsBeforeFirstSuccess: null,
    training: { reason: null, elapsed: null, atMs: null },
    playerTakedowns: 0,
    playerHits: 0,
    playerEliminations: { storm: 0, capsize: 0, timer: 0, weapon: 0, other: 0 },
    eliminations: { storm: 0, capsize: 0, timer: 0, weapon: 0, other: 0 },
    weaponsUsed: {},
    pickups: 0,
    boosts: 0,
    replayViews: 0,
    challengeShares: 0,
    challengeShareAttempts: 0,
    challengesStarted: 0,
    dailyStarted: 0,
    ghostArmed: 0,
    installPromptShown: 0,
    installAccepted: 0,
    quality: { tiers: [], min: null, max: null, final: null, manual: false },
    firstMatchAtMs: null,
    lastEventAtMs: 0
  };
}

/**
 * Réducteur pur : applique un événement de télémétrie à l'état de session.
 * `atMs` est le temps écoulé depuis le début de la session, en millisecondes.
 */
export function playtestApplyEvent(state, type, payload = {}, atMs = 0) {
  if (!state || !type) return state;
  const data = payload || {};
  state.lastEventAtMs = Math.max(state.lastEventAtMs, atMs | 0);
  switch (type) {
    case "match_start": {
      state.matches++;
      state.roundsInCurrentMatch = 0;
      if (state.firstMatchAtMs === null) state.firstMatchAtMs = atMs | 0;
      if (data.replay) state.matchesByMode.replay++;
      else if (data.versus) state.matchesByMode.versus++;
      else if (data.tour) state.matchesByMode.tour++;
      else state.matchesByMode.combat++;
      if (data.training) state.matchesByMode.training++;
      if (data.challenge) state.matchesByMode.challenge++;
      if (data.daily) state.matchesByMode.daily++;
      break;
    }
    case "round_start":
    case "tour_stage_start": {
      state.rounds++;
      state.roundsInCurrentMatch++;
      state.maxRoundsInMatch = Math.max(state.maxRoundsInMatch, state.roundsInCurrentMatch);
      break;
    }
    case "round_end":
    case "tour_stage_end": {
      if (Number.isFinite(data.seconds) && data.seconds >= 0) {
        state.roundSeconds.push(playtestRound3(data.seconds));
        if (state.roundSeconds.length > PLAYTEST_ROUND_SAMPLES) state.roundSeconds.shift();
      }
      break;
    }
    case "match_end": {
      state.matchesEnded++;
      if (data.playerWon === true) state.matchesWon++;
      break;
    }
    case "bwa_shift": {
      // Seul le joueur compte : la Mêlée locale étiquette J2 avec `boat`.
      if (Number.isInteger(data.boat) && data.boat !== 0) break;
      state.shiftAttempts++;
      if (data.critical === true) {
        state.shiftSuccesses++;
        if (state.firstShiftSuccessAtMs === null) {
          state.firstShiftSuccessAtMs = atMs | 0;
          state.shiftsBeforeFirstSuccess = state.shiftAttempts - 1;
        }
      }
      break;
    }
    case "first_run_training_unlock": {
      state.training = {
        reason: typeof data.reason === "string" ? data.reason : "unknown",
        elapsed: Number.isFinite(data.elapsed) ? playtestRound3(data.elapsed) : null,
        atMs: atMs | 0
      };
      break;
    }
    case "takedown": {
      if (data.attacker === 0) state.playerTakedowns++;
      break;
    }
    case "player_hit": {
      state.playerHits++;
      break;
    }
    case "elimination": {
      const family = playtestEliminationFamily(data.reason);
      state.eliminations[family]++;
      if (data.boat === 0) state.playerEliminations[family]++;
      break;
    }
    case "pickup": state.pickups++; break;
    case "boost_forward":
    case "boost_lateral": state.boosts++; break;
    case "replay_started": state.replayViews++; break;
    case "challenge_shared":
    case "challenge_copied": state.challengeShares++; state.challengeShareAttempts++; break;
    case "challenge_cancelled":
    case "challenge_unavailable": state.challengeShareAttempts++; break;
    case "challenge_started": state.challengesStarted++; break;
    case "daily_challenge_started": state.dailyStarted++; break;
    case "ghost_armed": state.ghostArmed++; break;
    case "install_prompt_shown": state.installPromptShown++; break;
    case "install_prompt_accepted": state.installAccepted++; break;
    case "quality_tier": {
      if (!Number.isInteger(data.tier)) break;
      const quality = state.quality;
      quality.tiers.push(data.tier);
      if (quality.tiers.length > PLAYTEST_TIER_SAMPLES) quality.tiers.shift();
      quality.min = quality.min === null ? data.tier : Math.min(quality.min, data.tier);
      quality.max = quality.max === null ? data.tier : Math.max(quality.max, data.tier);
      quality.final = data.tier;
      quality.manual = data.manual === true;
      break;
    }
    default: {
      if (type.startsWith("weapon_")) {
        const weapon = type.slice("weapon_".length);
        state.weaponsUsed[weapon] = (state.weaponsUsed[weapon] || 0) + 1;
      }
    }
  }
  return state;
}

/** Les portes Go/No-Go d'UNE session. L'agrégation entre testeurs se fait dans tools/playtest_aggregate.mjs. */
export function computeSessionGates(state, frames = null) {
  const eliminated = Object.values(state.eliminations).reduce((sum, count) => sum + count, 0);
  const weaponShare = eliminated > 0
    ? (state.eliminations.weapon + state.eliminations.other) / eliminated
    : null;
  return {
    firstShiftSuccess: {
      value: state.firstShiftSuccessAtMs !== null,
      secondsToFirst: state.firstShiftSuccessAtMs !== null ? playtestRound3(state.firstShiftSuccessAtMs / 1000) : null,
      attemptsBefore: state.shiftsBeforeFirstSuccess,
      attempts: state.shiftAttempts,
      successes: state.shiftSuccesses
    },
    secondRound: {
      value: state.maxRoundsInMatch >= 2 || state.matches >= 2,
      rounds: state.rounds,
      matches: state.matches,
      rematch: state.matches >= 2
    },
    roundMedianSeconds: {
      value: playtestMedian(state.roundSeconds),
      samples: state.roundSeconds.length,
      max: state.roundSeconds.length ? Math.max(...state.roundSeconds) : null
    },
    takedownUnderstood: {
      value: state.playerTakedowns >= 1,
      takedowns: state.playerTakedowns
    },
    weaponDominance: {
      value: weaponShare === null ? null : playtestRound3(weaponShare),
      eliminations: { ...state.eliminations },
      playerEliminations: { ...state.playerEliminations }
    },
    replayViewed: { value: state.replayViews >= 1, views: state.replayViews },
    shared: { value: state.challengeShares >= 1, shares: state.challengeShares, attempts: state.challengeShareAttempts },
    frameP50Ms: {
      value: frames?.interval?.p50 ?? null,
      p95: frames?.interval?.p95 ?? null,
      workP50: frames?.work?.p50 ?? null,
      longFrameRate: frames?.longFrameRate ?? null
    },
    training: { ...state.training },
    outcome: {
      matchesEnded: state.matchesEnded,
      matchesWon: state.matchesWon,
      quality: { ...state.quality, tiers: undefined }
    }
  };
}

/** Verdict d'une porte pour une valeur agrégée (taux ou mesure). `null` = pas de donnée. */
export function playtestGateVerdict(gateKey, value) {
  const gate = PLAYTEST_GATES[gateKey];
  if (!gate || value === null || value === undefined || !Number.isFinite(value)) return null;
  return gate.direction === "max" ? value <= gate.threshold : value >= gate.threshold;
}

/**
 * Histogramme d'images à mémoire constante : intervalle entre deux images et
 * temps de travail de `frame()`. Les percentiles sortent en bornes hautes de
 * classe, ce qui suffit pour distinguer 16, 33 et 100 ms.
 */
export class FrameSampler {
  constructor(bucketMs = 2, buckets = 96) {
    this.bucketMs = Math.max(0.5, Number(bucketMs) || 2);
    this.buckets = Math.max(8, buckets | 0);
    this.interval = new Uint32Array(this.buckets);
    this.work = new Uint32Array(this.buckets);
    this.reset();
  }

  reset() {
    this.interval.fill(0);
    this.work.fill(0);
    this.count = 0;
    this.intervalSum = 0;
    this.workSum = 0;
    this.intervalMax = 0;
    this.workMax = 0;
    this.longFrames = 0;
  }

  bucketOf(ms) {
    return Math.min(this.buckets - 1, Math.max(0, Math.floor(ms / this.bucketMs)));
  }

  add(intervalMs, workMs = intervalMs) {
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) return false;
    const work = Number.isFinite(workMs) && workMs >= 0 ? workMs : intervalMs;
    this.interval[this.bucketOf(intervalMs)]++;
    this.work[this.bucketOf(work)]++;
    this.count++;
    this.intervalSum += intervalMs;
    this.workSum += work;
    this.intervalMax = Math.max(this.intervalMax, intervalMs);
    this.workMax = Math.max(this.workMax, work);
    if (intervalMs > 50) this.longFrames++;
    return true;
  }

  percentile(histogram, fraction) {
    if (!this.count) return null;
    const target = Math.max(1, Math.ceil(this.count * fraction));
    let seen = 0;
    for (let index = 0; index < histogram.length; index++) {
      seen += histogram[index];
      if (seen >= target) return (index + 1) * this.bucketMs;
    }
    return this.buckets * this.bucketMs;
  }

  stats() {
    if (!this.count) return { frames: 0, interval: null, work: null, longFrames: 0, longFrameRate: null };
    return {
      frames: this.count,
      interval: {
        p50: this.percentile(this.interval, 0.5),
        p95: this.percentile(this.interval, 0.95),
        mean: playtestRound3(this.intervalSum / this.count),
        max: playtestRound3(this.intervalMax)
      },
      work: {
        p50: this.percentile(this.work, 0.5),
        p95: this.percentile(this.work, 0.95),
        mean: playtestRound3(this.workSum / this.count),
        max: playtestRound3(this.workMax)
      },
      longFrames: this.longFrames,
      longFrameRate: playtestRound3(this.longFrames / this.count)
    };
  }
}

/**
 * Journal de session : survit à `telemetry.clear()`, réduit chaque événement
 * dans l'état des portes et garde une queue bornée d'événements bruts.
 */
export class PlaytestJournal {
  constructor({ now = () => Date.now(), tail = PLAYTEST_EVENT_TAIL } = {}) {
    this.now = typeof now === "function" ? now : () => Date.now();
    this.tail = Math.max(20, tail | 0);
    this.startedAt = this.now();
    this.state = createPlaytestState();
    this.events = [];
    this.dropped = 0;
    this.total = 0;
  }

  get elapsedMs() {
    return Math.max(0, Math.round(this.now() - this.startedAt));
  }

  observe(type, payload = {}, gameTime = 0) {
    if (!type) return false;
    const atMs = this.elapsedMs;
    const clean = playtestFinitePayload(payload);
    playtestApplyEvent(this.state, String(type), clean, atMs);
    this.events.push({ at: atMs, type: String(type), payload: clean, gameTime: playtestRound3(gameTime) });
    this.total++;
    if (this.events.length > this.tail) {
      this.events.splice(0, this.events.length - this.tail);
      this.dropped++;
    }
    return true;
  }

  snapshot() {
    return {
      startedAt: new Date(this.startedAt).toISOString(),
      elapsedMs: this.elapsedMs,
      total: this.total,
      dropped: this.dropped,
      state: JSON.parse(JSON.stringify(this.state)),
      events: this.events.slice()
    };
  }
}

/**
 * Profil d'appareil sans identifiant : de quoi répondre à « sur quoi ça a tourné ? »
 * sans jamais répondre à « qui ? ». Chaque lecture est gardée : en Node ou dans
 * un harnais, tout peut manquer.
 */
export function describeDevice({
  navigatorObject = globalThis.navigator,
  windowObject = globalThis,
  renderer = null
} = {}) {
  const device = {
    userAgent: typeof navigatorObject?.userAgent === "string" ? navigatorObject.userAgent.slice(0, PLAYTEST_USER_AGENT_LIMIT) : null,
    language: typeof navigatorObject?.language === "string" ? navigatorObject.language.slice(0, 12) : null,
    hardwareConcurrency: Number.isFinite(navigatorObject?.hardwareConcurrency) ? navigatorObject.hardwareConcurrency : null,
    deviceMemoryGb: Number.isFinite(navigatorObject?.deviceMemory) ? navigatorObject.deviceMemory : null,
    touchPoints: Number.isFinite(navigatorObject?.maxTouchPoints) ? navigatorObject.maxTouchPoints : null,
    coarsePointer: null,
    standalone: null,
    devicePixelRatio: Number.isFinite(windowObject?.devicePixelRatio) ? playtestRound3(windowObject.devicePixelRatio) : null,
    viewport: Number.isFinite(windowObject?.innerWidth) && Number.isFinite(windowObject?.innerHeight)
      ? [windowObject.innerWidth | 0, windowObject.innerHeight | 0]
      : null,
    gpu: null,
    webgl2: null
  };
  try {
    if (typeof windowObject?.matchMedia === "function") {
      device.coarsePointer = Boolean(windowObject.matchMedia("(pointer:coarse)")?.matches);
      device.standalone = Boolean(windowObject.matchMedia("(display-mode: standalone)")?.matches)
        || navigatorObject?.standalone === true;
    }
  } catch { /* matchMedia absent ou refusé */ }
  try {
    const context = renderer?.getContext?.();
    if (context) {
      device.webgl2 = typeof globalThis.WebGL2RenderingContext === "function"
        ? context instanceof globalThis.WebGL2RenderingContext
        : null;
      const info = context.getExtension?.("WEBGL_debug_renderer_info");
      const unmasked = info ? context.getParameter?.(info.UNMASKED_RENDERER_WEBGL) : null;
      if (typeof unmasked === "string") device.gpu = unmasked.slice(0, 120);
    }
  } catch { /* contexte perdu ou extension refusée */ }
  return device;
}

/** Assemble le rapport complet. Tous les blocs sont optionnels : un harnais peut n'en fournir qu'un. */
export function buildPlaytestReport({
  journal,
  frames = null,
  device = null,
  quality = null,
  build = null,
  settings = null,
  now = new Date()
} = {}) {
  const snapshot = journal?.snapshot?.() ?? { state: createPlaytestState(), events: [], total: 0, dropped: 0, elapsedMs: 0, startedAt: null };
  const frameStats = typeof frames?.stats === "function" ? frames.stats() : frames;
  const safeSettings = settings && typeof settings === "object"
    ? Object.fromEntries(
      ["quality", "qualityAuto", "aiLevel", "leftHanded", "haptics", "impact", "reduceFlash", "cameraRoll", "cameraZoom", "ghost", "trainingCompleted"]
        .filter((key) => key in settings)
        .map((key) => [key, settings[key]])
    )
    : null;
  if (safeSettings && Array.isArray(settings?.loadout)) safeSettings.loadout = settings.loadout.slice(0, 2).map(String);
  return {
    kind: PLAYTEST_REPORT_KIND,
    version: PLAYTEST_REPORT_VERSION,
    createdAt: (now instanceof Date ? now : new Date(now)).toISOString(),
    sessionStartedAt: snapshot.startedAt,
    sessionSeconds: playtestRound3((snapshot.elapsedMs || 0) / 1000),
    build: build && typeof build === "object" ? { ...build } : null,
    device,
    quality: quality && typeof quality === "object" ? { ...quality } : null,
    frames: frameStats,
    gates: computeSessionGates(snapshot.state, frameStats),
    state: snapshot.state,
    settings: safeSettings,
    eventsTotal: snapshot.total,
    eventsDropped: snapshot.dropped,
    events: snapshot.events
  };
}

/** Le même rapport sans la queue d'événements : tient dans un message ou un presse-papiers. */
export function compactPlaytestReport(report) {
  if (!report || typeof report !== "object") return null;
  const { events, ...compact } = report;
  return { ...compact, eventsOmitted: Array.isArray(events) ? events.length : 0 };
}

export function playtestReportFilename(report) {
  const stamp = String(report?.createdAt || new Date().toISOString())
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "")
    .replace("T", "-")
    .slice(0, 15);
  const tier = report?.quality?.label ? `-${String(report.quality.label).toLowerCase()}` : "";
  return `yole-playtest-${stamp}${tier}.json`;
}

function playtestPercent(value) {
  return Number.isFinite(value) ? `${Math.round(value * 100)} %` : "—";
}

/** Résumé lisible par l'organisateur du test, en une dizaine de lignes. */
export function summarizePlaytestReport(report) {
  const gates = report?.gates ?? {};
  const state = report?.state ?? createPlaytestState();
  const frames = report?.frames;
  const lines = [
    "YOLE: BWA BRAWL — rapport de playtest",
    `Session ${Math.round((report?.sessionSeconds ?? 0) / 60)} min · ${state.matches} partie(s) · ${state.rounds} manche(s)`,
    `Première contre-gîte réussie : ${gates.firstShiftSuccess?.value ? `oui, après ${gates.firstShiftSuccess.secondsToFirst ?? "?"} s et ${gates.firstShiftSuccess.attemptsBefore ?? "?"} essai(s)` : "non"}`,
    `Initiation : ${gates.training?.reason ?? "non déclenchée"}${Number.isFinite(gates.training?.elapsed) ? ` en ${Math.round(gates.training.elapsed)} s` : ""}`,
    `Seconde manche : ${gates.secondRound?.value ? "oui" : "non"} · revanche : ${gates.secondRound?.rematch ? "oui" : "non"}`,
    `Durée médiane d'une manche : ${Number.isFinite(gates.roundMedianSeconds?.value) ? `${Math.round(gates.roundMedianSeconds.value)} s` : "—"}`,
    `Takedowns du joueur : ${state.playerTakedowns} · victoires : ${state.matchesWon}/${state.matchesEnded}`,
    `Éliminations par arme : ${playtestPercent(gates.weaponDominance?.value)}`,
    `Replay vu : ${gates.replayViewed?.value ? "oui" : "non"} · défi partagé : ${gates.shared?.value ? "oui" : "non"}`,
    `Images : p50 ${frames?.interval?.p50 ?? "—"} ms · p95 ${frames?.interval?.p95 ?? "—"} ms · palier ${report?.quality?.label ?? "—"}${report?.quality?.manual ? " (manuel)" : ""}`,
    `Appareil : ${report?.device?.gpu ?? "GPU inconnu"} · ${report?.device?.viewport ? report.device.viewport.join("×") : "?"} @${report?.device?.devicePixelRatio ?? "?"}${report?.device?.coarsePointer ? " · tactile" : ""}`
  ];
  return lines.join("\n");
}

/**
 * Livre le rapport par le meilleur canal disponible, dans cet ordre : fichier
 * via la feuille de partage (téléphone), texte via la feuille de partage,
 * presse-papiers, téléchargement. Chaque étape est opt-in : rien ne part sans
 * le geste du joueur qui a appelé cette fonction.
 */
export async function deliverPlaytestReport(report, {
  navigatorObject = globalThis.navigator,
  clipboard = globalThis.navigator?.clipboard,
  documentObject = globalThis.document,
  urlObject = globalThis.URL,
  BlobConstructor = globalThis.Blob,
  FileConstructor = globalThis.File,
  filename = playtestReportFilename(report)
} = {}) {
  if (!report) return "unavailable";
  const fullJson = JSON.stringify(report);
  const compactJson = JSON.stringify(compactPlaytestReport(report));
  const summary = summarizePlaytestReport(report);

  if (typeof FileConstructor === "function" && typeof navigatorObject?.canShare === "function" && typeof navigatorObject?.share === "function") {
    try {
      const file = new FileConstructor([fullJson], filename, { type: "application/json" });
      if (navigatorObject.canShare({ files: [file] })) {
        await navigatorObject.share({ files: [file], title: "Rapport de playtest YOLE", text: summary });
        return "shared_file";
      }
    } catch (error) {
      if (error?.name === "AbortError") return "cancelled";
    }
  }
  if (typeof navigatorObject?.share === "function") {
    try {
      await navigatorObject.share({ title: "Rapport de playtest YOLE", text: `${summary}\n\n${compactJson}` });
      return "shared_text";
    } catch (error) {
      if (error?.name === "AbortError") return "cancelled";
    }
  }
  if (typeof clipboard?.writeText === "function") {
    try {
      await clipboard.writeText(`${summary}\n\n${compactJson}`);
      return "copied";
    } catch { /* presse-papiers refusé : on tente le téléchargement */ }
  }
  if (typeof BlobConstructor === "function" && typeof urlObject?.createObjectURL === "function" && documentObject?.createElement) {
    try {
      const blob = new BlobConstructor([fullJson], { type: "application/json" });
      const href = urlObject.createObjectURL(blob);
      const anchor = documentObject.createElement("a");
      anchor.href = href;
      anchor.download = filename;
      anchor.click?.();
      setTimeout(() => urlObject.revokeObjectURL?.(href), 1000);
      return "downloaded";
    } catch { /* téléchargement bloqué */ }
  }
  return "unavailable";
}

/** Libellés d'état après livraison, communs au bouton de fin et à celui de la pause. */
export const PLAYTEST_DELIVERY_STATUS = Object.freeze({
  shared_file: "Rapport envoyé en fichier · merci, c'est exactement ce qu'il nous faut.",
  shared_text: "Rapport envoyé en texte · le résumé et les mesures sont partis.",
  copied: "Rapport copié · colle-le dans le groupe de test ou un mail.",
  downloaded: "Rapport téléchargé · envoie le fichier .json à l'équipe.",
  cancelled: "Partage annulé · ton rapport reste prêt.",
  unavailable: "Partage indisponible ici · utilise TÉLÉMÉTRIE dans les outils avancés."
});
