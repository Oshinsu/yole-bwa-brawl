function mixHash(hash, value) {
  const quantized = Math.round(value * 1000) | 0;
  hash ^= quantized;
  hash = Math.imul(hash, 16777619);
  return hash >>> 0;
}

export function checksumBoats(boats) {
  let hash = 2166136261;
  for (const boat of boats) {
    hash = mixHash(hash, boat.x);
    hash = mixHash(hash, boat.y);
    hash = mixHash(hash, boat.z);
    hash = mixHash(hash, boat.vx);
    hash = mixHash(hash, boat.vy);
    hash = mixHash(hash, boat.vz);
    hash = mixHash(hash, boat.heading);
    hash = mixHash(hash, boat.roll);
    hash = mixHash(hash, boat.pitch);
    hash = mixHash(hash, boat.waterMassKg);
    hash = mixHash(hash, boat.activeCrew);
    hash = mixHash(hash, boat.eliminated ? 1 : 0);
    if (boat.structure) {
      hash = mixHash(hash, boat.structure.hull);
      hash = mixHash(hash, boat.structure.mast);
      hash = mixHash(hash, boat.structure.sail);
    }
  }
  return hash.toString(16).padStart(8, "0");
}

function quantize(value, precision = 1000) {
  return Math.round((Number.isFinite(value) ? value : 0) * precision) / precision;
}

export const REPLAY_SCHEMA_VERSION = 2;
export const SIMULATION_VERSION = "3.7.0";
export const GAMEPLAY_VERSION = "tropical-mayhem-v3-8-balistique";

export function isReplayCompatible(replay) {
  return Boolean(
    replay
    && replay.schemaVersion === REPLAY_SCHEMA_VERSION
    && replay.simulationVersion === SIMULATION_VERSION
    && replay.fixedHz === 60
  );
}

export class ReplayRecorder {
  constructor(seed, fixedHz = 60) {
    this.seed = seed >>> 0;
    this.fixedHz = fixedHz;
    this.enabled = true;
    this.reset(seed);
  }

  reset(seed = this.seed) {
    this.seed = seed >>> 0;
    this.inputs = [];
    this.checkpoints = [];
    this.events = [];
    this.rounds = [];
    this.lastInput = null;
    this.lastInputTick = -Infinity;
    this.metadata = {};
  }

  markRound(tick, round, seed = this.seed) {
    if (!this.enabled) return;
    this.rounds.push({ tick, round, seed: seed >>> 0 });
  }

  recordEvent(tick, type, payload = {}) {
    if (!this.enabled) return;
    this.events.push({ tick, type, payload });
  }

  recordInput(tick, input) {
    if (!this.enabled) return;
    const frame = {
      tick,
      steer: quantize(input.steer),
      trim: quantize(input.trim ?? 0.82),
      aim: quantize(input.aim),
      aimPitch: quantize(input.aimPitch),
      aimActive: Boolean(input.aimActive),
      actions: input.actions >>> 0
    };
    const changed = !this.lastInput
      || frame.aimPitch !== this.lastInput.aimPitch
      || frame.steer !== this.lastInput.steer
      || frame.trim !== this.lastInput.trim
      || frame.aim !== this.lastInput.aim
      || frame.aimActive !== this.lastInput.aimActive
      || frame.actions !== 0
      || tick - this.lastInputTick >= 120;
    if (!changed) return;
    this.inputs.push(frame);
    // ⚠️ TOUT champ comparé plus haut DOIT être recopié ici. Ajouter `aimPitch`
    // à la comparaison sans l'ajouter à l'instantané le laissait `undefined` :
    // `0 !== undefined` étant toujours vrai, chaque trame passait pour modifiée
    // et la compression du flux tombait à zéro (720 trames au lieu de moins de
    // 40). Attrapé par test/replay.
    this.lastInput = {
      steer: frame.steer,
      trim: frame.trim,
      aim: frame.aim,
      aimPitch: frame.aimPitch,
      aimActive: frame.aimActive
    };
    this.lastInputTick = tick;
  }

  checkpoint(tick, boats) {
    if (!this.enabled || tick % 600 !== 0) return;
    this.checkpoints.push({ tick, checksum: checksumBoats(boats) });
  }

  finish(boats, metadata = {}) {
    this.metadata = { ...this.metadata, ...metadata };
    this.finalChecksum = checksumBoats(boats);
    this.finalTick = metadata.tick ?? this.inputs.at(-1)?.tick ?? 0;
  }

  export(simulationVersion = SIMULATION_VERSION, gameplayVersion = GAMEPLAY_VERSION) {
    return {
      schemaVersion: REPLAY_SCHEMA_VERSION,
      simulationVersion,
      gameplayVersion,
      seed: this.seed,
      // Le gréement voyage avec la graine : c'est le SEUL chemin par lequel un
      // paramètre de partie survit à une relecture. Mesuré avant : un réglage lu
      // depuis un magasin externe changeait le checksum final en silence.
      rig: this.rig ?? 1,
      // Même raison que `rig` : les IA d'un CHANNPYON ne jouent pas comme celles
      // d'un PEYI, donc relire un fichier avec un autre réglage donnerait un
      // autre checksum sans rien dire.
      aiLevel: this.aiLevel ?? "tour",
      // Même raison que `rig` et `aiLevel` : la soute décide des munitions de
      // départ, donc des décisions, donc du checksum.
      loadout: this.loadout ?? ["wave", "harpoon"],
      fixedHz: this.fixedHz,
      finalTick: this.finalTick ?? 0,
      finalChecksum: this.finalChecksum ?? null,
      metadata: this.metadata,
      rounds: this.rounds,
      inputs: this.inputs,
      checkpoints: this.checkpoints,
      events: this.events
    };
  }
}

export class ReplayPlayer {
  constructor(replay) {
    if (!replay || !Array.isArray(replay.inputs)) throw new TypeError("Invalid replay payload");
    this.replay = replay;
    this.cursor = 0;
    this.current = { steer: 0, trim: 0.82, aim: 0, aimActive: false, actions: 0 };
  }

  reset() {
    this.cursor = 0;
    this.current = { steer: 0, trim: 0.82, aim: 0, aimActive: false, actions: 0 };
  }

  inputAt(tick, out = {}) {
    let actions = 0;
    while (this.cursor < this.replay.inputs.length && this.replay.inputs[this.cursor].tick <= tick) {
      const frame = this.replay.inputs[this.cursor++];
      this.current.steer = frame.steer;
      this.current.trim = frame.trim ?? 0.82;
      this.current.aim = frame.aim ?? 0;
      this.current.aimActive = Boolean(frame.aimActive);
      if (frame.tick === tick) actions |= frame.actions >>> 0;
    }
    out.steer = this.current.steer;
    out.trim = this.current.trim;
    out.aim = this.current.aim;
    out.aimActive = this.current.aimActive;
    out.actions = actions;
    return out;
  }

  get complete() {
    return this.cursor >= this.replay.inputs.length;
  }
}

const VAULT_KEY = "yole-bwa-brawl-replays-v3-2";

function resolveReplayStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

export class ReplayVault {
  constructor(storage = resolveReplayStorage(), limit = 8) {
    this.storage = storage;
    this.limit = limit;
  }

  list() {
    try {
      const data = JSON.parse(this.storage?.getItem(VAULT_KEY) || "[]");
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  save(replay, summary = {}) {
    if (!replay) return null;
    const item = {
      id: `${Date.now().toString(36)}-${(replay.seed >>> 0).toString(16)}`,
      createdAt: new Date().toISOString(),
      summary,
      replay
    };
    try {
      const items = [item, ...this.list()].slice(0, this.limit);
      this.storage?.setItem(VAULT_KEY, JSON.stringify(items));
    } catch {
      // Storage can be unavailable or full; replay remains downloadable in memory.
    }
    return item;
  }

  latest() {
    return this.list()[0] ?? null;
  }

  load(id) {
    return this.list().find((item) => item.id === id) ?? null;
  }

  clear() {
    try { this.storage?.removeItem(VAULT_KEY); } catch { /* ignored */ }
  }
}

export function replayFilename(replay) {
  const seed = (replay?.seed >>> 0).toString(16).padStart(8, "0");
  return `yole-bwa-brawl-${seed}-${replay?.finalChecksum || "replay"}.json`;
}

export function downloadReplay(replay) {
  if (!replay || typeof Blob === "undefined" || !globalThis.URL?.createObjectURL) return false;
  const blob = new Blob([JSON.stringify(replay, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = replayFilename(replay);
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
