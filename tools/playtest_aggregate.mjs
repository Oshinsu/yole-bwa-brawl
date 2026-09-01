#!/usr/bin/env node
// Agrège des rapports de playtest (JSON produits par le bouton « ENVOYER MON
// RAPPORT DE TEST ») et rend la table des portes Go/No-Go du MASTER_PLAN.
//
//     node tools/playtest_aggregate.mjs dossier/des/rapports [--markdown sortie.md] [--json sortie.json]
//
// Les seuils viennent de src/game/playtest-report.js : une seule table de
// vérité, la même que celle qui étiquette chaque rapport individuel.

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  PLAYTEST_GATES,
  PLAYTEST_REPORT_KIND,
  playtestGateVerdict
} from "../src/game/playtest-report.js";

function collectReportFiles(root) {
  const files = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && entry.name.endsWith(".json")) files.push(path);
    }
  };
  walk(root);
  return files.sort();
}

export function loadReports(paths) {
  const reports = [];
  const rejected = [];
  for (const path of paths) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8"));
      if (parsed?.kind !== PLAYTEST_REPORT_KIND || !parsed.gates) {
        rejected.push({ path, reason: "pas un rapport de playtest" });
        continue;
      }
      reports.push({ path, report: parsed });
    } catch (error) {
      rejected.push({ path, reason: error?.message || String(error) });
    }
  }
  return { reports, rejected };
}

function rate(values) {
  const known = values.filter((value) => typeof value === "boolean");
  if (!known.length) return null;
  return known.filter(Boolean).length / known.length;
}

function median(values) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Une ligne par porte : valeur agrégée, seuil, verdict, effectif. */
export function aggregateGates(reports) {
  const gates = reports.map(({ report }) => report.gates ?? {});
  const rows = [];
  const push = (key, value, samples) => {
    const gate = PLAYTEST_GATES[key];
    rows.push({
      key,
      label: gate.label,
      value,
      threshold: gate.threshold,
      direction: gate.direction,
      unit: gate.unit,
      indicative: Boolean(gate.indicative),
      samples,
      verdict: playtestGateVerdict(key, value)
    });
  };
  const booleans = (key) => gates.map((gate) => gate[key]?.value).filter((value) => typeof value === "boolean");
  push("firstShiftSuccess", rate(booleans("firstShiftSuccess")), booleans("firstShiftSuccess").length);
  push("secondRound", rate(booleans("secondRound")), booleans("secondRound").length);
  const roundMedians = gates.map((gate) => gate.roundMedianSeconds?.value).filter(Number.isFinite);
  push("roundMedianSeconds", median(roundMedians), roundMedians.length);
  push("takedownUnderstood", rate(booleans("takedownUnderstood")), booleans("takedownUnderstood").length);
  const dominance = gates.map((gate) => gate.weaponDominance?.value).filter(Number.isFinite);
  push("weaponDominance", median(dominance), dominance.length);
  push("replayViewed", rate(booleans("replayViewed")), booleans("replayViewed").length);
  push("shared", rate(booleans("shared")), booleans("shared").length);
  const frames = gates.map((gate) => gate.frameP50Ms?.value).filter(Number.isFinite);
  push("frameP50Ms", median(frames), frames.length);
  return rows;
}

export function deviceBreakdown(reports) {
  const rows = new Map();
  for (const { report } of reports) {
    const gpu = report.device?.gpu ?? "GPU inconnu";
    const key = `${gpu} · ${report.device?.coarsePointer ? "tactile" : "souris"}`;
    const row = rows.get(key) ?? { key, sessions: 0, p50: [], p95: [], tiers: [] };
    row.sessions++;
    if (Number.isFinite(report.frames?.interval?.p50)) row.p50.push(report.frames.interval.p50);
    if (Number.isFinite(report.frames?.interval?.p95)) row.p95.push(report.frames.interval.p95);
    if (report.quality?.label) row.tiers.push(report.quality.label);
    rows.set(key, row);
  }
  return [...rows.values()].map((row) => ({
    key: row.key,
    sessions: row.sessions,
    p50: median(row.p50),
    p95: median(row.p95),
    tiers: [...new Set(row.tiers)].join("/") || "—"
  }));
}

function formatValue(row) {
  if (row.value === null || row.value === undefined) return "—";
  if (row.unit === "taux") return `${Math.round(row.value * 100)} %`;
  return `${Math.round(row.value * 10) / 10} ${row.unit}`;
}

function formatThreshold(row) {
  const bound = row.direction === "max" ? "≤" : "≥";
  return row.unit === "taux" ? `${bound} ${Math.round(row.threshold * 100)} %` : `${bound} ${row.threshold} ${row.unit}`;
}

export function renderMarkdown(rows, devices, count, rejected = []) {
  const lines = [
    `# Playtest — ${count} rapport${count === 1 ? "" : "s"}`,
    "",
    "| Porte | Mesure | Seuil | Verdict | n |",
    "|---|---:|---:|:---:|---:|"
  ];
  for (const row of rows) {
    const verdict = row.verdict === null ? "sans donnée" : row.verdict ? "✅ passe" : "❌ échoue";
    lines.push(`| ${row.label}${row.indicative ? " *(indicatif)*" : ""} | ${formatValue(row)} | ${formatThreshold(row)} | ${verdict} | ${row.samples} |`);
  }
  lines.push("", "## Appareils", "", "| Appareil | Sessions | p50 | p95 | Paliers |", "|---|---:|---:|---:|---|");
  for (const device of devices) {
    lines.push(`| ${device.key} | ${device.sessions} | ${device.p50 ?? "—"} ms | ${device.p95 ?? "—"} ms | ${device.tiers} |`);
  }
  if (rejected.length) {
    lines.push("", "## Fichiers ignorés", "");
    for (const item of rejected) lines.push(`- \`${item.path}\` — ${item.reason}`);
  }
  return `${lines.join("\n")}\n`;
}

function parseArguments(argv) {
  const options = { root: null, markdown: null, json: null };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === "--markdown") options.markdown = argv[++index] ?? null;
    else if (argument === "--json") options.json = argv[++index] ?? null;
    else if (!options.root) options.root = argument;
  }
  return options;
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
if (invokedDirectly) {
  const options = parseArguments(process.argv.slice(2));
  if (!options.root) {
    console.error("usage : node tools/playtest_aggregate.mjs <dossier ou fichier> [--markdown sortie.md] [--json sortie.json]");
    process.exit(2);
  }
  const target = resolve(options.root);
  const paths = statSync(target).isDirectory() ? collectReportFiles(target) : [target];
  const { reports, rejected } = loadReports(paths);
  const rows = aggregateGates(reports);
  const devices = deviceBreakdown(reports);
  const markdown = renderMarkdown(rows, devices, reports.length, rejected);
  process.stdout.write(markdown);
  if (options.markdown) writeFileSync(options.markdown, markdown, "utf8");
  if (options.json) writeFileSync(options.json, JSON.stringify({ count: reports.length, gates: rows, devices, rejected }, null, 2), "utf8");
  if (!reports.length) process.exit(1);
}
