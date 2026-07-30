import { clamp } from "./math.js";

// Secondes pendant lesquelles on refuse de juger la machine après le démarrage.
// 2,5 s couvre la compilation paresseuse mesurée sans retarder l'adaptation
// réelle : le premier abaissement de palier demande de toute façon 3,2 s de
// lenteur soutenue APRÈS ce délai.
const WARMUP_SECONDS = 2.5;
// Plafond d'un échantillon d'image, en ms. 100 ms = 10 images/seconde : bien
// en dessous de tout seuil de décision, donc un pic reste « lent » sans écraser
// la moyenne.
const FRAME_SAMPLE_CAP = 100;

// Coût de TRAVAIL, en ms, sous lequel on considère qu'il reste de la marge.
//
// ⚠️ POURQUOI PAS L'INTERVALLE ENTRE IMAGES. L'ancien seuil de remontée était
// `frameAverage < 13.2`. Derrière une vsync à 60 Hz, l'intervalle vaut 16,7 ms
// quoi qu'il arrive — même sur une machine qui n'utilise que 3 ms des 16,7.
// Le seuil était donc INATTEIGNABLE : le palier ne remontait JAMAIS, sur aucun
// appareil. Tant qu'on démarrait en HQ ça ne se voyait pas ; en démarrant en
// LQ sur mobile, ça aurait enfermé les bons téléphones en qualité basse pour
// toujours. On mesure donc le temps passé DANS `frame()`, pas entre deux.
const WORK_HEADROOM_MS = 8.5;

/** Le palier de départ, déduit de l'appareil.
 *
 * ⚠️ ON PART BAS ET ON MONTE, ET C'EST LE POINT. L'ancien code démarrait en HQ
 * pour tout le monde (`}, 2)` en dur) et laissait l'adaptation redescendre.
 * Les deux sens ne se valent pas : monter est indolore — le joueur gagne du
 * détail sur un jeu déjà fluide — tandis que descendre veut dire qu'on lui a
 * d'abord fait subir plusieurs dizaines de secondes de saccades. Mesuré sur ce
 * jeu, HQ coûte 3,3× LQ ; commencer haut sur un téléphone, c'est garantir la
 * mauvaise première minute à tous ceux qui n'ont pas la machine pour.
 *
 * `pointer: coarse` est le bon signal, et pas `maxTouchPoints` : un portable à
 * écran tactile a les deux, mais il a aussi un vrai GPU.
 */
export function palierInitial(memorise = null) {
  if (Number.isInteger(memorise) && memorise >= 0 && memorise <= 2) return memorise;
  try {
    if (globalThis.matchMedia?.("(pointer: coarse)")?.matches) return 0;
  } catch { /* environnement sans matchMedia : on retombe sur le défaut */ }
  return 2;
}

export class QualityManager {
  constructor(onApply, initialTier = 2) {
    this.onApply = onApply;
    this.tier = initialTier;
    this.manual = false;
    this.frameAverage = 16.7;
    // Moyenne du temps de TRAVAIL par image, distincte de l'intervalle : c'est
    // elle qui dit s'il reste de la marge pour remonter d'un palier.
    this.workAverage = 16.7;
    this.highTimer = 0;
    this.lowTimer = 0;
    this.cooldown = 0;
    // ⚠️ PÉRIODE DE GRÂCE. Les premières secondes sont dominées par la
    // compilation des shaders : mesuré, 47 programmes se compilent après le
    // départ, chacun bloquant le fil principal. Juger la machine là-dessus
    // enclenchait une boucle de rétroaction — images lentes, donc palier
    // rétrogradé ; or LQ met `shadows:false`, et basculer `shadowMap.enabled`
    // est une constante de COMPILATION dans three.js : les 244 matériaux
    // recompilent d'un coup, donc encore plus lent. Le joueur finissait en
    // qualité basse sur une machine parfaitement capable, à cause d'un
    // transitoire de démarrage.
    // `?noqualitywarmup` retire la grâce : bras témoin du harnais A/B.
    this.warmup = (typeof location !== "undefined"
      && new URLSearchParams(location.search).has("noqualitywarmup")) ? 0 : WARMUP_SECONDS;
    this.apply();
  }

  profiles() {
    const dpr = Math.max(1, globalThis.devicePixelRatio || 1);
    return [
      // `bloom` à 0 ne fait pas que couper le halo : la chaîne de bloom (trois
      // passes en demi puis quart de résolution) est alors sautée entièrement.
      // `streak` est la traînée anamorphique du soleil, quatre prises de plus.
      { label: "LQ", pixelRatio: Math.min(0.78, dpr), particles: 0.32, shadows: false, postFX: true, bloom: 0, streak: 0, ropeIterations: 2, samples: 0 },
      { label: "MQ", pixelRatio: Math.min(1.0, dpr), particles: 0.66, shadows: true, postFX: true, bloom: 0.22, streak: 0.18, ropeIterations: 4, samples: 2 },
      { label: "HQ", pixelRatio: Math.min(1.35, dpr), particles: 1.0, shadows: true, postFX: true, bloom: 0.52, streak: 0.34, ropeIterations: 6, samples: 4 }
    ];
  }

  apply() {
    this.onApply(this.profiles()[this.tier], this.tier);
  }

  /** Redonne la période de grâce : chaque départ a son propre transitoire. */
  resetWarmup(secondes = WARMUP_SECONDS) {
    this.warmup = secondes;
    this.highTimer = 0;
    this.lowTimer = 0;
  }

  setTier(tier, manual = true) {
    this.tier = clamp(tier | 0, 0, 2);
    this.manual = Boolean(manual);
    this.highTimer = 0;
    this.lowTimer = 0;
    this.apply();
    return this.tier;
  }

  cycleManual() {
    return this.setTier((this.tier + 2) % 3, true);
  }

  setAutomatic() {
    this.manual = false;
    this.highTimer = 0;
    this.lowTimer = 0;
    return this.tier;
  }

  /** @param dtMs   intervalle réel entre deux images — décide de la DESCENTE.
   *  @param workMs temps passé dans `frame()` — décide de la MONTÉE.
   *
   * ⚠️ LES MINUTEURS DOIVENT AVANCER EN TEMPS RÉEL. L'appelant passait
   * `Math.min(0.1, …) * 1000`, le dt déjà plafonné pour la simulation. Les
   * lignes ci-dessous décrémentent warmup et cooldown avec ce dt : sur un
   * appareil qui rend à 200 ms/image, les minuteurs de qualité avançaient donc
   * DEUX FOIS moins vite que l'horloge, et les 17 s théoriques avant d'atteindre
   * LQ en devenaient 34. L'inversion était complète — plus la machine souffrait,
   * plus les secours tardaient. Le plafond utile, celui qui protège la moyenne
   * d'un pic isolé, est `FRAME_SAMPLE_CAP` et il est appliqué ici, au bon
   * endroit.
   */
  update(dtMs, workMs = dtMs) {
    if (this.warmup > 0) {
      this.warmup -= dtMs / 1000;
      // On ne se contente pas d'ignorer la décision : on n'alimente MÊME PAS la
      // moyenne. Sinon le transitoire y reste des dizaines de secondes, avec un
      // lissage à 0,035.
      return;
    }
    // ⚠️ On plafonne l'échantillon. Un blocage isolé de 2 s n'est pas le signe
    // d'une machine qui rend à 0,5 image/seconde — c'est un pic ponctuel. Sans
    // ce plafond, une seule secousse pèse autant que soixante images normales
    // et fait chuter le palier à elle seule.
    this.frameAverage += (Math.min(dtMs, FRAME_SAMPLE_CAP) - this.frameAverage) * 0.035;
    this.workAverage += (Math.min(workMs, FRAME_SAMPLE_CAP) - this.workAverage) * 0.035;
    this.cooldown = Math.max(0, this.cooldown - dtMs / 1000);
    if (this.manual || this.cooldown > 0) return;

    if (this.frameAverage > 20.5) {
      this.highTimer += dtMs / 1000;
      this.lowTimer = 0;
    } else if (this.workAverage < WORK_HEADROOM_MS && this.frameAverage < 20.5) {
      this.lowTimer += dtMs / 1000;
      this.highTimer = 0;
    } else {
      this.highTimer = Math.max(0, this.highTimer - dtMs / 2000);
      this.lowTimer = Math.max(0, this.lowTimer - dtMs / 2000);
    }

    if (this.highTimer > 3.2 && this.tier > 0) {
      // ⚠️ DEUX CRANS D'UN COUP QUAND LA MESURE LES JUSTIFIE. Descendre un cran
      // à la fois imposait un cooldown de 8 s puis 3,2 s de plus pour refaire
      // la preuve, alors qu'à 30 images/seconde ou moins la machine a déjà
      // répondu. C'est ce trajet en escalier qui coûtait le plus de secondes.
      this.tier = this.frameAverage > 33 ? 0 : this.tier - 1;
      this.highTimer = 0;
      this.cooldown = 8;
      this.apply();
    } else if (this.lowTimer > 10 && this.tier < 2) {
      this.tier++;
      this.lowTimer = 0;
      this.cooldown = 12;
      this.apply();
    }
  }
}
