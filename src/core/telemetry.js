function finitePayload(payload) {
  const clean = {};
  for (const [key, value] of Object.entries(payload || {})) {
    if (typeof value === "number") clean[key] = Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0;
    else if (["string", "boolean"].includes(typeof value) || value === null) clean[key] = value;
  }
  return clean;
}

export class LocalTelemetry {
  constructor(limit = 900) {
    this.limit = Math.max(50, limit | 0);
    this.events = [];
    this.counters = new Map();
    this.startedAt = Date.now();
  }

  track(type, payload = {}, time = globalThis.performance?.now?.() ?? 0) {
    if (!type) return;
    this.events.push({ type: String(type), payload: finitePayload(payload), time: Math.round(Number(time) * 1000) / 1000 });
    if (this.events.length > this.limit) this.events.splice(0, this.events.length - this.limit);
    this.counters.set(type, (this.counters.get(type) || 0) + 1);
  }

  count(type) { return this.counters.get(type) || 0; }
  summary() { return Object.fromEntries([...this.counters.entries()].sort((a, b) => a[0].localeCompare(b[0]))); }
  snapshot() { return { version: 2, startedAt: this.startedAt, counters: this.summary(), events: [...this.events] }; }
  export() { return JSON.stringify(this.snapshot(), null, 2); }
  clear() { this.events.length = 0; this.counters.clear(); this.startedAt = Date.now(); }
}
