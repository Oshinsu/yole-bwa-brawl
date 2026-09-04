// Encodage des textures du moteur en KTX2 / Basis Universal ETC1S.
//
// ⚠️ CE QU'ON GAGNE, ET CE QU'ON NE GAGNE PAS.
//
// Une WebP est compressée SUR LE DISQUE et décompressée à l'upload : elle vit
// en RGBA8 non compressé dans la mémoire du GPU. `sail_atlas.webp` pèse 506 Ko
// sur disque et **12 Mo en VRAM**. Un KTX2/Basis, lui, reste compressé SUR le
// GPU — transcodé au chargement vers le format natif de l'appareil (ASTC sur
// mobile, BC7 sur bureau, ETC2 en repli) — soit environ un huitième.
//
// Mesuré sur les quatorze textures du moteur, avant cette passe :
//   disque 2,27 Mo · VRAM 64 Mo (RGBA8 + mips)
// Le gain au TÉLÉCHARGEMENT est marginal, parfois négatif. Ce n'est pas le but :
// le but est la mémoire GPU, qui est ce qui fait chauffer puis brider un Android
// de milieu de gamme — le P0 ouvert de `docs/NEXT_PRODUCTION_STEPS.md`.
//
// ⚠️ OUTIL DE CONSTRUCTION UNIQUEMENT. Le jeu garde `three` pour seule
// dépendance d'exécution. `babylonpress-ktx2-encoder` (wasm) et `sharp` ne sont
// installés qu'ici, à la demande, et ne partent jamais chez le joueur :
//
//   npm install --no-save babylonpress-ktx2-encoder sharp
//   node tools/encode_ktx2.mjs [--force] [--json]
//
// Les WebP sont CONSERVÉES : `assets.js` retombe dessus si l'appareil ou le
// transcodeur fait défaut. Rien ne casse si ce dossier n'est jamais généré.

import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { YOLE_TEXTURES } from "../src/render/assets.js";

const RACINE = resolve(import.meta.dirname, "..");
const SOURCE = join(RACINE, "assets", "textures");
const FORCE = process.argv.includes("--force");
const JSON_SEUL = process.argv.includes("--json");

// ETC1S plutôt qu'UASTC : sur des atlas de VFX et des ciels stylisés, la perte
// est invisible à distance de jeu et le fichier est trois à quatre fois plus
// petit. UASTC se réserve aux normal maps, que ce projet n'a pas.
const OPTIONS = Object.freeze({
  isUASTC: false,
  generateMipmap: true,
  // 192/255 : au-dessus, le gain visuel se perd dans le filtrage ; en dessous,
  // les dégradés du ciel se bandent. Mesuré à l'œil sur `sky_clouds`.
  qualityLevel: 192,
  compressionLevel: 2,
  isPerceptual: true
});

async function encodeur() {
  const [{ encodeToKTX2 }, { default: sharp }] = await Promise.all([
    import("babylonpress-ktx2-encoder"),
    import("sharp")
  ]);
  // Le module Node exige un décodeur : il ne sait pas lire un WebP tout seul.
  //
  // ⚠️ ET IL RETOURNE L'IMAGE, EXPRÈS. Une texture compressée ne peut pas être
  // retournée à l'upload : `KTX2Loader` pose `flipY = false` là où le
  // `TextureLoader` pose `true`. Sans compensation, tout V est inversé — ce qui
  // ne se voit pas sur une texture pleine, mais CHOISIT LE MAUVAIS QUADRANT
  // dans un atlas. Vu à l'écran avant correction : `setSailLivery` calcule son
  // décalage vertical avec `index < 2 ? 0.5 : 0`, et les quatre marques de voile
  // se retrouvaient permutées deux à deux — le serpent rouge à la place du motif
  // vert. On retourne donc la source à l'encodage : le KTX2 en `flipY=false`
  // s'échantillonne alors exactement comme la WebP en `flipY=true`, et pas une
  // seule UV du jeu ne bouge.
  const imageDecoder = async (buffer) => {
    const { data, info } = await sharp(Buffer.from(buffer))
      .flip()
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { width: info.width, height: info.height, data: new Uint8Array(data) };
  };
  return { encodeToKTX2, imageDecoder, sharp };
}

const aJour = async (source, cible) => {
  if (FORCE) return false;
  try {
    const [a, b] = await Promise.all([stat(source), stat(cible)]);
    return b.mtimeMs >= a.mtimeMs;
  } catch {
    return false;
  }
};

async function main() {
  let outils;
  try {
    outils = await encodeur();
  } catch (erreur) {
    console.error(
      "[ktx2] encodeur absent. Installe-le d'abord, il ne part pas chez le joueur :\n"
      + "  npm install --no-save babylonpress-ktx2-encoder sharp\n"
      + `  (${erreur?.message || erreur})`
    );
    process.exit(2);
  }
  const { encodeToKTX2, imageDecoder, sharp } = outils;

  const releves = [];
  for (const [nom, spec] of Object.entries(YOLE_TEXTURES)) {
    const source = join(SOURCE, spec.file);
    const cible = join(SOURCE, spec.file.replace(/\.webp$/i, ".ktx2"));
    const brut = new Uint8Array(await readFile(source));
    const { width, height } = await sharp(Buffer.from(brut)).metadata();

    // ⚠️ ETC1S EST UN FORMAT PAR BLOCS DE 4×4. Une dimension non multiple de 4
    // est refusée ou rembourrée en silence par certains transcodeurs : on
    // préfère le dire et garder la WebP pour cette texture-là.
    if (width % 4 || height % 4) {
      releves.push({ nom, fichier: spec.file, ignore: `${width}x${height} n'est pas un multiple de 4` });
      continue;
    }

    const vramWebp = width * height * 4 * 1.333;
    if (await aJour(source, cible)) {
      const { size } = await stat(cible);
      releves.push({ nom, fichier: spec.file, width, height, disqueAvant: brut.length, disqueApres: size, vramAvant: vramWebp, vramApres: vramWebp / 8, cache: true });
      continue;
    }

    const debut = Date.now();
    const ktx2 = await encodeToKTX2(brut, { ...OPTIONS, imageDecoder });
    await mkdir(dirname(cible), { recursive: true });
    await writeFile(cible, ktx2);
    releves.push({
      nom, fichier: spec.file, width, height,
      disqueAvant: brut.length, disqueApres: ktx2.length,
      vramAvant: vramWebp, vramApres: vramWebp / 8,
      secondes: (Date.now() - debut) / 1000
    });
    if (!JSON_SEUL) {
      console.log(`  ${spec.file.padEnd(34)} ${width}x${height}  ${(brut.length / 1024).toFixed(0)} -> ${(ktx2.length / 1024).toFixed(0)} Ko  (${((Date.now() - debut) / 1000).toFixed(1)} s)`);
    }
  }

  const encodees = releves.filter((r) => !r.ignore);
  const total = (champ) => encodees.reduce((somme, r) => somme + (r[champ] || 0), 0);
  const bilan = {
    textures: encodees.length,
    ignorees: releves.filter((r) => r.ignore).length,
    disqueAvantMo: +(total("disqueAvant") / 1048576).toFixed(2),
    disqueApresMo: +(total("disqueApres") / 1048576).toFixed(2),
    vramAvantMo: +(total("vramAvant") / 1048576).toFixed(1),
    vramApresMo: +(total("vramApres") / 1048576).toFixed(1)
  };
  bilan.vramEconomiseeMo = +(bilan.vramAvantMo - bilan.vramApresMo).toFixed(1);

  if (JSON_SEUL) {
    console.log(JSON.stringify({ bilan, releves }, null, 2));
    return;
  }
  console.log("");
  console.log(`  ${bilan.textures} textures encodées, ${bilan.ignorees} ignorées`);
  console.log(`  disque : ${bilan.disqueAvantMo} -> ${bilan.disqueApresMo} Mo`);
  console.log(`  VRAM   : ${bilan.vramAvantMo} -> ${bilan.vramApresMo} Mo  (${bilan.vramEconomiseeMo} Mo rendus au GPU)`);
  for (const r of releves.filter((x) => x.ignore)) console.log(`  ignorée : ${r.fichier} — ${r.ignore}`);
}

await main();
