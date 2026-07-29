import { clamp } from "../core/math.js";

/**
 * Small deterministic Verlet rope. Endpoints are pinned every step; interior nodes
 * sag, react to wind, and can be copied directly into a Three.js Line geometry.
 */
export class VerletRope {
  constructor(points = 10) {
    this.count = Math.max(3, points | 0);
    this.x = new Float32Array(this.count);
    this.y = new Float32Array(this.count);
    this.z = new Float32Array(this.count);
    this.px = new Float32Array(this.count);
    this.py = new Float32Array(this.count);
    this.pz = new Float32Array(this.count);
    this.segmentLength = 1;
    this.initialized = false;
  }

  reset(start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dz = end.z - start.z;
    const distance = Math.hypot(dx, dy, dz);
    this.segmentLength = distance / (this.count - 1);
    for (let index = 0; index < this.count; index++) {
      const t = index / (this.count - 1);
      const sag = Math.sin(Math.PI * t) * Math.min(1.4, distance * 0.055);
      this.x[index] = this.px[index] = start.x + dx * t;
      this.y[index] = this.py[index] = start.y + dy * t - sag;
      this.z[index] = this.pz[index] = start.z + dz * t;
    }
    this.initialized = true;
  }

  step(dt, start, end, options = {}) {
    if (!this.initialized) this.reset(start, end);
    const damping = clamp(options.damping ?? 0.985, 0.8, 1);
    const gravity = options.gravity ?? 5.2;
    const windX = options.windX ?? 0;
    const windZ = options.windZ ?? 0;
    const iterations = options.iterations ?? 5;
    const maxSegmentStretch = options.maxStretch ?? 1.08;
    const desiredDistance = Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z);
    this.segmentLength += (desiredDistance / (this.count - 1) - this.segmentLength) * clamp(dt * 7, 0, 1);

    const dt2 = dt * dt;
    for (let index = 1; index < this.count - 1; index++) {
      const x = this.x[index];
      const y = this.y[index];
      const z = this.z[index];
      const vx = (x - this.px[index]) * damping;
      const vy = (y - this.py[index]) * damping;
      const vz = (z - this.pz[index]) * damping;
      this.px[index] = x;
      this.py[index] = y;
      this.pz[index] = z;
      const t = index / (this.count - 1);
      const windEnvelope = Math.sin(Math.PI * t);
      this.x[index] = x + vx + windX * dt2 * 0.035 * windEnvelope;
      this.y[index] = y + vy - gravity * dt2;
      this.z[index] = z + vz + windZ * dt2 * 0.035 * windEnvelope;
    }

    for (let iteration = 0; iteration < iterations; iteration++) {
      this.x[0] = start.x; this.y[0] = start.y; this.z[0] = start.z;
      this.x[this.count - 1] = end.x; this.y[this.count - 1] = end.y; this.z[this.count - 1] = end.z;
      for (let index = 0; index < this.count - 1; index++) {
        const next = index + 1;
        const dx = this.x[next] - this.x[index];
        const dy = this.y[next] - this.y[index];
        const dz = this.z[next] - this.z[index];
        const distance = Math.hypot(dx, dy, dz) || 1;
        const desired = Math.min(this.segmentLength * maxSegmentStretch, this.segmentLength);
        const correction = (distance - desired) / distance;
        const cx = dx * correction;
        const cy = dy * correction;
        const cz = dz * correction;
        if (index !== 0) {
          this.x[index] += cx * 0.5;
          this.y[index] += cy * 0.5;
          this.z[index] += cz * 0.5;
        }
        if (next !== this.count - 1) {
          this.x[next] -= cx * 0.5;
          this.y[next] -= cy * 0.5;
          this.z[next] -= cz * 0.5;
        }
      }
    }
    this.x[0] = start.x; this.y[0] = start.y; this.z[0] = start.z;
    this.x[this.count - 1] = end.x; this.y[this.count - 1] = end.y; this.z[this.count - 1] = end.z;
  }

  writePositions(array) {
    const limit = Math.min(this.count, Math.floor(array.length / 3));
    for (let index = 0; index < limit; index++) {
      array[index * 3] = this.x[index];
      array[index * 3 + 1] = this.y[index];
      array[index * 3 + 2] = this.z[index];
    }
    return limit;
  }
}
