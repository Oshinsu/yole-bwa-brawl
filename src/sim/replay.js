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
// 4.0.0 — 2 août 2026. Les seize points de flottabilité ont été recalés sur la
// coque VISIBLE : ils en débordaient jusqu'à 18 cm au maître-bau, le bateau
// flottant sur des points qu'aucun joueur ne voyait. `HULL_STATIONS` change,
// donc les trajectoires changent, donc tout enregistrement antérieur diverge.
//
// Majeure, pas mineure : les replays 3.x sont REFUSÉS à la lecture plutôt que
// rejoués faux. Un replay qui se lance et dérive silencieusement est pire qu'un
// replay qui s'annonce incompatible.
// 4.1.0 — profils météo par étape, pénalité d'équipage plafonnée et vraie
// manœuvre d'urgence à zéro équipier. Ces trois changements modifient les
// trajectoires : les replays 4.0 doivent être refusés plutôt que diverger.
export const SIMULATION_VERSION = "4.1.0";
// Passe joueur : score explicite, première manche PEYI, profils d'étape,
// anti-dogpile et spectateur accéléré. Le slug distingue aussi clairement les
// partages produits avant/après ce rééquilibrage.
export const GAMEPLAY_VERSION = "tropical-mayhem-v3-15-arenes";

function isReplayChecksum(value) {
  return typeof value === "string" && /^[0-9a-f]{8}$/i.test(value);
}

function areReplayCheckpointsValid(checkpoints, finalTick) {
  if (!Array.isArray(checkpoints)) return false;
  let previousTick = -1;
  for (const checkpoint of checkpoints) {
    if (
      !checkpoint
      || !Number.isInteger(checkpoint.tick)
      || checkpoint.tick < 0
      || checkpoint.tick > finalTick
      || checkpoint.tick <= previousTick
      || !isReplayChecksum(checkpoint.checksum)
    ) return false;
    previousTick = checkpoint.tick;
  }
  return true;
}

function isFiniteInRange(value, minimum, maximum) {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

function areReplayInputsValid(inputs, finalTick) {
  if (!Array.isArray(inputs)) return false;
  let previousTick = -1;
  for (const frame of inputs) {
    if (
      !frame
      || typeof frame !== "object"
      || Array.isArray(frame)
      || !Number.isInteger(frame.tick)
      || frame.tick < 0
      || frame.tick > finalTick
      || frame.tick <= previousTick
      || !isFiniteInRange(frame.steer, -1, 1)
      || !isFiniteInRange(frame.trim, 0, 1)
      || !isFiniteInRange(frame.aim, -1, 1)
      || !isFiniteInRange(frame.aimPitch, -1, 1)
      || typeof frame.aimActive !== "boolean"
      || !Number.isInteger(frame.actions)
      || frame.actions < 0
      || frame.actions > 0xffffffff
    ) return false;
    previousTick = frame.tick;
  }
  return true;
}

export function isReplayCompatible(replay) {
  return Boolean(
    replay
    && replay.schemaVersion === REPLAY_SCHEMA_VERSION
    && replay.simulationVersion === SIMULATION_VERSION
    && replay.gameplayVersion === GAMEPLAY_VERSION
    && replay.fixedHz === 60
    && Array.isArray(replay.inputs)
    && Number.isInteger(replay.finalTick)
    && replay.finalTick >= 0
    && isReplayChecksum(replay.finalChecksum)
    && areReplayInputsValid(replay.inputs, replay.finalTick)
    && areReplayCheckpointsValid(replay.checkpoints, replay.finalTick)
  );
}

// ── TRACE FANTÔME ────────────────────────────────────────────────────────────
//
// À côté des entrées quantifiées, le replay emporte la POSE de la yole du joueur
// échantillonnée à 20 Hz : x, y, z en centimètres, cap, gîte et tangage en
// milliradians. Ce n'est pas une source d'autorité — la relecture exacte reste
// celle des entrées — c'est ce qui permet de courir CONTRE la trace sans
// re-simuler la partie : un fantôme se lit, il ne se calcule pas.
//
// Un segment par manche : les positions repartent de la grille à chaque manche,
// et la manche N du fantôme n'a aucune raison de commencer au même tick que la
// manche N de la course en direct. Le lecteur aligne donc les deux sur le tick
// de DÉBUT DE MANCHE, jamais sur le tick absolu.
export const GHOST_TRACE_VERSION = 1;
export const GHOST_TRACE_STRIDE = 3;
export const GHOST_TRACE_FIELDS = 6;
export const GHOST_POSITION_SCALE = 100;
export const GHOST_ANGLE_SCALE = 1000;
const GHOST_MAX_SEGMENTS = 64;
const GHOST_MAX_VALUES = 120000 * GHOST_TRACE_FIELDS;
const GHOST_INT_LIMIT = 2 ** 31 - 1;

function ghostQuantize(value, scale) {
  const scaled = Math.round((Number.isFinite(value) ? value : 0) * scale);
  return Math.max(-GHOST_INT_LIMIT, Math.min(GHOST_INT_LIMIT, scaled));
}

function ghostLerpAngle(a, b, t) {
  let delta = (b - a) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  else if (delta < -Math.PI) delta += Math.PI * 2;
  return a + delta * t;
}

/**
 * Valide une trace lue d'un replay (stockage local, fichier importé) et la
 * renvoie normalisée, ou `null` dès qu'un champ ment. Une trace corrompue ne
 * doit jamais faire tomber la course : elle fait simplement disparaître le
 * fantôme.
 */
export function normalizeGhostTrace(trace) {
  if (!trace || typeof trace !== "object" || Array.isArray(trace)) return null;
  if (trace.version !== GHOST_TRACE_VERSION) return null;
  const stride = trace.stride;
  if (!Number.isInteger(stride) || stride < 1 || stride > 10) return null;
  const positionScale = trace.positionScale;
  const angleScale = trace.angleScale;
  if (!Number.isFinite(positionScale) || positionScale <= 0) return null;
  if (!Number.isFinite(angleScale) || angleScale <= 0) return null;
  if (!Array.isArray(trace.segments) || trace.segments.length === 0 || trace.segments.length > GHOST_MAX_SEGMENTS) return null;
  const segments = [];
  let previousRound = 0;
  let totalValues = 0;
  for (const segment of trace.segments) {
    if (!segment || typeof segment !== "object") return null;
    const { round, fromTick, firstTick, data } = segment;
    if (!Number.isInteger(round) || round <= previousRound) return null;
    if (!Number.isInteger(fromTick) || fromTick < 0) return null;
    if (!Number.isInteger(firstTick) || firstTick < fromTick) return null;
    if (!Array.isArray(data) || data.length % GHOST_TRACE_FIELDS !== 0) return null;
    totalValues += data.length;
    if (totalValues > GHOST_MAX_VALUES) return null;
    for (const value of data) {
      if (!Number.isInteger(value) || Math.abs(value) > GHOST_INT_LIMIT) return null;
    }
    segments.push({ round, fromTick, firstTick, data });
    previousRound = round;
  }
  return { version: GHOST_TRACE_VERSION, stride, positionScale, angleScale, fields: GHOST_TRACE_FIELDS, segments };
}

/**
 * Lecteur de trace : rend la pose du fantôme pour une manche et un nombre de
 * ticks écoulés depuis le début de CETTE manche, interpolée entre deux
 * échantillons. `null` quand le fantôme n'a plus rien à dire — sa manche s'est
 * finie plus tôt que celle en direct, par chavirage ou par victoire.
 */
export class GhostTrack {
  constructor(trace) {
    this.trace = normalizeGhostTrace(trace);
    if (!this.trace) throw new TypeError("Invalid ghost trace");
    this.segments = new Map(this.trace.segments.map((segment) => [segment.round, segment]));
  }

  get rounds() {
    return [...this.segments.keys()];
  }

  segment(round) {
    return this.segments.get(round) ?? null;
  }

  sampleCount(round) {
    const segment = this.segment(round);
    return segment ? segment.data.length / GHOST_TRACE_FIELDS : 0;
  }

  /** Durée couverte par la manche du fantôme, en ticks depuis son début de manche. */
  roundTicks(round) {
    const segment = this.segment(round);
    if (!segment) return 0;
    const count = segment.data.length / GHOST_TRACE_FIELDS;
    return count ? segment.firstTick - segment.fromTick + (count - 1) * this.trace.stride : 0;
  }

  poseAt(round, ticksSinceRoundStart, out = {}) {
    const segment = this.segment(round);
    if (!segment) return null;
    const count = segment.data.length / GHOST_TRACE_FIELDS;
    if (count === 0) return null;
    const { stride, positionScale, angleScale } = this.trace;
    const offset = Number.isFinite(ticksSinceRoundStart) ? ticksSinceRoundStart : 0;
    const t = (offset - (segment.firstTick - segment.fromTick)) / stride;
    if (t > count - 1 + 1e-6) return null;
    const clamped = Math.max(0, t);
    const index = Math.min(count - 1, Math.floor(clamped));
    const next = Math.min(count - 1, index + 1);
    const fraction = next === index ? 0 : clamped - index;
    const a = index * GHOST_TRACE_FIELDS;
    const b = next * GHOST_TRACE_FIELDS;
    const data = segment.data;
    out.x = (data[a] + (data[b] - data[a]) * fraction) / positionScale;
    out.y = (data[a + 1] + (data[b + 1] - data[a + 1]) * fraction) / positionScale;
    out.z = (data[a + 2] + (data[b + 2] - data[a + 2]) * fraction) / positionScale;
    out.heading = ghostLerpAngle(data[a + 3] / angleScale, data[b + 3] / angleScale, fraction);
    out.roll = (data[a + 4] + (data[b + 4] - data[a + 4]) * fraction) / angleScale;
    out.pitch = (data[a + 5] + (data[b + 5] - data[a + 5]) * fraction) / angleScale;
    return out;
  }
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
    this.ghostSegments = [];
  }

  markRound(tick, round, seed = this.seed) {
    if (!this.enabled) return;
    this.rounds.push({ tick, round, seed: seed >>> 0 });
    // Un segment de trace par manche : les yoles repartent de la grille.
    this.ghostSegments.push({ round, fromTick: tick, firstTick: -1, data: [] });
  }

  /**
   * Échantillonne la pose du joueur. Lecture seule sur `pose` : aucun état de
   * simulation n'est touché, donc rien ne bouge dans le checksum.
   */
  recordGhostSample(tick, pose) {
    if (!this.enabled || !pose) return false;
    const segment = this.ghostSegments[this.ghostSegments.length - 1];
    if (!segment) return false;
    if ((tick - segment.fromTick) % GHOST_TRACE_STRIDE !== 0) return false;
    if (segment.firstTick < 0) segment.firstTick = tick;
    segment.data.push(
      ghostQuantize(pose.x, GHOST_POSITION_SCALE),
      ghostQuantize(pose.y, GHOST_POSITION_SCALE),
      ghostQuantize(pose.z, GHOST_POSITION_SCALE),
      ghostQuantize(pose.heading, GHOST_ANGLE_SCALE),
      ghostQuantize(pose.roll, GHOST_ANGLE_SCALE),
      ghostQuantize(pose.pitch, GHOST_ANGLE_SCALE)
    );
    return true;
  }

  ghostTrace() {
    const segments = this.ghostSegments
      .filter((segment) => segment.data.length > 0 && segment.firstTick >= 0)
      .map(({ round, fromTick, firstTick, data }) => ({ round, fromTick, firstTick, data: data.slice() }));
    if (!segments.length) return null;
    return {
      version: GHOST_TRACE_VERSION,
      stride: GHOST_TRACE_STRIDE,
      positionScale: GHOST_POSITION_SCALE,
      angleScale: GHOST_ANGLE_SCALE,
      fields: GHOST_TRACE_FIELDS,
      segments
    };
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
      // Snapshot purement visuel. Il ne participe pas au checksum, mais une
      // relecture doit montrer la yole enregistrée, pas celle équipée aujourd'hui.
      customization: this.customization ?? null,
      // Même raison que `rig` : les IA d'un CHANNPYON ne jouent pas comme celles
      // d'un PEYI, donc relire un fichier avec un autre réglage donnerait un
      // autre checksum sans rien dire.
      aiLevel: this.aiLevel ?? "tour",
      // Même raison que `rig` et `aiLevel` : la soute décide des munitions de
      // départ, donc des décisions, donc du checksum.
      loadout: this.loadout ?? ["wave", "harpoon"],
      // Même raison encore : la côte de l'arène freine et repousse les yoles,
      // sa houle entre dans la physique. `null` pour une étape du Tour, dont
      // la côte vient de TOUR_STAGES via metadata.tourStage.
      arena: this.arena ?? null,
      fixedHz: this.fixedHz,
      finalTick: this.finalTick ?? 0,
      finalChecksum: this.finalChecksum ?? null,
      metadata: this.metadata,
      rounds: this.rounds,
      inputs: this.inputs,
      checkpoints: this.checkpoints,
      events: this.events,
      // Trace fantôme : optionnelle, hors checksum, ignorée par isReplayCompatible.
      ghost: this.ghostTrace()
    };
  }
}

export class ReplayPlayer {
  constructor(replay) {
    if (!replay || !Array.isArray(replay.inputs)) throw new TypeError("Invalid replay payload");
    this.replay = replay;
    this.cursor = 0;
    this.current = { steer: 0, trim: 0.82, aim: 0, aimPitch: 0, aimActive: false, actions: 0 };
    this.checkpointCursor = 0;
    this.finalValidated = false;
    this.validationError = null;
  }

  reset() {
    this.cursor = 0;
    this.current = { steer: 0, trim: 0.82, aim: 0, aimPitch: 0, aimActive: false, actions: 0 };
    this.checkpointCursor = 0;
    this.finalValidated = false;
    this.validationError = null;
  }

  inputAt(tick, out = {}) {
    let actions = 0;
    while (this.cursor < this.replay.inputs.length && this.replay.inputs[this.cursor].tick <= tick) {
      const frame = this.replay.inputs[this.cursor++];
      this.current.steer = frame.steer;
      this.current.trim = frame.trim ?? 0.82;
      this.current.aim = frame.aim ?? 0;
      this.current.aimPitch = frame.aimPitch ?? 0;
      this.current.aimActive = Boolean(frame.aimActive);
      if (frame.tick === tick) actions |= frame.actions >>> 0;
    }
    out.steer = this.current.steer;
    out.trim = this.current.trim;
    out.aim = this.current.aim;
    out.aimPitch = this.current.aimPitch;
    out.aimActive = this.current.aimActive;
    out.actions = actions;
    return out;
  }

  /**
   * Vérifie l'état autoritaire au moment exact où il a été signé.
   *
   * Cette méthode est volontairement incrémentale : un checkpoint sauté est
   * lui-même une divergence, car comparer son checksum à un état ultérieur
   * donnerait un diagnostic trompeur. Le premier écart est conservé afin que
   * l'interface puisse arrêter la lecture sans perdre sa cause.
   */
  validateState(tick, boats, { ended = false } = {}) {
    if (this.validationError) {
      return {
        // L'échec reste un état actif : si l'appelant tente de reprendre une
        // lecture divergente, il doit continuer à la bloquer.
        checked: true,
        ok: false,
        checks: [],
        error: this.validationError,
        complete: this.finalValidated
      };
    }

    const currentTick = Math.max(0, Math.trunc(Number(tick) || 0));
    const checkpoints = Array.isArray(this.replay.checkpoints) ? this.replay.checkpoints : [];
    const checks = [];
    let actualChecksum = null;
    const actual = () => actualChecksum ?? (actualChecksum = checksumBoats(boats));

    while (this.checkpointCursor < checkpoints.length) {
      const checkpoint = checkpoints[this.checkpointCursor];
      if (!checkpoint || !Number.isInteger(checkpoint.tick) || !isReplayChecksum(checkpoint.checksum)) {
        this.validationError = {
          kind: "checkpoint-invalid",
          tick: currentTick,
          checkpointIndex: this.checkpointCursor
        };
        break;
      }
      if (checkpoint.tick > currentTick) break;
      if (checkpoint.tick < currentTick) {
        this.validationError = {
          kind: "checkpoint-missed",
          tick: currentTick,
          expectedTick: checkpoint.tick,
          expected: checkpoint.checksum
        };
        break;
      }

      const observed = actual();
      const check = {
        kind: "checkpoint",
        tick: currentTick,
        expected: checkpoint.checksum,
        actual: observed,
        ok: observed === checkpoint.checksum
      };
      checks.push(check);
      this.checkpointCursor++;
      if (!check.ok) {
        this.validationError = check;
        break;
      }
    }

    const finalTick = Number.isInteger(this.replay.finalTick) ? this.replay.finalTick : null;
    const finalDue = !this.validationError
      && !this.finalValidated
      && finalTick !== null
      && isReplayChecksum(this.replay.finalChecksum)
      && (currentTick >= finalTick || ended);
    if (finalDue) {
      if (currentTick !== finalTick) {
        this.validationError = {
          kind: "final-tick",
          tick: currentTick,
          expectedTick: finalTick,
          expected: this.replay.finalChecksum
        };
      } else {
        const observed = actual();
        const check = {
          kind: "final",
          tick: currentTick,
          expected: this.replay.finalChecksum,
          actual: observed,
          ok: observed === this.replay.finalChecksum
        };
        checks.push(check);
        this.finalValidated = check.ok;
        if (!check.ok) this.validationError = check;
      }
    }

    return {
      checked: checks.length > 0 || Boolean(this.validationError),
      ok: !this.validationError,
      checks,
      error: this.validationError,
      complete: this.finalValidated
    };
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
    if (typeof this.storage?.setItem !== "function") return null;
    try {
      const items = [item, ...this.list()].slice(0, this.limit);
      this.storage.setItem(VAULT_KEY, JSON.stringify(items));
      return item;
    } catch {
      // Le replay reste téléchargeable via Game.latestReplay, mais n'est pas
      // annoncé comme sauvegardé si le stockage privé/plein l'a refusé.
      return null;
    }
  }

  latest() {
    return this.list()[0] ?? null;
  }

  load(id) {
    return this.list().find((item) => item.id === id) ?? null;
  }

  remove(id) {
    if (typeof id !== "string" && typeof id !== "number") return false;
    try {
      const items = this.list();
      const remaining = items.filter((item) => item?.id !== id);
      if (remaining.length === items.length) return false;
      if (remaining.length) this.storage?.setItem(VAULT_KEY, JSON.stringify(remaining.slice(0, this.limit)));
      else this.storage?.removeItem(VAULT_KEY);
      return true;
    } catch {
      return false;
    }
  }

  clear() {
    if (typeof this.storage?.removeItem !== "function") return false;
    try {
      this.storage.removeItem(VAULT_KEY);
      return true;
    } catch {
      return false;
    }
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
