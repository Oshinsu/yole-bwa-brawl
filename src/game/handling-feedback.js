import { clamp } from "../core/math.js";

export const HANDLING_LABELS = Object.freeze({
  critical: "CHAVIRAGE",
  danger: "CRITIQUE",
  tense: "TENDU",
  recover: "RATTRAPAGE",
  surf: "SURF !",
  drift: "DÉRIVE",
  stable: "STABLE"
});

// Un seul vocabulaire partagé par le HUD et les tests. Ces seuils décrivent
// l'état déjà calculé par la physique ; ils n'exercent aucune autorité gameplay.
export function handlingCue(dynamics, dangerValue = 0) {
  const danger = clamp(dangerValue, 0, 1);
  const slip = clamp(dynamics?.slip ?? 0, 0, 1);
  const surf = clamp(dynamics?.surf ?? 0, 0, 1);
  const recovering = slip > 0.26 && (dynamics?.counterSteer ?? 0) > 0.28;
  const mode = danger > 0.82
    ? "critical"
    : danger > 0.55
      ? "danger"
      : danger > 0.3
        ? "tense"
        : recovering
          ? "recover"
          : surf > 0.50
            ? "surf"
            : slip > 0.32
              ? "drift"
              : "stable";
  return { mode, label: HANDLING_LABELS[mode], danger, slip, surf, recovering };
}

// Mix continu et borné pour rendre le surf, la glisse et le rattrapage audibles.
// Web Audio reçoit gain/rate uniquement ; la fonction reste pure et testable.
export function handlingWaterMix(dynamics, speedValue = 0, sprayValue = 0) {
  const speed = clamp(speedValue, 0, 1);
  const spray = clamp(sprayValue, 0, 1);
  const surf = clamp(dynamics?.surf ?? 0, 0, 1);
  const slip = clamp(dynamics?.slip ?? 0, 0, 1);
  const counter = clamp(dynamics?.counterSteer ?? 0, 0, 1);
  return {
    gain: clamp(0.05 + speed * 0.30 + spray * 0.12 + surf * 0.10 + slip * 0.06, 0, 0.72),
    rate: 0.78 + speed * 0.5 + surf * 0.16 + counter * 0.06
  };
}
