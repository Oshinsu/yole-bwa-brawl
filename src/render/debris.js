import { clamp } from "../core/math.js";
import { CREW_SKINS, CrewVisual, makeHeadKits } from "./yole-visual.js";

// Scratch partagé entre les deux pools : les appels à sample() sont séquentiels.
const waterScratch = {};

/** Pooled visible wood/sail fragments. No runtime mesh allocation. */
export class DebrisPool {
  constructor(THREE, scene, max = 72) {
    this.THREE = THREE;
    this.scene = scene;
    this.max = max;
    this.items = [];
    this.cursor = 0;
    const geometries = [
      new THREE.BoxGeometry(0.10, 0.08, 0.72),
      new THREE.BoxGeometry(0.20, 0.035, 0.36),
      new THREE.BoxGeometry(0.08, 0.08, 0.28)
    ];
    this.materials = [
      new THREE.MeshStandardMaterial({ color: 0xc78339, roughness: 0.78 }),
      new THREE.MeshStandardMaterial({ color: 0xf2f7f0, roughness: 0.74 }),
      new THREE.MeshStandardMaterial({ color: 0x17313d, roughness: 0.70 })
    ];
    for (let index = 0; index < max; index++) {
      const mesh = new THREE.Mesh(geometries[index % geometries.length], this.materials[index % this.materials.length]);
      mesh.visible = false;
      mesh.castShadow = index < 24;
      scene.add(mesh);
      this.items.push({
        mesh,
        active: false,
        life: 0,
        maxLife: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        rx: 0,
        ry: 0,
        rz: 0,
        drag: 0.15,
        bounced: false
      });
    }
  }

  clear() {
    this.cursor = 0;
    for (const item of this.items) {
      item.active = false;
      item.life = 0;
      item.mesh.visible = false;
      item.mesh.scale.setScalar(1);
    }
  }

  allocate() {
    const item = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.items.length;
    item.active = true;
    item.mesh.visible = true;
    item.bounced = false;
    return item;
  }

  spawnBurst(rng, position, count = 10, options = {}) {
    const speed = options.speed ?? 4.2;
    const upward = options.upward ?? 4.6;
    const scale = options.scale ?? 1;
    const typeOffset = options.typeOffset ?? 0;
    for (let index = 0; index < count; index++) {
      const item = this.allocate();
      const angle = rng.next() * Math.PI * 2;
      const radial = rng.range(0.25, 1) * speed;
      item.mesh.position.set(position.x + rng.signed() * 0.35, position.y + rng.range(0, 0.5), position.z + rng.signed() * 0.35);
      item.mesh.rotation.set(rng.next() * Math.PI, rng.next() * Math.PI, rng.next() * Math.PI);
      item.mesh.scale.setScalar(rng.range(0.5, 1.25) * scale);
      item.mesh.material = this.materials[(index + typeOffset) % this.materials.length];
      item.vx = Math.cos(angle) * radial;
      item.vy = rng.range(0.35, 1.0) * upward;
      item.vz = Math.sin(angle) * radial;
      item.rx = rng.signed() * 7;
      item.ry = rng.signed() * 8;
      item.rz = rng.signed() * 6;
      item.life = item.maxLife = rng.range(1.0, 2.6);
      item.drag = rng.range(0.12, 0.32);
    }
  }

  update(dt, waveField, time, onSplash) {
    for (const item of this.items) {
      if (!item.active) continue;
      item.life -= dt;
      if (item.life <= 0) {
        item.active = false;
        item.mesh.visible = false;
        continue;
      }
      const drag = Math.exp(-item.drag * dt);
      item.vx *= drag;
      item.vz *= drag;
      item.vy -= 8.9 * dt;
      item.mesh.position.x += item.vx * dt;
      item.mesh.position.y += item.vy * dt;
      item.mesh.position.z += item.vz * dt;
      item.mesh.rotation.x += item.rx * dt;
      item.mesh.rotation.y += item.ry * dt;
      item.mesh.rotation.z += item.rz * dt;
      const water = waveField.sample(item.mesh.position.x, item.mesh.position.z, time, waterScratch);
      if (!item.bounced && item.mesh.position.y < water.height + 0.05) {
        item.bounced = true;
        item.mesh.position.y = water.height + 0.05;
        item.vy = Math.abs(item.vy) * 0.24;
        item.vx *= 0.45;
        item.vz *= 0.45;
        item.life = Math.min(item.life, 0.85);
        onSplash?.(item.mesh.position);
      }
      const fade = clamp(item.life / item.maxLife, 0, 1);
      item.mesh.scale.multiplyScalar(1 - dt * (1 - fade) * 0.18);
    }
  }
}

/**
 * Un homme à l'eau, construit avec le MÊME corps que ceux restés à bord.
 *
 * ⚠️ Avant, ce fichier fabriquait son propre mannequin : torse en cylindre
 * (0,11/0,15/0,42) contre (0,12/0,17/0,46) à bord, tête de 0,12 contre 0,135,
 * quatre membres plantés en dur sans pivot, et surtout AUCUNE coiffe alors que
 * les six yoleurs en portent une. Les noyés étaient donc visiblement d'autres
 * personnages.
 *
 * On instancie maintenant un vrai `CrewVisual` sans rig — il bâtit le corps
 * procédural de bord — et on lui pose une coiffe. On n'appelle jamais son
 * `update()` : la pose de nage est écrite directement sur ses pivots.
 */
// Noyade, en trois temps. C'est la seule séquence du jeu où l'on a le droit
// d'être ridicule, et elle dure assez longtemps pour être vue (5,2 s).
const NOYADE_PANIQUE = 1.9;   // secondes de barbotage frénétique
const NOYADE_ADIEU = 1.15;    // secondes de bras levés avant de couler

function createCrewDummy(THREE, jerseyColor = 0xff7b24, index = 0, kits = null) {
  const visual = new CrewVisual(
    THREE,
    CREW_SKINS[index % CREW_SKINS.length],
    jerseyColor,
    0x0d2531,
    index * 0.41
  );
  if (kits) visual.addHeadgear(THREE, visual.head, kits[index % kits.length]);
  // Bras écartés, jambes repliées : une silhouette de nageur, pas la posture de
  // rappel d'un homme accroché à sa perche.
  visual.leftArmPivot.rotation.x = -1.15;
  visual.rightArmPivot.rotation.x = -1.28;
  visual.leftArmPivot.rotation.z = -0.85;
  visual.rightArmPivot.rotation.z = 0.85;
  visual.leftLegPivot.rotation.x = 0.62;
  visual.rightLegPivot.rotation.x = 0.48;
  visual.root.scale.setScalar(0.88);
  return visual;
}


/** Tiny pooled ragdoll-like visual for a crew member thrown into the sea. */
export class CrewFallPool {
  constructor(THREE, scene, colors, max = 14) {
    this.items = [];
    this.cursor = 0;
    // Les coiffes sont construites UNE fois et partagées : c'est ce que fait
    // déjà YoleVisual, et cloner 26 chapeaux ne coûterait que des draw calls.
    const kits = makeHeadKits(THREE);
    for (let index = 0; index < max; index++) {
      // ⚠️ On garde le CrewVisual entier, pas seulement sa racine : ce sont ses
      // pivots (bras, jambes, bassin) qui portent l'animation de noyade.
      const visual = createCrewDummy(THREE, colors[index % colors.length], index, kits);
      const root = visual.root;
      root.visible = false;
      scene.add(root);
      this.items.push({ root, visual, active: false, life: 0, vx: 0, vy: 0, vz: 0,
                        rx: 0, rz: 0, splashed: false, nage: index * 0.7 });
    }
  }

  clear() {
    this.cursor = 0;
    for (const item of this.items) {
      item.active = false;
      item.life = 0;
      item.root.visible = false;
      item.root.scale.setScalar(0.9);
    }
  }

  spawn(rng, position, velocity, side = 1) {
    const item = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.items.length;
    item.active = true;
    item.root.visible = true;
    item.root.position.copy(position);
    item.root.rotation.set(rng.signed() * 0.3, rng.next() * Math.PI, rng.signed() * 0.3);
    item.vx = velocity.x + side * rng.range(2.4, 4.8);
    item.vy = rng.range(3.8, 6.4);
    item.vz = velocity.z + rng.signed() * 1.8;
    item.rx = rng.signed() * 5.5;
    item.rz = rng.signed() * 7;
    item.life = 2.5;
    item.splashed = false;
  }

  update(dt, waveField, time, onSplash) {
    for (const item of this.items) {
      if (!item.active) continue;
      item.life -= dt;
      if (item.life <= 0) {
        item.active = false;
        item.root.visible = false;
        continue;
      }
      // Vol balistique tant qu'il n'a pas touché l'eau ; une fois à la flotte
      // c'est la branche de barbotage plus bas qui pilote sa position.
      if (!item.splashed) {
        item.vy -= 9.5 * dt;
        item.root.position.x += item.vx * dt;
        item.root.position.y += item.vy * dt;
        item.root.position.z += item.vz * dt;
        item.root.rotation.x += item.rx * dt;
        item.root.rotation.z += item.rz * dt;
      }
      const water = waveField.sample(item.root.position.x, item.root.position.z, time, waterScratch);
      if (!item.splashed && item.root.position.y <= water.height + 0.12) {
        item.splashed = true;
        item.root.position.y = water.height + 0.05;
        item.vy = 0;
        item.vx *= 0.28;
        item.vz *= 0.28;
        // Un homme à l'eau ne s'évapore pas : il barbote. On le laissait vivre
        // 0,85 s en rétrécissant de 65 %/s, donc le chavirage se soldait par
        // trois figurants qui disparaissaient avant qu'on les ait vus.
        item.life = Math.max(item.life, 5.2);
        item.bob = 0;
        onSplash?.(item.root.position);
      }
      // ── LA NOYADE, EN TROIS TEMPS ───────────────────────────────────────
      // 1. EN L'AIR : bras en moulinet, jambes qui pédalent dans le vide.
      // 2. À L'EAU : barbotage frénétique, tête qui plonge et ressort.
      // 3. LA FIN : les deux bras se lèvent bien droits et il descend tout
      //    droit, à la verticale, comme dans un dessin animé.
      const v = item.visual;
      if (v) {
        item.nage += dt * (item.splashed ? 9.5 : 15.5);
        const restant = item.life;
        if (!item.splashed) {
          // Moulinet : les deux bras tournent en opposition, à fond.
          v.leftArmPivot.rotation.x = Math.sin(item.nage) * 2.6 - 0.6;
          v.rightArmPivot.rotation.x = Math.sin(item.nage + Math.PI) * 2.6 - 0.6;
          v.leftLegPivot.rotation.x = Math.sin(item.nage * 1.3 + 1.1) * 1.15;
          v.rightLegPivot.rotation.x = Math.sin(item.nage * 1.3 + 1.1 + Math.PI) * 1.15;
        } else if (restant > NOYADE_ADIEU) {
          const panique = Math.min(1, (restant - NOYADE_ADIEU) / NOYADE_PANIQUE);
          // Brasse ratée : les bras battent l'eau devant, en désordre.
          v.leftArmPivot.rotation.x = -1.5 + Math.sin(item.nage) * 1.25 * panique;
          v.rightArmPivot.rotation.x = -1.5 + Math.sin(item.nage + 2.1) * 1.25 * panique;
          v.leftArmPivot.rotation.z = -0.9 - Math.sin(item.nage * 0.8) * 0.35;
          v.rightArmPivot.rotation.z = 0.9 + Math.sin(item.nage * 0.8) * 0.35;
          v.leftLegPivot.rotation.x = Math.sin(item.nage * 1.6) * 0.8;
          v.rightLegPivot.rotation.x = Math.sin(item.nage * 1.6 + Math.PI) * 0.8;
          // La tête pique et ressort : il boit la tasse.
          if (v.head) v.head.rotation.x = Math.sin(item.nage * 0.9) * 0.5;
        } else {
          // Les deux bras au ciel, immobiles. Il abandonne.
          const adieu = 1 - Math.max(0, restant / NOYADE_ADIEU);
          v.leftArmPivot.rotation.x += (-2.95 - v.leftArmPivot.rotation.x) * Math.min(1, dt * 7);
          v.rightArmPivot.rotation.x += (-2.95 - v.rightArmPivot.rotation.x) * Math.min(1, dt * 7);
          v.leftArmPivot.rotation.z += (-0.14 - v.leftArmPivot.rotation.z) * Math.min(1, dt * 7);
          v.rightArmPivot.rotation.z += (0.14 - v.rightArmPivot.rotation.z) * Math.min(1, dt * 7);
          v.leftLegPivot.rotation.x += (0.1 - v.leftLegPivot.rotation.x) * Math.min(1, dt * 5);
          v.rightLegPivot.rotation.x += (-0.1 - v.rightLegPivot.rotation.x) * Math.min(1, dt * 5);
          // Il se redresse à la verticale pour couler bien droit — c'est ce
          // détail qui rend la chose drôle plutôt que macabre.
          item.root.rotation.x += (0 - item.root.rotation.x) * Math.min(1, dt * 6);
          item.root.rotation.z += (0 - item.root.rotation.z) * Math.min(1, dt * 6);
          item.sombre = adieu;
        }
      }

      if (item.splashed) {
        // Il flotte sur la houle, tourne sur lui-même et coule doucement des
        // épaules — pas de chute libre, plus de rétrécissement.
        item.bob += dt;
        item.root.position.y = water.height + 0.05 - Math.min(0.34, item.bob * 0.055) + Math.sin(time * 2.4 + item.root.position.x) * 0.04;
        // Pendant la panique il est à plat ventre ; la phase d'adieu le
        // redresse (voir plus haut), donc on n'impose plus le couché de force.
        if (item.life > NOYADE_ADIEU) item.root.rotation.x += (0.9 - item.root.rotation.x) * Math.min(1, dt * 1.6);
        item.root.rotation.y += dt * 0.7;
        item.root.rotation.z *= 1 - Math.min(1, dt * 2.2);
        item.vx *= 1 - Math.min(1, dt * 1.1);
        item.vz *= 1 - Math.min(1, dt * 1.1);
        item.root.position.x += item.vx * dt;
        item.root.position.z += item.vz * dt;
        // ⚠️ Il DESCEND, il ne rétrécit pas. Le rétrécissement le faisait
        // disparaître sur place comme un bug d'affichage ; couler à la
        // verticale, bras au ciel, se lit comme une noyade — et c'est le gag.
        if (item.life < NOYADE_ADIEU) {
          item.root.position.y -= dt * 1.65;
        }
      }
    }
  }
}
