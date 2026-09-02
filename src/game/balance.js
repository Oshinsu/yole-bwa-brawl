// Réglage central du jeu : constantes d'équilibrage, identités des yoles, étapes
// du Tour et petits utilitaires partagés.
//
// Extrait de game.js pour que les systèmes (armes, manches, HUD, entrées)
// puissent y accéder sans dépendre les uns des autres — et sans cycle d'import.

export const ACTION_WAVE = 1;
export const ACTION_HARPOON = 2;
export const ACTION_MINE = 4;
export const ACTION_SHIFT = 8;
// Le bit 16 reste volontairement libre : l'ancienne vengeance post-mort
// l'utilisait. Ne pas le réattribuer évite de décaler les actions suivantes.
export const ACTION_BOOST_FORWARD = 32;
export const ACTION_BOOST_LATERAL = 64;
export const ACTION_RHUM = 128;
// Bits 8 a 30 etaient libres. Le 31 ne fait PAS l'aller-retour dans le replay :
// ReplayPlayer rend un int32 signe.
export const ACTION_BARIK = 256;
export const ACTION_CHADRON = 512;
export const ACTION_LANBI = 1024;
export const ACTION_PWASON = 2048;

// Première mise à l'eau : trois verbes, puis tout le bac à sable.
//
// Cette progression ne change aucune constante du mode normal. Elle filtre
// seulement les actions de la manche-école jusqu'à ce que le joueur ait dirigé,
// contre-gîté et tiré un Coco — avec un filet temporel pour ne jamais retenir
// quelqu'un dans le tutoriel.
export const FIRST_RUN_TRAINING = Object.freeze({
  steerThreshold: 0.24,
  steerHoldSeconds: 0.36,
  counterHeelMinimum: 0.18,
  advancedUnlockSeconds: 38,
  basicActionMask: ACTION_SHIFT | ACTION_WAVE,
  playerLoadout: Object.freeze(["wave", "harpoon"]),
  visibleLoadout: Object.freeze(["wave"])
});

export function createFirstRunTrainingState() {
  return {
    step: 0,
    announced: false,
    elapsed: 0,
    steerTime: 0,
    shiftNudgeShown: false,
    advancedUnlocked: false,
    unlockReason: "",
    arsenalRestored: false,
    lockedRound: -1,
    arsenals: [],
    deferredPickups: []
  };
}

/**
 * Avance la révélation de la première manche.
 *
 * Fonction volontairement sans horloge globale ni RNG : à mêmes échantillons
 * fixes, une partie et sa relecture ouvrent l'arsenal au même tick.
 */
export function advanceFirstRunTraining(state, sample = {}) {
  if (!state || state.advancedUnlocked) return { event: "", step: state?.step ?? 3, unlocked: true };
  const dt = Math.max(0, Number.isFinite(sample.dt) ? sample.dt : 0);
  const steer = Math.abs(Number.isFinite(sample.steer) ? sample.steer : 0);
  const actions = Number.isInteger(sample.actions) ? sample.actions : 0;
  const roll = Math.abs(Number.isFinite(sample.roll) ? sample.roll : 0);
  const shiftKind = Number.isInteger(sample.shiftKind) ? sample.shiftKind : 0;
  state.elapsed += dt;

  let event = "";
  if (state.step === 0) {
    state.steerTime = steer > FIRST_RUN_TRAINING.steerThreshold
      ? state.steerTime + dt
      : Math.max(0, state.steerTime - dt * 0.5);
    if (state.steerTime >= FIRST_RUN_TRAINING.steerHoldSeconds) {
      state.step = 1;
      event = "steer_complete";
    }
  } else if (state.step === 1 && (actions & ACTION_SHIFT)) {
    if (shiftKind === 2 || roll >= FIRST_RUN_TRAINING.counterHeelMinimum) {
      state.step = 2;
      event = "shift_complete";
    } else if (!state.shiftNudgeShown) {
      state.shiftNudgeShown = true;
      event = "shift_early";
    }
  } else if (state.step === 2 && (actions & ACTION_WAVE)) {
    state.step = 3;
    state.advancedUnlocked = true;
    state.unlockReason = "completed";
    event = "completed";
  }

  // L'action du tick gagne sur le filet temporel. Quelqu'un qui réussit son
  // Coco à 38,000 s doit recevoir la réussite, pas un tutoriel "expiré".
  if (!state.advancedUnlocked && !event && state.elapsed >= FIRST_RUN_TRAINING.advancedUnlockSeconds) {
    state.step = 3;
    state.advancedUnlocked = true;
    state.unlockReason = "timeout";
    event = "timeout";
  }

  return { event, step: state.step, unlocked: state.advancedUnlocked };
}

export function trainingActionMask(state, actions) {
  const requested = Number.isInteger(actions) ? actions >>> 0 : 0;
  if (!state || state.advancedUnlocked) return requested;
  return requested & FIRST_RUN_TRAINING.basicActionMask;
}

// GRÉEMENT — le seul axe de personnalisation livré. Deux autres avaient été
// conçus (coque, bois) et mesurés SOUS le seuil de perception. L'option médiane
// est numériquement identique au jeu d'avant : compatibilité par construction.
//
// ⚠️ VALEURS DÉLIBÉRÉMENT MODESTES, et il faut savoir pourquoi.
//
// Quatre passes de réglage ont été mesurées sur trois graines, avec deux styles
// de pilotage (shift toutes les 90 frames, ou jamais). Chaque passe a renversé
// le classement :
//   flow 1.06 -> misaine -13,1 % ; flow 1.13 -> -11,5 % ; flow 1.20 -> +19,4 %.
// La jauge fait franchir le SEUIL du turbo (0,16) : le levier est une falaise,
// pas une pente. Il a donc été retiré — `flow` reste à 1 partout.
//
// Restent toile et gîte, à ±1,8 % au plus. C'est un choix de STYLE, pas un
// choix de puissance, et c'est assumé : un harnais qui shift sur minuterie
// n'est pas un pilote, et l'issue y est dominée par les chavirages plutôt que
// par la navigation. Élargir l'écart demande de jouer, pas de mesurer.
export const RIGS = [
  // ⚠️ `sail` seul ne suffit PAS : mesuré, la poussée vélique ne pèse que 6,6 %
  // au régime établi, donc ×1,14 dessus ne se voit pas (116,1 m contre 116,6 —
  // le gain est mangé par la gîte). Le vrai levier est le FLOW, qui pèse 50,7 %.
  // Le gréement arbitre donc entre toile et stabilité : la misaine encaisse
  // mieux et remplit sa jauge, la grand-voile pousse plus fort mais gîte et
  // récupère moins.
  { key: "misaine", label: "MISAINE", detail: "voile courte — encaisse mieux la gîte", sail: 0.95, heel: 0.86, flow: 1.0 },
  { key: "standard", label: "GRÉEMENT DROIT", detail: "l'équilibre d'origine", sail: 1, heel: 1, flow: 1 },
  { key: "grand", label: "GRAND-VOILE", detail: "toile pleine — pousse plus, gîte plus", sail: 1.09, heel: 1.14, flow: 1.0 }
];

export const SAIL_LIVERIES = ["KOULÈV", "LANBI", "KOLIBRI", "VOLCAN"];

export const CONFIG = {
  fixed: 1 / 60,
  targetScore: 5,
  roundLimit: 78,
  trackHalfWidth: 54,
  // ⚠️ AUCUN NOM DE MARQUE ICI. « CHANFLOR X » a été retiré : c'est une marque
  // déposée d'eau de source martiniquaise, et le projet vise une diffusion
  // publique après validation de sa candidate.
  // Les trois autres sont sûrs — « caracoli » est un arbre et un lieu-dit,
  // « lanmè rouge » veut dire « mer rouge » en créole, « bwa fatal » est inventé.
  // Si tu ajoutes un nom, vérifie qu'il n'appartient à personne.
  names: ["BWA FATAL", "KOLIBRI", "CARACOLI", "LANMÈ ROUGE"],
  colors: [0xff7524, 0x1de1e8, 0x7658ff, 0xef3f75],
  accents: [0xfff2c9, 0xf3ffff, 0xf0edff, 0xffeef6]
};

// Réglage central : toutes les constantes d'équilibrage vivent ici,
// pas dispersées dans les systèmes. Ne changer qu'avec un playtest à l'appui.
// Registre complet des armes. L'ordre fixe la priorité de repli quand l'arme
// active tombe à zéro. `cls` pilote le liseré de couleur de l'emplacement : à
// 4,8 px un libelle est illisible au soleil, la couleur ne l'est pas — et
// docs/ART_DIRECTION.md interdit de casser ce code deja appris.
export const WEAPONS = [
  { key: "wave", label: "COCO BOUM", cls: "w-wave", ico: "i0", action: 1 },
  { key: "harpoon", label: "SPIDER HARPON", cls: "w-harpoon", ico: "i1", action: 2 },
  { key: "mine", label: "MINE TSUNAMI", cls: "w-mine", ico: "i2", action: 4 },
  { key: "rhum", label: "RHUM", cls: "w-rhum", ico: "i3", action: 128 },
  // Les quatre armes absurdes. Chacune a une ENTREE differente — larguer
  // derriere, semer devant, souffler en cone, lancer a tete chercheuse — parce
  // que quatre projectiles qui font des degats ne seraient qu'une seule arme.
  { key: "barik", label: "BARIK RHUM", cls: "w-barik", ico: "i6", action: 256 },
  { key: "chadron", label: "CHADRON", cls: "w-chadron", ico: "i7", action: 512 },
  { key: "lanbi", label: "KONK LANBI", cls: "w-lanbi", ico: "i8", action: 1024 },
  { key: "pwason", label: "PWASON VOLAN", cls: "w-pwason", ico: "i9", action: 2048 }
];

// ⚠️ DEUX ARMES DE SOUTE, CHOISIES AVANT LA COURSE — PAS QUATRE IMPOSÉES.
//
// Avec quatre armes illimitées, une caisse n'était qu'un bonus : on pouvait
// jouer une manche entière sans en ramasser une seule et ne rien perdre. Aucun
// effet visuel n'aurait corrigé ça — le problème était systémique.
//
// La yole n'emporte plus que DEUX armes, prises dans ce vivier au garage. On
// n'est jamais désarmé, mais on est toujours incomplet : ce qui manque, la mer
// le donne, ou ne le donne pas.
//
// ⚠️ Une tentative antérieure avait été retirée parce qu'elle faisait diverger
// la relecture. La cause a été trouvée depuis : le pas fixe consommait
// `visualRng`, dont le rendu dépend à cadence variable. Corrigé aux deux sites,
// le passage à deux armes ne diverge plus — vérifié IA active et IA coupée.
// Départ : 3 · 2 · 1 · GO. Une seconde par chiffre, plus la demi-seconde du
// « GO » qui reste affiché pendant qu'on démarre déjà.
export const COUNTDOWN_SECONDS = 3.0;
export const COUNTDOWN_GO_SECONDS = 0.85;

export const LOADOUT_POOL = Object.freeze(["wave", "harpoon", "mine", "rhum"]);
export const LOADOUT_SIZE = 2;
export const DEFAULT_LOADOUT = Object.freeze(["wave", "harpoon"]);
// Conservé pour les tests et les outils qui interrogent l'arsenal complet.
export const BASE_WEAPONS = LOADOUT_POOL;

/** Normalise une soute lue d'un réglage ou d'un replay : 2 clés valides. */
export function resolveLoadout(brut) {
  const propres = Array.isArray(brut)
    ? brut.filter((cle, index, tout) => LOADOUT_POOL.includes(cle) && tout.indexOf(cle) === index)
    : [];
  for (const secours of DEFAULT_LOADOUT) {
    if (propres.length >= LOADOUT_SIZE) break;
    if (!propres.includes(secours)) propres.push(secours);
  }
  // Un réglage corrompu ne doit jamais laisser une yole sans arme.
  for (const secours of LOADOUT_POOL) {
    if (propres.length >= LOADOUT_SIZE) break;
    if (!propres.includes(secours)) propres.push(secours);
  }
  return Object.freeze(propres.slice(0, LOADOUT_SIZE));
}

/** Soute d'une IA : déterministe, dérivée de son identifiant, et variée. */
export function aiLoadout(id) {
  const a = LOADOUT_POOL[id % LOADOUT_POOL.length];
  const b = LOADOUT_POOL[(id * 2 + 1) % LOADOUT_POOL.length];
  return resolveLoadout(a === b ? [a] : [a, b]);
}
// Les six butins possibles. Mine et Rhum peuvent aussi être choisies en soute ;
// les quatre autres restent exclusivement disponibles en caisse.
export const CRATE_WEAPONS = Object.freeze(["mine", "rhum", "barik", "chadron", "lanbi", "pwason"]);

// Trois niveaux d'IA. Ils ne trichent pas sur la physique : ce sont les mêmes
// yoles, avec les mêmes constantes. Ce qui change, c'est la QUALITÉ DU PILOTAGE
// — à quel point elles exploitent le turbo, visent juste, prennent des risques
// et contre-gîtent au bon moment.
export const AI_LEVELS = [
  {
    key: "peyi", label: "PEYI", detail: "elles courent, sans plus",
    aggression: [0.28, 0.52], risk: [0.20, 0.46], precision: [0.40, 0.66],
    // Elles ne prennent le turbo que pour fuir le Grain — le comportement d'avant.
    boostRace: 0, boostAttack: 0.12, reaction: 1.45, shiftSkill: 0.35
  },
  {
    key: "tour", label: "TOUR", detail: "elles courent pour gagner",
    aggression: [0.42, 0.78], risk: [0.34, 0.76], precision: [0.55, 0.92],
    boostRace: 0.62, boostAttack: 0.42, reaction: 1.0, shiftSkill: 0.68
  },
  {
    key: "channpyon", label: "CHANNPYON", detail: "elles ne te laissent rien",
    aggression: [0.66, 0.95], risk: [0.55, 0.92], precision: [0.78, 1.0],
    boostRace: 0.94, boostAttack: 0.72, reaction: 0.68, shiftSkill: 0.92
  }
];

export function resolveAiLevel(key) {
  return AI_LEVELS.find((level) => level.key === key) ?? AI_LEVELS[1];
}

export const BALANCE = {
  cooldowns: { wave: 4.35, harpoon: 5.8, mine: 5.35, rhum: 1.2, barik: 6.2, chadron: 5.0, lanbi: 7.4, pwason: 4.8 },
  // Cadence des quatre armes du vivier de soute. Mine et Rhum conservent cette
  // cadence lorsqu'une caisse en donne une copie à munitions limitées.
  baseCooldowns: { wave: 5.4, harpoon: 7.6, mine: 7.0, rhum: 16.0 },
  // Cinq secondes rendaient le Rhum obligatoire : avec 16 s de recharge, une
  // yole pouvait ignorer tous les impacts presque un tiers du temps. Trois
  // secondes gardent le moment héroïque sans annuler le jeu adverse.
  rhum: { duration: 3.0 },
  // ⚠️ RÉGLAGE DE JEU, à ajuster au playtest — pas une constante physique.
  //
  // Les armes visent l'ÉQUILIBRE avant la coque. Une yole qui prend un coco ne
  // doit pas fondre, elle doit partir à la gîte : c'est la contre-gîte qui
  // devient la boucle de jeu permanente, pas la barre de vie.
  //
  // `roll` multiplie toutes les impulsions de roulis des armes, `hull` réduit
  // leurs dégâts de structure en compensation pour que la durée d'une manche ne
  // bouge pas. Les deux à 1 rendent exactement le comportement d'avant.
  // ⚠️ 2,0 A ÉTÉ MESURÉ INJOUABLE. Combiné à la munition illimitée, il faisait
  // encaisser au joueur 10,4 rad de roulis PAR MINUTE — un coup toutes les
  // 5,1 s à 0,889 rad de moyenne — donc une yole couchée en permanence, jamais
  // relevée. Les deux changements étaient défendables séparément ; leur produit
  // ne l'était pas. Valeur retenue après mesure, voir `npm run playtest`.
  weaponBias: { roll: 1.35, hull: 0.72, water: 1.15 },

  // Poids de l'alignement dans le choix de cible du harpon. Voir findTarget :
  // il se compare à une distance en mètres, donc 15 ne pesait rien.
  aimWeight: 90,

  // Départ : les quatre yoles côte à côte à 5,2 m d'écart ne laissaient aucune
  // place à une manœuvre d'ouverture. Écartées, il y a un choix de bord à faire
  // avant le premier contact.
  startSpread: [-21, -7, 7, 21],

  // Vitesse de lancement, en m/s. 15,2 mettait déjà la yole à 55 km/h au coup
  // d'envoi : il n'y avait pas de phase d'accélération à jouer. On part lent, et
  // c'est la voile qui construit la vitesse.
  startSpeed: 5.6,

  // Cadence de tir des IA, en multiplicateur de cooldown.
  //
  // ⚠️ Sans ce frein, trois IA en munition illimitée tiraient 63 coups par
  // minute — plus d'un par seconde à elles trois. Un humain ne joue pas comme
  // ça : il vise, il attend d'être à portée, il rate des fenêtres. Le
  // multiplicateur rend aux IA une cadence humaine sans leur retirer l'arsenal.
  aiFireRate: { peyi: 3.4, tour: 2.6, channpyon: 2.0 },
  coconut: {
    spawnAhead: 4.7, spawnUp: 2.05, speed: 35.5, up: 7.1, life: 2.65,
    inheritVelocity: 0.28, gravity: 10.8, triggerRadius: 5.4, capsuleHit: 3.35, aoeRadius: 9.5
  },
  grapple: {
    range: 62, maxDistance: 76,
    // Demi-largeur du couloir de tir, en mètres. Une yole fait 2,16 m de bau :
    // 3,2 laisse une marge de visée jouable sans redevenir un verrouillage.
    rayHalfWidth: 3.2, slack: 5.5, initialStretch: 6.5, tensionSpan: 18,
    pull: 10.8, pullOwner: 2.25, pullTarget: 0.18, targetAnchorDrag: 0.28,
    swingForce: 5.4, rollForce: 0.72,
    // Le harpon frappe plus fort : c'est l'arme de contact du jeu, elle doit
    // se sentir à l'accroche ET pendant toute la traction.
    impactPull: 2.05, impactSlow: 0.17, impactCohesion: 0.125, impactHull: 0.1389,
    // Tension : plus tôt (0,52), plus souvent (0,58 s), et plus punitive.
    tensionDamageThreshold: 0.52, tensionDamageInterval: 0.58,
    tensionCohesion: 0.022, tensionSail: 0.011, tensionRoll: 0.145,
    stressThreshold: 0.92, stressBuildup: 0.18, stressPeak: 0.72,
    stressRecovery: 1.8, stressLimit: 1.10,
    slingshotCharge: 0.55, slingshotLead: 1.0, slingshotTension: 0.28,
    slingshotSide: 0.36, vfxInterval: 0.32, life: 6.2
  },
  // BARIK : largue derriere, meche longue, explose au FEU — gros degat de coque
  // et ralentissement, mais pas d'eau embarquee. C'est l'arme du poursuivi.
  // BARIK RHUM — le fût enflammé LAISSE UNE NAPPE.
  //
  // ⚠️ Sans elle, le barik était une deuxième mine : même largage derrière soi,
  // même détonation, un rayon plus petit. Deux armes pour un seul verbe. Un fût
  // de rhum en feu doit BRÛLER — laisser une zone qu'on contourne, pas un
  // second boum. C'est ce qui le sépare de la mine : la mine punit qui passe,
  // la nappe interdit un passage.
  barik: {
    dropBehind: 6.2, armTime: 0.9, life: 9.5, triggerRadius: 4.6, aoeRadius: 13,
    slickRadius: 11.5,      // mètres
    slickLife: 7.5,         // secondes de combustion
    slickInterval: 0.6,     // secondes entre deux morsures
    slickHull: 0.035,       // coque par morsure, avant le biais d'arme
    slickRoll: 0.16,
    slickWater: 4
  },
  // CHADRON : seme DEVANT, dans la trajectoire du leader. Longue vie, petit
  // rayon : la decision est d'anticiper ou il sera dans deux secondes, pas
  // d'appuyer parce qu'on se fait coller.
  chadron: { dropAhead: 26, armTime: 0.3, life: 16, triggerRadius: 3.1, aoeRadius: 5.4 },
  // KONK : cone de souffle instantane, ZERO degat de structure. Il desorganise
  // l'equipage adverse et fait deriver la yole, rien de plus.
  // KONK LANBI — la seule arme qui prend le CONTRÔLE au lieu de la coque.
  // 1,5 s sans barre : assez pour perdre sa ligne et sa gîte, trop court pour
  // que la victime n'ait plus qu'à regarder. `helmLoss` est modulé par la
  // distance, comme le reste du cône.
  lanbi: { range: 34, halfAngle: 0.62, helmLoss: 1.5 },
  // PWASON : banc a tete chercheuse. Peu de degat, mais il decroche les yoleurs.
  // PWASON VOLAN — torpille LOBÉE à tête chercheuse.
  //
  // ⚠️ `triggerRadius` et `capsuleHit` sont verrouillés en dur par
  // test/combat-feedback.test.mjs : ne pas y toucher.
  //
  // `gravity` et `arcUp` sont nouveaux. Avant, le pwason n'avait AUCUNE
  // gravité : la ligne `projectile.vy += (0.4 - vy) * virage` de `steerPwason`
  // écrasait toute mise en l'air en 0,385 s, donc le lob initial ne servait à
  // rien et le poisson rasait l'eau en ligne droite.
  //
  // Avec arcUp 9,5 et gravity 7,6 : sommet à 1,25 s, retour à la hauteur de tir
  // à 2,5 s — dans la durée de vie de 3,2 s. C'est la cloche.
  pwason: {
    speed: 26, life: 3.2, turn: 3.4, triggerRadius: 3.4, capsuleHit: 2.55,
    aoeRadius: 6.0, gravity: 7.6, arcUp: 9.5, reacquireRange: 70
  },
  mine: { dropBehind: 4.8, armTime: 0.56, life: 12, triggerRadius: 4.0, capsuleHit: 2.8, aoeRadius: 18 },
  collision: {
    // Abordage plus franc : c'est le contact le plus fréquent du jeu, il doit
    // s'entendre et se sentir. `severityScale` monte le palier d'impact,
    // `dashFactor` fait du Bwa Dash une vraie arme de contact.
    damageCooldown: 0.26, severityScale: 17.5, severityMin: 0.14, severityMax: 2.10,
    tangentialFactor: 0.30, speedFactor: 0.22, dashFactor: 14.5
  },
  // ⚠️ RECULER LE GRAIN N'EST PAS UN RÉGLAGE COSMÉTIQUE.
  //
  // `stormGap` alimente `atmosphere.update` (sky.js), qui produit `stormAmount`
  // — lequel pilote la HOULE (`waveField.setWeather`) et le VENT
  // (`environment.windX/windZ`). C'est donc de la PHYSIQUE. Six autres seuils
  // en mètres, codés en dur ailleurs, ont dû être réalignés du même facteur
  // 1,34 : la fenêtre de `smoothstep` de sky.js, deux seuils d'affichage du
  // HUD, l'hystérésis musicale, le recentrage de l'IA et son turbo de survie.
  // Sans ça, le Grain devient invisible au HUD, l'IA cesse de paniquer, et
  // au-delà de 95 m `stormAmount` tombe à zéro — plus de pluie, plus
  // d'éclairs, plus de houle.
  storm: {
    startZ: -150, gapStart: 148, gapEnd: 103, gapShrinkPerSecond: 0.14,
    baseAdvance: 8.7, advancePerSecond: 0.075,
    cohesionGap: 13, soakGap: 5, eliminateBehind: -3, soakTimeLimit: 2.15
  }
};

// ⚠️ LES SEUILS DE BRUME SE DÉRIVENT, ILS NE SE RECOPIENT PLUS.
//
// Le commentaire ci-dessus racontait qu'un recul du grain avait obligé à
// réaligner « six autres seuils en mètres, codés en dur ailleurs ». Il y en
// avait onze, répartis dans cinq fichiers — et rien ne signalait leur lien.
// Reculer la brume sans les suivre rend le grain invisible au HUD, empêche
// l'IA de paniquer, et au-delà de la fenêtre de sky.js fait tomber
// `stormAmount` à zéro : plus de pluie, plus d'éclairs, plus de houle.
//
// Ils sont désormais dérivés de `storm.gapStart`. Régler la distance de la
// brume ne demande plus qu'UN nombre — tout le reste suit, dans le même
// rapport que celui contre lequel ces valeurs ont été équilibrées.
export const STORM_RANGE = (() => {
  // L'écart de départ contre lequel les onze seuils ont été réglés à l'origine.
  const REFERENCE = 118;
  const echelle = BALANCE.storm.gapStart / REFERENCE;
  const m = (metres) => Math.round(metres * echelle);
  return Object.freeze({
    echelle,
    fenetreProche: m(24),    // sky.js — bord bas du smoothstep du grain
    fenetreLoin: m(128),     // sky.js — au-delà, plus aucun grain
    hudProche: m(92),        // hud.js — minimap « storm-near » et panneau brume
    hudDanger: m(52),        // hud.js — bandeau d'urgence
    musiqueEntree: m(70),    // hud.js — hystérésis musicale, entrée dans le grain
    musiqueSortie: m(105),   // hud.js — ... et sortie
    iaDesespoir: m(110),     // utility-ai.js — montée de la panique
    iaTurboSurvie: m(62),    // utility-ai.js — turbo de survie
    secousse: m(120),        // game.js — intensité de la secousse caméra
    iaRecentrage: m(40),     // boat.js — l'IA se recentre sur la route
    iaAgression: m(24)       // boat.js — en-deçà, l'IA cesse d'attaquer
  });
})();

// Points d'équipage pré-rendus pour le HUD (évite un Array.from à chaque rafraîchissement).
// Plage de zoom. 0,72 laissait la caméra à 16,7 m d'une yole de 11 m :
// trop loin pour lire l'équipage et la coque.
export const ZOOM_MIN = 0.46;
export const ZOOM_MAX = 2.6;

export const CREW_DOTS = Array.from({ length: 7 }, (_, count) =>
  Array.from({ length: 6 }, (_, index) => (index < count ? "●" : "○")).join(" "));

// Les 8 étapes du 40e Tour des Yoles Rondes (26 juillet → 2 août 2026),
// distances ramenées à l'échelle arcade. Points à la place : 4/3/2/1, 0 si DNF.
export const TOUR_STAGES = [
  {
    slug: "sainte-anne-vauclin",
    name: "SAINTE-ANNE → LE VAUCLIN",
    short: "CAP AU VAUCLIN",
    distance: 1500,
    landmark: "Pointe Marin",
    weatherLabel: "Alizés francs",
    tagline: "Départ lumineux, récifs serrés et premier vrai bord de rappel.",
    accent: "#38e8c6",
    gameplay: {
      windScale: 0.90, swellScale: 0.84, crossSea: 0.00, stormSpeed: 0.90,
      trackHalfWidth: 58, sargasseSpacing: 1.20, pickupSpacing: 0.90,
      signature: "ALIZÉS ÉCOLE · MER PORTANTE"
    },
    palette: { sand: 0xf0e5c8, shallowRock: 0x527a70, green: 0x20a66a, darkGreen: 0x086a49, leaf: 0x39cf72 },
    environment: {
      archetype: "lagoon",
      landmark: { type: "pointe-marin", side: -1, progress: 0.62, offset: 210 },
      fleetSide: 1,
      festivity: 1.0,
      water: { deep: 0x0b5970, mid: 0x168ea1, shallow: 0x39d0ca, foam: 0xf5ffff }
    }
  },
  {
    slug: "vauclin-robert",
    name: "LE VAUCLIN → LE ROBERT",
    short: "PASSE DES ÎLETS",
    distance: 1300,
    landmark: "Îlets du François",
    weatherLabel: "Clapot d'Atlantique",
    tagline: "Un sprint entre hauts-fonds où la trajectoire vaut plus que la force.",
    accent: "#5ee6ff",
    gameplay: {
      windScale: 1.00, swellScale: 1.00, crossSea: 0.12, stormSpeed: 0.96,
      trackHalfWidth: 50, sargasseSpacing: 1.04, pickupSpacing: 0.96,
      signature: "CLAPOT COURT · PASSES SERRÉES"
    },
    palette: { sand: 0xece2c4, shallowRock: 0x466f69, green: 0x198d59, darkGreen: 0x07563d, leaf: 0x2cc869 },
    environment: {
      archetype: "islets",
      landmark: { type: "ilets-francois", side: 1, progress: 0.56, offset: 215 },
      fleetSide: -1,
      festivity: 1.08,
      water: { deep: 0x0b526d, mid: 0x147f98, shallow: 0x32bfc4, foam: 0xf1ffff }
    }
  },
  {
    slug: "robert-trinite",
    name: "LE ROBERT → LA TRINITÉ",
    short: "CANAL DU ROBERT",
    distance: 1600,
    landmark: "Baie du Robert",
    weatherLabel: "Mer croisée",
    tagline: "Des couloirs d'eau étroits, des rivaux proches et peu de place pour corriger.",
    accent: "#76d6ff",
    gameplay: {
      windScale: 0.96, swellScale: 1.05, crossSea: 0.30, stormSpeed: 1.00,
      trackHalfWidth: 46, sargasseSpacing: 0.94, pickupSpacing: 1.02,
      signature: "MER CROISÉE · COULOIR ÉTROIT"
    },
    palette: { sand: 0xded9bd, shallowRock: 0x486a6f, green: 0x248c63, darkGreen: 0x0c5546, leaf: 0x2cad69 },
    environment: {
      archetype: "islets",
      landmark: { type: "baie-robert", side: -1, progress: 0.67, offset: 230 },
      fleetSide: 1,
      festivity: 0.92,
      water: { deep: 0x0b4b66, mid: 0x187a91, shallow: 0x2aafb8, foam: 0xedffff }
    }
  },
  {
    slug: "trinite-saint-pierre",
    name: "LA TRINITÉ → SAINT-PIERRE",
    short: "LA GRANDE TRAVERSÉE",
    distance: 2400,
    landmark: "Montagne Pelée",
    weatherLabel: "Grain volcanique",
    tagline: "L'étape reine : longue, sombre et impitoyable sous la silhouette de la Pelée.",
    accent: "#ffbd66",
    gameplay: {
      windScale: 1.08, swellScale: 1.12, crossSea: 0.20, stormSpeed: 1.18,
      trackHalfWidth: 54, sargasseSpacing: 1.10, pickupSpacing: 1.08,
      signature: "GRAIN RAPIDE · PRESSION VOLCANIQUE"
    },
    palette: { sand: 0xb99a73, shallowRock: 0x3f4b49, green: 0x2f704b, darkGreen: 0x12382e, leaf: 0x3f8552 },
    environment: {
      archetype: "volcanic",
      landmark: { type: "pelee", side: -1, progress: 0.72, offset: 235 },
      fleetSide: 1,
      festivity: 0.72,
      water: { deep: 0x102f44, mid: 0x19536a, shallow: 0x327c82, foam: 0xe3edf0 }
    }
  },
  {
    slug: "saint-pierre-fort-de-france",
    name: "SAINT-PIERRE → FORT-DE-FRANCE",
    short: "DESCENTE CARAÏBE",
    distance: 1700,
    landmark: "Baie de Fort-de-France",
    weatherLabel: "Longue houle",
    tagline: "La côte défile vite ; le moindre excès de gîte se paie jusqu'à la baie.",
    accent: "#ffca80",
    gameplay: {
      windScale: 1.00, swellScale: 1.23, crossSea: 0.05, stormSpeed: 0.98,
      trackHalfWidth: 54, sargasseSpacing: 1.08, pickupSpacing: 1.00,
      signature: "LONGUE HOULE · YOLE LOURDE"
    },
    palette: { sand: 0xd7c5a3, shallowRock: 0x566c69, green: 0x27865a, darkGreen: 0x0f553b, leaf: 0x38a960 },
    environment: {
      archetype: "volcanic",
      hillHeight: 1.08,
      landmark: { type: "baie-fdf", side: 1, progress: 0.74, offset: 240 },
      fleetSide: -1,
      festivity: 1.18,
      water: { deep: 0x0e4159, mid: 0x176b7d, shallow: 0x2c9ca1, foam: 0xf0f7f4 }
    }
  },
  {
    slug: "fort-de-france-anses-arlet",
    name: "FORT-DE-FRANCE → LES ANSES D'ARLET",
    short: "CAP AUX ANSES",
    distance: 1500,
    landmark: "Rocher du Diamant",
    weatherLabel: "Vent tournant",
    tagline: "Reliefs abrupts et changements de pression avant l'entrée aux Anses.",
    accent: "#ff8f70",
    gameplay: {
      windScale: 1.05, windAngle: 0.24, swellScale: 1.02, crossSea: 0.16,
      stormSpeed: 1.02, trackHalfWidth: 50, sargasseSpacing: 1.00,
      pickupSpacing: 0.94, signature: "VENT TOURNANT · CAP MOBILE"
    },
    palette: { sand: 0xd5bf96, shallowRock: 0x5c5558, green: 0x2b8156, darkGreen: 0x134c38, leaf: 0x3aa25c },
    environment: {
      archetype: "volcanic",
      landmark: { type: "diamant", side: 1, progress: 0.64, offset: 220 },
      fleetSide: -1,
      festivity: 1.02,
      water: { deep: 0x103d55, mid: 0x176578, shallow: 0x2b929b, foam: 0xeff8f6 }
    }
  },
  {
    slug: "anses-arlet-riviere-pilote",
    name: "LES ANSES D'ARLET → RIVIÈRE-PILOTE",
    short: "LE BORD DU SUD",
    distance: 1900,
    landmark: "Cap Salomon",
    weatherLabel: "Rafales du sud",
    tagline: "Une côte cassée, des rafales brutales et un mur du Grain qui ne pardonne rien.",
    accent: "#ff718c",
    gameplay: {
      windScale: 1.08, gustStrength: 0.24, gustFrequency: 0.74,
      swellScale: 1.10, crossSea: 0.22, stormSpeed: 1.12,
      trackHalfWidth: 48, sargasseSpacing: 0.92, pickupSpacing: 1.04,
      signature: "RAFALES · GRAIN AUX TROUSSES"
    },
    palette: { sand: 0xd5c19c, shallowRock: 0x5d5961, green: 0x2d7c50, darkGreen: 0x163f34, leaf: 0x3c9755 },
    environment: {
      archetype: "volcanic",
      hillHeight: 1.14,
      landmark: { type: "cap-salomon", side: -1, progress: 0.61, offset: 230 },
      fleetSide: 1,
      festivity: 0.88,
      water: { deep: 0x103a50, mid: 0x176276, shallow: 0x2b9199, foam: 0xeff8f5 }
    }
  },
  {
    slug: "riviere-pilote-sainte-anne",
    name: "RIVIÈRE-PILOTE → SAINTE-ANNE",
    short: "RETOUR À SAINTE-ANNE",
    distance: 1600,
    landmark: "Ligne de Sainte-Anne",
    weatherLabel: "Final sous tension",
    tagline: "Tout le Tour se joue dans une dernière course rapide, claire et sans calcul.",
    accent: "#ffe36e",
    gameplay: {
      windScale: 1.12, swellScale: 0.96, crossSea: 0.08, stormSpeed: 1.08,
      trackHalfWidth: 58, sargasseSpacing: 1.12, pickupSpacing: 0.82,
      signature: "SPRINT FINAL · CAISSES DÉCISIVES"
    },
    palette: { sand: 0xf2e4bd, shallowRock: 0x5c7468, green: 0x27965a, darkGreen: 0x0c5d3d, leaf: 0x38bf62 },
    environment: {
      archetype: "lagoon",
      landmark: { type: "sainte-anne", side: 1, progress: 0.76, offset: 215 },
      fleetSide: -1,
      festivity: 1.35,
      water: { deep: 0x0a5870, mid: 0x158da0, shallow: 0x39ccc4, foam: 0xf8ffff }
    }
  }
];
export const TOUR_STAGE_POINTS = [4, 3, 2, 1];

// ─── ARÈNES DE LA COMBAT BOX ─────────────────────────────────────────────────
//
// Demande de jeu (passe 80) : « d'autres maps, mieux faites, avec plus de
// diversité ». Mesuré avant : la Combat Box appelait `setStage(seed ^ 0x77ad)`
// sans profil — archétype `tropical`, palette et eau par défaut, aucun repère —
// et la graine de session ne changeait JAMAIS entre deux parties (0x0b0a2026
// hors lien de défi) : même côte à chaque RECOMMENCER, depuis toujours.
//
// Une arène est un décor complet (côte, palette, eau, repère) et une signature
// de mer légère. La côte freine et repousse les yoles (`coastPenalty`,
// `resolveBoatCollision`) et la houle entre dans la physique : l'arène voyage
// donc dans le replay comme le gréement, le niveau d'IA et la soute, et dans
// le lien de défi (`&arena=`). Les étapes du Tour gardent TOUR_STAGES.
export const ARENA_DISTANCE = 1600;
export const ARENA_SCHOOL_SLUG = "lagon-de-sainte-anne";
export const ARENAS = [
  {
    slug: "lagon-de-sainte-anne",
    name: "LAGON DE SAINTE-ANNE",
    short: "LAGON",
    tagline: "Eau claire, bancs de sable blanc, vent d'école : la mer où l'on apprend la contre-gîte.",
    accent: "#38e8c6",
    gameplay: {
      windScale: 0.94, swellScale: 0.86, crossSea: 0.00, stormSpeed: 0.94,
      sargasseSpacing: 1.15, pickupSpacing: 0.94, signature: "LAGON · MER D'ÉCOLE"
    },
    palette: { sand: 0xf2e6c6, shallowRock: 0x527a70, green: 0x22a86c, darkGreen: 0x0a6b4a, leaf: 0x3bd074 },
    environment: {
      archetype: "lagoon",
      landmark: { type: "sainte-anne", side: 1, progress: 0.34, offset: 205 },
      water: { deep: 0x0a5870, mid: 0x158da0, shallow: 0x39ccc4, foam: 0xf8ffff }
    }
  },
  {
    slug: "passe-des-ilets",
    name: "PASSE DES ÎLETS DU FRANÇOIS",
    short: "PASSE DES ÎLETS",
    tagline: "Des îlets serrés sur deux rangées : la trajectoire vaut plus que la vitesse.",
    accent: "#5ee6ff",
    gameplay: {
      windScale: 1.00, swellScale: 0.98, crossSea: 0.12, stormSpeed: 1.00,
      sargasseSpacing: 1.00, pickupSpacing: 1.00, signature: "PASSES · DEUX RANGÉES D'ÎLETS"
    },
    palette: { sand: 0xece2c4, shallowRock: 0x466f69, green: 0x198d59, darkGreen: 0x07563d, leaf: 0x2cc869 },
    environment: {
      archetype: "islets",
      skipChance: 0.02,
      extraIsletChance: 0.55,
      landmark: { type: "ilets-francois", side: -1, progress: 0.36, offset: 290 },
      water: { deep: 0x0b526d, mid: 0x147f98, shallow: 0x32bfc4, foam: 0xf1ffff }
    }
  },
  {
    slug: "mangrove-du-robert",
    name: "MANGROVE DU ROBERT",
    short: "MANGROVE",
    tagline: "Des berges basses et touffues qui longent la course : peu de place, eau verte et calme.",
    accent: "#6fe3a0",
    gameplay: {
      windScale: 0.92, swellScale: 0.80, crossSea: 0.05, stormSpeed: 0.96,
      sargasseSpacing: 0.90, pickupSpacing: 1.02, signature: "MANGROVE · COULOIR VERT"
    },
    palette: { sand: 0xc9b893, shallowRock: 0x4d5f52, green: 0x1f7a4a, darkGreen: 0x0b3f2c, leaf: 0x2f9a58 },
    environment: {
      archetype: "mangrove",
      landmark: { type: "baie-robert", side: -1, progress: 0.38, offset: 225 },
      water: { deep: 0x0c4a48, mid: 0x157d76, shallow: 0x2fb09e, foam: 0xeafff4 }
    }
  },
  {
    slug: "cayes-du-sud",
    name: "CAYES DU SUD",
    short: "CAYES",
    tagline: "Bancs de sable à fleur d'eau, eau turquoise, vent franc : la carte la plus rapide.",
    accent: "#7ff7ea",
    gameplay: {
      windScale: 1.05, swellScale: 0.90, crossSea: 0.00, stormSpeed: 1.02,
      sargasseSpacing: 1.20, pickupSpacing: 0.90, signature: "CAYES · PLEINE VITESSE"
    },
    palette: { sand: 0xf7edd4, shallowRock: 0x5f8a7e, green: 0x2fae74, darkGreen: 0x117553, leaf: 0x46d47f },
    environment: {
      archetype: "cayes",
      landmark: { type: "pointe-marin", side: -1, progress: 0.35, offset: 320 },
      water: { deep: 0x0e6a80, mid: 0x1aa0b0, shallow: 0x4fe0d6, foam: 0xffffff }
    }
  },
  {
    slug: "cote-sous-la-pelee",
    name: "CÔTE SOUS LA PELÉE",
    short: "PELÉE",
    tagline: "Sable noir, mornes sombres, houle lourde sous le volcan.",
    accent: "#ffbd66",
    gameplay: {
      windScale: 1.06, swellScale: 1.10, crossSea: 0.18, stormSpeed: 1.10,
      sargasseSpacing: 1.08, pickupSpacing: 1.06, signature: "PELÉE · HOULE LOURDE"
    },
    palette: { sand: 0xb99a73, shallowRock: 0x3f4b49, green: 0x2f704b, darkGreen: 0x12382e, leaf: 0x3f8552 },
    environment: {
      archetype: "volcanic",
      landmark: { type: "pelee", side: -1, progress: 0.40, offset: 265 },
      water: { deep: 0x102f44, mid: 0x19536a, shallow: 0x327c82, foam: 0xe3edf0 }
    }
  },
  {
    slug: "haute-mer-du-diamant",
    name: "HAUTE MER DU DIAMANT",
    short: "DIAMANT",
    tagline: "Presque pas de côte, une grande houle et le Rocher qui monte de l'eau.",
    accent: "#ff8f70",
    gameplay: {
      windScale: 1.08, swellScale: 1.26, crossSea: 0.10, stormSpeed: 1.04,
      sargasseSpacing: 1.30, pickupSpacing: 1.00, signature: "HAUTE MER · GRANDE HOULE"
    },
    palette: { sand: 0xd5bf96, shallowRock: 0x5c5558, green: 0x2b8156, darkGreen: 0x134c38, leaf: 0x3aa25c },
    environment: {
      archetype: "volcanic",
      skipChance: 0.58,
      lateralMin: 86,
      lateralMax: 140,
      landmark: { type: "diamant", side: 1, progress: 0.36, offset: 215 },
      water: { deep: 0x103d55, mid: 0x176578, shallow: 0x2b929b, foam: 0xeff8f6 }
    }
  },
  {
    slug: "falaises-de-la-caravelle",
    name: "FALAISES DE LA CARAVELLE",
    short: "CARAVELLE",
    tagline: "Pitons abrupts, roche à nu et mer croisée d'Atlantique : la carte qui punit la gîte.",
    accent: "#ff718c",
    gameplay: {
      windScale: 1.10, swellScale: 1.15, crossSea: 0.28, stormSpeed: 1.08,
      sargasseSpacing: 0.95, pickupSpacing: 1.04, signature: "CARAVELLE · MER CROISÉE"
    },
    palette: { sand: 0xcdb48c, shallowRock: 0x3e4a48, green: 0x2c6e44, darkGreen: 0x143b2c, leaf: 0x3a8a4e },
    environment: {
      archetype: "cliffs",
      landmark: { type: "caravelle", side: 1, progress: 0.37, offset: 225 },
      water: { deep: 0x0d3550, mid: 0x155f78, shallow: 0x2a8f9a, foam: 0xeef6f8 }
    }
  },
  {
    slug: "baie-des-flamands",
    name: "BAIE DES FLAMANDS",
    short: "FORT-DE-FRANCE",
    tagline: "La ville au bord de l'eau et la baie animée : la mer du Tour telle que la foule la voit.",
    accent: "#ffca80",
    gameplay: {
      windScale: 1.00, swellScale: 1.00, crossSea: 0.06, stormSpeed: 1.00,
      sargasseSpacing: 1.00, pickupSpacing: 0.96, signature: "BAIE · COURSE EN VILLE"
    },
    palette: { sand: 0xd7c5a3, shallowRock: 0x566c69, green: 0x27865a, darkGreen: 0x0f553b, leaf: 0x38a960 },
    environment: {
      archetype: "tropical",
      landmark: { type: "baie-fdf", side: 1, progress: 0.38, offset: 240 },
      water: { deep: 0x0e4159, mid: 0x176b7d, shallow: 0x2c9ca1, foam: 0xf0f7f4 }
    }
  }
];

/** Une arène par slug, ou `null` : "auto", une valeur corrompue ou inconnue rendent la main. */
export function resolveArena(slug) {
  if (typeof slug !== "string" || !slug) return null;
  return ARENAS.find((arena) => arena.slug === slug) ?? null;
}

/**
 * L'arène d'une graine, plus une rotation de session : même graine, même carte
 * pour tout le monde (défi du jour, lien de défi) ; RECOMMENCER fait tourner.
 */
export function arenaIndexForSeed(seed, rotation = 0) {
  const hash = Math.imul((seed >>> 0) ^ 0x51a7e5, 0x9e3779b1) >>> 0;
  const step = Math.max(0, rotation | 0);
  return ((hash >>> 8) + step) % ARENAS.length;
}

export function arenaForSeed(seed, rotation = 0) {
  return ARENAS[arenaIndexForSeed(seed, rotation)];
}

export function vibrate(pattern) {
  navigator.vibrate?.(pattern);
}

export function createBuoyVisual(THREE, color = 0xff5b36) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.5, 0.74, 12), new THREE.MeshStandardMaterial({ color, roughness: 0.56 }));
  base.position.y = 0.28;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.095, 0.78, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62 }));
  stem.position.y = 0.98;
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffed75 }));
  light.position.y = 1.43;
  group.add(base, stem, light);
  return group;
}
