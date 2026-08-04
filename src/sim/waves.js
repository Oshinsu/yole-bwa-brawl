import { TAU, clamp } from "../core/math.js";

const DEFAULT_WAVES = [
  { dx: 0.19, dz: 0.982, amplitude: 0.56, length: 21.0, speed: 1.18, phase: 0.20 },
  { dx: -0.52, dz: 0.854, amplitude: 0.34, length: 12.5, speed: 1.52, phase: 2.10 },
  { dx: 0.82, dz: 0.572, amplitude: 0.22, length: 7.4, speed: 2.10, phase: 4.40 },
  { dx: -0.28, dz: 0.960, amplitude: 0.15, length: 4.2, speed: 2.80, phase: 1.30 },
  { dx: 0.66, dz: 0.751, amplitude: 0.10, length: 2.7, speed: 3.65, phase: 3.45 },
  { dx: -0.92, dz: 0.392, amplitude: 0.075, length: 1.75, speed: 4.30, phase: 5.20 },
  { dx: 0.03, dz: 0.999, amplitude: 0.045, length: 1.05, speed: 5.20, phase: 0.90 },
  { dx: 0.97, dz: 0.242, amplitude: 0.032, length: 0.72, speed: 6.10, phase: 2.75 }
];

export class WaveField {
  constructor(waves = DEFAULT_WAVES) {
    this.waves = waves.map((wave) => {
      const length = Math.max(0.35, wave.length);
      const norm = Math.hypot(wave.dx, wave.dz) || 1;
      return {
        ...wave,
        dx: wave.dx / norm,
        dz: wave.dz / norm,
        k: TAU / length
      };
    });
    this.globalAmplitude = 1;
    this.crossSea = 0;
  }

  setWeather(stormAmount, profile = null) {
    const storm = clamp(stormAmount, 0, 1);
    const swellScale = clamp(Number(profile?.swellScale) || 1, 0.72, 1.35);
    const crossSea = clamp(Number(profile?.crossSea) || 0, 0, 0.48);
    this.globalAmplitude = (1 + storm * 0.46) * swellScale;
    this.crossSea = clamp(storm + crossSea, 0, 1.25);
  }

  sample(x, z, time, out = {}) {
    let height = 0;
    let slopeX = 0;
    let slopeZ = 0;
    let velocityY = 0;
    let curvature = 0;

    for (let index = 0; index < this.waves.length; index++) {
      const wave = this.waves[index];
      const crossRotation = index % 3 === 1 ? this.crossSea * 0.38 : 0;
      const c = Math.cos(crossRotation);
      const s = Math.sin(crossRotation);
      const dx = wave.dx * c - wave.dz * s;
      const dz = wave.dx * s + wave.dz * c;
      const amplitude = wave.amplitude * this.globalAmplitude * (index > 4 ? 0.78 : 1);
      const phase = (x * dx + z * dz) * wave.k + time * wave.speed + wave.phase;
      const sin = Math.sin(phase);
      const cos = Math.cos(phase);
      height += sin * amplitude;
      slopeX += cos * amplitude * wave.k * dx;
      slopeZ += cos * amplitude * wave.k * dz;
      velocityY += cos * amplitude * wave.speed;
      curvature += -sin * amplitude * wave.k * wave.k;
    }

    out.height = height;
    out.slopeX = slopeX;
    out.slopeZ = slopeZ;
    out.velocityY = velocityY;
    out.curvature = curvature;
    out.normalX = -slopeX;
    out.normalY = 1;
    out.normalZ = -slopeZ;
    const normalLength = Math.hypot(out.normalX, out.normalY, out.normalZ) || 1;
    out.normalX /= normalLength;
    out.normalY /= normalLength;
    out.normalZ /= normalLength;
    return out;
  }

  shaderData(limit = 8) {
    return this.waves.slice(0, limit).map((wave) => ({
      dx: wave.dx,
      dz: wave.dz,
      amplitude: wave.amplitude,
      k: wave.k,
      speed: wave.speed,
      phase: wave.phase
    }));
  }
}

export const DEFAULT_WAVE_SET = DEFAULT_WAVES;
