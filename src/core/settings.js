import { normalizeCustomization } from "../game/customization.js";

const STORAGE_KEY = "yole-bwa-brawl-v3-2-settings";

function resolveSettingsStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

export const DEFAULT_SETTINGS = Object.freeze({
  quality: "auto",
  // Le palier que l'adaptation a DÉCOUVERT sur cette machine, distinct du
  // choix manuel ci-dessus. `null` tant qu'on n'a rien mesuré : le palier de
  // départ est alors déduit de l'appareil (voir `palierInitial`).
  qualityAuto: null,
  cameraRoll: 0.82,
  cameraZoom: 1.18,
  reduceFlash: false,
  impact: 1,
  haptics: 1,
  // Interrupteur maître historique, conservé pour la migration des sauvegardes.
  // Les deux volumes permettent désormais de régler la musique sans écraser les
  // retours de pilotage, et inversement.
  audio: true,
  musicVolume: 0.8,
  sfxVolume: 1,
  leftHanded: false,
  showPerf: false,
  onboardingSeen: false,
  // Distinct du carton d'aide : le joueur peut lire les commandes sans perdre
  // la manche-école. Les anciennes sauvegardes `onboardingSeen: true` sont
  // migrées vers `trainingCompleted: true` dans load().
  trainingCompleted: false,
  // Personnalisation de la yole. Bornées à la LECTURE dans startMatch, jamais
  // au point d'usage : c'est la première fois qu'une valeur de localStorage
  // touche la simulation, et load() fusionne un JSON arbitraire.
  sailLivery: 0,
  rig: 1,
  // Finitions visuelles du garage. `normalizeCustomization` borne ces indices
  // avant toute application au rendu ; les défauts reproduisent la yole J1
  // historique pour garder les anciennes sauvegardes visuellement stables.
  hullColor: 0,
  accentColor: 0,
  woodFinish: 0,
  crewKit: 0,
  // Niveau des IA. Comme `rig`, il touche la SIMULATION : il est donc borné à
  // la lecture (playerAiLevel) et voyage dans le replay, jamais relu depuis le
  // magasin au point d'usage.
  aiLevel: "tour",
  // Fantôme : la trace de la dernière course sur la même graine, rendue en
  // translucide à côté du joueur. Purement visuel, hors checksum ; désactivable
  // depuis la pause pour qui le trouve distrayant.
  ghost: true,
  // Les DEUX armes emportées en soute, choisies au garage. Voir LOADOUT_POOL
  // dans balance.js — un réglage corrompu est rattrapé par `resolveLoadout`,
  // qui garantit toujours deux armes valides.
  loadout: ["wave", "harpoon"]
});

const CUSTOMIZATION_SETTING_KEYS = new Set([
  "hullColor",
  "accentColor",
  "woodFinish",
  "crewKit",
  "sailLivery",
  "rig"
]);

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
      if (parsed && typeof parsed === "object") {
        const trainingCompleted = Object.hasOwn(parsed, "trainingCompleted")
          ? parsed.trainingCompleted === true
          : parsed.onboardingSeen === true;
        this.values = { ...DEFAULT_SETTINGS, ...parsed, trainingCompleted };
        Object.assign(this.values, normalizeCustomization(this.values));
      }
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
    this.values[key] = CUSTOMIZATION_SETTING_KEYS.has(key)
      ? normalizeCustomization({ ...this.values, [key]: value })[key]
      : value;
    this.save();
    for (const listener of this.listeners) listener(key, this.values[key], this.snapshot());
    return true;
  }

  get(key) { return this.values[key]; }
  toggle(key) { return this.set(key, !this.get(key)); }
  snapshot() { return { ...this.values }; }
  reset() { this.values = { ...DEFAULT_SETTINGS }; this.save(); return this.snapshot(); }
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
}
