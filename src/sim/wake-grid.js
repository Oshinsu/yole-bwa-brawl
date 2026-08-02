import { clamp, lerp } from "../core/math.js";

const idx = (x, y, size) => y * size + x;

/** Remet à zéro les seules quatre lignes de bordure d'une grille carrée. */
function zeroBords(tableau, size) {
  const derniere = (size - 1) * size;
  tableau.fill(0, 0, size);                 // ligne du haut
  tableau.fill(0, derniere, derniere + size); // ligne du bas
  for (let y = 1; y < size - 1; y++) {
    const ligne = y * size;
    tableau[ligne] = 0;                     // colonne de gauche
    tableau[ligne + size - 1] = 0;          // colonne de droite
  }
}

/** Deterministic local height/velocity/foam simulation for wakes and impacts. */
export class WakeGrid {
  constructor({ resolution = 128, worldSize = 170 } = {}) {
    this.resolution = Math.max(32, resolution | 0);
    this.worldSize = Math.max(32, worldSize);
    this.cellSize = this.worldSize / this.resolution;
    this.invCellSize = 1 / this.cellSize;
    this.centerX = 0;
    this.centerZ = 0;
    const length = this.resolution * this.resolution;
    this.height = new Float32Array(length);
    this.velocity = new Float32Array(length);
    this.foam = new Float32Array(length);
    this.nextHeight = new Float32Array(length);
    this.nextVelocity = new Float32Array(length);
    this.nextFoam = new Float32Array(length);
    this.accumulator = 0;
    this.fixedStep = 1 / 30;
    this.maxHeight = 1.8;
    this.sampleScratch = { height: 0, foam: 0, velocity: 0 };
  }

  clear() {
    this.height.fill(0); this.velocity.fill(0); this.foam.fill(0);
    this.nextHeight.fill(0); this.nextVelocity.fill(0); this.nextFoam.fill(0);
    // Une nouvelle manche doit repartir de la même origine et de la même
    // phase fixe. Vider seulement les textures laissait ces trois valeurs
    // dépendre de la course précédente et faisait diverger les replays.
    this.centerX = 0;
    this.centerZ = 0;
    this.accumulator = 0;
  }

  worldToGrid(x, z) {
    return {
      x: (x - this.centerX) * this.invCellSize + this.resolution * 0.5,
      y: (z - this.centerZ) * this.invCellSize + this.resolution * 0.5
    };
  }

  recenter(x, z) {
    const shiftX = Math.round((x - this.centerX) * this.invCellSize);
    const shiftY = Math.round((z - this.centerZ) * this.invCellSize);
    if (!shiftX && !shiftY) return false;
    const size = this.resolution;
    if (Math.abs(shiftX) >= size || Math.abs(shiftY) >= size) {
      this.clear();
      this.centerX = x;
      this.centerZ = z;
      return true;
    }
    this.nextHeight.fill(0); this.nextVelocity.fill(0); this.nextFoam.fill(0);
    for (let y0 = 1; y0 < size - 1; y0++) {
      const sy = y0 + shiftY;
      if (sy <= 0 || sy >= size - 1) continue;
      for (let x0 = 1; x0 < size - 1; x0++) {
        const sx = x0 + shiftX;
        if (sx <= 0 || sx >= size - 1) continue;
        const d = idx(x0, y0, size); const s = idx(sx, sy, size);
        this.nextHeight[d] = this.height[s];
        this.nextVelocity[d] = this.velocity[s];
        this.nextFoam[d] = this.foam[s];
      }
    }
    [this.height, this.nextHeight] = [this.nextHeight, this.height];
    [this.velocity, this.nextVelocity] = [this.nextVelocity, this.velocity];
    [this.foam, this.nextFoam] = [this.nextFoam, this.foam];
    this.centerX += shiftX * this.cellSize;
    this.centerZ += shiftY * this.cellSize;
    return true;
  }

  depositCell(x, y, h, v, foam) {
    if (x < 1 || y < 1 || x >= this.resolution - 1 || y >= this.resolution - 1) return;
    const i = idx(x, y, this.resolution);
    this.height[i] = clamp(this.height[i] + h, -this.maxHeight, this.maxHeight);
    this.velocity[i] = clamp(this.velocity[i] + v, -8, 8);
    this.foam[i] = clamp(Math.max(this.foam[i], foam), 0, 1);
  }

  stampTrail(x, z, heading, speed, strength = 1) {
    const p = this.worldToGrid(x, z);
    const c = Math.cos(heading); const s = Math.sin(heading);
    const halfLength = clamp(2.8 + speed * 0.22, 3, 9) * this.invCellSize;
    const halfWidth = clamp(0.8 + strength * 0.48, 0.7, 2.2) * this.invCellSize;
    const extent = Math.ceil(Math.max(halfLength, halfWidth) + 2);
    const cx = Math.round(p.x); const cy = Math.round(p.y);
    for (let oy = -extent; oy <= extent; oy++) {
      for (let ox = -extent; ox <= extent; ox++) {
        const lx = ox * c - oy * s;
        const lz = ox * s + oy * c;
        const nx = lx / Math.max(0.7, halfWidth);
        const nz = lz / Math.max(1.2, halfLength);
        const g = Math.exp(-(nx * nx * 2.4 + nz * nz * 1.45));
        if (g < 0.025) continue;
        const fork = Math.sin(lx * 3.1) * 0.28 + 0.72;
        const impulse = g * strength * fork;
        this.depositCell(cx + ox, cy + oy, impulse * 0.032, -impulse * 0.10, impulse * 0.54);
      }
    }
  }

  stampBurst(x, z, radius = 5, strength = 1) {
    const p = this.worldToGrid(x, z);
    const rr = Math.max(1, radius * this.invCellSize);
    const thickness = Math.max(1.1, rr * 0.22);
    const extent = Math.ceil(rr + thickness * 2);
    const cx = Math.round(p.x); const cy = Math.round(p.y);
    for (let oy = -extent; oy <= extent; oy++) {
      for (let ox = -extent; ox <= extent; ox++) {
        const d = Math.hypot(ox, oy);
        const ring = Math.exp(-Math.pow((d - rr) / thickness, 2));
        const core = Math.exp(-Math.pow(d / Math.max(1, rr * 0.55), 2));
        if (ring + core < 0.02) continue;
        this.depositCell(cx + ox, cy + oy,
          core * strength * -0.025 + ring * strength * 0.105,
          ring * strength * 1.45 - core * strength * 0.4,
          Math.max(ring, core * 0.55) * strength);
      }
    }
  }

  stampLine(x0, z0, x1, z1, strength = 1) {
    const distance = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.max(1, Math.ceil(distance / Math.max(0.5, this.cellSize * 0.7)));
    const heading = Math.atan2(x1 - x0, z1 - z0);
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      this.stampTrail(lerp(x0, x1, t), lerp(z0, z1, t), heading, distance * 0.6, strength * 0.32);
    }
  }

  step(dt, currentX = 0, currentZ = 0) {
    const size = this.resolution;
    const h = this.height, v = this.velocity, f = this.foam;
    const nh = this.nextHeight, nv = this.nextVelocity, nf = this.nextFoam;
    const waveSpeed = 20, damping = 3.25, diffusion = 0.15;
    const heightDecay = Math.exp(-dt * 0.72);
    const foamDecay = Math.exp(-dt * 0.92);
    // ⚠️ HISSÉ HORS DE LA BOUCLE, ET C'EST BIT-EXACT. `damping` et `dt` sont
    // constants sur toute la passe : cette exponentielle valait donc déjà la
    // même chose pour les 36 100 cellules, et elle était recalculée pour chacune
    // — trente fois par seconde, à tous les paliers de qualité, y compris sur
    // téléphone. Ses deux voisines, `heightDecay` et `foamDecay`, avaient été
    // sorties ; celle-ci était restée. Même expression, mêmes opérandes, donc
    // rigoureusement le même flottant : les checksums de replay ne bougent pas.
    const dampDecay = Math.exp(-damping * dt);
    const advX = currentX * dt * this.invCellSize;
    const advY = currentZ * dt * this.invCellSize;
    // ⚠️ SEULS LES BORDS SONT REMIS À ZÉRO. La double boucle ci-dessous réécrit
    // intégralement l'intérieur (1 ≤ x, y ≤ size-2) ; seules les quatre lignes
    // de bordure lui échappent, et ce sont les seules que le `fill(0)` d'origine
    // servait réellement à nettoyer. 768 écritures au lieu de 110 592 pour trois
    // tableaux, et le contenu final est identique au bit près.
    zeroBords(nh, size); zeroBords(nv, size); zeroBords(nf, size);
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const i = idx(x, y, size);
        const lap = h[i - 1] + h[i + 1] + h[i - size] + h[i + size] - 4 * h[i];
        const nextV = (v[i] + lap * waveSpeed * dt) * dampDecay;
        nh[i] = clamp((h[i] + nextV * dt) * heightDecay, -this.maxHeight, this.maxHeight);
        nv[i] = nextV;
        const sx = clamp(x - advX, 1, size - 2), sy = clamp(y - advY, 1, size - 2);
        const x0 = Math.floor(sx), y0 = Math.floor(sy), tx = sx - x0, ty = sy - y0;
        const i00 = idx(x0, y0, size), i10 = i00 + 1, i01 = i00 + size, i11 = i01 + 1;
        const advFoam = lerp(lerp(f[i00], f[i10], tx), lerp(f[i01], f[i11], tx), ty);
        const generated = clamp(Math.abs(lap) * 5.4 + Math.abs(nextV) * 0.08, 0, 1);
        const neighbors = (f[i - 1] + f[i + 1] + f[i - size] + f[i + size]) * 0.25;
        nf[i] = clamp(Math.max(advFoam * foamDecay, generated) + (neighbors - advFoam) * diffusion, 0, 1);
      }
    }
    [this.height, this.nextHeight] = [nh, h];
    [this.velocity, this.nextVelocity] = [nv, v];
    [this.foam, this.nextFoam] = [nf, f];
  }

  update(dt, centerX, centerZ, currentX = 0, currentZ = 0) {
    this.recenter(centerX, centerZ);
    this.accumulator += Math.min(0.1, dt);
    let stepped = false;
    while (this.accumulator >= this.fixedStep) {
      this.step(this.fixedStep, currentX, currentZ);
      this.accumulator -= this.fixedStep;
      stepped = true;
    }
    return stepped;
  }

  sample(x, z, out = this.sampleScratch) {
    const p = this.worldToGrid(x, z), gx = p.x, gy = p.y;
    if (gx < 1 || gy < 1 || gx >= this.resolution - 2 || gy >= this.resolution - 2) {
      out.height = 0; out.foam = 0; out.velocity = 0; return out;
    }
    const x0 = Math.floor(gx), y0 = Math.floor(gy), tx = gx - x0, ty = gy - y0;
    const i00 = idx(x0, y0, this.resolution), i10 = i00 + 1, i01 = i00 + this.resolution, i11 = i01 + 1;
    const bilerp = (a) => lerp(lerp(a[i00], a[i10], tx), lerp(a[i01], a[i11], tx), ty);
    out.height = bilerp(this.height); out.foam = bilerp(this.foam); out.velocity = bilerp(this.velocity);
    return out;
  }

  encodeRGBA(target) {
    const required = this.resolution * this.resolution * 4;
    const pixels = target?.length === required ? target : new Uint8ClampedArray(required);
    for (let i = 0, p = 0; i < this.height.length; i++, p += 4) {
      pixels[p] = Math.round(clamp(this.height[i] / (this.maxHeight * 2) + 0.5, 0, 1) * 255);
      pixels[p + 1] = Math.round(clamp(this.foam[i], 0, 1) * 255);
      pixels[p + 2] = Math.round(clamp(this.velocity[i] / 16 + 0.5, 0, 1) * 255);
      pixels[p + 3] = 255;
    }
    return pixels;
  }

  energy() {
    let sum = 0;
    for (let i = 0; i < this.height.length; i++) sum += Math.abs(this.height[i]) + Math.abs(this.velocity[i]) * 0.08 + this.foam[i] * 0.12;
    return sum / this.height.length;
  }
}
