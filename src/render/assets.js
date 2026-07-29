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
  // Les props d'arme et de parcours. Passés par YOLE_RIGS et non YOLE_PARTS
  // parce qu'`extractGeometry` jette le matériau : on veut leur texture.
  barik: "barik.glb",
  chadron: "chadron.glb",
  lanbi: "lanbi.glb",
  pwason: "pwason.glb",
  bouee: "bouee.glb"
});

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

  // Les textures ne dépendent d'aucun addon : un échec de GLTFLoader ne doit pas
  // les emporter avec lui.
  async loadTextures(list = YOLE_TEXTURES, basePath = "./assets/textures/") {
    const THREE = this.THREE;
    if (!THREE?.TextureLoader) return this;
    const loader = new THREE.TextureLoader();
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
      try {
        const texture = await loader.loadAsync(`${basePath}${spec.file}`);
        if (spec.color && THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 4;
        this.textures.set(name, texture);
        this.loadedParts.push(`texture:${name}`);
      } catch (error) {
        console.info(`[assets] texture ${name} absente (${error?.message || error})`);
      }
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

  async load(parts = YOLE_PARTS, basePath = "./assets/models/", rigs = YOLE_RIGS) {
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
    this.cloneSkeleton = await this.loadSkeletonUtils();

    for (const [part, file] of Object.entries(rigs)) {
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
    }

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
