// Chargement de modèles GLB, strictement optionnel.
//
// Règle : le GLB fournit une GÉOMÉTRIE, jamais un matériau. Les quatre yoles
// partagent la même géométrie et ne diffèrent que par la couleur d'équipage,
// appliquée par le jeu. Une pièce absente, un addon absent ou un fichier
// corrompu ne sont jamais fatals : le rendu procédural reprend la main.
//
// Le contrat d'export (axes, échelle, origine, nommage) est décrit dans
// docs/ASSET_CONTRACT.md.

export const YOLE_PARTS = Object.freeze({
  hull: "yole_hull.glb"
});

// Pièces articulées : on ne garde pas une géométrie mais la scène entière, pour
// pouvoir l'instancier par équipier et piloter ses joints depuis la simulation.
export const YOLE_RIGS = Object.freeze({
  crew: "yole_crew.glb",
  // ── VARIANTES D'ÉQUIPIERS — Meshy 7, 12 août 2026 ───────────────────────
  // Trois identités de silhouette (locks, casquette, bakoua) générées depuis
  // la planche du dépôt, passées par le MÊME pipeline que le rig de base
  // (tools/build_crew_asset.py) : mêmes 24 os, mêmes cinq actions écrites sur
  // LEUR bind — mesuré 19 à 30° d'écart de bind avec le rig de base, donc les
  // clips ne se partagent pas entre variantes ; chaque GLB porte les siens.
  crew_locks: "yole_crew_locks.glb",
  crew_casquette: "yole_crew_casquette.glb",
  crew_bakoua: "yole_crew_bakoua.glb",
  // Les props d'arme et de parcours. Passés par YOLE_RIGS et non YOLE_PARTS
  // parce qu'`extractGeometry` jette le matériau : on veut leur texture.
  // La flottille suiveuse du Tour : catamarans de spectateurs et vedettes.
  // Passés par YOLE_RIGS pour garder leurs textures (extractGeometry jette le
  // matériau). Statique, aucun squelette.
  flottille_catamaran: "flottille_catamaran.glb",
  flottille_vedette: "flottille_vedette.glb",
  // ── LE BOURG — Meshy 7, 2 septembre 2026 ────────────────────────────────
  // La côte habitée que montrent toutes les photos du Tour : case à toit de
  // tôle, canot tiré sur le sable, ponton de pêche. Mono-maillage et
  // mono-matériau, donc INSTANCIÉS par `world.js` — un appel de dessin par
  // famille. Ils gardent leur texture : contrairement aux rochers et aux
  // palmes, ils ne sont pas recolorés par arène.
  // ── LE MATÉRIEL DE PONT — Meshy 7, 2 septembre 2026 ─────────────────────
  // Ce qui traîne dans une yole et qui la distingue d'une autre d'aussi loin
  // que sa peinture : coffre à voile, bidon, écope (les videurs ne s'arrêtent
  // jamais), nasse et rouleau de cordage. Règle de la passe 82, mesurée :
  // Meshy gagne sur les objets FABRIQUÉS à silhouette reconnaissable. 400 à
  // 460 triangles chacun, 52 à 69 Ko textures comprises — les cinq réunis
  // pèsent moins qu'une seule coque supplémentaire.
  coffre_yole: "coffre_yole.glb",
  bidon: "bidon.glb",
  ecope: "ecope.glb",
  glaciere: "glaciere.glb",
  sac_voile: "sac_voile.glb",
  case_creole: "case_creole.glb",
  gommier: "gommier.glb",
  ponton: "ponton.glb",
  barik: "barik.glb",
  chadron: "chadron.glb",
  lanbi: "lanbi.glb",
  pwason: "pwason.glb",
  bouee: "bouee.glb"
});

const RUNTIME_RIGS = YOLE_RIGS;

// Textures. Le projet n'en avait AUCUNE : tout était en aplats, et c'est ce qui
// faisait « prototype » plus que la géométrie.
export const YOLE_TEXTURES = Object.freeze({
  sail: { file: "sail_djab.webp", color: true },
  explosion: { file: "explosion_flipbook.webp", color: true },
  clouds: { file: "sky_clouds.webp", color: true },
  backdrop: { file: "backdrop_far.webp", color: true },
  backdropNear: { file: "backdrop_near.webp", color: true },
  spray: { file: "spray_flipbook.webp", color: true },
  sargasse: { file: "sargasse.webp", color: true },
  hull: { file: "hull_paint.webp", color: true },
  wood: { file: "wood_bwa.webp", color: true },
  crate: { file: "crate_wood.webp", color: true },
  sailAtlas: { file: "sail_atlas.webp", color: true },
  morne: { file: "morne_rock.webp", color: true },
  spellVfx: { file: "v5/vfx/spell_vfx_atlas.webp", color: true },
  // Quatre signatures V7 packées en 2×2 : harpon, coco, mine et contre-gîte.
  // Un atlas dédié garde les 18 effets fréquents V5 dans leur draw call actuel.
  juiceVfx: { file: "v7/juice/juice_vfx_atlas.webp", color: true }
});

// Le jeu pilote sept articulations. La table d'alias accepte telles quelles les
// sorties Mixamo et les conventions Blender courantes : aucun renommage manuel
// n'est demandé à l'artiste. Premier nom trouvé, premier servi.
export const CREW_JOINTS = Object.freeze({
  hips: ["hips", "Hips", "mixamorigHips", "bassin"],
  torso: ["torso", "spine", "Spine", "Spine1", "mixamorigSpine1", "buste"],
  head: ["head", "Head", "mixamorigHead", "tete"],
  leftArmPivot: ["arm.L", "armL", "LeftArm", "upperArm.L", "mixamorigLeftArm"],
  rightArmPivot: ["arm.R", "armR", "RightArm", "upperArm.R", "mixamorigRightArm"],
  leftLegPivot: ["leg.L", "legL", "LeftUpLeg", "thigh.L", "mixamorigLeftUpLeg"],
  rightLegPivot: ["leg.R", "legR", "RightUpLeg", "thigh.R", "mixamorigRightUpLeg"]
});

// Articulations de finition du moteur Crew V2. Elles améliorent les contacts et
// les silhouettes rapprochées, mais ne font jamais échouer un rig ancien : les
// sept points ci-dessus restent le contrat minimal. Un Mixamo standard les
// fournit toutes, tandis que le gabarit procédural reste parfaitement valide.
export const CREW_OPTIONAL_JOINTS = Object.freeze({
  spineMid: ["Spine01", "Spine1", "mixamorigSpine1", "spine.001"],
  spineUpper: ["Spine02", "Spine2", "mixamorigSpine2", "spine.002", "chest"],
  neck: ["neck", "Neck", "mixamorigNeck", "cou"],
  leftForeArm: ["LeftForeArm", "forearm.L", "forearmL", "mixamorigLeftForeArm"],
  rightForeArm: ["RightForeArm", "forearm.R", "forearmR", "mixamorigRightForeArm"],
  leftHand: ["LeftHand", "hand.L", "handL", "mixamorigLeftHand"],
  rightHand: ["RightHand", "hand.R", "handR", "mixamorigRightHand"],
  leftLowerLeg: ["LeftLeg", "shin.L", "shinL", "mixamorigLeftLeg"],
  rightLowerLeg: ["RightLeg", "shin.R", "shinR", "mixamorigRightLeg"],
  leftFoot: ["LeftFoot", "foot.L", "footL", "mixamorigLeftFoot"],
  rightFoot: ["RightFoot", "foot.R", "footR", "mixamorigRightFoot"]
});

export class AssetLibrary {
  constructor(THREE) {
    this.THREE = THREE;
    this.geometries = new Map();
    this.models = new Map();
    this.textures = new Map();
    this.cloneSkeleton = null;
    this.status = "idle";
    this.reason = null;
    this.loadedParts = [];
  }

  get available() {
    return this.geometries.size > 0 || this.models.size > 0 || this.textures.size > 0;
  }

  texture(name) {
    return this.textures.get(name) ?? null;
  }

  /**
   * Le chargeur KTX2, ou `null` si l'appareil ou le vendoring ne suit pas.
   *
   * ⚠️ IL LUI FAUT SAVOIR CE QUE LE GPU SAIT DÉCODER, ET IL N'Y A PAS ENCORE
   * DE RENDERER. `loadTextures` tourne dans `main.js` avant que `Game` ne
   * construise le WebGLRenderer, et `detectSupport` veut un renderer. Créer un
   * second contexte WebGL permanent pour ça serait cher sur mobile — deux
   * contextes, deux fois la mémoire de base. On lui passe donc un LEURRE : un
   * objet qui expose `extensions.has/get`, adossé à un contexte WebGL2
   * jetable qu'on relâche aussitôt. C'est exactement la surface que
   * `KTX2Loader.detectSupport` consulte pour un rendu WebGL (three r185,
   * KTX2Loader.js:230-256) : les sept extensions de texture compressée.
   */
  async loadKTX2Loader() {
    if (this.ktx2Loader !== undefined) return this.ktx2Loader;
    this.ktx2Loader = null;
    try {
      if (typeof document === "undefined") return null;
      const url = new URL("../../vendor/addons/KTX2Loader.js", import.meta.url);
      const module = await import(/* @vite-ignore */ url.href);
      if (!module?.KTX2Loader) return null;
      const sonde = document.createElement("canvas");
      const gl = sonde.getContext("webgl2") || sonde.getContext("webgl");
      if (!gl) return null;
      const leurre = {
        isWebGPURenderer: false,
        extensions: {
          has: (nom) => Boolean(gl.getExtension(nom)),
          get: (nom) => gl.getExtension(nom)
        }
      };
      const loader = new module.KTX2Loader();
      loader.setTranscoderPath(new URL("../../vendor/basis/", import.meta.url).href);
      loader.detectSupport(leurre);
      // Le contexte jetable a fini son office : on le rend au navigateur
      // plutôt que d'attendre le ramasse-miettes, qui garderait un contexte
      // WebGL de plus vivant pendant toute la partie.
      gl.getExtension("WEBGL_lose_context")?.loseContext?.();
      this.ktx2Loader = loader;
    } catch (erreur) {
      console.info(`[assets] KTX2 indisponible, repli WebP (${erreur?.message || erreur})`);
      this.ktx2Loader = null;
    }
    return this.ktx2Loader;
  }

  // Les textures ne dépendent d'aucun addon : un échec de GLTFLoader ne doit pas
  // les emporter avec lui.
  async loadTextures(list = YOLE_TEXTURES, basePath = "./assets/textures/") {
    const THREE = this.THREE;
    if (!THREE?.TextureLoader) return this;
    const loader = new THREE.TextureLoader();
    // ─── KTX2 D'ABORD, WEBP TOUJOURS EN REPLI ──────────────────────────────
    //
    // Une WebP est compressée sur le DISQUE et décompressée à l'upload : elle
    // occupe la place d'un RGBA8 complet en mémoire GPU. `sail_atlas` pèse
    // 506 Ko sur disque et 12 Mo en VRAM. Un KTX2/Basis reste compressé SUR le
    // GPU, transcodé au chargement vers ASTC, BC7 ou ETC2 selon l'appareil.
    // Mesuré sur les quatorze textures : 64,1 Mo de VRAM contre 8, soit 56 Mo
    // rendus au GPU — ce qui décide de la chauffe sur un Android de milieu de
    // gamme, le P0 ouvert de docs/NEXT_PRODUCTION_STEPS.md.
    //
    // ⚠️ LE REPLI N'EST PAS DÉCORATIF. Les .webp restent livrées et le jeu doit
    // tourner sans un seul .ktx2 : vendoring absent, navigateur sans extension
    // de texture compressée, monofichier autonome. Chaque texture retombe
    // INDIVIDUELLEMENT, une compressée qui manque n'emporte pas les autres.
    const ktx2 = await this.loadKTX2Loader();
    // ⚠️ EN PARALLÈLE, PAS EN SÉRIE. Le `await` était DANS la boucle : les 14
    // textures partaient l'une après l'autre, soit quatorze allers-retours
    // réseau enchaînés avant que le menu n'apparaisse. Sur un lien mobile à
    // 100 ms de latence, c'est 1,4 s perdue en attente pure, sans compter le
    // transfert. `Promise.allSettled` garde le repli par entrée : une texture
    // absente laisse toujours les autres arriver.
    //
    // L'ordre de `loadedParts` change et c'est sans conséquence : il n'alimente
    // qu'un `console.info` de diagnostic.
    await Promise.allSettled(Object.entries(list).map(async ([name, spec]) => {
      let texture = null;
      let compressee = false;
      if (ktx2) {
        try {
          texture = await ktx2.loadAsync(`${basePath}${spec.file.replace(/\.webp$/i, ".ktx2")}`);
          compressee = true;
        } catch {
          texture = null;
        }
      }
      if (!texture) {
        try {
          texture = await loader.loadAsync(`${basePath}${spec.file}`);
        } catch (error) {
          console.info(`[assets] texture ${name} absente (${error?.message || error})`);
          return;
        }
      }
      if (spec.color && THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      // Une texture transcodée arrive avec ses mips et sans `flipY` : le
      // conserver ferait retourner tous les atlas. `KTX2Loader` pose déjà les
      // bons drapeaux, on ne les écrase pas.
      this.textures.set(name, texture);
      this.loadedParts.push(compressee ? `texture:${name}:ktx2` : `texture:${name}`);
    }));
    return this;
  }

  hasRig(part) {
    return this.models.has(part);
  }

  // Chaque équipier a besoin de son propre squelette : SkeletonUtils.clone()
  // duplique la hiérarchie ET la liaison des os, ce que Object3D.clone() ne fait
  // pas (tous les clones partageraient alors la même pose).
  instantiate(part) {
    const model = this.models.get(part);
    if (!model) return null;
    return this.cloneSkeleton ? this.cloneSkeleton(model.scene) : model.scene.clone(true);
  }

  animations(part) {
    return this.models.get(part)?.animations ?? [];
  }

  // Résout une articulation logique par sa table d'alias, squelette ou nœuds.
  static findJoint(root, aliases) {
    for (const alias of aliases) {
      const found = root.getObjectByName?.(alias);
      if (found) return found;
    }
    return null;
  }

  has(part) {
    return this.geometries.has(part);
  }

  get(part) {
    return this.geometries.get(part) ?? null;
  }

  async loadSkeletonUtils() {
    try {
      const url = new URL("../../vendor/addons/SkeletonUtils.js", import.meta.url);
      const module = await import(/* @vite-ignore */ url.href);
      return typeof module?.clone === "function" ? module.clone : null;
    } catch {
      return null;
    }
  }

  async loadGLTFLoader() {
    // Les addons sont vendorés avec leurs imports réécrits vers le core local :
    // aucune importmap, aucune seconde instance de Three. Absents (monofichier
    // autonome, vendor/ non peuplé) => on reste procédural.
    const url = new URL("../../vendor/addons/GLTFLoader.js", import.meta.url);
    const module = await import(/* @vite-ignore */ url.href);
    if (!module?.GLTFLoader) throw new Error("GLTFLoader export missing");
    return module.GLTFLoader;
  }

  // Extrait la première géométrie du GLB, transformations du graphe appliquées.
  extractGeometry(scene) {
    let found = null;
    scene.traverse((node) => {
      if (found || !node.isMesh || !node.geometry) return;
      found = node;
    });
    if (!found) return null;
    found.updateWorldMatrix(true, false);
    const geometry = found.geometry.clone();
    geometry.applyMatrix4(found.matrixWorld);
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }

  async load(parts = YOLE_PARTS, basePath = "./assets/models/", rigs = RUNTIME_RIGS) {
    this.status = "loading";
    let GLTFLoader;
    try {
      GLTFLoader = await this.loadGLTFLoader();
    } catch (error) {
      this.status = "unavailable";
      this.reason = `GLTFLoader indisponible: ${error?.message || error}`;
      return this;
    }

    const loader = new GLTFLoader();
    // ⚠️ SANS CETTE LIGNE, LES MODÈLES PERDENT LEURS TEXTURES EN SILENCE.
    // Depuis que les images des GLB sont encodées en KTX2
    // (`tools/encode_glb_ktx2.mjs`), leur matériau déclare `KHR_texture_basisu`.
    // `GLTFLoader` ne sait pas transcoder tout seul : il lui faut le même
    // chargeur que les textures autonomes. Vu à l'écran avant correction :
    // l'équipage entier en aplat, sans vêtements, sans visages, sans coiffes —
    // et pas une ligne d'erreur. Le chargeur est partagé, pas dupliqué : un seul
    // transcodeur wasm et un seul groupe de workers pour tout le jeu.
    const ktx2 = await this.loadKTX2Loader();
    if (ktx2 && typeof loader.setKTX2Loader === "function") loader.setKTX2Loader(ktx2);
    this.cloneSkeleton = await this.loadSkeletonUtils();

    // Les rigs sont indépendants et chargés en parallèle.
    await Promise.allSettled(Object.entries(rigs).map(async ([part, file]) => {
      try {
        const gltf = await loader.loadAsync(`${basePath}${file}`);
        if (!gltf?.scene) throw new Error("aucune scène dans le GLB");
        // Meshy exporte avec emissiveFactor [1,1,1] + emissiveTexture : le modèle
        // est alors FULLBRIGHT et ne réagit ni au soleil, ni au Grain, ni aux
        // flashs d'impact. Les 24 équipiers étaient des taches plates.
        gltf.scene.traverse((node) => {
          const material = node.material;
          if (!material || !("emissiveIntensity" in material)) return;
          material.emissiveIntensity = 0;
          // Le générateur n'écrit ni metallicFactor ni roughnessFactor dans le
          // glTF. La spec impose alors 1.0 pour les deux, et GLTFLoader
          // l'applique fidèlement (vendor/addons/GLTFLoader.js:3586-3587).
          // metalness 1 annule le diffus, et le projet n'a AUCUNE envMap ni
          // scene.environment : le spéculaire indirect est nul lui aussi. Les
          // équipiers rendaient donc en métal noir éclairé par quelques lobes
          // analytiques — des taches sombres, quelle que soit la texture.
          //
          // Tissu et peau sont deux diélectriques : metalness 0. Une seule
          // texture couvre les deux, donc une rugosité unique entre le coton
          // (~0,85) et la peau (~0,70).
          if ("metalness" in material) material.metalness = 0;
          if ("roughness" in material) material.roughness = 0.78;
          material.needsUpdate = true;
        });
        this.models.set(part, { scene: gltf.scene, animations: gltf.animations ?? [] });
        this.loadedParts.push(part);
      } catch (error) {
        console.info(`[assets] rig ${part} procédural (${error?.message || error})`);
      }
    }));

    for (const [part, file] of Object.entries(parts)) {
      try {
        const gltf = await loader.loadAsync(`${basePath}${file}`);
        const geometry = this.extractGeometry(gltf.scene);
        if (!geometry) throw new Error("aucun mesh dans le GLB");
        this.geometries.set(part, geometry);
        this.loadedParts.push(part);
      } catch (error) {
        // Une pièce manquante est un cas normal tant que l'art n'est pas produit.
        console.info(`[assets] ${part} procédural (${error?.message || error})`);
      }
    }
    this.status = this.available ? "ready" : "fallback";
    return this;
  }

  dispose() {
    for (const geometry of this.geometries.values()) geometry.dispose?.();
    this.geometries.clear();
    this.models.clear();
  }
}
