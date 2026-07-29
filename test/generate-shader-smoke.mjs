import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

class FakeGradient { addColorStop() {} }
class FakeContext2D {
  createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; }
  putImageData() {} fillRect() {} save() {} restore() {} translate() {} rotate() {} scale() {}
  beginPath() {} ellipse() {} fill() {} arc() {} stroke() {}
  createRadialGradient() { return new FakeGradient(); }
}
class FakeCanvas {
  constructor(width = 256, height = 256) { this.width = width; this.height = height; }
  getContext(kind) { return kind === '2d' ? new FakeContext2D() : {}; }
}
globalThis.OffscreenCanvas = FakeCanvas;
globalThis.document = { createElement: () => new FakeCanvas() };
globalThis.innerWidth = 1280;
globalThis.innerHeight = 720;
globalThis.devicePixelRatio = 1;

const THREE = await import('./mock-three.module.js');
const { WaveField } = await import('../src/sim/waves.js');
const { RNG } = await import('../src/core/rng.js');
const { OceanSystem } = await import('../src/render/ocean.js');
const { AtmosphereSystem } = await import('../src/render/sky.js');
const { ParticlePool, EffectAtlasPool, PostFX } = await import('../src/render/vfx.js');

const scene = new THREE.Scene();
const waveField = new WaveField();
const ocean = new OceanSystem(THREE, scene, waveField, { quality: 2 });
const atmosphere = new AtmosphereSystem(THREE, scene, new RNG(42));
const particles = new ParticlePool(THREE, scene, 16);
const spellVfx = new EffectAtlasPool(THREE, scene, {}, { max: 2 });
const renderer = new THREE.WebGLRenderer();
const postFX = new PostFX(THREE, renderer, 640, 360);

const programs = [
  ['ocean', ocean.material],
  ['sky', atmosphere.sky.material],
  ['storm-wall', atmosphere.stormWall.material],
  ['rain', atmosphere.rain.material],
  ['particles', particles.points.material],
  ['spell-vfx-atlas', spellVfx.material],
  ['postfx', postFX.material],
  ['bloom-prefilter', postFX.bloomPrefilterMaterial],
  ['bloom-blur', postFX.bloomBlurHorizontalMaterial]
].map(([name, material]) => ({ name, vertex: material.vertexShader, fragment: material.fragmentShader }));

const vertexPreamble = `
attribute vec3 position;
attribute vec2 uv;
uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform vec3 cameraPosition;
`;
const fragmentPreamble = `
precision highp float;
uniform vec3 cameraPosition;
`;

const html = `<!doctype html><html><head><meta charset="utf-8"><title>YOLE Shader Smoke</title></head><body>
<canvas id="c" width="64" height="64"></canvas><pre id="result">pending</pre>
<script>
const programs = ${JSON.stringify(programs)};
const vertexPreamble = ${JSON.stringify(vertexPreamble)};
const fragmentPreamble = ${JSON.stringify(fragmentPreamble)};
const result = document.getElementById('result');
function compile(gl, type, source, preamble) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, preamble + '\\n' + source);
  gl.compileShader(shader);
  const ok = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
  const log = gl.getShaderInfoLog(shader) || '';
  if (!ok) throw new Error(log + '\\n--- SOURCE ---\\n' + source);
  return shader;
}
const gl = document.getElementById('c').getContext('webgl', { antialias:false, alpha:false }) || document.getElementById('c').getContext('experimental-webgl');
const report = { ok: false, renderer: null, programs: [] };
try {
  if (!gl) throw new Error('WebGL context unavailable');
  report.renderer = gl.getParameter(gl.RENDERER);
  for (const entry of programs) {
    const vs = compile(gl, gl.VERTEX_SHADER, entry.vertex, vertexPreamble);
    const fs = compile(gl, gl.FRAGMENT_SHADER, entry.fragment, fragmentPreamble);
    const program = gl.createProgram();
    gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
    const linked = gl.getProgramParameter(program, gl.LINK_STATUS);
    const log = gl.getProgramInfoLog(program) || '';
    if (!linked) throw new Error(entry.name + ': link failed: ' + log);
    report.programs.push({ name: entry.name, linked: true });
    gl.deleteProgram(program); gl.deleteShader(vs); gl.deleteShader(fs);
  }
  report.ok = true;
  result.dataset.ok = 'true';
} catch (error) {
  report.error = String(error && error.stack || error);
  result.dataset.ok = 'false';
}
result.textContent = JSON.stringify(report, null, 2);
document.title = report.ok ? 'YOLE_SHADER_OK' : 'YOLE_SHADER_FAIL';
</script></body></html>`;

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const output = path.join(root, 'test', 'webgl-shader-smoke.html');
fs.writeFileSync(output, html);
fs.writeFileSync(path.join(root, 'test', 'generated-shaders.json'), JSON.stringify(programs, null, 2));
console.log(output);
