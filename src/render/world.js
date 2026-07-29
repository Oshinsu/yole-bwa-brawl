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

export function routeCenter(z) {
  return Math.sin(z * 0.0062) * 21 + Math.sin(z * 0.014 + 0.9) * 8;
}



// Un cone parfait se lit comme un pylone. Une ile volcanique martiniquaise a une
// silhouette irreguliere : aretes, epaulement, sommet decale. On construit une
// grille radiale bruitee et on peint l'altitude au sommet (sable -> vegetation
// -> roche volcanique), ce qui garde UN seul draw call par ile.
function makeIslandGeometry(THREE, rng, { radialSegments = 26, rings = 9 } = {}) {
  const positions = [];
  const colors = [];
  const uvs = [];
  const indices = [];

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
      positions.push(Math.cos(angle) * r + lean * height, height + shoulder, Math.sin(angle) * r);

      // Etagement : plage, vegetation dense, puis roche a decouvert au sommet.
      if (t < 0.16) scratch.copy(sand).lerp(jungle, t / 0.16);
      else if (t < 0.88) scratch.copy(jungle).lerp(deepJungle, (t - 0.16) / 0.72);
      else scratch.copy(deepJungle).lerp(rock, Math.pow((t - 0.88) / 0.12, 1.5));
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
  geometry.userData = { ridgeCount, ridgePhase, ridgeDepth };
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
  constructor(THREE, scene, seed = 0x7a11e, rockTexture = null) {
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

    this.materials = {
      // Slightly neutral pre-exposed ivory: the scene's strong golden key light
      // brings it back toward #e8d7a2 instead of clipping it to fluorescent yellow.
      sand: new THREE.MeshStandardMaterial({ color: 0xcfc8ae, roughness: 0.98, flatShading: true }),
      shallowRock: new THREE.MeshStandardMaterial({ color: 0x4a6961, roughness: 0.96 }),
      green: new THREE.MeshStandardMaterial({ color: 0x1d9b58, roughness: 0.90 }),
      darkGreen: new THREE.MeshStandardMaterial({ color: 0x0b603d, roughness: 0.93 }),
      trunk: new THREE.MeshStandardMaterial({ color: 0xa76a32, roughness: 0.86 }),
      leaf: new THREE.MeshStandardMaterial({ color: 0x23b85c, roughness: 0.82, emissive: 0x083c1d, emissiveIntensity: 0.12 }),
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
    this.palmTrunkGeometry = new THREE.CylinderGeometry(0.12, 0.22, 3.2, 7);
    this.palmLeafGeometry = new THREE.ConeGeometry(0.58, 2.1, 5);
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

    for (let index = 0; index < this.chunkCount; index++) {
      const chunk = this.createChunk(index);
      this.chunks.push(chunk);
      scene.add(chunk.group);
    }
    this.rebuildInstances();
  }

  createIslandVisual(descriptor, rng) {
    const THREE = this.THREE;
    const group = new THREE.Group();
    const base = new THREE.Mesh(this.baseGeometry, this.materials.sand);
    base.scale.set(descriptor.rx * 1.015, 0.42 + descriptor.rx * 0.003, descriptor.rz * 1.015);
    // The top now grazes just below mean sea level. Only troughs reveal a thin
    // ivory beach edge; the former metre-thick cap read as a fluorescent ring.
    base.position.y = 0.0;
    base.castShadow = false;
    base.receiveShadow = true;
    group.add(base);

    const geometry = this.islandGeometries[rng.int(0, this.islandGeometries.length - 1)];
    const hill = new THREE.Mesh(geometry, this.materials.island);
    // Les iles basses sont larges, les pitons etroits : la hauteur suit le rayon.
    const slender = rng.range(0.72, 1.18);
    const hillHeight = (rng.range(9, 20) + Math.min(descriptor.rx, descriptor.rz) * 0.22) * slender;
    hill.scale.set(descriptor.rx * 0.86, hillHeight, descriptor.rz * 0.83);
    hill.position.y = -0.65;
    const hillRotation = rng.next() * TAU;
    hill.rotation.y = hillRotation;
    hill.castShadow = true;
    hill.receiveShadow = true;
    group.add(hill);

    // Purely visual terrain metadata for placing instanced vegetation on the
    // slope. Collision continues to use only x/z/rx/rz.
    descriptor.visualHeight = hillHeight;
    descriptor.visualBaseY = -0.95;
    descriptor.visualRx = descriptor.rx * 0.86;
    descriptor.visualRz = descriptor.rz * 0.83;
    descriptor.visualRotation = hillRotation;
    descriptor.visualShape = geometry.userData;

    return group;
  }

  createChunk(logicalIndex) {
    const group = new this.THREE.Group();
    const chunk = { group, logicalIndex, z: 0, islands: [], palms: [], rocks: [] };
    this.configureChunk(chunk, logicalIndex);
    return chunk;
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

    for (let sideIndex = 0; sideIndex < 2; sideIndex++) {
      const side = sideIndex === 0 ? -1 : 1;
      if (rng.chance(0.14)) continue;
      const localZ = rng.range(-this.chunkLength * 0.38, this.chunkLength * 0.38);
      const center = routeCenter(chunk.z + localZ);
      const rx = rng.range(8, 24);
      const rz = rng.range(10, 34);
      const x = center + side * rng.range(62, 118);
      const descriptor = { x, z: chunk.z + localZ, rx, rz };
      const islandVisual = this.createIslandVisual(descriptor, rng);
      islandVisual.position.set(x, -0.3, localZ);
      chunk.group.add(islandVisual);
      chunk.islands.push(descriptor);

      const palmCount = descriptor.rx > 10 ? rng.int(4, 8) : rng.int(2, 4);
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

      const rockCount = rng.int(1, 4);
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
    this.rebuildInstances();
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
    let penalty = 0;
    for (const island of this.nearestIslands(z, 10)) {
      const nx = (x - island.x) / island.rx;
      const nz = (z - island.z) / island.rz;
      const distance = Math.hypot(nx, nz);
      if (distance < 1.15) penalty = Math.max(penalty, clamp((1.15 - distance) / 0.25, 0, 1));
    }
    return penalty;
  }

  /** Signed distance approximation to the nearest elliptical island boundary. */
  nearestSurface(x, z, out = {}) {
    let best = Infinity;
    let bestIsland = null;
    let bestNx = 0;
    let bestNz = 0;
    for (const island of this.nearestIslands(z, 12)) {
      const dx = x - island.x;
      const dz = z - island.z;
      const ex = dx / island.rx;
      const ez = dz / island.rz;
      const length = Math.hypot(ex, ez) || 1;
      const boundaryX = island.x + (ex / length) * island.rx;
      const boundaryZ = island.z + (ez / length) * island.rz;
      const worldDistance = Math.hypot(x - boundaryX, z - boundaryZ) * (length < 1 ? -1 : 1);
      if (worldDistance < best) {
        best = worldDistance;
        bestIsland = island;
        // Gradient of ellipse equation; normalized in world space.
        const gx = dx / Math.max(0.001, island.rx * island.rx);
        const gz = dz / Math.max(0.001, island.rz * island.rz);
        const gl = Math.hypot(gx, gz) || 1;
        bestNx = gx / gl;
        bestNz = gz / gl;
      }
    }
    out.distance = best;
    out.island = bestIsland;
    out.nx = bestNx;
    out.nz = bestNz;
    return out;
  }

  /**
   * Resolve a boat against the procedural island SDF. Returns contact severity.
   * This stays deterministic and avoids a heavyweight static physics world.
   */
  resolveBoatCollision(boat, margin = 1.35, out = {}) {
    const surface = this.nearestSurface(boat.x, boat.z, out.surface || (out.surface = {}));
    if (!surface.island || surface.distance >= margin) {
      out.hit = false;
      out.severity = 0;
      return out;
    }
    const penetration = margin - surface.distance;
    const inwardSpeed = -(boat.dynamics.vx * surface.nx + boat.dynamics.vz * surface.nz);
    boat.dynamics.x += surface.nx * penetration;
    boat.dynamics.z += surface.nz * penetration;
    if (inwardSpeed > 0) {
      const restitution = 0.18;
      boat.dynamics.vx += surface.nx * inwardSpeed * (1 + restitution);
      boat.dynamics.vz += surface.nz * inwardSpeed * (1 + restitution);
    }
    const tangentX = -surface.nz;
    const tangentZ = surface.nx;
    const tangentSpeed = boat.dynamics.vx * tangentX + boat.dynamics.vz * tangentZ;
    boat.dynamics.vx -= tangentX * tangentSpeed * 0.08;
    boat.dynamics.vz -= tangentZ * tangentSpeed * 0.08;
    out.hit = true;
    out.penetration = penetration;
    out.inwardSpeed = inwardSpeed;
    out.severity = clamp((Math.max(0, inwardSpeed) + penetration * 4) / 16, 0.08, 1.25);
    out.x = boat.x - surface.nx * margin;
    out.z = boat.z - surface.nz * margin;
    out.nx = surface.nx;
    out.nz = surface.nz;
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
        safeT = Math.max(0.16, (index - 1.35) / samples);
        break;
      }
    }
    if (safeT < 1) {
      out.x = target.x + dx * safeT;
      out.z = target.z + dz * safeT;
      out.y = Math.max(out.y, target.y + 3.8);
    }
    return out;
  }
}
