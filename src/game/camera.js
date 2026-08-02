// Caméra : suivi de course et survol du menu.
//
// La pose lissée est tenue à part des offsets d'impact — les réinjecter dans
// le lissage les ferait s'intégrer au lieu de rester transitoires.

import { clamp, damp } from "../core/math.js";
import { routeCenter } from "../render/world.js";
import {
  HANDLING_MOTION,
  prefersReducedMotion,
  sampleHandlingMotion
} from "../render/handling-motion.js?v=swell-v2";
import { versusCameraFrame } from "./versus.js";

// Secondes pendant lesquelles la caméra reste sur NOTRE épave après
// l'élimination, avant de basculer sur un autre bateau.
//
// ⚠️ Ce compteur avance en temps RÉEL (`updateCamera` est appelée avec `raw`,
// game.js:1155), pas en temps de simulation. Il ne peut donc pas faire diverger
// un replay — c'est la même règle que `lookBack`, qui n'est pas non plus
// enregistré par `recordInput`.
//
// 3,6 s : assez pour voir la coque se coucher et la détonation retomber. La
// caméra suit ensuite une yole encore en course jusqu'à la fin de la manche.
const DEATH_CAM_SECONDS = 3.6;

// ── TREMBLEMENT D'ÉQUILIBRE ────────────────────────────────────────────────
// La gîte devient dangereuse bien avant de chavirer, mais RIEN ne le disait à
// l'image : seule la jauge changeait de couleur, et on ne regarde pas la jauge
// quand on barre. La caméra tremble donc à mesure qu'on approche du point de
// non-retour — l'information passe par le corps, pas par la lecture.
//
// Bornes : 0,62 rad, là où le rappel commence à ne plus suffire ; 1,16 rad, le
// seuil exact de `capsizeTimer` dans yole-physics.js. Au-delà, on est déjà en
// train de chavirer et le tremblement n'apporte plus rien.
const TREMBLE_START = 0.62;
const TREMBLE_END = 1.16;
const TREMBLE_AMPLITUDE = 0.30;

const MENU_HERO_Z = 20;
// L'atelier est une CALE SÈCHE, pas une seconde vue de course. La coque du GLB
// descend jusqu'à environ -0,62 m sous son origine : à la hauteur de flottaison
// du menu (+0,46 m), elle reste donc en grande partie derrière l'océan. On
// dégage ici toute la quille et on neutralise la gîte de course.
const WORKSHOP_DRY_CLEARANCE = 1.12;
const WORKSHOP_DISPLAY_ROLL = -0.035;
const WORKSHOP_DISPLAY_PITCH = 0.015;
const WORKSHOP_DISPLAY_CREW_SHIFT = 0.22;
const WORKSHOP_WIDE_STAGE_BIAS = 1.55;
const WORKSHOP_TARGET_LIFT = Object.freeze({
  paint: 0.28,
  sail: 3.05,
  wood: 0.42,
  crew: 1.12,
  rig: 2.05,
  loadout: 0.58
});
const WORKSHOP_DISTANCE_SCALE = Object.freeze({
  paint: 0.90,
  sail: 1,
  wood: 0.88,
  crew: 0.92,
  rig: 0.98,
  loadout: 0.90
});
const WORKSHOP_ORBIT_DEFAULTS = Object.freeze({
  yaw: -0.48,
  pitch: 0.30,
  distance: 13.8
});

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

export const CameraSystems = {
  resetHandlingCameraFeedback() {
    // ⚠️ Doit être remis à zéro ICI. `handling-render-feedback.test.mjs` exige
    // qu'après un changement de manche la caméra reparte exactement de zéro ;
    // un compteur de mort survivant à la manche garderait le cadrage sur une
    // épave qui n'existe plus.
    this.deathCamTimer = 0;
    this.deathCamWasEliminated = false;
    this.cameraHandlingSlip = 0;
    this.cameraHandlingSurf = 0;
    this.cameraHandlingRecovery = 0;
    // Un reset de manche teleporte deja les yoles sur la ligne. Conserver la
    // pose lissee ferait voyager la camera depuis l'ancien combat, et avec elle
    // la derive de la manche precedente. La prochaine pose est donc copiee.
    this.cameraHandlingHardReset = true;
    this.cameraRollBase = 0;
  },

  prepareHandlingCameraRound() {
    const round = this.round ?? 0;
    if (this.cameraHandlingRound !== round || this.cameraBase === null) {
      this.resetHandlingCameraFeedback();
      this.cameraHandlingRound = round;
    }
  },

  settleHandlingCamera(signedSlip, surf, recovery, dt) {
    // `prefers-reduced-motion` est mis en cache : matchMedia ne doit pas devenir
    // une requete de la boucle de rendu. reduceFlash ne supprime pas la lecture
    // laterale de la derive, mais coupe presque tout le pompage de FOV.
    if (this.cameraReducedMotion === undefined) this.cameraReducedMotion = prefersReducedMotion();
    this.cameraHandlingMotionScale = this.cameraReducedMotion ? 0 : 1;
    this.cameraHandlingFovScale = this.cameraReducedMotion
      ? 0
      : (this.settings?.get?.("reduceFlash") ? 0.18 : 1);

    const catchRate = 5.0 + recovery * 8.5;
    const slipTarget = signedSlip * (1 - recovery * 0.30);
    this.cameraHandlingSlip = damp(this.cameraHandlingSlip ?? 0, slipTarget, catchRate, dt);
    this.cameraHandlingSurf = damp(
      this.cameraHandlingSurf ?? 0,
      surf,
      surf > (this.cameraHandlingSurf ?? 0) ? 3.8 : 2.6,
      dt
    );
    this.cameraHandlingRecovery = damp(
      this.cameraHandlingRecovery ?? 0,
      recovery,
      recovery > (this.cameraHandlingRecovery ?? 0) ? 9.5 : 5.5,
      dt
    );
  },

  updateSoloHandlingCamera(source, dt) {
    const sample = this.cameraHandlingSample || (this.cameraHandlingSample = {});
    sampleHandlingMotion(source, sample);
    this.settleHandlingCamera(sample.signedSlip, sample.surf, sample.recovery, dt);
  },

  updateVersusHandlingCamera(playerOne, playerTwo, dt) {
    const first = this.cameraHandlingSample || (this.cameraHandlingSample = {});
    const second = this.cameraHandlingSampleTwo || (this.cameraHandlingSampleTwo = {});
    sampleHandlingMotion(playerOne, first);
    sampleHandlingMotion(playerTwo, second);
    // Une moyenne signee conserve un cadrage neutre si les deux joueurs glissent
    // en sens opposes. Le surf prend le maximum : c'est un changement de rythme
    // commun, jamais un avantage de cadrage donne arbitrairement a J1 ou J2.
    this.settleHandlingCamera(
      (first.signedSlip + second.signedSlip) * 0.5,
      Math.max(first.surf, second.surf),
      Math.max(first.recovery, second.recovery),
      dt
    );
  },

  updateCamera(dt) {
    const player = this.boats[0];
    let follow = player;

    // ── CAMÉRA DE MORT ────────────────────────────────────────────────────
    // La caméra sautait sur le bateau de tête à l'instant même de
    // l'élimination : on ne voyait jamais sa propre yole chavirer ni exploser.
    // On tient le cadrage sur l'épave quelques secondes.
    //
    // Le front montant est détecté ici plutôt que dans `eliminate` : la caméra
    // reste ainsi maîtresse de son propre état, et rien du côté simulation n'a
    // besoin de connaître l'existence de ce compteur.
    const elimine = Boolean(player.eliminated);
    if (elimine && !this.deathCamWasEliminated) this.deathCamTimer = DEATH_CAM_SECONDS;
    this.deathCamWasEliminated = elimine;
    if (!elimine) this.deathCamTimer = 0;
    else if (this.deathCamTimer > 0) {
      // `dt` peut être énorme au retour d'un onglet en arrière-plan : on le
      // borne, sinon un seul appel consomme toute la séquence.
      this.deathCamTimer = Math.max(0, this.deathCamTimer - Math.min(dt, 0.25));
    }

    if (player.eliminated && this.deathCamTimer <= 0) {
      const alive = this.collectAlive();
      alive.sort((a, b) => b.z - a.z);
      follow = alive[0] || player;
    }
    // ⚠️ La caméra publie QUI elle suit. Sans ça, le HUD devrait refaire le
    // même tri de son côté — deux vérités pour une seule question, et elles
    // finiraient par diverger. Purement informatif : aucune lecture par la
    // simulation.
    this.cameraFollowName = follow === player ? null : (follow?.name ?? null);

    if (this.mode === "menu") {
      if (this.cameraReducedMotion === undefined) this.cameraReducedMotion = prefersReducedMotion();
      const target = this.menuCameraTarget || (this.menuCameraTarget = new this.THREE.Vector3());
      const desired = this.menuCameraDesired || (this.menuCameraDesired = new this.THREE.Vector3());
      const frameDt = Math.min(Math.max(dt, 0), 0.1);

      if (this.workshopActive) {
        const orbit = this.workshopOrbit;
        const controls = orbit && typeof orbit === "object" ? orbit : null;
        const manualYaw = finiteOr(
          controls?.yaw ?? controls?.azimuth ?? (typeof orbit === "number" ? orbit : undefined),
          WORKSHOP_ORBIT_DEFAULTS.yaw
        );
        const pitch = clamp(
          finiteOr(controls?.pitch ?? controls?.elevation, WORKSHOP_ORBIT_DEFAULTS.pitch),
          -0.08,
          0.72
        );
        const distance = clamp(
          finiteOr(controls?.distance ?? controls?.radius, WORKSHOP_ORBIT_DEFAULTS.distance),
          8.5,
          22
        );
        const dragging = Boolean(controls?.dragging ?? this.workshopOrbitDragging);
        if (!this.workshopCameraWasActive) this.workshopAutoOrbit = 0;
        if (!dragging && !this.cameraReducedMotion) {
          this.workshopAutoOrbit = (this.workshopAutoOrbit ?? 0) + frameDt * 0.10;
        }
        this.workshopCameraWasActive = true;

        const yaw = manualYaw + (this.workshopAutoOrbit ?? 0);
        const distanceScale = WORKSHOP_DISTANCE_SCALE[this.workshopTab]
          ?? WORKSHOP_DISTANCE_SCALE.paint;
        const displayDistance = distance * distanceScale;
        const horizontal = displayDistance * Math.cos(pitch);
        // Un atelier automobile cadre la pièce que l'on modifie, pas toujours
        // le véhicule entier. C'est encore plus important en portrait, où la
        // fenêtre centrale n'occupe qu'une partie de la hauteur du canvas.
        const targetLift = WORKSHOP_TARGET_LIFT[this.workshopTab]
          ?? WORKSHOP_TARGET_LIFT.paint;
        // Sur le layout large, les contrôles occupent la droite du canvas. On
        // vise légèrement à tribord de la yole afin de projeter la coque vers le
        // centre de la baie, au lieu de la laisser sous le panneau de finition.
        const stageBias = this.camera.aspect > 1.05 ? WORKSHOP_WIDE_STAGE_BIAS : 0;
        target.set(player.x + stageBias, player.y + targetLift, player.z + 0.20);
        desired.set(
          target.x + Math.cos(yaw) * horizontal,
          target.y + Math.sin(pitch) * displayDistance,
          target.z + Math.sin(yaw) * horizontal
        );
        this.camera.position.lerp(desired, 1 - Math.exp(-7.2 * frameDt));
        this.camera.lookAt(target);
        this.camera.fov = damp(this.camera.fov, 52, 7.5, frameDt);
        this.camera.updateProjectionMatrix();
        this.sun.position.set(player.x - 34, player.y + 62, player.z + 28);
        this.sun.target.position.set(player.x, player.y + 1.2, player.z);
        return;
      }

      if (this.workshopCameraWasActive) {
        this.workshopCameraWasActive = false;
        this.workshopAutoOrbit = 0;
      }
      // Cadrage hero : J1 occupe le tiers droit, là où le menu ne masque pas
      // sa coque, ses bwa ni l'équipage. Le mouvement reste volontairement
      // court ; en mouvement réduit, la pose devient entièrement fixe.
      const t = this.cameraReducedMotion ? 0 : this.time * 0.16;
      const sway = this.cameraReducedMotion ? 0 : Math.sin(t) * 0.75;
      // Le panneau principal occupe un peu plus de la moitié gauche à 16:9.
      // La cible légèrement décalée à tribord garde la yole dans la baie libre
      // entre le panneau de modes et la fiche de configuration.
      target.set(player.x + 1.50, player.y + 1.55, player.z + 0.90);
      desired.set(
        player.x + 13.2 + sway,
        player.y + 5.35 + (this.cameraReducedMotion ? 0 : Math.sin(t * 0.7) * 0.28),
        player.z - 6.6 + (this.cameraReducedMotion ? 0 : Math.cos(t) * 0.85)
      );
      this.camera.position.lerp(desired, 1 - Math.exp(-4.8 * frameDt));
      this.camera.lookAt(target);
      this.camera.fov = damp(this.camera.fov, 54, 5.2, frameDt);
      this.camera.updateProjectionMatrix();
      this.sun.position.set(player.x - 48, player.y + 82, player.z + 42);
      this.sun.target.position.set(player.x, 0, player.z + 10);
      return;
    }

    if (this.versusLocal) {
      const activePilots = this.boats.slice(0, 2).filter((boat) => !boat.eliminated);
      const versusFocus = activePilots.length === 1
        ? activePilots[0]
        : activePilots.length === 0
          ? follow
          : null;
      this.cameraFollowName = versusFocus && versusFocus !== player
        ? (versusFocus.name ?? null)
        : null;
      this.prepareHandlingCameraRound();
      this.updateVersusCamera(dt, follow);
      return;
    }

    this.prepareHandlingCameraRound();
    this.updateSoloHandlingCamera(follow, dt);
    const forward = follow.forward(this.cameraForward || (this.cameraForward = new this.THREE.Vector3()));
    // REGARD ARRIÈRE. Maintenu, la caméra passe devant la yole et regarde vers
    // la poupe : on voit qui arrive, ce qui manquait cruellement quand on mène.
    // Le basculement est amorti, sinon le demi-tour instantané désoriente.
    this.lookBack = damp(this.lookBack ?? 0, this.input?.lookBack ? 1 : 0, 11.0, dt);
    const backSign = 1 - this.lookBack * 2;
    const speedFactor = clamp(follow.speed / 27, 0, 1);
    const handlingMotion = this.cameraHandlingMotionScale;
    const handlingSlip = this.cameraHandlingSlip * handlingMotion;
    const handlingSurf = this.cameraHandlingSurf * handlingMotion;
    const zoom = this.cameraZoom;
    // La yole et ses six équipiers sont l'information principale. L'ancien
    // cadrage reculait jusqu'à plus de 22 m au zoom par défaut : les bwa, la
    // gîte et les transferts de masse devenaient illisibles derrière le HUD.
    // On conserve l'ouverture à haute vitesse, mais depuis une caméra plus
    // proche et plus basse, comme une poursuite nautique et non une vue drone.
    const back = (13.6 + speedFactor * 3.4 + handlingSurf * HANDLING_MOTION.cameraSurfBack * 0.72) * zoom;
    const height = (
      7.6 + speedFactor * 1.55 - handlingSurf * HANDLING_MOTION.cameraSurfHeight * 0.70
    ) * Math.sqrt(zoom);
    const desired = this.cameraDesired || (this.cameraDesired = new this.THREE.Vector3());
    desired.set(
      follow.x - forward.x * back * backSign,
      follow.y + height,
      follow.z - forward.z * back * backSign
    );
    desired.x += forward.z * follow.steer * (1.35 + zoom * 0.25);
    desired.z -= forward.x * follow.steer * (1.35 + zoom * 0.25);
    desired.x += forward.z * handlingSlip * HANDLING_MOTION.cameraSlipOffset;
    desired.z -= forward.x * handlingSlip * HANDLING_MOTION.cameraSlipOffset;
    this.world.constrainCamera(follow.visual.root.position, desired, desired);
    // La pose lissée est tenue à part : secousse et kick d'impact sont des
    // offsets transitoires, les réinjecter dans le lerp les ferait s'intégrer.
    const base = this.cameraBase || (this.cameraBase = this.camera.position.clone());
    if (this.cameraHandlingHardReset) {
      base.copy(desired);
      this.cameraHandlingHardReset = false;
    } else {
      // Un suivi un peu plus posé laisse la coque déplacer le cadre au lieu de
      // recoller instantanément à chaque oscillation de houle.
      base.lerp(desired, 1 - Math.exp(-3.6 * dt));
    }
    this.camera.position.copy(base);
    // ⚠️ Le tremblement s'AJOUTE au `shake` d'impact au lieu de le remplacer :
    // encaisser un coco alors qu'on est déjà sur la tranche doit se cumuler.
    // Il utilise `visualRng`, jamais `gameRng` — c'est du rendu pur.
    const gite = Math.abs(follow?.roll ?? 0);
    const tremble = this.cameraReducedMotion
      ? 0
      : clamp((gite - TREMBLE_START) / (TREMBLE_END - TREMBLE_START), 0, 1) * TREMBLE_AMPLITUDE;
    if (tremble > 0) {
      this.camera.position.x += this.visualRng.signed() * tremble;
      this.camera.position.y += this.visualRng.signed() * tremble * 0.55;
    }
    if (this.shake > 0) {
      this.camera.position.x += this.visualRng.signed() * this.shake * 0.28;
      this.camera.position.y += this.visualRng.signed() * this.shake * 0.16;
    }
    this.impact.applyToCamera(this.camera);
    const look = this.cameraLook || (this.cameraLook = new this.THREE.Vector3());
    // Le point de visée était placé jusqu'à 14 m devant la proue. À grand
    // écran cela semblait dynamique, mais sur un viewport presque carré la
    // coque sortait sous le HUD : impossible de lire la gîte, la houle ou les
    // transferts d'équipage. On garde une anticipation de trajectoire nette,
    // tout en garantissant une vraie silhouette dans le tiers inférieur.
    const lookAhead = 4.8 + speedFactor * 3.6 + (zoom - 1) * 1.8
      + handlingSurf * HANDLING_MOTION.cameraSurfLook * 0.42;
    look.set(
      follow.x + forward.x * lookAhead * backSign,
      follow.y + 0.35,
      follow.z + forward.z * lookAhead * backSign
    );
    look.x += forward.z * handlingSlip * HANDLING_MOTION.cameraSlipLook;
    look.z -= forward.x * handlingSlip * HANDLING_MOTION.cameraSlipLook;
    this.camera.lookAt(look);
    const stabilization = clamp(this.settings.get("cameraRoll"), 0, 1);
    const catchRoll = -handlingSlip * this.cameraHandlingRecovery * 0.032;
    // Même en caméra stabilisée, supprimer presque tout le roulis retirait la
    // preuve visuelle que 450 kg d'équipage retiennent une coque sans quille.
    // La composante basse fréquence reste toujours présente ; le réglage ne
    // retire que l'amplitude supplémentaire et les mouvements de confort.
    const rollWeight = 0.10 + (1 - stabilization) * 0.65;
    const rollVelocity = clamp(follow.dynamics?.rollVel ?? 0, -2.5, 2.5);
    this.cameraRollBase = damp(
      this.cameraRollBase ?? 0,
      -follow.roll * rollWeight - rollVelocity * 0.010 + catchRoll,
      2.8 + this.cameraHandlingRecovery * 1.9,
      dt
    );
    this.cameraFovBase = damp(
      this.cameraFovBase ?? this.camera.fov,
      56.5 + speedFactor * 5.8 - (zoom - 1) * 3.8,
      2.5,
      dt
    );
    // Roulis appliqué en rotation locale sur le quaternion issu de lookAt().
    // Écrire camera.rotation.z relisait un Euler XYZ dégénéré (x ≈ -165°,
    // z ≈ ±π) et recomposait une caméra retournée : la mer passait au-dessus
    // du ciel dès que la caméra plongeait un peu.
    if (this.cameraRollBase) this.camera.rotateZ(this.cameraRollBase);
    this.camera.fov = this.cameraFovBase
      + handlingSurf * HANDLING_MOTION.cameraSurfFov * this.cameraHandlingFovScale;
    this.impact.applyOrientation(this.camera);
    this.camera.updateProjectionMatrix();
    // +48 sur Z (et non -48) : le soleil passe devant la yole. Élévation
    // inchangée — atan(112 / 86,5) = 52,3° avant comme après.
    this.sun.position.set(follow.x - 72, follow.y + 112, follow.z + 48);
    this.sun.target.position.set(follow.x, 0, follow.z + 26);
  },

  updateVersusCamera(dt, fallback = null) {
    const playerOne = this.boats[0];
    const playerTwo = this.boats[1];
    const activePilots = [playerOne, playerTwo].filter((boat) => boat && !boat.eliminated);
    const cameraOne = activePilots[0] ?? fallback ?? playerOne;
    const cameraTwo = activePilots[1] ?? cameraOne;
    this.updateVersusHandlingCamera(cameraOne, cameraTwo, dt);
    const frame = versusCameraFrame(
      cameraOne,
      cameraTwo,
      this.versusCameraFrameScratch || (this.versusCameraFrameScratch = {})
    );
    const forwardX = Math.sin(frame.heading);
    const forwardZ = Math.cos(frame.heading);
    const speedFactor = clamp(Math.max(
      cameraOne?.eliminated ? 0 : (cameraOne?.speed ?? 0),
      cameraTwo?.eliminated ? 0 : (cameraTwo?.speed ?? 0)
    ) / 27, 0, 1);
    const separation = clamp(frame.separation, 0, 78);
    const handlingMotion = this.cameraHandlingMotionScale;
    const handlingSlip = this.cameraHandlingSlip * handlingMotion;
    const handlingSurf = this.cameraHandlingSurf * handlingMotion;
    const zoom = this.cameraZoom;
    // La distance croît avec l'écart réel entre les deux yoles. À proximité,
    // le cadrage conserve la nervosité du solo ; quand elles se séparent, la
    // caméra monte et recule au lieu de choisir arbitrairement un pilote.
    const back = (
      18.5 + speedFactor * 4.0 + separation * 0.43
      + handlingSurf * HANDLING_MOTION.cameraSurfBack * 0.55
    ) * zoom;
    const height = (
      10.4 + speedFactor * 1.8 + separation * 0.25
      - handlingSurf * HANDLING_MOTION.cameraSurfHeight * 0.45
    ) * Math.sqrt(zoom);
    const desired = this.cameraDesired || (this.cameraDesired = new this.THREE.Vector3());
    desired.set(
      frame.x - forwardX * back,
      frame.y + height,
      frame.z - forwardZ * back
    );
    desired.x += forwardZ * handlingSlip * HANDLING_MOTION.cameraSlipOffset * 0.48;
    desired.z -= forwardX * handlingSlip * HANDLING_MOTION.cameraSlipOffset * 0.48;
    const sharedTarget = this.versusCameraTarget || (this.versusCameraTarget = new this.THREE.Vector3());
    sharedTarget.set(frame.x, frame.y + 0.55, frame.z);
    this.world.constrainCamera(sharedTarget, desired, desired);
    const base = this.cameraBase || (this.cameraBase = this.camera.position.clone());
    if (this.cameraHandlingHardReset) {
      base.copy(desired);
      this.cameraHandlingHardReset = false;
    } else {
      base.lerp(desired, 1 - Math.exp(-4.8 * dt));
    }
    this.camera.position.copy(base);
    if (this.shake > 0) {
      this.camera.position.x += this.visualRng.signed() * this.shake * 0.24;
      this.camera.position.y += this.visualRng.signed() * this.shake * 0.14;
    }
    this.impact.applyToCamera(this.camera);
    const look = this.cameraLook || (this.cameraLook = new this.THREE.Vector3());
    const lookAhead = 7 + speedFactor * 5
      + handlingSurf * HANDLING_MOTION.cameraSurfLook * 0.45;
    look.set(frame.x + forwardX * lookAhead, frame.y + 0.75, frame.z + forwardZ * lookAhead);
    look.x += forwardZ * handlingSlip * HANDLING_MOTION.cameraSlipLook * 0.38;
    look.z -= forwardX * handlingSlip * HANDLING_MOTION.cameraSlipLook * 0.38;
    this.camera.lookAt(look);
    // Pas de roulis partagé : un mouvement demandé par J1 ne doit pas rendre la
    // lecture de J2 instable. Les kicks d'impact restent, eux, communs au duel.
    this.cameraRollBase = damp(this.cameraRollBase ?? 0, 0, 7.5, dt);
    if (this.cameraRollBase) this.camera.rotateZ(this.cameraRollBase);
    const targetFov = clamp(
      62 + speedFactor * 5 + Math.max(0, separation - 10) * 0.20 - (zoom - 1) * 3,
      60,
      79
    );
    this.cameraFovBase = damp(this.cameraFovBase ?? this.camera.fov, targetFov, 3.2, dt);
    this.camera.fov = this.cameraFovBase
      + handlingSurf
        * HANDLING_MOTION.cameraSurfFov
        * 0.55
        * this.cameraHandlingFovScale;
    this.impact.applyOrientation(this.camera);
    this.camera.updateProjectionMatrix();
    this.sun.position.set(frame.x - 72, frame.y + 112, frame.z + 48);
    this.sun.target.position.set(frame.x, 0, frame.z + 26);
  },

  updateAttract(dt) {
    if (this.mode !== "menu") return;
    if (this.cameraReducedMotion === undefined) this.cameraReducedMotion = prefersReducedMotion();
    const showroom = Boolean(this.workshopActive);
    for (let index = 0; index < this.boats.length; index++) {
      const boat = this.boats[index];
      if (showroom && index > 0) {
        // Pas seulement `visible=false` : le culling de fin de frame recalcule
        // cette propriété. Une position réellement hors scène reste correcte
        // quel que soit le renderer ou le harnais.
        boat.dynamics.x = 260 + index * 34;
        boat.dynamics.y = -48;
        boat.dynamics.z = -260 - index * 31;
        boat.dynamics.roll = 0;
        boat.dynamics.pitch = 0;
        boat.dynamics.crewShift = 0;
        boat.dynamics.sailPower = 0;
        boat.renderUpdate(this.time, dt, this.atmosphere.weather);
        continue;
      }

      boat.dynamics.z = index === 0 ? MENU_HERO_Z : 34 + (index - 1) * 11;
      boat.dynamics.x = routeCenter(boat.dynamics.z)
        + (index === 0 ? 0 : [-7.5, 5.5, -3.5][index - 1]);
      const water = this.waveField.sample(boat.x, boat.z, this.time, this.waterScratch);
      const workshopDisplay = showroom && index === 0;
      if (workshopDisplay) {
        // Une épave ne doit pas entrer dans l'atelier telle quelle. `sink`,
        // `overboard`, l'eau embarquée et la casse survivent normalement au
        // retour au menu ; le showroom les lisait donc et présentait parfois
        // une coque coulée, vide ou sans mât. Cette remise à neuf est strictement
        // cantonnée au mode menu, avant toute nouvelle simulation.
        boat.dynamics.eliminated = false;
        boat.dynamics.sink = 0;
        boat.dynamics.capsizeTimer = 0;
        boat.dynamics.waterMassKg = 0;
        boat.dynamics.vx = 0;
        boat.dynamics.vy = 0;
        boat.dynamics.vz = 0;
        boat.dynamics.yawRate = 0;
        boat.dynamics.rollVel = 0;
        boat.dynamics.pitchVel = 0;
        boat.dynamics.crewStumble = 0;
        boat.dynamics.activeCrew = 6;
        boat.dynamics.flooding?.fill?.(0);
        boat.dynamics.crewPositions?.fill?.(WORKSHOP_DISPLAY_CREW_SHIFT);
        boat.dynamics.crewTargets?.fill?.(WORKSHOP_DISPLAY_CREW_SHIFT);
        boat.dynamics.crewVelocities?.fill?.(0);
        if (boat.dynamics.structure) {
          boat.dynamics.structure.hull = 1;
          boat.dynamics.structure.mast = 1;
          boat.dynamics.structure.sail = 1;
          boat.dynamics.structure.bwa?.fill?.(1);
        }
        if (boat.visual?.overboard) boat.visual.setOverboard?.(false);
        boat.visual?.setCrewCulled?.(false);
      }
      boat.dynamics.y = water.height + (workshopDisplay ? WORKSHOP_DRY_CLEARANCE : 0.46);
      boat.dynamics.centerWaterHeight = water.height;
      boat.dynamics.lastBowWaterHeight = water.height;
      const breathing = this.cameraReducedMotion ? 0 : Math.sin(this.time * 0.46 + index) * 0.055;
      boat.dynamics.roll = workshopDisplay
        ? WORKSHOP_DISPLAY_ROLL
        : (index === 0 ? -0.21 : (index % 2 ? 0.13 : -0.13))
          - Math.atan(water.slopeX) * 0.18;
      boat.dynamics.pitch = workshopDisplay
        ? WORKSHOP_DISPLAY_PITCH
        : Math.atan(water.slopeZ) * 0.2;
      boat.dynamics.heading = index === 0 ? 0.04 : (index - 2) * 0.035;
      boat.dynamics.crewShift = workshopDisplay
        ? WORKSHOP_DISPLAY_CREW_SHIFT
        : index === 0
          ? 0.76 + breathing
        : (index % 2 ? -0.58 : 0.58) + breathing;
      boat.dynamics.sailPower = workshopDisplay ? 0.72 : index === 0 ? 0.88 : 0.78;
      boat.renderUpdate(this.time, dt, this.atmosphere.weather);
    }
  }
};
