import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
// ⚠️ V8 ET V9 MANQUAIENT, ET ÇA A COÛTÉ UNE CHAÎNE DE VÉRIFICATION.
// L'outil s'était arrêté à V7 : les deux packs suivants portaient des `sha256`
// vérifiés par `test/hud-instruments.test.mjs` mais qu'aucun outil ne savait
// rafraîchir. Convertir les quatre rasters V8 en WebP le 2 août 2026 a donc
// fait échouer `npm run verify` sur un checksum périmé, sans moyen évident de
// le régénérer. Tout pack neuf doit être ajouté ici LE JOUR où il est créé.
const manifests = [
  "assets/textures/v6/asset-pack.json",
  "assets/textures/v7/asset-pack.json",
  "assets/textures/v8/asset-pack.json",
  "assets/textures/v9/asset-pack.json"
];

async function sha256(path) {
  const data = await readFile(path);
  return createHash("sha256").update(data).digest("hex");
}

async function refreshEntry(entry) {
  const relative = entry.path ?? entry.final;
  if (!relative) return;
  const absolute = resolve(root, relative);
  const info = await stat(absolute);
  entry.format = extname(relative).slice(1).toUpperCase();
  entry.bytes = info.size;
  entry.sha256 = await sha256(absolute);
}

for (const relative of manifests) {
  const absolute = resolve(root, relative);
  const data = JSON.parse(await readFile(absolute, "utf8"));
  const entries = [
    ...(data.assets ?? []),
    ...(data.signatures ?? []),
    ...(data.runtimeTextures ?? []),
    ...(data.atlas ? [data.atlas] : [])
  ];
  for (const entry of entries) await refreshEntry(entry);
  await writeFile(absolute, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  console.log(`${relative}: ${entries.length} entrées actualisées`);
}
