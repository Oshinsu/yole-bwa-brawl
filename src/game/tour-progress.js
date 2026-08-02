export const TOUR_PROGRESS_SCHEMA = 1;
export const TOUR_PROGRESS_KEY = "yole-bwa-brawl-v3-2-tour";

function resolveStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

function finiteInteger(value, fallback = 0, minimum = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(minimum, Math.trunc(numeric)) : fallback;
}

function normalizePoints(points, boatCount) {
  return Array.from({ length: boatCount }, (_, index) =>
    finiteInteger(Array.isArray(points) ? points[index] : 0));
}

function normalizeStats(stats = {}) {
  return {
    takedowns: finiteInteger(stats.takedowns),
    perfects: finiteInteger(stats.perfects),
    maxSpeed: Math.max(0, Number(stats.maxSpeed) || 0),
    boosts: finiteInteger(stats.boosts),
    slingshots: finiteInteger(stats.slingshots)
  };
}

function normalizeResult(result, stageCount, boatCount) {
  if (!result || typeof result !== "object") return null;
  const stage = finiteInteger(result.stage, -1);
  if (stage < 0 || stage >= stageCount) return null;
  const places = Array.isArray(result.places)
    ? result.places.map((id) => finiteInteger(id, -1)).filter((id) => id >= 0 && id < boatCount)
    : [];
  if (places.length !== boatCount || new Set(places).size !== boatCount) return null;
  return {
    stage,
    places,
    points: normalizePoints(result.points, boatCount),
    finishTicks: normalizePoints(result.finishTicks, boatCount),
    completedAt: typeof result.completedAt === "string" ? result.completedAt : ""
  };
}

export function normalizeTourProgress(value, { stageCount = 8, boatCount = 4 } = {}) {
  if (!value || typeof value !== "object" || value.schema !== TOUR_PROGRESS_SCHEMA) return null;
  const results = Array.isArray(value.results)
    ? value.results.map((result) => normalizeResult(result, stageCount, boatCount)).filter(Boolean)
    : [];
  const stage = Math.min(stageCount - 1, finiteInteger(value.stage));
  const status = value.status === "completed" ? "completed" : "active";
  return {
    schema: TOUR_PROGRESS_SCHEMA,
    status,
    stage,
    baseSeed: finiteInteger(value.baseSeed) >>> 0,
    points: normalizePoints(value.points, boatCount),
    results,
    cumulativeStats: normalizeStats(value.cumulativeStats),
    startedAt: typeof value.startedAt === "string" ? value.startedAt : "",
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
    completedAt: typeof value.completedAt === "string" ? value.completedAt : ""
  };
}

export function tourTieBreak(resultHistory, boatId) {
  let wins = 0;
  let podiums = 0;
  let finishTicks = 0;
  let dnfs = 0;
  for (const result of resultHistory ?? []) {
    const place = result.places?.indexOf(boatId) ?? -1;
    if (place === 0) wins++;
    if (place >= 0 && place < 3) podiums++;
    const tick = result.finishTicks?.[boatId] ?? 0;
    if (tick > 0) finishTicks += tick;
    else {
      dnfs++;
      finishTicks += 10_000_000;
    }
  }
  return { wins, podiums, dnfs, finishTicks };
}

export function rankTourBoats(points, results, boatCount = points?.length ?? 4) {
  return Array.from({ length: boatCount }, (_, id) => {
    const tie = tourTieBreak(results, id);
    return { id, points: finiteInteger(points?.[id]), ...tie };
  }).sort((a, b) =>
    b.points - a.points
    || b.wins - a.wins
    || b.podiums - a.podiums
    || a.dnfs - b.dnfs
    || a.finishTicks - b.finishTicks
    || a.id - b.id);
}

export class TourProgressStore {
  constructor(storage = resolveStorage(), options = {}) {
    this.storage = storage;
    this.stageCount = options.stageCount ?? 8;
    this.boatCount = options.boatCount ?? 4;
  }

  load() {
    try {
      const raw = this.storage?.getItem(TOUR_PROGRESS_KEY);
      return normalizeTourProgress(raw ? JSON.parse(raw) : null, {
        stageCount: this.stageCount,
        boatCount: this.boatCount
      });
    } catch {
      return null;
    }
  }

  save(progress) {
    const normalized = normalizeTourProgress({
      ...progress,
      schema: TOUR_PROGRESS_SCHEMA,
      updatedAt: new Date().toISOString()
    }, {
      stageCount: this.stageCount,
      boatCount: this.boatCount
    });
    if (!normalized) return null;
    if (typeof this.storage?.setItem !== "function") return null;
    try {
      this.storage.setItem(TOUR_PROGRESS_KEY, JSON.stringify(normalized));
      return normalized;
    } catch {
      return null;
    }
  }

  clear() {
    if (typeof this.storage?.removeItem !== "function") return false;
    try {
      this.storage.removeItem(TOUR_PROGRESS_KEY);
      return true;
    } catch {
      return false;
    }
  }

  hasActive() {
    return this.load()?.status === "active";
  }
}
