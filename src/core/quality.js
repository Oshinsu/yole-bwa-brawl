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

export class QualityManager {
  constructor(onApply, initialTier = 2) {
    this.onApply = onApply;
    this.tier = initialTier;
    this.manual = false;
    this.frameAverage = 16.7;
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

  update(dtMs) {
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
    this.cooldown = Math.max(0, this.cooldown - dtMs / 1000);
    if (this.manual || this.cooldown > 0) return;

    if (this.frameAverage > 20.5) {
      this.highTimer += dtMs / 1000;
      this.lowTimer = 0;
    } else if (this.frameAverage < 13.2) {
      this.lowTimer += dtMs / 1000;
      this.highTimer = 0;
    } else {
      this.highTimer = Math.max(0, this.highTimer - dtMs / 2000);
      this.lowTimer = Math.max(0, this.lowTimer - dtMs / 2000);
    }

    if (this.highTimer > 3.2 && this.tier > 0) {
      this.tier--;
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
