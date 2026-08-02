import { clamp, damp, angleDelta, finite } from "../core/math.js";

const CREW_COUNT = 6;
const CREW_MASSES = new Float32Array([78, 74, 82, 69, 76, 80]);

// Eight longitudinal stations × port/starboard. z<0 is bow in this model.
//
// ⚠️ RECALÉES SUR LA COQUE VISIBLE LE 2 AOÛT 2026. CHANGEMENT AUTORITAIRE.
//
// Ces largeurs flottaient jusque-là à leur valeur d'origine, alors que le rendu
// affine la coque de `HULL_VISUAL_WIDTH_SCALE = 0.84` depuis la passe du
// 30 juillet. Résultat mesuré : les seize points de flottabilité tombaient
// jusqu'à **18 cm en dehors de la coque qu'on voit**, au maître-bau. Le bateau
// flottait sur des points invisibles — dans un jeu entièrement construit sur la
// lecture de la gîte, c'est le pire endroit où mentir.
//
// Chaque largeur vaut désormais la demi-largeur RÉELLE du mesh livré à cette
// station, multipliée par 0,84. Recalculable à tout moment depuis
// `assets/models/yole_hull.glb` ; verrouillée par `npm run test:hull`.
//
// ⚠️ CE QUI N'A PAS BOUGÉ, ET POURQUOI.
// `keel` et `volume` sont inchangés. La décision portait sur le débord LATÉRAL.
// La quille du mesh est pourtant 12 à 33 cm plus creuse que celle déclarée ici
// (−0,566 contre −0,44 au maître-bau) : la yole flotte plus haut qu'elle n'en a
// l'air. Toucher à `keel` change le tirant d'eau et donc toute la flottaison,
// pas seulement le bras de levier — c'est une seconde décision, distincte, et
// elle n'est pas prise.
//
// ⚠️ L'EFFET MESURÉ EST L'INVERSE DE CELUI QU'ON ATTENDAIT.
// Le bras de levier du couple de flottabilité EST cette largeur
// (`rollTorque += localX * force`), donc la rétrécir devait assouplir la yole.
// Mesure faite (`tools/probe_roll_stability.mjs`, avant → après) : elle est
// très légèrement PLUS raide.
//
//   gîte médiane depuis 40°     10,5° → 9,9°
//   retour sous 20° depuis 40°  1,10 s → 1,07 s
//   retour sous 20° depuis 60°  1,28 s → 1,25 s
//   avec contre-gîte            0,82 s → 0,80 s
//
// Explication : le redressement est dominé par le ressort artificiel
// `impactRecovery = -roll * mass * 15.4`, indépendant de la géométrie. La part
// de flottabilité est minoritaire, et resserrer les points modifie surtout la
// dissymétrie d'immersion entre bord au vent et bord sous le vent — ici dans le
// sens favorable. Le changement de ressenti est donc marginal ; c'est la
// cohérence visuelle qui motive la manœuvre, pas l'équilibrage.
// Exportée pour que `test/hull-contract.test.mjs` la lise À LA SOURCE. Elle y
// était d'abord recopiée — soit exactement le défaut que ce test dénonce, deux
// tables de vérité qui dérivent l'une de l'autre. La copie a d'ailleurs
// immédiatement menti : elle annonçait encore 18 cm de débord après correction.
export const HULL_STATIONS = [
  { z: -5.05, width: 0.348, keel: -0.22, volume: 0.58 },
  { z: -4.05, width: 0.642, keel: -0.31, volume: 0.82 },
  { z: -2.75, width: 0.811, keel: -0.39, volume: 1.02 },
  { z: -1.15, width: 0.892, keel: -0.43, volume: 1.13 },
  { z: 0.65, width: 0.900, keel: -0.44, volume: 1.15 },
  { z: 2.35, width: 0.758, keel: -0.40, volume: 1.02 },
  { z: 3.78, width: 0.561, keel: -0.33, volume: 0.82 },
  { z: 4.82, width: 0.223, keel: -0.24, volume: 0.60 }
];

const BUOYANCY_POINTS = HULL_STATIONS.flatMap((station, stationIndex) => [
  { x: -station.width, z: station.z, keel: station.keel, volume: station.volume, compartment: stationIndex < 3 ? 0 : stationIndex > 5 ? 2 : 1 },
  { x: station.width, z: station.z, keel: station.keel, volume: station.volume, compartment: stationIndex < 3 ? 3 : stationIndex > 5 ? 5 : 4 }
]);

const COMPARTMENT_X = new Float32Array([-0.62, -0.66, -0.55, 0.62, 0.66, 0.55]);
const COMPARTMENT_Z = new Float32Array([-3.2, 0, 3.1, -3.2, 0, 3.1]);

const EVENT_SLAM = 1;
const EVENT_CREW_CROSSED = 2;
const EVENT_CRITICAL_FLOOD = 4;
const EVENT_CREW_LOADED = 8;

// Départ de la vague de rappel, de la proue vers la poupe. Le dernier dresseur
// retient volontairement le bateau plus longtemps : sur une vraie yole il est
// le dernier à relâcher le rappel pendant une manœuvre. La précision resserre
// cette vague sans jamais transformer six corps en téléportation simultanée.
const CREW_SHIFT_DELAYS = new Float32Array([0, 0.055, 0.115, 0.18, 0.27, 0.40]);

// Réglages de maniabilité arcade. Ils restent dans la couche simulation afin
// qu'une partie, un replay et le Duel local empruntent exactement les mêmes
// courbes. Les états drive/slip/grip/counterSteer sont publics : le rendu peut
// les lire, mais ils ne dépendent jamais du rendu.
export const YOLE_HANDLING = Object.freeze({
  driveRise: 3.15,
  driveFall: 7.4,
  trimFeathered: 0.58,
  trimPowered: 0.70,
  trimMinimumDrive: 0.24,
  featherBrakeBase: 0.32,
  featherBrakeSpeed: 0.075,
  steeringLowSpeed: 0.50,
  steeringHighSpeedGain: 0.56,
  steeringFullSpeed: 16,
  stationarySteeringFloor: 0.18,
  stationarySteeringSpeed: 0.50,
  yawEngage: 4.0,
  yawRelease: 5.8,
  yawCounterGain: 4.4,
  counterSettleTime: 0.18,
  counterSettleSteering: 0.28,
  lateralGripBase: 1.16,
  lateralGripSpeed: 0.031,
  driftGripReduction: 0.34,
  counterGripGain: 0.58,
  neutralGripGain: 0.18,
  deepSlipStart: 0.52,
  deepSlipFull: 0.88,
  deepSlipGripGain: 0.72,
  deepSlipSteerCut: 0.32,
  turnDragBase: 0.18,
  turnDragSpeed: 0.018,
  counterFlowGain: 0.20,
  dashRecoveryWindow: 0.45,
  dashRecoverySlip: 0.24,
  dashRecoveryLateralCut: 0.38,
  dashRecoveryYawCut: 0.38,
  dashRecoveryRollCut: 0.52,

  // ─── TURBO ───────────────────────────────────────────────────────────────
  //
  // Le turbo n'avait AUCUN coût d'équilibre. Il touchait la vitesse, le Flow et
  // le cooldown, et augmentait même la cohésion de +0,025 : appuyer était
  // gratuit en risque, ce qui en faisait le bouton évident, tout le temps.
  //
  // Et son cooldown de 0,64 s ne le cadençait pas non plus : la seule vraie
  // limite était la jauge de Flow, ce qui autorisait TROIS turbos enchaînés en
  // deux secondes, puis un vide de dix. Un pic suivi d'un trou, pas un rythme.
  //
  // Désormais : cooldown réel, et une gîte encaissée à l'allumage. Une yole
  // sous voile qui prend brutalement de la vitesse embarque du couple — c'est
  // physiquement juste, et surtout ça rend le turbo DÉCIDABLE : on ne le lance
  // pas en pleine gîte, ou on contre-gîte dans la foulée.
  // 10 s : demandé au playtest. C'est long, et c'est le point — le turbo
  // devient une ressource qu'on garde pour un dépassement ou une fuite devant le
  // Grain, plus un bouton de croisière. La jauge de Flow n'est alors plus le
  // frein : c'est le compteur.
  boostCooldown: 10.0,
  boostRollKick: 0.34,
  boostRollVelKick: 0.55,
  // Lancer le turbo alors qu'on gîte déjà aggrave, au lieu de simplement
  // ajouter : c'est ce qui punit le spam sans jamais interdire le bouton.
  boostRollCompound: 0.62,
  boostCohesionCost: 0.045,
  // ─── BWA DASH ─────────────────────────────────────────────────────────────
  // Demandé au playtest : beaucoup plus puissant, plus large, cooldown 15 s, et
  // capable de faire chavirer l'adversaire pris de flanc. C'est devenu l'arme de
  // contact du jeu, pas une esquive — d'où un compteur plus long que le turbo.
  lateralBoostCooldown: 15.0,
  dashImpulse: 17.8,
  dashForwardBleed: 0.85,
  // Le coup de bwa couche la yole qui le donne, aussi : lancer un dash en pleine
  // gîte reste une mauvaise idée.
  dashSelfRoll: 0.52,

  // Marge pour les impulsions collision/harpon appliquées après fixedStep.
  planarSpeedLimit: 32.5,
  // Plafond des impulsions HORS fixedStep — turbo, dash, slingshot.
  //
  // ⚠️ Il ne s'agit pas d'un réglage mais d'un INVARIANT. `planarSpeedLimit` ne
  // s'applique qu'en fin de fixedStep ; les déclencheurs, eux, écrivent
  // directement dans vx/vz depuis l'extérieur. Tant que l'IA ne prenait le turbo
  // que pour fuir le Grain, la marge de 2,5 m/s suffisait par accident et le
  // plafond « sous 35 m/s » tenait sans que rien ne le garantisse. Dès que les
  // IA se sont mises à courir au turbo, la borne a sauté — 37,85 m/s mesurés au
  // smoke complet. Le plafond est donc désormais imposé, pas espéré.
  impulseSpeedLimit: 34.4
});

export class YoleDynamics {
  constructor(id, waveField) {
    this.id = id;
    this.waveField = waveField;
    this.structure = {
      hull: 1,
      mast: 1,
      sail: 1,
      bwa: [1, 1, 1, 1]
    };
    this.crewPositions = new Float32Array(CREW_COUNT);
    this.crewTargets = new Float32Array(CREW_COUNT);
    this.crewVelocities = new Float32Array(CREW_COUNT);
    this.crewDelays = new Float32Array(CREW_COUNT);
    this.crewStartDelays = new Float32Array(CREW_COUNT);
    this.flooding = new Float32Array(6);
    this.lastImmersions = new Float32Array(BUOYANCY_POINTS.length);
    this.events = {
      mask: 0,
      slam: 0,
      spray: 0,
      shiftCrossing: 0,
      shiftCatch: 0,
      shiftSide: 0,
      shiftKind: 0
    };
    this.reset(0, 0, 0);
  }

  reset(x, z, heading = 0, launchSpeed = 15.2) {
    this.x = x;
    this.y = 0.48;
    this.z = z;
    // Vitesse de lancement paramétrable : à 15,2 m/s la yole démarrait déjà à
    // 55 km/h, donc il n'y avait aucune phase d'accélération à jouer.
    this.vx = Math.sin(heading) * launchSpeed;
    this.vy = 0;
    this.vz = Math.cos(heading) * launchSpeed;
    this.heading = heading;
    this.yawRate = 0;
    this.roll = 0;
    this.rollVel = 0;
    this.pitch = 0;
    this.pitchVel = 0;
    this.crewShift = 0;
    this.centerWaterHeight = 0;
    this.rhum = 0;
    this.crewTarget = 0;
    this.shiftTimer = 0;
    this.shiftDuration = 0;
    this.shiftElapsed = 0;
    this.shiftPrecision = 0;
    this.shiftKind = 0;
    this.shiftCatchTriggered = false;
    this.shiftLoadTargetAbs = 0;
    this.shiftOriginSign = 0;
    this.flow = 0.58;
    this.boost = 0;
    this.arcadeBoostForward = 0;
    this.arcadeBoostLateral = 0;
    this.lateralBoostDirection = 0;
    this.boostCooldown = 0;
    this.waterMassKg = 0;
    this.cohesion = 1;
    // Secondes pendant lesquelles la barre ne répond plus. Posé par le lambi
    // (voir `applyHit`), décrémenté dans le pas fixe. Déterministe.
    this.helmLoss = 0;
    this.activeCrew = CREW_COUNT;
    this.capsizeTimer = 0;
    this.eliminated = false;
    this.sink = 0;
    this.sailPower = 0.8;
    this.driveForce = 0;
    this.drive = 0;
    this.surf = 0;
    this.surfing = false;
    this.slip = 0;
    this.slipAngle = 0;
    this.grip = 1;
    this.counterSteer = 0;
    this.counterSettle = 0;
    this.counterSettleArmed = false;
    this.driftCommit = 0;
    this.driftRecovery = 0;
    this.turnLoad = 0;
    this.counterDash = 0;
    this.counterHeel = 0;
    this.dashRecoveryWindow = 0;
    this.dashRecoveryDirection = 0;
    this.lastWaterHeight = 0;
    this.hullStress = 0;
    this.waveLoad = 0;
    this.slam = 0;
    this.spray = 0;
    this.lastBowWaterHeight = 0;
    this.nearCapsize = 0;
    this.crewStumble = 0;
    this.events.mask = 0;
    this.events.slam = 0;
    this.events.spray = 0;
    this.events.shiftCrossing = 0;
    this.events.shiftCatch = 0;
    this.events.shiftSide = 0;
    this.events.shiftKind = 0;
    this.crewPositions.fill(0);
    this.crewTargets.fill(0);
    this.crewVelocities.fill(0);
    this.crewDelays.fill(0);
    this.crewStartDelays.fill(0);
    this.flooding.fill(0);
    this.lastImmersions.fill(0);
    this.structure.hull = 1;
    this.structure.mast = 1;
    this.structure.sail = 1;
    this.structure.bwa.fill(1);
    // Le gréement N'EST PAS remis a 1 ici : il est choisi avant la manche et
    // doit survivre au reset de manche. Il est pose par setRig(), et son defaut
    // est neutre.
    if (this.rigSail === undefined) { this.rigSail = 1; this.rigHeel = 1; this.rigFlow = 1; }
  }

  // Facteurs de gréement. Bornes dures : cette valeur vient d'un reglage
  // persiste, donc d'une source hors simulation.
  setRig(sail = 1, heel = 1, flow = 1) {
    this.rigSail = clamp(finite(sail, 1), 0.7, 1.3);
    this.rigHeel = clamp(finite(heel, 1), 0.7, 1.4);
    this.rigFlow = clamp(finite(flow, 1), 0.7, 1.35);
  }

  get speed() {
    return Math.hypot(this.vx, this.vz);
  }

  forward(out = { x: 0, z: 0 }) {
    out.x = Math.sin(this.heading);
    out.z = Math.cos(this.heading);
    return out;
  }

  /**
   * Borne la vitesse planaire après une impulsion appliquée hors fixedStep.
   * Turbo, dash et slingshot passent tous par ici : c'est ce qui rend le
   * plafond observable démontrable plutôt qu'accidentel.
   */
  clampImpulseSpeed() {
    const planar = Math.hypot(this.vx, this.vz);
    if (planar <= YOLE_HANDLING.impulseSpeedLimit) return planar;
    const scale = YOLE_HANDLING.impulseSpeedLimit / planar;
    this.vx *= scale;
    this.vz *= scale;
    return YOLE_HANDLING.impulseSpeedLimit;
  }

  triggerForwardBoost() {
    if (this.eliminated || this.boostCooldown > 0 || this.flow < 0.16) return false;
    const charge = clamp(this.flow, 0, 1);
    const forwardX = Math.sin(this.heading);
    const forwardZ = Math.cos(this.heading);
    // Le turbo transforme la jauge de Flow en une poussee qui dure. L'impulsion
    // initiale reste lisible, mais l'essentiel de son gain arrive pendant la
    // seconde suivante : ce n'est plus un dash lateral rejoue vers l'avant.
    const flowCost = 0.16 + charge * 0.18;
    const launchImpulse = 2.60 + charge * 1.05;
    this.flow = Math.max(0, this.flow - flowCost);
    this.vx += forwardX * launchImpulse;
    this.vz += forwardZ * launchImpulse;
    this.arcadeBoostForward = Math.max(this.arcadeBoostForward, 0.76 + charge * 0.34);
    this.boost = Math.max(this.boost, 0.20 + charge * 0.16);
    this.boostCooldown = YOLE_HANDLING.boostCooldown;

    // Coup de gîte à l'allumage. Le côté suit la gîte EN COURS quand il y en a
    // une — le turbo aggrave alors au lieu de se contenter d'ajouter — et le
    // couple est proportionnel à la charge : un turbo à pleine jauge secoue
    // plus qu'un turbo gratté à 0,16.
    const rollSign = Math.abs(this.roll) > 0.05 ? Math.sign(this.roll) : (this.slip > 0.02 ? Math.sign(this.slip) || 1 : 1);
    const compound = 1 + clamp(Math.abs(this.roll) / 0.7, 0, 1) * YOLE_HANDLING.boostRollCompound;
    const kick = (0.55 + charge * 0.45) * compound;
    this.rollVel += rollSign * YOLE_HANDLING.boostRollVelKick * kick;
    this.roll += rollSign * YOLE_HANDLING.boostRollKick * kick * 0.18;
    this.cohesion = clamp(this.cohesion - YOLE_HANDLING.boostCohesionCost * kick, 0.16, 1);
    this.clampImpulseSpeed();
    return true;
  }

  triggerLateralBoost(direction = 1) {
    if (this.eliminated || this.boostCooldown > 0 || this.flow < 0.22) return false;
    const side = Math.sign(direction || -this.roll || 1) || 1;
    const forwardX = Math.sin(this.heading);
    const forwardZ = Math.cos(this.heading);
    const rightX = Math.cos(this.heading);
    const rightZ = -Math.sin(this.heading);
    const lateralBefore = this.vx * rightX + this.vz * rightZ;
    // Un dash opposé à une dérive sert de coup de bwa correctif. Il conserve
    // l'impact latéral, mais rend un peu de Flow et calme le lacet au lieu de
    // simplement retourner la glissade.
    const counterDash = clamp((-side * lateralBefore) / 8, 0, 1);
    // Le dash est un coup de bwa bref et transversal. Sa petite composante
    // avant evite l'impression de freinage, sans lui donner la portee du turbo.
    this.flow = clamp(this.flow - (0.20 + clamp(this.flow, 0, 1) * 0.08) + counterDash * 0.07, 0, 1);
    this.vx += rightX * side * YOLE_HANDLING.dashImpulse + forwardX * YOLE_HANDLING.dashForwardBleed;
    this.vz += rightZ * side * YOLE_HANDLING.dashImpulse + forwardZ * YOLE_HANDLING.dashForwardBleed;
    this.rollVel -= side * YOLE_HANDLING.dashSelfRoll;
    this.yawRate *= 1 - counterDash * 0.44;
    this.arcadeBoostLateral = 0.72;
    this.lateralBoostDirection = side;
    this.counterDash = counterDash;
    this.dashRecoveryWindow = YOLE_HANDLING.dashRecoveryWindow;
    this.dashRecoveryDirection = side;
    this.boostCooldown = YOLE_HANDLING.lateralBoostCooldown;
    this.clampImpulseSpeed();
    return true;
  }

  triggerSlingshot(directionX, directionZ, strength = 1) {
    if (this.eliminated) return false;
    const amount = 4.0 + clamp(strength, 0, 1.5) * 4.8;
    this.vx += directionX * amount;
    this.vz += directionZ * amount;
    this.flow = clamp(this.flow + 0.12 + strength * 0.05, 0, 1);
    this.arcadeBoostForward = Math.max(this.arcadeBoostForward, 0.48 + strength * 0.18);
    this.boost = Math.max(this.boost, 0.88 + strength * 0.25);
    this.clampImpulseSpeed();
    return true;
  }

  // Durée en secondes. Fonction pure : aucun tirage.
  drinkRhum(seconds = 5) {
    if (this.eliminated) return false;
    this.rhum = Math.max(this.rhum, seconds);
    this.flow = clamp(this.flow + 0.35, 0, 1);
    return true;
  }

  /**
   * Ce que RENDRAIT une contre-gîte déclenchée maintenant, sans la déclencher.
   *
   * Fonction pure : elle ne lit que l'état courant et n'écrit rien, donc elle ne
   * peut pas toucher au checksum. Elle existe pour que le HUD puisse ENSEIGNER
   * la fenêtre de timing — jusqu'ici, la contre-gîte était un jeu d'adresse dont
   * la règle n'était écrite nulle part à l'écran, et le joueur payait −0,05 de
   * Flow sans jamais savoir pourquoi.
   *
   * `state` : "critical" (la vraie contre-gîte), "recovery" (rattrapage de
   * dérive après un dash), "idle" (appuyer coûterait du Flow pour rien).
   */
  shiftQuality(out = {}) {
    const absoluteRoll = Math.abs(this.roll);
    const critical = absoluteRoll > 0.34;
    const dashRecovery = !critical
      && this.dashRecoveryWindow > 0
      && this.slip >= YOLE_HANDLING.dashRecoverySlip;
    const rollSign = this.roll === 0 ? 1 : Math.sign(this.roll);
    const heelTiming = clamp(1 - Math.abs(absoluteRoll - 0.64) / 0.36, 0, 1);
    const outwardRoll = clamp((rollSign * this.rollVel) / 0.65, 0, 1);
    out.state = critical ? "critical" : (dashRecovery ? "recovery" : "idle");
    out.precision = critical
      ? clamp(heelTiming * 0.82 + outwardRoll * 0.18, 0, 1)
      : (dashRecovery ? clamp((this.slip - YOLE_HANDLING.dashRecoverySlip) / 0.38, 0, 1) : 0);
    // Distance à la fenêtre, en rad et signée : négatif = pas encore assez
    // gîté, positif = déjà au-delà du meilleur moment.
    out.rollOffset = absoluteRoll - 0.64;
    out.roll = absoluteRoll;
    out.falling = rollSign * this.rollVel > 0;
    return out;
  }

  triggerShift() {
    if (this.eliminated) return { critical: false, precision: 0 };
    const absoluteRoll = Math.abs(this.roll);
    const dashRecovery = absoluteRoll <= 0.34
      && this.dashRecoveryWindow > 0
      && this.slip >= YOLE_HANDLING.dashRecoverySlip;
    const rollSign = this.roll === 0
      ? (dashRecovery ? -this.dashRecoveryDirection : 1)
      : Math.sign(this.roll);
    const critical = absoluteRoll > 0.34;
    // Fenetre de timing physique : le meilleur moment est une gite franche
    // autour de 0,64 rad, avec un bonus si la yole est encore en train de
    // tomber. Trop tot ou au bord du chavirage donne une correction moins nette.
    const heelTiming = clamp(1 - Math.abs(absoluteRoll - 0.64) / 0.36, 0, 1);
    const outwardRoll = clamp((rollSign * this.rollVel) / 0.65, 0, 1);
    const recoveryPrecision = dashRecovery
      ? clamp((this.slip - YOLE_HANDLING.dashRecoverySlip) / 0.38, 0, 1)
      : 0;
    const precision = critical
      ? clamp(heelTiming * 0.82 + outwardRoll * 0.18, 0, 1)
      : recoveryPrecision;
    const target = -rollSign * clamp(0.52 + absoluteRoll * 0.34 + precision * 0.08, 0.52, 0.94);
    this.crewTarget = target;
    this.shiftOriginSign = rollSign;
    this.shiftTimer = 0.84 + precision * 0.18;
    this.shiftDuration = this.shiftTimer;
    this.shiftElapsed = 0;
    this.shiftPrecision = precision;
    this.shiftKind = critical ? 2 : (dashRecovery ? 3 : 1);
    this.shiftCatchTriggered = false;
    this.shiftLoadTargetAbs = Math.abs(target);

    for (let i = 0; i < CREW_COUNT; i++) {
      const active = i < this.activeCrew;
      this.crewTargets[i] = active ? target * (0.90 + (i % 3) * 0.045) : 0;
      // Vague avant -> arrière. Le dernier dresseur garde son appui plus
      // longtemps ; un bon timing resserre la bordée sans l'uniformiser.
      const delay = CREW_SHIFT_DELAYS[i] * (1 - precision * 0.30);
      this.crewStartDelays[i] = active ? delay : 0;
      this.crewDelays[i] = active ? delay : 0;
    }

    if (critical) {
      // La recompense est du Flow et de la cohesion, pas une acceleration
      // cachee. L'equipage coupe l'elan de gite puis son deplacement fournit le
      // contre-couple continu dans updateCrew()/fixedStep().
      this.flow = clamp(this.flow + 0.12 + precision * 0.26 + this.slip * 0.055, 0, 1);
      this.cohesion = clamp(this.cohesion + 0.035 + precision * 0.055, 0.16, 1);
      const outwardVelocity = Math.max(0, rollSign * this.rollVel);
      // Réponse immédiate pour que la commande ne paraisse jamais molle, mais
      // le gros du redressement vient ensuite du déplacement des hommes. Le
      // précédent 38–66 % arrêtait la chute avant que les corps aient chargé
      // les bwa : techniquement efficace, visuellement magique.
      this.rollVel -= rollSign * (
        outwardVelocity * (0.27 + precision * 0.12)
        + 0.022
        + precision * 0.044
      );
      this.yawRate *= 1 - precision * (0.12 + this.counterSteer * 0.18);
      this.counterHeel = precision;
    } else if (dashRecovery) {
      // Contre-gîte juste après un dash : on coupe la glisse, pas la vitesse
      // avant. C'est une récupération technique courte, distincte du Shift
      // parfait en forte gîte et sans aucun boost caché.
      const rightX = Math.cos(this.heading);
      const rightZ = -Math.sin(this.heading);
      const lateralVelocity = this.vx * rightX + this.vz * rightZ;
      const lateralCut = YOLE_HANDLING.dashRecoveryLateralCut + precision * 0.08;
      this.vx -= rightX * lateralVelocity * lateralCut;
      this.vz -= rightZ * lateralVelocity * lateralCut;
      this.yawRate *= 1 - YOLE_HANDLING.dashRecoveryYawCut - precision * 0.08;
      this.rollVel *= 1 - YOLE_HANDLING.dashRecoveryRollCut;
      this.flow = clamp(this.flow + 0.06 + precision * 0.06, 0, 1);
      this.counterHeel = 0.46 + precision * 0.34;
      this.dashRecoveryWindow = 0;
    } else {
      this.flow = Math.max(0, this.flow - 0.05);
    }
    return { critical, precision, recovery: dashRecovery };
  }

  addWater(kg, localX = 0, localZ = 0) {
    let longitudinal = 1;
    if (localZ < -1.5) longitudinal = 0;
    else if (localZ > 1.5) longitudinal = 2;
    const side = localX > 0 ? 3 : 0;
    const index = side + longitudinal;
    this.flooding[index] = clamp(this.flooding[index] + Math.max(0, kg), 0, 95);
    this.updateWaterMass();
  }

  updateWaterMass() {
    let total = 0;
    for (let i = 0; i < this.flooding.length; i++) total += this.flooding[i];
    this.waterMassKg = clamp(total, 0, 360);
    return this.waterMassKg;
  }

  applyHit(data = {}) {
    if (this.eliminated) return;
    // RHUM : l'équipage a bu, plus rien ne l'atteint. Seule la casse volontaire
    // est ignorée — la flottaison, l'eau déjà embarquée et le Grain continuent
    // de s'appliquer, sinon le sort deviendrait une immunité totale.
    if (this.rhum > 0) return;
    this.rollVel += data.rollImpulse ?? 0;
    this.pitchVel += data.pitchImpulse ?? 0;
    this.yawRate += data.yawImpulse ?? 0;
    if (Number.isFinite(data.impulseX)) this.vx += data.impulseX;
    if (Number.isFinite(data.impulseZ)) this.vz += data.impulseZ;
    const slow = clamp(data.slow ?? 0, 0, 0.85);
    this.vx *= 1 - slow;
    this.vz *= 1 - slow;
    if (data.waterKg) this.addWater(data.waterKg, data.hitLocalX ?? Math.sign(data.rollImpulse || 1) * 0.7, data.hitLocalZ ?? 0);
    this.cohesion = clamp(this.cohesion - (data.cohesionDamage ?? 0), 0.16, 1);
    // On PROLONGE au lieu d'additionner : deux conques coup sur coup ne doivent
    // pas cumuler jusqu'à cinq secondes sans barre, ce qui serait injouable.
    if (data.helmLoss) this.helmLoss = Math.max(this.helmLoss, data.helmLoss);
    this.crewStumble = Math.max(this.crewStumble, clamp(Math.abs(data.rollImpulse ?? 0) * 0.55 + (data.crewImpulse ?? 0) * 0.6, 0, 1));
    // Une arme peut désormais vider réellement les six postes de rappel. Le
    // plancher à deux conservait des silhouettes à bord après leur éjection et
    // rendait impossible la règle « un impact direct = un yoleur à l'eau ».
    if (data.crewLoss) this.activeCrew = Math.max(0, this.activeCrew - data.crewLoss);
    if (data.structure) {
      this.structure.hull = clamp(this.structure.hull - (data.structure.hull ?? 0), 0, 1);
      this.structure.mast = clamp(this.structure.mast - (data.structure.mast ?? 0), 0, 1);
      this.structure.sail = clamp(this.structure.sail - (data.structure.sail ?? 0), 0, 1);
      if (data.structure.bwaIndex !== undefined) {
        const index = clamp(data.structure.bwaIndex | 0, 0, this.structure.bwa.length - 1);
        this.structure.bwa[index] = clamp(this.structure.bwa[index] - (data.structure.bwa ?? 0), 0, 1);
      }
    }
  }

  drainFlooding(dt) {
    // Bilan d'eau. Avant : 1,77 kg/s de pompe contre 8,50 kg/s sous le Grain —
    // soit 4,8x en défaveur du joueur, qui ne pouvait donc JAMAIS écoper. La
    // yole se remplissait sans recours et l'eau embarquée n'était plus une
    // mécanique mais une sentence.
    //
    // Cible : à équipage complet et cohésion intacte on TIENT sous le Grain
    // (5,5 contre 5,4) et on récupère vite hors danger ; dès qu'un équipier
    // tombe ou que la cohésion s'effondre, on coule. La tension revient au bon
    // endroit — l'état de l'équipage, pas une fatalité.
    const pumpRate = (2.2 + this.activeCrew * 0.55) * this.cohesion;
    let remainingDrain = pumpRate * dt;
    while (remainingDrain > 1e-5) {
      let fullest = -1;
      for (let i = 0; i < this.flooding.length; i++) if (fullest < 0 || this.flooding[i] > this.flooding[fullest]) fullest = i;
      if (fullest < 0 || this.flooding[fullest] <= 0) break;
      const amount = Math.min(this.flooding[fullest], remainingDrain);
      this.flooding[fullest] -= amount;
      remainingDrain -= amount;
    }
    this.updateWaterMass();
  }

  updateCrew(dt) {
    if (this.shiftDuration > 0 && this.shiftElapsed < this.shiftDuration + 0.46) {
      this.shiftElapsed += dt;
    }
    this.shiftTimer = Math.max(0, this.shiftTimer - dt);
    const crossedUpright = this.shiftOriginSign !== 0 && Math.sign(this.roll || this.shiftOriginSign) !== this.shiftOriginSign;
    if (crossedUpright) {
      this.events.mask |= EVENT_CREW_CROSSED;
      this.events.shiftCrossing = Math.abs(this.rollVel);
    }
    if (this.shiftTimer <= 0 || Math.abs(this.roll) < 0.12 || crossedUpright) {
      this.crewTarget = 0;
      this.shiftOriginSign = 0;
      this.crewTargets.fill(0);
    }

    let weightedPosition = 0;
    let totalMass = 0;
    for (let i = 0; i < CREW_COUNT; i++) {
      if (i >= this.activeCrew) {
        this.crewTargets[i] = 0;
        const previous = this.crewPositions[i];
        this.crewPositions[i] = damp(previous, 0, 2.2, dt);
        this.crewVelocities[i] = (this.crewPositions[i] - previous) / Math.max(1e-5, dt);
        continue;
      }
      this.crewDelays[i] = Math.max(0, this.crewDelays[i] - dt);
      const target = this.crewDelays[i] > 0 ? this.crewPositions[i] : this.crewTargets[i];
      const individualSpeed = (3.7 + i * 0.08) * this.cohesion * (0.72 + this.activeCrew / 12);
      const previous = this.crewPositions[i];
      this.crewPositions[i] = damp(previous, target, individualSpeed, dt);
      this.crewVelocities[i] = (this.crewPositions[i] - previous) / Math.max(1e-5, dt);
      weightedPosition += this.crewPositions[i] * CREW_MASSES[i];
      totalMass += CREW_MASSES[i];
    }
    this.crewShift = totalMass > 0 ? weightedPosition / totalMass : 0;
    if (
      this.shiftKind >= 2
      && !this.shiftCatchTriggered
      && this.shiftElapsed >= 0.16
      && Math.abs(this.crewShift) >= this.shiftLoadTargetAbs * 0.56
    ) {
      this.shiftCatchTriggered = true;
      // La contre-gîte doit rester lourde : l'impulsion initiale met les corps
      // en mouvement, puis cette reprise d'appui n'agit qu'une fois leur masse
      // réellement chargée sur les bwa. On obtient un rattrapage décisif sans
      // annuler la chute avant que l'animation ait traversé la coque.
      const loadSide = Math.sign(this.crewTarget || -this.shiftOriginSign || 1);
      this.rollVel += loadSide * (0.045 + this.shiftPrecision * 0.045);
      this.events.mask |= EVENT_CREW_LOADED;
      this.events.shiftCatch = this.shiftPrecision;
      this.events.shiftSide = Math.sign(this.crewTarget || -this.shiftOriginSign || 1);
      this.events.shiftKind = this.shiftKind;
    }
    return weightedPosition;
  }

  consumeEvents(out = {}) {
    out.mask = this.events.mask;
    out.slam = this.events.slam;
    out.spray = this.events.spray;
    out.shiftCrossing = this.events.shiftCrossing;
    out.shiftCatch = this.events.shiftCatch;
    out.shiftSide = this.events.shiftSide;
    out.shiftKind = this.events.shiftKind;
    this.events.mask = 0;
    this.events.slam = 0;
    this.events.spray = 0;
    this.events.shiftCrossing = 0;
    this.events.shiftCatch = 0;
    this.events.shiftSide = 0;
    this.events.shiftKind = 0;
    return out;
  }

  fixedStep(dt, input, environment) {
    this.events.mask = 0;
    this.events.slam = 0;
    this.events.spray = 0;
    this.events.shiftCrossing = 0;
    this.events.shiftCatch = 0;
    this.events.shiftSide = 0;
    this.events.shiftKind = 0;
    this.slam = Math.max(0, this.slam - dt * 3.5);
    this.spray = Math.max(0, this.spray - dt * 4.0);
    this.crewStumble = Math.max(0, this.crewStumble - dt * 2.6);

    if (this.eliminated) {
      this.sink += dt;
      this.roll = damp(this.roll, Math.sign(this.roll || 1) * 1.57, 2.1, dt);
      this.y -= dt * Math.min(0.68, this.sink * 0.16);
      return;
    }

    const baseMass = 800;
    const mass = baseMass + this.waterMassKg;
    const g = 9.81;
    const speed = this.speed;
    const forwardX = Math.sin(this.heading);
    const forwardZ = Math.cos(this.heading);
    const rightX = Math.cos(this.heading);
    const rightZ = -Math.sin(this.heading);
    // ⚠️ SIGNE NÉGATIF — même cause racine que la visée inversée.
    //
    // Le vecteur « droite » du bateau est écrit (cos θ, −sin θ) dans tout le
    // moteur. Or pour un avant (sin θ, cos θ) en repère main droite Y en haut,
    // la vraie droite est forward × up = (−cos θ, 0, sin θ). Le signe est donc
    // inversé, et il l'est partout : barre, dash, visée.
    //
    // Mesuré : barre à droite pendant 1,5 s, la proue finit à −0,66 en NDC,
    // c'est-à-dire à GAUCHE de l'écran. Corriger ICI retourne d'un coup le
    // lacet, le couple de gîte et la lecture de dérive, qui dérivent tous de
    // `steerInput`. L'IA compense de son côté (voir Boat.updateAI) pour que
    // `steer` veuille désormais dire « vers la droite de l'écran » partout.
    // ── BARRE COUPÉE ────────────────────────────────────────────────────
    // Le lambi est une conque : un SON. Son verbe n'est pas de gratter de la
    // coque, c'est de désorienter. Tant que le compteur tourne, la barre ne
    // répond plus — le bateau continue sur son erre et sur le lacet qu'il a
    // encaissé, donc il part visiblement en dérive.
    //
    // ⚠️ On annule l'ENTRÉE, pas la physique. Le gouvernail reste soumis à la
    // houle, au vent et à sa propre dérive : c'est ce qui rend la perte de
    // contrôle lisible plutôt que raide.
    this.helmLoss = Math.max(0, this.helmLoss - dt);
    const barreCoupee = this.helmLoss > 0;
    const steerInput = barreCoupee ? 0 : -clamp(finite(input.steer), -1, 1);
    const forwardVelocityBefore = this.vx * forwardX + this.vz * forwardZ;
    const lateralVelocityBefore = this.vx * rightX + this.vz * rightZ;
    const slipAngleTarget = Math.atan2(lateralVelocityBefore, Math.max(2, Math.abs(forwardVelocityBefore)));
    const slipTarget = clamp(Math.abs(lateralVelocityBefore) / Math.max(4, speed), 0, 1);
    const slipScale = Math.max(1.5, speed * 0.32);
    const counterTarget = clamp((steerInput * lateralVelocityBefore) / slipScale, 0, 1);
    if (counterTarget > 0.20 && Math.abs(slipAngleTarget) > 0.18) this.counterSettleArmed = true;
    if (this.counterSettleArmed && Math.abs(slipAngleTarget) < 0.12) {
      this.counterSettle = YOLE_HANDLING.counterSettleTime;
      this.counterSettleArmed = false;
    } else {
      this.counterSettle = Math.max(0, this.counterSettle - dt);
    }
    const steeringCommand = steerInput * (this.counterSettle > 0 ? YOLE_HANDLING.counterSettleSteering : 1);
    const driftTarget = this.counterSettle > 0
      ? 0
      : clamp((-steeringCommand * lateralVelocityBefore) / slipScale, 0, 1);
    this.slipAngle = damp(this.slipAngle, slipAngleTarget, 7.5, dt);
    this.slip = damp(this.slip, slipTarget, slipTarget > this.slip ? 8.5 : 5.2, dt);
    this.counterSteer = damp(this.counterSteer, counterTarget, 9.0, dt);
    this.driftCommit = damp(this.driftCommit, driftTarget, 7.2, dt);
    const deepSlipTarget = clamp(
      (Math.abs(this.slipAngle) - YOLE_HANDLING.deepSlipStart)
        / (YOLE_HANDLING.deepSlipFull - YOLE_HANDLING.deepSlipStart),
      0,
      1
    );
    this.driftRecovery = damp(this.driftRecovery, deepSlipTarget, deepSlipTarget > this.driftRecovery ? 8.2 : 5.6, dt);
    const neutralRecovery = (1 - Math.abs(steerInput)) * this.slip * YOLE_HANDLING.neutralGripGain;
    const gripTarget = clamp(
      1
        - this.driftCommit * YOLE_HANDLING.driftGripReduction
        + this.counterSteer * YOLE_HANDLING.counterGripGain
        + neutralRecovery
        + this.driftRecovery * YOLE_HANDLING.deepSlipGripGain,
      0.66,
      1.68
    );
    this.grip = damp(this.grip, gripTarget, gripTarget > this.grip ? 8.8 : 6.0, dt);
    const turnLoadTarget = Math.abs(steeringCommand) * clamp(speed / 18, 0, 1) * (0.42 + this.slip * 0.58);
    this.turnLoad = damp(this.turnLoad, turnLoadTarget, turnLoadTarget > this.turnLoad ? 5.4 : 7.8, dt);

    this.boostCooldown = Math.max(0, this.boostCooldown - dt);
    this.rhum = Math.max(0, this.rhum - dt);
    this.arcadeBoostForward = Math.max(0, this.arcadeBoostForward - dt * 0.72);
    this.arcadeBoostLateral = Math.max(0, this.arcadeBoostLateral - dt * 2.40);
    this.counterDash = Math.max(0, this.counterDash - dt * 2.8);
    this.counterHeel = Math.max(0, this.counterHeel - dt * 1.6);
    this.dashRecoveryWindow = Math.max(0, this.dashRecoveryWindow - dt);
    if (this.dashRecoveryWindow <= 0) this.dashRecoveryDirection = 0;
    if (this.arcadeBoostLateral <= 0) this.lateralBoostDirection = 0;
    const passiveFlow = 0.010
      + this.surf * 0.042
      + clamp((speed - 12) / 14, 0, 1) * 0.020
      + this.counterSteer * this.slip * YOLE_HANDLING.counterFlowGain;
    this.flow = clamp(this.flow + dt * passiveFlow * this.rigFlow, 0, 1);
    this.boost = Math.max(0, this.boost - dt * 0.62);
    this.drainFlooding(dt);
    this.cohesion = Math.min(1, this.cohesion + dt * 0.022);
    const weightedCrewPosition = this.updateCrew(dt);

    const apparentWindX = environment.windX - this.vx;
    const apparentWindZ = environment.windZ - this.vz;
    const apparentSpeed = Math.hypot(apparentWindX, apparentWindZ);
    const apparentAngle = angleDelta(this.heading, Math.atan2(apparentWindX, apparentWindZ));
    const broadReach = 0.42 + 0.58 * Math.abs(Math.sin(apparentAngle * 0.82));
    const trim = input.trim ?? 0.82;
    const idealTrim = clamp(0.56 + broadReach * 0.34, 0.44, 0.96);
    const trimEfficiency = 1 - Math.abs(trim - idealTrim) * 1.55;
    const sailIntegrity = this.structure.sail * this.structure.mast;
    // GRÉEMENT : deux facteurs, neutres a 1. Ils vivent sur l'instance et sont
    // remis a leur valeur par reset(), sinon ils traverseraient les manches.
    const rawSailForce = clamp(apparentSpeed * apparentSpeed * 18.2 * broadReach * clamp(trimEfficiency, 0.08, 1), 0, 6500) * sailIntegrity * this.rigSail;
    const feather = clamp(
      (trim - YOLE_HANDLING.trimFeathered) / (YOLE_HANDLING.trimPowered - YOLE_HANDLING.trimFeathered),
      0,
      1
    );
    const trimDrive = YOLE_HANDLING.trimMinimumDrive + (1 - YOLE_HANDLING.trimMinimumDrive) * feather;
    const sailForceTarget = rawSailForce * trimDrive;
    const driveResponse = sailForceTarget > this.driveForce ? YOLE_HANDLING.driveRise : YOLE_HANDLING.driveFall;
    this.driveForce = damp(this.driveForce, sailForceTarget, driveResponse, dt);
    const sailForce = this.driveForce;
    this.drive = clamp(sailForce / 6500, 0, 1);
    this.sailPower = clamp(sailForce / 3600, 0, 1.6);

    const forwardVelocity = forwardVelocityBefore;
    const lateralVelocity = lateralVelocityBefore;
    const sailAcceleration = sailForce / mass;
    const surfWave = this.waveField.sample(this.x + forwardX * 2.8, this.z + forwardZ * 2.8, environment.time, environment.waveScratch);
    const downhill = clamp(-(surfWave.slopeX * forwardX + surfWave.slopeZ * forwardZ), 0, 0.48);
    this.surf = damp(this.surf, downhill > 0.075 && forwardVelocity > 7.5 ? downhill * 2.9 : 0, 2.8, dt);
    this.surfing = this.surfing ? this.surf > 0.12 : this.surf >= 0.20;
    const boostAcceleration = this.flow * 1.55 + this.boost * 3.4 + this.surf * 2.65 + this.arcadeBoostForward * 9.6 + (this.rhum > 0 ? 6.4 : 0);
    const lateralBoostAcceleration = this.arcadeBoostLateral * this.lateralBoostDirection * 11.5;
    const hullDamageDrag = (1 - this.structure.hull) * (0.9 + speed * 0.11);
    const featherBrake = (1 - trimDrive)
      * (YOLE_HANDLING.featherBrakeBase + Math.max(0, forwardVelocity) * YOLE_HANDLING.featherBrakeSpeed);
    const turnDrag = this.turnLoad * (YOLE_HANDLING.turnDragBase + speed * YOLE_HANDLING.turnDragSpeed);
    const forwardDrag = 0.0096 * forwardVelocity * Math.abs(forwardVelocity)
      + this.waterMassKg * 0.0017
      + hullDamageDrag
      + featherBrake
      + turnDrag;
    const lateralDrag = lateralVelocity
      * (YOLE_HANDLING.lateralGripBase + speed * YOLE_HANDLING.lateralGripSpeed)
      * this.grip;
    const coastDrag = environment.coastPenalty * (3.5 + speed * 0.18);

    const accelerationForward = sailAcceleration + boostAcceleration - forwardDrag - coastDrag;
    const accelerationLateral = -lateralDrag + lateralBoostAcceleration;
    this.vx += (forwardX * accelerationForward + rightX * accelerationLateral) * dt;
    this.vz += (forwardZ * accelerationForward + rightZ * accelerationLateral) * dt;

    const postForceSpeed = Math.hypot(this.vx, this.vz);
    if (postForceSpeed > 0.001) {
      const softLimit = 23.6 + this.flow * 2.4 + this.boost * 3.6 + this.surf * 2.2 + this.arcadeBoostForward * 3.0;
      const overspeed = Math.max(0, postForceSpeed - softLimit);
      const hullDrag = postForceSpeed * postForceSpeed * 0.00165 + overspeed * 0.78;
      this.vx -= (this.vx / postForceSpeed) * hullDrag * dt;
      this.vz -= (this.vz / postForceSpeed) * hullDrag * dt;
    }

    const stationaryAuthority = YOLE_HANDLING.stationarySteeringFloor
      + (1 - YOLE_HANDLING.stationarySteeringFloor)
        * clamp(speed / YOLE_HANDLING.stationarySteeringSpeed, 0, 1);
    const steeringAuthority = (
      YOLE_HANDLING.steeringLowSpeed
      + Math.min(1.0, speed / YOLE_HANDLING.steeringFullSpeed) * YOLE_HANDLING.steeringHighSpeedGain
    ) * (0.78 + this.cohesion * 0.22)
      * (0.86 + this.structure.hull * 0.14)
      * (1 - this.driftRecovery * YOLE_HANDLING.deepSlipSteerCut)
      * stationaryAuthority;
    const desiredYawRate = steeringCommand * steeringAuthority;
    const yawResponse = YOLE_HANDLING.yawEngage
      + this.counterSteer * YOLE_HANDLING.yawCounterGain
      + (Math.abs(steeringCommand) < 0.08 ? YOLE_HANDLING.yawRelease - YOLE_HANDLING.yawEngage : 0);
    this.yawRate = damp(this.yawRate, desiredYawRate, yawResponse, dt);
    this.heading += this.yawRate * dt;

    this.x += this.vx * dt;
    this.z += this.vz * dt;

    let verticalForce = -mass * g;
    let rollTorque = 0;
    let pitchTorque = 0;
    let immersedPoints = 0;
    let maxSlam = 0;
    let spray = 0;
    const cosHeading = Math.cos(this.heading);
    const sinHeading = Math.sin(this.heading);
    const sinRoll = Math.sin(this.roll);
    const sinPitch = Math.sin(this.pitch);
    const centerScratch = environment.centerScratch || (environment.centerScratch = {});

    for (let pointIndex = 0; pointIndex < BUOYANCY_POINTS.length; pointIndex++) {
      const point = BUOYANCY_POINTS[pointIndex];
      const localX = point.x;
      const localZ = point.z;
      const worldX = this.x + localX * cosHeading + localZ * sinHeading;
      const worldZ = this.z - localX * sinHeading + localZ * cosHeading;
      const pointY = this.y + point.keel - localX * sinRoll + localZ * sinPitch;
      const pointVerticalVelocity = this.vy - localX * this.rollVel + localZ * this.pitchVel;
      const water = this.waveField.sample(worldX, worldZ, environment.time, environment.pointScratch);
      const disturbance = environment.sampleDisturbance(worldX, worldZ);
      const waterHeight = water.height + disturbance * 0.34;
      if (pointIndex <= 1) this.lastBowWaterHeight = waterHeight;
      const immersion = waterHeight - pointY;
      const previousImmersion = this.lastImmersions[pointIndex];
      this.lastImmersions[pointIndex] = immersion;
      if (immersion <= 0) continue;
      immersedPoints++;
      const spring = immersion * 1460 * point.volume * (0.72 + this.structure.hull * 0.28);
      const relativeVertical = water.velocityY - pointVerticalVelocity;
      const dampingForce = relativeVertical * 1150 * point.volume;
      const force = clamp(spring + dampingForce, 0, 2900);
      verticalForce += force;
      rollTorque += localX * force * 0.35;
      pitchTorque += -localZ * force * 0.19;

      const entrySpeed = previousImmersion <= 0.02 ? Math.max(0, relativeVertical) : 0;
      if (entrySpeed > 2.2) {
        const slam = clamp((entrySpeed - 2.2) * point.volume * (0.6 + speed * 0.025), 0, 4.5);
        maxSlam = Math.max(maxSlam, slam);
        spray += slam * 0.22;
        this.hullStress += slam * dt * 0.012;
      }
    }

    const centerWater = this.waveField.sample(this.x, this.z, environment.time, centerScratch);
    // Lu par le rendu pour la ligne de flottaison. Mémorisation seule : aucune
    // force, aucun tirage aléatoire, donc checksum inchangé.
    this.centerWaterHeight = centerWater.height;
    verticalForce += (centerWater.height + 0.48 - this.y) * mass * 10.4 - this.vy * mass * 5.25;
    this.vy += (verticalForce / mass) * dt;
    this.vy *= Math.exp(-0.40 * dt);
    this.y += this.vy * dt;

    let floodRollTorque = 0;
    let floodPitchTorque = 0;
    for (let i = 0; i < this.flooding.length; i++) {
      floodRollTorque += COMPARTMENT_X[i] * this.flooding[i] * g * 1.9;
      floodPitchTorque += -COMPARTMENT_Z[i] * this.flooding[i] * g * 0.28;
    }

    const crewTorque = weightedCrewPosition * g * 1.45 * (0.62 + this.cohesion * 0.38);
    // Le couple de gite de la voile etait trop faible pour que la yole penche
    // vraiment : mesuree, la gite de navigation tenait a 5,8 deg medians quand
    // les photos de course en montrent 20 a 30 en permanence. C'est la silhouette
    // penchee, equipage sorti a contre, qui fait lire une yole ronde.
    // Demandé au playtest : plus de gîte. 1,85 -> 2,55 sur le couple de voile,
    // rappel passif 18,8 -> 15,4. La yole penche plus, et elle se relève moins
    // toute seule — c'est ce qui rend la contre-gîte permanente au lieu
    // d'optionnelle. Mesuré en jeu : temps passé hors contrôle 16,2 % -> 22,1 %,
    // zéro chavirage et zéro élimination sur trois graines.
    //
    // ⚠️ Cette valeur a d'abord été REJETÉE À TORT. Une première mesure la
    // donnait catastrophique — 1,096 rad de gîte moyenne, 14,5 km/h, trois
    // éliminations — mais l'autopilote du harnais n'avait pas suivi l'inversion
    // de barre et braquait à l'opposé du couloir. Le harnais mesurait sa propre
    // erreur. Corrigé, il rend 0,22 rad et une course normale.
    const sailRollTorque = Math.sin(apparentAngle) * sailForce * 2.55 * this.rigHeel;
    const steerRollTorque = -steeringCommand * speed * speed * 7.1;
    const impactRecovery = -this.roll * mass * 15.4;
    const rollDamping = -this.rollVel * mass * 6.35;
    const rollInertia = mass * 10.7;
    const brokenBwaPenalty = this.structure.bwa.reduce((sum, integrity) => sum + (1 - integrity), 0) * Math.sign(this.roll || 1) * 920;
    this.rollVel += ((rollTorque + crewTorque + sailRollTorque + steerRollTorque + impactRecovery + rollDamping + brokenBwaPenalty + floodRollTorque) / rollInertia) * dt;
    this.roll += this.rollVel * dt;

    const pitchRecovery = -this.pitch * mass * 29.5;
    const pitchDamping = -this.pitchVel * mass * 10.2;
    const pitchInertia = mass * 14.2;
    this.pitchVel += ((pitchTorque + pitchRecovery + pitchDamping + floodPitchTorque) / pitchInertia) * dt;
    this.pitch += this.pitchVel * dt;

    this.waveLoad = damp(this.waveLoad, maxSlam, 4.8, dt);
    this.slam = Math.max(this.slam, maxSlam);
    this.spray = Math.max(this.spray, spray);
    this.nearCapsize = clamp((Math.abs(this.roll) - 0.62) / 0.55, 0, 1);
    if (maxSlam > 0.25) {
      this.events.mask |= EVENT_SLAM;
      this.events.slam = maxSlam;
      this.events.spray = spray;
    }
    if (this.waterMassKg > 215) this.events.mask |= EVENT_CRITICAL_FLOOD;

    // Damaged hull leaks when immersed; the leak side follows the current heel.
    const leakRate = (1 - this.structure.hull) * (0.55 + immersedPoints / BUOYANCY_POINTS.length) * 2.4;
    if (leakRate > 0.02) this.addWater(leakRate * dt, Math.sign(this.roll || 1) * 0.75, this.pitch * 7);

    if (this.hullStress > 1) {
      const damage = Math.min(0.012, (this.hullStress - 1) * 0.0015);
      this.structure.hull = Math.max(0, this.structure.hull - damage);
      this.hullStress *= 0.72;
    } else {
      this.hullStress = Math.max(0, this.hullStress - dt * 0.08);
    }

    if (environment.coastPenalty > 0.45) {
      this.structure.hull = Math.max(0, this.structure.hull - dt * environment.coastPenalty * 0.06);
      this.addWater(dt * environment.coastPenalty * 5, Math.sign(this.roll || 1) * 0.8, this.pitch * 4);
    }

    if (Math.abs(this.roll) > 1.16 || this.structure.hull <= 0 || this.structure.mast <= 0.01 || this.waterMassKg > 330) this.capsizeTimer += dt;
    else this.capsizeTimer = Math.max(0, this.capsizeTimer - dt * 1.8);

    this.roll = clamp(finite(this.roll), -1.7, 1.7);
    this.pitch = clamp(finite(this.pitch), -0.56, 0.56);
    this.rollVel = clamp(finite(this.rollVel), -3.8, 3.8);
    this.pitchVel = clamp(finite(this.pitchVel), -3.0, 3.0);
    this.vx = clamp(finite(this.vx), -28, 28);
    this.vy = clamp(finite(this.vy), -16, 16);
    this.vz = clamp(finite(this.vz), -28, 28);
    const planarSpeed = Math.hypot(this.vx, this.vz);
    if (planarSpeed > YOLE_HANDLING.planarSpeedLimit) {
      const scale = YOLE_HANDLING.planarSpeedLimit / planarSpeed;
      this.vx *= scale;
      this.vz *= scale;
    }
    this.y = finite(this.y, 0.35);
  }
}

export const YoleEventMask = Object.freeze({
  SLAM: EVENT_SLAM,
  CREW_CROSSED: EVENT_CREW_CROSSED,
  CRITICAL_FLOOD: EVENT_CRITICAL_FLOOD,
  CREW_LOADED: EVENT_CREW_LOADED
});
