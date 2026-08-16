import { clamp, angleDelta } from "../core/math.js";
import { YoleDynamics } from "../sim/yole-physics.js";
import { YoleVisual } from "../render/yole-visual.js";
import { routeCenter } from "../render/world.js";
import { RNG } from "../core/rng.js";
import { UtilityBrain } from "./utility-ai.js";
import { BALANCE, RIGS, STORM_RANGE, resolveAiLevel, aiLoadout, resolveLoadout } from "./balance.js";

export class Boat {
  constructor(game, id, definition) {
    this.game = game;
    this.id = id;
    this.name = definition.name;
    this.color = definition.color;
    this.accent = definition.accent;
    this.isPlayer = Boolean(definition.isPlayer);
    // Le second humain du Duel local garde isPlayer=false : beaucoup de
    // feedbacks écran restent ainsi attachés à J1. Ce drapeau coupe uniquement
    // le cerveau IA et sélectionne l'entrée fixe dédiée.
    this.localControlled = false;
    this.dynamics = new YoleDynamics(id, game.waveField);
    this.visual = new YoleVisual(
      game.THREE,
      this.color,
      this.accent,
      id,
      game.assets,
      { graphicStyle: game.graphicStyle }
    );
    game.scene.add(this.visual.root);
    this.score = 0;
    this.stats = { takedowns: 0 };
    this.cooldowns = { wave: 0, harpoon: 0, mine: 0, rhum: 0, barik: 0, chadron: 0, lanbi: 0, pwason: 0 };
    // Seules les deux armes de soute sont en munition illimitée : c'est leur
    // cooldown qui les cadence. Les autres slots partent à zéro.
    this.ammo = { wave: Infinity, harpoon: Infinity, mine: Infinity, rhum: Infinity, barik: 0, chadron: 0, lanbi: 0, pwason: 0 };
    // Ces champs portent de l'autorité gameplay. Ils sont initialisés ici puis
    // remis à zéro par reset() à chaque manche et chaque étape du Tour.
    this.inSargasse = 0;
    this.stormTimer = 0;
    this.collisionCd = 0;
    this.coastCollisionCd = 0;
    this.lastFloodWarningAt = -99;
    this.lastAggressor = null;
    this.lastAggressionAt = -99;
    this.lastWakeAt = 0;
    this.lastSprayAt = 0;
    this.lastHandlingFxAt = 0;
    this.lastSargasseFxAt = -99;
    this.lastSlam = 0;
    this.handlingFxPosition = { x: 0, y: 0, z: 0 };
    this.handlingFxOptions = {
      speed: 1,
      upward: 0.8,
      lifeMin: 0.16,
      lifeMax: 0.40,
      sizeMin: 0.07,
      sizeMax: 0.24,
      gravity: 3.6,
      drag: 1.7
    };
    this.aiLane = 0;
    this.aiTimer = 0;
    this.rollPersonality(game.matchAiLevel);
    this.brain = null;
    this.eventScratch = {};
    this.forwardScratch = { x: 0, z: 0 };
    this.steer = 0;
    this.finishOrder = 0;
    this.eliminatedReason = "";
    this.reset(id);
  }

  get x() { return this.dynamics.x; }
  get y() { return this.dynamics.y; }
  get z() { return this.dynamics.z; }
  get speed() { return this.dynamics.speed; }
  get roll() { return this.dynamics.roll; }
  get pitch() { return this.dynamics.pitch; }
  get eliminated() { return this.dynamics.eliminated; }
  set eliminated(value) { this.dynamics.eliminated = value; }
  get water() { return this.dynamics.waterMassKg; }
  get activeCrew() { return this.dynamics.activeCrew; }
  get flow() { return this.dynamics.flow; }
  get drive() { return this.dynamics.drive; }
  get slip() { return this.dynamics.slip; }
  get grip() { return this.dynamics.grip; }
  get surf() { return this.dynamics.surf; }

  reset(slot) {
    const startX = routeCenter(0) + BALANCE.startSpread[slot];
    const startZ = -slot * 2.4;
    this.dynamics.reset(startX, startZ, 0, BALANCE.startSpeed);
    // Aucune contamination entre manches : sans ces remises à zéro, une yole
    // pouvait démarrer une étape avec le compteur de Brume, de Sargasse ou de
    // collision de l'étape précédente et faire diverger sa relecture.
    this.inSargasse = 0;
    this.stormTimer = 0;
    this.collisionCd = 0;
    this.coastCollisionCd = 0;
    this.lastFloodWarningAt = -99;
    this.rhumVfxTimer = 0;
    // Seule la yole du joueur porte le gréement choisi ; les IA restent sur
    // l'option médiane, qui est numériquement l'ancien jeu.
    const rig = this.isPlayer ? (this.game.matchRig ?? 1) : 1;
    this.dynamics.setRig?.(RIGS[rig]?.sail ?? 1, RIGS[rig]?.heel ?? 1, RIGS[rig]?.flow ?? 1);
    this.dynamics.roll = (slot - 1.5) * 0.018;
    this.score = this.score || 0;
    // Arsenal de soute toujours plein : une manche ne peut plus se jouer sans
    // qu'un seul coup soit tiré. Les autres armes repartent à sec et se
    // ramassent en caisse.
    // ⚠️ SEULE LA SOUTE EST ILLIMITÉE, et elle ne compte que deux armes. Le
    // joueur choisit la sienne au garage ; celle d'une IA est dérivée de son
    // identifiant, donc déterministe et variée d'un rival à l'autre.
    this.loadout = this.isPlayer
      ? resolveLoadout(this.game.matchLoadout)
      : aiLoadout(this.id);
    for (const key of Object.keys(this.ammo)) this.ammo[key] = 0;
    for (const key of this.loadout) this.ammo[key] = Infinity;
    this.ammo.barik = 0;
    this.ammo.chadron = 0;
    this.ammo.lanbi = 0;
    this.ammo.pwason = 0;
    // L'arme armée doit être une arme qu'on a réellement.
    this.activeWeapon = this.loadout[0];
    this.cooldowns.barik = 0;
    this.cooldowns.chadron = 0;
    this.cooldowns.lanbi = 0;
    this.cooldowns.pwason = 0;
    this.cooldowns.rhum = 0;
    const humanControlled = this.isPlayer || this.localControlled;
    this.cooldowns.wave = humanControlled ? 0.2 : this.game.gameRng.range(1.2, 3.2);
    this.cooldowns.harpoon = humanControlled ? 1.2 : this.game.gameRng.range(2.0, 4.5);
    this.cooldowns.mine = humanControlled ? 2.4 : this.game.gameRng.range(2.8, 5.2);
    // Le rhum est de loin le plus fort des quatre : il démarre en cooldown long
    // pour qu'il ne soit pas simplement bu au coup d'envoi de chaque manche.
    this.cooldowns.rhum = humanControlled ? 12.0 : this.game.gameRng.range(10.0, 18.0);
    this.lastAggressor = null;
    this.lastAggressionAt = -99;
    this.lastWakeAt = 0;
    this.lastSprayAt = 0;
    this.lastHandlingFxAt = 0;
    this.lastSargasseFxAt = -99;
    this.lastSlam = 0;
    this.aiLane = [-11, -4, 5, 12][slot];
    // Le niveau est figé pour toute la partie (game.matchAiLevel) et voyage dans
    // le replay : il est donc relu ICI, à chaque manche, plutôt que capturé une
    // fois dans le constructeur avant que startMatch ne l'ait posé.
    this.rollPersonality(this.game.matchAiLevel);
    const brainSeed = (this.game.seed ^ Math.imul(this.id + 1, 0x85ebca6b) ^ Math.imul(this.game.round + 1, 0xc2b2ae35)) >>> 0;
    this.brain = new UtilityBrain(new RNG(brainSeed), this.aiPersonality, this.game.matchAiLevel);
    this.aiTimer = this.brain.rng.range(0.25, 1.0);
    this.steer = 0;
    this.finishOrder = 0;
    this.eliminatedReason = "";
    this.visual.root.visible = true;
    // La manche repart avec l'équipage à bord : sans ça une yole chavirée
    // rembarquerait vide au tour suivant.
    this.visual.setOverboard?.(false);
    this.visual.update(this.dynamics, this.game.time, 1 / 60, this.game.atmosphere.weather);
  }

  forward(out = { x: 0, z: 0 }) {
    return this.dynamics.forward(out);
  }

  triggerForwardBoost() {
    return this.dynamics.triggerForwardBoost();
  }

  triggerLateralBoost(direction = this.steer || -this.roll || 1) {
    return this.dynamics.triggerLateralBoost(direction);
  }

  triggerShift() {
    const result = this.dynamics.triggerShift();
    const cut = this.game.tryCutGrapples?.(this) ?? 0;
    if (result.emergency && this.isPlayer) {
      this.game.showMessage("⚠ MANŒUVRE D’URGENCE · ÉQUIPAGE À L’EAU", 0.82);
    } else if (result.critical) this.game.onPerfectShift(this, result.precision);
    else if (result.recovery && this.isPlayer) this.game.showMessage("CONTRE-DÉRIVE !", 0.58);
    else if (this.isPlayer && !cut) this.game.showMessage("SHIFT TROP TÔT", 0.55);
    return { ...result, cut };
  }

  /**
   * Personnalité de pilotage, tirée sur un flux propre à la yole.
   *
   * ⚠️ EXACTEMENT TROIS tirages, quel que soit le niveau. Seules les BORNES
   * bougent : ajouter ou retirer un appel décalerait tout le flux et ferait
   * diverger les replays d'une version à l'autre.
   */
  rollPersonality(levelKey) {
    const level = resolveAiLevel(levelKey);
    const rng = new RNG((this.game.seed ^ Math.imul(this.id + 1, 0x9e3779b1)) >>> 0);
    const entre = (bornes, t) => bornes[0] + (bornes[1] - bornes[0]) * t;
    this.aiPersonality = {
      aggression: entre(level.aggression, rng.next()),
      risk: entre(level.risk, rng.next()),
      precision: entre(level.precision, rng.next())
    };
    this.aiAggression = this.aiPersonality.aggression;
    this.aiRisk = this.aiPersonality.risk;
    return this.aiPersonality;
  }

  applyHit(source, data) {
    if (this.eliminated) return;
    const payload = { ...data };
    if (data.crewLossChance && this.game.gameRng.chance(data.crewLossChance)) payload.crewLoss = 1;
    const crewBefore = this.activeCrew;
    // ⚠️ On mesure la perte RÉELLE, pas celle demandée. `YoleDynamics.applyHit`
    // sort immédiatement si le rhum est actif (la victime n'encaisse rien) et
    // borne la coque à 0 : un coup fatal sur une épave à 3 % n'enlève que 3 %.
    // Afficher `payload.structure.hull` mentirait au joueur.
    const coqueAvant = this.dynamics.structure.hull;
    this.dynamics.applyHit(payload);
    const perteCoque = coqueAvant - this.dynamics.structure.hull;
    this.lastAggressor = source || this.lastAggressor;
    this.lastAggressionAt = this.game.time;
    if (source && source !== this) this.brain?.rememberAttacker(source);
    this.visual.flashImpact(Math.abs(payload.rollImpulse ?? 0) + 0.35);
    // Purement visuel, et lu APRÈS coup : aucun tirage ajouté au gameRng, donc
    // aucun décalage du flux aléatoire et aucune divergence de replay.
    if (perteCoque > 0.005) this.game.pushDamageNumber?.(this, perteCoque, source);
    if (this.activeCrew < crewBefore) this.game.onCrewLost(this, crewBefore - this.activeCrew, payload);
    if (this.isPlayer) this.game.onPlayerHit(payload);
  }

  updateAI(dt) {
    this.brain?.update(dt);
    this.aiTimer -= dt;
    const stormGap = this.z - this.game.stormZ;
    const stability = 1 - clamp(Math.abs(this.roll) / 1.15, 0, 1);
    const lookZ = this.z + 28 + this.speed * 0.72;
    const routeX = routeCenter(lookZ);
    let targetX = routeX + this.aiLane;

    // Survival always wins over aggression.
    if (stormGap < STORM_RANGE.iaRecentrage) targetX = routeX + clamp(this.aiLane * 0.35, -4, 4);
    if (this.water > 115 || stability < 0.38) targetX = routeX;

    const targetChoice = this.brain?.chooseTarget(this, this.game);
    const nearestAhead = targetChoice?.target ?? null;
    if (nearestAhead) {
      const dz = nearestAhead.z - this.z;
      const dx = nearestAhead.x - this.x;
      const distance = Math.hypot(dx, dz);
      if (dz > -2 && dz < 13 && Math.abs(dx) < 3.8) targetX -= Math.sign(dx || 1) * (5.2 + this.aiRisk * 2.8);
      const vulnerability = clamp(Math.abs(nearestAhead.roll) / 0.9 + nearestAhead.water / 220, 0, 1.4);
      if (distance < 16 && stability > 0.62 && stormGap > STORM_RANGE.iaAgression && this.aiAggression > 0.62 && vulnerability > 0.55) {
        targetX = nearestAhead.x + Math.sign(this.x - nearestAhead.x || 1) * 0.9;
      }
    }

    const desired = Math.atan2(targetX - this.x, Math.max(10, lookZ - this.z));
    // ⚠️ NÉGATIF pour suivre la nouvelle convention : `steer` positif veut dire
    // « vers la droite de l'écran », pas « cap croissant ». Sans ce signe, l'IA
    // barrerait à l'opposé de sa cible depuis la correction de yole-physics.
    this.steer = clamp(-angleDelta(this.dynamics.heading, desired) * (1.55 + this.aiRisk * 0.55), -1, 1);

    if (this.aiTimer <= 0) {
      this.aiTimer = this.brain?.rng.range(0.34, 0.95) ?? 0.65;
      const action = this.brain?.chooseAction(this, this.game, stormGap) ?? { type: "none" };
      if (action.type === "shift") this.triggerShift();
      else if (action.type === "wave") this.game.fireAimed(this, action.target, "wave");
      else if (action.type === "harpoon") this.game.fireHarpoon(this, action.target);
      else if (action.type === "mine") this.game.dropMine(this);
      else if (action.type === "rhum") this.game.drinkRhum(this);
      else if (action.type === "barik") this.game.dropBarik(this);
      else if (action.type === "chadron") this.game.sowChadron(this);
      else if (action.type === "lanbi") this.game.blowLanbi(this);
      else if (action.type === "pwason") this.game.fireAimed(this, action.target ?? null, "pwason") || this.game.firePwason(this);
      else if (action.type === "boost_forward") this.game.triggerForwardBoost(this);
      else if (action.type === "boost_lateral") this.game.triggerLateralBoost(this, action.direction);
      else if (action.type === "lane") this.aiLane = clamp(this.aiLane + action.delta, -15, 15);
    }
  }

  fixedUpdate(dt, playerInput, environment) {
    if (!this.isPlayer && !this.localControlled && !this.eliminated) this.updateAI(dt);
    // Une seule source de vérité : Mine et Rhum peuvent venir de la soute OU
    // d'une caisse. Les décrémenter d'abord comme armes de base puis dans la
    // liste des caisses divisait silencieusement leurs délais par deux.
    for (const key of Object.keys(this.cooldowns)) {
      this.cooldowns[key] = Math.max(0, (this.cooldowns[key] ?? 0) - dt);
    }

    const input = (this.isPlayer || this.localControlled) ? playerInput : { steer: this.steer, trim: 0.82 };
    this.dynamics.fixedStep(dt, input, environment);
    const dynamicsEvent = this.dynamics.consumeEvents(this.eventScratch);
    if (dynamicsEvent.mask) this.game.onBoatDynamicsEvent(this, dynamicsEvent);

    if (!this.eliminated && this.game.time - this.lastWakeAt > Math.max(0.045, 0.15 - this.speed * 0.004)) {
      const forward = this.forward(this.forwardScratch);
      this.game.ocean.wake.trail(this.x - forward.x * 3.9, this.z - forward.z * 3.9, this.dynamics.heading, this.speed, 0.65 + this.speed * 0.02);
      this.lastWakeAt = this.game.time;
    }

    // Ecume directionnelle purement visuelle : elle rend la glisse et le surf
    // lisibles avant même de regarder le HUD, sans modifier la grille de sillage
    // (qui, elle, fait partie de la simulation déterministe).
    const handlingSlip = clamp(this.slip, 0, 1);
    const handlingSurf = clamp(this.surf, 0, 1);
    const handlingEnergy = Math.max(handlingSlip, handlingSurf * 0.78);
    const handlingCadence = Math.max(0.055, 0.145 - handlingEnergy * 0.072);
    if (
      !this.eliminated
      && this.speed > 7
      && (handlingSlip > 0.23 || handlingSurf > 0.52)
      && this.game.time - this.lastHandlingFxAt > handlingCadence
    ) {
      const forward = this.forward(this.forwardScratch);
      const side = Math.sign(this.dynamics.slipAngle || this.steer || 1) || 1;
      const rightX = forward.z;
      const rightZ = -forward.x;
      const position = this.handlingFxPosition;
      position.x = this.x - forward.x * 3.6 - rightX * side * (0.72 + handlingSlip * 0.62);
      position.y = this.dynamics.centerWaterHeight + 0.18;
      position.z = this.z - forward.z * 3.6 - rightZ * side * (0.72 + handlingSlip * 0.62);
      const options = this.handlingFxOptions;
      options.speed = 0.52 + handlingSlip * 1.55 + handlingSurf * 0.42;
      options.upward = 0.42 + handlingSurf * 0.88 + handlingSlip * 0.24;
      options.sizeMax = 0.20 + handlingEnergy * 0.18;
      const particleBudget = Number.isFinite(this.game.particleBudget) ? this.game.particleBudget : 1;
      const count = Math.max(1, Math.floor((2 + handlingEnergy * 5) * particleBudget));
      const recovering = this.dynamics.counterSteer > 0.28 && handlingSlip > 0.24;
      this.game.particles.emitBurst(
        this.game.visualRng,
        position,
        recovering ? 0x9effd8 : handlingSurf > handlingSlip ? 0x7ff8ff : 0xd5fbff,
        count,
        options
      );
      this.lastHandlingFxAt = this.game.time;
    }

    const sprayStrength = this.dynamics.spray;
    if (!this.eliminated && sprayStrength > 0.15 && this.game.time - this.lastSprayAt > Math.max(0.035, 0.11 - sprayStrength * 0.035)) {
      const forward = this.forward(this.forwardScratch);
      const bow = {
        x: this.x + forward.x * 4.85,
        y: this.dynamics.lastBowWaterHeight + 0.25,
        z: this.z + forward.z * 4.85
      };
      const count = Math.max(2, Math.floor((3 + sprayStrength * 8) * this.game.particleBudget));
      this.game.particles.emitBurst(this.game.visualRng, bow, 0xc8fbff, count, {
        speed: 0.75 + sprayStrength * 1.25,
        upward: 1.1 + sprayStrength * 1.15,
        lifeMin: 0.22,
        lifeMax: 0.58,
        sizeMin: 0.08,
        sizeMax: 0.30 + sprayStrength * 0.16,
        gravity: 5.2,
        drag: 1.25
      });
      this.lastSprayAt = this.game.time;
    }

  }

  renderUpdate(time, dt, weather) {
    this.visual.update(this.dynamics, time, dt, weather);
  }
}
