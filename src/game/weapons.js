// Armes : Canon Coco, Spider-Harpon, Mine Tsunami.
//
// Pools, tir, ciblage, intégration balistique et explosions. Mixin appliqué au
// prototype de Game : l'état reste partagé, seul le rangement change.

import { clamp } from "../core/math.js";
import { pointCapsuleDistanceSquared } from "../sim/collision.js";
import { VerletRope } from "../sim/rope.js";
import { JUICE_VFX, SPELL_VFX } from "../render/vfx.js";
import { AIM_PITCH_RANGE } from "./input.js";
import { ACTION_HARPOON, ACTION_MINE, ACTION_BARIK, ACTION_CHADRON, ACTION_LANBI, ACTION_PWASON, ACTION_RHUM, ACTION_WAVE, BALANCE } from "./balance.js";

// Biais « les armes visent l'ÉQUILIBRE ».
//
// Une arme ne doit pas faire fondre une coque, elle doit envoyer la yole à la
// gîte : c'est la contre-gîte permanente qui est la boucle de jeu, pas la barre
// de vie. Le roulis est donc amplifié et la structure réduite d'autant, pour que
// la DURÉE d'une manche ne bouge pas — seule la nature de la menace change.
//
// Un seul point de passage plutôt que huit multiplications recopiées : les
// facteurs vivent dans BALANCE.weaponBias et se règlent au playtest.
//
// ⚠️ Réservé aux ARMES. Les collisions de coque et les récifs appellent
// `applyHit` directement, sans passer par ici : un abordage doit rester un
// abordage.
// Cooldown effectif d'une arme du vivier de soute pour un tireur donné.
//
// Les IA tirent moins vite que le joueur, et c'est assumé : elles n'ont ni
// hésitation ni erreur de visée à compenser, donc à cadence égale elles
// saturent l'écran. Le facteur vit dans BALANCE.aiFireRate, par niveau.
function baseCooldown(owner, key, game) {
  const base = BALANCE.baseCooldowns[key] ?? BALANCE.cooldowns[key] ?? 1;
  if (owner?.isPlayer || owner?.localControlled) return base;
  return base * (BALANCE.aiFireRate[game?.matchAiLevel] ?? BALANCE.aiFireRate.tour);
}

// Hausse de tir demandée par le joueur, en multiplicateur.
//
// ⚠️ Réservée au JOUEUR : `withPlayerAim` tourne déjà le cap de la yole pour le
// tir, mais la balistique VERTICALE n'a pas d'équivalent — le cap ne porte pas
// d'assiette. On lit donc l'axe directement, et seulement pour la yole pilotée,
// sinon les IA hériteraient de la visée de l'humain.
function aimPitchFactor(game, owner) {
  if (!owner || owner !== game.boats?.[0]) return 1;
  const pitch = clamp(game.input?.aimPitch ?? 0, -1, 1);
  return 1 + pitch * AIM_PITCH_RANGE;
}

/**
 * Solution de tir : de combien faut-il décaler le cap pour toucher une cible qui
 * bouge, avec un projectile de vitesse donnée ?
 *
 * Deux itérations de point fixe suffisent : on estime le temps de vol depuis la
 * distance actuelle, on avance la cible d'autant, on recalcule. Au-delà, le gain
 * est sous le bruit de la houle.
 *
 * ⚠️ Fonction PURE, aucun tirage : elle est appelée par l'IA dans la boucle
 * fixe, donc elle doit être rejouable à l'identique.
 *
 * Renvoie l'écart angulaire à ajouter au cap du tireur, en radians, ou `null`
 * si la cible est hors de portée du projectile.
 */
export function solveLeadAngle(owner, target, speed, life) {
  if (!owner || !target) return null;
  const ox = owner.x;
  const oz = owner.z;
  const ovx = owner.dynamics?.vx ?? 0;
  const ovz = owner.dynamics?.vz ?? 0;
  const tvx = target.dynamics?.vx ?? 0;
  const tvz = target.dynamics?.vz ?? 0;
  let vol = Math.hypot(target.x - ox, target.z - oz) / Math.max(1, speed);
  for (let index = 0; index < 2; index++) {
    const px = target.x + tvx * vol;
    const pz = target.z + tvz * vol;
    vol = Math.hypot(px - ox, pz - oz) / Math.max(1, speed);
  }
  if (vol > life) return null;
  // Le projectile hérite d'une part de la vitesse du tireur : le cap visé doit
  // en tenir compte, sinon on tire systématiquement en retard de sa propre
  // dérive. C'est exactement ce qui faisait « tirer partout sans viser ».
  const px = target.x + tvx * vol;
  const pz = target.z + tvz * vol;
  const desired = Math.atan2(px - ox - ovx * vol * 0.28, pz - oz - ovz * vol * 0.28);
  let ecart = desired - (owner.dynamics?.heading ?? 0);
  while (ecart > Math.PI) ecart -= Math.PI * 2;
  while (ecart < -Math.PI) ecart += Math.PI * 2;
  return ecart;
}

/**
 * Exécute `callback` avec le cap du tireur temporairement décalé.
 *
 * C'est le pendant de `withPlayerAim` pour les IA : elles n'avaient AUCUN moyen
 * de viser, `fireWave` lisant simplement `owner.forward()`. Elles tiraient donc
 * droit devant, quelle que soit la position de la cible.
 */
function withAimOffset(owner, radians, callback) {
  const dynamics = owner?.dynamics;
  if (!dynamics || !Number.isFinite(radians) || radians === 0) return callback();
  const original = dynamics.heading;
  dynamics.heading = original + radians;
  try {
    return callback();
  } finally {
    dynamics.heading = original;
  }
}

export function weaponHit(payload) {
  const bias = BALANCE.weaponBias;
  // Marqueur d'origine. Sans lui, impossible de savoir si un joueur se fait
  // coucher par les armes, par les abordages ou par les récifs — les trois
  // passent par le même `applyHit`, et on règle alors à l'aveugle.
  payload.fromWeapon = true;
  // Gag/règle centrale : chaque IMPACT DIRECT d'arme décroche un yoleur. Les
  // effets continus (feu résiduel, tension du câble) passent `ejectCrew:false`
  // pour ne pas vider six hommes sur un seul projectile resté actif.
  if (payload.ejectCrew !== false) {
    // Un impact, une silhouette. Borner à un empêche une grosse zone d'effet
    // de vider plusieurs postes sur le même événement visuel ; les impacts
    // suivants continueront, eux, à décrocher un yoleur chacun.
    payload.crewLoss = 1;
  }
  if (payload.rollImpulse) payload.rollImpulse *= bias.roll;
  if (payload.waterKg) payload.waterKg *= bias.water;
  if (payload.structure) {
    if (payload.structure.hull) payload.structure.hull *= bias.hull;
    if (payload.structure.mast) payload.structure.mast *= bias.hull;
    if (payload.structure.sail) payload.structure.sail *= bias.hull;
    if (payload.structure.bwa) payload.structure.bwa *= bias.hull;
  }
  return payload;
}

// Cadences strictement visuelles. Un seul billboard peut être émis par pas de
// simulation : un gros dt ne provoque donc jamais de rafale de rattrapage.
const COCO_TRAIL_INTERVAL = 0.12;
const PWASON_TRAIL_INTERVAL = 0.10;
const RHUM_AURA_REFRESH_INTERVAL = 0.72;

// Harpon raté : vitesse, portée temporelle et longueur du fer affiché.
// Purement visuel — aucune de ces valeurs n'entre dans BALANCE, parce
// qu'aucune ne touche la simulation.
const HARPOON_MISS_SPEED = 44;
const HARPOON_MISS_LIFE = 1.6;
const HARPOON_MISS_GRAVITY = 12.5;
const HARPOON_MISS_LENGTH = 2.6;

export const WeaponSystems = {
  // Les illustrations directionnelles vivent dans le plan de la caméra. Cette
  // conversion projette une direction monde en angle écran par rapport au cap
  // suivi par la caméra, puis retire l'angle natif du dessin dans l'atlas.
  vfxScreenRotation(dx, dz, sourceAngle = Math.PI / 4) {
    const cameraHeading = this.boats?.[0]?.dynamics?.heading ?? 0;
    const relativeHeading = Math.atan2(dx, dz) - cameraHeading;
    return Math.PI / 2 - relativeHeading - sourceAngle;
  },

  createWavePool(count) {
    const THREE = this.THREE;
    const shellMaterial = new THREE.MeshStandardMaterial({ color: 0x6e3f21, roughness: 0.82, metalness: 0.02 });
    const milkMaterial = new THREE.MeshBasicMaterial({ color: 0xfff6cf });
    const leafMaterial = new THREE.MeshStandardMaterial({ color: 0x45b85f, roughness: 0.78 });
    return Array.from({ length: count }, () => {
      const group = new THREE.Group();
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.56, 14, 10), shellMaterial);
      shell.scale.set(1, 0.93, 1);
      const eyeA = new THREE.Mesh(new THREE.SphereGeometry(0.075, 7, 5), milkMaterial);
      const eyeB = eyeA.clone();
      eyeA.position.set(-0.16, 0.15, 0.48);
      eyeB.position.set(0.16, 0.15, 0.48);
      const sproutA = new THREE.Mesh(new THREE.ConeGeometry(0.10, 0.52, 5), leafMaterial);
      const sproutB = sproutA.clone();
      sproutA.position.set(-0.10, 0.58, 0);
      sproutB.position.set(0.12, 0.55, 0.03);
      sproutA.rotation.z = -0.35;
      sproutB.rotation.z = 0.42;
      // ⚠️ PLUS DE PointLight ICI. Chaque noix portait une lumière ponctuelle.
      // Dès qu'une devenait visible, le NOMBRE de lumières de la scène changeait
      // et three.js recompilait TOUS les matériaux éclairés — mesuré au diff des
      // programmes : +18 au premier coco en vol, +38 dès qu'un second volait en
      // même temps, et ainsi de suite jusqu'à dix-huit variantes possibles.
      // C'était la cause des gels de début de course. L'océan est un
      // ShaderMaterial qui ignorait de toute façon ces lumières : la perte
      // visuelle est un reflet ambré sur les coques voisines, rien de plus.
      group.add(shell, eyeA, eyeB, sproutA, sproutB);
      // Le banc de poissons partage ce pool : son mesh est un enfant caché, et
      // la noix se retire quand il sort. Sans ça le PWASON VOLAN était une noix
      // de coco à tête chercheuse.
      const coco = [shell, eyeA, eyeB, sproutA, sproutB];
      let poisson = null;
      if (this.assets?.hasRig?.("pwason")) {
        poisson = this.assets.instantiate("pwason");
        if (poisson) {
          poisson.scale.setScalar(0.9);
          poisson.visible = false;
          this.normalisePropMaterial(poisson);
          group.add(poisson);
        }
      }
      group.visible = false;
      this.scene.add(group);
      return { active: false, mesh: group, coco, poisson, kind: "wave", owner: null, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, spin: 0, vfxTrailTimer: 0 };
    });
  },

  createMinePool(count) {
    const THREE = this.THREE;
    return Array.from({ length: count }, () => {
      const group = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.46, 12, 9), new THREE.MeshStandardMaterial({ color: 0xff315f, emissive: 0xa70a39, emissiveIntensity: 1.9, metalness: 0.28, roughness: 0.38 }));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.63, 0.07, 6, 18), new THREE.MeshBasicMaterial({ color: 0xffdf59 }));
      ring.rotation.x = Math.PI / 2;
      group.add(body, ring);
      // Le fût du barik, en enfant caché : une seule allocation pour le pool, et
      // il ne coûte un draw call que lorsqu'il est effectivement visible.
      // Un mesh par type, tous enfants cachés du même groupe : une allocation
      // pour le pool, et chacun ne coûte un draw call que lorsqu'il est visible.
      const props = {};
      for (const [cle, echelle] of [["barik", 1.15], ["chadron", 0.9]]) {
        const prop = this.assets?.hasRig?.(cle) ? this.assets.instantiate(cle) : null;
        if (!prop) continue;
        prop.scale.setScalar(echelle);
        prop.visible = false;
        this.normalisePropMaterial(prop);
        group.add(prop);
        props[cle] = prop;
      }
      const barrique = props.barik ?? null;
      group.visible = false;
      this.scene.add(group);
      return { active: false, mesh: group, body, ring, barrique, props, kind: "mine", owner: null, x: 0, z: 0, arm: 0, life: 0, vfxArmed: false };
    });
  },

  // Une mine, un barik et un chadron partagent le même pool : seule leur tenue
  // change. Le fût a son mesh, les deux autres teintent la sphère.
  // Le générateur n'écrit ni metallicFactor ni roughnessFactor : la spec impose
  // alors 1.0 pour les deux, et sans envMap le prop rend en métal noir. Même
  // défaut que l'équipage, même correctif.
  normalisePropMaterial(root) {
    root.traverse?.((node) => {
      const m = node.material;
      if (!m) return;
      if ("emissiveIntensity" in m) m.emissiveIntensity = 0;
      if ("metalness" in m) m.metalness = 0;
      if ("roughness" in m) m.roughness = 0.72;
    });
  },

  dressProjectile(projectile, kind) {
    projectile.kind = kind;
    const poisson = kind === "pwason" && projectile.poisson;
    if (projectile.poisson) projectile.poisson.visible = Boolean(poisson);
    for (const piece of projectile.coco ?? []) piece.visible = !poisson;
  },

  dressMine(mine, kind) {
    mine.kind = kind;
    const prop = mine.props?.[kind] ?? null;
    for (const cle of Object.keys(mine.props ?? {})) mine.props[cle].visible = mine.props[cle] === prop;
    if (mine.body) {
      mine.body.visible = !prop;
      const couleur = kind === "chadron" ? 0x2b1d47 : kind === "barik" ? 0xc98a45 : 0xff315f;
      const emissive = kind === "chadron" ? 0x6b3fd0 : kind === "barik" ? 0xff6b1c : 0xa70a39;
      mine.body.material.color?.setHex(couleur);
      mine.body.material.emissive?.setHex(emissive);
      mine.body.scale.setScalar(kind === "chadron" ? 0.74 : 1);
    }
    if (mine.ring) {
      // ⚠️ LE CHADRON AVAIT PERDU SON ANNEAU. `kind !== "chadron"` le privait
      // du seul avertissement visuel du jeu — semer des oursins DEVANT la
      // trajectoire d'un adversaire est l'idée la plus maligne de l'arsenal,
      // mais un piège qu'on ne voit pas ne se lit pas comme un piège : on
      // ralentit sans savoir pourquoi.
      mine.ring.visible = !prop;
      mine.ring.material.color?.setHex(
        kind === "barik" ? 0xff8a3c : kind === "chadron" ? 0x9b5cff : 0xffdf59
      );
      // L'anneau DIT le rayon de déclenchement, il ne décore pas. Le tore est
      // construit avec un rayon de 0,63 : on met donc l'échelle à la mesure.
      const reglage = BALANCE[kind] ?? BALANCE.mine;
      mine.ring.scale.setScalar((reglage.triggerRadius ?? BALANCE.mine.triggerRadius) / 0.63);
    }
  },


  /**
   * Vivier de harpons RATÉS — purement visuel.
   *
   * ⚠️ CE POOL NE VIT PAS DANS LA SIMULATION. Il est avancé par la boucle de
   * RENDU (`updateHarpoonMisses`, appelée avec `raw` depuis game.js), jamais
   * par `updateWeapons`. Le checksum de replay est donc intact PAR
   * CONSTRUCTION — pas par prudence, par structure.
   *
   * Il ne partage pas non plus le vivier des cocos : celui-ci ne compte que 18
   * créneaux et `allocate` recycle le plus ancien sans prévenir, donc un
   * harpon à l'eau aurait pu faire DISPARAÎTRE un coco en vol.
   */
  createHarpoonMissPool(count) {
    const THREE = this.THREE;
    if (!THREE?.BufferGeometry || !this.scene?.add) return [];
    return Array.from({ length: count }, () => {
      const positions = new Float32Array(2 * 3);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({
        color: 0xffbd39, transparent: true, opacity: 0.9
      }));
      line.visible = false;
      line.frustumCulled = false;
      this.scene.add(line);
      return { line, positions, geometry, life: 0,
               x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
    });
  },

  /** Un tir de harpon qui n'accroche rien part quand même, et on le voit. */
  spawnHarpoonMiss(owner) {
    const vivier = this.harpoonMisses;
    if (!vivier?.length || !owner) return;
    const creneau = vivier.find((item) => item.life <= 0) || vivier[0];
    const avant = owner.forward(this.harpoonMissScratch
      || (this.harpoonMissScratch = { x: 0, z: 0 }));
    const vitesse = HARPOON_MISS_SPEED;
    creneau.x = owner.x + avant.x * 2.2;
    creneau.y = (owner.y ?? 0) + 1.5;
    creneau.z = owner.z + avant.z * 2.2;
    creneau.vx = avant.x * vitesse + (owner.dynamics?.vx ?? 0) * 0.3;
    creneau.vz = avant.z * vitesse + (owner.dynamics?.vz ?? 0) * 0.3;
    // Légèrement piqué vers le haut : sans ça le fer plonge en deux images et
    // on ne voit rien partir.
    creneau.vy = 3.4;
    creneau.life = HARPOON_MISS_LIFE;
    creneau.line.visible = true;
  },

  /** Avance les harpons ratés. Temps RÉEL, hors boucle fixe. */
  updateHarpoonMisses(dt) {
    const vivier = this.harpoonMisses;
    if (!vivier?.length) return;
    for (const item of vivier) {
      if (item.life <= 0) continue;
      item.life -= dt;
      item.x += item.vx * dt;
      item.y += item.vy * dt;
      item.z += item.vz * dt;
      item.vy -= HARPOON_MISS_GRAVITY * dt;
      const eau = this.waveField?.sample
        ? this.waveField.sample(item.x, item.z, this.time, this.waterScratch).height
        : 0;
      if (item.y <= eau || item.life <= 0) {
        // Il tombe à l'eau : une gerbe, un rond dans l'eau, et il disparaît.
        // C'est tout l'intérêt — voir que le coup est parti pour rien.
        item.life = 0;
        item.line.visible = false;
        // Ce projectile est avancé au temps de RENDU. Écrire ici dans la
        // WakeGrid ferait dépendre la hauteur d'eau autoritaire du framerate.
        // L'anneau conserve la lecture visuelle de l'impact sans nourrir la
        // physique du tick suivant.
        this.rings?.burst?.(item.x, eau + 0.02, item.z, 0xdfffff, 0.58, 0.42);
        this.particles?.emitBurst?.(this.visualRng,
          { x: item.x, y: eau + 0.2, z: item.z }, 0xdfffff, 10,
          { speed: 1.5, upward: 2.1, sizeMax: 0.42, lifeMax: 0.5 });
        continue;
      }
      // Le fer est orienté par sa vitesse : un segment couché sur sa
      // trajectoire, pas un trait fixe.
      const norme = Math.hypot(item.vx, item.vy, item.vz) || 1;
      const demi = HARPOON_MISS_LENGTH * 0.5;
      const p = item.positions;
      p[0] = item.x - (item.vx / norme) * demi;
      p[1] = item.y - (item.vy / norme) * demi;
      p[2] = item.z - (item.vz / norme) * demi;
      p[3] = item.x + (item.vx / norme) * demi;
      p[4] = item.y + (item.vy / norme) * demi;
      p[5] = item.z + (item.vz / norme) * demi;
      const attribut = item.geometry.getAttribute?.("position");
      if (attribut) attribut.needsUpdate = true;
      item.line.material.opacity = Math.min(0.9, item.life * 2.2);
    }
  },

  /**
   * Nappes de rhum enflammé laissées par un barik.
   *
   * État de SIMULATION : la morsure est appliquée dans le pas fixe, sur un
   * minuteur déterministe. Aucun tirage — ni `gameRng`, ni surtout `visualRng`,
   * dont le pas fixe ne doit pas dépendre.
   */
  createSlickPool(count) {
    return Array.from({ length: count }, () => ({
      active: false, owner: null, x: 0, z: 0, life: 0, morsure: 0
    }));
  },

  /** Le fût vient d'exploser : le rhum se répand et brûle. */
  spawnSlick(owner, x, z) {
    const vivier = this.slicks;
    if (!vivier?.length) return null;
    const nappe = vivier.find((s) => !s.active)
      || vivier.reduce((a, b) => (a.life <= b.life ? a : b));
    nappe.active = true;
    nappe.owner = owner;
    nappe.x = x;
    nappe.z = z;
    nappe.life = BALANCE.barik.slickLife;
    // Première morsure tout de suite : traverser la flaque à l'instant où elle
    // naît doit coûter, sinon il suffit de passer vite.
    nappe.morsure = 0;
    return nappe;
  },

  /** Avance les nappes et applique leurs morsures. Appelée dans le PAS FIXE. */
  updateSlicks(dt) {
    const vivier = this.slicks;
    if (!vivier?.length) return;
    const conf = BALANCE.barik;
    for (const nappe of vivier) {
      if (!nappe.active) continue;
      nappe.life -= dt;
      if (nappe.life <= 0) { nappe.active = false; continue; }
      const eau = this.waveField.sample(nappe.x, nappe.z, this.time, this.waterScratch);
      nappe.morsure -= dt;
      if (nappe.morsure > 0) continue;
      nappe.morsure = conf.slickInterval;
      // Le feu se voit à chaque morsure : cadence déterministe, aucun tirage.
      this.rings.burst(nappe.x, eau.height + 0.02, nappe.z, 0xff7a1e,
                       conf.slickRadius * 0.42, 0.55);
      this.spellVfx?.spawn(nappe.x, eau.height + 1.1, nappe.z,
                           SPELL_VFX.BARIK_EXPLOSION, 5.4, 0.5);
      const dedans = this.spatial.queryCircle(nappe.x, nappe.z, conf.slickRadius, this.spatialScratch);
      for (const boat of dedans) {
        if (boat.eliminated) continue;
        const distance = Math.hypot(boat.x - nappe.x, boat.z - nappe.z);
        if (distance > conf.slickRadius) continue;
        // ⚠️ Le poseur brûle AUSSI. Une nappe qu'on peut traverser
        // impunément n'est plus un terrain interdit, c'est une arme à sens
        // unique — et poser le feu derrière soi doit rester un pari.
        const force = clamp(1 - distance / conf.slickRadius, 0.2, 1);
        const cote = Math.sign(boat.x - nappe.x) || 1;
        boat.applyHit(nappe.owner, weaponHit({
          ejectCrew: false,
          rollImpulse: cote * conf.slickRoll * force,
          slow: 0.06 * force,
          waterKg: conf.slickWater * force,
          structure: { hull: conf.slickHull * force },
          cohesionDamage: 0.03 * force,
          hitLateral: cote
        }));
        if (boat.isPlayer) this.showMessage("🔥 RHUM EN FEU !", 0.4);
      }
    }
  },

  createGrapplePool(count) {
    const THREE = this.THREE;
    const pointCount = 12;
    return Array.from({ length: count }, () => {
      const positions = new Float32Array(pointCount * 3);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setDrawRange(0, pointCount);
      const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xffbd39, transparent: true, opacity: 0.95 }));
      line.visible = false;
      line.frustumCulled = false;
      this.scene.add(line);
      return {
        active: false,
        line,
        rope: new VerletRope(pointCount),
        owner: null,
        target: null,
        life: 0,
        tension: 0,
        stress: 0,
        swing: 0,
        restLength: 0,
        damageTimer: 0,
        vfxTimer: 0,
        slingshotReady: false,
        start: { x: 0, y: 0, z: 0 },
        end: { x: 0, y: 0, z: 0 }
      };
    });
  },

  findTarget(owner, range = 40, cone = 0.75) {
    const forward = owner.forward(this.forwardScratch);
    let best = null;
    let bestScore = Infinity;
    for (const boat of this.boats) {
      if (boat === owner || boat.eliminated) continue;
      const dx = boat.x - owner.x;
      const dz = boat.z - owner.z;
      const distance = Math.hypot(dx, dz);
      if (distance > range) continue;
      const dot = (dx * forward.x + dz * forward.z) / Math.max(0.001, distance);
      if (dot < cone) continue;
      // ⚠️ Le poids angulaire valait 15 contre une distance en dizaines de
      // mètres : le verrouillage suivait la DISTANCE, pas la visée. Pointer une
      // yole au loin ne changeait rien, on accrochait toujours la plus proche —
      // d'où « la visée ne marche pas pour le harpon ». À 90, viser décide.
      const score = distance + (1 - dot) * BALANCE.aimWeight;
      if (score < bestScore) {
        best = boat;
        bestScore = score;
      }
    }
    return best;
  },

  fireWave(owner) {
    // Relecture : l'IA continue de jouer, le joueur non.
    if (owner === this.boats[0] && this.playerInputLocked?.()) return false;
    if (!owner || owner.eliminated || owner.cooldowns.wave > 0) return false;
    // Soute ou caisse : le stock ne baisse que s'il est fini.
    if (owner.ammo.wave <= 0) return false;
    const projectile = this.allocate(this.waveProjectiles);
    if (Number.isFinite(owner.ammo.wave)) owner.ammo.wave--;
    owner.cooldowns.wave = baseCooldown(owner, "wave", this);
    const coco = BALANCE.coconut;
    const forward = owner.forward(this.forwardScratch);
    projectile.active = true;
    projectile.owner = owner;
    // ⚠️ Le créneau est recyclé : sans cette remise à zéro il garde la cible du
    // TIR PRÉCÉDENT. Inoffensif tant que seul le pwason lisait `target`, mais
    // c'est une bombe amorcée dès qu'une autre arme s'y met.
    projectile.target = null;
    this.dressProjectile(projectile, "wave");
    projectile.x = owner.x + forward.x * coco.spawnAhead;
    projectile.y = owner.y + coco.spawnUp;
    projectile.z = owner.z + forward.z * coco.spawnAhead;
    projectile.vx = forward.x * coco.speed + owner.dynamics.vx * coco.inheritVelocity;
    // Cloche réglable : glisser vers le haut lobe, vers le bas tend le tir.
    projectile.vy = coco.up * aimPitchFactor(this, owner);
    projectile.vz = forward.z * coco.speed + owner.dynamics.vz * coco.inheritVelocity;
    projectile.life = coco.life;
    projectile.fromAimed = Boolean(this.aimedShot);
    projectile.spin = this.gameRng.range(8, 14) * (this.gameRng.chance(0.5) ? 1 : -1);
    projectile.mesh.visible = true;
    projectile.mesh.position.set(projectile.x, projectile.y, projectile.z);
    this.spellVfx?.spawn(projectile.x, projectile.y, projectile.z, SPELL_VFX.COCO_TRAIL, 2.4, 0.36, {
      rotation: this.vfxScreenRotation(projectile.vx, projectile.vz)
    });
    projectile.vfxTrailTimer = COCO_TRAIL_INTERVAL;
    this.audio.play("cocoFire", { gain: owner.isPlayer ? 0.40 : 0.20, rate: 1, pan: this.panFor(owner.x), gap: 0.03 });
    if (owner.isPlayer) this.showMessage("🥥 CANON COCO !", 0.42);
    if (owner.isPlayer) this.haptic?.("coconutFire");
    this.telemetry.track("weapon_coconut", { owner: owner.id }, this.time);
    if (owner.isPlayer && !this.isApplyingReplay) this.input.actions |= ACTION_WAVE;
    return true;
  },

  /**
   * Tir d'IA visé sur une cible mobile.
   *
   * ⚠️ AVANT, les IA appelaient `fireWave` directement. `fireWave` lit
   * `owner.forward()`, c'est-à-dire le cap de la coque : elles tiraient donc
   * droit devant, sans jamais tenir compte de la position de la cible. D'où le
   * constat de playtest — « elles tirent des cocos de partout sans viser ».
   *
   * L'erreur résiduelle est proportionnelle à (1 − précision) du niveau : une
   * PEYI rate franchement, une CHANNPYON met dans le mille. Le tirage passe par
   * le flux déterministe du cerveau, donc la relecture est exacte.
   */
  fireAimed(owner, target, kind = "wave") {
    // Diagnostic : trois raisons distinctes de ne pas tirer. Les confondre donne
    // un « 92 % de refus » alarmant qui n'est en fait que le cooldown.
    this.aimStats ??= { tire: 0, refusCadence: 0, refusPortee: 0, refusAngle: 0 };
    if (!owner || owner.eliminated) return false;
    if ((owner.cooldowns?.[kind === "pwason" ? "pwason" : "wave"] ?? 0) > 0) {
      this.aimStats.refusCadence++;
      return false;
    }
    const conf = kind === "pwason" ? BALANCE.pwason : BALANCE.coconut;
    const lead = solveLeadAngle(owner, target, conf.speed, conf.life);
    if (lead === null) { this.aimStats.refusPortee++; return false; }
    const precision = clamp(owner.brain?.precision ?? 0.7, 0, 1);
    // Hors de cette fenêtre, on NE TIRE PAS : une IA sans solution garde sa
    // munition, au lieu d'arroser.
    //
    // ⚠️ Première valeur (0,22 + …) MESURÉE INJOUABLE dans l'autre sens : 96 %
    // des tirs étaient refusés, l'IA ne tirait plus du tout. Le décalage de cap
    // est ENTIÈREMENT corrigé par withAimOffset — la fenêtre ne dit donc pas
    // « est-ce que je vise déjà bien », mais « jusqu'où j'accepte de lancer par
    // le travers ». Pour une noix lobée, 45° est plausible.
    // ⚠️ Valeur trouvée par MESURE DES CAUSES DE REFUS, pas devinée. À 0,22 puis
    // 0,80 rad, 92 % des tentatives étaient rejetées « faute de solution » — pas
    // par cadence ni par portée. La raison : l'IA choisit sa cible par proximité
    // et vulnérabilité, sans filtre d'angle, donc elle vise souvent par le
    // travers. Un lancer de noix par le travers est plausible ; par l'arrière ne
    // l'est pas. 1,55 rad (89°) accepte le premier et refuse le second.
    const fenetre = 1.55 - (1 - precision) * 0.35;
    if (Math.abs(lead) > fenetre) { this.aimStats.refusAngle++; return false; }
    const erreur = (owner.brain?.rng?.signed?.() ?? 0) * (1 - precision) * 0.16;
    // Marqueur d'origine : il permet de mesurer le taux de réussite du tir VISÉ
    // sans y mêler les mines et les harpons, qui ne passent pas par ici.
    this.aimedShot = true;
    try {
      const ok = withAimOffset(owner, lead + erreur, () => (
        kind === "pwason" ? this.firePwason(owner) : this.fireWave(owner)
      ));
      if (ok) this.aimStats.tire++; else this.aimStats.refusCadence++;
      return ok;
    } finally {
      this.aimedShot = false;
    }
  },

  /**
   * Rayon de harpon : la première yole traversée par l'axe de visée.
   *
   * Le tireur a déjà son cap décalé par `withPlayerAim` quand c'est le joueur,
   * donc `owner.forward()` EST la direction visée. On projette chaque cible sur
   * cet axe et on ne garde que celles dont l'écart latéral tient dans le couloir.
   *
   * Fonction pure, aucun tirage : appelée depuis la boucle fixe.
   */
  raycastHarpoon(owner) {
    const forward = owner.forward(this.forwardScratch);
    const portee = BALANCE.grapple.range;
    const couloir = BALANCE.grapple.rayHalfWidth;
    let best = null;
    let bestLe = Infinity;
    for (const boat of this.boats) {
      if (boat === owner || boat.eliminated) continue;
      const dx = boat.x - owner.x;
      const dz = boat.z - owner.z;
      // Distance LE LONG de l'axe visé, et écart perpendiculaire à cet axe.
      const le = dx * forward.x + dz * forward.z;
      if (le <= 1.5 || le > portee) continue;
      const ecart = Math.abs(dx * forward.z - dz * forward.x);
      if (ecart > couloir) continue;
      if (le < bestLe) { bestLe = le; best = boat; }
    }
    return best;
  },

  fireHarpoon(owner, preferredTarget = null) {
    // Relecture : l'IA continue de jouer, le joueur non.
    if (owner === this.boats[0] && this.playerInputLocked?.()) return false;
    if (!owner || owner.eliminated || owner.cooldowns.harpoon > 0) return false;
    // Arme de base : munition illimitée, c'est la cadence qui l'équilibre.
    if (owner.ammo.harpoon <= 0) return false;
    // ─── PLUS DE VERROUILLAGE : ON VISE ───────────────────────────────────
    //
    // Avant, `findTarget` acceptait un cône de 83° et classait par DISTANCE :
    // le harpon accrochait la yole la plus proche devant, où que pointe le
    // viseur. Il n'y avait donc rien à réussir.
    //
    // Désormais c'est un tir : on trace le rayon du viseur et on prend la
    // première coque qu'il traverse, dans un couloir de la largeur d'une yole.
    // Rater est possible, et c'est le but.
    const target = preferredTarget && !preferredTarget.eliminated
      ? preferredTarget
      : this.raycastHarpoon(owner);
    if (!target) {
      if (owner.isPlayer) this.showMessage("HARPON À L'EAU", 0.5);
      // Le tir PART, même mal visé : on voit le fer filer puis retomber à
      // l'eau. Avant, un tir raté ne produisait qu'un message — le joueur ne
      // pouvait pas voir OÙ il avait visé, donc pas corriger.
      this.spawnHarpoonMiss?.(owner);
      // La munition est illimitée mais le cooldown, lui, est bien consommé :
      // rater coûte les 7,6 s. C'est ce qui donne du poids à la visée.
      owner.cooldowns.harpoon = baseCooldown(owner, "harpoon", this) * 0.55;
      this.audio.play("splash", { gain: owner.isPlayer ? 0.3 : 0.14, rate: 1.25, pan: this.panFor(owner.x), gap: 0.05 });
      return false;
    }
    const grapple = this.allocate(this.grapples);
    if (Number.isFinite(owner.ammo.harpoon)) owner.ammo.harpoon--;
    owner.cooldowns.harpoon = baseCooldown(owner, "harpoon", this);
    grapple.active = true;
    grapple.owner = owner;
    grapple.target = target;
    grapple.life = BALANCE.grapple.life;
    grapple.tension = 0;
    grapple.stress = 0;
    grapple.swing = 0;
    grapple.damageTimer = BALANCE.grapple.tensionDamageInterval;
    grapple.vfxTimer = 0;
    grapple.slingshotReady = false;
    const attachDx = target.x - owner.x;
    const attachDz = target.z - owner.z;
    const attachDistance = Math.max(0.001, Math.hypot(attachDx, attachDz));
    const attachNx = attachDx / attachDistance;
    const attachNz = attachDz / attachDistance;
    grapple.restLength = Math.max(
      BALANCE.grapple.slack,
      attachDistance - BALANCE.grapple.initialStretch
    );
    grapple.start.x = owner.x; grapple.start.y = owner.y + 0.7; grapple.start.z = owner.z;
    grapple.end.x = target.x; grapple.end.y = target.y + 0.6; grapple.end.z = target.z;
    grapple.rope.reset(grapple.start, grapple.end);
    grapple.rope.writePositions(grapple.line.geometry.attributes.position.array);
    grapple.line.geometry.attributes.position.needsUpdate = true;
    grapple.line.visible = true;
    this.spellVfx?.spawn(owner.x, owner.y + 1.0, owner.z, SPELL_VFX.HARPOON_LAUNCH, 3.1, 0.42, {
      rotation: this.vfxScreenRotation(target.x - owner.x, target.z - owner.z)
    });
    this.spellVfx?.spawn(target.x, target.y + 1.3, target.z, SPELL_VFX.HARPOON_LOCK, 2.6, 0.58);
    const impactSide = Math.sign(
      attachNx * Math.cos(target.dynamics.heading) - attachNz * Math.sin(target.dynamics.heading)
    ) || 1;
    target.applyHit(owner, weaponHit({
      rollImpulse: impactSide * 0.38,
      yawImpulse: impactSide * 0.18,
      impulseX: -attachNx * BALANCE.grapple.impactPull,
      impulseZ: -attachNz * BALANCE.grapple.impactPull,
      slow: BALANCE.grapple.impactSlow,
      cohesionDamage: BALANCE.grapple.impactCohesion,
      hitLateral: impactSide,
      hitLongitudinal: -0.35,
      crewImpulse: 0.62,
      structure: { hull: BALANCE.grapple.impactHull, sail: 0.010 }
    }));
    const targetWater = this.waveField.sample(target.x, target.z, this.time, this.waterScratch);
    this.rings.burst(target.x, targetWater.height, target.z, 0x76f4ff, 0.78, 0.52);
    this.particles.emitBurst(this.visualRng, { x: target.x, y: targetWater.height + 0.9, z: target.z }, 0xffd36a, 18, {
      speed: 2.2, upward: 2.1, lifeMax: 0.55, sizeMax: 0.48, gravity: 5.8
    });
    this.juiceVfx?.spawn(
      target.x,
      targetWater.height + 1.35,
      target.z,
      JUICE_VFX.HARPOON_TEAR,
      6.4,
      0.76,
      {
        rotation: this.vfxScreenRotation(attachDx, attachDz),
        intensity: this.settings.get("reduceFlash") ? 0.34 : 1
      }
    );
    const harpoonNear = this.proximity(target.x, target.z, 46);
    if (harpoonNear > 0.04) {
      const player = this.boats[0];
      this.impact.trigger("harpoon", {
        dirX: player.x - target.x,
        dirZ: player.z - target.z,
        intensity: 0.48 + harpoonNear * 0.52,
        side: impactSide
      });
      this.postFX.pulse(0.38 + harpoonNear * 0.22);
    }
    target.lastAggressor = owner;
    target.lastAggressionAt = this.time;
    this.audio.play("harpoonFire", { gain: owner.isPlayer ? 0.42 : 0.20, pan: this.panFor(owner.x), gap: 0.03 });
    this.audio.playImpact?.("harpoon", {
      intensity: 0.58 + harpoonNear * 0.42,
      pan: this.panFor(target.x)
    });
    if (owner.isPlayer) this.haptic?.("harpoonAnchor");
    if (owner.isPlayer) this.showMessage("🕸 SPIDER-HARPON !", 0.48);
    this.telemetry.track("weapon_harpoon", { owner: owner.id, target: target.id }, this.time);
    if (owner.isPlayer && !this.isApplyingReplay) this.input.actions |= ACTION_HARPOON;
    return true;
  },

  // RHUM : vitesse et invulnérabilité pendant BALANCE.rhum.duration.
  drinkRhum(owner) {
    if (!owner || owner.eliminated || owner.cooldowns.rhum > 0) return false;
    if (owner === this.boats[0] && this.playerInputLocked?.()) return false;
    if (owner.ammo.rhum <= 0) return false;
    if (!owner.dynamics.drinkRhum(BALANCE.rhum.duration)) return false;
    if (Number.isFinite(owner.ammo.rhum)) owner.ammo.rhum--;
    owner.cooldowns.rhum = baseCooldown(owner, "rhum", this);

    // Toute la bordée boit au goulot. Purement visuel — l'effet de jeu est
    // déjà posé par `dynamics.drinkRhum` juste au-dessus.
    owner.visual?.setDrinking?.(Math.min(2.2, BALANCE.rhum.duration));

    const water = this.waveField.sample(owner.x, owner.z, this.time, this.waterScratch);
    this.rings.burst(owner.x, water.height, owner.z, 0xffc531, 2.2, 0.9);
    this.spellVfx?.spawn(owner.x, water.height + 1.6, owner.z, SPELL_VFX.RHUM_AURA, 5.4, 0.92);
    owner.rhumVfxTimer = RHUM_AURA_REFRESH_INTERVAL;
    this.particles.emitBurst(this.visualRng, { x: owner.x, y: water.height + 1.1, z: owner.z }, 0xffd76a, 40, {
      speed: 2.6, upward: 3.1, sizeMax: 0.6, gravity: 4.4
    });
    this.audio.play("victory", { gain: owner.isPlayer ? 0.5 : 0.18, gap: 0.3 });
    if (owner.isPlayer) {
      this.showMessage("🥃 RHUM ! INTOUCHABLE", 1.1);
      this.postFX.pulse(0.9);
      this.impact.trigger("blast", { dirX: 0, dirZ: 1, intensity: 0.8 });
      this.haptic?.("rhum");
      if (!this.isApplyingReplay) this.input.actions |= ACTION_RHUM;
    }
    this.telemetry.track("rhum", { boat: owner.id }, this.time);
    return true;
  },

  dropMine(owner) {
    // Relecture : l'IA continue de jouer, le joueur non.
    if (owner === this.boats[0] && this.playerInputLocked?.()) return false;
    if (!owner || owner.eliminated || owner.cooldowns.mine > 0) return false;
    // Arme de base : munition illimitée, c'est la cadence qui l'équilibre.
    if (owner.ammo.mine <= 0) return false;
    const mine = this.allocate(this.mines);
    if (Number.isFinite(owner.ammo.mine)) owner.ammo.mine--;
    owner.cooldowns.mine = baseCooldown(owner, "mine", this);
    const forward = owner.forward(this.forwardScratch);
    mine.active = true;
    mine.owner = owner;
    mine.x = owner.x - forward.x * BALANCE.mine.dropBehind;
    mine.z = owner.z - forward.z * BALANCE.mine.dropBehind;
    this.dressMine(mine, "mine");
    mine.arm = BALANCE.mine.armTime;
    mine.life = BALANCE.mine.life;
    mine.vfxArmed = false;
    mine.mesh.visible = true;
    mine.mesh.position.set(mine.x, this.waveField.sample(mine.x, mine.z, this.time, this.waterScratch).height + 0.44, mine.z);
    this.audio.play("mineDrop", { gain: owner.isPlayer ? 0.38 : 0.18, pan: this.panFor(owner.x), gap: 0.03 });
    if (owner.isPlayer) this.showMessage("🌋 MINE TSUNAMI !", 0.44);
    this.telemetry.track("weapon_mine", { owner: owner.id }, this.time);
    if (owner.isPlayer && !this.isApplyingReplay) this.input.actions |= ACTION_MINE;
    return true;
  },

  // BARIK RHUM — fut enflamme largue derriere soi. Reutilise le pool de mines
  // avec un `kind` : meme allocation, meme boucle, meme detection.
  dropBarik(owner) {
    if (owner === this.boats[0] && this.playerInputLocked?.()) return false;
    if (!owner || owner.eliminated || owner.cooldowns.barik > 0 || owner.ammo.barik <= 0) return false;
    const mine = this.allocate(this.mines);
    if (!mine) return false;
    owner.ammo.barik--;
    owner.cooldowns.barik = BALANCE.cooldowns.barik;
    const forward = owner.forward(this.forwardScratch);
    mine.active = true;
    mine.owner = owner;
    this.dressMine(mine, "barik");
    mine.x = owner.x - forward.x * BALANCE.barik.dropBehind;
    mine.z = owner.z - forward.z * BALANCE.barik.dropBehind;
    mine.arm = BALANCE.barik.armTime;
    mine.life = BALANCE.barik.life;
    mine.vfxArmed = false;
    mine.mesh.visible = true;
    mine.mesh.position.set(mine.x, this.waveField.sample(mine.x, mine.z, this.time, this.waterScratch).height + 0.5, mine.z);
    this.spellVfx?.spawn(mine.x, mine.mesh.position.y + 0.5, mine.z, SPELL_VFX.BARIK_FUSE, 2.2, 0.54);
    this.audio.play("mineDrop", { gain: owner.isPlayer ? 0.34 : 0.16, rate: 0.82, pan: this.panFor(owner.x), gap: 0.03 });
    if (owner.isPlayer) this.showMessage("🛢 BARIK RHUM !", 0.44);
    this.telemetry.track("weapon_barik", { owner: owner.id }, this.time);
    if (owner.isPlayer && !this.isApplyingReplay) this.input.actions |= ACTION_BARIK;
    return true;
  },

  // CHADRON — oursin seme DEVANT, dans la trajectoire de celui qu'on vise.
  sowChadron(owner) {
    if (owner === this.boats[0] && this.playerInputLocked?.()) return false;
    if (!owner || owner.eliminated || owner.cooldowns.chadron > 0 || owner.ammo.chadron <= 0) return false;
    const mine = this.allocate(this.mines);
    if (!mine) return false;
    owner.ammo.chadron--;
    owner.cooldowns.chadron = BALANCE.cooldowns.chadron;
    const forward = owner.forward(this.forwardScratch);
    mine.active = true;
    mine.owner = owner;
    this.dressMine(mine, "chadron");
    mine.x = owner.x + forward.x * BALANCE.chadron.dropAhead;
    mine.z = owner.z + forward.z * BALANCE.chadron.dropAhead;
    mine.arm = BALANCE.chadron.armTime;
    mine.life = BALANCE.chadron.life;
    mine.vfxArmed = false;
    mine.mesh.visible = true;
    mine.mesh.position.set(mine.x, this.waveField.sample(mine.x, mine.z, this.time, this.waterScratch).height + 0.28, mine.z);
    this.spellVfx?.spawn(mine.x, mine.mesh.position.y + 0.55, mine.z, SPELL_VFX.CHADRON_SPIKES, 2.2, 0.54);
    this.audio.play("mineDrop", { gain: owner.isPlayer ? 0.3 : 0.14, rate: 1.34, pan: this.panFor(owner.x), gap: 0.03 });
    if (owner.isPlayer) this.showMessage("🦔 CHADRON SEMÉ !", 0.44);
    this.telemetry.track("weapon_chadron", { owner: owner.id }, this.time);
    if (owner.isPlayer && !this.isApplyingReplay) this.input.actions |= ACTION_CHADRON;
    return true;
  },

  // KONK LANBI — cone de souffle instantane. AUCUN degat de structure : il
  // desorganise l'equipage et fait deriver, c'est tout. Pas de projectile, donc
  // pas d'allocation ni d'etat nouveau.
  blowLanbi(owner) {
    if (owner === this.boats[0] && this.playerInputLocked?.()) return false;
    if (!owner || owner.eliminated || owner.cooldowns.lanbi > 0 || owner.ammo.lanbi <= 0) return false;
    owner.ammo.lanbi--;
    owner.cooldowns.lanbi = BALANCE.cooldowns.lanbi;
    const forward = owner.forward(this.forwardScratch);
    const conf = BALANCE.lanbi;
    let touches = 0;
    for (const boat of this.boats) {
      if (boat === owner || boat.eliminated) continue;
      const dx = boat.x - owner.x;
      const dz = boat.z - owner.z;
      const distance = Math.hypot(dx, dz);
      if (distance > conf.range || distance < 0.5) continue;
      const cosAngle = (dx * forward.x + dz * forward.z) / distance;
      if (cosAngle < Math.cos(conf.halfAngle)) continue;
      const force = clamp(1 - distance / conf.range, 0.12, 1);
      const side = Math.sign(dx * Math.cos(boat.dynamics.heading) - dz * Math.sin(boat.dynamics.heading)) || 1;
      boat.applyHit(owner, weaponHit({
        rollImpulse: side * force * 0.52,
        yawImpulse: side * force * 0.68,
        slow: force * 0.30,
        // Le lanbi n'infligeait AUCUN dégât de structure : c'était une arme de
        // pure désorganisation. Il perce maintenant à 10 % à bout portant.
        structure: { hull: force * 0.1389 },
        cohesionDamage: 0.10 + force * 0.26,
        // ⚠️ LE VERBE DU LAMBI. Il gardait ses 10 % de coque, mais son effet
        // PRINCIPAL était la cohésion — une statistique que le HUD n'affiche
        // nulle part. Il prend maintenant la barre : lisible de l'extérieur,
        // et aucune autre arme ne le fait.
        helmLoss: BALANCE.lanbi.helmLoss * (0.55 + force * 0.45),
        crewImpulse: 0.9 + force * 1.5,
        hitLateral: side
      }));
      this.spellVfx?.spawn(boat.x, boat.y + 1.25, boat.z, SPELL_VFX.LANBI_STUN, 2.8 + force * 0.8, 0.58);
      // ⚠️ La victime doit COMPRENDRE pourquoi sa barre ne répond plus. Sans ce
      // message, une perte de contrôle de 1,5 s se lit comme un bug d'entrée.
      // Le rhum sort avant `applyHit`, donc un joueur protégé ne le verra pas —
      // c'est correct, il n'a rien perdu.
      if (boat.isPlayer && boat.dynamics.helmLoss > 0) {
        this.showMessage("🐚 BARRE COUPÉE !", 0.85);
        this.impact.trigger("graze", { dirX: 0, dirZ: 1, intensity: 0.7 });
        this.haptic?.("lanbi");
      }
      touches++;
    }
    this.rings.burst(owner.x, this.waveField.sample(owner.x, owner.z, this.time, this.waterScratch).height, owner.z, 0xffe08a, 2.4, 1.25);
    this.spellVfx?.spawn(owner.x + forward.x * 3.4, owner.y + 1.0, owner.z + forward.z * 3.4, SPELL_VFX.LANBI_CONE, 5.2, 0.72, {
      rotation: this.vfxScreenRotation(forward.x, forward.z)
    });
    this.audio.play("takedown", { gain: owner.isPlayer ? 0.4 : 0.18, rate: 0.66, pan: this.panFor(owner.x), gap: 0.05 });
    if (owner.isPlayer) this.showMessage(touches ? `🐚 KONK LANBI — ${touches} SONNÉ${touches > 1 ? "S" : ""} !` : "🐚 KONK DANS LE VIDE", 0.6);
    this.telemetry.track("weapon_lanbi", { owner: owner.id, touches }, this.time);
    if (owner.isPlayer && !this.isApplyingReplay) this.input.actions |= ACTION_LANBI;
    return true;
  },

  // PWASON VOLAN — banc a tete chercheuse. Reutilise le pool de cocos avec un
  // `kind` : la boucle de vol existante s'en occupe, plus un terme de virage.
  firePwason(owner) {
    if (owner === this.boats[0] && this.playerInputLocked?.()) return false;
    if (!owner || owner.eliminated || owner.cooldowns.pwason > 0 || owner.ammo.pwason <= 0) return false;
    const projectile = this.allocate(this.waveProjectiles);
    if (!projectile) return false;
    owner.ammo.pwason--;
    owner.cooldowns.pwason = BALANCE.cooldowns.pwason;
    const forward = owner.forward(this.forwardScratch);
    const conf = BALANCE.pwason;
    projectile.active = true;
    projectile.owner = owner;
    this.dressProjectile(projectile, "pwason");
    projectile.target = this.findTarget(owner, conf.speed * conf.life, 0.5);
    projectile.x = owner.x + forward.x * 3.2;
    projectile.z = owner.z + forward.z * 3.2;
    projectile.y = this.waveField.sample(projectile.x, projectile.z, this.time, this.waterScratch).height + 1.1;
    projectile.vx = forward.x * conf.speed + owner.dynamics.vx * 0.2;
    projectile.vz = forward.z * conf.speed + owner.dynamics.vz * 0.2;
    // CLOCHE. La torpille part vers le haut et retombe sur sa cible : elle
    // passe par-dessus une yole intercalée au lieu de la percuter. La hausse du
    // viseur module l'arc — tendu pour un tir direct, haut pour contourner.
    projectile.vy = BALANCE.pwason.arcUp * aimPitchFactor(this, owner);
    projectile.life = conf.life;
    projectile.mesh.visible = true;
    this.spellVfx?.spawn(projectile.x, projectile.y, projectile.z, SPELL_VFX.PWASON_TRAIL, 2.7, 0.44, {
      rotation: this.vfxScreenRotation(projectile.vx, projectile.vz)
    });
    projectile.vfxTrailTimer = PWASON_TRAIL_INTERVAL;
    this.audio.play("cocoFire", { gain: owner.isPlayer ? 0.34 : 0.16, rate: 1.42, pan: this.panFor(owner.x), gap: 0.03 });
    if (projectile.target) {
      this.audio.play("pwasonLock", {
        gain: projectile.target.isPlayer ? 0.46 : owner.isPlayer ? 0.31 : 0.14,
        rate: projectile.target.isPlayer ? 0.92 : 1.08,
        pan: this.panFor(projectile.target.x),
        gap: 0.12,
        delay: 0.055
      });
    }
    if (owner.isPlayer) this.showMessage("🐟 PWASON VOLAN !", 0.44);
    this.telemetry.track("weapon_pwason", { owner: owner.id }, this.time);
    if (owner.isPlayer && !this.isApplyingReplay) this.input.actions |= ACTION_PWASON;
    return true;
  },

  cutGrapple(grapple, reason = "cut") {
    if (!grapple?.active) return false;
    grapple.active = false;
    grapple.life = 0;
    grapple.line.visible = false;
    this.telemetry.track("harpoon_released", {
      owner: grapple.owner?.id ?? -1,
      target: grapple.target?.id ?? -1,
      reason,
      tension: grapple.tension,
      stress: grapple.stress
    }, this.time);
    return true;
  },

  tryCutGrapples(boat) {
    let cut = 0;
    const energy = clamp(Math.abs(boat.dynamics.crewShiftVelocity ?? 0) + Math.abs(boat.roll) * 0.35, 0, 2);
    for (const grapple of this.grapples) {
      if (!grapple.active || grapple.target !== boat) continue;
      if (grapple.tension > 0.24 && energy > 0.45 && this.cutGrapple(grapple, "bwa_shift")) cut++;
    }
    if (cut && boat.isPlayer) this.showMessage("⚡ HARPON COUPÉ AU SHIFT", 0.72);
    return cut;
  },

  // Tete chercheuse du banc de poissons. Appelee depuis la boucle de vol des
  // cocos : meme pool, meme collision, un seul terme en plus.
  /**
   * Guidage de la torpille pwason — HORIZONTAL SEULEMENT.
   *
   * ⚠️ La ligne qui manquait à l'appel : ce guidage écrasait AUSSI la verticale
   * (`vy += (0.4 - vy) * virage`), avec une constante de temps de 0,385 s. Toute
   * mise en l'air était donc effacée en moins d'une demi-seconde, et le lob
   * initial de `firePwason` ne servait strictement à rien — le poisson rasait
   * l'eau en ligne droite. La verticale est maintenant laissée à la gravité,
   * seule la direction au sol est corrigée. D'où la cloche.
   *
   * Fonction déterministe, aucun tirage : appelée depuis la boucle fixe.
   */
  /**
   * Nouvelle proie pour une torpille dont la cible a chaviré : la coque valide
   * la plus proche de la TORPILLE, dans sa portée de rattrapage.
   *
   * Déterministe et sans tirage — appelée depuis la boucle fixe. L'ordre de
   * `this.boats` est stable, donc deux relectures choisissent la même.
   */
  reacquirePwason(projectile) {
    const portee = BALANCE.pwason.reacquireRange;
    let best = null;
    let bestDistance = portee;
    for (const boat of this.boats) {
      if (boat === projectile.owner || boat.eliminated) continue;
      const distance = Math.hypot(boat.x - projectile.x, boat.z - projectile.z);
      if (distance < bestDistance) { bestDistance = distance; best = boat; }
    }
    return best;
  },

  steerPwason(projectile, dt) {
    let cible = projectile.target;
    // Rattrapage : une torpille dont la cible chavire cherchait le vide et
    // filait tout droit. Elle se choisit maintenant une nouvelle proie.
    if (!cible || cible.eliminated) {
      // ⚠️ PAS `findTarget` : celui-ci cherche depuis le TIREUR et dans son
      // cône de cap. Une torpille à mi-course est ailleurs et regarde ailleurs.
      // On prend donc la coque valide la plus proche DE LA TORPILLE.
      cible = projectile.target = this.reacquirePwason(projectile);
      if (!cible) return;
    }
    const dx = cible.x - projectile.x;
    const dz = cible.z - projectile.z;
    const distance = Math.max(0.5, Math.hypot(dx, dz));
    const vitesse = Math.max(0.5, Math.hypot(projectile.vx, projectile.vz));
    const virage = Math.min(1, BALANCE.pwason.turn * dt);
    projectile.vx += ((dx / distance) * vitesse - projectile.vx) * virage;
    projectile.vz += ((dz / distance) * vitesse - projectile.vz) * virage;
  },

  impactWave(projectile, target = null) {
    const water = this.waveField.sample(projectile.x, projectile.z, this.time, this.waterScratch);
    const isPwason = projectile.kind === "pwason";
    this.ocean.wake.burst(projectile.x, projectile.z, isPwason ? 4.8 : 7.4, isPwason ? 1.15 : 1.72);
    this.ocean.wake.burst(projectile.x, projectile.z, isPwason ? 7.2 : 11.5, isPwason ? 0.72 : 0.94);
    this.explosions?.spawn(projectile.x, water.height + 1.7, projectile.z, isPwason ? 5.0 : 7.4, isPwason ? 0.70 : 0.90);
    this.spellVfx?.spawn(
      projectile.x,
      water.height + 1.72,
      projectile.z,
      isPwason ? SPELL_VFX.PWASON_HIT : SPELL_VFX.COCO_IMPACT,
      isPwason ? 4.5 : 7.2,
      isPwason ? 0.68 : 0.86
    );
    if (!isPwason) {
      this.juiceVfx?.spawn(
        projectile.x,
        water.height + 2.05,
        projectile.z,
        JUICE_VFX.COCONUT_SHOCKWAVE,
        9.6,
        0.94,
        { intensity: this.settings.get("reduceFlash") ? 0.30 : 1 }
      );
    }
    this.rings.burst(projectile.x, water.height, projectile.z, 0xffc62f, isPwason ? 1.05 : 1.55, isPwason ? 0.58 : 0.78);
    this.rings.burst(projectile.x, water.height + 0.02, projectile.z, 0xffffff, isPwason ? 0.72 : 1.02, isPwason ? 0.46 : 0.62);
    if (!isPwason) this.rings.burst(projectile.x, water.height + 0.04, projectile.z, 0x5ff4ff, 2.05, 0.92);
    this.particles.emitBurst(this.visualRng, { x: projectile.x, y: water.height + 0.72, z: projectile.z }, 0xffd84d, isPwason ? 30 : 48, {
      speed: isPwason ? 2.5 : 3.4, upward: isPwason ? 3.0 : 4.1, sizeMax: isPwason ? 0.68 : 0.92, gravity: 5.4
    });
    this.particles.emitBurst(this.visualRng, { x: projectile.x, y: water.height + 0.68, z: projectile.z }, 0xfff8d6, isPwason ? 28 : 42, {
      speed: isPwason ? 2.0 : 2.8, upward: isPwason ? 2.5 : 3.5, sizeMax: isPwason ? 0.58 : 0.78, gravity: 4.9
    });
    this.particles.emitBurst(this.visualRng, { x: projectile.x, y: water.height + 0.60, z: projectile.z }, 0x7a3e1f, isPwason ? 12 : 24, {
      speed: isPwason ? 2.6 : 3.6, upward: isPwason ? 3.0 : 4.0, sizeMax: isPwason ? 0.34 : 0.48, gravity: 7.4
    });
    const owner = projectile.owner;
    const impactRadius = isPwason ? BALANCE.pwason.aoeRadius : BALANCE.coconut.aoeRadius;
    const victims = this.spatial.queryCircle(projectile.x, projectile.z, impactRadius, this.spatialScratch).filter((boat) => boat !== owner && !boat.eliminated);
    for (const boat of victims) {
      const dx = boat.x - projectile.x;
      const dz = boat.z - projectile.z;
      const distance = Math.max(0.35, Math.hypot(dx, dz));
      const attenuation = clamp(1 - distance / impactRadius, 0.18, 1);
      const side = Math.sign(dx * Math.cos(boat.dynamics.heading) - dz * Math.sin(boat.dynamics.heading)) || 1;
      boat.applyHit(owner, weaponHit({
        fromAimed: Boolean(projectile.fromAimed),
        rollImpulse: side * (isPwason ? 0.32 + attenuation * 0.38 : 0.44 + attenuation * 0.58),
        pitchImpulse: attenuation * (isPwason ? 0.04 : 0.10),
        yawImpulse: side * attenuation * (isPwason ? 0.14 : 0.22),
        impulseX: dx / distance * attenuation * (isPwason ? 0.65 : 1.15),
        impulseZ: dz / distance * attenuation * (isPwason ? 0.65 : 1.15),
        slow: isPwason ? 0.12 + attenuation * 0.15 : 0.16 + attenuation * 0.22,
        waterKg: isPwason ? 5 + attenuation * 10 : 9 + attenuation * 18,
        cohesionDamage: isPwason ? 0.08 + attenuation * 0.08 : 0.09 + attenuation * 0.12,
        hitLateral: side,
        hitLongitudinal: -0.25,
        crewImpulse: isPwason ? 0.52 + attenuation * 0.46 : 0.42 + attenuation * 0.40,
        // Le coco perce désormais : 20 % de coque à bout portant. Il ne se
        // contente plus de noyer — c'est l'arme de base, elle doit pouvoir tuer.
        structure: {
          // Le pwason n'infligeait AUCUN dégât de structure (un zéro
          // littéral) : c'était un projectile de gêne. Devenu torpille à tête
          // chercheuse, il perce à 15 % à bout portant — entre le harpon (10 %)
          // et le coco (20 %), parce qu'il est bien plus dur à esquiver.
          hull: isPwason ? attenuation * 0.2083 : attenuation * 0.2778,
          sail: isPwason ? 0.012 + attenuation * 0.012 : 0.022 + attenuation * 0.028
        }
      }));
    }
    if (target && (target.isPlayer || owner?.isPlayer)) this.showMessage("🥥💥 COCO BOUM !", 0.62);
    const cocoNear = this.proximity(projectile.x, projectile.z, impactRadius * 2.4);
    if (isPwason) {
      this.audio.play("cocoBoom", { gain: 0.24 + cocoNear * 0.26, rate: 1.34, pan: this.panFor(projectile.x), gap: 0.04 });
      this.audio.play("splash", { gain: 0.12 + cocoNear * 0.18, rate: 1.22, gap: 0.05 });
    } else {
      this.audio.playImpact?.("coconut", {
        intensity: 0.58 + cocoNear * 0.58,
        pan: this.panFor(projectile.x)
      });
      if (target?.isPlayer || owner?.isPlayer || cocoNear > 0.55) this.haptic?.("coconutImpact");
    }
    this.shake += isPwason ? 0.16 : target?.isPlayer ? 0.52 : 0.28 + cocoNear * 0.12;
    this.postFX.pulse(isPwason ? 0.42 : target?.isPlayer ? 1.02 : 0.62 + cocoNear * 0.20);
    if (cocoNear > 0.05) {
      const player = this.boats[0];
      this.impact.trigger(isPwason ? "slam" : "coconut", {
        dirX: player.x - projectile.x,
        dirZ: player.z - projectile.z,
        intensity: isPwason ? 0.42 + cocoNear * 0.38 : target?.isPlayer ? 1.22 : 0.52 + cocoNear * 0.72
      });
    }
    this.telemetry.track("coconut_hit", { owner: owner?.id ?? -1, target: target?.id ?? -1, victims: victims.length }, this.time);
  },

  explodeMine(mine, target = null) {
    const water = this.waveField.sample(mine.x, mine.z, this.time, this.waterScratch);
    this.ocean.wake.burst(mine.x, mine.z, 6.4, 1.62);
    this.ocean.wake.burst(mine.x, mine.z, 11.2, 1.18);
    this.ocean.wake.burst(mine.x, mine.z, 17.5, 0.82);
    this.explosions?.spawn(mine.x, water.height + 2.45, mine.z, 10.2, 1.02);
    const spellEffect = mine.kind === "barik"
      ? SPELL_VFX.BARIK_EXPLOSION
      : mine.kind === "chadron"
        ? SPELL_VFX.CHADRON_POISON
        : SPELL_VFX.TSUNAMI_RING;
    this.spellVfx?.spawn(mine.x, water.height + 2.1, mine.z, spellEffect, mine.kind === "mine" ? 10.4 : 7.6, 1.02);
    if (mine.kind === "mine") {
      this.juiceVfx?.spawn(
        mine.x,
        water.height + 2.35,
        mine.z,
        JUICE_VFX.MINE_DETONATION,
        11.4,
        1.02,
        { intensity: this.settings.get("reduceFlash") ? 0.28 : 1 }
      );
    }
    this.rings.burst(mine.x, water.height, mine.z, 0xff4f75, 1.05, 0.82);
    this.rings.burst(mine.x, water.height + 0.02, mine.z, 0xffd84c, 1.78, 1.02);
    this.rings.burst(mine.x, water.height + 0.04, mine.z, 0xb7fbff, 2.72, 1.24);
    this.particles.emitBurst(this.visualRng, { x: mine.x, y: water.height + 0.42, z: mine.z }, 0xffffff, 78, {
      speed: 3.8, upward: 6.2, sizeMax: 1.18, gravity: 7.0
    });
    this.particles.emitBurst(this.visualRng, { x: mine.x, y: water.height + 0.36, z: mine.z }, 0x59efff, 54, {
      speed: 4.7, upward: 4.4, sizeMax: 0.88, gravity: 5.8
    });
    // Le barik ne se contente pas de sauter : il répand du rhum en feu.
    if (mine.kind === "barik") this.spawnSlick?.(mine.owner, mine.x, mine.z);
    const victims = this.spatial.queryCircle(mine.x, mine.z, BALANCE.mine.aoeRadius, this.spatialScratch).filter((boat) => !boat.eliminated && boat !== mine.owner);
    for (const boat of victims) {
      const dx = boat.x - mine.x;
      const dz = boat.z - mine.z;
      const distance = Math.max(0.5, Math.hypot(dx, dz));
      const kind = mine.kind ?? "mine";
      const rayon = kind === "barik" ? BALANCE.barik.aoeRadius : kind === "chadron" ? BALANCE.chadron.aoeRadius : BALANCE.mine.aoeRadius;
      const attenuation = clamp(1 - distance / rayon, 0.08, 1);
      const nx = dx / distance;
      const nz = dz / distance;
      const localSide = Math.sign(nx * Math.cos(boat.dynamics.heading) - nz * Math.sin(boat.dynamics.heading)) || 1;
      boat.applyHit(mine.owner, weaponHit({
        // Presque le chavirage : le seuil de bascule est à 0,34 rad et le
        // chavirage à ~1,15. À bout portant la mine envoie 2,1 rad/s de roulis
        // (×1,35 de biais = 2,84) — on ne s'en sort qu'en contre-gîtant.
        rollImpulse: localSide * (0.55 + attenuation * 1.55),
        pitchImpulse: attenuation * 0.18,
        yawImpulse: localSide * attenuation * 0.22,
        impulseX: nx * (0.9 + attenuation * 2.8),
        impulseZ: nz * (0.9 + attenuation * 2.8),
        // BARIK : le feu ravage la coque et casse l'erre, mais n'embarque pas
        // d'eau. CHADRON : les epines percent — peu d'impulsion, mais de l'eau
        // dans un compartiment REEL et du bois casse durable.
        slow: kind === "barik" ? 0.22 + attenuation * 0.38 : 0.08 + attenuation * 0.22,
        waterKg: kind === "barik" ? 0 : kind === "chadron" ? 18 + attenuation * 30 : 10 + attenuation * 52,
        // Le point d'entree de l'eau compte : addWater sans coordonnees envoie
        // tout dans le meme compartiment, plafonne a 95 kg, et le couple de
        // gite parasite disparait.
        hitLocalX: nx * (kind === "chadron" ? 1 : 0.6),
        hitLocalZ: nz * (kind === "chadron" ? 2.4 : 1),
        cohesionDamage: 0.06 + attenuation * 0.16,
        hitLateral: localSide,
        hitLongitudinal: Math.sign(dz || 1) * 0.45,
        crewImpulse: 0.32 + attenuation * 0.80,
        structure: {
          // ⚠️ La MINE arrache 30 % de coque à bout portant (0,417 × 0,72 de
          // biais = 0,30). Avant : 4,5 %, soit une explosion qui ne se voyait
          // que dans les particules. Le barik, arme du poursuivi, monte à 22 %.
          hull: kind === "barik" ? attenuation * 0.305 : kind === "chadron" ? attenuation * 0.055 : attenuation * 0.417,
          bwaIndex: this.gameRng.int(0, 3),
          bwa: kind === "chadron" ? attenuation * 0.16 : attenuation * 0.07
        }
      }));
    }
    const mineNear = this.proximity(mine.x, mine.z, BALANCE.mine.aoeRadius * 1.8);
    this.audio.playImpact?.(mine.kind === "barik" ? "barik" : mine.kind === "chadron" ? "chadron" : "mine", {
      intensity: 0.62 + mineNear * 0.62,
      pan: this.panFor(mine.x)
    });
    if (mine.kind === "mine" && (target?.isPlayer || mine.owner?.isPlayer || mineNear > 0.5)) {
      this.haptic?.("mineImpact");
    }
    this.shake += 0.50 + mineNear * 0.18;
    this.postFX.pulse(0.94 + mineNear * 0.18);
    if (mineNear > 0.03) {
      const player = this.boats[0];
      this.impact.trigger(mine.kind === "mine" ? "mine" : "blast", {
        dirX: player.x - mine.x,
        dirZ: player.z - mine.z,
        intensity: clamp(0.4 + mineNear, 0.4, 1.5)
      });
    }
    if (target?.isPlayer || mine.owner?.isPlayer) this.showMessage("🌊🌊 TSUNAMI CIRCULAIRE !", 0.72);
    mine.active = false;
    mine.mesh.visible = false;
    this.telemetry.track("mine_wave_hit", { owner: mine.owner?.id ?? -1, target: target?.id ?? -1, victims: victims.length }, this.time);
  },

  updateWeapons(dt) {
    for (const projectile of this.waveProjectiles) {
      if (!projectile.active) continue;
      projectile.life -= dt;
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      projectile.z += projectile.vz * dt;
      // Le poisson vole : il ne tombe presque pas, et il vire vers sa cible.
      if (projectile.kind === "pwason") {
        this.steerPwason(projectile, dt);
        // ⚠️ Cette branche ne mettait AUCUNE gravité : la ligne `else` en était
        // le seul porteur. Le pwason volait donc à altitude constante. Sans
        // cette ligne, la cloche n'existe pas.
        projectile.vy -= BALANCE.pwason.gravity * dt;
      } else projectile.vy -= BALANCE.coconut.gravity * dt;
      const water = this.waveField.sample(projectile.x, projectile.z, this.time, this.waterScratch);
      projectile.mesh.position.set(projectile.x, projectile.y, projectile.z);
      projectile.mesh.rotation.x += projectile.spin * dt;
      projectile.mesh.rotation.z += projectile.spin * dt * 0.72;
      projectile.mesh.scale.setScalar(0.92 + Math.sin(this.time * 19) * 0.08);
      projectile.vfxTrailTimer = (projectile.vfxTrailTimer ?? 0) - dt;
      if (projectile.vfxTrailTimer <= 0) {
        const pwason = projectile.kind === "pwason";
        this.spellVfx?.spawn(
          projectile.x,
          projectile.y,
          projectile.z,
          pwason ? SPELL_VFX.PWASON_TRAIL : SPELL_VFX.COCO_TRAIL,
          pwason ? 2.7 : 2.4,
          pwason ? 0.44 : 0.36,
          { rotation: this.vfxScreenRotation(projectile.vx, projectile.vz) }
        );
        projectile.vfxTrailTimer = pwason ? PWASON_TRAIL_INTERVAL : COCO_TRAIL_INTERVAL;
      }
      let hit = false;
      const projectileBalance = projectile.kind === "pwason" ? BALANCE.pwason : BALANCE.coconut;
      const projectileCandidates = this.spatial.queryCircle(projectile.x, projectile.z, projectileBalance.triggerRadius, this.spatialScratch);
      for (const boat of projectileCandidates) {
        if (boat === projectile.owner || boat.eliminated) continue;
        if (pointCapsuleDistanceSquared(projectile.x, projectile.z, boat, this.projectileCollisionScratch || (this.projectileCollisionScratch = {})) < projectileBalance.capsuleHit) {
          this.impactWave(projectile, boat);
          hit = true;
          break;
        }
      }
      if (!hit && projectile.y <= water.height + 0.12) { this.impactWave(projectile, null); hit = true; }
      if (hit || projectile.life <= 0) {
        projectile.active = false;
        projectile.mesh.visible = false;
      }
    }

    for (const mine of this.mines) {
      if (!mine.active) continue;
      const wasArming = mine.arm > 0;
      mine.arm -= dt;
      mine.life -= dt;
      const water = this.waveField.sample(mine.x, mine.z, this.time, this.waterScratch);
      mine.mesh.position.y = water.height + 0.44;
      mine.mesh.rotation.y += dt * 1.5;
      if (mine.kind === "mine" && !mine.vfxArmed && wasArming && mine.arm <= 0) {
        mine.vfxArmed = true;
        this.spellVfx?.spawn(mine.x, mine.mesh.position.y + 0.5, mine.z, SPELL_VFX.MINE_ARMED, 2.2, 0.62);
      }
      if (mine.arm <= 0) {
        // ⚠️ LE RAYON DU KIND, PAS CELUI DE LA MINE. Cette boucle interrogeait
        // `BALANCE.mine.triggerRadius` pour les TROIS pièges : les valeurs
        // propres au chadron (3,1) et au barik (4,6) étaient donc des
        // constantes mortes, définies et jamais lues. Les trois armes se
        // déclenchaient sur le même rayon, ce qui effaçait leur identité.
        const reglage = BALANCE[mine.kind] ?? BALANCE.mine;
        const rayon = reglage.triggerRadius ?? BALANCE.mine.triggerRadius;
        const capsule = reglage.capsuleHit ?? BALANCE.mine.capsuleHit;
        const mineCandidates = this.spatial.queryCircle(mine.x, mine.z, rayon, this.spatialScratch);
        for (const boat of mineCandidates) {
          if (boat === mine.owner || boat.eliminated) continue;
          if (pointCapsuleDistanceSquared(mine.x, mine.z, boat, this.mineCollisionScratch || (this.mineCollisionScratch = {})) < capsule) {
            this.explodeMine(mine, boat);
            break;
          }
        }
      }
      if (mine.life <= 0) {
        mine.active = false;
        mine.mesh.visible = false;
      }
    }

    // Le rhum protège cinq secondes. Des impulsions espacées suivent la yole
    // pendant toute la fenêtre sans remplir le pool à chaque frame.
    for (const boat of this.boats) {
      if (boat.eliminated || (boat.dynamics.rhum ?? 0) <= 0) {
        boat.rhumVfxTimer = 0;
        continue;
      }
      boat.rhumVfxTimer = (boat.rhumVfxTimer ?? 0) - dt;
      if (boat.rhumVfxTimer > 0) continue;
      const water = this.waveField.sample(boat.x, boat.z, this.time, this.waterScratch);
      this.spellVfx?.spawn(boat.x, water.height + 1.6, boat.z, SPELL_VFX.RHUM_AURA, 5.4, 0.92);
      boat.rhumVfxTimer = RHUM_AURA_REFRESH_INTERVAL;
    }

    for (const grapple of this.grapples) {
      if (!grapple.active) continue;
      grapple.life -= dt;
      const owner = grapple.owner;
      const target = grapple.target;
      if (!owner || !target || owner.eliminated || target.eliminated) grapple.life = 0;
      if (grapple.life <= 0) {
        this.cutGrapple(grapple, "expired");
        continue;
      }

      const grappleBalance = BALANCE.grapple;
      const dx = target.x - owner.x;
      const dz = target.z - owner.z;
      const distance = Math.hypot(dx, dz);
      if (distance > grappleBalance.maxDistance) {
        this.cutGrapple(grapple, "range");
        continue;
      }
      const tension = clamp((distance - grapple.restLength) / grappleBalance.tensionSpan, 0, 1);
      grapple.tension = tension;
      const overload = clamp(
        (tension - grappleBalance.stressThreshold) / Math.max(0.001, 1 - grappleBalance.stressThreshold),
        0,
        1
      );
      grapple.stress = Math.max(
        0,
        grapple.stress + (overload > 0
          ? dt * (grappleBalance.stressBuildup + overload * grappleBalance.stressPeak)
          : -dt * grappleBalance.stressRecovery)
      );
      if (grapple.stress > grappleBalance.stressLimit) {
        this.cutGrapple(grapple, "overload");
        if (owner.isPlayer || target.isPlayer) this.showMessage("🪝 CÂBLE ROMPU", 0.45);
        continue;
      }
      if (distance > 0.01) {
        const nx = dx / distance;
        const nz = dz / distance;
        const pull = tension * grappleBalance.pull;
        const tangentX = -nz;
        const tangentZ = nx;
        const swingSide = Math.sign(owner.steer || owner.x - target.x || 1) || 1;
        owner.dynamics.vx += (nx * pull * grappleBalance.pullOwner + tangentX * swingSide * tension * grappleBalance.swingForce) * dt;
        owner.dynamics.vz += (nz * pull * grappleBalance.pullOwner + tangentZ * swingSide * tension * grappleBalance.swingForce) * dt;
        target.dynamics.vx -= nx * pull * grappleBalance.pullTarget * dt;
        target.dynamics.vz -= nz * pull * grappleBalance.pullTarget * dt;
        const anchorDrag = Math.max(0.986, 1 - tension * dt * grappleBalance.targetAnchorDrag);
        target.dynamics.vx *= anchorDrag;
        target.dynamics.vz *= anchorDrag;
        target.dynamics.rollVel += Math.sign(nx * Math.cos(target.dynamics.heading) - nz * Math.sin(target.dynamics.heading)) * tension * dt * grappleBalance.rollForce;
        grapple.swing = clamp(grapple.swing + tension * dt * 0.9, 0, 1.4);

        grapple.damageTimer = Math.max(0, grapple.damageTimer - dt);
        if (tension >= grappleBalance.tensionDamageThreshold && grapple.damageTimer <= 0) {
          const load = clamp(
            (tension - grappleBalance.tensionDamageThreshold) / Math.max(0.001, 1 - grappleBalance.tensionDamageThreshold),
            0,
            1
          );
          const tensionSide = Math.sign(
            nx * Math.cos(target.dynamics.heading) - nz * Math.sin(target.dynamics.heading)
          ) || 1;
          target.applyHit(owner, {
            rollImpulse: tensionSide * grappleBalance.tensionRoll * (0.45 + load * 0.55),
            cohesionDamage: grappleBalance.tensionCohesion * (0.55 + load * 0.45),
            slow: 0.008 + load * 0.012,
            hitLateral: tensionSide,
            crewImpulse: 0.12 + load * 0.16,
            structure: { sail: grappleBalance.tensionSail * (0.5 + load * 0.5) }
          });
          grapple.damageTimer = grappleBalance.tensionDamageInterval;
        }

        grapple.vfxTimer = Math.max(0, grapple.vfxTimer - dt);
        if (tension > 0.34 && grapple.vfxTimer <= 0) {
          this.spellVfx?.spawn(
            (owner.x + target.x) * 0.5,
            (owner.y + target.y) * 0.5 + 1.0,
            (owner.z + target.z) * 0.5,
            SPELL_VFX.HARPOON_TETHER,
            3.2 + tension * 2.0,
            0.46,
            { rotation: this.vfxScreenRotation(dx, dz) }
          );
          grapple.vfxTimer = grappleBalance.vfxInterval;
        }

        if (tension >= grappleBalance.slingshotCharge) grapple.slingshotReady = true;
        const forward = owner.forward(this.slingshotForwardScratch || (this.slingshotForwardScratch = { x: 0, z: 1 }));
        const passedAnchor = (owner.x - target.x) * forward.x + (owner.z - target.z) * forward.z;
        if (grapple.slingshotReady && passedAnchor > grappleBalance.slingshotLead && tension > grappleBalance.slingshotTension) {
          let slingX = forward.x + tangentX * swingSide * grappleBalance.slingshotSide;
          let slingZ = forward.z + tangentZ * swingSide * grappleBalance.slingshotSide;
          const slingLength = Math.hypot(slingX, slingZ) || 1;
          slingX /= slingLength;
          slingZ /= slingLength;
          const slingStrength = clamp(0.82 + tension * 0.52 + grapple.swing * 0.28, 0.85, 1.5);
          owner.dynamics.triggerSlingshot(slingX, slingZ, slingStrength);
          this.spellVfx?.spawn(owner.x, owner.y + 1.0, owner.z, SPELL_VFX.HARPOON_TETHER, 4.4, 0.55, {
            rotation: this.vfxScreenRotation(slingX, slingZ)
          });
          if (owner.isPlayer) {
            this.stats.slingshots++;
            this.showMessage("🕸⚡ SLINGSHOT DÉPASSEMENT !", 0.65);
            this.postFX.pulse(0.68);
            this.impact.trigger("slam", { dirX: slingX, dirZ: slingZ, intensity: 0.82 });
          }
          this.telemetry.track("harpoon_slingshot", { owner: owner.id, target: target.id, tension, strength: slingStrength }, this.time);
          this.cutGrapple(grapple, "slingshot");
          continue;
        }
      }

      grapple.start.x = owner.x;
      grapple.start.y = owner.y + 0.72;
      grapple.start.z = owner.z;
      grapple.end.x = target.x;
      grapple.end.y = target.y + 0.62;
      grapple.end.z = target.z;
      const wind = this.atmosphere.weather.windVector(this.grappleWindScratch || (this.grappleWindScratch = { x: 0, z: 0 }));
      grapple.rope.step(dt, grapple.start, grapple.end, {
        damping: 0.988,
        gravity: 4.8,
        windX: wind.x,
        windZ: wind.z,
        iterations: this.qualityProfile?.ropeIterations ?? 4,
        maxStretch: 1.06
      });
      const attribute = grapple.line.geometry.attributes.position;
      grapple.rope.writePositions(attribute.array);
      attribute.needsUpdate = true;
      grapple.line.material.opacity = 0.44 + tension * 0.56;
      grapple.line.material.color?.setHex(
        tension > 0.78 ? 0xff6138 : tension > 0.42 ? 0xffbd39 : 0x63efff
      );
    }

  }
};
