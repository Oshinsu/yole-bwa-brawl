import { clamp } from "./math.js";

// Banque de sons synthétisée au premier démarrage : aucun asset externe, donc le
// monofichier et la PWA restent autonomes. Les voix sont rendues une fois en
// AudioBuffer puis rejouées avec variation de hauteur, de gain et de panoramique.

const TWO_PI = Math.PI * 2;

function svf(buffer, sampleRate, cutoffStart, cutoffEnd, q, mode = "low") {
  let low = 0;
  let band = 0;
  const feedback = 1 / Math.max(0.35, q);
  for (let index = 0; index < buffer.length; index++) {
    const progress = index / buffer.length;
    const cutoff = cutoffStart + (cutoffEnd - cutoffStart) * progress;
    const f = 2 * Math.sin(Math.PI * Math.min(cutoff, sampleRate * 0.24) / sampleRate);
    const input = buffer[index];
    const high = input - low - feedback * band;
    band += f * high;
    low += f * band;
    buffer[index] = mode === "low" ? low : mode === "band" ? band : high;
  }
  return buffer;
}

function noise(length, rng) {
  const data = new Float32Array(length);
  for (let index = 0; index < length; index++) data[index] = rng.signed();
  return data;
}

function normalize(buffer, peak = 0.92) {
  let maximum = 1e-9;
  for (let index = 0; index < buffer.length; index++) maximum = Math.max(maximum, Math.abs(buffer[index]));
  const scale = peak / maximum;
  for (let index = 0; index < buffer.length; index++) buffer[index] *= scale;
  return buffer;
}

function crossfadeLoop(buffer, sampleRate, seconds = 0.08) {
  const fade = Math.min(Math.floor(sampleRate * seconds), Math.floor(buffer.length / 3));
  for (let index = 0; index < fade; index++) {
    const mix = index / fade;
    const tail = buffer[buffer.length - fade + index];
    buffer[index] = buffer[index] * mix + tail * (1 - mix);
  }
  return buffer.subarray(0, buffer.length - fade);
}

// Percussion à membrane : balayage de hauteur descendant + transitoire de bruit.
function membrane(sampleRate, { duration, from, to, decay, noiseAmount = 0.35, noiseDecay = 26, sub = 0 }, rng) {
  const length = Math.floor(sampleRate * duration);
  const data = new Float32Array(length);
  const air = svf(noise(length, rng), sampleRate, 2600, 320, 0.9, "low");
  let phase = 0;
  let subPhase = 0;
  for (let index = 0; index < length; index++) {
    const t = index / sampleRate;
    const frequency = to + (from - to) * Math.exp(-t * decay * 1.7);
    phase += TWO_PI * frequency / sampleRate;
    subPhase += TWO_PI * (frequency * 0.5) / sampleRate;
    const body = Math.sin(phase) * Math.exp(-t * decay);
    const bottom = Math.sin(subPhase) * Math.exp(-t * decay * 0.62) * sub;
    data[index] = body + bottom + air[index] * noiseAmount * Math.exp(-t * noiseDecay);
  }
  return normalize(data);
}

// Gerbe d'eau : bruit passe-bande dont la fréquence monte puis retombe.
function splash(sampleRate, { duration, low = 380, high = 2700, decay = 7 }, rng) {
  const length = Math.floor(sampleRate * duration);
  const data = svf(noise(length, rng), sampleRate, high, low, 1.5, "band");
  for (let index = 0; index < length; index++) {
    const t = index / sampleRate;
    const progress = index / length;
    const bell = Math.sin(Math.PI * Math.min(1, progress * 1.35)) ** 0.7;
    data[index] *= bell * Math.exp(-t * decay * 0.35);
  }
  return normalize(data, 0.8);
}

function whoosh(sampleRate, { duration, from = 260, to = 2200, back = true }, rng) {
  const length = Math.floor(sampleRate * duration);
  const data = noise(length, rng);
  let low = 0;
  let band = 0;
  for (let index = 0; index < length; index++) {
    const progress = index / length;
    const shape = back ? Math.sin(Math.PI * progress) : progress;
    const cutoff = from + (to - from) * shape;
    const f = 2 * Math.sin(Math.PI * Math.min(cutoff, sampleRate * 0.24) / sampleRate);
    const high = data[index] - low - 0.9 * band;
    band += f * high;
    low += f * band;
    data[index] = band * Math.sin(Math.PI * progress) ** 1.2;
  }
  return normalize(data, 0.7);
}

function woodKnock(sampleRate, { duration = 0.26, partials = [186, 297, 421], decay = 22 }, rng) {
  const length = Math.floor(sampleRate * duration);
  const data = new Float32Array(length);
  const click = svf(noise(length, rng), sampleRate, 5200, 1400, 1.1, "band");
  for (let index = 0; index < length; index++) {
    const t = index / sampleRate;
    let sum = 0;
    for (let partial = 0; partial < partials.length; partial++) {
      sum += Math.sin(TWO_PI * partials[partial] * t) * Math.exp(-t * decay * (1 + partial * 0.55)) / (partial + 1);
    }
    data[index] = sum + click[index] * 0.5 * Math.exp(-t * 90);
  }
  return normalize(data, 0.82);
}

function whistle(sampleRate, { duration = 0.42, from = 620, to = 1550, decay = 3.4 }, rng) {
  const length = Math.floor(sampleRate * duration);
  const data = new Float32Array(length);
  const air = svf(noise(length, rng), sampleRate, 3200, 1800, 1.4, "band");
  let phase = 0;
  for (let index = 0; index < length; index++) {
    const t = index / sampleRate;
    const progress = index / length;
    const frequency = from + (to - from) * Math.sin(Math.PI * progress * 0.5);
    phase += TWO_PI * frequency / sampleRate;
    const bell = Math.sin(Math.PI * progress) ** 0.9;
    data[index] = (Math.sin(phase) * 0.72 + air[index] * 0.42) * bell * Math.exp(-t * decay * 0.2);
  }
  return normalize(data, 0.62);
}

function twang(sampleRate, { duration = 0.34, from = 940, to = 120, decay = 12 }, rng) {
  const length = Math.floor(sampleRate * duration);
  const data = new Float32Array(length);
  const grit = noise(length, rng);
  let phase = 0;
  for (let index = 0; index < length; index++) {
    const t = index / sampleRate;
    const frequency = to + (from - to) * Math.exp(-t * decay * 0.6);
    phase += frequency / sampleRate;
    const saw = 2 * (phase % 1) - 1;
    data[index] = (saw * 0.8 + grit[index] * 0.25 * Math.exp(-t * 70)) * Math.exp(-t * decay);
  }
  return normalize(data, 0.76);
}

// Lit continu : bruit filtré bouclable (eau, grain) ou bourdon tendu (câble).
function bed(sampleRate, { duration = 2.2, low = 180, high = 900, mode = "band" }, rng) {
  const length = Math.floor(sampleRate * duration);
  const data = svf(noise(length, rng), sampleRate, high, low, 1.2, mode);
  svf(data, sampleRate, low, high, 1.1, mode);
  normalize(data, 0.55);
  return crossfadeLoop(data, sampleRate);
}

function droneBed(sampleRate, { duration = 1.6, base = 210 }) {
  const length = Math.floor(sampleRate * duration);
  const data = new Float32Array(length);
  for (let index = 0; index < length; index++) {
    const t = index / sampleRate;
    data[index] = Math.sin(TWO_PI * base * t) * 0.6
      + Math.sin(TWO_PI * base * 1.5 * t) * 0.25
      + Math.sin(TWO_PI * base * 2.02 * t) * 0.12;
  }
  return normalize(data, 0.5);
}

// Motif tanbou pour les fins d'étape et de match.
function tanbou(sampleRate, rng, victorious = true) {
  const duration = 1.35;
  const length = Math.floor(sampleRate * duration);
  const data = new Float32Array(length);
  const pattern = victorious ? [0, 0.16, 0.32, 0.40, 0.62, 0.78, 0.94] : [0, 0.28, 0.60];
  for (let hit = 0; hit < pattern.length; hit++) {
    const accent = hit % 3 === 0 ? 1 : 0.62;
    const voice = membrane(sampleRate, {
      duration: 0.42,
      from: victorious ? 210 - hit * 8 : 150,
      to: victorious ? 78 : 52,
      decay: 11,
      noiseAmount: 0.3,
      sub: 0.3
    }, rng);
    const offset = Math.floor(pattern[hit] * sampleRate);
    for (let index = 0; index < voice.length && offset + index < length; index++) {
      data[offset + index] += voice[index] * accent * 0.7;
    }
  }
  return normalize(data, 0.86);
}

const VOICES = {
  slamLight: (sr, rng) => membrane(sr, { duration: 0.30, from: 168, to: 74, decay: 17, noiseAmount: 0.55, sub: 0.22 }, rng),
  slamHeavy: (sr, rng) => membrane(sr, { duration: 0.62, from: 132, to: 46, decay: 8.2, noiseAmount: 0.62, sub: 0.55 }, rng),
  hullSlam: (sr, rng) => splash(sr, { duration: 0.44, low: 300, high: 2100, decay: 8 }, rng),
  splash: (sr, rng) => splash(sr, { duration: 0.62, low: 260, high: 3100, decay: 6 }, rng),
  cocoFire: (sr, rng) => whistle(sr, { duration: 0.38, from: 540, to: 1420, decay: 3.2 }, rng),
  cocoBoom: (sr, rng) => membrane(sr, { duration: 0.72, from: 240, to: 62, decay: 7.4, noiseAmount: 0.85, noiseDecay: 12, sub: 0.4 }, rng),
  harpoonFire: (sr, rng) => twang(sr, { duration: 0.30, from: 1250, to: 260, decay: 16 }, rng),
  harpoonSnap: (sr, rng) => twang(sr, { duration: 0.24, from: 1850, to: 420, decay: 26 }, rng),
  mineDrop: (sr, rng) => woodKnock(sr, { duration: 0.34, partials: [118, 197, 264], decay: 15 }, rng),
  mineBlast: (sr, rng) => membrane(sr, { duration: 1.15, from: 190, to: 34, decay: 4.1, noiseAmount: 0.95, noiseDecay: 7, sub: 0.72 }, rng),
  turbo: (sr, rng) => whoosh(sr, { duration: 0.62, from: 200, to: 2600, back: false }, rng),
  dash: (sr, rng) => whoosh(sr, { duration: 0.34, from: 340, to: 2300, back: true }, rng),
  bwaShift: (sr, rng) => woodKnock(sr, { duration: 0.28, partials: [204, 331, 468], decay: 24 }, rng),
  takedown: (sr, rng) => membrane(sr, { duration: 1.05, from: 165, to: 38, decay: 4.6, noiseAmount: 0.8, noiseDecay: 9, sub: 0.66 }, rng),
  warn: (sr, rng) => membrane(sr, { duration: 0.42, from: 420, to: 300, decay: 9, noiseAmount: 0.12, sub: 0 }, rng),
  uiTick: (sr, rng) => woodKnock(sr, { duration: 0.12, partials: [640, 980], decay: 46 }, rng),
  buoy: (sr, rng) => woodKnock(sr, { duration: 0.5, partials: [880, 1320, 1760], decay: 9 }, rng),
  victory: (sr, rng) => tanbou(sr, rng, true),
  defeat: (sr, rng) => tanbou(sr, rng, false),
  bedWater: (sr, rng) => bed(sr, { duration: 2.4, low: 150, high: 1150, mode: "band" }, rng),
  bedStorm: (sr, rng) => bed(sr, { duration: 2.8, low: 45, high: 420, mode: "low" }, rng),
  bedCable: (sr) => droneBed(sr, { duration: 1.6, base: 196 })
};

// Ordre de rendu de la banque, par urgence audible : contacts, puis lit d'eau
// (continu, donc entendu tout de suite), puis armes, puis les voix de fin.
const BANK_ORDER = [
  "slamLight", "slamHeavy", "hullSlam", "splash", "bedWater",
  "cocoFire", "cocoBoom", "dash", "turbo", "bwaShift",
  "harpoonFire", "harpoonSnap", "mineDrop", "mineBlast",
  "bedStorm", "bedCable",
  "takedown", "warn", "buoy", "uiTick", "victory", "defeat"
];

// Voix disposant d'un échantillon réel (assets/audio/<nom>.mp3).
const SAMPLED_VOICES = [
  "cocoFire", "cocoBoom", "slamHeavy", "hullSlam", "splash", "turbo", "dash",
  "harpoonFire", "mineBlast", "takedown", "bwaShift", "buoy", "victory",
  "bedWater", "bedStorm"
];
const LOOPED_VOICES = new Set(["bedWater", "bedStorm"]);

const BEDS = {
  water: { voice: "bedWater", gain: 0.0, rate: 1 },
  storm: { voice: "bedStorm", gain: 0.0, rate: 1 },
  cable: { voice: "bedCable", gain: 0.0, rate: 1 }
};

// Chaque impact possède une attaque, un corps et une queue distincts. Les
// couches réutilisent la banque poolée/synthétique : aucune requête ni décodage
// au moment du choc. Le duck ne touche que les lits eau/orage/câble.
export const IMPACT_MIXES = Object.freeze({
  harpoon: {
    duck: 0.34, release: 0.24,
    layers: [
      { voice: "harpoonSnap", gain: 0.72, rate: 0.94, delay: 0 },
      { voice: "hullSlam", gain: 0.34, rate: 1.18, delay: 0.012 },
      { voice: "slamLight", gain: 0.22, rate: 1.08, delay: 0.020 }
    ]
  },
  coconut: {
    duck: 0.48, release: 0.38,
    layers: [
      { voice: "slamHeavy", gain: 0.42, rate: 0.78, delay: 0 },
      { voice: "cocoBoom", gain: 0.88, rate: 0.96, delay: 0.008 },
      { voice: "splash", gain: 0.48, rate: 0.90, delay: 0.030 }
    ]
  },
  mine: {
    duck: 0.58, release: 0.52,
    layers: [
      { voice: "slamHeavy", gain: 0.52, rate: 0.68, delay: 0 },
      { voice: "mineBlast", gain: 0.96, rate: 0.92, delay: 0.006 },
      { voice: "splash", gain: 0.50, rate: 0.76, delay: 0.034 }
    ]
  },
  barik: {
    duck: 0.44, release: 0.42,
    layers: [
      { voice: "cocoBoom", gain: 0.62, rate: 1.18, delay: 0 },
      { voice: "mineBlast", gain: 0.58, rate: 1.28, delay: 0.012 },
      { voice: "splash", gain: 0.26, rate: 1.08, delay: 0.032 }
    ]
  },
  chadron: {
    duck: 0.38, release: 0.34,
    layers: [
      { voice: "harpoonSnap", gain: 0.46, rate: 1.42, delay: 0 },
      { voice: "mineBlast", gain: 0.54, rate: 1.34, delay: 0.010 },
      { voice: "splash", gain: 0.32, rate: 1.16, delay: 0.028 }
    ]
  },
  slam: {
    duck: 0.30, release: 0.25,
    layers: [
      { voice: "slamHeavy", gain: 0.68, rate: 0.92, delay: 0 },
      { voice: "hullSlam", gain: 0.38, rate: 1.02, delay: 0.014 }
    ]
  },
  takedown: {
    duck: 0.62, release: 0.62,
    layers: [
      { voice: "slamHeavy", gain: 0.48, rate: 0.64, delay: 0 },
      { voice: "takedown", gain: 0.92, rate: 0.90, delay: 0.010 },
      { voice: "splash", gain: 0.44, rate: 0.72, delay: 0.040 }
    ]
  }
});

export class AudioEngine {
  constructor(rng) {
    this.rng = rng;
    this.context = null;
    this.muted = false;
    this.buffers = null;
    this.beds = new Map();
    this.master = null;
    this.sfxGain = null;
    this.bedGain = null;
    this.lastPlayedAt = new Map();
    this.sampled = new Set();
  }

  // Échantillons réels. Ils REMPLACENT la voix synthétisée du même nom ; toute
  // voix sans fichier garde sa version synthétisée. Un échec réseau ne coûte
  // donc rien — on retombe silencieusement sur la synthèse.
  async loadSamples(names = SAMPLED_VOICES, basePath = "./assets/audio/") {
    if (!this.context || typeof fetch !== "function") return;
    for (const name of names) {
      try {
        const response = await fetch(`${basePath}${name}.mp3`);
        if (!response.ok) continue;
        const encoded = await response.arrayBuffer();
        const buffer = await this.context.decodeAudioData(encoded);
        this.buffers.set(name, LOOPED_VOICES.has(name) ? this.seamless(buffer) : buffer);
        this.sampled.add(name);
      } catch {
        /* la voix synthétisée reste en place */
      }
    }
  }

  // Un clip généré ne boucle pas proprement : on fond la queue dans la tête.
  seamless(buffer, seconds = 0.35) {
    const fade = Math.min(Math.floor(buffer.sampleRate * seconds), Math.floor(buffer.length / 3));
    const length = buffer.length - fade;
    const out = this.context.createBuffer(buffer.numberOfChannels, length, buffer.sampleRate);
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const source = buffer.getChannelData(channel);
      const target = out.getChannelData(channel);
      target.set(source.subarray(0, length));
      for (let index = 0; index < fade; index++) {
        const mix = index / fade;
        target[index] = target[index] * mix + source[length + index] * (1 - mix);
      }
    }
    return out;
  }

  ensure() {
    if (this.muted) return false;
    const AudioContextCtor = typeof window === "undefined"
      ? null
      : window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      this.muted = true;
      return false;
    }
    if (!this.context) {
      try {
        this.context = new AudioContextCtor();
      } catch {
        this.muted = true;
        return false;
      }
      const compressor = this.context.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.ratio.value = 8;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.18;
      this.master = this.context.createGain();
      this.master.gain.value = 0.62;
      this.sfxGain = this.context.createGain();
      this.bedGain = this.context.createGain();
      this.sfxGain.connect(this.master);
      this.bedGain.connect(this.master);
      this.master.connect(compressor).connect(this.context.destination);
    }
    if (this.context.state === "suspended") this.context.resume().catch(() => {});
    if (!this.buffers) {
      this.startBank();
      // Les échantillons arrivent après coup et écrasent la synthèse au fur et
      // à mesure : aucun blocage du démarrage de match.
      this.loadSamples().catch(() => {});
    }
    return true;
  }

  // La banque complète coûte ~160 ms à rendre : la produire d'un bloc provoquait
  // un hoquet visible au coup d'envoi. Elle est donc rendue par tranches courtes,
  // dans l'ordre de VOICES — les voix de contact d'abord, les lits et les fins de
  // match ensuite. Une voix pas encore prête est simplement silencieuse.
  startBank() {
    this.buffers = new Map();
    this.pendingVoices = BANK_ORDER.slice();
    this.renderChunk(5);
    this.scheduleChunk();
  }

  renderChunk(budgetMs = 4) {
    if (!this.pendingVoices?.length) return;
    const sampleRate = this.context.sampleRate;
    const started = typeof performance === "undefined" ? 0 : performance.now();
    do {
      const name = this.pendingVoices.shift();
      try {
        const data = VOICES[name](sampleRate, this.rng);
        const buffer = this.context.createBuffer(1, data.length, sampleRate);
        buffer.getChannelData(0).set(data);
        this.buffers.set(name, buffer);
      } catch (error) {
        console.warn("audio voice failed:", name, error?.message || error);
      }
      if (typeof performance === "undefined") break;
    } while (this.pendingVoices.length && performance.now() - started < budgetMs);
  }

  scheduleChunk() {
    if (!this.pendingVoices?.length) return;
    // setTimeout plutôt que requestIdleCallback : sous une boucle de rendu à
    // 60 Hz le temps d'inactivité est rare, la banque n'arrivait jamais.
    setTimeout(() => {
      this.renderChunk(4);
      this.scheduleChunk();
    }, 0);
  }

  // Rendu complet et immédiat : réservé aux harnais de test.
  renderBank() {
    this.buffers = new Map();
    this.pendingVoices = BANK_ORDER.slice();
    while (this.pendingVoices.length) this.renderChunk(Infinity);
  }

  // Un même événement ne doit pas empiler dix voix identiques sur la même frame.
  throttled(name, minimumGap) {
    const now = this.context.currentTime;
    const previous = this.lastPlayedAt.get(name) ?? -99;
    if (now - previous < minimumGap) return true;
    this.lastPlayedAt.set(name, now);
    return false;
  }

  play(name, { gain = 0.5, rate = 1, pan = 0, spread = 0.04, gap = 0.02, delay = 0 } = {}) {
    if (!this.ensure()) return;
    const buffer = this.buffers?.get(name);
    if (!buffer) return;
    if (gap > 0 && this.throttled(name, gap)) return;
    const source = this.context.createBufferSource();
    const voiceGain = this.context.createGain();
    source.buffer = buffer;
    const real = this.sampled.has(name);
    const variation = real ? Math.min(spread, 0.03) : spread;
    source.playbackRate.value = clamp((real ? 1 : rate) + this.rng.signed() * variation, 0.35, 3.2);
    voiceGain.gain.value = clamp(gain, 0, 1.4);
    let tail = voiceGain;
    if (pan && this.context.createStereoPanner) {
      const panner = this.context.createStereoPanner();
      panner.pan.value = clamp(pan, -1, 1);
      voiceGain.connect(panner);
      tail = panner;
    }
    source.connect(voiceGain);
    tail.connect(this.sfxGain);
    source.start(this.context.currentTime + clamp(delay, 0, 0.25));
  }

  duckBeds(amount = 0.4, release = 0.35) {
    if (!this.ensure() || !this.bedGain?.gain) return;
    const now = this.context.currentTime;
    const parameter = this.bedGain.gain;
    const floor = 1 - clamp(amount, 0, 0.82);
    parameter.cancelScheduledValues?.(now);
    parameter.setValueAtTime?.(clamp(parameter.value, floor, 1), now);
    parameter.linearRampToValueAtTime?.(floor, now + 0.012);
    parameter.setTargetAtTime?.(1, now + 0.045, Math.max(0.025, release * 0.28));
  }

  playImpact(kind, { intensity = 1, pan = 0 } = {}) {
    const mix = IMPACT_MIXES[kind];
    if (!mix || !this.ensure()) return false;
    const strength = clamp(intensity, 0.18, 1.35);
    this.duckBeds(mix.duck * Math.min(1, strength), mix.release);
    for (const layer of mix.layers) {
      this.play(layer.voice, {
        gain: layer.gain * (0.48 + strength * 0.52),
        rate: layer.rate,
        pan,
        delay: layer.delay,
        spread: kind === "mine" || kind === "takedown" ? 0.018 : 0.028,
        gap: 0.035
      });
    }
    return true;
  }

  // Lits continus : démarrés une fois, pilotés en gain et en hauteur chaque frame.
  setBed(name, gain, rate = 1) {
    const definition = BEDS[name];
    if (!definition) return;
    if (gain <= 0.001 && !this.beds.has(name)) return;
    if (!this.ensure()) return;
    let entry = this.beds.get(name);
    if (!entry) {
      const buffer = this.buffers?.get(definition.voice);
      if (!buffer) return;
      const source = this.context.createBufferSource();
      const bedGain = this.context.createGain();
      source.buffer = buffer;
      source.loop = true;
      bedGain.gain.value = 0;
      source.connect(bedGain).connect(this.bedGain);
      try {
        source.start();
      } catch {
        return;
      }
      entry = { source, gain: bedGain };
      this.beds.set(name, entry);
    }
    const now = this.context.currentTime;
    entry.gain.gain.setTargetAtTime(clamp(gain, 0, 1), now, 0.09);
    entry.source.playbackRate.setTargetAtTime(clamp(rate, 0.25, 3), now, 0.12);
  }

  stopBeds() {
    for (const entry of this.beds.values()) {
      try { entry.source.stop(); } catch { /* déjà arrêté */ }
    }
    this.beds.clear();
  }

  setMuted(muted) {
    this.muted = muted;
    if (!this.context) return;
    this.master.gain.setTargetAtTime(muted ? 0 : 0.62, this.context.currentTime, 0.05);
  }
}
