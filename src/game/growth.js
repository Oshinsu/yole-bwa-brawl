import { seedFromString } from "../core/rng.js";

export const COMPLETED_RUN_KEY = "yole-bwa-brawl.completed-run.v1";
export const CHALLENGE_VERSION = 1;

const clampStage = (value, stageCount = 8) => {
  const stage = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(stage)) return 0;
  return Math.max(0, Math.min(Math.max(0, stageCount - 1), stage));
};

export function seedFromUrl(value, fallback = 0x0b0a2026) {
  const source = String(value ?? "").trim();
  if (!source) return fallback >>> 0;
  if (/^0x[0-9a-f]{1,8}$/i.test(source)) return Number.parseInt(source.slice(2), 16) >>> 0;
  if (/^n:[0-9a-z]{1,7}$/i.test(source)) return Number.parseInt(source.slice(2), 36) >>> 0;
  return seedFromString(source);
}

export function encodeSeed(seed) {
  return `0x${(Number(seed) >>> 0).toString(16).padStart(8, "0")}`;
}

export function dailyChallengeId(date = new Date()) {
  const instant = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(instant.getTime())) return "1970-01-01";
  return instant.toISOString().slice(0, 10);
}

export function dailyChallengeSeed(date = new Date()) {
  return seedFromString(`yole-bwa-brawl:daily:${dailyChallengeId(date)}`);
}

export function readChallenge(search = "", stageCount = 8) {
  const params = search instanceof URLSearchParams
    ? search
    : new URLSearchParams(String(search).replace(/^\?/, ""));
  const active = params.get("challenge") === String(CHALLENGE_VERSION);
  if (!active) return null;
  const mode = params.get("mode") === "tour" ? "tour" : "combat";
  return Object.freeze({
    active: true,
    version: CHALLENGE_VERSION,
    mode,
    stage: mode === "tour" ? clampStage(params.get("stage"), stageCount) : 0,
    seed: seedFromUrl(params.get("seed")),
    daily: params.get("daily") || "",
    // Arène de Combat Box (passe 80) : validée côté jeu par resolveArena.
    arena: params.get("arena") || ""
  });
}

export function buildChallengeUrl({
  href,
  seed,
  mode = "combat",
  stage = 0,
  daily = "",
  arena = ""
}) {
  const url = new URL(href, "https://example.invalid/");
  url.hash = "";
  url.search = "";
  url.searchParams.set("challenge", String(CHALLENGE_VERSION));
  url.searchParams.set("mode", mode === "tour" ? "tour" : "combat");
  url.searchParams.set("seed", encodeSeed(seed));
  if (mode === "tour") url.searchParams.set("stage", String(clampStage(stage)));
  if (daily) url.searchParams.set("daily", String(daily));
  // Même mer, même seed… et même carte : sans le slug, l'ami recevrait
  // l'arène de SA rotation de session.
  if (arena && mode !== "tour") url.searchParams.set("arena", String(arena));
  return url.href;
}

export function challengeCopy({
  url,
  mode = "combat",
  stage = 0,
  won = false,
  score = 0,
  speed = 0,
  daily = ""
}) {
  const context = daily
    ? `Défi du jour ${daily}`
    : mode === "tour"
      ? `Étape ${clampStage(stage) + 1} du Grand Tour`
      : "Combat Box";
  const result = won
    ? `J’ai gagné avec ${Math.max(0, Number(score) || 0)} takedown(s)`
    : `J’ai atteint ${Math.max(0, Math.round(Number(speed) || 0))} km/h`;
  return Object.freeze({
    title: "YOLE: BWA BRAWL — relève mon défi",
    text: `${context} · ${result}. Même mer, même seed : à toi de faire mieux !`,
    url: String(url)
  });
}

function storageRead(storage, key) {
  try { return storage?.getItem?.(key) ?? null; } catch { return null; }
}

function storageWrite(storage, key, value) {
  try {
    storage?.setItem?.(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeLocalStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // Une origine opaque ou une politique navigateur stricte peut lever dès
    // l'accès à la propriété, avant même getItem(). La partie reste jouable,
    // simplement sans persistance.
    return null;
  }
}

export async function deliverChallenge(payload, {
  navigatorObject = globalThis.navigator,
  clipboard = globalThis.navigator?.clipboard
} = {}) {
  if (typeof navigatorObject?.share === "function") {
    try {
      await navigatorObject.share(payload);
      return "shared";
    } catch (error) {
      if (error?.name === "AbortError") return "cancelled";
    }
  }
  if (typeof clipboard?.writeText === "function") {
    await clipboard.writeText(`${payload.text}\n${payload.url}`);
    return "copied";
  }
  return "unavailable";
}

export const GrowthSystems = {
  initGrowth(params = new URLSearchParams(globalThis.location?.search ?? "")) {
    const shortcutDaily = params.get("daily") === "1";
    const daily = shortcutDaily ? dailyChallengeId() : "";
    this.inboundChallenge = readChallenge(params) || (shortcutDaily ? Object.freeze({
      active: true,
      version: CHALLENGE_VERSION,
      mode: "combat",
      stage: 0,
      seed: dailyChallengeSeed(),
      daily
    }) : null);
    this.activeChallenge = this.inboundChallenge;
    this.hasCompletedRun = storageRead(safeLocalStorage(), COMPLETED_RUN_KEY) === "1";
    this.installInvitation = null;
    this.lastShareableResult = null;
  },

  growthUI() {
    return {
      banner: this.ui?.challengeBanner,
      bannerLabel: this.ui?.challengeBannerLabel,
      bannerSeed: this.ui?.challengeSeed,
      start: this.ui?.challengeStart,
      daily: this.ui?.dailyChallenge,
      share: this.ui?.shareChallenge,
      shareStatus: this.ui?.shareStatus,
      endInstall: this.ui?.endInstall
    };
  },

  bindGrowthHooks() {
    const growth = this.growthUI();
    const challenge = this.inboundChallenge;
    if (challenge) {
      growth.banner?.classList?.remove?.("hidden");
      if (growth.bannerLabel) {
        growth.bannerLabel.textContent = challenge.daily
          ? `DÉFI DU JOUR · ${challenge.daily}`
          : challenge.mode === "tour"
            ? `DÉFI GRAND TOUR · ÉTAPE ${challenge.stage + 1}`
            : "DÉFI COMBAT BOX";
      }
      if (growth.bannerSeed) growth.bannerSeed.textContent = encodeSeed(challenge.seed).toUpperCase();
      this.telemetry?.track?.("challenge_opened", {
        mode: challenge.mode,
        stage: challenge.stage,
        daily: Boolean(challenge.daily)
      }, 0);
    }
    if (growth.start) {
      growth.start.onclick = () => this.startWithOnboarding(() => this.startInboundChallenge());
    }
    if (growth.daily) {
      growth.daily.onclick = () => this.startWithOnboarding(() => this.startDailyChallenge());
    }
    if (growth.share) growth.share.onclick = () => this.shareLatestChallenge();
    if (growth.endInstall) growth.endInstall.onclick = () => this.requestInstall();

    globalThis.addEventListener?.("beforeinstallprompt", (event) => {
      event.preventDefault();
      this.installInvitation = event;
      this.updateInstallAvailability();
    });
    globalThis.addEventListener?.("appinstalled", () => {
      this.installInvitation = null;
      this.ui?.install?.classList?.add?.("hidden");
      growth.endInstall?.classList?.add?.("hidden");
      this.telemetry?.track?.("appinstalled", {}, this.time ?? 0);
    });
    this.updateInstallAvailability();
  },

  clearActiveChallenge() {
    this.activeChallenge = null;
    return true;
  },

  updateInstallAvailability() {
    const available = Boolean(this.installInvitation && this.hasCompletedRun);
    this.ui?.install?.classList?.toggle?.("hidden", !available);
    this.growthUI().endInstall?.classList?.toggle?.("hidden", !available || this.mode !== "ended");
    return available;
  },

  async requestInstall() {
    const invitation = this.installInvitation;
    if (!invitation || !this.hasCompletedRun) return false;
    this.telemetry?.track?.("install_prompt_shown", {}, this.time ?? 0);
    try {
      await invitation.prompt();
      const choice = await invitation.userChoice;
      this.telemetry?.track?.(
        choice?.outcome === "accepted" ? "install_prompt_accepted" : "install_prompt_dismissed",
        {},
        this.time ?? 0
      );
    } catch {
      this.telemetry?.track?.("install_prompt_failed", {}, this.time ?? 0);
    }
    this.installInvitation = null;
    this.updateInstallAvailability();
    return true;
  },

  startInboundChallenge() {
    const challenge = this.inboundChallenge;
    if (!challenge) return false;
    this.activeChallenge = challenge;
    this.seed = challenge.seed >>> 0;
    if (challenge.mode === "tour") {
      this.tour = this.freshTour();
      this.tour.baseSeed = challenge.seed >>> 0;
      this.tour.stage = challenge.stage;
      this.tour.challenge = true;
      this.tour.challengeDaily = challenge.daily;
      this.startTourStage(challenge.stage);
    } else {
      this.tour = null;
      this.startMatch({ challenge: true, arena: challenge.arena || null });
    }
    this.telemetry?.track?.("challenge_started", {
      mode: challenge.mode,
      stage: challenge.stage,
      daily: Boolean(challenge.daily)
    }, 0);
    return true;
  },

  startDailyChallenge(date = new Date()) {
    const daily = dailyChallengeId(date);
    const seed = dailyChallengeSeed(date);
    this.inboundChallenge = Object.freeze({
      active: true,
      version: CHALLENGE_VERSION,
      mode: "combat",
      stage: 0,
      seed,
      daily
    });
    this.activeChallenge = this.inboundChallenge;
    this.seed = seed;
    this.tour = null;
    this.startMatch({ challenge: true });
    this.telemetry?.track?.("daily_challenge_started", { daily }, 0);
    return true;
  },

  noteRunCompleted({
    shareable = true,
    mode = this.tour ? "tour" : "combat",
    stage = this.tour?.stage ?? 0,
    won = false
  } = {}) {
    this.hasCompletedRun = true;
    storageWrite(safeLocalStorage(), COMPLETED_RUN_KEY, "1");
    const tourBaseSeed = this.tour?.baseSeed;
    this.lastShareableResult = shareable ? {
      mode,
      stage,
      seed: mode === "tour" && Number.isFinite(tourBaseSeed) ? tourBaseSeed >>> 0 : this.seed >>> 0,
      won: Boolean(won),
      score: this.stats?.takedowns ?? 0,
      speed: this.stats?.maxSpeed ?? 0,
      daily: this.activeChallenge?.daily || this.tour?.challengeDaily || "",
      arena: mode === "combat" ? (this.matchArena?.slug ?? "") : ""
    } : null;
    const growth = this.growthUI();
    growth.share?.classList?.toggle?.("hidden", !this.lastShareableResult);
    if (growth.shareStatus) {
      growth.shareStatus.textContent = this.lastShareableResult
        ? "Même mer, même seed · résultat prêt à partager."
        : "Partage indisponible pour cette session locale ou ce replay.";
    }
    this.updateInstallAvailability();
    this.telemetry?.track?.("match_finished", {
      mode,
      won: Boolean(won),
      shareable: Boolean(this.lastShareableResult)
    }, this.time ?? 0);
    return this.lastShareableResult;
  },

  challengeUrl(result = this.lastShareableResult) {
    if (!result) return "";
    return buildChallengeUrl({
      href: globalThis.location?.href ?? "https://example.invalid/",
      seed: result.seed,
      mode: result.mode,
      stage: result.stage,
      daily: result.daily,
      arena: result.arena ?? ""
    });
  },

  async shareLatestChallenge() {
    const result = this.lastShareableResult;
    const growth = this.growthUI();
    if (!result) return "unavailable";
    const payload = challengeCopy({ ...result, url: this.challengeUrl(result) });
    let outcome = "unavailable";
    try {
      outcome = await deliverChallenge(payload);
    } catch {
      outcome = "unavailable";
    }
    if (growth.shareStatus) {
      growth.shareStatus.textContent = {
        shared: "Défi envoyé · on se retrouve sur la même mer.",
        copied: "Lien du défi copié · colle-le dans ton groupe.",
        cancelled: "Partage annulé · ton défi reste prêt.",
        unavailable: "Copie le lien de cette page pour partager le défi."
      }[outcome];
    }
    this.telemetry?.track?.(`challenge_${outcome}`, {
      mode: result.mode,
      stage: result.stage
    }, this.time ?? 0);
    return outcome;
  }
};
