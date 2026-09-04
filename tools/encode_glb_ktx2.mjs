// Encodage des textures EMBARQUÉES DANS LES GLB en KTX2 / Basis Universal.
//
// Suite de `tools/encode_ktx2.mjs`, qui ne traite que les textures autonomes du
// moteur. Ici ce sont les vingt-et-une images des modèles — équipage et ses
// trois variantes, matériel de pont, bourg, flottille, armes.
//
// Mesuré avant cette passe : 0,74 Mo embarqués, **6,0 Mo de VRAM**. En KTX2,
// environ 0,7 Mo de VRAM, soit **5,3 Mo rendus au GPU**. Plus modeste que les
// 56 Mo des textures autonomes, mais ces images-là sont résidentes PENDANT LA
// COURSE : équipage, accessoires et flottille sont à l'écran en permanence.
//
// ⚠️ OUTIL DE CONSTRUCTION UNIQUEMENT, comme son jumeau :
//
//   npm install --no-save @gltf-transform/core @gltf-transform/extensions \
//                        babylonpress-ktx2-encoder sharp
//   node tools/encode_glb_ktx2.mjs [--force] [--json]
//
// ⚠️ ET IL RÉÉCRIT DES ASSETS PRÉCIEUX. Les quatre GLB d'équipage portent un
// squelette de vingt-quatre os, cinq actions et la clé de forme « poing ». Le
// filet de sécurité n'est pas la prudence de cet outil mais `npm run test:crew`,
// qui remesure les clips, la silhouette et les contacts sur le GLB LIVRÉ. Passer
// cette vérification après chaque exécution n'est pas optionnel.

import { readFile, writeFile, stat } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const RACINE = resolve(import.meta.dirname, "..");
const MODELES = join(RACINE, "assets", "models");
const FORCE = process.argv.includes("--force");
const JSON_SEUL = process.argv.includes("--json");

const OPTIONS = Object.freeze({
  isUASTC: false,
  generateMipmap: true,
  qualityLevel: 192,
  compressionLevel: 2,
  isPerceptual: true
});

function dimensions(octets) {
  if (octets[0] === 0x89 && octets[1] === 0x50) {
    return { width: octets.readUInt32BE(16), height: octets.readUInt32BE(20) };
  }
  if (octets[0] === 0xff && octets[1] === 0xd8) {
    let index = 2;
    while (index < octets.length) {
      if (octets[index] !== 0xff) { index++; continue; }
      const marqueur = octets[index + 1];
      if (marqueur >= 0xc0 && marqueur <= 0xcf && marqueur !== 0xc4 && marqueur !== 0xc8 && marqueur !== 0xcc) {
        return { height: octets.readUInt16BE(index + 5), width: octets.readUInt16BE(index + 7) };
      }
      index += 2 + octets.readUInt16BE(index + 2);
    }
  }
  return { width: 0, height: 0 };
}

async function main() {
  let NodeIO, KHRTextureBasisu, ALL_EXTENSIONS, encodeToKTX2, sharp;
  try {
    ({ NodeIO } = await import("@gltf-transform/core"));
    ({ KHRTextureBasisu, ALL_EXTENSIONS } = await import("@gltf-transform/extensions"));
    ({ encodeToKTX2 } = await import("babylonpress-ktx2-encoder"));
    ({ default: sharp } = await import("sharp"));
  } catch (erreur) {
    console.error(
      "[ktx2-glb] outils absents. Ils ne partent pas chez le joueur :\n"
      + "  npm install --no-save @gltf-transform/core @gltf-transform/extensions babylonpress-ktx2-encoder sharp\n"
      + `  (${erreur?.message || erreur})`
    );
    process.exit(2);
  }

  // Même compensation que pour les textures autonomes : une texture compressée
  // n'est pas retournée à l'upload. Les UV d'un glTF sont déjà en repère image
  // (origine en haut à gauche) et `GLTFLoader` pose `flipY = false` sur TOUTES
  // les textures de modèle, compressées ou non — il n'y a donc rien à
  // compenser ici, contrairement aux textures autonomes du moteur.
  const imageDecoder = async (buffer) => {
    const { data, info } = await sharp(Buffer.from(buffer))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { width: info.width, height: info.height, data: new Uint8Array(data) };
  };

  // ⚠️ TOUTES LES EXTENSIONS, PAS SEULEMENT CELLE QU'ON AJOUTE. `NodeIO` JETTE
  // en silence ce qu'il ne sait pas relire : au premier essai, les quatre GLB
  // d'équipage ont perdu `KHR_materials_specular` et `KHR_materials_ior`, et
  // leur matériau est retombé de MeshPhysical à MeshStandard — que
  // `makeCrewMaterial` clone ensuite pour tout l'équipage. Enregistrer le jeu
  // complet garantit un aller-retour fidèle : on ne change QUE les images.
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const releves = [];

  for (const fichier of readdirSync(MODELES).filter((n) => n.endsWith(".glb")).sort()) {
    const chemin = join(MODELES, fichier);
    const avant = (await stat(chemin)).size;
    const document = await io.read(chemin);
    const textures = document.getRoot().listTextures();
    if (!textures.length) continue;

    const dejaFait = textures.every((t) => t.getMimeType() === "image/ktx2");
    if (dejaFait && !FORCE) {
      releves.push({ fichier, images: textures.length, cache: true });
      continue;
    }

    let vramAvant = 0;
    let vramApres = 0;
    let converties = 0;
    for (const texture of textures) {
      const source = texture.getImage();
      if (!source) continue;
      const octets = Buffer.from(source);
      if (octets[0] === 0xab && octets[1] === 0x4b) continue; // déjà en KTX2
      const { width, height } = dimensions(octets);
      // Blocs 4×4 : une dimension non conforme reste telle quelle plutôt que
      // d'être rembourrée en silence par le transcodeur.
      if (!width || !height || width % 4 || height % 4) {
        releves.push({ fichier, ignore: `${width}x${height} incompatible ETC1S` });
        continue;
      }
      const ktx2 = await encodeToKTX2(new Uint8Array(octets), { ...OPTIONS, imageDecoder });
      texture.setImage(ktx2).setMimeType("image/ktx2");
      vramAvant += width * height * 4 * 1.333;
      vramApres += width * height * 4 * 1.333 / 8;
      converties++;
    }
    if (!converties) continue;

    // L'extension doit être DÉCLARÉE : sans elle le glTF est invalide et
    // `GLTFLoader` refuse le fichier au lieu de retomber gentiment.
    document.createExtension(KHRTextureBasisu).setRequired(true);
    await io.write(chemin, document);
    const apres = (await stat(chemin)).size;
    releves.push({ fichier, images: converties, avant, apres, vramAvant, vramApres });
    if (!JSON_SEUL) {
      console.log(`  ${fichier.padEnd(28)} ${converties} img  ${(avant / 1024).toFixed(0)} -> ${(apres / 1024).toFixed(0)} Ko  VRAM ${(vramAvant / 1048576).toFixed(2)} -> ${(vramApres / 1048576).toFixed(2)} Mo`);
    }
  }

  const faits = releves.filter((r) => r.images && !r.cache);
  const somme = (champ) => faits.reduce((total, r) => total + (r[champ] || 0), 0);
  const bilan = {
    modeles: faits.length,
    images: somme("images"),
    disqueAvantMo: +(somme("avant") / 1048576).toFixed(2),
    disqueApresMo: +(somme("apres") / 1048576).toFixed(2),
    vramAvantMo: +(somme("vramAvant") / 1048576).toFixed(2),
    vramApresMo: +(somme("vramApres") / 1048576).toFixed(2)
  };
  bilan.vramEconomiseeMo = +(bilan.vramAvantMo - bilan.vramApresMo).toFixed(2);

  if (JSON_SEUL) {
    console.log(JSON.stringify({ bilan, releves }, null, 2));
    return;
  }
  console.log("");
  console.log(`  ${bilan.modeles} modèles, ${bilan.images} images`);
  console.log(`  disque : ${bilan.disqueAvantMo} -> ${bilan.disqueApresMo} Mo`);
  console.log(`  VRAM   : ${bilan.vramAvantMo} -> ${bilan.vramApresMo} Mo  (${bilan.vramEconomiseeMo} Mo rendus au GPU)`);
  console.log("");
  console.log("  ⚠️ Lance maintenant `npm run test:crew` : cet outil a réécrit les GLB");
  console.log("     d'équipage, squelette, actions et clé de forme « poing » compris.");
  for (const r of releves.filter((x) => x.ignore)) console.log(`  ignorée : ${r.fichier} — ${r.ignore}`);
}

await main();
