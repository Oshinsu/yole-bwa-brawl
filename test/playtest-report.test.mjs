// Rapport de playtest : les portes Go/No-Go du MASTER_PLAN se calculent bien à
// partir du flux de télémétrie, survivent à la remise à zéro par partie, et le
// rapport ne transporte rien de personnel.
import assert from "node:assert/strict";

import { LocalTelemetry } from "../src/core/telemetry.js";
import {
  FrameSampler,
  PLAYTEST_GATES,
  PLAYTEST_REPORT_KIND,
  PlaytestJournal,
  buildPlaytestReport,
  compactPlaytestReport,
  computeSessionGates,
  createPlaytestState,
  deliverPlaytestReport,
  describeDevice,
  playtestApplyEvent,
  playtestEliminationFamily,
  playtestGateVerdict,
  playtestReportFilename,
  summarizePlaytestReport
} from "../src/game/playtest-report.js";
import { aggregateGates, deviceBreakdown, renderMarkdown } from "../tools/playtest_aggregate.mjs";

// ── Réducteur : une session type ─────────────────────────────────────────────
{
  const state = createPlaytestState();
  const feed = (type, payload, atMs) => playtestApplyEvent(state, type, payload, atMs);
  feed("match_start", { seed: 1, replay: false, tour: false, versus: false, training: true, challenge: false, daily: false }, 1000);
  feed("round_start", { round: 1, tour: false, versus: false }, 1100);
  feed("bwa_shift", { critical: false, precision: 0.1 }, 4000);
  feed("bwa_shift", { critical: false, precision: 0.2 }, 6000);
  feed("bwa_shift", { critical: true, precision: 0.8 }, 12500);
  feed("first_run_training_unlock", { reason: "completed", elapsed: 24.5 }, 25000);
  feed("takedown", { attacker: 0, victim: 2 }, 30000);
  feed("elimination", { boat: 2, reason: "COULÉE PAR BWA FATAL" }, 30000);
  feed("elimination", { boat: 1, reason: "CHAVIRAGE" }, 40000);
  feed("round_end", { round: 1, seconds: 61.2, reason: "last_standing", playerAlive: true }, 62000);
  feed("round_start", { round: 2, tour: false, versus: false }, 65000);
  feed("elimination", { boat: 0, reason: "ENSEVELI PAR LA BRUME" }, 90000);
  feed("round_end", { round: 2, seconds: 70.4, reason: "last_standing", playerAlive: false }, 136000);
  feed("match_end", { champion: 3, playerWon: false }, 139000);
  feed("quality_tier", { tier: 0, label: "LQ", manual: false }, 500);
  feed("quality_tier", { tier: 1, label: "MQ", manual: false }, 20000);
  feed("replay_started", { seed: 1 }, 150000);
  feed("challenge_copied", { mode: "combat" }, 160000);
  feed("weapon_coconut", { boat: 0 }, 5000);
  feed("weapon_coconut", { boat: 0 }, 7000);

  assert.equal(state.matches, 1);
  assert.equal(state.matchesByMode.combat, 1);
  assert.equal(state.matchesByMode.training, 1);
  assert.equal(state.rounds, 2);
  assert.equal(state.maxRoundsInMatch, 2);
  assert.equal(state.shiftAttempts, 3);
  assert.equal(state.shiftSuccesses, 1);
  assert.equal(state.shiftsBeforeFirstSuccess, 2, "deux essais ratés avant la première contre-gîte");
  assert.equal(state.firstShiftSuccessAtMs, 12500);
  assert.equal(state.playerTakedowns, 1);
  assert.deepEqual(state.eliminations, { storm: 1, capsize: 1, timer: 0, weapon: 1, other: 0 });
  assert.deepEqual(state.playerEliminations, { storm: 1, capsize: 0, timer: 0, weapon: 0, other: 0 });
  assert.equal(state.weaponsUsed.coconut, 2);
  assert.deepEqual(state.quality.tiers, [0, 1]);
  assert.equal(state.quality.min, 0);
  assert.equal(state.quality.final, 1);

  const gates = computeSessionGates(state, { interval: { p50: 18, p95: 40 }, work: { p50: 9 }, longFrameRate: 0.02 });
  assert.equal(gates.firstShiftSuccess.value, true);
  assert.equal(gates.firstShiftSuccess.secondsToFirst, 12.5);
  assert.equal(gates.firstShiftSuccess.attemptsBefore, 2);
  assert.equal(gates.secondRound.value, true);
  assert.equal(gates.secondRound.rematch, false);
  assert.equal(gates.roundMedianSeconds.value, (61.2 + 70.4) / 2);
  assert.equal(gates.takedownUnderstood.value, true);
  assert.equal(gates.weaponDominance.value, 0.333, "arrondi à trois décimales");
  assert.equal(gates.replayViewed.value, true);
  assert.equal(gates.shared.value, true);
  assert.equal(gates.frameP50Ms.value, 18);
  assert.equal(gates.training.reason, "completed");
  assert.equal(gates.outcome.matchesWon, 0);
}

// ── Réducteur : une session vide ne ment pas ─────────────────────────────────
{
  const gates = computeSessionGates(createPlaytestState(), null);
  assert.equal(gates.firstShiftSuccess.value, false);
  assert.equal(gates.secondRound.value, false);
  assert.equal(gates.roundMedianSeconds.value, null);
  assert.equal(gates.weaponDominance.value, null, "sans élimination, pas de part d'armes");
  assert.equal(gates.frameP50Ms.value, null);
}

// ── Mêlée locale : les contre-gîtes de J2 ne comptent pas pour le joueur ─────
{
  const state = createPlaytestState();
  playtestApplyEvent(state, "bwa_shift", { boat: 1, critical: true, precision: 0.9 }, 100);
  assert.equal(state.shiftAttempts, 0);
  playtestApplyEvent(state, "bwa_shift", { boat: 0, critical: true, precision: 0.9 }, 200);
  assert.equal(state.shiftSuccesses, 1);
}

// ── Familles d'élimination ───────────────────────────────────────────────────
assert.equal(playtestEliminationFamily("ENSEVELI PAR LA BRUME"), "storm");
assert.equal(playtestEliminationFamily("CHAVIRAGE"), "capsize");
assert.equal(playtestEliminationFamily("FIN DU CHRONO"), "timer");
assert.equal(playtestEliminationFamily("Coulée par KOLIBRI"), "weapon");
assert.equal(playtestEliminationFamily(""), "other");

// ── Verdicts ─────────────────────────────────────────────────────────────────
assert.equal(playtestGateVerdict("firstShiftSuccess", 0.71), true);
assert.equal(playtestGateVerdict("firstShiftSuccess", 0.69), false);
assert.equal(playtestGateVerdict("roundMedianSeconds", 74), true);
assert.equal(playtestGateVerdict("roundMedianSeconds", 76), false);
assert.equal(playtestGateVerdict("roundMedianSeconds", null), null);
assert.equal(playtestGateVerdict("inconnue", 1), null);
assert.equal(PLAYTEST_GATES.firstShiftSuccess.threshold, 0.70, "seuil du MASTER_PLAN §12");
assert.equal(PLAYTEST_GATES.secondRound.threshold, 0.50);
assert.equal(PLAYTEST_GATES.roundMedianSeconds.threshold, 75);

// ── FrameSampler : percentiles bornés, mémoire constante ─────────────────────
{
  const sampler = new FrameSampler(2, 96);
  for (let index = 0; index < 90; index++) sampler.add(16.7, 6);
  for (let index = 0; index < 10; index++) sampler.add(120, 110);
  const stats = sampler.stats();
  assert.equal(stats.frames, 100);
  assert.equal(stats.interval.p50, 18, "p50 tombe dans la classe 16-18 ms");
  assert.equal(stats.interval.p95, 122, "p95 attrape les images longues");
  assert.equal(stats.work.p50, 8);
  assert.equal(stats.longFrames, 10);
  assert.equal(stats.longFrameRate, 0.1);
  assert.equal(sampler.add(NaN, 1), false, "une mesure non finie est ignorée");
  assert.equal(sampler.add(-4, 1), false);
  sampler.add(10_000, 10_000);
  assert.equal(sampler.stats().frames, 101, "une image absurde est plafonnée dans la dernière classe, pas perdue");
  sampler.reset();
  assert.equal(sampler.stats().frames, 0);
  assert.equal(sampler.stats().interval, null);
}

// ── Journal : survit à telemetry.clear(), borne sa queue ─────────────────────
{
  let clock = 0;
  const journal = new PlaytestJournal({ now: () => clock, tail: 25 });
  const telemetry = new LocalTelemetry();
  const unsubscribe = telemetry.subscribe((type, payload, time) => journal.observe(type, payload, time));
  clock = 1000;
  telemetry.track("match_start", { seed: 7 }, 0);
  telemetry.track("bwa_shift", { critical: true, precision: 0.7 }, 3.2);
  telemetry.clear();
  assert.equal(telemetry.count("match_start"), 0, "la télémétrie de partie est bien remise à zéro");
  clock = 5000;
  telemetry.track("match_start", { seed: 7 }, 0);
  for (let index = 0; index < 40; index++) telemetry.track("pickup", { weapon: "mine" }, index);
  assert.equal(journal.state.matches, 2, "le journal a vu les deux parties malgré clear()");
  assert.equal(journal.state.shiftSuccesses, 1);
  assert.equal(journal.state.pickups, 40);
  assert.equal(journal.events.length, 25, "la queue est bornée");
  assert.ok(journal.dropped > 0);
  assert.equal(journal.total, 43);
  assert.equal(journal.events[0].at >= 4000, true, "les événements gardés sont les plus récents");
  unsubscribe();
  telemetry.track("match_start", { seed: 8 }, 0);
  assert.equal(journal.state.matches, 2, "après désabonnement, plus rien n'arrive");
  const snapshot = journal.snapshot();
  assert.equal(snapshot.total, 43);
  assert.notEqual(snapshot.state, journal.state, "le snapshot est une copie");
}

// ── Un observateur qui plante n'interrompt pas le jeu ────────────────────────
{
  const telemetry = new LocalTelemetry();
  telemetry.subscribe(() => { throw new Error("observateur cassé"); });
  assert.doesNotThrow(() => telemetry.track("takedown", { attacker: 0 }, 1));
  assert.equal(telemetry.count("takedown"), 1);
  assert.equal(typeof telemetry.subscribe(null), "function");
}

// ── Rapport : forme, absence de données personnelles, fichier, résumé ────────
{
  let clock = 0;
  const journal = new PlaytestJournal({ now: () => clock });
  journal.observe("match_start", { seed: 1 }, 0);
  clock = 90_000;
  journal.observe("bwa_shift", { critical: true, precision: 0.66 }, 4);
  const sampler = new FrameSampler();
  for (let index = 0; index < 30; index++) sampler.add(16.6, 5.1);
  const device = describeDevice({
    navigatorObject: {
      userAgent: `Mozilla/5.0 (Linux; Android 13) ${"x".repeat(400)}`,
      language: "fr-FR",
      hardwareConcurrency: 8,
      deviceMemory: 4,
      maxTouchPoints: 5,
      standalone: false
    },
    windowObject: {
      devicePixelRatio: 2.75,
      innerWidth: 844,
      innerHeight: 390,
      matchMedia: (query) => ({ matches: query.includes("coarse") })
    },
    renderer: {
      getContext: () => ({
        getExtension: (name) => (name === "WEBGL_debug_renderer_info" ? { UNMASKED_RENDERER_WEBGL: 37446 } : null),
        getParameter: (key) => (key === 37446 ? "Mali-G57 MC2" : null)
      })
    }
  });
  assert.equal(device.userAgent.length, 160, "le user agent est tronqué");
  assert.equal(device.coarsePointer, true);
  assert.equal(device.gpu, "Mali-G57 MC2");
  assert.deepEqual(device.viewport, [844, 390]);
  assert.equal(device.devicePixelRatio, 2.75);

  const report = buildPlaytestReport({
    journal,
    frames: sampler,
    device,
    quality: { tier: 0, label: "LQ", manual: false },
    build: { simulationVersion: "4.1.0", gameplayVersion: "test" },
    settings: {
      quality: "auto", aiLevel: "tour", leftHanded: false, haptics: 1, ghost: true,
      loadout: ["wave", "harpoon"], hullColor: 3, crewKit: 2, email: "ne-doit-pas-sortir@example.invalid"
    },
    now: new Date("2026-09-01T10:15:30.000Z")
  });
  assert.equal(report.kind, PLAYTEST_REPORT_KIND);
  assert.equal(report.version, 1);
  assert.equal(report.sessionSeconds, 90);
  assert.equal(report.gates.firstShiftSuccess.value, true);
  assert.equal(report.frames.frames, 30);
  assert.equal(report.state.matches, 1);
  assert.equal(report.events.length, 2);
  assert.deepEqual(report.settings.loadout, ["wave", "harpoon"]);
  assert.equal("hullColor" in report.settings, false, "la personnalisation ne sort pas");
  assert.equal("email" in report.settings, false, "aucune clé inconnue ne sort");
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes("example.invalid"), false);
  assert.equal(playtestReportFilename(report), "yole-playtest-20260901-101530-lq.json");
  const compact = compactPlaytestReport(report);
  assert.equal("events" in compact, false);
  assert.equal(compact.eventsOmitted, 2);
  const summary = summarizePlaytestReport(report);
  assert.match(summary, /rapport de playtest/);
  assert.match(summary, /Mali-G57 MC2/);
  assert.match(summary, /tactile/);
  assert.match(summary, /Première contre-gîte réussie : oui/);
  assert.equal(describeDevice({ navigatorObject: undefined, windowObject: {} }).gpu, null, "sans rien, rien ne casse");
}

// ── Livraison : fichier, texte, presse-papiers, téléchargement, rien ─────────
{
  const report = buildPlaytestReport({ journal: new PlaytestJournal({ now: () => 0 }) });
  let shared = null;
  class FakeFile {
    constructor(parts, name, options) { this.parts = parts; this.name = name; this.type = options?.type; this.size = parts.join("").length; }
  }
  assert.equal(await deliverPlaytestReport(report, {
    FileConstructor: FakeFile,
    navigatorObject: {
      canShare: ({ files }) => Array.isArray(files) && files[0] instanceof FakeFile,
      share: async (payload) => { shared = payload; }
    }
  }), "shared_file");
  assert.equal(shared.files[0].name, playtestReportFilename(report));
  assert.equal(shared.files[0].type, "application/json");
  assert.match(shared.text, /rapport de playtest/);

  assert.equal(await deliverPlaytestReport(report, {
    FileConstructor: undefined,
    navigatorObject: { share: async (payload) => { shared = payload; } }
  }), "shared_text");
  assert.match(shared.text, /"kind":"yole-bwa-brawl-playtest-report"/);

  let copied = "";
  assert.equal(await deliverPlaytestReport(report, {
    FileConstructor: undefined,
    navigatorObject: {},
    clipboard: { writeText: async (text) => { copied = text; } }
  }), "copied");
  assert.match(copied, /"eventsOmitted"/);

  let clicked = null;
  assert.equal(await deliverPlaytestReport(report, {
    FileConstructor: undefined,
    navigatorObject: {},
    clipboard: null,
    BlobConstructor: class { constructor(parts) { this.parts = parts; } },
    urlObject: { createObjectURL: () => "blob:fake", revokeObjectURL: () => {} },
    documentObject: { createElement: () => ({ click() { clicked = this; } }) }
  }), "downloaded");
  assert.equal(clicked.download, playtestReportFilename(report));

  assert.equal(await deliverPlaytestReport(report, {
    FileConstructor: undefined, navigatorObject: {}, clipboard: null, BlobConstructor: undefined, urlObject: null, documentObject: null
  }), "unavailable");

  const abort = Object.assign(new Error("abort"), { name: "AbortError" });
  assert.equal(await deliverPlaytestReport(report, {
    FileConstructor: undefined,
    navigatorObject: { share: async () => { throw abort; } }
  }), "cancelled");
  assert.equal(await deliverPlaytestReport(null), "unavailable");
}

// ── Agrégation : la table des portes d'une campagne ──────────────────────────
{
  const makeReport = (overrides) => {
    const state = createPlaytestState();
    const journal = { snapshot: () => ({ state, events: [], total: 0, dropped: 0, elapsedMs: 0, startedAt: null }) };
    const report = buildPlaytestReport({ journal, device: { gpu: overrides.gpu, coarsePointer: true }, quality: { label: "LQ" } });
    report.gates = { ...report.gates, ...overrides.gates };
    report.frames = overrides.frames ?? null;
    return { path: overrides.gpu, report };
  };
  const reports = [
    makeReport({ gpu: "Mali", gates: { firstShiftSuccess: { value: true }, secondRound: { value: true }, roundMedianSeconds: { value: 60 }, frameP50Ms: { value: 30 }, replayViewed: { value: false }, shared: { value: false } }, frames: { interval: { p50: 30, p95: 80 } } }),
    makeReport({ gpu: "Mali", gates: { firstShiftSuccess: { value: true }, secondRound: { value: false }, roundMedianSeconds: { value: 90 }, frameP50Ms: { value: 34 }, replayViewed: { value: true }, shared: { value: false } }, frames: { interval: { p50: 34, p95: 90 } } }),
    makeReport({ gpu: "Apple", gates: { firstShiftSuccess: { value: false }, secondRound: { value: true }, roundMedianSeconds: { value: 70 }, frameP50Ms: { value: 16 }, replayViewed: { value: false }, shared: { value: true } }, frames: { interval: { p50: 16, p95: 20 } } })
  ];
  const rows = aggregateGates(reports);
  const byKey = Object.fromEntries(rows.map((row) => [row.key, row]));
  assert.equal(byKey.firstShiftSuccess.value, 2 / 3);
  assert.equal(byKey.firstShiftSuccess.verdict, false, "66 % < 70 %");
  assert.equal(byKey.secondRound.value, 2 / 3);
  assert.equal(byKey.secondRound.verdict, true);
  assert.equal(byKey.roundMedianSeconds.value, 70);
  assert.equal(byKey.roundMedianSeconds.verdict, true);
  assert.equal(byKey.shared.value, 1 / 3);
  assert.equal(byKey.shared.verdict, true, "33 % ≥ 5 %");
  assert.equal(byKey.frameP50Ms.value, 30);
  assert.equal(byKey.frameP50Ms.verdict, false);
  assert.equal(byKey.weaponDominance.value, null);
  assert.equal(byKey.weaponDominance.verdict, null);
  const devices = deviceBreakdown(reports);
  assert.equal(devices.length, 2);
  assert.equal(devices.find((row) => row.key.startsWith("Mali")).sessions, 2);
  const markdown = renderMarkdown(rows, devices, reports.length, [{ path: "x.json", reason: "pas un rapport" }]);
  assert.match(markdown, /# Playtest — 3 rapports/);
  assert.match(markdown, /Première contre-gîte réussie \| 67 % \| ≥ 70 % \| ❌ échoue \| 3/);
  assert.match(markdown, /Fichiers ignorés/);
}

console.log("playtest-report: OK");
