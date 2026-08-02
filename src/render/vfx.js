import { clamp, damp } from "../core/math.js";

export class ParticlePool {
  constructor(THREE, scene, maxParticles = 1500) {
    this.THREE = THREE;
    this.max = maxParticles;
    this.active = new Uint8Array(maxParticles);
    this.life = new Float32Array(maxParticles);
    this.maxLife = new Float32Array(maxParticles);
    this.x = new Float32Array(maxParticles);
    this.y = new Float32Array(maxParticles);
    this.z = new Float32Array(maxParticles);
    this.vx = new Float32Array(maxParticles);
    this.vy = new Float32Array(maxParticles);
    this.vz = new Float32Array(maxParticles);
    this.gravity = new Float32Array(maxParticles);
    this.drag = new Float32Array(maxParticles);
    this.r = new Float32Array(maxParticles);
    this.g = new Float32Array(maxParticles);
    this.b = new Float32Array(maxParticles);
    this.baseSize = new Float32Array(maxParticles);
    this.cursor = 0;

    this.renderPositions = new Float32Array(maxParticles * 3);
    this.renderColors = new Float32Array(maxParticles * 3);
    this.renderSizes = new Float32Array(maxParticles);
    this.renderAlphas = new Float32Array(maxParticles);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.renderPositions, 3));
    geometry.setAttribute("aColor", new THREE.BufferAttribute(this.renderColors, 3));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(this.renderSizes, 1));
    geometry.setAttribute("aAlpha", new THREE.BufferAttribute(this.renderAlphas, 1));
    geometry.setDrawRange(0, 0);
    this.geometry = geometry;

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aAlpha;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (260.0 / max(1.0, -mv.z));
          vColor = aColor;
          vAlpha = aAlpha;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float d = dot(p,p) * 4.0;
          float alpha = smoothstep(1.0, 0.0, d) * vAlpha;
          gl_FragColor = vec4(vColor, alpha);
        }
      `
    });
    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  allocate() {
    for (let attempt = 0; attempt < this.max; attempt++) {
      const index = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      if (!this.active[index]) {
        this.active[index] = 1;
        return index;
      }
    }
    const index = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.active[index] = 1;
    return index;
  }

  clear() {
    this.active.fill(0);
    this.life.fill(0);
    this.maxLife.fill(0);
    this.cursor = 0;
    this.geometry.setDrawRange(0, 0);
  }

  emitBurst(rng, position, color, count, options = {}) {
    const THREE = this.THREE;
    const parsed = color instanceof THREE.Color ? color : new THREE.Color(color);
    const speed = options.speed ?? 2;
    const upward = options.upward ?? 1.5;
    const lifeMin = options.lifeMin ?? 0.35;
    const lifeMax = options.lifeMax ?? 1.0;
    const sizeMin = options.sizeMin ?? 0.18;
    const sizeMax = options.sizeMax ?? 0.6;
    const gravity = options.gravity ?? 4.6;
    const drag = options.drag ?? 0.8;

    for (let n = 0; n < count; n++) {
      const index = this.allocate();
      const angle = rng.next() * Math.PI * 2;
      const radial = rng.range(0.25, 1) * speed;
      this.x[index] = position.x + rng.signed() * 0.35;
      this.y[index] = position.y + rng.range(0, 0.35);
      this.z[index] = position.z + rng.signed() * 0.35;
      this.vx[index] = Math.cos(angle) * radial;
      this.vy[index] = rng.range(0.25, upward) * speed;
      this.vz[index] = Math.sin(angle) * radial;
      this.life[index] = this.maxLife[index] = rng.range(lifeMin, lifeMax);
      this.gravity[index] = gravity;
      this.drag[index] = drag;
      this.r[index] = parsed.r;
      this.g[index] = parsed.g;
      this.b[index] = parsed.b;
      this.baseSize[index] = rng.range(sizeMin, sizeMax);
    }
  }

  update(dt, budget = 1) {
    let write = 0;
    const maxWrite = Math.floor(this.max * clamp(budget, 0.2, 1));
    for (let index = 0; index < this.max; index++) {
      if (!this.active[index]) continue;
      this.life[index] -= dt;
      if (this.life[index] <= 0) {
        this.active[index] = 0;
        continue;
      }

      const dragFactor = Math.exp(-this.drag[index] * dt);
      this.vx[index] *= dragFactor;
      this.vy[index] = this.vy[index] * dragFactor - this.gravity[index] * dt;
      this.vz[index] *= dragFactor;
      this.x[index] += this.vx[index] * dt;
      this.y[index] += this.vy[index] * dt;
      this.z[index] += this.vz[index] * dt;

      if (write >= maxWrite) continue;
      const life = clamp(this.life[index] / this.maxLife[index], 0, 1);
      this.renderPositions[write * 3] = this.x[index];
      this.renderPositions[write * 3 + 1] = this.y[index];
      this.renderPositions[write * 3 + 2] = this.z[index];
      this.renderColors[write * 3] = this.r[index] * (0.75 + life * 0.4);
      this.renderColors[write * 3 + 1] = this.g[index] * (0.75 + life * 0.4);
      this.renderColors[write * 3 + 2] = this.b[index] * (0.75 + life * 0.4);
      this.renderSizes[write] = this.baseSize[index] * (0.45 + life * 0.8);
      this.renderAlphas[write] = life * life;
      write++;
    }

    this.geometry.setDrawRange(0, write);
    for (const name of ["position", "aColor", "aSize", "aAlpha"]) {
      this.geometry.attributes[name].needsUpdate = true;
    }
  }
}


// Explosions en billboards texturés (flipbook 4x4).
//
// Le pool de particules rend des THREE.Points : gl_PointSize est plafonné par le
// matériel, ce qui interdit une grosse explosion. Ici chaque explosion est un
// quad face-caméra dont l'UV parcourt les 16 cases de l'atlas au fil de sa vie.
// Tout le pool tient en UN seul draw call.
export class ExplosionPool {
  constructor(THREE, scene, texture, { max = 16, columns = 4, rows = 4 } = {}) {
    this.THREE = THREE;
    this.max = max;
    this.columns = columns;
    this.rows = rows;
    this.age = new Float32Array(max);
    this.life = new Float32Array(max);
    this.cursor = 0;

    const centers = new Float32Array(max * 4 * 3);
    const corners = new Float32Array(max * 4 * 2);
    const ages = new Float32Array(max * 4);
    const scales = new Float32Array(max * 4);
    const indices = new Uint16Array(max * 6);
    const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let i = 0; i < max; i++) {
      for (let c = 0; c < 4; c++) {
        corners[(i * 4 + c) * 2] = CORNERS[c][0];
        corners[(i * 4 + c) * 2 + 1] = CORNERS[c][1];
        ages[i * 4 + c] = 2;            // > 1 : invisible au repos
      }
      const base = i * 4;
      indices.set([base, base + 1, base + 2, base, base + 2, base + 3], i * 6);
    }

    const geometry = new THREE.BufferGeometry();
    this.centerAttribute = new THREE.BufferAttribute(centers, 3);
    this.ageAttribute = new THREE.BufferAttribute(ages, 1);
    this.scaleAttribute = new THREE.BufferAttribute(scales, 1);
    geometry.setAttribute("position", this.centerAttribute);
    geometry.setAttribute("aCorner", new THREE.BufferAttribute(corners, 2));
    geometry.setAttribute("aAge", this.ageAttribute);
    geometry.setAttribute("aScale", this.scaleAttribute);
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    this.geometry = geometry;

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uAtlas: { value: texture },
        uGrid: { value: new THREE.Vector2(columns, rows) }
      },
      vertexShader: `
        attribute vec2 aCorner;
        attribute float aAge;
        attribute float aScale;
        uniform vec2 uGrid;
        varying vec2 vUv;
        varying float vFade;
        void main() {
          float frames = uGrid.x * uGrid.y;
          float frame = floor(clamp(aAge, 0.0, 0.999) * frames);
          vec2 cell = vec2(1.0) / uGrid;
          float column = mod(frame, uGrid.x);
          float row = floor(frame / uGrid.x);
          vec2 uv = (aCorner * 0.5 + 0.5) * cell;
          // La texture est retournée en V par Three : la ligne 0 de l'image est
          // en haut, donc en v = 1.
          vUv = uv + vec2(column * cell.x, 1.0 - (row + 1.0) * cell.y);
          vFade = aAge > 1.0 ? 0.0 : 1.0;
          // Billboard en espace vue : toujours face caméra, sans matrice de plus.
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          // ⚠️ LE QUAD MORT DOIT DISPARAÎTRE, PAS SEULEMENT S'ÉTEINDRE. Le
          // fondu annulait la couleur, mais l'échelle gardait la valeur du
          // dernier spawn — le quad continuait donc d'être rasterisé en pleine
          // taille, avec sa prise de texture et son mélange additif, pour un
          // résultat multiplié par zéro. À l'échelle du jeu, quatre-vingt-quatre
          // emplacements ; un seul, proche, couvrait jusqu'au tiers de l'écran.
          // En multipliant l'écart des coins par le fondu, les quatre sommets
          // se confondent : aire nulle, zéro fragment engendré.
          mv.xy += aCorner * aScale * vFade;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform sampler2D uAtlas;
        varying vec2 vUv;
        varying float vFade;
        void main() {
          vec4 texel = texture2D(uAtlas, vUv);
          // Fond noir de l'atlas = transparent en additif.
          gl_FragColor = vec4(texel.rgb, 1.0) * vFade;
        }
      `
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    scene.add(this.mesh);
    for (let i = 0; i < max; i++) this.age[i] = 2;
  }

  spawn(x, y, z, scale = 6, life = 0.85) {
    const slot = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.age[slot] = 0;
    this.life[slot] = Math.max(0.15, life);
    for (let c = 0; c < 4; c++) {
      const vertex = slot * 4 + c;
      this.centerAttribute.array[vertex * 3] = x;
      this.centerAttribute.array[vertex * 3 + 1] = y;
      this.centerAttribute.array[vertex * 3 + 2] = z;
      this.scaleAttribute.array[vertex] = scale;
      this.ageAttribute.array[vertex] = 0;
    }
    this.centerAttribute.needsUpdate = true;
    this.scaleAttribute.needsUpdate = true;
    this.ageAttribute.needsUpdate = true;
  }

  update(dt) {
    let changed = false;
    for (let slot = 0; slot < this.max; slot++) {
      if (this.age[slot] > 1) continue;
      this.age[slot] += dt / this.life[slot];
      const value = this.age[slot] > 1 ? 2 : this.age[slot];
      for (let c = 0; c < 4; c++) this.ageAttribute.array[slot * 4 + c] = value;
      changed = true;
    }
    if (changed) this.ageAttribute.needsUpdate = true;
  }

  clear() {
    for (let slot = 0; slot < this.max; slot++) this.age[slot] = 2;
    this.ageAttribute.array.fill(2);
    this.ageAttribute.needsUpdate = true;
  }
}

// Atlas V5 : une illustration par pouvoir, toutes sur noir pur et compositées
// en additif. Contrairement au flipbook d'explosion, l'index reste fixe pendant
// la vie du billboard ; seule l'échelle et l'opacité évoluent. Les 18 pouvoirs
// tiennent ainsi en un atlas, un matériau et un draw call.
export const SPELL_VFX = Object.freeze({
  COCO_IMPACT: 0,
  COCO_TRAIL: 1,
  HARPOON_LAUNCH: 2,
  HARPOON_LOCK: 3,
  HARPOON_TETHER: 4,
  MINE_ARMED: 5,
  TSUNAMI_RING: 6,
  RHUM_AURA: 7,
  BARIK_FUSE: 8,
  BARIK_EXPLOSION: 9,
  CHADRON_SPIKES: 10,
  CHADRON_POISON: 11,
  LANBI_CONE: 12,
  LANBI_STUN: 13,
  PWASON_TRAIL: 14,
  PWASON_HIT: 15,
  BWA_SHIFT: 16,
  BWA_DASH: 17
});

// Atlas V7 : quatre accents rares, réservés aux moments qui doivent vraiment
// "claquer". Ils vivent dans un pool séparé de 12 billboards (un draw call)
// afin que les signatures HD n'évincent jamais les traînées/cooldowns V5.
export const JUICE_VFX = Object.freeze({
  HARPOON_TEAR: 0,
  COCONUT_SHOCKWAVE: 1,
  MINE_DETONATION: 2,
  PERFECT_COUNTERHEEL: 3
});

export class EffectAtlasPool {
  constructor(THREE, scene, texture, { max = 28, columns = 5, rows = 4 } = {}) {
    this.max = max;
    this.columns = columns;
    this.rows = rows;
    this.age = new Float32Array(max);
    this.life = new Float32Array(max);
    this.cursor = 0;

    const centers = new Float32Array(max * 4 * 3);
    const corners = new Float32Array(max * 4 * 2);
    const ages = new Float32Array(max * 4);
    const scales = new Float32Array(max * 4);
    const effects = new Float32Array(max * 4);
    const rotations = new Float32Array(max * 4);
    const flips = new Float32Array(max * 4);
    const intensities = new Float32Array(max * 4);
    const indices = new Uint16Array(max * 6);
    const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let slot = 0; slot < max; slot++) {
      for (let corner = 0; corner < 4; corner++) {
        const vertex = slot * 4 + corner;
        corners[vertex * 2] = CORNERS[corner][0];
        corners[vertex * 2 + 1] = CORNERS[corner][1];
        ages[vertex] = 2;
        flips[vertex] = 1;
        intensities[vertex] = 1;
      }
      const base = slot * 4;
      indices.set([base, base + 1, base + 2, base, base + 2, base + 3], slot * 6);
      this.age[slot] = 2;
    }

    const geometry = new THREE.BufferGeometry();
    this.centerAttribute = new THREE.BufferAttribute(centers, 3);
    this.ageAttribute = new THREE.BufferAttribute(ages, 1);
    this.scaleAttribute = new THREE.BufferAttribute(scales, 1);
    this.effectAttribute = new THREE.BufferAttribute(effects, 1);
    this.rotationAttribute = new THREE.BufferAttribute(rotations, 1);
    this.flipAttribute = new THREE.BufferAttribute(flips, 1);
    this.intensityAttribute = new THREE.BufferAttribute(intensities, 1);
    geometry.setAttribute("position", this.centerAttribute);
    geometry.setAttribute("aCorner", new THREE.BufferAttribute(corners, 2));
    geometry.setAttribute("aAge", this.ageAttribute);
    geometry.setAttribute("aScale", this.scaleAttribute);
    geometry.setAttribute("aEffect", this.effectAttribute);
    geometry.setAttribute("aRotation", this.rotationAttribute);
    geometry.setAttribute("aFlipX", this.flipAttribute);
    geometry.setAttribute("aIntensity", this.intensityAttribute);
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    this.geometry = geometry;

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uAtlas: { value: texture },
        uGrid: { value: new THREE.Vector2(columns, rows) }
      },
      vertexShader: `
        attribute vec2 aCorner;
        attribute float aAge;
        attribute float aScale;
        attribute float aEffect;
        attribute float aRotation;
        attribute float aFlipX;
        attribute float aIntensity;
        uniform vec2 uGrid;
        varying vec2 vUv;
        varying float vFade;
        varying float vIntensity;
        void main() {
          vec2 cell = vec2(1.0) / uGrid;
          float column = mod(aEffect, uGrid.x);
          float row = floor(aEffect / uGrid.x);
          vec2 localUv = aCorner * 0.5 + 0.5;
          if (aFlipX < 0.0) localUv.x = 1.0 - localUv.x;
          vUv = localUv * cell + vec2(column * cell.x, 1.0 - (row + 1.0) * cell.y);
          float t = clamp(aAge, 0.0, 1.0);
          float enter = smoothstep(0.0, 0.10, t);
          float leave = 1.0 - smoothstep(0.62, 1.0, t);
          // ⚠️ UN TERME À PART, ET PAS LE FONDU. Celui-ci vaut aussi zéro au
          // tout début et à la toute fin d'une vie NORMALE : s'en servir pour
          // dégénérer le quad ferait clignoter l'effet à ses deux extrémités.
          // Seul l'âge dit si l'emplacement est mort.
          float vivant = aAge > 1.0 ? 0.0 : 1.0;
          vFade = vivant * enter * leave;
          vIntensity = aIntensity;
          float growth = mix(0.58, 1.18, smoothstep(0.0, 0.78, t));
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float cosine = cos(aRotation);
          float sine = sin(aRotation);
          vec2 orientedCorner = mat2(cosine, sine, -sine, cosine) * aCorner;
          // Emplacement mort : les quatre coins se confondent, aire nulle, zéro
          // fragment. Sans cela le quad restait à la taille de son dernier
          // spawn — l'échelle n'est jamais remise à zéro — et payait sa prise
          // de texture et son mélange additif pour un résultat nul.
          mv.xy += orientedCorner * aScale * growth * vivant;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform sampler2D uAtlas;
        varying vec2 vUv;
        varying float vFade;
        varying float vIntensity;
        void main() {
          vec3 color = texture2D(uAtlas, vUv).rgb;
          float energy = max(color.r, max(color.g, color.b));
          float softMask = smoothstep(0.015, 0.14, energy);
          float intensity = clamp(vIntensity, 0.12, 1.25);
          gl_FragColor = vec4(color * (0.72 + vFade * 0.48) * intensity, vFade * softMask * intensity);
        }
      `
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    scene.add(this.mesh);
  }

  spawn(x, y, z, effect, scale = 4.5, life = 0.65, options = {}) {
    const slot = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.age[slot] = 0;
    this.life[slot] = Math.max(0.12, life);
    const safeEffect = clamp(Math.floor(effect), 0, this.columns * this.rows - 1);
    const rotation = Number.isFinite(options.rotation) ? options.rotation : 0;
    const flipX = options.flipX ? -1 : 1;
    const intensity = clamp(Number.isFinite(options.intensity) ? options.intensity : 1, 0.12, 1.25);
    for (let corner = 0; corner < 4; corner++) {
      const vertex = slot * 4 + corner;
      this.centerAttribute.array[vertex * 3] = x;
      this.centerAttribute.array[vertex * 3 + 1] = y;
      this.centerAttribute.array[vertex * 3 + 2] = z;
      this.scaleAttribute.array[vertex] = scale;
      this.effectAttribute.array[vertex] = safeEffect;
      this.rotationAttribute.array[vertex] = rotation;
      this.flipAttribute.array[vertex] = flipX;
      this.intensityAttribute.array[vertex] = intensity;
      this.ageAttribute.array[vertex] = 0;
    }
    this.centerAttribute.needsUpdate = true;
    this.scaleAttribute.needsUpdate = true;
    this.effectAttribute.needsUpdate = true;
    this.rotationAttribute.needsUpdate = true;
    this.flipAttribute.needsUpdate = true;
    this.intensityAttribute.needsUpdate = true;
    this.ageAttribute.needsUpdate = true;
  }

  update(dt) {
    let changed = false;
    for (let slot = 0; slot < this.max; slot++) {
      if (this.age[slot] > 1) continue;
      this.age[slot] += dt / this.life[slot];
      const age = this.age[slot] > 1 ? 2 : this.age[slot];
      for (let corner = 0; corner < 4; corner++) this.ageAttribute.array[slot * 4 + corner] = age;
      changed = true;
    }
    if (changed) this.ageAttribute.needsUpdate = true;
  }

  clear() {
    this.age.fill(2);
    this.ageAttribute.array.fill(2);
    this.ageAttribute.needsUpdate = true;
    this.cursor = 0;
  }
}

export class ImpactRingPool {
  constructor(THREE, scene, max = 28) {
    this.THREE = THREE;
    this.items = [];
    this.cursor = 0;
    const geometry = new THREE.RingGeometry(0.72, 1.0, 48);
    for (let index = 0; index < max; index++) {
      const material = new THREE.MeshBasicMaterial({
        color: 0x8ef9ff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      scene.add(mesh);
      this.items.push({ mesh, life: 0, maxLife: 1, speed: 1, baseScale: 1 });
    }
  }

  clear() {
    this.cursor = 0;
    for (const item of this.items) {
      item.life = 0;
      item.mesh.visible = false;
      item.mesh.material.opacity = 0;
      item.mesh.scale.setScalar(1);
    }
  }

  burst(x, y, z, color = 0x7eeeff, scale = 1, duration = 0.7) {
    const item = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.items.length;
    item.mesh.position.set(x, y + 0.06, z);
    item.mesh.material.color.setHex(color);
    item.mesh.material.opacity = 0.90;
    item.mesh.scale.setScalar(scale);
    item.mesh.visible = true;
    item.life = item.maxLife = duration;
    item.speed = 3.8 + scale * 1.3;
    item.baseScale = scale;
  }

  update(dt) {
    for (const item of this.items) {
      if (item.life <= 0) continue;
      item.life -= dt;
      const t = 1 - clamp(item.life / item.maxLife, 0, 1);
      item.mesh.scale.setScalar(item.baseScale * (1 + t * item.speed));
      item.mesh.material.opacity = (1 - t) * 0.84;
      if (item.life <= 0) item.mesh.visible = false;
    }
  }
}



// Chaîne de bloom séparable.
//
// L'ancienne version faisait HUIT prises pleine résolution à deux texels du
// centre, dans la passe de composition. Deux défauts, l'un visuel, l'autre de
// coût : à deux texels, l'étalement d'un point lumineux vaut deux texels — ce
// n'est pas un halo, c'est un liseré, et il suit la résolution au lieu de suivre
// l'image (le même reflet bavait deux fois plus large en LQ qu'en HQ). Et
// treize prises pleine résolution par pixel, c'est le prix d'un flou large payé
// pour un flou nul.
//
// Ici : seuil à genou doux + moyenne de Karis en demi-résolution, puis gaussienne
// séparable en quart de résolution. L'étalement est exprimé en fraction d'écran,
// donc identique à toutes les résolutions, et la composition ne coûte plus
// qu'UNE prise. Bilan mesuré à 2592×1458 : ~49 M de fetches -> ~32 M.
const BLOOM_PREFILTER_FRAGMENT = `
  precision highp float;
  uniform sampler2D tDiffuse;
  uniform vec2 uTexel;
  uniform float uThreshold;
  uniform float uSoftKnee;
  varying vec2 vUv;

  float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

  // Pondération de Karis : un pixel isolé à 40,0 ne doit pas peser quarante fois
  // un pixel à 1,0, sinon la moindre étincelle de gerbe scintille d'une image à
  // l'autre dès que le sous-échantillonnage la fait changer de texel.
  vec4 tap(vec2 uv) {
    vec3 c = texture2D(tDiffuse, uv).rgb;
    float w = 1.0 / (1.0 + luma(c));
    return vec4(c * w, w);
  }

  void main() {
    vec4 sum = tap(vUv) * 2.0;
    sum += tap(vUv + uTexel * vec2( 1.0,  1.0));
    sum += tap(vUv + uTexel * vec2(-1.0,  1.0));
    sum += tap(vUv + uTexel * vec2( 1.0, -1.0));
    sum += tap(vUv + uTexel * vec2(-1.0, -1.0));
    vec3 color = sum.rgb / max(sum.a, 1e-4);

    // Genou doux : au lieu d'une coupure franche à 0,68 qui découpe les hautes
    // lumières au ciseau, la contribution monte en quadratique sur la largeur du
    // genou. C'est ce qui distingue un halo d'un détourage.
    float brightness = max(color.r, max(color.g, color.b));
    float knee = uThreshold * uSoftKnee + 1e-5;
    float soft = clamp(brightness - uThreshold + knee, 0.0, 2.0 * knee);
    soft = soft * soft / (4.0 * knee + 1e-5);
    float contribution = max(soft, brightness - uThreshold) / max(brightness, 1e-5);
    gl_FragColor = vec4(color * contribution, 1.0);
  }
`;

// Gaussienne 9 prises repliée sur 5 grâce au filtrage bilinéaire.
const BLOOM_BLUR_FRAGMENT = `
  precision highp float;
  uniform sampler2D tDiffuse;
  uniform vec2 uDirection;
  varying vec2 vUv;

  void main() {
    vec3 color = texture2D(tDiffuse, vUv).rgb * 0.2270270270;
    vec2 offset1 = uDirection * 1.3846153846;
    vec2 offset2 = uDirection * 3.2307692308;
    color += texture2D(tDiffuse, vUv + offset1).rgb * 0.3162162162;
    color += texture2D(tDiffuse, vUv - offset1).rgb * 0.3162162162;
    color += texture2D(tDiffuse, vUv + offset2).rgb * 0.0702702703;
    color += texture2D(tDiffuse, vUv - offset2).rgb * 0.0702702703;
    gl_FragColor = vec4(color, 1.0);
  }
`;

const FULLSCREEN_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export class PostFX {
  constructor(THREE, renderer, width, height) {
    this.THREE = THREE;
    this.renderer = renderer;
    this.enabled = true;
    this.impact = 0;
    this.impactTail = 0;
    this.storm = 0;
    this.time = 0;
    this.speed = 0;
    this.wetness = 0;
    this.capsize = 0;
    this.damage = 0;
    this.bloom = 0.35;
    this.graphicStyle = false;
    this.reduceFlash = false;
    // MSAA sur la cible de rendu : `antialias` du contexte ne s'applique qu'au
    // framebuffer par defaut, jamais a un WebGLRenderTarget. Sans `samples`,
    // toute la chaine post-FX etait donc rendue sans le moindre antialiasing.
    this.samples = 4;
    this.renderTarget = new THREE.WebGLRenderTarget(Math.max(1, width), Math.max(1, height), {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      depthBuffer: true,
      stencilBuffer: false,
      samples: this.samples
    });
    // Cibles de bloom. Pas de profondeur, pas de MSAA, pas de mipmaps : ce sont
    // des tampons de couleur plats qu'on ne lit qu'en bilinéaire.
    const bloomTargetOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      depthBuffer: false,
      stencilBuffer: false
    };
    const halfWidth = Math.max(1, Math.floor(width / 2));
    const halfHeight = Math.max(1, Math.floor(height / 2));
    const quarterWidth = Math.max(1, Math.floor(width / 4));
    const quarterHeight = Math.max(1, Math.floor(height / 4));
    this.bloomHalf = new THREE.WebGLRenderTarget(halfWidth, halfHeight, bloomTargetOptions);
    this.bloomBlurA = new THREE.WebGLRenderTarget(quarterWidth, quarterHeight, bloomTargetOptions);
    this.bloomBlurB = new THREE.WebGLRenderTarget(quarterWidth, quarterHeight, bloomTargetOptions);
    // Rayon exprimé en fraction de LARGEUR D'ÉCRAN, pas en texels : le halo doit
    // faire la même taille apparente en LQ et en HQ.
    this.bloomRadius = 0.0042;

    this.bloomPrefilterMaterial = new THREE.ShaderMaterial({
      depthWrite: false,
      depthTest: false,
      uniforms: {
        tDiffuse: { value: this.renderTarget.texture },
        uTexel: { value: new THREE.Vector2(1 / Math.max(1, width), 1 / Math.max(1, height)) },
        // Seuil laissé À 0,68, la valeur calibrée de l'ancien bloom : ce qui
        // change ici est la FORME du halo, pas la quantité de scène qui l'alimente.
        // Le genou reste serré (0,40 -> rampe à partir de 0,41 de luminance) pour
        // que les tons moyens de la mer ne se mettent pas à luire.
        uThreshold: { value: 0.68 },
        uSoftKnee: { value: 0.40 }
      },
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: BLOOM_PREFILTER_FRAGMENT
    });
    this.bloomBlurHorizontalMaterial = new THREE.ShaderMaterial({
      depthWrite: false,
      depthTest: false,
      uniforms: {
        tDiffuse: { value: this.bloomHalf.texture },
        uDirection: { value: new THREE.Vector2(this.bloomRadius, 0) }
      },
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: BLOOM_BLUR_FRAGMENT
    });
    this.bloomBlurVerticalMaterial = new THREE.ShaderMaterial({
      depthWrite: false,
      depthTest: false,
      uniforms: {
        tDiffuse: { value: this.bloomBlurA.texture },
        uDirection: { value: new THREE.Vector2(0, this.bloomRadius) }
      },
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: BLOOM_BLUR_FRAGMENT
    });

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.material = new THREE.ShaderMaterial({
      depthWrite: false,
      depthTest: false,
      uniforms: {
        tDiffuse: { value: this.renderTarget.texture },
        tBloom: { value: this.bloomBlurB.texture },
        uResolution: { value: new THREE.Vector2(width, height) },
        uImpact: { value: 0 },
        uImpactTail: { value: 0 },
        uStorm: { value: 0 },
        uTime: { value: 0 },
        uSpeed: { value: 0 },
        uWetness: { value: 0 },
        uCapsize: { value: 0 },
        uDamage: { value: 0 },
        uBloom: { value: 0.35 },
        uStreak: { value: 0.30 },
        uFastComposite: { value: 0 },
        uGraphicStyle: { value: 0 },
        // Exposition scène. Le seul bouton global de luminosité maintenant que
        // la passe fait vraiment tone mapping + encodage sRGB. 0,90 est mesuré,
        // pas choisi à l'œil : balayage 0,55 -> 1,25 sur une frame gelée
        // (tools/sweep_exposure.py), retenu pour luma médiane 0,334, 5e centile
        // 0,247, 95e centile 0,790 et 0 % d'écrêtage — la fenêtre habituelle
        // d'un extérieur de plein jour.
        uExposure: { value: 0.90 },
        uBlack: { value: 0.10 }
      },
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: `
        precision highp float;
        uniform sampler2D tDiffuse;
        uniform sampler2D tBloom;
        uniform vec2 uResolution;
        uniform float uImpact;
        uniform float uImpactTail;
        uniform float uStorm;
        uniform float uTime;
        uniform float uSpeed;
        uniform float uWetness;
        uniform float uCapsize;
        uniform float uDamage;
        uniform float uBloom;
        uniform float uStreak;
        uniform float uFastComposite;
        uniform float uGraphicStyle;
        uniform float uExposure;
        uniform float uBlack;
        varying vec2 vUv;

        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }

        float droplet(vec2 uv, vec2 cell, float seed) {
          vec2 id = floor(uv * cell);
          vec2 f = fract(uv * cell) - 0.5;
          float rnd = hash21(id + seed);
          float fall = fract(uTime * (0.12 + rnd * 0.18) + rnd);
          f.y += fall * 1.4 - 0.7;
          f.x += sin((id.y + seed) * 2.7) * 0.16;
          float body = smoothstep(0.18 + rnd * 0.07, 0.02, length(f * vec2(1.0, 1.8)));
          float streak = smoothstep(0.04, 0.0, abs(f.x)) * smoothstep(0.52, 0.05, abs(f.y)) * 0.35;
          return max(body, streak) * step(0.73, rnd);
        }

        void main() {
          vec2 p = vUv - 0.5;
          float distanceFromCenter = length(p);

          // Chemin mobile : une seule lecture de scène. On conserve le tone
          // mapping, la palette tropicale, le danger et le tramage qui font la
          // DA ; on retire seulement les lectures radiales/chromatiques, les
          // gouttes procédurales et les contours plein écran. Sur un GPU mobile
          // ces lectures plein écran coûtent bien plus que quelques triangles.
          if (uFastComposite > 0.5) {
            vec3 color = texture2D(tDiffuse, vUv).rgb;
            float vignette = smoothstep(0.92, 0.28, distanceFromCenter);
            color *= mix(0.76 - uDamage * 0.10, 1.0, vignette);
            float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
            color = mix(color, vec3(luminance) * vec3(0.78, 0.86, 1.0), uStorm * 0.20);
            color += vec3(0.035, 0.012, 0.06) * uStorm * (1.0 - vignette);
            color = mix(color, color * vec3(0.80, 0.93, 1.06), uCapsize * 0.16);
            color += vec3(0.10, 0.0, 0.012) * uDamage * (1.0 - vignette);
            // Flash radial arithmétique : aucune prise de texture ajoutée, mais
            // les impacts restent spectaculaires même sans aberration chromatique.
            float impactPulse = exp(-distanceFromCenter * 4.8)
              * (0.52 + abs(sin(distanceFromCenter * 25.0 - uTime * 14.0)) * 0.48);
            color += vec3(0.18, 0.10, 0.035)
              * impactPulse * (uImpact * 0.72 + uImpactTail * 0.24);

            color *= uExposure;
            vec3 aces = (color * (2.51 * color + 0.03))
              / (color * (2.43 * color + 0.59) + 0.14);
            color = clamp(aces, 0.0, 1.0);
            vec3 lo = color * 12.92;
            vec3 hi = 1.055 * pow(max(color, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
            color = mix(hi, lo, step(color, vec3(0.0031308)));
            color = clamp((color - uBlack) / max(1e-3, 1.0 - uBlack), 0.0, 1.0);

            float gradeLum = dot(color, vec3(0.2126, 0.7152, 0.0722));
            color = mix(
              color * vec3(0.965, 1.015, 1.045),
              color * vec3(1.045, 1.0, 0.935),
              smoothstep(0.26, 0.82, gradeLum)
            );
            color += vec3(0.006, 0.019, 0.027)
              * (1.0 - smoothstep(0.0, 0.34, gradeLum));
            color = mix(
              color,
              color * vec3(1.04, 1.005, 0.93),
              smoothstep(0.70, 1.0, gradeLum)
            );

            float edge = 1.0 - vignette;
            color = mix(
              color,
              vec3(dot(color, vec3(0.2126, 0.7152, 0.0722))),
              edge * 0.13
            );
            color *= 1.0 - edge * 0.09;

            // Le mode « Gravure Alizé » garde ses aplats, mais pas ses quatre
            // prises de contour : la silhouette 3D des yoles reste encrée par
            // son mesh de coque dédié.
            if (uGraphicStyle > 0.5) {
              float posterLum = dot(color, vec3(0.2126, 0.7152, 0.0722));
              float posterBand = floor(clamp(posterLum, 0.0, 0.999) * 6.0) / 5.0;
              color = mix(
                color,
                clamp(color * (posterBand / max(0.055, posterLum)), 0.0, 1.0),
                0.46
              );
            }
            color += (hash21(gl_FragCoord.xy) - 0.5) * (1.0 / 255.0);
            gl_FragColor = vec4(color, 1.0);
            return;
          }

          float wave = sin(distanceFromCenter * 42.0 - uTime * 17.0) * exp(-distanceFromCenter * 7.0);
          float afterWave = sin(distanceFromCenter * 23.0 - uTime * 9.0) * exp(-distanceFromCenter * 5.2);
          vec2 impactOffset = normalize(p + 0.0001)
            * (wave * uImpact * 0.0085 + afterWave * uImpactTail * 0.0032);
          float speedBlur = smoothstep(0.45, 1.0, uSpeed) * 0.0035;
          vec2 radial = normalize(p + 0.0001) * speedBlur;
          float chroma = uImpact * 0.0038 + uImpactTail * 0.0012 + uCapsize * 0.0015;

          vec3 c0 = texture2D(tDiffuse, vUv + impactOffset).rgb;
          vec3 c1 = texture2D(tDiffuse, vUv + impactOffset - radial).rgb;
          vec3 c2 = texture2D(tDiffuse, vUv + impactOffset - radial * 2.0).rgb;
          vec3 blurred = c0 * 0.62 + c1 * 0.25 + c2 * 0.13;

          // Bloom : une seule prise dans la cible déjà seuillée et floutée.
          //
          // Le branchement est piloté par un UNIFORME : toutes les invocations
          // prennent la même voie, il n'y a donc pas de divergence de warp. Il
          // vaut son coût — au palier LQ, uBloom vaut 0 et l'ancienne version
          // calculait quand même ses huit prises pleine résolution avant de les
          // multiplier par zéro. C'est-à-dire précisément sur le matériel le plus
          // faible qu'on payait le plus cher pour rien.
          vec3 bloom = vec3(0.0);
          if (uBloom > 0.0) {
            bloom = texture2D(tBloom, vUv).rgb;
            // Traînée horizontale. Le soleil tropical est la source dominante de
            // la scène : quatre prises étirées en x lui donnent l'étalement
            // anamorphique d'un objectif, et à ce prix-là seul le soleil et les
            // explosions en profitent — rien d'autre ne passe le seuil.
            vec3 streak = texture2D(tBloom, vUv + vec2(0.030, 0.0)).rgb
                        + texture2D(tBloom, vUv - vec2(0.030, 0.0)).rgb
                        + texture2D(tBloom, vUv + vec2(0.062, 0.0)).rgb * 0.5
                        + texture2D(tBloom, vUv - vec2(0.062, 0.0)).rgb * 0.5;
            bloom += streak * uStreak * 0.25 * vec3(1.0, 0.94, 0.82);
          }
          float r = texture2D(tDiffuse, vUv + impactOffset + vec2(chroma, 0.0)).r;
          float b = texture2D(tDiffuse, vUv + impactOffset - vec2(chroma, 0.0)).b;
          vec3 color = mix(blurred, vec3(r, blurred.g, b), clamp(uImpact + uCapsize * 0.25, 0.0, 1.0));

          float vignette = smoothstep(0.92, 0.28, distanceFromCenter);
          color *= mix(0.70 - uDamage * 0.12, 1.0, vignette);
          float luminance = dot(color, vec3(0.2126,0.7152,0.0722));
          color = mix(color, vec3(luminance) * vec3(0.78,0.86,1.0), uStorm * 0.22);
          color += vec3(0.04,0.015,0.07) * uStorm * (1.0 - vignette);
          color = mix(color, color * vec3(0.78, 0.92, 1.08), uCapsize * 0.18);

          float drops = max(droplet(vUv + vec2(0.0, uTime * 0.015), vec2(13.0, 8.0), 1.7),
                            droplet(vUv + vec2(0.2, uTime * 0.011), vec2(9.0, 6.0), 4.1));
          color += drops * uWetness * vec3(0.18, 0.32, 0.38);
          color *= 1.0 - drops * uWetness * 0.20;
          color += vec3(0.11, 0.0, 0.015) * uDamage * (1.0 - vignette);
          color += bloom * uBloom * (0.75 + uImpact * 0.38 + uImpactTail * 0.10);

          // ─── Fin de l'espace scène (linéaire). Exposition, puis film. ───
          //
          // ⚠️ CE QUI SUIT CORRIGE UN DÉFAUT DE FOND, PAS UN RÉGLAGE.
          //
          // THREE.ColorManagement est actif (défaut depuis r152) : un
          // new THREE.Color(0x0d4f63) ne conserve PAS 0x0d4f63, il est converti
          // en linéaire et vaut (0,004 · 0,078 · 0,125). Les shaders custom
          // travaillent donc en linéaire — ce qui est correct — mais three.js
          // n'ajoute le chunk colorspace_fragment qu'aux matériaux INTÉGRÉS. Un
          // ShaderMaterial qui écrit gl_FragColor à la main sort tel quel.
          //
          // Mesuré en WebGL réel (Chromium/ANGLE, r185) : un shader écrivant
          // 0,5 rendait 128 à l'écran, là où l'encodage sRGB donne 188. Chemin
          // direct comme chemin WebGLRenderTarget : 128 tous les deux.
          //
          // Conséquence : la mer authorée à #0d4f63 s'affichait à peu près
          // #011420 — presque noire. Toute la scène custom (océan, ciel, Mur du
          // Grain, pluie, particules) était ~2,2 gamma trop sombre, tandis que
          // les MeshStandardMaterial (îles, coques, palmiers), eux, recevaient
          // bien leur conversion. La scène n'était pas seulement sombre : elle
          // était incohérente avec elle-même.
          //
          // La passe de composition est le SEUL endroit qui touche tous les
          // pixels : c'est donc ici que se font le tone mapping et l'encodage,
          // exactement comme le ferait une passe de sortie standard.
          color *= uExposure;

          // ACES filmique (approximation Narkowicz). Elle remplace la courbe
          // low*low*(3-2*low) maison, qui essayait de faire ce travail dans
          // l'espace linéaire en le prenant pour de l'affichage : elle écrasait
          // les ombres au lieu de comprimer les hautes lumières.
          vec3 aces = (color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14);
          color = clamp(aces, 0.0, 1.0);

          // Linéaire -> sRGB. La branche exacte, pas pow(x, 1/2.2) : le segment
          // linéaire du bas est ce qui garde les ombres profondes propres.
          vec3 lo = color * 12.92;
          vec3 hi = 1.055 * pow(max(color, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
          color = mix(hi, lo, step(color, vec3(0.0031308)));

          // ─── Espace d'affichage. Ici, et seulement ici, 0,5 = gris moyen. ───
          // Le grade artistique est repris DANS CET ESPACE : les seuils de
          // l'ancien split-tone (0,18 / 0,8 / 0,30 / 0,66) étaient posés à la
          // main sur une image affichée en linéaire, donc sur des tons moyens
          // qui n'étaient pas là où ils semblaient être.
          // Point noir. Une mer de plein jour n'a physiquement AUCUN noir : après
          // encodage correct, le 5e centile de l'image restait à 0,34 de luma et
          // rien n'ancrait le bas de l'échelle — l'image lisait « brumeuse ». Ce
          // n'est donc pas une correction d'exposition mais un pied de courbe.
          color = clamp((color - uBlack) / max(1e-3, 1.0 - uBlack), 0.0, 1.0);

          float gradeLum = dot(color, vec3(0.2126, 0.7152, 0.0722));
          // Ombres teal, hautes lumières chaudes : la signature tropicale.
          color = mix(color * vec3(0.965, 1.015, 1.045), color * vec3(1.045, 1.0, 0.935), smoothstep(0.26, 0.82, gradeLum));
          // Noirs relevés vers le teal profond, hautes lumières vers l'or.
          color += vec3(0.006, 0.019, 0.027) * (1.0 - smoothstep(0.0, 0.34, gradeLum));
          color = mix(color, color * vec3(1.04, 1.005, 0.93), smoothstep(0.70, 1.0, gradeLum));

          // Le regard va au centre : désaturation et assombrissement doux au bord.
          float edge = 1.0 - vignette;
          color = mix(color, vec3(dot(color, vec3(0.2126, 0.7152, 0.0722))), edge * 0.16);
          color *= 1.0 - edge * 0.11;

          if (uGraphicStyle > 0.5) {
            // Aplats en espace d'affichage : on conserve la teinte locale et on
            // réduit seulement le nombre de valeurs. La scène reste donc
            // martiniquaise, pas recolorée avec la palette d'un jeu tiers.
            float posterLum = dot(color, vec3(0.2126, 0.7152, 0.0722));
            float posterBand = floor(clamp(posterLum, 0.0, 0.999) * 6.0) / 5.0;
            float posterScale = posterBand / max(0.055, posterLum);
            vec3 posterColor = clamp(color * posterScale, 0.0, 1.0);
            color = mix(color, posterColor, 0.52);

            // Encrage sélectif : quatre prises seulement, uniquement dans le
            // prototype. Le seuil haut ignore le détail de l'eau ; les grandes
            // silhouettes de yole, de voile et d'île portent l'encre.
            vec2 texel = 1.0 / max(uResolution, vec2(1.0));
            float lumaL = dot(texture2D(tDiffuse, vUv - vec2(texel.x, 0.0)).rgb, vec3(0.2126, 0.7152, 0.0722));
            float lumaR = dot(texture2D(tDiffuse, vUv + vec2(texel.x, 0.0)).rgb, vec3(0.2126, 0.7152, 0.0722));
            float lumaD = dot(texture2D(tDiffuse, vUv - vec2(0.0, texel.y)).rgb, vec3(0.2126, 0.7152, 0.0722));
            float lumaU = dot(texture2D(tDiffuse, vUv + vec2(0.0, texel.y)).rgb, vec3(0.2126, 0.7152, 0.0722));
            float inkEdge = smoothstep(0.16, 0.40, length(vec2(lumaR - lumaL, lumaU - lumaD)));
            color = mix(color, vec3(0.025, 0.075, 0.12), inkEdge * 0.56);

            // Grain fin de sérigraphie, sous le seuil d'un contour et sans
            // texture supplémentaire.
            color += (hash21(gl_FragCoord.xy * 0.73) - 0.5) * (2.2 / 255.0);
          }

          // Tramage sur 8 bits, appliqué APRÈS l'encodage — c'est là que se fait
          // la quantification. Le ciel et la brume d'horizon sont des dégradés
          // quasi purs sur plus de mille pixels de haut : sans bruit, ils sortent
          // EN BANDES. Un demi-LSB décorrèle la quantification pour le prix d'une
          // multiplication.
          color += (hash21(gl_FragCoord.xy) - 0.5) * (1.0 / 255.0);

          gl_FragColor = vec4(color, 1.0);
        }
      `
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.scene.add(quad);
    // Scène de service pour les passes de bloom : le même quad, dont on échange
    // le materiau. Trois passes n'ont pas besoin de trois scènes.
    this.blitQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bloomPrefilterMaterial);
    this.blitScene = new THREE.Scene();
    this.blitScene.add(this.blitQuad);
  }

  setSamples(samples) {
    const wanted = Math.max(0, samples | 0);
    if (wanted === this.samples) return this.samples;
    this.samples = wanted;
    // `samples` est relu a la prochaine initialisation de la cible : invalider.
    if ("samples" in this.renderTarget) {
      this.renderTarget.samples = wanted;
      this.renderTarget.dispose?.();
    }
    return this.samples;
  }

  resize(width, height, pixelRatio = 1) {
    const w = Math.max(1, Math.floor(width * pixelRatio));
    const h = Math.max(1, Math.floor(height * pixelRatio));
    this.renderTarget.setSize(w, h);
    this.material.uniforms.uResolution.value.set(w, h);
    this.bloomHalf.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
    this.bloomBlurA.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2));
    this.bloomBlurB.setSize(Math.max(1, w >> 2), Math.max(1, h >> 2));
    this.bloomPrefilterMaterial.uniforms.uTexel.value.set(1 / w, 1 / h);
    // Le rayon est en fraction d'écran, mais la passe verticale travaille sur un
    // tampon dont le rapport d'aspect est celui de l'écran : sans correction, un
    // écran 21:9 aurait un halo ovale.
    const aspect = w / Math.max(1, h);
    this.bloomBlurHorizontalMaterial.uniforms.uDirection.value.set(this.bloomRadius, 0);
    this.bloomBlurVerticalMaterial.uniforms.uDirection.value.set(0, this.bloomRadius * aspect);
  }

  setQuality(tier, profile = {}) {
    this.material.uniforms.uFastComposite.value = profile.fastComposite ? 1 : 0;
    const requestedBloom = profile.bloom ?? [0, 0.22, 0.52][tier] ?? 0.22;
    this.bloom = this.graphicStyle ? Math.min(requestedBloom, 0.14) : requestedBloom;
    this.material.uniforms.uBloom.value = this.bloom;
    // La traînée anamorphique coûte quatre prises supplémentaires : réservée aux
    // paliers qui ont déjà du bloom, et discrète en MQ.
    const requestedStreak = profile.streak ?? [0, 0.18, 0.34][tier] ?? 0.18;
    this.material.uniforms.uStreak.value = this.graphicStyle
      ? Math.min(requestedStreak, 0.08)
      : requestedStreak;
  }

  setGraphicStyle(enabled) {
    this.graphicStyle = Boolean(enabled);
    this.material.uniforms.uGraphicStyle.value = this.graphicStyle ? 1 : 0;
    if (this.graphicStyle) {
      this.bloom = Math.min(this.bloom, 0.14);
      this.material.uniforms.uBloom.value = this.bloom;
      this.material.uniforms.uStreak.value = Math.min(
        this.material.uniforms.uStreak.value,
        0.08
      );
    }
  }

  setReduceFlash(enabled) {
    this.reduceFlash = Boolean(enabled);
    if (this.reduceFlash) {
      this.impact = Math.min(this.impact, 0.28);
      this.impactTail = Math.min(this.impactTail, 0.12);
    }
  }

  pulse(amount = 1) {
    const scaled = this.reduceFlash ? Math.min(amount * 0.34, 0.28) : amount;
    this.impact = Math.max(this.impact, scaled);
    // Une seconde onde, plus lente et beaucoup moins lumineuse, donne du poids
    // sans prolonger le flash principal. En mode flash réduit elle reste faible.
    this.impactTail = Math.max(this.impactTail, this.reduceFlash ? scaled * 0.32 : scaled * 0.58);
  }

  update(dt, storm, time, motion = {}) {
    this.impact = Math.max(0, this.impact - dt * 3.35);
    this.impactTail = Math.max(0, this.impactTail - dt * 1.32);
    this.storm = storm;
    this.time = time;
    this.speed = damp(this.speed, clamp(motion.speed ?? 0, 0, 1), 4.2, dt);
    this.wetness = damp(this.wetness, clamp(motion.wetness ?? storm * 0.6, 0, 1), 2.5, dt);
    this.capsize = damp(this.capsize, clamp(motion.capsize ?? 0, 0, 1), 5.0, dt);
    this.damage = damp(this.damage, clamp(motion.damage ?? 0, 0, 1), 3.0, dt);
    const uniforms = this.material.uniforms;
    uniforms.uImpact.value = this.impact;
    uniforms.uImpactTail.value = this.impactTail;
    uniforms.uStorm.value = storm;
    uniforms.uTime.value = time;
    uniforms.uSpeed.value = this.speed;
    uniforms.uWetness.value = this.wetness;
    uniforms.uCapsize.value = this.capsize;
    uniforms.uDamage.value = this.damage;
    uniforms.uBloom.value = this.bloom;
  }

  /** Une passe plein écran d'un materiau vers une cible. */
  blit(material, target) {
    this.blitQuad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.blitScene, this.camera);
  }

  render(scene, camera) {
    if (!this.enabled || !this.renderer.setRenderTarget) {
      this.renderer.render(scene, camera);
      return;
    }
    this.renderer.setRenderTarget(this.renderTarget);
    this.renderer.render(scene, camera);
    // Bloom nul (palier LQ) : les trois passes sont sautées entièrement au lieu
    // d'être calculées puis multipliées par zéro.
    if (this.bloom > 0) {
      this.blit(this.bloomPrefilterMaterial, this.bloomHalf);
      this.blit(this.bloomBlurHorizontalMaterial, this.bloomBlurA);
      this.blit(this.bloomBlurVerticalMaterial, this.bloomBlurB);
    }
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
  }
}
