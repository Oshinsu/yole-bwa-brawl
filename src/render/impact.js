import { clamp } from "../core/math.js";

// Directeur d'impact : hiérarchise les chocs pour que tout ne soit pas « maximum ».
// Le gel est purement rendu — il retire du temps réel à l'accumulateur de frame(),
// jamais du temps de simulation. La séquence de ticks, le checksum et les replays
// sont donc strictement identiques avec ou sans hitstop.

export const IMPACT_TIERS = Object.freeze({
  graze: { freeze: 0.012, kick: 0.18, roll: 0.006, flash: 0.03, shake: 0.09, fov: 0.3, aftershock: 0.00 },
  slam: { freeze: 0.074, kick: 0.96, roll: 0.038, flash: 0.28, shake: 0.56, fov: 2.1, aftershock: 0.13 },
  // Identités d'arme : le harpon tire sec et latéralement, la coco pousse large,
  // la mine frappe plus profond avec une queue basse fréquence.
  // Le harpon frappe désormais bien plus fort côté dégâts (BALANCE.grapple) :
  // sa signature d'impact suit, sinon l'arme fait mal sans le montrer. Elle
  // reste SOUS la coco en flash et en secousse — le harpon est sec et latéral,
  // pas une explosion — mais son hitstop et son recul passent devant : c'est un
  // coup de croc, il doit accrocher.
  harpoon: { freeze: 0.116, kick: 1.58, roll: 0.082, flash: 0.38, shake: 0.94, fov: 3.1, aftershock: 0.30 },
  coconut: { freeze: 0.122, kick: 1.68, roll: 0.060, flash: 0.56, shake: 1.08, fov: 4.2, aftershock: 0.34 },
  mine: { freeze: 0.142, kick: 1.92, roll: 0.070, flash: 0.62, shake: 1.28, fov: 4.9, aftershock: 0.52 },
  blast: { freeze: 0.112, kick: 1.46, roll: 0.054, flash: 0.50, shake: 0.96, fov: 3.6, aftershock: 0.28 },
  takedown: { freeze: 0.160, kick: 1.88, roll: 0.076, flash: 0.66, shake: 1.38, fov: 4.9, aftershock: 0.58 }
});

// 160 ms maximum : au-delà, l'impact se lit comme un freeze réseau. Le poids
// supplémentaire vient de l'aftershock, pas d'une privation de contrôle.
const MAX_FREEZE = 0.16;
const KICK_DECAY = 13.5;
const FLASH_DECAY = 7.2;
const AFTERSHOCK_DECAY = 5.1;

export class ImpactDirector {
  constructor(rng, settings = null) {
    this.rng = rng;
    this.settings = settings;
    this.freeze = 0;
    this.flash = 0;
    this.fovKick = 0;
    this.kickX = 0;
    this.kickY = 0;
    this.kickZ = 0;
    this.kickRoll = 0;
    this.shake = 0;
    this.aftershock = 0;
    this.aftershockPhase = 0;
    this.aftershockX = 0;
    this.aftershockZ = 1;
    this.lastTier = null;
    this.lastIntensity = 0;
  }

  get strength() {
    const value = this.settings?.get("impact");
    return typeof value === "number" ? clamp(value, 0, 1) : 1;
  }

  get flashStrength() {
    return this.strength * (this.settings?.get("reduceFlash") ? 0.25 : 1);
  }

  reset() {
    this.freeze = 0;
    this.flash = 0;
    this.fovKick = 0;
    this.kickX = this.kickY = this.kickZ = this.kickRoll = this.shake = 0;
    this.aftershock = 0;
    this.aftershockPhase = 0;
    this.aftershockX = 0;
    this.aftershockZ = 1;
    this.lastTier = null;
    this.lastIntensity = 0;
  }

  // dirX/dirZ : direction du choc dans le plan monde, normalisée par l'appelant.
  trigger(tierName, { dirX = 0, dirZ = 0, intensity = 1, side = 0 } = {}) {
    const tier = IMPACT_TIERS[tierName];
    if (!tier) return;
    const strength = this.strength;
    if (strength <= 0) return;
    const amount = clamp(intensity, 0, 1.6) * strength;
    const length = Math.hypot(dirX, dirZ) || 1;
    const nx = dirX / length;
    const nz = dirZ / length;

    // Un choc n'additionne pas son gel : on garde le plus fort, sinon une salve
    // de coco enchaînée fige la partie.
    this.freeze = clamp(Math.max(this.freeze, tier.freeze * amount), 0, MAX_FREEZE);
    this.kickX += nx * tier.kick * amount;
    this.kickZ += nz * tier.kick * amount;
    this.kickY += tier.kick * amount * 0.22;
    this.kickRoll += (side || (this.rng.chance(0.5) ? 1 : -1)) * tier.roll * amount;
    this.flash = clamp(this.flash + tier.flash * amount * this.flashStrength, 0, 1);
    this.fovKick += tier.fov * amount;
    this.shake += tier.shake * amount;
    this.aftershock = Math.max(this.aftershock, (tier.aftershock ?? 0) * amount);
    this.aftershockPhase = 0;
    this.aftershockX = nx;
    this.aftershockZ = nz;
    this.lastTier = tierName;
    this.lastIntensity = amount;
  }

  // Consomme le temps réel de la frame : retourne le temps qui va réellement
  // nourrir la simulation à pas fixe.
  consume(dt) {
    if (this.freeze <= 0) return dt;
    const used = Math.min(this.freeze, dt);
    this.freeze -= used;
    return Math.max(0, dt - used);
  }

  get frozen() {
    return this.freeze > 0;
  }

  update(dt) {
    const decay = Math.exp(-KICK_DECAY * dt);
    this.kickX *= decay;
    this.kickY *= decay;
    this.kickZ *= decay;
    this.kickRoll *= decay;
    this.fovKick *= decay;
    this.shake = Math.max(0, this.shake - dt * 2.4);
    this.flash = Math.max(0, this.flash - dt * FLASH_DECAY);
    this.aftershockPhase += dt;
    this.aftershock *= Math.exp(-AFTERSHOCK_DECAY * dt);
  }

  // Position : recul directionnel net + résidu aléatoire proportionnel.
  // À appeler AVANT lookAt(), qui recalcule l'orientation complète.
  applyToCamera(camera) {
    const strength = this.strength;
    if (strength <= 0) return;
    camera.position.x += this.kickX;
    camera.position.y += this.kickY;
    camera.position.z += this.kickZ;
    if (this.shake > 0.001) {
      camera.position.x += this.rng.signed() * this.shake * 0.16 * strength;
      camera.position.y += this.rng.signed() * this.shake * 0.10 * strength;
    }
    if (this.aftershock > 0.001) {
      const wave = Math.sin(this.aftershockPhase * 35) * this.aftershock * strength;
      camera.position.x += this.aftershockX * wave * 0.22;
      camera.position.y += Math.abs(wave) * 0.10;
      camera.position.z += this.aftershockZ * wave * 0.22;
    }
  }

  // Roulis et coup de zoom, après lookAt(). Le roulis passe par rotateZ() —
  // une rotation LOCALE composée sur le quaternion — et jamais par une écriture
  // de camera.rotation.z : l'Euler XYZ relu après lookAt est dégénéré dès que la
  // caméra plonge, et forcer sa composante z retourne la caméra de 180°.
  applyOrientation(camera) {
    if (this.strength <= 0) return;
    if (this.kickRoll) camera.rotateZ(this.kickRoll);
    camera.fov -= this.fovKick + Math.sin(this.aftershockPhase * 24) * this.aftershock * 0.32;
  }
}
