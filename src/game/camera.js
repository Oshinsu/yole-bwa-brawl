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
} from "../render/handling-motion.js";
import { versusCameraFrame } from "./versus.js";

// Secondes pendant lesquelles la caméra reste sur NOTRE épave après
// l'élimination, avant de basculer sur un autre bateau.
//
// ⚠️ Ce compteur avance en temps RÉEL (`updateCamera` est appelée avec `raw`,
// game.js:1155), pas en temps de simulation. Il ne peut donc pas faire diverger
// un replay — c'est la même règle que `lookBack`, qui n'est pas non plus
// enregistré par `recordInput`.
//
// 3,6 s : assez pour voir la coque se coucher et la détonation retomber. En
// mode Combat le repêchage arrive à 8,5 s (BALANCE.respawn.delay), il reste
// donc environ 5 s sur un autre bateau avant le retour.
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
      const t = this.time * 0.12;
      const target = this.menuCameraTarget || (this.menuCameraTarget = new this.THREE.Vector3());
      const desired = this.menuCameraDesired || (this.menuCameraDesired = new this.THREE.Vector3());
      target.set(routeCenter(18), 1.2, 24);
      desired.set(Math.sin(t) * 28, 15 + Math.sin(t * 0.7) * 2, -20 + Math.cos(t) * 16);
      this.camera.position.lerp(desired, 0.018);
      this.camera.lookAt(target);
      return;
    }

    if (this.versusLocal) {
      this.prepareHandlingCameraRound();
      this.updateVersusCamera(dt);
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
    const back = (16.8 + speedFactor * 5.0 + handlingSurf * HANDLING_MOTION.cameraSurfBack) * zoom;
    const height = (
      9.2 + speedFactor * 2.2 - handlingSurf * HANDLING_MOTION.cameraSurfHeight
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
      base.lerp(desired, 1 - Math.exp(-4.6 * dt));
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
    const lookAhead = 10 + speedFactor * 7 + (zoom - 1) * 3
      + handlingSurf * HANDLING_MOTION.cameraSurfLook;
    look.set(
      follow.x + forward.x * lookAhead * backSign,
      follow.y + 0.7,
      follow.z + forward.z * lookAhead * backSign
    );
    look.x += forward.z * handlingSlip * HANDLING_MOTION.cameraSlipLook;
    look.z -= forward.x * handlingSlip * HANDLING_MOTION.cameraSlipLook;
    this.camera.lookAt(look);
    const stabilization = clamp(this.settings.get("cameraRoll"), 0, 1);
    const catchRoll = -handlingSlip * this.cameraHandlingRecovery * 0.032;
    this.cameraRollBase = damp(
      this.cameraRollBase ?? 0,
      -follow.roll * (1 - stabilization) * 0.34 + catchRoll,
      5.2 + this.cameraHandlingRecovery * 2.8,
      dt
    );
    this.cameraFovBase = damp(
      this.cameraFovBase ?? this.camera.fov,
      61 + speedFactor * 7 - (zoom - 1) * 4.5,
      2.8,
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

  updateVersusCamera(dt) {
    const playerOne = this.boats[0];
    const playerTwo = this.boats[1];
    this.updateVersusHandlingCamera(playerOne, playerTwo, dt);
    const frame = versusCameraFrame(
      playerOne,
      playerTwo,
      this.versusCameraFrameScratch || (this.versusCameraFrameScratch = {})
    );
    const forwardX = Math.sin(frame.heading);
    const forwardZ = Math.cos(frame.heading);
    const speedFactor = clamp(Math.max(playerOne.speed, playerTwo.speed) / 27, 0, 1);
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
    for (let index = 0; index < this.boats.length; index++) {
      const boat = this.boats[index];
      boat.dynamics.z = 18 + index * 6;
      boat.dynamics.x = routeCenter(boat.z) + (index - 1.5) * 6;
      const water = this.waveField.sample(boat.x, boat.z, this.time, this.waterScratch);
      boat.dynamics.y = water.height + 0.5;
      boat.dynamics.roll = -Math.atan(water.slopeX) * 0.23;
      boat.dynamics.pitch = Math.atan(water.slopeZ) * 0.2;
      boat.dynamics.crewShift = Math.sin(this.time * 0.8 + index) * 0.72;
      boat.dynamics.sailPower = 0.8;
      boat.renderUpdate(this.time, dt, this.atmosphere.weather);
    }
  }
};
