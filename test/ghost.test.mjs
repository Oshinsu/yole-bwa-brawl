// Fantôme : la trace embarquée dans le replay se lit, s'interpole, se valide et
// s'arme sur la bonne graine — sans jamais toucher à la simulation.
import assert from "node:assert/strict";

import {
  GHOST_TRACE_STRIDE,
  GhostTrack,
  ReplayRecorder,
  isReplayCompatible,
  normalizeGhostTrace
} from "../src/sim/replay.js";
import { GhostSystems, ghostGapLabel, selectGhostReplay } from "../src/game/ghost.js";
import { GhostVisual } from "../src/render/ghost-visual.js";
import { importReplayText } from "../src/game/replay-library.js";

const THREE = await import("./mock-three.module.js");

const fakeBoats = [{
  x: 4.25, y: 0.31, z: 132.7, vx: 1.2, vy: -0.03, vz: 13.8,
  heading: 0.2, roll: -0.11, pitch: 0.04, waterMassKg: 24, activeCrew: 5, eliminated: false,
  structure: { hull: 0.88, mast: 0.93, sail: 0.79 }
}];

function poseAtTick(tick) {
  return { x: 3 + tick * 0.01, y: 0.2, z: tick * 0.25, heading: 0.1 + tick * 0.001, roll: -0.2 + tick * 0.002, pitch: 0.01 };
}

function recordRun(seed = 0xbeef, { rounds = 1, ticksPerRound = 120, metadata = {} } = {}) {
  const recorder = new ReplayRecorder(seed, 60);
  let tick = 0;
  for (let round = 1; round <= rounds; round++) {
    recorder.markRound(tick, round, seed ^ round);
    for (let step = 1; step <= ticksPerRound; step++) {
      tick++;
      recorder.recordInput(tick, { steer: 0, trim: 0.82, aim: 0, aimPitch: 0, aimActive: false, actions: 0 });
      recorder.recordGhostSample(tick, poseAtTick(tick));
    }
  }
  recorder.checkpoint(tick, fakeBoats);
  recorder.finish(fakeBoats, { tick, ...metadata });
  return recorder.export();
}

// ── Enregistrement : un échantillon tous les trois ticks, quantifié ──────────
{
  const replay = recordRun(0xbeef);
  assert.ok(isReplayCompatible(replay), "la trace n'affecte pas la compatibilité");
  assert.ok(replay.ghost, "le replay emporte une trace");
  assert.equal(replay.ghost.version, 1);
  assert.equal(replay.ghost.stride, GHOST_TRACE_STRIDE);
  assert.equal(replay.ghost.segments.length, 1);
  const segment = replay.ghost.segments[0];
  assert.equal(segment.round, 1);
  assert.equal(segment.fromTick, 0);
  assert.equal(segment.firstTick, 3, "le premier échantillon tombe au tick 3");
  assert.equal(segment.data.length / 6, 40, "120 ticks à 20 Hz = 40 échantillons");
  assert.ok(segment.data.every(Number.isInteger), "tout est entier");
  assert.equal(segment.data[0], Math.round((3 + 3 * 0.01) * 100));
  assert.equal(segment.data[3], Math.round((0.1 + 3 * 0.001) * 1000));
  assert.ok(normalizeGhostTrace(replay.ghost));
  const kilobytes = JSON.stringify(replay.ghost).length / 1024;
  assert.ok(kilobytes < 4, `une manche de 2 s pèse ${kilobytes.toFixed(1)} Ko : à l'échelle, 78 s tiennent sous 120 Ko`);
  assert.equal(JSON.stringify(replay.ghost).includes("\"heading\""), false, "aucune clé par échantillon : tableau plat");
}

// ── Enregistrement : désactivé ou sans manche, il ne fait rien ───────────────
{
  const recorder = new ReplayRecorder(1, 60);
  assert.equal(recorder.recordGhostSample(3, poseAtTick(3)), false, "sans markRound, pas de segment");
  recorder.markRound(0, 1);
  recorder.enabled = false;
  assert.equal(recorder.recordGhostSample(3, poseAtTick(3)), false);
  recorder.enabled = true;
  assert.equal(recorder.recordGhostSample(4, poseAtTick(4)), false, "hors cadence");
  assert.equal(recorder.recordGhostSample(6, poseAtTick(6)), true);
  const pose = poseAtTick(9);
  const before = JSON.stringify(pose);
  recorder.recordGhostSample(9, pose);
  assert.equal(JSON.stringify(pose), before, "la pose n'est jamais modifiée");
  recorder.finish(fakeBoats, { tick: 9 });
  assert.equal(recorder.export().ghost.segments[0].firstTick, 6);
  recorder.reset(1);
  recorder.finish(fakeBoats, { tick: 0 });
  assert.equal(recorder.export().ghost, null, "sans échantillon, pas de trace");
}

// ── Validation : tout mensonge rend null ─────────────────────────────────────
{
  const trace = recordRun(0xbeef).ghost;
  assert.ok(normalizeGhostTrace(trace));
  assert.equal(normalizeGhostTrace(null), null);
  assert.equal(normalizeGhostTrace({ ...trace, version: 2 }), null);
  assert.equal(normalizeGhostTrace({ ...trace, stride: 0 }), null);
  assert.equal(normalizeGhostTrace({ ...trace, stride: 3.5 }), null);
  assert.equal(normalizeGhostTrace({ ...trace, positionScale: 0 }), null);
  assert.equal(normalizeGhostTrace({ ...trace, segments: [] }), null);
  const tampered = JSON.parse(JSON.stringify(trace));
  tampered.segments[0].data.push(1);
  assert.equal(normalizeGhostTrace(tampered), null, "longueur non multiple de six");
  const floaty = JSON.parse(JSON.stringify(trace));
  floaty.segments[0].data[2] = 1.5;
  assert.equal(normalizeGhostTrace(floaty), null, "un flottant n'est pas un échantillon");
  const backwards = JSON.parse(JSON.stringify(trace));
  backwards.segments[0].firstTick = -1;
  assert.equal(normalizeGhostTrace(backwards), null);
  const disordered = JSON.parse(JSON.stringify(trace));
  disordered.segments.push({ ...disordered.segments[0], round: 1 });
  assert.equal(normalizeGhostTrace(disordered), null, "deux segments pour la même manche");
  assert.throws(() => new GhostTrack({ version: 9 }), TypeError);
}

// ── Lecture : interpolation, bornes, alignement sur le début de manche ───────
{
  const replay = recordRun(0xbeef, { rounds: 2, ticksPerRound: 120 });
  const track = new GhostTrack(replay.ghost);
  assert.deepEqual(track.rounds, [1, 2]);
  assert.equal(track.sampleCount(1), 40);
  assert.equal(track.roundTicks(1), 3 + 39 * 3);

  const exact = track.poseAt(1, 6, {});
  const expected = poseAtTick(6);
  assert.ok(Math.abs(exact.x - expected.x) < 0.006, "précision au centimètre");
  assert.ok(Math.abs(exact.z - expected.z) < 0.006);
  assert.ok(Math.abs(exact.heading - expected.heading) < 0.0006, "précision au milliradian");

  const between = track.poseAt(1, 7, {});
  const a = poseAtTick(6);
  const b = poseAtTick(9);
  assert.ok(Math.abs(between.z - (a.z + (b.z - a.z) / 3)) < 0.01, "interpolation linéaire entre deux échantillons");

  const early = track.poseAt(1, 0, {});
  assert.ok(Math.abs(early.z - poseAtTick(3).z) < 0.006, "avant le premier échantillon, le fantôme attend au premier");
  assert.equal(track.poseAt(1, 3 + 39 * 3, {}) !== null, true, "dernier échantillon lisible");
  assert.equal(track.poseAt(1, 3 + 39 * 3 + 4, {}), null, "au-delà de la manche du fantôme : plus rien");
  assert.equal(track.poseAt(3, 10, {}), null, "manche inconnue");

  // Manche 2 : le segment commence au tick absolu 120 dans la course du
  // fantôme ; en direct on lit avec des ticks DEPUIS le début de manche.
  const second = track.poseAt(2, 3, {});
  assert.ok(Math.abs(second.z - poseAtTick(123).z) < 0.006, "manche 2 alignée sur son propre départ");
  const scratch = { x: 0, y: 0, z: 0, heading: 0, roll: 0, pitch: 0 };
  assert.equal(track.poseAt(2, 30, scratch), scratch, "écrit dans l'objet fourni, sans allocation");
}

// ── Lecture : le cap s'interpole par le plus court arc ───────────────────────
{
  const trace = {
    version: 1, stride: 3, positionScale: 100, angleScale: 1000, fields: 6,
    segments: [{ round: 1, fromTick: 0, firstTick: 3, data: [0, 0, 0, 3100, 0, 0, 0, 0, 0, -3100, 0, 0] }]
  };
  const pose = new GhostTrack(trace).poseAt(1, 4.5, {});
  assert.ok(Math.abs(Math.abs(pose.heading) - Math.PI) < 0.02, `le cap passe par ±π (${pose.heading}), pas par zéro`);
}

// ── Sélection : même graine, même étape, la plus récente ─────────────────────
{
  const combat = recordRun(0x1111);
  const sameSeedNewer = recordRun(0x1111);
  const otherSeed = recordRun(0x2222);
  const tourStage = recordRun(0x1111, { metadata: { tourStage: 3 } });
  const noGhost = { ...recordRun(0x1111), ghost: null };
  const incompatible = { ...recordRun(0x1111), simulationVersion: "0.0.1" };
  const entries = [
    { replay: incompatible },
    { replay: noGhost },
    { replay: tourStage },
    { replay: sameSeedNewer },
    { replay: otherSeed },
    { replay: combat }
  ];
  assert.equal(selectGhostReplay(entries, { seed: 0x1111 }), sameSeedNewer, "la plus récente compatible avec trace, en Combat Box");
  assert.equal(selectGhostReplay(entries, { seed: 0x1111, tourStage: 3 }), tourStage);
  assert.equal(selectGhostReplay(entries, { seed: 0x1111, tourStage: 4 }), null);
  assert.equal(selectGhostReplay(entries, { seed: 0x3333 }), null);
  assert.equal(selectGhostReplay(null, { seed: 0x1111 }), null);
  assert.equal(selectGhostReplay([combat], { seed: 0x1111 }), combat, "une entrée nue (sans enveloppe) marche aussi");
}

assert.equal(ghostGapLabel(0), "À TA HAUTEUR");
assert.equal(ghostGapLabel(2.4), "À TA HAUTEUR");
assert.equal(ghostGapLabel(12.3), "12 M DEVANT");
assert.equal(ghostGapLabel(-8.6), "9 M DERRIÈRE");
assert.equal(ghostGapLabel(NaN), "À TA HAUTEUR");

// ── Visuel : se construit avec le moteur simulé, se pose, se libère ──────────
{
  const visual = new GhostVisual(THREE, null);
  assert.equal(visual.root.visible, false, "invisible tant qu'aucune trace ne l'anime");
  assert.equal(visual.hullFromAsset, false);
  visual.setPose({ x: 1, y: 0.2, z: 3, heading: 0.5, roll: 0.3, pitch: -0.1 }, 2);
  assert.equal(visual.root.position.z, 3);
  assert.equal(visual.root.rotation.y, 0.5);
  assert.equal(visual.tiltRoot.rotation.z, -0.3, "même convention de gîte que YoleVisual");
  assert.equal(visual.tiltRoot.rotation.x, -0.1);
  assert.equal(visual.setVisible(true), true);
  assert.equal(visual.setPose(null), false);
  assert.doesNotThrow(() => visual.dispose());
}

// ── Système : armement, rendu au tick, pastille, réglage ─────────────────────
{
  const replay = recordRun(0xabcd, { ticksPerRound: 300 });
  const messages = [];
  const tracked = [];
  const chip = { classes: new Set(["hidden"]), classList: null };
  chip.classList = {
    toggle: (name, force) => { if (force) chip.classes.add(name); else chip.classes.delete(name); return force; },
    contains: (name) => chip.classes.has(name)
  };
  const gap = { textContent: "" };
  const makeGame = (overrides = {}) => Object.assign(Object.create(GhostSystems), {
    THREE,
    assets: null,
    scene: { added: [], add(object) { this.added.push(object); } },
    settings: { values: { ghost: true }, get(key) { return this.values[key]; } },
    replayVault: { list: () => [{ replay }] },
    telemetry: { track: (type, payload) => tracked.push([type, payload]) },
    seed: 0xabcd,
    playback: null,
    versusLocal: false,
    mode: "playing",
    countdown: 0,
    round: 1,
    tick: 0,
    roundStartTick: 0,
    time: 0,
    boats: [{ z: 0 }],
    ui: { ghostChip: chip, ghostGap: gap },
    showMessage: (text) => messages.push(text),
    ...overrides
  });

  const game = makeGame();
  game.initGhost();
  assert.equal(game.armGhost({ tourStage: null }), true);
  assert.equal(game.ghost.status, "armed");
  assert.equal(tracked.at(-1)[0], "ghost_armed");

  game.countdown = 2;
  assert.equal(game.updateGhostRender(), false, "pendant le 3-2-1, rien ne s'affiche");
  assert.equal(game.ghost.visual, null, "aucun draw call payé avant la course");
  game.updateGhostChip();
  assert.equal(chip.classes.has("hidden"), false, "la pastille annonce le fantôme dès l'armement");
  assert.equal(gap.textContent, "AU DÉPART");

  game.countdown = 0;
  game.tick = 12;
  game.boats[0].z = 1;
  assert.equal(game.updateGhostRender(), true);
  assert.ok(game.ghost.visual, "le visuel est créé à la première image utile");
  assert.equal(game.scene.added[0], game.ghost.visual.root, "et ajouté à la scène");
  assert.equal(game.ghost.visual.root.visible, true);
  assert.ok(game.ghost.gap > 0, "le fantôme a de l'avance (12 ticks à 0,25 m)");
  assert.equal(messages.length, 0, "pas d'annonce avant une demi-seconde de course");
  game.tick = 31;
  game.updateGhostRender();
  assert.deepEqual(messages, ["👻 TON FANTÔME EST SUR L'EAU"]);
  game.updateGhostChip();
  assert.match(gap.textContent, /M DEVANT/);
  assert.equal(chip.classes.has("ghost-ahead"), true);

  game.tick = 2000;
  assert.equal(game.updateGhostRender(), false, "la manche du fantôme est finie");
  assert.equal(game.ghost.status, "gone");
  assert.equal(game.ghost.visual.root.visible, false);
  game.updateGhostChip();
  assert.equal(gap.textContent, "HORS COURSE");

  game.disarmGhost();
  assert.equal(game.ghost.track, null);
  game.updateGhostChip();
  assert.equal(chip.classes.has("hidden"), true);

  // Décalage de manche : la manche 1 du fantôme commence au tick 0, la nôtre au tick 700.
  const shifted = makeGame({ tick: 712, roundStartTick: 700, round: 1 });
  shifted.initGhost();
  assert.equal(shifted.armGhost({}), true);
  assert.equal(shifted.updateGhostRender(), true, "aligné sur le début de manche, pas sur le tick absolu");

  const disabled = makeGame({ settings: { get: () => false } });
  disabled.initGhost();
  assert.equal(disabled.armGhost({}), false, "réglage FANTÔME · NON");
  const playback = makeGame({ playback: {} });
  playback.initGhost();
  assert.equal(playback.armGhost({}), false, "jamais en relecture");
  const versus = makeGame({ versusLocal: true });
  versus.initGhost();
  assert.equal(versus.armGhost({}), false, "jamais en Mêlée locale");
  const otherSeed = makeGame({ seed: 0x9999 });
  otherSeed.initGhost();
  assert.equal(otherSeed.armGhost({}), false, "autre mer, pas de fantôme");
  const brokenVault = makeGame({ replayVault: { list: () => { throw new Error("stockage"); } } });
  brokenVault.initGhost();
  assert.equal(brokenVault.armGhost({}), false, "un coffre en panne ne fait pas tomber la partie");
}

// ── Import d'un replay : la replayothèque accepte le fichier d'un ami ────────
{
  const saved = [];
  const vault = { save: (replay, summary) => { saved.push({ replay, summary }); return { id: "x" }; } };
  const replay = recordRun(0x5555);
  assert.equal(importReplayText(vault, JSON.stringify(replay)), "imported");
  assert.equal(saved[0].summary.imported, true);
  assert.equal(importReplayText(vault, JSON.stringify({ ...replay, ghost: null })), "imported_no_ghost");
  assert.equal(importReplayText(vault, JSON.stringify({ ...replay, simulationVersion: "0.1" })), "incompatible");
  assert.equal(importReplayText(vault, "{pas du json"), "invalid");
  assert.equal(importReplayText(vault, "[]"), "invalid");
  assert.equal(importReplayText({ save: () => null }, JSON.stringify(replay)), "storage");
}

console.log("ghost: OK");
