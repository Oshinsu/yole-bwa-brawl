export const TAU = Math.PI * 2;
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const saturate = (value) => clamp(value, 0, 1);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (value, target, speed, dt) => lerp(value, target, 1 - Math.exp(-speed * dt));
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
