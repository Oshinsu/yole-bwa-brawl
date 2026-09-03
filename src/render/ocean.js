import { clamp, smoothstep } from "../core/math.js";
import { WakeGrid } from "../sim/wake-grid.js";

// Le lobe solaire precedent utilisait 13..22 pour son chemin large : largeur a
// mi-hauteur de 14 a 19 degres. Une pente de houle alignee formait donc un seul
// aplat blanc de plusieurs centaines de pixels, ensuite elargi par le bloom.
// Les nouveaux lobes sont plus serres et le pic est casse par le masque de
// micro-cretes. Le raccord lointain ne change pas : atmosphere reste appliquee
// apres cette contribution.
export const OCEAN_GLINT = Object.freeze({
  sparkleExponentFar: 68,
  sparkleExponentNear: 160,
  pathExponentFar: 28,
  pathExponentNear: 46,
  sparkleGain: 0.78,
  pathGain: 0.08
});

export const OCEAN_CREST = Object.freeze({
  calmStart: 0.17,
  calmFull: 0.255,
  stormStart: 0.13,
  stormFull: 0.215,
  heightStart: 0.10,
  heightFull: 0.52
});

const DEFAULT_OCEAN_PALETTE = Object.freeze({
  deep: 0x0d4f63,
  mid: 0x168697,
  shallow: 0x2fb9c4,
  foam: 0xeefaff
});

// Miroir scalaire de l'enveloppe GLSL, utilise uniquement par les tests de
// calibration. La boucle de rendu execute directement le shader.
export function oceanGlintEnvelope(glintDotValue, detailFadeValue, crestMaskValue) {
  const glintDot = clamp(glintDotValue, 0, 1);
  const detailFade = clamp(detailFadeValue, 0, 1);
  const crestMask = clamp(crestMaskValue, 0, 1);
  const sparkleExponent = OCEAN_GLINT.sparkleExponentFar
    + (OCEAN_GLINT.sparkleExponentNear - OCEAN_GLINT.sparkleExponentFar) * detailFade;
  const pathExponent = OCEAN_GLINT.pathExponentFar
    + (OCEAN_GLINT.pathExponentNear - OCEAN_GLINT.pathExponentFar) * detailFade;
  const sparkleMask = 0.24 + crestMask * 0.76;
  const sparkle = Math.pow(glintDot, sparkleExponent)
    * (0.24 + detailFade * 0.58)
    * sparkleMask
    * OCEAN_GLINT.sparkleGain;
  const path = Math.pow(glintDot, pathExponent)
    * (0.42 + crestMask * 0.40)
    * OCEAN_GLINT.pathGain;
  return sparkle + path;
}

// Miroir de la sélection GLSL des whitecaps. `signedCurvature` est négative au
// sommet d'une vague sinusoïdale : seuls ces sommets peuvent blanchir. Le bruit
// de détail casse leurs bords, il ne décide plus où se trouve une crête.
export function oceanCrestEnvelope(
  signedCurvatureValue,
  heightValue,
  stormValue,
  amplitudeValue,
  crestMaskValue = 1
) {
  const curvature = Number.isFinite(signedCurvatureValue) ? signedCurvatureValue : 0;
  const amplitude = Math.max(0.001, Number.isFinite(amplitudeValue) ? amplitudeValue : 1);
  const storm = clamp(stormValue, 0, 1);
  const compression = Math.max(-curvature, 0) / amplitude;
  const start = OCEAN_CREST.calmStart
    + (OCEAN_CREST.stormStart - OCEAN_CREST.calmStart) * storm;
  const full = OCEAN_CREST.calmFull
    + (OCEAN_CREST.stormFull - OCEAN_CREST.calmFull) * storm;
  const whitecap = smoothstep(start, full, compression)
    * smoothstep(
      OCEAN_CREST.heightStart,
      OCEAN_CREST.heightFull,
      (Number.isFinite(heightValue) ? heightValue : 0) / amplitude
    );
  return whitecap * (0.52 + clamp(crestMaskValue, 0, 1) * 0.48);
}

function createRingGeometry(THREE, size, innerSize, segments) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const step = size / segments;
  const half = size * 0.5;
  const innerHalf = innerSize * 0.5;

  // Shared vertices cut clipmap vertex traffic by roughly four. aGridStep lets
  // the shader band-limit waves that a level cannot represent instead of
  // folding short wavelengths into the large polygonal cells seen on screen.
  for (let iz = 0; iz <= segments; iz++) {
    const z = -half + iz * step;
    for (let ix = 0; ix <= segments; ix++) {
      positions.push(-half + ix * step, 0, z);
      uvs.push(ix / segments, iz / segments);
    }
  }

  const stride = segments + 1;
  for (let iz = 0; iz < segments; iz++) {
    const z0 = -half + iz * step;
    for (let ix = 0; ix < segments; ix++) {
      const x0 = -half + ix * step;
      const cx = x0 + step * 0.5;
      const cz = z0 + step * 0.5;
      if (innerSize > 0 && Math.abs(cx) < innerHalf && Math.abs(cz) < innerHalf) continue;
      const a = iz * stride + ix;
      const b = a + stride;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute(
    "aGridStep",
    new THREE.Float32BufferAttribute(new Float32Array((segments + 1) * (segments + 1)).fill(step), 1)
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export class PersistentWakeField {
  constructor(THREE, { resolution = 192, worldSize = 165 } = {}) {
    this.THREE = THREE;
    this.resolution = resolution;
    this.worldSize = worldSize;
    this.grid = new WakeGrid({ resolution, worldSize });
    this.centerX = 0;
    this.centerZ = 0;
    this.visualAccumulator = 0;
    this.visualInterval = 1 / 36;
    this.stamps = [];

    this.canvas = typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(resolution, resolution)
      : document.createElement("canvas");
    this.canvas.width = resolution;
    this.canvas.height = resolution;
    this.context = this.canvas.getContext("2d", { alpha: false, desynchronized: true, willReadFrequently: false });
    if (!this.context) throw new Error("Canvas 2D is required for the wake texture");
    this.imageData = this.context.createImageData
      ? this.context.createImageData(resolution, resolution)
      : { data: new Uint8ClampedArray(resolution * resolution * 4), width: resolution, height: resolution };
    this.grid.encodeRGBA(this.imageData.data);
    this.context.putImageData?.(this.imageData, 0, 0);

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.needsUpdate = true;
  }

  trail(x, z, heading, speed, strength = 1) {
    this.grid.stampTrail(x, z, heading, speed, clamp(strength, 0.15, 2.5));
  }

  burst(x, z, radius = 5, strength = 1) {
    this.grid.stampBurst(x, z, radius, clamp(strength, 0.25, 3.5));
  }

  line(x0, z0, x1, z1, strength = 1) {
    this.grid.stampLine(x0, z0, x1, z1, strength);
  }

  setQuality(tier) {
    this.visualInterval = tier <= 0 ? 1 / 18 : tier === 1 ? 1 / 26 : 1 / 36;
  }

  update(dt, centerX, centerZ, currentX = 0, currentZ = 0) {
    const stepped = this.grid.update(dt, centerX, centerZ, currentX, currentZ);
    this.centerX = this.grid.centerX;
    this.centerZ = this.grid.centerZ;
    this.visualAccumulator += dt;
    if (!stepped || this.visualAccumulator < this.visualInterval) return false;
    this.visualAccumulator = 0;
    this.grid.encodeRGBA(this.imageData.data);
    this.context.putImageData?.(this.imageData, 0, 0);
    this.texture.needsUpdate = true;
    return true;
  }

  sampleDetails(x, z, out) {
    return this.grid.sample(x, z, out);
  }

  sample(x, z) {
    const sample = this.grid.sample(x, z);
    return clamp(sample.height + sample.foam * 0.075, -1.5, 1.5);
  }

  energy() {
    return this.grid.energy();
  }
}


// Normal map de détail de surface, générée au démarrage.
//
// Le fragment perturbait la normale avec deux octaves de value-noise évaluées
// par pixel — un bruit ISOTROPE, sans arête ni direction de vent, qui donnait à
// la mer son aspect « gelée plastique ». Et c'était cher : sur 65 % de l'écran,
// une vingtaine de hachages par fragment en comptant la dentelle de mousse.
//
// Ici on paie le bruit UNE fois au boot, dans un canvas, et le shader fait deux
// lectures de texture. C'est un gain visuel ET un gain de performance. Générée
// plutôt que téléchargée : zéro octet, zéro entrée de service-worker, et le
// monofichier reste autonome.
function makeSeaDetailTexture(THREE, size = 256) {
  const canvas = typeof OffscreenCanvas !== "undefined"
    ? new OffscreenCanvas(size, size)
    : Object.assign(document.createElement("canvas"), { width: size, height: size });
  canvas.width = size;
  canvas.height = size;
  // Repli : normale plate, zéro crête. Toujours une texture VALIDE — un uniform
  // sampler2D nul se comporte mal selon les pilotes, et le harnais de test n'a
  // pas de canvas complet (createImageData absent du mock).
  const flat = () => {
    if (!THREE.DataTexture) return null;
    const texture = new THREE.DataTexture(new Uint8Array([128, 128, 255, 0]), 1, 1);
    texture.needsUpdate = true;
    return texture;
  };
  const context = canvas.getContext?.("2d", { alpha: true });
  if (!context || typeof context.createImageData !== "function" || typeof context.putImageData !== "function") {
    return flat();
  }

  // Bruit de valeur tuilable : on interpole sur une grille cyclique.
  const lattice = (period, seed) => {
    const values = new Float32Array(period * period);
    let state = seed >>> 0 || 1;
    for (let i = 0; i < values.length; i++) {
      state ^= state << 13; state >>>= 0;
      state ^= state >>> 17;
      state ^= state << 5; state >>>= 0;
      values[i] = state / 4294967296;
    }
    return values;
  };
  const smooth = (t) => t * t * (3 - 2 * t);
  const sample = (values, period, x, y) => {
    const fx = x * period;
    const fy = y * period;
    const x0 = Math.floor(fx) % period;
    const y0 = Math.floor(fy) % period;
    const x1 = (x0 + 1) % period;
    const y1 = (y0 + 1) % period;
    const tx = smooth(fx - Math.floor(fx));
    const ty = smooth(fy - Math.floor(fy));
    const a = values[y0 * period + x0] * (1 - tx) + values[y0 * period + x1] * tx;
    const b = values[y1 * period + x0] * (1 - tx) + values[y1 * period + x1] * tx;
    return a * (1 - ty) + b * ty;
  };

  const octaves = [
    { values: lattice(8, 0x9e37), period: 8, weight: 0.55 },
    { values: lattice(16, 0x85eb), period: 16, weight: 0.30 },
    { values: lattice(32, 0xc2b2), period: 32, weight: 0.15 }
  ];
  // This field must be periodic in both axes. The old x/stretch sampling made
  // opposite edges disagree and drew a hard seam at every texture repeat.
  // Directional stretching is now applied safely in wind space in the shader.
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let value = 0;
      for (const octave of octaves) {
        value += sample(octave.values, octave.period, x / size, y / size) * octave.weight;
      }
      height[y * size + x] = value;
    }
  }

  const image = context.createImageData(size, size);
  const data = image.data;
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Différences finies -> normale tangente.
      const dx = (at(x + 1, y) - at(x - 1, y)) * 2.6;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 2.6;
      const length = Math.sqrt(dx * dx + dy * dy + 1);
      const index = (y * size + x) * 4;
      data[index] = Math.round((-dx / length * 0.5 + 0.5) * 255);
      data[index + 1] = Math.round((-dy / length * 0.5 + 0.5) * 255);
      data[index + 2] = Math.round((1 / length * 0.5 + 0.5) * 255);
      // Alpha = masque de crête, réutilisé pour la dentelle de mousse.
      data[index + 3] = Math.round(Math.min(1, Math.max(0, (at(x, y) - 0.57) * 5.2)) * 255);
    }
  }
  context.putImageData(image, 0, 0);

  if (!THREE.CanvasTexture) return flat();
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true;
  if (THREE.LinearMipmapLinearFilter) texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export class OceanSystem {
  constructor(THREE, scene, waveField, options = {}) {
    this.THREE = THREE;
    this.scene = scene;
    this.waveField = waveField;
    this.quality = options.quality ?? 2;
    this.graphicStyle = Boolean(options.graphicStyle);
    this.rings = [];
    this.islands = [];
    this.wake = new PersistentWakeField(THREE, {
      resolution: this.quality >= 2 ? 192 : 128,
      worldSize: this.quality >= 2 ? 170 : 150
    });

    const waves = waveField.shaderData(8);
    const waveDeclarations = waves.map((_, index) => `float p${index};`).join("\n");

    // ⚠️ LA DISTANCE À LA CÔTE ÉTAIT PAYÉE PAR FRAGMENT, POUR RIEN.
    //
    // Cette boucle tourne sur huit îles, et le `break` ne coupe jamais : le jeu
    // en fournit toujours exactement huit (`nearestIslands(z, limit = 8)`).
    // Chaque tour fait deux `length` et quatre divisions ; l'ensemble revient à
    // une quarantaine de divisions et seize racines carrées PAR FRAGMENT — sur
    // les trois quarts de l'écran, à chaque image, alors que le résultat n'est
    // consommé qu'en deçà de 28 m d'un rivage (`shallow`) et de 2,8 m pour
    // l'écume. Plus de 95 % des pixels payaient plein tarif pour une valeur
    // aussitôt écrasée par un `smoothstep`.
    //
    // Le même code sert maintenant AUX DEUX étages : au sommet, où le clipmap
    // compte quelques milliers de points, pour décider ; au fragment, seulement
    // là où c'est près. La branche est cohérente par tuile — la proximité d'une
    // côte varie continûment à l'écran — donc elle ne coûte pas sa divergence.
    const coastDeclarations = `
        float coastDistance(vec2 p) {
          float best = 99.0;
          for (int i = 0; i < 8; i++) {
            if (i >= uIslandCount) break;
            vec4 island = uIslands[i];
            vec2 q = (p - island.xy) / max(island.zw, vec2(0.1));
            float qLength = max(length(q), 0.001);
            vec2 gradient = (p - island.xy) / max(island.zw * island.zw, vec2(0.01));
            float distance = abs(qLength - 1.0) * qLength / max(length(gradient), 0.001);
            best = min(best, distance);
          }
          return best;
        }`;
    // Marge au-delà du seuil de `shallow` (28 m) : le varying est interpolé
    // linéairement entre des sommets qui peuvent être distants de plusieurs
    // mètres sur les anneaux extérieurs du clipmap. Sans cette marge, un
    // fragment réellement à 27 m pourrait être écarté par un voisin à 41.
    const COAST_GATE = 52.0;
    const waveCode = waves.map((wave, index) => {
      const wavelength = Math.PI * 2 / wave.k;
      // La physique amortit les trois composantes les plus courtes. Le shader
      // doit employer exactement le même facteur, sinon la coque répond à une
      // vague qui n'a pas l'amplitude affichée.
      const amplitude = wave.amplitude * (index > 4 ? 0.78 : 1);
      const direction = index % 3 === 1
        ? `vec2 d${index} = vec2(
        ${wave.dx.toFixed(7)} * uCrossRotation.x - ${wave.dz.toFixed(7)} * uCrossRotation.y,
        ${wave.dx.toFixed(7)} * uCrossRotation.y + ${wave.dz.toFixed(7)} * uCrossRotation.x
      );`
        : `vec2 d${index} = vec2(${wave.dx.toFixed(7)}, ${wave.dz.toFixed(7)});`;
      const crestCarrier = index < 3
        ? `crestCurve += -sin(p${index}) * ${(amplitude * wave.k * wave.k).toFixed(7)} * uWaveAmplitude * w${index};`
        : "";
      return `
      float w${index} = 1.0 - smoothstep(${(wavelength * 0.30).toFixed(7)}, ${(wavelength * 0.55).toFixed(7)}, aGridStep);
      ${direction}
      p${index} = dot(world.xz, d${index}) * ${wave.k.toFixed(7)}
        + uTime * ${wave.speed.toFixed(7)} + ${wave.phase.toFixed(7)};
      h += sin(p${index}) * ${amplitude.toFixed(7)} * uWaveAmplitude * w${index};
      sx += cos(p${index}) * ${(amplitude * wave.k).toFixed(7)} * d${index}.x * uWaveAmplitude * w${index};
      sz += cos(p${index}) * ${(amplitude * wave.k).toFixed(7)} * d${index}.y * uWaveAmplitude * w${index};
      curve += -sin(p${index}) * ${(amplitude * wave.k * wave.k).toFixed(7)} * uWaveAmplitude * w${index};
      ${crestCarrier}
    `;
    }).join("\n");

    this.uniforms = {
      uTime: { value: 0 },
      uStorm: { value: 0 },
      uWaveAmplitude: { value: 1 },
      uCrossRotation: { value: new THREE.Vector2(1, 0) },
      uWakeTex: { value: this.wake.texture },
      uWakeCenter: { value: new THREE.Vector2(0, 0) },
      uWakeWorldSize: { value: this.wake.worldSize },
      uWakeTexel: { value: 1 / this.wake.resolution },
      uDeep: { value: new THREE.Color(0x0d4f63) },
      uMid: { value: new THREE.Color(0x168697) },
      uShallow: { value: new THREE.Color(0x2fb9c4) },
      uFoam: { value: new THREE.Color(0xeefaff) },
      uSky: { value: new THREE.Color(0x70c8dc) },
      uHaze: { value: new THREE.Color(0xd1f3f7) },
      uSunDir: { value: new THREE.Vector3(-0.4, 0.72, -0.32).normalize() },
      uDetail: { value: 1 },
      uGraphicStyle: { value: this.graphicStyle ? 1 : 0 },
      uSeaDetail: { value: makeSeaDetailTexture(THREE) },
      uWindDir: { value: new THREE.Vector2(0.34, 0.94) },
      uIslandCount: { value: 0 },
      uIslands: { value: Array.from({ length: 8 }, () => new THREE.Vector4(9999, 9999, 1, 1)) }
    };

    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.DoubleSide,
      transparent: false,
      vertexShader: `
        precision highp float;
        // ⚠️ LA PRÉCISION DES ENTIERS DOIT ÊTRE DÉCLARÉE DES DEUX CÔTÉS.
        // En GLSL ES 1.0 elle vaut highp par défaut au sommet et mediump au
        // fragment : dès que le même uniform entier apparaît dans les deux
        // étages, l'édition de liens échoue avec « Precisions of uniform
        // 'uIslandCount' differ ». Le shader compile, c'est le LINK qui casse —
        // donc rien ne le signale avant le premier rendu réel.
        precision highp int;
        uniform float uTime;
        uniform float uStorm;
        uniform float uWaveAmplitude;
        uniform vec2 uCrossRotation;
        uniform sampler2D uWakeTex;
        uniform vec2 uWakeCenter;
        uniform float uWakeWorldSize;
        uniform float uWakeTexel;
        uniform int uIslandCount;
        uniform vec4 uIslands[8];
        attribute float aGridStep;
        varying vec3 vWorld;
        varying vec3 vNormalW;
        varying float vHeight;
        varying float vCurvature;
        varying float vCrestCurvature;
        varying float vWake;
        varying float vWakeFoam;
        varying vec2 vWakeUv;
        varying float vCoast;

        ${coastDeclarations}

        ${waveDeclarations}

        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          float h = 0.0;
          float sx = 0.0;
          float sz = 0.0;
          float curve = 0.0;
          float crestCurve = 0.0;
          ${waveCode}

          vec2 wakeUv = (world.xz - uWakeCenter) / uWakeWorldSize + 0.5;
          float wake = 0.0;
          float wakeDx = 0.0;
          float wakeDz = 0.0;
          if (wakeUv.x > 0.0 && wakeUv.x < 1.0 && wakeUv.y > 0.0 && wakeUv.y < 1.0) {
            vec4 wakeSample = texture2D(uWakeTex, wakeUv);
            wake = (wakeSample.r - 0.5) * 3.6;
            float wx0 = (texture2D(uWakeTex, wakeUv - vec2(uWakeTexel, 0.0)).r - 0.5) * 3.6;
            float wx1 = (texture2D(uWakeTex, wakeUv + vec2(uWakeTexel, 0.0)).r - 0.5) * 3.6;
            float wz0 = (texture2D(uWakeTex, wakeUv - vec2(0.0, uWakeTexel)).r - 0.5) * 3.6;
            float wz1 = (texture2D(uWakeTex, wakeUv + vec2(0.0, uWakeTexel)).r - 0.5) * 3.6;
            wakeDx = (wx1 - wx0) * 0.34;
            wakeDz = (wz1 - wz0) * 0.34;
            vWakeFoam = wakeSample.g;
          }

          // LOD géométrique. Les anneaux lointains du clipmap ont des quads de
          // plusieurs mètres alors que la houle contient des composantes bien plus
          // courtes : déplacer à pleine amplitude y repliait la surface en bandes.
          // On aplatit progressivement — le shading et la brume prennent le relais.
          // La simulation reste intacte : elle échantillonne WaveField côté CPU.
          float camDist = length(cameraPosition.xz - world.xz);
          float geoFade = 1.0 - smoothstep(120.0, 600.0, camDist);
          h *= geoFade;
          sx *= geoFade;
          sz *= geoFade;
          curve *= geoFade;
          crestCurve *= geoFade;

          // Le sillage est encore plus fin (0,88 m/cellule) : il s'éteint plus tôt.
          float wakeFade = 1.0 - smoothstep(60.0, 190.0, camDist);
          wake *= wakeFade;
          vWakeFoam *= wakeFade;
          h += wake * (0.45 + uStorm * 0.12);
          sx += wakeDx * wakeFade;
          sz += wakeDz * wakeFade;
          world.y += h;
          vWorld = world.xyz;
          // Quelques milliers de sommets contre plusieurs centaines de milliers
          // de fragments : c'est ici que la distance à la côte se paie.
          //
          // ⚠️ ON SOUSTRAIT LE PAS DE GRILLE, et ce n'est pas de la prudence
          // gratuite. Le varying est interpolé entre deux sommets qui, sur
          // l'anneau extérieur du clipmap, sont distants de près de soixante-dix
          // mètres : un fragment réellement à vingt mètres d'un rivage pourrait
          // hériter d'une valeur bien plus grande et se voir refuser le calcul
          // exact — la frange d'eau claire disparaîtrait autour des îles
          // lointaines. En retranchant le pas de grille, le varying devient une
          // BORNE INFÉRIEURE : il peut faire recalculer pour rien, jamais
          // sauter à tort.
          //
          // (Et pas d'accent grave dans ce commentaire : il est à l'intérieur
          // d'un gabarit JavaScript, un seul y refermerait la chaîne. C'est
          // exactement ce qui vient d'arriver.)
          vCoast = coastDistance(world.xz) - aGridStep;
          vNormalW = normalize(vec3(-sx, 1.0, -sz));
          vHeight = h;
          vCurvature = curve;
          vCrestCurvature = crestCurve;
          vWake = wake;
          if (wakeUv.x <= 0.0 || wakeUv.x >= 1.0 || wakeUv.y <= 0.0 || wakeUv.y >= 1.0) vWakeFoam = 0.0;
          vWakeUv = wakeUv;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: `
        precision highp float;
        // Doit correspondre au sommet : voir la note là-bas.
        precision highp int;
        uniform float uTime;
        uniform float uStorm;
        uniform float uWaveAmplitude;
        uniform vec3 uDeep;
        uniform vec3 uMid;
        uniform vec3 uShallow;
        uniform vec3 uFoam;
        uniform vec3 uSky;
        uniform vec3 uHaze;
        uniform vec3 uSunDir;
        uniform float uDetail;
        uniform float uGraphicStyle;
        uniform sampler2D uSeaDetail;
        uniform vec2 uWindDir;
        uniform int uIslandCount;
        uniform vec4 uIslands[8];
        varying vec3 vWorld;
        varying vec3 vNormalW;
        varying float vHeight;
        varying float vCurvature;
        varying float vCrestCurvature;
        varying float vWake;
        varying float vWakeFoam;
        varying float vCoast;
        // Le fragment ne déclarait NI uWakeTex NI vWakeUv : vWakeUv était un
        // varying mort et la mousse n'arrivait qu'échantillonnée PAR SOMMET,
        // soit tous les 1,52 m sur l'anneau proche. Une traînée de 1 à 2 m de
        // large était donc moyennée dans le vide — le sillage ne se voyait pas.
        uniform sampler2D uWakeTex;
        varying vec2 vWakeUv;

        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }

        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
                     mix(hash21(i + vec2(0.0, 1.0)), hash21(i + 1.0), f.x), f.y);
        }

        ${coastDeclarations}

        void main() {
          vec3 normal = normalize(vNormalW);

          vec3 viewDir = normalize(cameraPosition - vWorld);
          float viewDist = length(cameraPosition.xz - vWorld.xz);

          // Long wind-aligned ripples replace the isotropic cellular pattern.
          // The source texture is periodic; rotating/scaling its coordinates
          // here preserves that continuity while making crests read as water.
          vec2 wind = normalize(uWindDir);
          vec2 crossWind = vec2(-wind.y, wind.x);
          vec2 windSpace = vec2(dot(vWorld.xz, crossWind), dot(vWorld.xz, wind));
          float detailFade = 1.0 - smoothstep(38.0, 245.0, viewDist);
          vec4 coarse = vec4(0.5, 0.5, 1.0, 0.0);
          vec4 fine = vec4(0.5, 0.5, 1.0, 0.0);
          float crestMask = 0.0;
          if (uDetail > 0.5 && detailFade > 0.002) {
            coarse = texture2D(uSeaDetail, windSpace * vec2(0.026, 0.082) + vec2(0.0, uTime * 0.0065));
            fine = texture2D(uSeaDetail, windSpace * vec2(0.070, 0.205) + vec2(0.19, -uTime * 0.011));
            vec2 rippleWind = ((coarse.xy - 0.5) * 0.52 + (fine.xy - 0.5) * 0.26) * vec2(0.58, 1.10);
            vec2 rippleWorld = crossWind * rippleWind.x + wind * rippleWind.y;
            normal.xz += rippleWorld * detailFade;
            normal = normalize(normal);
            crestMask = max(coarse.a, fine.a);
          }

          // One very low-frequency sample carries readable swell after the
          // coarse clipmap geometry has deliberately flattened near the horizon.
          float swellFade = 1.0 - smoothstep(110.0, 920.0, viewDist);
          if (uDetail > 0.5 && swellFade > 0.002) {
            vec4 swell = texture2D(uSeaDetail, windSpace * vec2(0.010, 0.024) + vec2(0.07, uTime * 0.0028));
            vec2 swellWind = (swell.xy - 0.5) * vec2(0.34, 0.72);
            normal.xz += (crossWind * swellWind.x + wind * swellWind.y) * swellFade;
            normal = normalize(normal);
          }

          float ndv = clamp(dot(normal, viewDir), 0.0, 1.0);
          float fresnel = 0.025 + 0.975 * pow(1.0 - ndv, 5.0);
          float sunLight = max(dot(normal, uSunDir), 0.0);
          float glintDot = max(dot(reflect(-uSunDir, normal), viewDir), 0.0);
          // Le speculaire est une constellation de petites facettes, pas un
          // projecteur flou. Le masque de micro-crete casse les grandes zones
          // ou la normale basse frequence s'aligne d'un bloc avec le soleil.
          float sparkleMask = 0.24 + crestMask * 0.76;
          float glitter = pow(glintDot, mix(
            ${OCEAN_GLINT.sparkleExponentFar.toFixed(1)},
            ${OCEAN_GLINT.sparkleExponentNear.toFixed(1)},
            detailFade
          )) * mix(0.24, 0.82, detailFade) * sparkleMask;
          float glitterPath = pow(glintDot, mix(
            ${OCEAN_GLINT.pathExponentFar.toFixed(1)},
            ${OCEAN_GLINT.pathExponentNear.toFixed(1)},
            detailFade
          )) * (0.42 + crestMask * 0.40);

          // Le sommet a déjà tranché : loin de tout rivage, on ne recalcule
          // rien. Près d'un rivage, on reprend la valeur exacte par fragment —
          // l'écume de côte est fine, un varying interpolé la ferait baver.
          float coast = 99.0;
          if (vCoast < ${COAST_GATE.toFixed(1)}) coast = coastDistance(vWorld.xz);
          float shallow = 1.0 - smoothstep(1.0, 28.0, coast);
          float coastFoam = (1.0 - smoothstep(0.20, 2.8, coast))
            * (0.62 + max(coarse.a, fine.a) * 0.46);
          float cloudShadow = 1.0
            + (noise(vWorld.xz * 0.007 + vec2(uTime * 0.012, -uTime * 0.008)) - 0.5)
            * mix(0.16, 0.34, uStorm);

          // Tropical depth first, reflection second. Direct light only nudges
          // value; using it as the main color mixer exposed every grid triangle.
          float heightTint = smoothstep(-0.85, 0.85, vHeight);
          vec3 color = mix(uDeep, uMid, 0.30 + heightTint * 0.20);
          color = mix(color, uShallow, shallow * 0.68);
          color = mix(color, uSky, fresnel * 0.62);
          color *= cloudShadow * (0.92 + sunLight * 0.10);
          color += vec3(1.0, 0.73, 0.38) * glitter
            * ${OCEAN_GLINT.sparkleGain.toFixed(2)} * (1.0 - uStorm * 0.48);
          color += vec3(1.0, 0.58, 0.25) * glitterPath
            * ${OCEAN_GLINT.pathGain.toFixed(2)} * (1.0 - uStorm * 0.62);

          if (uDetail > 0.5) {
            float sss = pow(max(dot(viewDir, -uSunDir), 0.0), 3.0)
              * smoothstep(0.32, 0.96, vHeight);
            color += vec3(0.12, 0.58, 0.48) * sss * 0.46 * (1.0 - uStorm * 0.55);
          }

          // Porteuse signée des trois houles lisibles. Les petites composantes
          // restent dans la normale, mais ne peuvent plus faire mousser un
          // creux. Le masque texturé effiloche seulement le bord de la crête.
          float crestCompression = max(-vCrestCurvature, 0.0)
            / max(uWaveAmplitude, 0.001);
          float crestFoam = smoothstep(
            mix(${OCEAN_CREST.calmStart.toFixed(3)}, ${OCEAN_CREST.stormStart.toFixed(3)}, uStorm),
            mix(${OCEAN_CREST.calmFull.toFixed(3)}, ${OCEAN_CREST.stormFull.toFixed(3)}, uStorm),
            crestCompression
          );
          crestFoam *= smoothstep(
            ${OCEAN_CREST.heightStart.toFixed(3)},
            ${OCEAN_CREST.heightFull.toFixed(3)},
            vHeight / max(uWaveAmplitude, 0.001)
          );
          crestFoam *= 0.52 + coarse.a * 0.48;
          float wakeTexel = 0.0;
          if (vWakeUv.x > 0.0 && vWakeUv.x < 1.0 && vWakeUv.y > 0.0 && vWakeUv.y < 1.0) {
            wakeTexel = texture2D(uWakeTex, vWakeUv).g;
          }
          float wakeFoam = max(max(vWakeFoam, wakeTexel), smoothstep(0.05, 0.34, abs(vWake)));
          float foam = clamp(crestFoam * 0.70 + wakeFoam * 1.52 + coastFoam * 0.88, 0.0, 1.0);
          color = mix(color, uFoam, foam * 0.90);
          color = mix(color, vec3(0.025, 0.045, 0.08), uStorm * 0.34);

          // The far ring is flat and nearly the exact sky-horizon color, so its
          // outer edge cannot form a dark seam even when the camera rolls.
          float atmosphere = smoothstep(120.0, 720.0, viewDist);
          if (uGraphicStyle > 0.5) {
            // “Gravure Alizé” : de longues veines guidées par le vent, plutôt
            // qu'un bruit cellulaire ou des plaques de BD arbitraires. Elles
            // indiquent visuellement la direction de navigation et disparaissent
            // avant l'horizon pour ne pas produire de moiré.
            float ribbonA = 0.5 + 0.5 * sin(
              windSpace.x * 0.155
              + sin(windSpace.y * 0.027 - uTime * 0.42) * 1.65
            );
            float ribbonB = 0.5 + 0.5 * sin(
              windSpace.x * 0.071
              - windSpace.y * 0.014
              + uTime * 0.24
            );
            float inkRibbon = smoothstep(0.80, 0.96, ribbonA)
              * (0.48 + smoothstep(0.58, 0.92, ribbonB) * 0.52)
              * (1.0 - smoothstep(90.0, 430.0, viewDist));
            float heightBand = floor(clamp(heightTint, 0.0, 0.999) * 4.0) / 3.0;
            vec3 posterSea = mix(uDeep, uMid, 0.22 + heightBand * 0.38);
            posterSea = mix(posterSea, uShallow, shallow * 0.72);
            color = mix(color, posterSea, 0.44);
            color = mix(color, uDeep * 0.34, inkRibbon * 0.27);
            // Une vraie crête peut franchir seule le cutout Gravure ; elle
            // n'attend plus qu'un sillage ou un rivage lui apporte le reste.
            float graphicFoam = max(foam, crestFoam * 0.78);
            float cutFoam = step(0.54, graphicFoam)
              * (0.66 + step(0.78, graphicFoam) * 0.34);
            color = mix(color, uFoam, cutFoam * 0.84);
          }
          color = mix(color, uHaze, atmosphere * 0.94);
          gl_FragColor = vec4(color, 1.0);
        }
      `
    });

    const levels = [
      { size: 82, inner: 0, segments: 60 },
      { size: 190, inner: 76, segments: 58 },
      { size: 520, inner: 176, segments: 60 },
      // ⚠️ 1680 -> 4200, ET C'EST LE CORRECTIF DU « BORD DU MONDE ».
      //
      // `createRingGeometry` prend une TAILLE, dont il fait `half = size * 0.5`.
      // L'anneau le plus large s'arrêtait donc à 840 m du bateau — alors que le
      // brouillard (FogExp2, densité 0,00225) laisse encore passer 15 % de
      // lumière à cette distance. Le disque d'eau se découpait en silhouette
      // arrondie sur un ciel clair : on voyait littéralement le bord de la
      // carte, avec les montagnes peintes derrière.
      //
      // À 2100 m, la transmittance tombe à 0,9 % : le bord est noyé avant
      // d'être visible. Le nombre de segments ne change PAS — c'est le même
      // maillage étalé plus loin, donc aucun sommet de plus. Le shader
      // band-limite déjà les vagues par niveau via `aGridStep`, les grandes
      // cellules sont prévues pour ça.
      { size: 4200, inner: 480, segments: 62 }
    ];

    for (let index = 0; index < levels.length; index++) {
      const level = levels[index];
      const mesh = new THREE.Mesh(createRingGeometry(THREE, level.size, level.inner, level.segments), this.material);
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      // ⚠️ PASSE 90 : LA MER SE DESSINE APRÈS LES BATEAUX (ordre 10+, les
      // yoles sont à 0, leur masque de cale à 5). Opaque, elle reste testée
      // en profondeur comme avant ; mais dessinée après le masque de cale
      // (profondeur seule, en forme de coque), elle ne peut plus apparaître
      // À L'INTÉRIEUR d'une yole quand la houle passe au-dessus du plancher.
      // Dessinée avant (−10), rien ne pouvait plus l'effacer là.
      mesh.renderOrder = 10 + index;
      scene.add(mesh);
      this.rings.push({ mesh, ...level });
    }

    this.setQuality(this.quality);
  }

  setIslands(islands) {
    this.islands = islands.slice(0, 8);
    this.uniforms.uIslandCount.value = this.islands.length;
    for (let index = 0; index < 8; index++) {
      const target = this.uniforms.uIslands.value[index];
      const island = this.islands[index];
      if (island) target.set(island.x, island.z, island.rx, island.rz);
      else target.set(9999, 9999, 1, 1);
    }
  }

  setStagePalette(palette = null) {
    const selected = { ...DEFAULT_OCEAN_PALETTE, ...(palette ?? {}) };
    this.uniforms.uDeep.value.setHex(selected.deep);
    this.uniforms.uMid.value.setHex(selected.mid);
    this.uniforms.uShallow.value.setHex(selected.shallow);
    this.uniforms.uFoam.value.setHex(selected.foam);
  }

  setQuality(tier) {
    this.quality = tier;
    this.wake.setQuality(tier);
    this.uniforms.uDetail.value = tier === 0 ? 0 : 1;
    this.rings.forEach((ring, index) => {
      ring.mesh.visible = tier === 0 ? index < 3 : true;
    });
  }

  update(dt, time, focusX, focusZ, stormAmount, windX = null, windZ = null) {
    // setWeather() N'EST PLUS appelé ici : il écrit l'amplitude de houle que la
    // PHYSIQUE échantillonne, et ce chemin tourne à la cadence d'image. La
    // correspondance tick -> amplitude dépendait donc du frame pacing, ce qui
    // rendait les replays non bit-exacts en navigateur. Il est désormais appelé
    // depuis fixedUpdate (game.js), sur l'horloge fixe.
    // La suite Node ne voyait rien : elle n'appelle jamais ocean.update(), donc
    // l'amplitude de tempête n'y était tout simplement JAMAIS exercée.
    this.uniforms.uTime.value = time;
    this.uniforms.uStorm.value = stormAmount;
    this.uniforms.uWaveAmplitude.value = this.waveField.globalAmplitude;
    const crossRotation = this.waveField.crossSea * 0.38;
    this.uniforms.uCrossRotation.value.set(Math.cos(crossRotation), Math.sin(crossRotation));
    if (Number.isFinite(windX) && Number.isFinite(windZ)) {
      const windLength = Math.hypot(windX, windZ);
      if (windLength > 1e-5) {
        this.uniforms.uWindDir.value.set(windX / windLength, windZ / windLength);
      }
    }
    // wake.update() N'EST PLUS appelé ici, pour exactement la même raison que
    // setWeather ci-dessus : la grille de sillage est échantillonnée par la
    // PHYSIQUE (yole-physics.js lit sampleDisturbance pour composer waterHeight,
    // donc la poussée d'Archimède). L'avancer à la cadence d'image, recentrée
    // sur une position de RENDU, donnait au rendu autorité sur le gameplay — la
    // règle que ce projet interdit. Elle avance désormais depuis fixedUpdate,
    // sur l'horloge fixe et sur une position de SIMULATION.
    //
    // Ne reste ici que la synchronisation de l'uniforme, qui est du rendu pur.
    this.uniforms.uWakeCenter.value.set(this.wake.centerX, this.wake.centerZ);

    const snap = 1.5;
    const snappedX = Math.round(focusX / snap) * snap;
    const snappedZ = Math.round(focusZ / snap) * snap;
    for (const ring of this.rings) ring.mesh.position.set(snappedX, 0, snappedZ);
  }

  // Avancée de la grille de sillage, appelée depuis fixedUpdate avec le pas
  // FIXE et une position de simulation. C'est la moitié « gameplay » de ce qui
  // était autrefois dans update() : elle décide de ce que sampleDisturbance
  // renverra à la physique.
  fixedUpdateWake(dt, time, centerX, centerZ, stormAmount) {
    const currentX = Math.sin(time * 0.041) * (0.18 + stormAmount * 0.22);
    const currentZ = 0.22 + stormAmount * 0.34;
    this.wake.update(dt, centerX, centerZ, currentX, currentZ);
  }

  sampleDisturbance(x, z) {
    return this.wake.sample(x, z);
  }
}
