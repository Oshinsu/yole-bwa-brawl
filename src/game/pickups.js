// Caisses d'armes semées sur le parcours.
//
// Deux armes de soute restent disponibles en permanence derrière un cooldown.
// Les autres passent par cet emplacement de caisse : il faut aller les chercher
// et c'est alors la munition qui décide.
//
// Déterminisme : la position d'une caisse est une fonction pure de son indice de
// rangée (aucun tirage), et seul le CONTENU est tiré, sur `gameRng` — déjà dans
// le flux déterministe. Une relecture retrouve donc les mêmes caisses au même
// endroit avec le même butin.

import { CRATE_WEAPONS } from "./balance.js";
import { routeCenter } from "../render/world.js";

export const PICKUP = {
  spacing: 88,        // mètres entre deux rangées
  // ⚠️ Trois voies FIXES dont une au centre : chaque rangée posait donc une
  // caisse pile sur la ligne de course, et aller la chercher ne coûtait rien.
  // Les voies alternent maintenant par rangée (voir laneOffsetForRow) : il faut
  // vraiment quitter sa trajectoire, ce qui rend le ramassage décidable.
  // ⚠️ TROIS VOIES, PLUS QUATRE, ET AUCUNE PRÈS DU CENTRE.
  // 6 rangées × 4 voies faisaient 24 caisses vivantes en permanence : on en
  // croisait une sans jamais avoir à la chercher, donc aucune ne valait le
  // détour. 4 × 3 = 12, et chacune compte.
  lanes: [-24, -9, 20],
  laneShift: [0, 7, -5, 11, -9],
  // ⚠️ Écart LATÉRAL MINIMAL au centre de route, garanti après décalage.
  // Sans lui, `lanes[-9] + laneShift[7]` posait une caisse à 2 m de la ligne
  // idéale : on la ramassait sans jamais quitter sa trajectoire.
  minOffset: 8.5,
  rows: 4,            // rangées vivantes simultanément
  radius: 3.4,        // rayon de ramassage
  respawn: 7.5,       // secondes avant réapparition — plus rares, donc plus chères
  ammoCap: 3,
  firstRow: 1         // la première rangée est juste devant la ligne de départ
};

// Table de butin : six armes. Mine et Rhum peuvent être en soute ou en caisse ;
// Barik, Chadron, Lanbi et Pwason restent exclusivement en caisse.
//
// Une première tentative faisait diverger la relecture parce que le pas fixe
// consommait `visualRng`. Les RNG gameplay et rendu sont désormais séparés :
// ces six contenus restent déterministes.
const LOOT = [
  { weapon: "mine", weight: 0.20, color: 0xff3d63 },
  { weapon: "rhum", weight: 0.18, color: 0xffc531 },
  { weapon: "barik", weight: 0.17, color: 0xff6b1c },
  { weapon: "chadron", weight: 0.16, color: 0x9b5cff },
  { weapon: "lanbi", weight: 0.15, color: 0xfff0b8 },
  { weapon: "pwason", weight: 0.14, color: 0x54f8ff }
];

// Le contenu d'une caisse est décidé À SON PLACEMENT, pas au ramassage, et son
// anneau en porte la couleur. C'est ce qui rend l'arme CHOISIE avec un seul
// emplacement à l'écran : le joueur voit de loin ce que chaque caisse contient
// et va chercher celle qu'il veut, au lieu de subir un tirage à l'impact. Le
// choix se joue à la barre, pas dans un sous-menu.
//
// ⚠️ Le tirage reste sur `gameRng`, au placement. Le rendu utilise son propre
// `visualRng` : ajouter un effet visuel ne peut donc plus déplacer le prochain
// butin gameplay ni faire diverger une relecture.

export const PickupSystems = {
  createPickupPool() {
    const THREE = this.THREE;
    const count = PICKUP.rows * PICKUP.lanes.length;
    // 18 caisses en meshes séparés coûtaient 36 draw calls. Deux InstancedMesh
    // rendent exactement la même chose pour 2.
    const crateGeometry = new THREE.BoxGeometry(1.5, 1.15, 1.5);
    const crateTexture = this.assets?.texture("crate") ?? null;
    const crateMaterial = new THREE.MeshStandardMaterial({
      map: crateTexture,
      color: crateTexture ? 0xffffff : 0xc98a45,
      roughness: 0.72,
      emissive: 0x3a2410,
      emissiveIntensity: crateTexture ? 0.22 : 0.5
    });
    const ringGeometry = new THREE.TorusGeometry(1.5, 0.11, 6, 20);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xffc531, transparent: true, opacity: 0.85 });

    // ⚠️ BALISE VERTICALE. Une caisse au ras de l'eau, à 20 m de la ligne de
    // course, était invisible jusqu'à ce qu'on soit dessus — donc indécidable.
    // Un fût lumineux à sa couleur de butin se lit de loin et permet de CHOISIR
    // sa caisse au lieu de la découvrir. Un InstancedMesh de plus, un seul
    // draw call, et l'attribut d'instance porte déjà la couleur.
    const beaconGeometry = new THREE.CylinderGeometry(0.12, 0.34, 5.6, 10, 1, true);
    const beaconMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
    // Un noyau lumineux de la couleur du butin flotte au-dessus du couvercle.
    // Il rend la caisse identifiable même quand l'anneau est masqué par une
    // vague, pour un seul draw call supplémentaire sur toutes les caisses.
    const coreGeometry = new THREE.SphereGeometry(0.34, 8, 6);
    const coreMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.88,
      depthWrite: false
    });
    this.pickupBeacons = new THREE.InstancedMesh(beaconGeometry, beaconMaterial, count);
    this.pickupCores = new THREE.InstancedMesh(coreGeometry, coreMaterial, count);
    this.pickupBeacons.frustumCulled = false;
    this.pickupCores.frustumCulled = false;
    this.pickupBeacons.instanceMatrix.setUsage?.(THREE.DynamicDrawUsage);
    this.pickupCores.instanceMatrix.setUsage?.(THREE.DynamicDrawUsage);
    this.pickupCrates = new THREE.InstancedMesh(crateGeometry, crateMaterial, count);
    this.pickupRings = new THREE.InstancedMesh(ringGeometry, ringMaterial, count);
    this.pickupCrates.castShadow = true;
    this.pickupCrates.frustumCulled = false;
    this.pickupRings.frustumCulled = false;
    this.pickupCrates.instanceMatrix.setUsage?.(THREE.DynamicDrawUsage);
    this.pickupRings.instanceMatrix.setUsage?.(THREE.DynamicDrawUsage);
    this.scene.add(
      this.pickupCrates,
      this.pickupRings,
      this.pickupBeacons,
      this.pickupCores
    );
    this.pickupDummy = new THREE.Object3D();
    this.pickupColorScratch = new THREE.Color();
    this.pickupWaterScratch = {};

    this.pickups = [];
    for (let index = 0; index < count; index++) {
      this.pickups.push({
        index, row: 0, lane: index % PICKUP.lanes.length,
        x: 0, z: 0, active: false, respawn: 0, phase: index * 0.73
      });
    }
    this.pickupFirstRow = PICKUP.firstRow;
  },

  // Une caisse inactive est mise à l'échelle zéro : pas de branche dans le
  // shader, pas de trou dans le tampon d'instances.
  writePickupMatrix(pickup) {
    const dummy = this.pickupDummy;
    const visible = pickup.active;
    const water = this.waveField?.sample?.(
      pickup.x,
      pickup.z,
      this.time,
      this.pickupWaterScratch
    ) ?? { height: 0, slopeX: 0, slopeZ: 0 };
    const phase = pickup.phase ?? 0;
    const bob = Math.sin(this.time * 2.15 + phase) * 0.10;
    const pulse = 1 + Math.sin(this.time * 3.6 + phase) * 0.12;
    dummy.position.set(
      pickup.x,
      visible ? water.height + 0.54 + bob : -999,
      pickup.z
    );
    dummy.rotation.set(
      (water.slopeZ ?? 0) * 0.18,
      phase + this.time * 0.34,
      -(water.slopeX ?? 0) * 0.18
    );
    dummy.scale.setScalar(visible ? 1 : 0.0001);
    dummy.updateMatrix();
    this.pickupCrates.setMatrixAt(pickup.index, dummy.matrix);
    dummy.rotation.set(Math.PI / 2, 0, phase - this.time * 0.22);
    dummy.position.y = visible ? water.height + 0.16 : -999;
    dummy.scale.setScalar(visible ? pulse : 0.0001);
    dummy.updateMatrix();
    this.pickupRings.setMatrixAt(pickup.index, dummy.matrix);
    if (this.pickupBeacons) {
      dummy.rotation.set(0, 0, 0);
      dummy.position.y = visible ? water.height + 3.05 : -999;
      dummy.scale.set(
        visible ? 0.88 + (pulse - 1) * 0.7 : 0.0001,
        visible ? 1 : 0.0001,
        visible ? 0.88 + (pulse - 1) * 0.7 : 0.0001
      );
      dummy.updateMatrix();
      this.pickupBeacons.setMatrixAt(pickup.index, dummy.matrix);
      this.pickupBeacons.instanceMatrix.needsUpdate = true;
    }
    if (this.pickupCores) {
      dummy.position.y = visible
        ? water.height + 1.34 + Math.sin(this.time * 3.1 + phase) * 0.16
        : -999;
      dummy.rotation.set(
        this.time * 0.7 + phase,
        this.time * 1.15 + phase,
        phase * 0.5
      );
      dummy.scale.setScalar(visible ? 0.82 + (pulse - 1) * 1.8 : 0.0001);
      dummy.updateMatrix();
      this.pickupCores.setMatrixAt(pickup.index, dummy.matrix);
      this.pickupCores.instanceMatrix.needsUpdate = true;
    }
    this.pickupCrates.instanceMatrix.needsUpdate = true;
    this.pickupRings.instanceMatrix.needsUpdate = true;
  },

  // Position d'une caisse : fonction pure de la rangée et de la voie.
  placePickup(pickup, row, lane) {
    const spacing = PICKUP.spacing * (this.stageGameplay?.pickupSpacing ?? 1);
    const z = row * spacing;
    pickup.row = row;
    pickup.lane = lane;
    // Décalage par rangée : deux rangées successives n'offrent jamais la même
    // grille, donc on ne peut pas tenir une ligne droite et tout ramasser.
    // Fonction PURE de la rangée — aucun tirage, la relecture est exacte.
    const decalage = PICKUP.laneShift[((row % PICKUP.laneShift.length) + PICKUP.laneShift.length) % PICKUP.laneShift.length];
    let ecart = PICKUP.lanes[lane] + decalage;
    // ⚠️ On REPOUSSE une caisse qui retomberait sur la ligne de course. Le
    // décalage par rangée pouvait annuler la voie et poser le butin pile au
    // milieu : gratuit à ramasser, donc sans décision. Fonction pure, aucun
    // tirage — la relecture reste exacte.
    if (Math.abs(ecart) < PICKUP.minOffset) {
      ecart = (ecart < 0 || (ecart === 0 && lane < PICKUP.lanes.length / 2) ? -1 : 1) * PICKUP.minOffset;
    }
    pickup.x = routeCenter(z) + ecart;
    pickup.z = z;
    pickup.active = true;
    pickup.respawn = 0;
    pickup.phase = row * 0.61 + lane * 1.37;
    const loot = this.rollLoot();
    pickup.weapon = loot.weapon;
    // Retenue pour l'effet de ramassage : la gerbe prend la teinte de l'arme.
    pickup.color = loot.color;
    // L'anneau annonce l'arme. `setColorAt` sur un InstancedMesh ne coûte pas un
    // draw call de plus — la couleur voyage dans l'attribut d'instance.
    if (this.pickupRings?.setColorAt && this.pickupColorScratch) {
      this.pickupRings.setColorAt(pickup.index, this.pickupColorScratch.setHex(loot.color));
      if (this.pickupRings.instanceColor) this.pickupRings.instanceColor.needsUpdate = true;
    }
    // La balise porte la MÊME couleur que l'anneau : on identifie l'arme de
    // loin, on décide, puis on va la chercher.
    if (this.pickupBeacons?.setColorAt && this.pickupColorScratch) {
      this.pickupBeacons.setColorAt(pickup.index, this.pickupColorScratch.setHex(loot.color));
      if (this.pickupBeacons.instanceColor) this.pickupBeacons.instanceColor.needsUpdate = true;
    }
    if (this.pickupCores?.setColorAt && this.pickupColorScratch) {
      this.pickupCores.setColorAt(pickup.index, this.pickupColorScratch.setHex(loot.color));
      if (this.pickupCores.instanceColor) this.pickupCores.instanceColor.needsUpdate = true;
    }
    this.writePickupMatrix(pickup);
  },

  resetPickups() {
    this.pickupFirstRow = PICKUP.firstRow;
    for (let index = 0; index < this.pickups.length; index++) {
      const lane = index % PICKUP.lanes.length;
      const row = this.pickupFirstRow + Math.floor(index / PICKUP.lanes.length);
      this.placePickup(this.pickups[index], row, lane);
    }
  },

  rollLoot() {
    let roll = this.gameRng.next();
    for (const entry of LOOT) {
      if (roll < entry.weight) return entry;
      roll -= entry.weight;
    }
    return LOOT[LOOT.length - 1];
  },

  grantPickup(boat, pickup) {
    const picked = pickup?.weapon ?? LOOT[0].weapon;
    // Ce qu'on vient de ramasser devient l'arme armée : avec un emplacement
    // unique, ramasser sans changer d'arme n'aurait aucun effet visible.
    boat.activeWeapon = picked;
    // ⚠️ UN SEUL EMPLACEMENT DE CAISSE. Ramasser REMPLACE ce qu'on portait :
    // on ne collectionne pas, on choisit. C'est ce qui rend une caisse
    // décidable — aller chercher celle-là, c'est renoncer à celle qu'on a.
    //
    // ⚠️ Une arme de SOUTE a une munition INFINIE. Si le butin en tire une (la
    // mine et le rhum peuvent être en soute OU en caisse selon l'équipement),
    // il ne faut surtout pas la remettre à zéro ni la plafonner à 3.
    for (const autre of CRATE_WEAPONS) {
      if (autre === picked) continue;
      if (Number.isFinite(boat.ammo[autre])) boat.ammo[autre] = 0;
    }
    const before = boat.ammo[picked];
    // Garde-fou : une arme de soute a une munition INFINIE. Si l'une d'elles
    // revenait un jour dans la table de butin, `Math.min(cap, ...)` la
    // ramènerait silencieusement à 3 — un ramassage qui RETIRE des munitions.
    boat.ammo[picked] = Number.isFinite(before) ? Math.min(PICKUP.ammoCap, before + 1) : before;
    this.telemetry.track("pickup", { boat: boat.id, weapon: picked, full: before === boat.ammo[picked] }, this.time);
    return picked;
  },

  updatePickups(dt) {
    if (!this.pickups) return;
    const alive = this.collectAlive();
    if (!alive.length) return;

    // Recycler les rangées dépassées vers l'avant du peloton.
    let leaderZ = -Infinity;
    for (const boat of alive) leaderZ = Math.max(leaderZ, boat.z);
    const lastRow = this.pickupFirstRow + PICKUP.rows - 1;
    const spacing = PICKUP.spacing * (this.stageGameplay?.pickupSpacing ?? 1);
    while ((this.pickupFirstRow + 1) * spacing < leaderZ - 40) {
      const recycled = this.pickupFirstRow;
      this.pickupFirstRow++;
      for (const pickup of this.pickups) {
        if (pickup.row === recycled) this.placePickup(pickup, lastRow + 1, pickup.lane);
      }
    }

    for (const pickup of this.pickups) {
      // La caisse flotte, tourne doucement et suit la pente locale de la houle.
      // Cette animation ne touche ni sa position de collision ni le gameplay.
      this.writePickupMatrix(pickup);
      if (!pickup.active) {
        pickup.respawn -= dt;
        if (pickup.respawn <= 0) {
          pickup.active = true;
          this.writePickupMatrix(pickup);
        }
        continue;
      }
      for (const boat of alive) {
        const dx = boat.x - pickup.x;
        const dz = boat.z - pickup.z;
        if (dx * dx + dz * dz > PICKUP.radius * PICKUP.radius) continue;
        const weapon = this.grantPickup(boat, pickup);
        pickup.active = false;
        pickup.respawn = PICKUP.respawn;
        this.writePickupMatrix(pickup);
        this.onPickupTaken(boat, pickup, weapon);
        break;
      }
    }
  },

  // Cherche la caisse utile la plus proche devant un bateau. Sert à l'IA et
  // au fléchage du joueur.
  nearestPickup(boat, maxDistance = 150) {
    if (!this.pickups) return null;
    let best = null;
    let bestDistance = maxDistance * maxDistance;
    for (const pickup of this.pickups) {
      if (!pickup.active || pickup.z < boat.z - 6) continue;
      const dx = pickup.x - boat.x;
      const dz = pickup.z - boat.z;
      const distance = dx * dx + dz * dz;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = pickup;
      }
    }
    return best;
  }
};
