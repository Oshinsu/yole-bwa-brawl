// Le pipeline de textures compressées GPU.
//
// ⚠️ CE QUE CE TEST DOIT PROUVER, ET POURQUOI.
//
// Les .ktx2 sont des artefacts GÉNÉRÉS (`node tools/encode_ktx2.mjs`), commités
// à côté de leurs .webp. Rien dans le jeu ne casse s'ils manquent — `assets.js`
// retombe sur les .webp — mais alors les 56 Mo de VRAM ne sont pas rendus au
// GPU, en silence. Ce test est le seul endroit qui s'en aperçoive.
//
//   1. chaque texture du moteur a son .ktx2, et c'est un vrai KTX2 ;
//   2. il porte des mipmaps — sans elles le GPU filtre au niveau 0 et le moiré
//      revient, ce qui annulerait le bénéfice visuel de la compression ;
//   3. le format est bien Basis Universal, pas un RGBA déguisé ;
//   4. les dimensions sont des multiples de 4, contrainte des blocs ETC1S ;
//   5. le service worker précharge chaque .ktx2 et le transcodeur, mais PLUS les
//      .webp devenues redondantes — sinon le précache porte deux fois les mêmes
//      images, soit 2,27 Mo imposés à tous pour un repli quasi jamais pris.

import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { YOLE_TEXTURES } from "../src/render/assets.js";

const racine = new URL("../", import.meta.url);
const chemin = (rel) => fileURLToPath(new URL(rel, racine));

// ── Décodage minimal d'un en-tête KTX2 (spec Khronos, § 3.1) ────────────────
const MAGIE = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];

function lireEntete(octets) {
  for (let index = 0; index < MAGIE.length; index++) {
    if (octets[index] !== MAGIE[index]) return null;
  }
  return {
    vkFormat: octets.readUInt32LE(12),
    largeur: octets.readUInt32LE(20),
    hauteur: octets.readUInt32LE(24),
    niveaux: octets.readUInt32LE(40),
    supercompression: octets.readUInt32LE(44)
  };
}

const sw = readFileSync(chemin("service-worker.js"), "utf8");
const releves = [];

for (const [nom, spec] of Object.entries(YOLE_TEXTURES)) {
  const relatifWebp = `assets/textures/${spec.file}`;
  const relatifKtx2 = relatifWebp.replace(/\.webp$/i, ".ktx2");

  assert.ok(existsSync(chemin(relatifWebp)),
    `${nom} : la .webp de repli a disparu — le jeu doit tourner sans un seul .ktx2`);
  assert.ok(existsSync(chemin(relatifKtx2)),
    `${nom} : ${relatifKtx2} manque. Lance \`node tools/encode_ktx2.mjs\` (voir l'en-tête de l'outil).`);

  const octets = readFileSync(chemin(relatifKtx2));
  const entete = lireEntete(octets);
  assert.ok(entete, `${nom} : ${relatifKtx2} n'a pas la signature KTX2`);

  // vkFormat 0 = les données restent en Basis Universal, transcodées à l'exécution
  // vers le format natif du GPU. Toute autre valeur voudrait dire qu'on livre un
  // format figé, donc non compressé sur les appareils qui ne le gèrent pas.
  assert.equal(entete.vkFormat, 0,
    `${nom} : vkFormat ${entete.vkFormat}, attendu 0 (Basis Universal)`);
  assert.equal(entete.supercompression, 1,
    `${nom} : supercompression ${entete.supercompression}, attendu 1 (BasisLZ)`);

  const niveauxAttendus = Math.floor(Math.log2(Math.max(entete.largeur, entete.hauteur))) + 1;
  assert.equal(entete.niveaux, niveauxAttendus,
    `${nom} : ${entete.niveaux} niveaux de mip pour ${entete.largeur}x${entete.hauteur}, attendu ${niveauxAttendus}`);

  assert.equal(entete.largeur % 4, 0, `${nom} : largeur ${entete.largeur} n'est pas un multiple de 4 (blocs ETC1S)`);
  assert.equal(entete.hauteur % 4, 0, `${nom} : hauteur ${entete.hauteur} n'est pas un multiple de 4 (blocs ETC1S)`);

  // ── 5. Le précache ────────────────────────────────────────────────────────
  // La .ktx2 est préchargée, la .webp NE L'EST PLUS : servir les deux coûtait
  // 2,27 Mo à tout le monde pour un repli que presque personne n'emprunte. La
  // .webp reste livrée (vérifié plus haut) et le cache d'exécution la garde si
  // un appareil doit vraiment y retomber. Ce test verrouille les deux moitiés :
  // sans lui, un `stamp` distrait remettrait les .webp et le précache doublerait
  // en silence.
  assert.ok(sw.includes(`"./${relatifKtx2}"`), `${nom} : ${relatifKtx2} absent du précache`);
  assert.ok(!sw.includes(`"./${relatifWebp}"`),
    `${nom} : ${relatifWebp} est de nouveau préchargée en plus de sa .ktx2 — 2,27 Mo pour rien`);

  releves.push({
    nom,
    taille: `${entete.largeur}x${entete.hauteur}`,
    ktx2Ko: Math.round(octets.length / 1024),
    webpKo: Math.round(readFileSync(chemin(relatifWebp)).length / 1024),
    // Une RGBA8 avec ses mips occupe 4 octets par texel × 4/3. ETC1S transcodé
    // tient dans un demi-octet par texel : d'où le facteur huit.
    vramWebpMo: +(entete.largeur * entete.hauteur * 4 * 1.333 / 1048576).toFixed(2),
    vramKtx2Mo: +(entete.largeur * entete.hauteur * 4 * 1.333 / 8 / 1048576).toFixed(2)
  });
}

// ── Le chargeur et son transcodeur doivent être livrés ET préchargés ────────
for (const fichier of [
  "vendor/addons/KTX2Loader.js",
  "vendor/addons/ColorSpaces.js",
  "vendor/addons/WorkerPool.js",
  "vendor/addons/ktx-parse.module.js",
  "vendor/addons/zstddec.module.js",
  "vendor/basis/basis_transcoder.js",
  "vendor/basis/basis_transcoder.wasm"
]) {
  assert.ok(existsSync(chemin(fichier)), `${fichier} manquant — relance \`npm run vendor\``);
  assert.ok(sw.includes(`"./${fichier}"`), `${fichier} absent du précache`);
}

// Les addons vendorés ne doivent JAMAIS garder le spécificateur nu `three` :
// il n'y a pas d'importmap, et une seconde instance de Three casserait
// `instanceof` partout dans le moteur.
for (const addon of ["KTX2Loader.js", "ColorSpaces.js", "WorkerPool.js"]) {
  const source = readFileSync(chemin(`vendor/addons/${addon}`), "utf8");
  const specificateurs = [...source.matchAll(/^import[^;]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  for (const specificateur of specificateurs) {
    assert.ok(specificateur.startsWith("./") || specificateur.startsWith("../three"),
      `vendor/addons/${addon} : import non vendoré « ${specificateur} »`);
  }
}

const vramWebp = releves.reduce((somme, r) => somme + r.vramWebpMo, 0);
const vramKtx2 = releves.reduce((somme, r) => somme + r.vramKtx2Mo, 0);

console.log(JSON.stringify({
  ok: true,
  textures: releves.length,
  disqueWebpKo: releves.reduce((s, r) => s + r.webpKo, 0),
  disqueKtx2Ko: releves.reduce((s, r) => s + r.ktx2Ko, 0),
  vramWebpMo: +vramWebp.toFixed(1),
  vramKtx2Mo: +vramKtx2.toFixed(1),
  vramEconomiseeMo: +(vramWebp - vramKtx2).toFixed(1)
}, null, 2));
