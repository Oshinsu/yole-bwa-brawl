// Radeaux de sargasses dérivant sur le parcours.
//
// Le vrai fléau des côtes martiniquaises devient un obstacle de jeu : on s'y
// englue, on ralentit, on gîte, et on ramasse un peu d'eau. Ce n'est pas un mur
// — c'est une zone qu'on peut traverser en payant le prix, ou contourner.
//
// Déterminisme : la position d'un radeau est une fonction pure de son indice de
// rangée (aucun tirage), exactement comme les caisses. Le ralentissement est une
// fonction pure de la pénétration. Rien ici ne touche à `gameRng`.

import { routeCenter } from "../render/world.js";

// Subdivisions du radeau de sargasses et amplitude de son relief, en mètres.
// ⚠️ L'échelle d'instance vaut 1 sur Y (voir `writeSargasseMatrix`), donc cette
// valeur est directement une hauteur de MONDE, pas un facteur : elle ne suit
// pas la taille du radeau. C'est voulu — un petit amas doit paraître aussi
// épais qu'un grand, seule son emprise change.
const SARGASSE_SUBDIVISIONS = 14;
const SARGASSE_RELIEF = 0.62;
const SARGASSE_CLUMPS = 6;
const SARGASSE_COLORS = [0x9f7b22, 0x697128, 0xc08a24, 0x4f6126];

export const SARGASSE = {
  spacing: 137,       // décalé du pas des caisses (88) pour éviter la répétition
  slots: [-31, 4, 27],
  rows: 5,
  radius: 7.4,
  // Coup de frein immédiat demandé au franchissement : 65 % de l'erre part au
  // premier contact. La traînée continue évite ensuite de retrouver aussitôt la
  // pleine vitesse au milieu de la nappe.
  entryBrake: 0.65,
  slowPerSecond: 1.15,
  rollPerSecond: 0.62,
  waterPerSecond: 6.4,
  hullPerSecond: 0.10,
  firstRow: 2
};

export const ObstacleSystems = {
  createObstaclePool() {
    const THREE = this.THREE;
    const count = SARGASSE.rows * SARGASSE.slots.length;
    // Les radeaux existent TOUJOURS côté simulation. Seule leur représentation
    // dépend de la texture : sinon l'absence d'un asset de rendu changerait la
    // physique, ce que l'architecture du projet interdit — et une relecture
    // faite sans la texture divergerait de l'enregistrement.
    const texture = this.assets?.texture("sargasse");
    // ── LE RADEAU A DU VOLUME ────────────────────────────────────────────
    //
    // C'était un `PlaneGeometry(1, 1)` en `MeshBasicMaterial` : une
    // décalcomanie strictement plate, sans épaisseur ET sans éclairage — elle
    // gardait la même teinte au zénith comme au crépuscule, au milieu d'une
    // mer qui, elle, réagit au soleil. Le radeau se lisait comme un autocollant.
    //
    // Désormais un maillage subdivisé dont les sommets sont SOULEVÉS : la
    // sargasse est un amas flottant, bombé au centre, qui retombe au ras de
    // l'eau sur ses bords. Toujours UNE seule instance de géométrie, donc
    // toujours un seul draw call.
    this.sargasseMesh = null;
    this.sargasseClumps = null;
    if (texture && THREE.InstancedMesh) {
      const geometry = new THREE.PlaneGeometry(1, 1, SARGASSE_SUBDIVISIONS, SARGASSE_SUBDIVISIONS);
      geometry.rotateX(-Math.PI / 2);
      const sommets = geometry.attributes.position;
      for (let index = 0; index < sommets.count; index++) {
        const x = sommets.getX(index);
        const z = sommets.getZ(index);
        // ⚠️ Relief DÉTERMINISTE, somme de sinusoïdes — aucun tirage. La
        // géométrie est construite une fois au démarrage, mais un générateur
        // ici rendrait le décor différent d'une relecture à l'autre.
        const bosses = Math.sin(x * 21.7 + z * 13.3) * 0.50
                     + Math.sin(x * 37.1 - z * 29.5) * 0.30
                     + Math.sin(x * 11.2 + z * 43.9) * 0.20;
        // Le bord RETOMBE à zéro : un amas posé sur l'eau, pas une dalle
        // flottante dont on verrait la tranche.
        const rayon = Math.min(1, Math.hypot(x, z) * 2);
        const retombee = 1 - rayon * rayon;
        sommets.setY(index, Math.max(0, bosses * 0.5 + 0.42) * retombee * SARGASSE_RELIEF);
      }
      // Sans ça, l'éclairage lit une surface plate et tout le relief est perdu.
      geometry.computeVertexNormals();
      // ⚠️ OPAQUE, ET C'EST LE CHANGEMENT QUI COMPTE. Un objet en volume trié
      // en transparence s'auto-recouvre dans le désordre : les bosses du fond
      // passaient devant celles de l'avant. `alphaTest` seul suffit à découper
      // la silhouette dans la texture, et permet d'écrire la profondeur.
      const material = new THREE.MeshStandardMaterial({
        map: texture,
        alphaTest: 0.14,
        roughness: 0.92,
        metalness: 0.0,
        color: 0xffffff
      });
      this.sargasseMesh = new THREE.InstancedMesh(geometry, material, count);
      this.sargasseMesh.frustumCulled = false;
      this.sargasseMesh.renderOrder = 2;
      this.sargasseMesh.instanceMatrix.setUsage?.(THREE.DynamicDrawUsage);
      // Six volumes irréguliers par nappe cassent la lecture « autocollant »
      // sans multiplier les draw calls : tous partagent une seule géométrie et
      // un seul matériau. Leur couleur alterne or/olive comme les vraies algues.
      const clumpGeometry = new THREE.SphereGeometry(1, 7, 5);
      const clumpMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.96,
        metalness: 0
      });
      this.sargasseClumps = new THREE.InstancedMesh(
        clumpGeometry,
        clumpMaterial,
        count * SARGASSE_CLUMPS
      );
      this.sargasseClumps.frustumCulled = false;
      this.sargasseClumps.instanceMatrix.setUsage?.(THREE.DynamicDrawUsage);
      this.scene.add(this.sargasseMesh, this.sargasseClumps);
      this.sargasseDummy = new THREE.Object3D();
      this.sargasseWaterScratch = {};
      this.sargasseColorScratch = new THREE.Color();
    }

    this.sargasses = [];
    for (let index = 0; index < count; index++) {
      this.sargasses.push({ index, row: 0, slot: index % SARGASSE.slots.length, x: 0, z: 0, size: 1 });
    }
    this.sargasseFirstRow = SARGASSE.firstRow;
    this.resetObstacles();
  },

  placeSargasse(patch, row, slot) {
    const spacing = SARGASSE.spacing * (this.stageGameplay?.sargasseSpacing ?? 1);
    const z = row * spacing;
    patch.row = row;
    patch.slot = slot;
    patch.x = routeCenter(z) + SARGASSE.slots[slot];
    patch.z = z;
    // Taille dérivée de l'indice : variée mais totalement déterministe.
    patch.size = SARGASSE.radius * (0.78 + ((row * 3 + slot) % 5) * 0.11);
    patch.phase = ((row * 7 + slot * 3) % 12) * 0.5236;
    if (this.sargasseClumps?.setColorAt && this.sargasseColorScratch) {
      for (let clump = 0; clump < SARGASSE_CLUMPS; clump++) {
        const color = SARGASSE_COLORS[(row + slot * 2 + clump) % SARGASSE_COLORS.length];
        this.sargasseClumps.setColorAt(
          patch.index * SARGASSE_CLUMPS + clump,
          this.sargasseColorScratch.setHex(color)
        );
      }
      if (this.sargasseClumps.instanceColor) {
        this.sargasseClumps.instanceColor.needsUpdate = true;
      }
    }
  },

  refreshSargasseVisuals() {
    if (!this.sargasseMesh || !this.sargasseDummy) return;
    const dummy = this.sargasseDummy;
    for (const patch of this.sargasses) {
      const water = this.waveField?.sample?.(
        patch.x,
        patch.z,
        this.time,
        this.sargasseWaterScratch
      ) ?? { height: 0, slopeX: 0, slopeZ: 0 };
      dummy.position.set(patch.x, water.height + 0.035, patch.z);
      dummy.rotation.set(
        (water.slopeZ ?? 0) * 0.24,
        patch.phase,
        -(water.slopeX ?? 0) * 0.24
      );
      dummy.scale.set(patch.size * 2, 1, patch.size * 2);
      dummy.updateMatrix();
      this.sargasseMesh.setMatrixAt(patch.index, dummy.matrix);

      if (!this.sargasseClumps) continue;
      for (let clump = 0; clump < SARGASSE_CLUMPS; clump++) {
        const hash = patch.row * 17 + patch.slot * 11 + clump * 7;
        const angle = patch.phase + hash * 1.618;
        const radius = patch.size * (0.14 + (hash % 5) * 0.085);
        const x = patch.x + Math.cos(angle) * radius;
        const z = patch.z + Math.sin(angle) * radius;
        dummy.position.set(
          x,
          water.height + 0.10 + (hash % 3) * 0.035,
          z
        );
        dummy.rotation.set(
          hash * 0.17,
          angle,
          (hash % 4 - 1.5) * 0.12
        );
        dummy.scale.set(
          patch.size * (0.055 + (hash % 4) * 0.012),
          0.055 + (hash % 3) * 0.018,
          patch.size * (0.045 + ((hash + 2) % 4) * 0.011)
        );
        dummy.updateMatrix();
        this.sargasseClumps.setMatrixAt(
          patch.index * SARGASSE_CLUMPS + clump,
          dummy.matrix
        );
      }
    }
    this.sargasseMesh.instanceMatrix.needsUpdate = true;
    if (this.sargasseClumps) this.sargasseClumps.instanceMatrix.needsUpdate = true;
  },

  resetObstacles() {
    if (!this.sargasses) return;
    this.sargasseFirstRow = SARGASSE.firstRow;
    for (let index = 0; index < this.sargasses.length; index++) {
      const slot = index % SARGASSE.slots.length;
      const row = this.sargasseFirstRow + Math.floor(index / SARGASSE.slots.length);
      this.placeSargasse(this.sargasses[index], row, slot);
    }
    this.refreshSargasseVisuals();
  },

  updateObstacles(dt) {
    if (!this.sargasses) return;
    const alive = this.collectAlive();
    if (!alive.length) return;

    let leaderZ = -Infinity;
    for (const boat of alive) leaderZ = Math.max(leaderZ, boat.z);
    const lastRow = this.sargasseFirstRow + SARGASSE.rows - 1;
    const spacing = SARGASSE.spacing * (this.stageGameplay?.sargasseSpacing ?? 1);
    while ((this.sargasseFirstRow + 1) * spacing < leaderZ - 60) {
      const recycled = this.sargasseFirstRow;
      this.sargasseFirstRow++;
      for (const patch of this.sargasses) {
        if (patch.row === recycled) this.placeSargasse(patch, lastRow + 1, patch.slot);
      }
    }
    this.refreshSargasseVisuals();

    for (const boat of alive) {
      let deepest = 0;
      for (const patch of this.sargasses) {
        const dx = boat.x - patch.x;
        const dz = boat.z - patch.z;
        const distance = Math.hypot(dx, dz);
        if (distance >= patch.size) continue;
        deepest = Math.max(deepest, 1 - distance / patch.size);
      }
      if (deepest <= 0) {
        boat.inSargasse = 0;
        continue;
      }
      const wasIn = boat.inSargasse ?? 0;
      if (wasIn <= 0) {
        const remaining = 1 - SARGASSE.entryBrake;
        boat.dynamics.vx *= remaining;
        boat.dynamics.vz *= remaining;
      }
      // Englué : on freine, on gîte, on embarque un peu d'eau. Proportionnel à
      // la pénétration, donc contourner par le bord coûte peu.
      const bite = deepest * dt;
      boat.dynamics.vx -= boat.dynamics.vx * SARGASSE.slowPerSecond * bite;
      boat.dynamics.vz -= boat.dynamics.vz * SARGASSE.slowPerSecond * bite;
      boat.dynamics.rollVel += Math.sign(boat.x - routeCenter(boat.z) || 1) * SARGASSE.rollPerSecond * bite;
      boat.dynamics.addWater(SARGASSE.waterPerSecond * bite, 0, 0);
      // Les sargasses RÂPENT la coque : 10 % par seconde d'engluement complet.
      // Elles ne faisaient jusqu'ici que freiner et embarquer de l'eau.
      boat.dynamics.structure.hull = Math.max(0, boat.dynamics.structure.hull - SARGASSE.hullPerSecond * bite);

      boat.inSargasse = deepest;
      if (this.time - (boat.lastSargasseFxAt ?? -99) > 0.14) {
        boat.lastSargasseFxAt = this.time;
        const water = this.waveField.sample(boat.x, boat.z, this.time, this.waterScratch);
        const fxPosition = {
          x: boat.x,
          y: water.height + 0.14,
          z: boat.z
        };
        this.particles.emitBurst(
          this.obstacleVfxRng ?? this.visualRng,
          fxPosition,
          deepest > 0.55 ? 0xc79a2b : 0x7f8b2d,
          Math.floor(3 + deepest * 7),
          {
            speed: 0.9 + deepest * 1.3,
            upward: 0.45 + deepest * 0.65,
            sizeMin: 0.08,
            sizeMax: 0.24,
            lifeMin: 0.28,
            lifeMax: 0.72,
            gravity: 1.7,
            drag: 2.1
          }
        );
      }
      if (wasIn <= 0 && boat.isPlayer) {
        this.showMessage("🌿 SARGASSES · ERRE −65 % !", 0.82);
        this.audio.play("sargasseHit", { gain: 0.48, rate: 0.82, gap: 0.4 });
        this.audio.play("splash", { gain: 0.16, rate: 0.66, gap: 0.4, delay: 0.035 });
        const water = this.waveField.sample(boat.x, boat.z, this.time, this.waterScratch);
        this.rings?.burst?.(boat.x, water.height + 0.02, boat.z, 0xb58b28, 1.25, 0.62);
        this.telemetry.track("sargasse_entry", {
          boat: boat.id,
          entryBrake: SARGASSE.entryBrake
        }, this.time);
      }
    }
  }
};
