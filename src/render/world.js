import { clamp, TAU } from "../core/math.js";
import { RNG } from "../core/rng.js";

// Part du décor conservée par palier de qualité, du plus bas au plus haut.
// LQ ne garde qu'un tiers des palmiers : c'est le poste le plus lourd du décor
// (chaque palmier tire un tronc plus cinq feuilles, soit six instances).
// ⚠️ Ces parts sont relatives à la CAPACITÉ des tampons (168 palmiers), pas au
// nombre réellement présent — qui vaut environ 111 sur les chunks chargés. Une
// première version mettait MQ à 0,66, soit un plafond de 111 : exactement le
// compte disponible, donc MQ rendait STRICTEMENT autant que HQ et le palier
// intermédiaire ne servait à rien. Mesuré : 716 instances dans les deux cas.
const WORLD_QUALITY = [
  { palmiers: 0.34, rochers: 0.36 },   // LQ
  { palmiers: 0.52, rochers: 0.56 },   // MQ
  { palmiers: 1.00, rochers: 1.00 }    // HQ
];

const DEFAULT_PALETTE = Object.freeze({
  sand: 0xcfc8ae,
  shallowRock: 0x4a6961,
  green: 0x1d9b58,
  darkGreen: 0x0b603d,
  leaf: 0x23b85c
});

const ARCHETYPE_PRESETS = Object.freeze({
  tropical: Object.freeze({
    skipChance: 0.14,
    lateralMin: 62,
    lateralMax: 118,
    rx: [8, 24],
    rz: [10, 34],
    sandScale: 1.015,
    sandLift: 0,
    hillWidth: 1,
    hillHeight: 1,
    palms: 1,
    rocks: 1
  }),
  lagoon: Object.freeze({
    skipChance: 0.10,
    lateralMin: 68,
    lateralMax: 126,
    rx: [8, 20],
    rz: [12, 30],
    sandScale: 1.27,
    sandLift: 0.19,
    hillWidth: 0.78,
    hillHeight: 0.58,
    palms: 1.35,
    rocks: 0.40
  }),
  islets: Object.freeze({
    skipChance: 0.04,
    lateralMin: 58,
    lateralMax: 108,
    rx: [7, 22],
    rz: [11, 32],
    sandScale: 1.15,
    sandLift: 0.09,
    hillWidth: 0.90,
    hillHeight: 0.76,
    palms: 1.28,
    rocks: 0.62
  }),
  volcanic: Object.freeze({
    skipChance: 0.16,
    lateralMin: 74,
    lateralMax: 132,
    rx: [12, 28],
    rz: [15, 38],
    sandScale: 1.025,
    sandLift: -0.04,
    hillWidth: 1.04,
    hillHeight: 1.30,
    palms: 0.72,
    rocks: 1.75
  })
});

function resolveStageProfile(stage = null) {
  const archetype = stage?.archetype && ARCHETYPE_PRESETS[stage.archetype]
    ? stage.archetype
    : "tropical";
  return {
    ...ARCHETYPE_PRESETS[archetype],
    ...(stage ?? {}),
    archetype
  };
}

export function routeCenter(z) {
  return Math.sin(z * 0.0062) * 21 + Math.sin(z * 0.014 + 0.9) * 8;
}

export function distanceToIslandCollider(island, x, z, out = {}) {
  const shapes = island.collisionShapes?.length
    ? island.collisionShapes
    : [{ x: island.x, z: island.z, rx: island.rx, rz: island.rz, rotation: 0 }];
  const dx = x - island.x;
  const dz = z - island.z;
  const radialDistance = Math.hypot(dx, dz);
  // Le centre n'a plus de singularité : une direction fixe et déterministe
  // permet d'en sortir, au lieu d'une normale (0, 0) qui immobilisait la yole.
  const directionX = radialDistance > 1e-8 ? dx / radialDistance : 1;
  const directionZ = radialDistance > 1e-8 ? dz / radialDistance : 0;
  let boundaryRadius = 0;
  let boundaryShape = shapes[0];
  for (const shape of shapes) {
    const rotation = shape.rotation || 0;
    const cosine = Math.cos(rotation);
    const sine = Math.sin(rotation);
    const localX = cosine * directionX - sine * directionZ;
    const localZ = sine * directionX + cosine * directionZ;
    const radius = 1 / Math.sqrt(
      (localX / Math.max(0.1, shape.rx)) ** 2
      + (localZ / Math.max(0.1, shape.rz)) ** 2
    );
    if (radius > boundaryRadius) {
      boundaryRadius = radius;
      boundaryShape = shape;
    }
  }
  out.x = island.x + directionX * boundaryRadius;
  out.z = island.z + directionZ * boundaryRadius;
  out.nx = directionX;
  out.nz = directionZ;
  out.shape = boundaryShape;
  out.distance = radialDistance - boundaryRadius;
  out.island = island;
  return out;
}



// Un cone parfait se lit comme un pylone. Une ile volcanique martiniquaise a une
// silhouette irreguliere : aretes, epaulement, sommet decale. On construit une
// grille radiale bruitee et on peint l'altitude au sommet (sable -> vegetation
// -> roche volcanique), ce qui garde UN seul draw call par ile.
// Tronc de cocotier : sweep conique doucement incurvé (courbe en S légère),
// centré sur Y comme l'ancien cylindre (base -1,6, sommet +1,6), avec une
// grappe de trois cocos fusionnée sous la couronne — zéro instance de plus.
function makePalmTrunkGeometry(THREE) {
  const anneaux = 6, segments = 6, demi = 1.6;
  const positions = [], indices = [], uvs = [];
  for (let a = 0; a <= anneaux; a++) {
    const t = a / anneaux;
    const y = -demi + t * 2 * demi;
    const rayon = 0.22 - 0.12 * t;
    // Courbure : lean progressif vers +X, petit retour en S au sommet.
    const bend = 0.38 * t * t + 0.06 * Math.sin(t * Math.PI);
    for (let sg = 0; sg <= segments; sg++) {
      const ang = (sg / segments) * Math.PI * 2;
      positions.push(Math.cos(ang) * rayon + bend, y, Math.sin(ang) * rayon);
      uvs.push(sg / segments, t);
    }
  }
  const stride = segments + 1;
  for (let a = 0; a < anneaux; a++) {
    for (let sg = 0; sg < segments; sg++) {
      const i0 = a * stride + sg, i1 = i0 + stride;
      indices.push(i0, i1, i0 + 1, i0 + 1, i1, i1 + 1);
    }
  }
  // Grappe de cocos : trois octaèdres écrits À LA MAIN. Pas de
  // THREE.SphereGeometry ici — les tests headless tournent sur mock-three,
  // dont les primitives n'exposent pas attributes.position (mesuré : test:ai
  // rouge sur `reading 'array'`).
  const cocos = [[0.42, 1.28, 0.10], [0.30, 1.22, -0.16], [0.52, 1.18, -0.04]];
  const r = 0.11;
  const octaSommets = [[r, 0, 0], [-r, 0, 0], [0, r, 0], [0, -r, 0], [0, 0, r], [0, 0, -r]];
  const octaFaces = [
    [2, 0, 4], [2, 4, 1], [2, 1, 5], [2, 5, 0],
    [3, 4, 0], [3, 1, 4], [3, 5, 1], [3, 0, 5]
  ];
  for (const [cx, cy, cz] of cocos) {
    const decal = positions.length / 3;
    for (const [ox, oy, oz] of octaSommets) {
      positions.push(ox + cx, oy + cy, oz + cz);
      uvs.push(0.5, 0.05);
    }
    for (const [a, b, c] of octaFaces) indices.push(decal + a, decal + b, decal + c);
  }
  const geometrie = new THREE.BufferGeometry();
  geometrie.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometrie.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometrie.setIndex(indices);
  geometrie.computeVertexNormals();
  return geometrie;
}

// Palme : lame nervurée en V qui part de l'origine le long de +Y et RETOMBE
// vers -X en s'amincissant. Après le rotation.z = π/2 du placement, +Y devient
// l'horizontale de la couronne et -X le bas : la palme s'arque vers le sol,
// comme sur les silhouettes de la photo de référence.
function makePalmFrondGeometry(THREE) {
  const segments = 6, longueur = 2.1;
  const positions = [], indices = [], uvs = [];
  for (let sg = 0; sg <= segments; sg++) {
    const t = sg / segments;
    const y = t * longueur;
    const droop = -0.88 * t * t;            // chute quadratique vers -X
    const largeur = 0.42 * (1 - t * 0.80) + 0.05;
    const pli = 0.10 * (1 - t * 0.5);       // le V de la nervure centrale
    positions.push(droop + pli, y, -largeur); // bord gauche
    positions.push(droop, y, 0);              // nervure (relevée par le pli)
    positions.push(droop + pli, y, largeur);  // bord droit
    uvs.push(0, t, 0.5, t, 1, t);
  }
  for (let sg = 0; sg < segments; sg++) {
    const a = sg * 3, b = a + 3;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
    indices.push(a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
  }
  const geometrie = new THREE.BufferGeometry();
  geometrie.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometrie.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometrie.setIndex(indices);
  geometrie.computeVertexNormals();
  return geometrie;
}

function makeIslandGeometry(THREE, rng, { radialSegments = 26, rings = 9 } = {}) {
  const positions = [];
  const colors = [];
  const uvs = [];
  const indices = [];
  const altitudes = [];
  let collisionScale = 1;

  const ridgeCount = 3 + Math.floor(rng.next() * 3);
  const ridgePhase = rng.next() * Math.PI * 2;
  const ridgeDepth = 0.16 + rng.next() * 0.20;
  const lean = (rng.next() - 0.5) * 0.26;
  // Les mornes sortaient PÂLES ET GRIS à l'écran — des triangles de papier
  // alors que le bandeau d'horizon, lui, est vert vif. La perspective aérienne
  // se lisait donc à l'envers : le proche délavé, le lointain saturé.
  //
  // Deux causes, aucune n'était la texture. (1) `rock` était un gris NEUTRE
  // (0x4d4a46, saturation 0,09) ; (2) il commençait à t = 0,55, soit dès la
  // moitié de la hauteur. La moitié haute de chaque morne était donc du béton.
  // Un piton martiniquais est boisé jusqu'au sommet : la roche n'affleure qu'à
  // la crête, et elle est basaltique — sombre et verdie, pas cendrée.
  //
  // ⚠️ Constantes SEULEMENT. Le nombre d'appels à `rng.next()` doit rester
  // identique : cette géométrie est tirée sur un flux partagé, et un appel de
  // plus décalerait toutes les silhouettes suivantes.
  const sand = new THREE.Color(0xe8d7a2);
  const jungle = new THREE.Color(0x1a7d46);
  const deepJungle = new THREE.Color(0x07492e);
  const rock = new THREE.Color(0x2f3a30);
  // Les deux pôles du moutonnement : bouquet éclairé, creux d'ombre.
  const canopyLight = new THREE.Color(0x3fae57);
  const canopyShade = new THREE.Color(0x0b3d24);
  const scratch = new THREE.Color();

  for (let ring = 0; ring <= rings; ring++) {
    const t = ring / rings;
    // Broad beach foot, steep middle flank, rounded summit. smoothstep gives
    // zero slope at both ends; the former power curve still ended in a pointed
    // cone once flat-shaded at gameplay distance.
    const radius = Math.pow(1 - t, 0.72);
    const height = t * t * (3 - 2 * t);
    let firstJitter = 1;
    for (let segment = 0; segment <= radialSegments; segment++) {
      const angle = segment === radialSegments ? 0 : (segment / radialSegments) * Math.PI * 2;
      const ridgeFade = 0.18 + (1 - t) * 0.82;
      const ridge = 1
        + Math.cos(angle * ridgeCount + ridgePhase) * ridgeDepth * ridgeFade
        + Math.cos(angle * 2 - ridgePhase * 0.7) * 0.055 * Math.sin(t * Math.PI);
      // Keep the duplicated UV seam at exactly the same position as segment 0.
      // Consume the RNG value at the closing vertex anyway so later silhouettes
      // remain bit-for-bit deterministic.
      const jitterRoll = rng.next();
      const generatedJitter = 1 + (jitterRoll - 0.5) * 0.09 * (1 - t * 0.5);
      if (segment === 0) firstJitter = generatedJitter;
      const jitter = segment === radialSegments ? firstJitter : generatedJitter;
      const r = radius * ridge * jitter;
      const shoulder = Math.cos(angle * (ridgeCount - 1) - ridgePhase) * 0.055 * Math.sin(t * Math.PI);
      const px = Math.cos(angle) * r + lean * height;
      const pz = Math.sin(angle) * r;
      positions.push(px, height + shoulder, pz);
      altitudes.push(t);
      collisionScale = Math.max(collisionScale, Math.hypot(px, pz));

      // Etagement : plage, vegetation dense, puis roche a decouvert au sommet.
      if (t < 0.16) scratch.copy(sand).lerp(jungle, t / 0.16);
      else if (t < 0.88) scratch.copy(jungle).lerp(deepJungle, (t - 0.16) / 0.72);
      else scratch.copy(deepJungle).lerp(rock, Math.pow((t - 0.88) / 0.12, 1.5));
      // Moutonnement de canopée : le dégradé lisse lisait « cône peint », pas
      // « morne boisé » (photo de référence : couronne broccoli, taches
      // claires/sombres par bouquet d'arbres). Bruit accroché à la POSITION du
      // sommet, jamais au flux RNG partagé — le nombre d'appels rng.next()
      // est contractuel pour le déterminisme des silhouettes.
      if (t >= 0.16 && t < 0.92) {
        // Fréquences À L'ÉCHELLE DES FACETTES (26×9 sommets) : plus fin, le
        // bruit se replie en bandes diagonales sur les grands triangles du
        // pied — mesuré sur capture, pas une hypothèse.
        const bosquet = Math.sin(px * 2.9 + pz * 2.1) * Math.sin(px * 1.7 - pz * 3.3)
          + Math.sin(px * 6.1 + pz * 4.7) * 0.35;
        const feuillu = Math.sin(t * Math.PI);
        if (bosquet > 0) scratch.lerp(canopyLight, Math.min(1, bosquet) * 0.34 * feuillu);
        else scratch.lerp(canopyShade, Math.min(1, -bosquet) * 0.42 * feuillu);
      }
      colors.push(scratch.r, scratch.g, scratch.b);
      // UV cylindriques : l'angle donne u, la hauteur donne v. Le facteur 3 sur
      // u répète la texture autour du morne — sans lui, une planche de 512²
      // étirée sur toute la circonférence n'apporte aucun détail.
      uvs.push((segment / radialSegments) * 3, t * 2.2);
    }
  }

  const stride = radialSegments + 1;
  for (let ring = 0; ring < rings; ring++) {
    for (let segment = 0; segment < radialSegments; segment++) {
      const a = ring * stride + segment;
      const b = a + stride;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.userData = {
    ridgeCount,
    ridgePhase,
    ridgeDepth,
    altitudes: new Float32Array(altitudes),
    collisionScale
  };
  return geometry;
}

function islandSurfaceHeight(descriptor, worldDx, worldDz) {
  const shape = descriptor.visualShape;
  if (!shape || !descriptor.visualHeight) return 0.2;
  const rotation = descriptor.visualRotation || 0;
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  const localX = c * worldDx - s * worldDz;
  const localZ = s * worldDx + c * worldDz;
  const angle = Math.atan2(localZ / descriptor.visualRz, localX / descriptor.visualRx);
  const baseRadius = Math.hypot(localX / descriptor.visualRx, localZ / descriptor.visualRz);
  let t = clamp(1 - Math.pow(Math.min(baseRadius, 1), 1 / 0.72), 0, 1);

  // Two cheap iterations account for the radial ridges used by the mesh.
  for (let iteration = 0; iteration < 2; iteration++) {
    const ridgeFade = 0.18 + (1 - t) * 0.82;
    const ridge = 1
      + Math.cos(angle * shape.ridgeCount + shape.ridgePhase) * shape.ridgeDepth * ridgeFade
      + Math.cos(angle * 2 - shape.ridgePhase * 0.7) * 0.055 * Math.sin(t * Math.PI);
    t = clamp(1 - Math.pow(Math.min(baseRadius / Math.max(0.55, ridge), 1), 1 / 0.72), 0, 1);
  }
  const height = t * t * (3 - 2 * t);
  const shoulder = Math.cos(angle * (shape.ridgeCount - 1) - shape.ridgePhase) * 0.055 * Math.sin(t * Math.PI);
  return descriptor.visualBaseY + (height + shoulder) * descriptor.visualHeight - 0.08;
}

// Clé de tri partagée. `nearestIslands` est appelée ~15 fois par image (4 yoles
// pour la pénalité de côte, 4 pour la collision, 9 pour le tir de caméra, la
// mini-carte, l'océan) : refermer un comparateur sur `focusZ` allouait une
// fonction à chaque appel. Le module est mono-thread et `sort` est synchrone,
// donc une variable de module suffit et ne peut pas être ré-entrée.
let sortFocusZ = 0;
const byDistanceToFocusZ = (a, b) => Math.abs(a.z - sortFocusZ) - Math.abs(b.z - sortFocusZ);

export class WorldStreamer {
  constructor(THREE, scene, seed = 0x7a11e, rockTexture = null, assets = null) {
    // ⚠️ Sans RepeatWrapping, les UV posées sur les mornes (u jusqu'à 3, v
    // jusqu'à 2,2) sont ÉCRÊTÉES : 82 % de la surface émergée n'affiche qu'un
    // étirement 1D des texels de bord. La carte coûtait 82 Ko et ne montrait
    // rien. `ClampToEdgeWrapping` est le défaut de Three, il faut le dire.
    if (rockTexture && THREE.RepeatWrapping) {
      rockTexture.wrapS = THREE.RepeatWrapping;
      rockTexture.wrapT = THREE.RepeatWrapping;
      rockTexture.needsUpdate = true;
    }
    this.THREE = THREE;
    this.scene = scene;
    // La flottille suiveuse. Sur toutes les photos du Tour, la course est
    // ENTOURÉE : catamarans de spectateurs, vedettes, bateau presse. Une mer
    // vide autour des concurrentes est le plus gros écart d'authenticité du
    // décor — les modèles sont des GLB statiques clonés par chunk.
    this.assets = assets;
    this.flottilleTemplates = null;
    this.flottilleBudget = 2;
    this.seed = seed;
    this.chunkLength = 145;
    this.chunkCount = 10;
    this.chunks = [];
    this.nextLogicalIndex = this.chunkCount;
    // Liste plate des descripteurs d'îles, reconstruite UNIQUEMENT quand un
    // tronçon est recyclé (~toutes les quelques secondes), pas à chaque requête.
    this.islandIndex = [];
    this.islandIndexDirty = true;
    // Tampon de tri réutilisé. `nearestIslands` renvoie une vue tronquée de ce
    // tampon : les appelants doivent la consommer ou la copier immédiatement.
    // `OceanSystem.setIslands` fait déjà `slice(0, 8)`, la mini-carte itère sur
    // place, et aucun appel n'est imbriqué dans un autre.
    this.islandScratch = [];
    this.landmarkIslands = [];
    this.stageProfile = resolveStageProfile();
    this.stageDistance = 1600;
    this.stagePalette = { ...DEFAULT_PALETTE };

    this.materials = {
      // Slightly neutral pre-exposed ivory: the scene's strong golden key light
      // brings it back toward #e8d7a2 instead of clipping it to fluorescent yellow.
      sand: new THREE.MeshStandardMaterial({ color: DEFAULT_PALETTE.sand, roughness: 0.98, flatShading: true }),
      shallowRock: new THREE.MeshStandardMaterial({ color: DEFAULT_PALETTE.shallowRock, roughness: 0.96 }),
      green: new THREE.MeshStandardMaterial({ color: DEFAULT_PALETTE.green, roughness: 0.90 }),
      darkGreen: new THREE.MeshStandardMaterial({ color: DEFAULT_PALETTE.darkGreen, roughness: 0.93 }),
      trunk: new THREE.MeshStandardMaterial({ color: 0xa76a32, roughness: 0.86 }),
      // DoubleSide : la palme est une LAME, vue de dessous quand elle retombe.
      leaf: new THREE.MeshStandardMaterial({ color: DEFAULT_PALETTE.leaf, roughness: 0.82, emissive: 0x083c1d, emissiveIntensity: 0.12, side: THREE.DoubleSide }),
      basalt: new THREE.MeshStandardMaterial({ color: 0x263631, roughness: 0.96, flatShading: true }),
      landmarkIvory: new THREE.MeshStandardMaterial({ color: 0xf1ead6, roughness: 0.92 }),
      landmarkRoof: new THREE.MeshStandardMaterial({ color: 0xd75f48, roughness: 0.84 }),
      landmarkTown: new THREE.MeshStandardMaterial({ color: 0xd5c8a9, roughness: 0.94 }),
      landmarkAccent: new THREE.MeshStandardMaterial({ color: 0x35dbc5, roughness: 0.76 }),
      // La carte de roche est DÉSATURÉE (chroma médiane 0,18) : elle apporte du
      // détail sans écraser le dégradé sable → jungle → roche porté par les
      // couleurs de sommet, qui est ce qui donne l'étagement volcanique.
      island: new THREE.MeshStandardMaterial({
        vertexColors: true,
        map: rockTexture ?? null,
        roughness: 0.94,
        flatShading: true,
        emissive: 0x032719,
        emissiveIntensity: 0.14
      })
    };

    // Cinq silhouettes tirees une fois pour toutes : la variete vient du choix
    // et de l'echelle, pas d'une geometrie par ile.
    const islandRng = new RNG((seed ^ 0x51ad9e) >>> 0);
    this.islandGeometries = Array.from({ length: 5 }, () => makeIslandGeometry(THREE, islandRng));

    this.baseGeometry = new THREE.CylinderGeometry(1, 1.08, 1, 24);
    this.hillGeometry = new THREE.ConeGeometry(1, 1, 22);
    this.rockGeometry = new THREE.DodecahedronGeometry(1, 0);
    this.landmarkConeGeometry = new THREE.ConeGeometry(1, 1, 22);
    this.landmarkTowerGeometry = new THREE.CylinderGeometry(0.72, 1, 1, 10);
    this.landmarkBoxGeometry = new THREE.BoxGeometry(1, 1, 1);
    this.landmarkFlagGeometry = new THREE.PlaneGeometry(1, 1);
    // Photo de référence : tronc élancé et COURBÉ, couronne de palmes qui
    // RETOMBENT, grappe de cocos sous la couronne. Le cylindre droit + cônes
    // horizontaux lisaient « sucette ». Mêmes conventions d'instanciation
    // (tronc centré ±1,6, palme partant de l'origine le long de +Y puis
    // couchée par rotation.z), donc le code de placement ne change pas.
    this.palmTrunkGeometry = makePalmTrunkGeometry(THREE);
    this.palmLeafGeometry = makePalmFrondGeometry(THREE);
    this.maxPalms = 168;
    this.maxRocks = 96;
    // Budgets courants — remplacés dès le premier `setQuality`, appelé par le
    // gestionnaire de qualité au démarrage.
    this.palmBudget = this.maxPalms;
    this.rockBudget = this.maxRocks;
    this.palmTrunks = new THREE.InstancedMesh(this.palmTrunkGeometry, this.materials.trunk, this.maxPalms);
    this.palmLeaves = new THREE.InstancedMesh(this.palmLeafGeometry, this.materials.leaf, this.maxPalms * 5);
    this.rocks = new THREE.InstancedMesh(this.rockGeometry, this.materials.shallowRock, this.maxRocks);
    this.palmTrunks.castShadow = true;
    this.palmLeaves.castShadow = false;
    this.rocks.castShadow = false;
    this.palmTrunks.instanceMatrix.setUsage?.(THREE.DynamicDrawUsage);
    this.palmLeaves.instanceMatrix.setUsage?.(THREE.DynamicDrawUsage);
    this.rocks.instanceMatrix.setUsage?.(THREE.DynamicDrawUsage);
    scene.add(this.palmTrunks, this.palmLeaves, this.rocks);
    this.instanceDummy = new THREE.Object3D();
    this.landmarkRoot = new THREE.Group();
    this.landmarkRoot.name = "stage-landmark";
    scene.add(this.landmarkRoot);

    for (let index = 0; index < this.chunkCount; index++) {
      const chunk = this.createChunk(index);
      this.chunks.push(chunk);
      scene.add(chunk.group);
    }
    this.rebuildInstances();
  }

  createIslandVisual(descriptor, rng) {
    const THREE = this.THREE;
    const profile = this.stageProfile;
    const group = new THREE.Group();
    const base = new THREE.Mesh(this.baseGeometry, this.materials.sand);
    base.scale.set(
      descriptor.rx * profile.sandScale,
      0.42 + descriptor.rx * 0.003,
      descriptor.rz * profile.sandScale
    );
    // Le lagon assume une vraie plage blanche émergée ; la côte volcanique
    // conserve au contraire un filet sombre et bas.
    base.position.y = profile.sandLift;
    base.castShadow = false;
    base.receiveShadow = true;
    group.add(base);

    const geometry = this.islandGeometries[rng.int(0, this.islandGeometries.length - 1)];
    const hill = new THREE.Mesh(geometry, this.materials.island);
    // Les iles basses sont larges, les pitons etroits : la hauteur suit le rayon.
    const slender = rng.range(0.72, 1.18);
    const hillHeight = (
      rng.range(9, 20) + Math.min(descriptor.rx, descriptor.rz) * 0.22
    ) * slender * profile.hillHeight;
    hill.scale.set(
      descriptor.rx * 0.86 * profile.hillWidth,
      hillHeight,
      descriptor.rz * 0.83 * profile.hillWidth
    );
    hill.position.y = -0.65;
    const hillRotation = rng.next() * TAU;
    hill.rotation.y = hillRotation;
    hill.castShadow = true;
    hill.receiveShadow = true;
    group.add(hill);

    // Métadonnées communes au placement des palmiers ET au collider. La forme
    // tournée du morne doit voyager avec sa rotation : l'ancien collider restait
    // aligné sur les axes pendant que le relief pivotait, laissant jusqu'à des
    // dizaines de mètres de roche sans contact.
    descriptor.visualHeight = hillHeight;
    descriptor.visualBaseY = -0.95;
    descriptor.visualRx = descriptor.rx * 0.86 * profile.hillWidth;
    descriptor.visualRz = descriptor.rz * 0.83 * profile.hillWidth;
    descriptor.visualRotation = hillRotation;
    descriptor.visualShape = geometry.userData;
    const terrainEnvelope = geometry.userData.collisionScale ?? 1.35;
    descriptor.collisionShapes = [
      {
        offsetX: 0,
        offsetZ: 0,
        rx: descriptor.rx * profile.sandScale * 1.01,
        rz: descriptor.rz * profile.sandScale * 1.01,
        rotation: 0,
        kind: "beach"
      },
      {
        offsetX: 0,
        offsetZ: 0,
        rx: descriptor.visualRx * terrainEnvelope,
        rz: descriptor.visualRz * terrainEnvelope,
        rotation: hillRotation,
        kind: "terrain"
      }
    ];
    descriptor.visualGroup = group;
    descriptor.visualHill = hill;

    return group;
  }

  createChunk(logicalIndex) {
    const group = new this.THREE.Group();
    const chunk = { group, logicalIndex, z: 0, islands: [], palms: [], rocks: [] };
    this.configureChunk(chunk, logicalIndex);
    return chunk;
  }

  // Gabarits de flottille, mesurés et mis à l'échelle UNE fois : Meshy sort
  // des modèles normalisés (~1 à 2 unités), on les ramène à des longueurs de
  // bateau réelles (catamaran ~11 m, vedette ~6 m).
  flottilleGabarits() {
    if (this.flottilleTemplates !== null) return this.flottilleTemplates;
    this.flottilleTemplates = [];
    if (!this.assets?.hasRig) return this.flottilleTemplates;
    const THREE = this.THREE;
    const cibles = [
      { part: "flottille_catamaran", longueur: 11.0 },
      { part: "flottille_vedette", longueur: 6.2 }
    ];
    for (const { part, longueur } of cibles) {
      if (!this.assets.hasRig(part)) continue;
      const modele = this.assets.instantiate(part);
      if (!modele) continue;
      const boite = new THREE.Box3().setFromObject(modele);
      const dims = boite.getSize(new THREE.Vector3());
      const horizontale = Math.max(dims.x, dims.z, 1e-3);
      const echelle = longueur / horizontale;
      // Pied posé à la flottaison : l'origine Meshy est au bas de la coque.
      const assiette = -boite.min.y * echelle - 0.18;
      this.flottilleTemplates.push({ modele, echelle, assiette });
    }
    return this.flottilleTemplates;
  }

  // Sème la flottille d'un chunk. Appelé EN DERNIER dans configureChunk :
  // les tirages supplémentaires ne décalent aucun élément de décor existant,
  // et les îlots du chunk sont déjà posés pour la garde de distance.
  scatterFlottille(chunk, rng) {
    const gabarits = this.flottilleGabarits();
    if (!gabarits.length || this.flottilleBudget <= 0) return;
    const THREE = this.THREE;
    const nombre = rng.chance(0.3) ? this.flottilleBudget : this.flottilleBudget - 1;
    for (let index = 0; index < nombre; index++) {
      const gabarit = gabarits[Math.floor(rng.next() * gabarits.length) % gabarits.length];
      const side = rng.chance(0.5) ? -1 : 1;
      const localZ = (rng.next() - 0.5) * this.chunkLength * 0.86;
      const worldZ = chunk.z + localZ;
      // Entre le bord du couloir de course (±58 max) et la bande d'îlots.
      const lateral = 60 + rng.next() * 14;
      const worldX = routeCenter(worldZ) + side * lateral;
      // Garde de distance aux îlots du chunk : un catamaran DANS la plage se
      // verrait tout de suite.
      let bloque = false;
      for (const island of chunk.islands) {
        const marge = Math.max(island.rx ?? 0, island.rz ?? 0) + 9;
        if (Math.hypot(worldX - island.x, worldZ - island.z) < marge) { bloque = true; break; }
      }
      if (bloque) continue;
      const clone = gabarit.modele.clone(true);
      clone.scale.setScalar(gabarit.echelle);
      // Ancrés face à la course, avec l'assiette et la gîte d'un bateau au
      // mouillage — pas quatre clones au garde-à-vous.
      clone.position.set(worldX, gabarit.assiette + (rng.next() - 0.5) * 0.06, localZ);
      clone.rotation.y = side > 0 ? Math.PI / 2 + (rng.next() - 0.5) * 0.7 : -Math.PI / 2 + (rng.next() - 0.5) * 0.7;
      clone.rotation.z = (rng.next() - 0.5) * 0.05;
      chunk.group.add(clone);
    }
  }

  configureChunk(chunk, logicalIndex) {
    while (chunk.group.children.length) chunk.group.remove(chunk.group.children[0]);
    chunk.logicalIndex = logicalIndex;
    chunk.z = logicalIndex * this.chunkLength + 55;
    chunk.group.position.z = chunk.z;
    chunk.islands.length = 0;
    chunk.palms.length = 0;
    chunk.rocks.length = 0;
    this.islandIndexDirty = true;
    const rng = new RNG((this.seed ^ Math.imul(logicalIndex + 1, 0x9e3779b1)) >>> 0);
    const flottilleRng = new RNG((this.seed ^ Math.imul(logicalIndex + 7, 0x85ebca6b)) >>> 0);
    const profile = this.stageProfile;

    for (let sideIndex = 0; sideIndex < 2; sideIndex++) {
      const side = sideIndex === 0 ? -1 : 1;
      if (rng.chance(profile.skipChance)) continue;
      // Un seul îlot par côté et une bande centrale serrée : deux chunks
      // adjacents gardent ainsi assez de mer entre leurs enveloppes de collision.
      // Avant, ±0,38 pouvait superposer deux reliefs puis faire osciller la
      // résolution entre leurs deux bords.
      const localZ = rng.range(-this.chunkLength * 0.14, this.chunkLength * 0.14);
      const center = routeCenter(chunk.z + localZ);
      const rx = rng.range(profile.rx[0], profile.rx[1]);
      const rz = rng.range(profile.rz[0], profile.rz[1]);
      const x = center + side * rng.range(profile.lateralMin, profile.lateralMax);
      const descriptor = { x, z: chunk.z + localZ, rx, rz };
      const islandVisual = this.createIslandVisual(descriptor, rng);
      islandVisual.position.set(x, -0.3, localZ);
      chunk.group.add(islandVisual);
      chunk.islands.push(descriptor);

      const palmBase = descriptor.rx > 10 ? rng.int(4, 8) : rng.int(2, 4);
      const palmCount = Math.max(1, Math.round(palmBase * profile.palms));
      for (let palmIndex = 0; palmIndex < palmCount; palmIndex++) {
        const palmDx = rng.range(-descriptor.rx * 0.56, descriptor.rx * 0.56);
        const palmDz = rng.range(-descriptor.rz * 0.52, descriptor.rz * 0.52);
        chunk.palms.push({
          x: x + palmDx,
          y: islandSurfaceHeight(descriptor, palmDx, palmDz),
          z: descriptor.z + palmDz,
          rotation: rng.next() * TAU,
          scale: rng.range(0.90, 1.60)
        });
      }

      const rockCount = Math.max(0, Math.round(rng.int(1, 4) * profile.rocks));
      for (let rockIndex = 0; rockIndex < rockCount; rockIndex++) {
        const scale = rng.range(0.7, 2.3);
        chunk.rocks.push({
          x: x + rng.range(-descriptor.rx * 0.72, descriptor.rx * 0.72),
          y: rng.range(-0.2, 0.7),
          z: descriptor.z + rng.range(-descriptor.rz * 0.7, descriptor.rz * 0.7),
          rx: rng.next() * 0.8,
          ry: rng.next() * TAU,
          rz: rng.next() * 0.8,
          sx: scale,
          sy: scale * rng.range(0.7, 1.7),
          sz: scale
        });
      }
    }
    // EN DERNIER, sur son RNG dédié : n'importe quel ajout futur au décor
    // peut s'insérer avant sans déplacer un seul bateau de spectateurs.
    this.scatterFlottille(chunk, flottilleRng);
  }

  rebuildInstances() {
    const dummy = this.instanceDummy;
    let trunkIndex = 0;
    let leafIndex = 0;
    let rockIndex = 0;
    for (const chunk of this.chunks) {
      for (const palm of chunk.palms) {
        if (trunkIndex >= (this.palmBudget ?? this.maxPalms)) break;
        dummy.position.set(palm.x, palm.y + 1.6 * palm.scale, palm.z);
        dummy.rotation.set(0, palm.rotation, 0);
        dummy.scale.setScalar(palm.scale);
        dummy.updateMatrix();
        this.palmTrunks.setMatrixAt(trunkIndex++, dummy.matrix);
        for (let leaf = 0; leaf < 5 && leafIndex < (this.palmBudget ?? this.maxPalms) * 5; leaf++) {
          dummy.position.set(palm.x, palm.y + 3.25 * palm.scale, palm.z);
          dummy.rotation.set(0, palm.rotation + leaf * TAU / 5, Math.PI * 0.5);
          dummy.scale.set(palm.scale, palm.scale, palm.scale * 0.35);
          dummy.updateMatrix();
          this.palmLeaves.setMatrixAt(leafIndex++, dummy.matrix);
        }
      }
      for (const rock of chunk.rocks) {
        if (rockIndex >= (this.rockBudget ?? this.maxRocks)) break;
        dummy.position.set(rock.x, rock.y, rock.z);
        dummy.rotation.set(rock.rx, rock.ry, rock.rz);
        dummy.scale.set(rock.sx, rock.sy, rock.sz);
        dummy.updateMatrix();
        this.rocks.setMatrixAt(rockIndex++, dummy.matrix);
      }
    }
    this.palmTrunks.count = trunkIndex;
    this.palmLeaves.count = leafIndex;
    this.rocks.count = rockIndex;
    this.palmTrunks.instanceMatrix.needsUpdate = true;
    this.palmLeaves.instanceMatrix.needsUpdate = true;
    this.rocks.instanceMatrix.needsUpdate = true;
  }

  reset() {
    for (let index = 0; index < this.chunks.length; index++) this.configureChunk(this.chunks[index], index);
    this.nextLogicalIndex = this.chunkCount;
    this.buildStageLandmark();
    this.rebuildInstances();
  }

  applyStagePalette(palette) {
    this.stagePalette = { ...DEFAULT_PALETTE, ...(palette ?? {}) };
    const apply = (material, key) => material?.color?.setHex?.(this.stagePalette[key]);
    apply(this.materials.sand, "sand");
    apply(this.materials.shallowRock, "shallowRock");
    apply(this.materials.green, "green");
    apply(this.materials.darkGreen, "darkGreen");
    apply(this.materials.leaf, "leaf");

    // Les mornes utilisent des couleurs de sommet. Modifier uniquement les
    // matériaux `green` et `darkGreen` ne changeait donc pas leur rendu.
    const THREE = this.THREE;
    const sand = new THREE.Color(this.stagePalette.sand);
    const green = new THREE.Color(this.stagePalette.green);
    const dark = new THREE.Color(this.stagePalette.darkGreen);
    const rock = new THREE.Color(this.stagePalette.shallowRock);
    const scratch = new THREE.Color();
    for (const geometry of this.islandGeometries) {
      const altitudes = geometry.userData.altitudes;
      const attribute = geometry.attributes?.color;
      if (!altitudes || !attribute?.array) continue;
      for (let index = 0; index < altitudes.length; index++) {
        const t = altitudes[index];
        if (t < 0.16) scratch.copy(sand).lerp(green, t / 0.16);
        else if (t < 0.88) scratch.copy(green).lerp(dark, (t - 0.16) / 0.72);
        else scratch.copy(dark).lerp(rock, Math.pow((t - 0.88) / 0.12, 1.5));
        attribute.array[index * 3] = scratch.r;
        attribute.array[index * 3 + 1] = scratch.g;
        attribute.array[index * 3 + 2] = scratch.b;
      }
      attribute.needsUpdate = true;
    }
  }

  clearStageLandmark() {
    if (!this.landmarkRoot) return;
    while (this.landmarkRoot.children.length) {
      this.landmarkRoot.remove(this.landmarkRoot.children[0]);
    }
    this.landmarkIslands.length = 0;
    this.islandIndexDirty = true;
  }

  addLandmarkMesh(geometry, material, x, y, z, sx, sy, sz, rotationY = 0) {
    const mesh = new this.THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.rotation.y = rotationY;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.landmarkRoot.add(mesh);
    return mesh;
  }

  addStaticLandmarkCollider(x, z, rx, rz, rotation = 0) {
    const descriptor = {
      x,
      z,
      rx,
      rz,
      landmark: true,
      collisionShapes: [{
        offsetX: 0,
        offsetZ: 0,
        rx,
        rz,
        rotation,
        kind: "landmark"
      }]
    };
    this.landmarkIslands.push(descriptor);
    this.islandIndexDirty = true;
    return descriptor;
  }

  addLandmarkIsland(x, z, rx, rz, rng) {
    const descriptor = { x, z, rx, rz, landmark: true };
    const visual = this.createIslandVisual(descriptor, rng);
    visual.position.set(x, -0.3, z);
    this.landmarkRoot.add(visual);
    this.landmarkIslands.push(descriptor);
    this.islandIndexDirty = true;
    return descriptor;
  }

  buildStageLandmark() {
    this.clearStageLandmark();
    const landmark = this.stageProfile.landmark;
    if (!landmark?.type || !this.landmarkRoot) return;
    const rng = new RNG((this.seed ^ 0x4c414e44) >>> 0);
    const progress = clamp(landmark.progress ?? 0.68, 0.28, 0.90);
    const z = this.stageDistance * progress;
    const side = landmark.side === -1 ? -1 : 1;
    const offset = landmark.offset ?? 142;
    const x = routeCenter(z) + side * offset;

    if (landmark.type === "pointe-marin") {
      this.addLandmarkIsland(x, z, 31, 52, rng);
      this.addLandmarkMesh(this.landmarkTowerGeometry, this.materials.landmarkIvory,
        x - side * 4, 7.0, z - 6, 2.5, 13, 2.5);
      this.addLandmarkMesh(this.landmarkConeGeometry, this.materials.landmarkRoof,
        x - side * 4, 14.4, z - 6, 3.2, 3.7, 3.2);
    } else if (landmark.type === "ilets-francois") {
      this.addLandmarkIsland(x, z, 18, 27, rng);
      this.addLandmarkIsland(x + side * 31, z + 19, 12, 19, rng);
      this.addLandmarkIsland(x - side * 27, z - 23, 10, 16, rng);
    } else if (landmark.type === "baie-robert") {
      this.addLandmarkIsland(x, z, 34, 45, rng);
      this.addLandmarkIsland(x + side * 48, z + 28, 16, 24, rng);
      for (let index = -2; index <= 2; index++) {
        this.addLandmarkMesh(this.landmarkTowerGeometry, this.materials.darkGreen,
          x + index * 6, 4.1 + Math.abs(index) * 0.45, z - 8 + Math.abs(index) * 2,
          2.2, 8 + Math.abs(index), 2.2);
      }
    } else if (landmark.type === "pelee") {
      this.addStaticLandmarkCollider(x, z, 82, 68);
      const geometry = this.islandGeometries[3];
      this.addLandmarkMesh(geometry, this.materials.island, x, -1.4, z,
        78, 118, 66, side * 0.08);
      this.addLandmarkMesh(geometry, this.materials.island, x - side * 46, -1.2, z + 12,
        42, 66, 38, -side * 0.16);
    } else if (landmark.type === "baie-fdf") {
      this.addLandmarkIsland(x, z, 48, 60, rng);
      for (let index = -4; index <= 4; index++) {
        const height = 5 + (Math.abs(index * 17) % 8);
        this.addLandmarkMesh(this.landmarkBoxGeometry, this.materials.landmarkTown,
          x + index * 6.2, height * 0.5 + 0.4, z - 8 + (index % 2) * 4,
          4.5, height, 5.5);
      }
    } else if (landmark.type === "diamant") {
      this.addStaticLandmarkCollider(x, z, 30, 25, side * 0.12);
      this.addLandmarkMesh(this.rockGeometry, this.materials.basalt, x, 20, z,
        25, 41, 21, side * 0.12);
      this.addLandmarkMesh(this.rockGeometry, this.materials.darkGreen,
        x - side * 5, 9, z + 2, 18, 17, 16, -side * 0.18);
    } else if (landmark.type === "cap-salomon") {
      this.addLandmarkIsland(x, z, 47, 66, rng);
      this.addLandmarkMesh(this.landmarkBoxGeometry, this.materials.basalt,
        x - side * 20, 8, z - 10, 19, 16, 35, side * 0.22);
    } else if (landmark.type === "sainte-anne") {
      this.addLandmarkIsland(x, z, 36, 58, rng);
      for (let index = -2; index <= 2; index++) {
        const poleX = x + index * 7;
        this.addLandmarkMesh(this.landmarkTowerGeometry, this.materials.landmarkIvory,
          poleX, 5.5, z - 12, 0.35, 11, 0.35);
        const flag = this.addLandmarkMesh(this.landmarkFlagGeometry, this.materials.landmarkAccent,
          poleX + side * 1.8, 9.4, z - 12, 3.6, 1.5, 1, side * Math.PI * 0.5);
        flag.castShadow = false;
      }
    }
  }

  /**
   * Donne à chaque étape du Tour son littoral déterministe et sa propre teinte.
   * La géométrie de base reste mutualisée : aucun chargement ni allocation GPU
   * supplémentaire entre deux étapes.
   */
  setStage(seed, palette = null, stage = null, distance = 1600) {
    this.seed = seed >>> 0;
    this.stageProfile = resolveStageProfile(stage);
    this.stageDistance = Math.max(600, Number(distance) || 1600);
    this.applyStagePalette(palette);
    this.reset();
  }

  /**
   * Budget de décor par palier de qualité.
   *
   * ⚠️ CETTE MÉTHODE NE FAISAIT RIEN. Elle recevait `tier` et ne le lisait
   * jamais : elle remettait simplement les trois InstancedMesh visibles, sans
   * condition. Sur un téléphone qui tombe en LQ, le gestionnaire de qualité
   * réduisait le ratio de pixels, les ombres et les particules — mais la
   * végétation restait à son compte MAXIMAL. Le palier de secours ne récupérait
   * donc qu'une partie de ce qu'il est censé récupérer, et le levier avait
   * l'air d'exister sans exister.
   *
   * ⚠️ On plafonne le nombre d'instances DESSINÉES, on ne réalloue pas les
   * tampons : `InstancedMesh` fixe sa capacité à la construction, et la
   * recréer à chaque changement de palier ferait un à-coup bien pire que ce
   * qu'on économise.
   *
   * Purement visuel : la collision passe par `coastPenalty` et
   * `resolveBoatCollision`, qui lisent les données de chunk — jamais ces
   * maillages.
   */
  setQuality(tier) {
    const palier = Math.max(0, Math.min(2, tier | 0));
    const part = WORLD_QUALITY[palier];
    this.palmBudget = Math.round(this.maxPalms * part.palmiers);
    this.rockBudget = Math.round(this.maxRocks * part.rochers);
    // Deux bateaux de flottille par chunk en HQ, un en MQ, zéro en LQ : les
    // clones coûtent des draw calls, pas des instances. Appliqué au prochain
    // recyclage de chunk — la flottille est loin du couloir, personne ne voit
    // la transition.
    this.flottilleBudget = palier >= 2 ? 2 : palier === 1 ? 1 : 0;
    this.palmTrunks.visible = true;
    this.palmLeaves.visible = true;
    this.rocks.visible = true;
    // Le changement doit se voir TOUT DE SUITE : sans cette reconstruction, il
    // n'apparaîtrait qu'au prochain recyclage de chunk, donc des secondes plus
    // tard — et le joueur attribuerait la saccade à autre chose.
    this.rebuildInstances();
  }

  update(focusZ) {
    let maxLogical = Math.max(...this.chunks.map((chunk) => chunk.logicalIndex));
    let recycled = false;
    for (const chunk of this.chunks) {
      if (chunk.z < focusZ - this.chunkLength * 2.4) {
        maxLogical += 1;
        this.configureChunk(chunk, maxLogical);
        recycled = true;
      }
    }
    if (recycled) this.rebuildInstances();
  }

  /**
   * Les `limit` îles les plus proches en z, triées.
   *
   * ⚠️ Renvoie un TAMPON PARTAGÉ, valide jusqu'au prochain appel. Sémantique
   * identique à l'ancien `flatMap().sort().slice()` — même comparateur, même
   * ordre d'entrée, même tri stable — parce que `coastPenalty` alimente la
   * physique : changer l'ensemble retenu changerait les checksums.
   * Ce qui disparaît, ce sont les trois allocations par appel.
   */
  nearestIslands(focusZ, limit = 8) {
    if (this.islandIndexDirty) {
      this.islandIndex.length = 0;
      for (const chunk of this.chunks) {
        for (const island of chunk.islands) this.islandIndex.push(island);
      }
      for (const island of this.landmarkIslands) this.islandIndex.push(island);
      this.islandIndexDirty = false;
    }
    const scratch = this.islandScratch;
    scratch.length = 0;
    for (let index = 0; index < this.islandIndex.length; index++) scratch.push(this.islandIndex[index]);
    sortFocusZ = focusZ;
    scratch.sort(byDistanceToFocusZ);
    if (scratch.length > limit) scratch.length = limit;
    return scratch;
  }

  coastPenalty(x, z) {
    const surface = this.nearestSurface(x, z, this.coastSurface || (this.coastSurface = {}));
    if (!surface.island) return 0;
    // Frein progressif en mètres réels : il ne dépend plus de l'allongement de
    // l'ellipse et prévient avant le contact ferme.
    return clamp((4.6 - surface.distance) / 5.8, 0, 1);
  }

  /** Distance signée à l'enveloppe radiale des lobes elliptiques orientés. */
  nearestSurface(x, z, out = {}) {
    let best = Infinity;
    let bestIsland = null;
    for (const island of this.nearestIslands(z, 12)) {
      const contact = distanceToIslandCollider(
        island,
        x,
        z,
        out.islandScratch || (out.islandScratch = {})
      );
      if (contact && contact.distance < best) {
        best = contact.distance;
        bestIsland = island;
        out.x = contact.x;
        out.z = contact.z;
        out.nx = contact.nx;
        out.nz = contact.nz;
        out.shape = contact.shape;
      }
    }
    out.distance = best;
    out.island = bestIsland;
    if (!bestIsland) {
      out.nx = 0;
      out.nz = 0;
      out.x = x;
      out.z = z;
      out.shape = null;
    }
    return out;
  }

  /**
   * Resolve a boat against the procedural island SDF. Returns contact severity.
   * This stays deterministic and avoids a heavyweight static physics world.
   */
  resolveBoatCollision(boat, margin = 1.35, out = {}) {
    const surface = out.surface || (out.surface = {});
    this.nearestSurface(boat.x, boat.z, surface);
    if (!surface.island || surface.distance >= margin) {
      out.hit = false;
      out.severity = 0;
      return out;
    }

    const firstNx = surface.nx;
    const firstNz = surface.nz;
    const firstBoundaryX = surface.x;
    const firstBoundaryZ = surface.z;
    const firstPenetration = margin - surface.distance;
    const inwardSpeed = -(boat.dynamics.vx * firstNx + boat.dynamics.vz * firstNz);

    // Sortie directe sur le point de frontière exact, puis quelques itérations
    // bornées pour l'union plage + morne. Cela couvre aussi le centre exact :
    // closestPointOnEllipse y fournit une normale de secours déterministe.
    const solveMargin = margin + 0.05;
    for (let iteration = 0; iteration < 14; iteration++) {
      if (!surface.island || surface.distance >= solveMargin - 1e-5) break;
      boat.dynamics.x = surface.x + surface.nx * solveMargin;
      boat.dynamics.z = surface.z + surface.nz * solveMargin;
      this.nearestSurface(boat.x, boat.z, surface);
    }

    if (inwardSpeed > 0) {
      const restitution = 0.18;
      boat.dynamics.vx += firstNx * inwardSpeed * (1 + restitution);
      boat.dynamics.vz += firstNz * inwardSpeed * (1 + restitution);
    }
    const tangentX = -firstNz;
    const tangentZ = firstNx;
    const tangentSpeed = boat.dynamics.vx * tangentX + boat.dynamics.vz * tangentZ;
    boat.dynamics.vx -= tangentX * tangentSpeed * 0.08;
    boat.dynamics.vz -= tangentZ * tangentSpeed * 0.08;
    out.hit = true;
    out.penetration = firstPenetration;
    out.inwardSpeed = inwardSpeed;
    out.severity = clamp((Math.max(0, inwardSpeed) + firstPenetration * 4) / 16, 0.08, 1.25);
    out.x = firstBoundaryX;
    out.z = firstBoundaryZ;
    out.nx = firstNx;
    out.nz = firstNz;
    return out;
  }

  /** Pull a chase camera out of islands and keep it above the shoreline. */
  constrainCamera(target, desired, out = desired) {
    out.copy(desired);
    const dx = desired.x - target.x;
    const dz = desired.z - target.z;
    const samples = 9;
    let safeT = 1;
    for (let index = 1; index <= samples; index++) {
      const t = index / samples;
      const x = target.x + dx * t;
      const z = target.z + dz * t;
      const surface = this.nearestSurface(x, z, this.cameraSurface || (this.cameraSurface = {}));
      if (surface.distance < 2.4) {
        safeT = Math.max(0, (index - 1.25) / samples);
        break;
      }
    }
    if (safeT < 1) {
      out.x = target.x + dx * safeT;
      out.z = target.z + dz * safeT;
      out.y = Math.max(out.y, target.y + 3.8);
    }
    // Le rayon discret choisit un intervalle ; cette projection finale donne
    // la garantie continue, y compris lorsque la cible elle-même longe la plage.
    const cameraMargin = 2.55;
    for (let iteration = 0; iteration < 8; iteration++) {
      const surface = this.nearestSurface(
        out.x,
        out.z,
        this.cameraResolveSurface || (this.cameraResolveSurface = {})
      );
      if (!surface.island || surface.distance >= cameraMargin - 1e-5) break;
      out.x = surface.x + surface.nx * cameraMargin;
      out.z = surface.z + surface.nz * cameraMargin;
      out.y = Math.max(out.y, target.y + 3.8);
    }
    return out;
  }
}
