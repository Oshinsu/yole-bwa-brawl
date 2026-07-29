import { clamp } from "../core/math.js";

function closestPointOnSegment(px, pz, ax, az, bx, bz, out) {
  const abx = bx - ax;
  const abz = bz - az;
  const denominator = abx * abx + abz * abz || 1;
  const t = clamp(((px - ax) * abx + (pz - az) * abz) / denominator, 0, 1);
  out.x = ax + abx * t;
  out.z = az + abz * t;
  out.t = t;
  return out;
}

/** Closest points between 2D segments. */
export function closestSegmentSegment2D(a0x, a0z, a1x, a1z, b0x, b0z, b1x, b1z, out = {}) {
  const ux = a1x - a0x;
  const uz = a1z - a0z;
  const vx = b1x - b0x;
  const vz = b1z - b0z;
  const wx = a0x - b0x;
  const wz = a0z - b0z;
  const a = ux * ux + uz * uz;
  const b = ux * vx + uz * vz;
  const c = vx * vx + vz * vz;
  const d = ux * wx + uz * wz;
  const e = vx * wx + vz * wz;
  const denominator = a * c - b * b;
  let s;
  let t;

  if (a < 1e-8 && c < 1e-8) {
    s = 0;
    t = 0;
  } else if (a < 1e-8) {
    s = 0;
    t = clamp(e / c, 0, 1);
  } else if (c < 1e-8) {
    t = 0;
    s = clamp(-d / a, 0, 1);
  } else {
    s = denominator !== 0 ? clamp((b * e - c * d) / denominator, 0, 1) : 0;
    t = clamp((b * s + e) / c, 0, 1);
    s = clamp((b * t - d) / a, 0, 1);
  }

  out.ax = a0x + ux * s;
  out.az = a0z + uz * s;
  out.bx = b0x + vx * t;
  out.bz = b0z + vz * t;
  out.s = s;
  out.t = t;
  const dx = out.bx - out.ax;
  const dz = out.bz - out.az;
  out.distance = Math.hypot(dx, dz);
  if (out.distance > 1e-6) {
    out.nx = dx / out.distance;
    out.nz = dz / out.distance;
  } else {
    const length = Math.hypot(ux, uz) || 1;
    out.nx = -uz / length;
    out.nz = ux / length;
  }
  return out;
}

export function boatCapsule(boat, out = {}) {
  const halfLength = 4.65;
  const fx = Math.sin(boat.dynamics.heading);
  const fz = Math.cos(boat.dynamics.heading);
  out.a0x = boat.x - fx * halfLength;
  out.a0z = boat.z - fz * halfLength;
  out.a1x = boat.x + fx * halfLength;
  out.a1z = boat.z + fz * halfLength;
  out.radius = 0.92;
  return out;
}

export function capsuleCollision(a, b, out = {}) {
  const ca = boatCapsule(a, out.ca || (out.ca = {}));
  const cb = boatCapsule(b, out.cb || (out.cb = {}));
  const closest = closestSegmentSegment2D(
    ca.a0x, ca.a0z, ca.a1x, ca.a1z,
    cb.a0x, cb.a0z, cb.a1x, cb.a1z,
    out.closest || (out.closest = {})
  );
  const combined = ca.radius + cb.radius;
  out.hit = closest.distance < combined;
  out.overlap = out.hit ? combined - closest.distance : 0;
  out.nx = closest.nx;
  out.nz = closest.nz;
  out.contactX = (closest.ax + closest.bx) * 0.5;
  out.contactZ = (closest.az + closest.bz) * 0.5;
  out.localZA = (closest.s - 0.5) * 9.3;
  out.localZB = (closest.t - 0.5) * 9.3;
  return out;
}

export function pointCapsuleDistanceSquared(px, pz, boat, scratch = {}) {
  const capsule = boatCapsule(boat, scratch.capsule || (scratch.capsule = {}));
  const closest = closestPointOnSegment(px, pz, capsule.a0x, capsule.a0z, capsule.a1x, capsule.a1z, scratch.closest || (scratch.closest = {}));
  const dx = px - closest.x;
  const dz = pz - closest.z;
  return dx * dx + dz * dz;
}
