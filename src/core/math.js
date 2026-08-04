export const TAU = Math.PI * 2;
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const saturate = (value) => clamp(value, 0, 1);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (value, target, speed, dt) => lerp(value, target, 1 - Math.exp(-speed * dt));

/**
 * Solution analytique, sans allocation, du ressort scalaire
 * x'' + 2*zeta*omega*x' + omega²(x-target) = 0.
 *
 * Contrairement à un Euler semi-implicite, le même mouvement tombe au même
 * endroit à 30, 60 ou 144 Hz lorsque la cible est constante. L'état est muté
 * afin que les boucles de rendu puissent réutiliser un seul petit objet.
 */
export function stepDampedSpring(state, target, angularFrequency, dampingRatio, dt) {
  if (!state || typeof state !== "object") return 0;
  let value = Number.isFinite(state.value) ? state.value : 0;
  let velocity = Number.isFinite(state.velocity) ? state.velocity : 0;
  const goal = Number.isFinite(target) ? target : 0;
  const omega = Math.max(0, Number.isFinite(angularFrequency) ? angularFrequency : 0);
  const zeta = Math.max(0, Number.isFinite(dampingRatio) ? dampingRatio : 1);
  const step = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.25);
  if (step <= 0 || omega <= 1e-6) {
    state.value = value;
    state.velocity = velocity;
    return value;
  }

  const displaced = value - goal;
  if (zeta < 1 - 1e-4) {
    const decay = zeta * omega;
    const damped = omega * Math.sqrt(Math.max(1e-8, 1 - zeta * zeta));
    const phase = damped * step;
    const cosine = Math.cos(phase);
    const sine = Math.sin(phase);
    const envelope = Math.exp(-decay * step);
    value = goal + envelope * (
      displaced * cosine + (velocity + decay * displaced) / damped * sine
    );
    velocity = envelope * (
      velocity * cosine
      - (decay * velocity + omega * omega * displaced) / damped * sine
    );
  } else if (zeta <= 1 + 1e-4) {
    const envelope = Math.exp(-omega * step);
    const coefficient = velocity + omega * displaced;
    value = goal + (displaced + coefficient * step) * envelope;
    velocity = (velocity - omega * coefficient * step) * envelope;
  } else {
    const root = Math.sqrt(zeta * zeta - 1);
    const r1 = -omega * (zeta - root);
    const r2 = -omega * (zeta + root);
    const divisor = r1 - r2;
    const c1 = (velocity - r2 * displaced) / divisor;
    const c2 = displaced - c1;
    const e1 = Math.exp(r1 * step);
    const e2 = Math.exp(r2 * step);
    value = goal + c1 * e1 + c2 * e2;
    velocity = r1 * c1 * e1 + r2 * c2 * e2;
  }

  state.value = Number.isFinite(value) ? value : goal;
  state.velocity = Number.isFinite(velocity) ? velocity : 0;
  return state.value;
}

export const angleDelta = (current, target) => Math.atan2(Math.sin(target - current), Math.cos(target - current));
export const smoothstep = (a, b, x) => {
  const t = saturate((x - a) / Math.max(1e-6, b - a));
  return t * t * (3 - 2 * t);
};
export const expDecay = (halfLife, dt) => Math.pow(0.5, dt / Math.max(1e-5, halfLife));
export const hypot2 = (x, z) => Math.hypot(x, z);
export const formatTime = (seconds) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
export const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
export const hashFloat = (value) => {
  let x = value | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
};
