// Bibliothèque d'actions courtes pour l'équipage — la couche que
// `CREW_AUTHENTICITY_AUDIT.md` réclame en priorité moyenne :
//
//   « produire cinq actions courtes (rappel_idle, charge, traversee, ecoute,
//     barre) puis les MÉLANGER FAIBLEMENT SOUS les contacts procéduraux. »
//
// ⚠️ CE QUE CE MODULE N'EST PAS : un lecteur d'animation.
//
// `CREW_ANIMATION_ENGINE.md` pose la règle : « Le jeu pilote le squelette, il
// ne joue pas d'animation. » Elle tient toujours, et pour une bonne raison — la
// pose d'un yoleur est DÉTERMINÉE par la gîte et la position du bwa, que la
// simulation calcule. Un clip qui écraserait cette pose se battrait contre la
// physique et l'équipage se décrocherait de la mer.
//
// Ce que le clip apporte est ailleurs : la TEXTURE HUMAINE. Un corps réel n'est
// jamais parfaitement immobile — micro-transferts de poids, respiration, décalage
// d'appui. C'est invisible dans une simulation et ça se voit tout de suite quand
// ça manque.
//
// D'où la composition :
//
//   repos --(mélange faible)--> pose de clip --(× procédural)--> IK
//
// À poids 0, le comportement est BIT POUR BIT celui d'avant ce module. Le clip
// ne remplace jamais la pose de jeu : il déplace seulement la pose de REPOS
// au-dessus de laquelle la simulation continue de tout piloter.
//
// Origine des clips : indifférente. Mocap vidéo, animation à la main, capture
// de référence — le contrat est le même. Voir docs/CREW_ANIMATION_ENGINE.md.

// Multiplie q par une petite rotation d'axe unitaire, sans dépendre de Three.
// Écrit dans un tableau de 4 pour rester compatible avec le format de pose.
function appliqueOffset([x, y, z, w], [ax, ay, az], angle) {
  const demi = angle * 0.5;
  const s = Math.sin(demi);
  const bx = ax * s;
  const by = ay * s;
  const bz = az * s;
  const bw = Math.cos(demi);
  return [
    w * bx + x * bw + y * bz - z * by,
    w * by - x * bz + y * bw + z * bx,
    w * bz + x * by - y * bx + z * bw,
    w * bw - x * bx - y * by - z * bz
  ];
}

/**
 * Donne vie à UNE pose fixe : respiration et report de poids.
 *
 * ⚠️ C'EST LA PIÈCE QUI REND LES PHOTOS SUFFISANTES.
 * Une pose posée à la main contre une photo de référence est immobile, et un
 * corps immobile se lit immédiatement comme un mannequin. Trois clés — repos,
 * inspiration, repos — suffisent à retirer cette lecture, pour des amplitudes
 * de l'ordre du degré.
 *
 * Les amplitudes sont VOLONTAIREMENT minuscules : combinées au plafond de
 * mélange de 0,35, une rotation de 0,03 rad arrive à l'écran comme 1,7°× 0,35,
 * soit à peine plus d'un demi-degré. C'est l'échelle du vivant, pas du geste.
 *
 * @param {object} pose     { LeftArm: [x,y,z,w], … } — la pose de référence
 * @param {object} souffle  { bone: { axis: [x,y,z], angle } } — par os
 * @param {number} periode  durée du cycle, en secondes
 */
export function breatheKeyframes(pose, souffle = {}, periode = 3.4) {
  if (!pose || typeof pose !== "object") return [];
  const duree = Number.isFinite(periode) && periode > MINIMUM_DUREE ? periode : 3.4;
  const decale = {};
  for (const [os, valeur] of Object.entries(pose)) {
    if (!Array.isArray(valeur) || valeur.length !== 4) continue;
    const reglage = souffle[os];
    decale[os] = reglage && Array.isArray(reglage.axis) && Number.isFinite(reglage.angle)
      ? appliqueOffset(valeur, reglage.axis, reglage.angle)
      : valeur.slice();
  }
  // Repos → inspiration → repos : la boucle se referme exactement, sinon un
  // saut apparaît à chaque cycle et c'est pire que l'immobilité.
  return [
    { time: 0, bones: pose },
    { time: duree * 0.5, bones: decale },
    { time: duree, bones: pose }
  ];
}

// Respiration de repli, fabriquée en code — aucun asset requis.
//
// ⚠️ POURQUOI UN DÉFAUT PLUTÔT QUE RIEN.
// La couche de mélange était livrée mais dormante : sans clip, un équipage
// reste rigoureusement immobile entre deux gestes de simulation, et six corps
// parfaitement figés se lisent comme des mannequins — même à treize pixels,
// c'est ce qui distingue « des hommes » de « des décalcomanies ».
//
// Ce clip ne prétend rien représenter d'authentique : c'est une respiration et
// un report de poids, les deux mouvements qu'un corps vivant ne peut pas ne pas
// faire. Il tient sa place tant que les cinq vraies actions n'existent pas, et
// il s'efface dès qu'un GLB en apporte une du même nom.
//
// Amplitudes en centièmes de radian : combinées au plafond de 0,35, elles
// arrivent à l'écran sous le demi-degré. On cherche le vivant, pas le geste.
const RESPIRATION = Object.freeze({
  Spine: { axis: [1, 0, 0], angle: 0.030 },
  Spine01: { axis: [1, 0, 0], angle: 0.022 },
  Spine02: { axis: [1, 0, 0], angle: 0.016 },
  Neck: { axis: [1, 0, 0], angle: -0.020 },
  Head: { axis: [0, 1, 0], angle: 0.026 },
  LeftArm: { axis: [0, 0, 1], angle: 0.021 },
  RightArm: { axis: [0, 0, 1], angle: -0.021 },
  LeftForeArm: { axis: [0, 0, 1], angle: 0.014 },
  RightForeArm: { axis: [0, 0, 1], angle: -0.014 }
});

const IDENTITE = Object.freeze([0, 0, 0, 1]);

/**
 * Clip de respiration par défaut, pour les noms d'os du contrat d'équipage.
 *
 * La pose de base est l'IDENTITÉ, pas une posture : le clip est un OFFSET
 * appliqué au repos du rig, quel qu'il soit. Il fonctionne donc aussi bien sur
 * le gabarit procédural que sur un Mixamo, sans rien connaître de leur bind.
 */
export function makeDefaultIdleClip(name = "rappel_idle", periode = 3.4) {
  const pose = {};
  for (const os of Object.keys(RESPIRATION)) pose[os] = IDENTITE;
  // `relative` : ces quaternions sont des OFFSETS autour de l'identité, pas des
  // poses absolues. Sans ce drapeau le consommateur slerperait le repos vers
  // l'identité et la « respiration » vaudrait seize pour cent du bind.
  return CrewClipLibrary.fromKeyframes(
    name,
    breatheKeyframes(pose, RESPIRATION, periode),
    { relative: true }
  );
}

// Un clip d'une seule frame n'est pas une animation, c'est une pose. Le GLB
// d'équipage en porte justement un (`Armature|clip0|baselayer`), signalé par
// l'audit Blender. On le refuse explicitement pour qu'il ne devienne pas une
// « animation » figée qui écraserait le repos sans jamais bouger.
const MINIMUM_KEYS = 2;
const MINIMUM_DUREE = 1e-3;

// Les cinq poses macro livrées par le rig Blender. Elles décrivent la station
// occupée sur le bwa ; le procédural conserve les réactions courtes à la houle.
export const CREW_POSE_CLIPS = Object.freeze([
  "pont_interieur",
  "cale_court",
  "demi_sorti",
  "extension_extreme",
  "compression_transition"
]);

// Les actions historiques restent des replis valides pour les anciens GLB.
export const CREW_LEGACY_CLIPS = Object.freeze([
  "rappel_idle",
  "charge",
  "traversee",
  "ecoute",
  "barre"
]);

export const CREW_CLIPS = Object.freeze([
  ...CREW_POSE_CLIPS,
  ...CREW_LEGACY_CLIPS
]);

// `GLTFLoader` assainit les noms de nœuds — un `arm.L` exporté depuis Blender
// arrive en `armL`. Les pistes d'animation portent le nom assaini, donc on
// normalise des deux côtés plutôt que de supposer l'un ou l'autre.
export function normalizeTrackTarget(name) {
  if (typeof name !== "string") return "";
  const point = name.lastIndexOf(".");
  const cible = point > 0 ? name.slice(0, point) : name;
  return cible.replace(/[^\w]/g, "");
}

// ⚠️ UNE PISTE glTF N'A PAS TOUJOURS QUATRE FLOTTANTS PAR CLÉ.
//
// En CUBICSPLINE, la spec range TROIS quaternions par clé — tangente entrante,
// VALEUR, tangente sortante — et `GLTFLoader` laisse ce tampon tel quel dans
// `track.values` : il ne remplace que la fabrique d'interpolant. Lire
// `values[k * 4]` ramène donc une tangente, et les tangentes d'une pose exportée
// depuis Blender valent (0, 0, 0, 0).
//
// ⚠️ MESURÉ LE 4 AOÛT 2026 SUR LE GLB LIVRÉ, ET CE N'ÉTAIT PAS BÉNIN.
// Les cinq poses macro sont exportées en CUBICSPLINE. Aux bornes de la boucle
// (`t <= times[0]`, `t >= times[dernier]`) `sample` rendait le quaternion NUL.
// `Quaternion.slerp` le propage SANS renormaliser — il n'y a pas de division
// par la norme dans ce chemin — et un quaternion de norme n arrive au bout de
// `Matrix4.compose` comme une ÉCHELLE de n². Chaque corps s'effondrait à ~16 %
// de sa taille pendant 1,4 % de son cycle, en boucle et à contretemps d'un
// homme à l'autre. À l'intérieur du cycle le défaut se voyait moins : la
// normalisation manuelle de `sample` ramenait par chance la bonne valeur.
//
// On DÉDUIT donc le pas du tampon au lieu de le supposer.
function trackStride(track) {
  const cles = track?.times?.length ?? 0;
  if (cles < MINIMUM_KEYS) return 0;
  const pas = track.values.length / cles;
  return pas === 4 || pas === 12 ? pas : 0;
}

// Écrit une clé dans `out`, sauf si elle est dégénérée. Le seuil est large :
// on ne cherche pas à valider une normalisation, seulement à ne jamais laisser
// passer un quaternion dont la norme se transformerait en échelle d'os.
function ecritCle(values, base, out) {
  const x = values[base];
  const y = values[base + 1];
  const z = values[base + 2];
  const w = values[base + 3];
  if (!(x * x + y * y + z * z + w * w > 0.25)) return false;
  out.set(x, y, z, w);
  return true;
}

function isQuaternionTrack(track) {
  return typeof track?.name === "string"
    && track.name.endsWith(".quaternion")
    && track.values?.length >= 8
    && trackStride(track) > 0;
}

/**
 * Indexe les pistes de rotation d'un jeu de clips, par action puis par os.
 *
 * On ne garde QUE les quaternions : la position et l'échelle d'un os
 * déplaceraient le corps hors du bwa, or c'est la simulation qui décide où le
 * corps se trouve. Seule l'orientation est négociable.
 */
export class CrewClipLibrary {
  constructor(clips = []) {
    this.actions = new Map();
    this.rejected = [];
    for (const clip of clips) {
      const nom = typeof clip?.name === "string" ? clip.name : "";
      const duree = Number.isFinite(clip?.duration) ? clip.duration : 0;
      const pistes = Array.isArray(clip?.tracks) ? clip.tracks.filter(isQuaternionTrack) : [];
      if (duree < MINIMUM_DUREE || !pistes.length) {
        this.rejected.push({ name: nom, duration: duree, reason: duree < MINIMUM_DUREE ? "pose figée" : "aucune piste de rotation" });
        continue;
      }
      const os = new Map();
      // Le pas et le décalage de valeur sont résolus UNE FOIS, à l'indexation :
      // `sample` tourne par os et par corps à chaque frame et n'a pas à
      // redécouvrir la disposition du tampon.
      for (const piste of pistes) {
        const pas = trackStride(piste);
        os.set(normalizeTrackTarget(piste.name), {
          times: piste.times,
          values: piste.values,
          pas,
          decalage: pas === 12 ? 4 : 0
        });
      }
      this.actions.set(this.constructor.canonical(nom), {
        name: nom,
        duration: duree,
        bones: os,
        // ⚠️ DEUX SÉMANTIQUES COEXISTENT, ET LES CONFONDRE COÛTE CHER.
        //
        // Un clip glTF porte la rotation ABSOLUE du nœud : il REMPLACE le repos,
        // c'est la spec. Un clip fabriqué en code (respiration) porte un OFFSET
        // à composer AVEC le repos.
        //
        // Mesuré le 2 août 2026 : traiter la respiration comme absolue faisait
        // slerper le repos vers l'identité. Réglée pour 0,3°, elle produisait
        // jusqu'à 15,7° — seize pour cent de toute la rotation de bind, à chaque
        // os. Le consommateur DOIT lire ce drapeau.
        relative: Boolean(clip?.relative)
      });
    }
  }

  // Blender exporte volontiers `Armature|rappel_idle|baselayer` ou
  // `ArmatureAction.001`. On retient le segment qui correspond à une action
  // attendue, sinon le nom entier — ainsi un export propre marche sans
  // renommage, et un export bavard aussi.
  static canonical(name) {
    if (typeof name !== "string") return "";
    const segments = name.split(/[|/]/).map((s) => s.trim()).filter(Boolean);
    for (const segment of segments) {
      if (CREW_CLIPS.includes(segment)) return segment;
    }
    return segments.length ? segments[segments.length - 1] : name;
  }

  has(action) {
    return this.actions.has(action);
  }

  /** Première action disponible, sans créer de tableau ni d'itérateur interne. */
  firstAvailable(candidates) {
    if (!candidates) return null;
    for (let index = 0; index < candidates.length; index++) {
      const action = candidates[index];
      if (this.actions.has(action)) return action;
    }
    return null;
  }

  /** Le clip est-il un OFFSET à composer avec le repos, ou une pose absolue ? */
  isRelative(action) {
    return Boolean(this.actions.get(action)?.relative);
  }

  get size() {
    return this.actions.size;
  }

  duration(action) {
    return this.actions.get(action)?.duration ?? 0;
  }

  /**
   * Échantillonne la rotation d'un os à l'instant `time`, en slerp linéaire
   * entre les deux clés encadrantes.
   *
   * ⚠️ Écrit dans `out` et ne retourne rien d'autre : cette fonction est
   * appelée par équipier et par os à chaque frame. Elle ne doit rien allouer.
   * Retourne `true` si une valeur a été écrite, `false` si l'os n'est pas
   * animé — auquel cas l'appelant garde sa pose de repos.
   */
  sample(action, boneName, time, out) {
    const entree = this.actions.get(action);
    if (!entree || !out) return false;
    const piste = entree.bones.get(boneName);
    if (!piste) return false;

    const times = piste.times;
    const values = piste.values;
    const pas = piste.pas;
    const decalage = piste.decalage;
    const dernier = times.length - 1;
    // Les actions bouclent : un rappel n'a pas de fin.
    const duree = entree.duration || times[dernier] || 1;
    let t = time % duree;
    if (t < 0) t += duree;

    // Les deux bornes rendent une clé BRUTE, sans passer par la normalisation
    // du chemin interpolé. Un quaternion dégénéré y arriverait donc intact
    // jusqu'à l'os, où il se lirait comme une échelle — le défaut mesuré le
    // 4 août. On refuse plutôt de répondre : l'os garde son repos, ce qui est
    // le comportement déjà prévu pour un os non animé.
    if (t <= times[0]) {
      return ecritCle(values, decalage, out);
    }
    if (t >= times[dernier]) {
      return ecritCle(values, dernier * pas + decalage, out);
    }

    // Recherche dichotomique : une action de 2 s à 30 fps porte 60 clés, et on
    // échantillonne 18 os × 32 corps par frame. Le balayage linéaire coûtait
    // 34 560 comparaisons par frame dans le pire cas.
    let bas = 0;
    let haut = dernier;
    while (haut - bas > 1) {
      const milieu = (bas + haut) >> 1;
      if (times[milieu] <= t) bas = milieu;
      else haut = milieu;
    }
    const span = times[haut] - times[bas];
    const alpha = span > 1e-9 ? (t - times[bas]) / span : 0;
    const a = bas * pas + decalage;
    const b = haut * pas + decalage;

    // ⚠️ SLERP ÉCRIT À LA MAIN, ET CE N'EST PAS UNE RÉINVENTION GRATUITE.
    // `THREE.Quaternion.slerp(qb, t)` lit les champs PRIVÉS de sa cible
    // (`qb._w`…), donc lui passer un littéral `{x, y, z, w}` rend un NaN
    // silencieux — la première version de ce module s'y est fait prendre.
    // Construire un vrai Quaternion par appel allouerait 18 os × 32 corps par
    // frame. Le calcul direct règle les deux, et rend ce fichier indépendant de
    // Three : il n'attend plus de `out` qu'une méthode `set`.
    let bx = values[b];
    let by = values[b + 1];
    let bz = values[b + 2];
    let bw = values[b + 3];
    const ax = values[a];
    const ay = values[a + 1];
    const az = values[a + 2];
    const aw = values[a + 3];

    let cos = ax * bx + ay * by + az * bz + aw * bw;
    // Deux quaternions opposés décrivent la même rotation : sans ce retournement
    // l'interpolation prend le chemin long et le membre part à l'envers.
    if (cos < 0) {
      cos = -cos;
      bx = -bx; by = -by; bz = -bz; bw = -bw;
    }

    let s0 = 1 - alpha;
    let s1 = alpha;
    if (cos < 0.9995) {
      const theta = Math.acos(cos);
      const sinTheta = Math.sin(theta);
      if (sinTheta > 1e-6) {
        s0 = Math.sin(s0 * theta) / sinTheta;
        s1 = Math.sin(s1 * theta) / sinTheta;
      }
    }

    let x = ax * s0 + bx * s1;
    let y = ay * s0 + by * s1;
    let z = az * s0 + bz * s1;
    let w = aw * s0 + bw * s1;
    const longueur = Math.hypot(x, y, z, w);
    if (longueur > 1e-9) {
      x /= longueur; y /= longueur; z /= longueur; w /= longueur;
    } else {
      x = 0; y = 0; z = 0; w = 1;
    }
    out.set(x, y, z, w);
    return true;
  }

  /**
   * Construit une action à partir de POSES CLÉS, sans mocap ni vidéo.
   *
   * ⚠️ POURQUOI CETTE PORTE D'ENTRÉE EXISTE.
   * Les cinq « actions » attendues sont en réalité cinq ÉTATS, et la simulation
   * pilote déjà les transitions entre eux. Avec un plafond de mélange à 0,35, le
   * clip n'apporte pas la pose — il apporte la VIE. Ce qu'il faut par état, ce
   * n'est donc pas une captation : c'est une pose juste, plus un souffle.
   *
   * Une pose se pose à la main dans Blender contre une photo de référence, en
   * vingt minutes, sans droit à l'image de personne et sans matériel. Pour ce
   * projet, c'est plus rapide, plus contrôlable et juridiquement plus propre
   * qu'une chaîne de capture — voir docs/CREW_CLIP_LIBRARY.md.
   *
   * @param {string} name        nom de l'action (`rappel_idle`, `charge`, …)
   * @param {Array}  keyframes   [{ time, bones: { LeftArm: [x,y,z,w], … } }]
   * @returns {object|null}      clip au format consommé par CrewClipLibrary
   */
  static fromKeyframes(name, keyframes, { relative = false } = {}) {
    if (!Array.isArray(keyframes) || keyframes.length < MINIMUM_KEYS) return null;
    const ordonnees = [...keyframes]
      .filter((k) => k && Number.isFinite(k.time) && k.bones)
      .sort((a, b) => a.time - b.time);
    if (ordonnees.length < MINIMUM_KEYS) return null;

    const duree = ordonnees[ordonnees.length - 1].time - ordonnees[0].time;
    if (duree < MINIMUM_DUREE) return null;

    // Un os n'est retenu que s'il est présent dans TOUTES les clés : une piste
    // trouée produirait un saut à l'interpolation, et un os absent garde de
    // toute façon sa pose de repos — ce qui est le comportement voulu.
    const communs = [...Object.keys(ordonnees[0].bones)].filter(
      (os) => ordonnees.every((k) => Array.isArray(k.bones[os]) && k.bones[os].length === 4)
    );
    if (!communs.length) return null;

    const times = new Float32Array(ordonnees.map((k) => k.time - ordonnees[0].time));
    const tracks = communs.map((os) => {
      const values = new Float32Array(ordonnees.length * 4);
      for (let i = 0; i < ordonnees.length; i++) {
        const q = ordonnees[i].bones[os];
        values.set(q, i * 4);
      }
      return { name: `${os}.quaternion`, times, values };
    });
    return { name, duration: duree, tracks, relative };
  }

  /** Diagnostic : ce qui a été retenu, et ce qui a été refusé et pourquoi. */
  report() {
    return {
      retenues: [...this.actions.keys()],
      manquantes: CREW_CLIPS.filter((a) => !this.actions.has(a)),
      refusees: this.rejected
    };
  }
}
