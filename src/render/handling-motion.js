import { clamp } from "../core/math.js";

// Calibration purement visuelle. Les valeurs d'entree viennent de
// YoleDynamics, mais rien de ce module ne leur repond : le rendu ne gagne donc
// aucune autorite sur la simulation ou les replays.
export const HANDLING_MOTION = Object.freeze({
  fullSlipAngle: 0.58,
  counterSettleTime: 0.18,
  cameraSlipOffset: 2.25,
  cameraSlipLook: 3.65,
  cameraSurfBack: 1.35,
  cameraSurfHeight: 0.38,
  cameraSurfLook: 2.15,
  cameraSurfFov: 2.35,
  hullSlipOffset: 0.11,
  hullCounterRoll: 0.065,
  hullSurfLift: 0.065,
  hullSurfPitch: 0.028
});

function finiteHandlingMotion(value) {
  return Number.isFinite(value) ? value : 0;
}

// Ecrit dans `out` afin que camera.js et YoleVisual.update() puissent appeler
// cette fonction chaque frame sans creer d'objet temporaire.
export function sampleHandlingMotion(source, out) {
  const dynamics = source?.dynamics ?? source;
  const slipAngle = clamp(finiteHandlingMotion(dynamics?.slipAngle), -0.82, 0.82);
  const slip = clamp(finiteHandlingMotion(dynamics?.slip), 0, 1);
  const surf = clamp(finiteHandlingMotion(dynamics?.surf), 0, 1);
  const counter = clamp(finiteHandlingMotion(dynamics?.counterSteer), 0, 1);
  const counterHeel = clamp(finiteHandlingMotion(dynamics?.counterHeel), 0, 1);
  const settle = clamp(
    finiteHandlingMotion(dynamics?.counterSettle) / HANDLING_MOTION.counterSettleTime,
    0,
    1
  );
  const angleEnergy = clamp(Math.abs(slipAngle) / HANDLING_MOTION.fullSlipAngle, 0, 1);
  const slipEnergy = clamp(angleEnergy * 0.58 + slip * 0.62, 0, 1);
  const slipDirection = clamp(
    slipAngle / HANDLING_MOTION.fullSlipAngle,
    -1,
    1
  );

  out.slipAngle = slipAngle;
  out.slipEnergy = slipEnergy;
  out.signedSlip = slipDirection * slipEnergy;
  out.surf = surf;
  out.counter = counter;
  out.recovery = clamp(counter * 0.72 + counterHeel * 0.42 + settle * 0.46, 0, 1);
  out.settle = settle;
  return out;
}

// Interrogee une seule fois par camera/yole, jamais dans leur boucle chaude.
export function prefersReducedMotion() {
  try {
    return Boolean(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  } catch {
    return false;
  }
}
