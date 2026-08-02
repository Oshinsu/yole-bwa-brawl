import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STORE = path.join(ROOT, "assets", "store", "google-play");

function pngDimensions(buffer) {
  const signature = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") !== signature
    || buffer.subarray(12, 16).toString("ascii") !== "IHDR") {
    throw new Error("fichier non PNG");
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    bitDepth: buffer[24],
    colorType: buffer[25]
  };
}

async function inspectPng(relative, expected = null) {
  const absolute = path.join(STORE, relative);
  await access(absolute);
  const buffer = await readFile(absolute);
  const dimensions = pngDimensions(buffer);
  if (expected && (dimensions.width !== expected.width || dimensions.height !== expected.height)) {
    throw new Error(`${relative}: ${dimensions.width}x${dimensions.height}, attendu ${expected.width}x${expected.height}`);
  }
  return { file: relative, bytes: (await stat(absolute)).size, ...dimensions };
}

const icon = await inspectPng("app-icon-512.png", { width: 512, height: 512 });
const feature = await inspectPng("feature-graphic-1024x500.png", { width: 1024, height: 500 });
const screenshots = await Promise.all([
  inspectPng("screenshot-01-course-2560x1440.png"),
  inspectPng("screenshot-02-combat-2560x1440.png")
]);

if (icon.bytes > 1024 * 1024) throw new Error("app-icon-512.png dépasse 1 Mo");
if (feature.bytes > 15 * 1024 * 1024) throw new Error("feature-graphic-1024x500.png dépasse 15 Mo");
for (const screenshot of screenshots) {
  const shortSide = Math.min(screenshot.width, screenshot.height);
  const longSide = Math.max(screenshot.width, screenshot.height);
  if (shortSide < 320 || longSide > 3840 || longSide > shortSide * 2) {
    throw new Error(`${screenshot.file}: dimensions hors limites Google Play`);
  }
  if (screenshot.bitDepth !== 8 || screenshot.colorType !== 2) {
    throw new Error(`${screenshot.file}: PNG attendu en RGB 24 bits opaque`);
  }
}

const listing = JSON.parse(await readFile(path.join(STORE, "listing-fr-FR.json"), "utf8"));
if (!listing.title || [...listing.title].length > 30) throw new Error("titre Play absent ou supérieur à 30 caractères");
if (!listing.shortDescription || [...listing.shortDescription].length > 80) {
  throw new Error("description courte absente ou supérieure à 80 caractères");
}
if (!listing.fullDescription || [...listing.fullDescription].length > 4000) {
  throw new Error("description complète absente ou supérieure à 4 000 caractères");
}

const twaFiles = [
  path.join(ROOT, "twa", "twa-manifest.template.json"),
  path.join(ROOT, "twa", "assetlinks.template.json")
];
const twaText = (await Promise.all(twaFiles.map((file) => readFile(file, "utf8")))).join("\n");
const blockers = [];
if (twaText.includes("REPLACE_WITH_")) blockers.push("domaine HTTPS et empreinte Play App Signing non fournis");
if (!listing.contactEmail) blockers.push("adresse e-mail publique du développeur non fournie");

const preparedOnly = process.argv.includes("--prepared");
const report = {
  ok: preparedOnly || blockers.length === 0,
  storeAssetsReady: true,
  screenshots: screenshots.length,
  listing: {
    titleCharacters: [...listing.title].length,
    shortDescriptionCharacters: [...listing.shortDescription].length,
    fullDescriptionCharacters: [...listing.fullDescription].length
  },
  blockers
};
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 2;
