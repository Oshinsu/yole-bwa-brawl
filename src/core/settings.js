const STORAGE_KEY = "yole-bwa-brawl-v3-2-settings";

function resolveSettingsStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

export const DEFAULT_SETTINGS = Object.freeze({
  quality: "auto",
  cameraRoll: 0.82,
  cameraZoom: 1.18,
  reduceFlash: false,
  impact: 1,
  haptics: 1,
  audio: true,
  leftHanded: false,
  showPerf: false,
  // Personnalisation de la yole. Bornées à la LECTURE dans startMatch, jamais
  // au point d'usage : c'est la première fois qu'une valeur de localStorage
  // touche la simulation, et load() fusionne un JSON arbitraire.
  sailLivery: 0,
  rig: 1,
  // Niveau des IA. Comme `rig`, il touche la SIMULATION : il est donc borné à
  // la lecture (playerAiLevel) et voyage dans le replay, jamais relu depuis le
  // magasin au point d'usage.
  aiLevel: "tour",
  // Les DEUX armes emportées en soute, choisies au garage. Voir LOADOUT_POOL
  // dans balance.js — un réglage corrompu est rattrapé par `resolveLoadout`,
  // qui garantit toujours deux armes valides.
  loadout: ["wave", "harpoon"]
});

export class SettingsStore {
  constructor(storage = resolveSettingsStorage()) {
    this.storage = storage;
    this.values = { ...DEFAULT_SETTINGS };
    this.listeners = new Set();
    this.load();
  }

  load() {
    try {
      const raw = this.storage?.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === "object") this.values = { ...DEFAULT_SETTINGS, ...parsed };
    } catch {
      this.values = { ...DEFAULT_SETTINGS };
    }
    return this.snapshot();
  }

  save() {
    try { this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.values)); } catch { /* private mode */ }
  }

  set(key, value) {
    if (!(key in DEFAULT_SETTINGS)) return false;
    this.values[key] = value;
    this.save();
    for (const listener of this.listeners) listener(key, value, this.snapshot());
    return true;
  }

  get(key) { return this.values[key]; }
  toggle(key) { return this.set(key, !this.get(key)); }
  snapshot() { return { ...this.values }; }
  reset() { this.values = { ...DEFAULT_SETTINGS }; this.save(); return this.snapshot(); }
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
}
