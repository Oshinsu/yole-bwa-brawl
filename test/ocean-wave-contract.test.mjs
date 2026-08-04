import assert from "node:assert/strict";
import * as THREE from "./mock-three.module.js";
import {
  OCEAN_CREST,
  OceanSystem,
  oceanCrestEnvelope
} from "../src/render/ocean.js";
import { DEFAULT_WAVE_SET, WaveField } from "../src/sim/waves.js";

class FakeContext2D {
  createImageData(width, height) {
    return { data: new Uint8ClampedArray(width * height * 4), width, height };
  }
  putImageData() {}
}
class FakeCanvas {
  constructor(width = 256, height = 256) {
    this.width = width;
    this.height = height;
  }
  getContext() { return new FakeContext2D(); }
}
globalThis.OffscreenCanvas = FakeCanvas;
globalThis.document ??= { createElement: () => new FakeCanvas() };

function shaderMirror(waveField, x, z, time) {
  let height = 0;
  let slopeX = 0;
  let slopeZ = 0;
  let curvature = 0;
  const waves = waveField.shaderData(8);
  for (let index = 0; index < waves.length; index++) {
    const wave = waves[index];
    const rotation = index % 3 === 1 ? waveField.crossSea * 0.38 : 0;
    const cosine = Math.cos(rotation);
    const sine = Math.sin(rotation);
    const dx = wave.dx * cosine - wave.dz * sine;
    const dz = wave.dx * sine + wave.dz * cosine;
    const amplitude = wave.amplitude
      * waveField.globalAmplitude
      * (index > 4 ? 0.78 : 1);
    const phase = (x * dx + z * dz) * wave.k + time * wave.speed + wave.phase;
    height += Math.sin(phase) * amplitude;
    slopeX += Math.cos(phase) * amplitude * wave.k * dx;
    slopeZ += Math.cos(phase) * amplitude * wave.k * dz;
    curvature += -Math.sin(phase) * amplitude * wave.k * wave.k;
  }
  return { height, slopeX, slopeZ, curvature };
}

// Contrat numérique : la formule maintenant émise dans le vertex shader est le
// miroir de WaveField, y compris houle croisée et petites vagues à 78 %.
{
  const waveField = new WaveField();
  waveField.setWeather(0.92, { swellScale: 1.21, crossSea: 0.31 });
  for (const [x, z, time] of [
    [-72.4, 31.8, 0],
    [4.2, 118.7, 3.25],
    [91.3, -44.1, 19.8],
    [0, 0, 77.7]
  ]) {
    const cpu = waveField.sample(x, z, time, {});
    const gpu = shaderMirror(waveField, x, z, time);
    assert.ok(Math.abs(cpu.height - gpu.height) < 1e-12);
    assert.ok(Math.abs(cpu.slopeX - gpu.slopeX) < 1e-12);
    assert.ok(Math.abs(cpu.slopeZ - gpu.slopeZ) < 1e-12);
    assert.ok(Math.abs(cpu.curvature - gpu.curvature) < 1e-12);
  }

  const scene = new THREE.Scene();
  const ocean = new OceanSystem(THREE, scene, waveField, { quality: 1 });
  ocean.update(1 / 60, 2, 0, 0, 0.92, -3, 4);
  const expectedRotation = waveField.crossSea * 0.38;
  assert.ok(Math.abs(ocean.uniforms.uCrossRotation.value.x - Math.cos(expectedRotation)) < 1e-12);
  assert.ok(Math.abs(ocean.uniforms.uCrossRotation.value.y - Math.sin(expectedRotation)) < 1e-12);
  assert.ok(Math.abs(ocean.uniforms.uWindDir.value.x + 0.6) < 1e-12);
  assert.ok(Math.abs(ocean.uniforms.uWindDir.value.y - 0.8) < 1e-12);

  const vertex = ocean.material.vertexShader;
  const fragment = ocean.material.fragmentShader;
  assert.match(vertex, /uniform vec2 uCrossRotation/);
  assert.match(vertex, /d1[\s\S]*uCrossRotation/);
  assert.match(fragment, /max\(-vCrestCurvature,\s*0\.0\)/);
  assert.doesNotMatch(fragment, /abs\(vCurvature\)/);
  assert.equal(
    (fragment.match(/texture2D\(uSeaDetail/g) ?? []).length,
    3,
    "la correction de crête a ajouté un sample texture mobile"
  );
}

function crestCoverage(storm) {
  const globalAmplitude = 1 + storm * 0.46;
  const crossSea = storm;
  let samples = 0;
  let active = 0;
  let sum = 0;
  for (let x = -100; x <= 100; x += 2) {
    for (let z = -100; z <= 100; z += 2) {
      let height = 0;
      let signedCarrier = 0;
      for (let index = 0; index < DEFAULT_WAVE_SET.length; index++) {
        const wave = DEFAULT_WAVE_SET[index];
        const waveLength = Math.max(0.35, wave.length);
        const k = Math.PI * 2 / waveLength;
        const norm = Math.hypot(wave.dx, wave.dz) || 1;
        const baseX = wave.dx / norm;
        const baseZ = wave.dz / norm;
        const rotation = index % 3 === 1 ? crossSea * 0.38 : 0;
        const cosine = Math.cos(rotation);
        const sine = Math.sin(rotation);
        const dx = baseX * cosine - baseZ * sine;
        const dz = baseX * sine + baseZ * cosine;
        const amplitude = wave.amplitude * globalAmplitude * (index > 4 ? 0.78 : 1);
        const phase = (x * dx + z * dz) * k + 8 * wave.speed + wave.phase;
        height += Math.sin(phase) * amplitude;
        if (index < 3) signedCarrier += -Math.sin(phase) * amplitude * k * k;
      }
      const foam = oceanCrestEnvelope(signedCarrier, height, storm, globalAmplitude, 1);
      samples++;
      sum += foam;
      if (foam > 0.01) active++;
    }
  }
  return { active: active / samples, average: sum / samples };
}

// Pas de mousse de creux. La couverture reste rare en alizé et monte sous le
// Grain sans devenir un damier blanc.
{
  assert.equal(oceanCrestEnvelope(1, 2, 1, 1, 1), 0);
  assert.equal(oceanCrestEnvelope(-1, -2, 1, 1, 1), 0);
  assert.ok(
    oceanCrestEnvelope(-1, 1, 0, 1, 0)
      < oceanCrestEnvelope(-1, 1, 0, 1, 1) * 0.55,
    "le bruit de détail ne casse pas assez les grandes plaques de mousse"
  );
  assert.ok(OCEAN_CREST.calmStart > OCEAN_CREST.stormStart);
  const calm = crestCoverage(0);
  const storm = crestCoverage(1);
  assert.ok(calm.active > 0.075 && calm.active < 0.12, `couverture calme: ${calm.active}`);
  assert.ok(storm.active > 0.12 && storm.active < 0.18, `couverture Grain: ${storm.active}`);
  assert.ok(storm.average > calm.average * 1.5);

  console.log(JSON.stringify({
    ok: true,
    crestCoverage: {
      calm: +calm.active.toFixed(4),
      storm: +storm.active.toFixed(4)
    },
    textureSamples: 3
  }, null, 2));
}
