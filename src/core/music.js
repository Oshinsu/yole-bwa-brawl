// Directeur musical : une boucle par phase de jeu, plus trois stings courts.
//
// ⚠️ STREAMING, PAS DÉCODAGE. Les huit pistes pèsent 12 Mo en MP3 ; décodées en
// AudioBuffer elles feraient environ 130 Mo de PCM en mémoire (44,1 kHz stéréo
// float32 × 8 min cumulées). On passe donc par des HTMLAudioElement branchés au
// graphe via MediaElementAudioSourceNode : le navigateur streame, la mémoire
// reste plate, et le fondu enchaîné se fait sur des GainNode comme pour le reste.
//
// Tout est OPTIONNEL : fichier absent, réseau coupé, décodeur MP3 indisponible —
// le jeu continue sans musique et sans lever. C'est la même règle que pour les
// modèles GLB et les échantillons sonores.

const CHEMIN = "./zik/";

// ─── AFFECTATION DES PISTES ──────────────────────────────────────────────────
//
// Elle vient de la MESURE (`npm run zik:analyse`), pas des titres — et la mesure
// en contredit deux :
//
//   • « Coconut Cannon Rush » a un centroïde spectral de 1134 Hz et 80 BPM :
//     c'est la piste la PLUS SOMBRE et la plus lente du lot, malgré son nom. Elle
//     est aussi la plus longue (2 min 12), donc celle qui se répète le moins.
//     D'où le menu, et pas la course.
//   • « Midnight Canoe » tourne à 139 BPM avec un centroïde de 5173 Hz : elle est
//     vive et brillante, pas nocturne. D'où le sting de victoire.
//
// Les cinq boucles sont ensuite ordonnées par intensité mesurée croissante et
// posées sur les phases dans le même ordre.
export const PISTES = Object.freeze({
  // Boucles — [fichier, gain, intensité mesurée, durée]
  menu: { fichier: "Coconut Cannon Rush.mp3", gain: 0.42, boucle: true },
  course: { fichier: "Canoe Combat.mp3", gain: 0.34, boucle: true },
  tour: { fichier: "Canot de Guerre.mp3", gain: 0.34, boucle: true },
  duel: { fichier: "Turquoise Turbo.mp3", gain: 0.36, boucle: true },
  grain: { fichier: "Carnival Apocalypse.mp3", gain: 0.40, boucle: true },
  // Stings — joués par-dessus, la boucle est atténuée le temps du passage.
  depart: { fichier: "An Nou Ay.mp3", gain: 0.62, boucle: false },
  victoire: { fichier: "Midnight Canoe.mp3", gain: 0.62, boucle: false },
  defaite: { fichier: "Oops, You Lost!.mp3", gain: 0.62, boucle: false }
});

const FONDU = 1.1;        // secondes de fondu enchaîné entre deux boucles
// Ce qu'il reste de la boucle pendant un sting.
//
// ⚠️ 0,28 mesuré trop bas : le sting de départ dure 12,6 s, donc la boucle de
// course restait à 0,095 de gain pendant douze secondes de jeu — inaudible. À
// 0,55 le sting passe devant sans effacer le fond.
const ATTENUATION = 0.55;

export class MusicDirector {
  constructor(engine) {
    this.engine = engine;
    this.bus = null;
    this.pistes = new Map();
    this.scene = null;
    this.sting = null;
    this.disponible = typeof Audio === "function";
    this.volume = 1;
  }

  /** Branche le bus musique sous le master, une seule fois. */
  attach() {
    const context = this.engine?.context;
    if (!context || this.bus || !this.disponible) return Boolean(this.bus);
    this.bus = context.createGain();
    this.bus.gain.value = this.volume;
    this.bus.connect(this.engine.master ?? context.destination);
    return true;
  }

  /**
   * Prépare une piste à la demande.
   *
   * ⚠️ Rien n'est chargé au démarrage : ouvrir le menu ne doit pas déclencher
   * 12 Mo de téléchargement. Chaque piste n'est instanciée qu'au moment où une
   * phase la réclame, et `preload="none"` laisse le navigateur décider.
   */
  piste(nom) {
    if (!this.attach()) return null;
    if (this.pistes.has(nom)) return this.pistes.get(nom);
    const definition = PISTES[nom];
    if (!definition) return null;
    let entree = null;
    try {
      const element = new Audio(CHEMIN + encodeURIComponent(definition.fichier));
      element.loop = Boolean(definition.boucle);
      element.preload = "none";
      element.crossOrigin = "anonymous";
      // Une erreur de chargement ne doit jamais remonter : la piste est
      // simplement marquée morte et la phase se joue en silence.
      element.addEventListener("error", () => { entree.morte = true; }, { once: true });
      const source = this.engine.context.createMediaElementSource(element);
      const gain = this.engine.context.createGain();
      gain.gain.value = 0;
      source.connect(gain).connect(this.bus);
      entree = { element, gain, definition, morte: false };
    } catch {
      // Navigateur sans décodeur MP3, contexte indisponible : on abandonne
      // cette piste sans casser les autres.
      entree = { element: null, gain: null, definition, morte: true };
    }
    this.pistes.set(nom, entree);
    return entree;
  }

  rampe(entree, cible, secondes) {
    if (!entree?.gain) return;
    const now = this.engine.context.currentTime;
    entree.gain.gain.cancelScheduledValues(now);
    entree.gain.gain.setValueAtTime(entree.gain.gain.value, now);
    entree.gain.gain.linearRampToValueAtTime(cible, now + secondes);
  }

  /** Fond enchaîné vers la boucle d'une phase. Idempotent. */
  setScene(nom) {
    if (this.scene === nom) return;
    const sortante = this.scene ? this.pistes.get(this.scene) : null;
    this.scene = nom;
    if (sortante && !sortante.morte) {
      this.rampe(sortante, 0, FONDU);
      // On arrête APRÈS le fondu, sinon la coupure s'entend.
      //
      // ⚠️ La condition testait `this.scene !== nom`, or `this.scene` VENAIT
      // d'être mis à `nom` : elle était donc toujours fausse et la pause n'avait
      // jamais lieu. Mesuré : trois flux MP3 tournaient en parallèle à gain 0,
      // consommant bande passante et décodage pour rien. On compare désormais à
      // la piste réellement courante au moment où le minuteur se déclenche.
      setTimeout(() => {
        const courante = this.scene ? this.pistes.get(this.scene) : null;
        if (courante !== sortante) sortante.element?.pause?.();
      }, FONDU * 1000 + 60);
    }
    const entrante = nom ? this.piste(nom) : null;
    if (!entrante || entrante.morte || !entrante.element) return;
    const cible = entrante.definition.gain * (this.sting ? ATTENUATION : 1);
    entrante.element.play?.().catch(() => { entrante.morte = true; });
    this.rampe(entrante, cible, FONDU);
  }

  /**
   * Joue un sting par-dessus la boucle, qui est atténuée le temps du passage.
   *
   * La durée est lue sur l'élément quand elle est connue ; sinon on retombe sur
   * `secondesParDefaut`, parce qu'un `durationchange` peut ne jamais arriver si
   * le fichier manque.
   */
  jouerSting(nom, secondesParDefaut = 13) {
    const entree = this.piste(nom);
    if (!entree || entree.morte || !entree.element) return false;
    // Un sting en chasse un autre : sans ça, une victoire déclenchée pendant le
    // sting de départ superposait deux voix à plein gain.
    if (this.sting && this.sting !== nom) {
      const precedent = this.pistes.get(this.sting);
      if (precedent?.element) {
        this.rampe(precedent, 0, 0.25);
        // On coupe APRÈS le fondu de 0,25 s ; si ce sting est redevenu le sting
        // courant entre-temps, on le laisse tranquille.
        setTimeout(() => {
          if (this.pistes.get(this.sting) !== precedent) precedent.element.pause?.();
        }, 300);
      }
    }
    const boucle = this.scene ? this.pistes.get(this.scene) : null;
    if (boucle && !boucle.morte) this.rampe(boucle, boucle.definition.gain * ATTENUATION, 0.35);
    this.sting = nom;
    entree.element.currentTime = 0;
    entree.element.play?.().catch(() => { entree.morte = true; });
    this.rampe(entree, entree.definition.gain, 0.2);
    const duree = Number.isFinite(entree.element.duration) && entree.element.duration > 0
      ? entree.element.duration
      : secondesParDefaut;
    clearTimeout(this.stingTimer);
    this.stingTimer = setTimeout(() => {
      this.sting = null;
      const active = this.scene ? this.pistes.get(this.scene) : null;
      if (active && !active.morte) this.rampe(active, active.definition.gain, 0.9);
    }, duree * 1000);
    return true;
  }

  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.bus) this.bus.gain.value = this.volume;
  }

  stop() {
    clearTimeout(this.stingTimer);
    this.sting = null;
    this.scene = null;
    for (const entree of this.pistes.values()) {
      if (!entree.element) continue;
      this.rampe(entree, 0, 0.25);
      entree.element.pause?.();
    }
  }
}
