import { clamp, damp, smoothstep, stepDampedSpring } from "../core/math.js";
import {
  HANDLING_MOTION,
  prefersReducedMotion,
  sampleHandlingMotion
} from "./handling-motion.js?v=swell-v2";
import {
  AssetLibrary,
  CREW_JOINTS,
  CREW_OPTIONAL_JOINTS
} from "./assets.js?v=crew-v2";
import {
  CrewClipLibrary,
  makeDefaultIdleClip,
  normalizeTrackTarget
} from "./crew-clips.js";
import {
  CREW_KITS,
  GUNWALE_ACCENTS,
  HULL_PAINTS,
  RIG_VISUAL_PROFILES,
  WOOD_FINISHES,
  normalizeCustomization
} from "../game/customization.js";

// Hauteur canonique d'un yoleur avant la petite variation de gabarit. L'ancienne
// cible de 1,18 m, encore réduite par une racine à 0,88, fabriquait des corps de
// 0,91 à 1,12 m : ils lisaient comme des figurines sur une coque de onze mètres.
// Le rig reste identique ; seule sa normalisation de présentation change.
export const CREW_TARGET_HEIGHT = 1.70;
export const CREW_ROOT_SCALE = 0.98;
export const CREW_PROCEDURAL_REFERENCE_HEIGHT = 1.18;

export function crewPresentationScale(fromRig, build = 1) {
  const fallbackCompensation = fromRig
    ? 1
    : CREW_TARGET_HEIGHT / CREW_PROCEDURAL_REFERENCE_HEIGHT;
  return CREW_ROOT_SCALE
    * fallbackCompensation
    * (Number.isFinite(build) ? build : 1);
}

// Un contact déclaré « ferme » doit être lisible comme tel en gros plan. Les
// anciennes validations acceptaient 0,72 m, soit presque la longueur d'un bras.
// Ces limites sont des contrats de rendu, pas des tolérances de collision.
export const CREW_CONTACT_LIMITS = Object.freeze({
  firm: 0.10,
  soft: 0.18
});

// La coque livrée et son fallback ont les mêmes bornes (11,10 × 2,16 m).
// La longueur est juste, mais la largeur donnait une silhouette de canot depuis
// la caméra de jeu. On affine UNIQUEMENT le mesh et ses habillages : la coque
// de collision, l'inertie et toute la simulation restent inchangées.
//
// ⚠️ CE FACTEUR VIT ICI ET PAS DANS LE MESH — c'est un piège pour l'artiste.
// Ouvert dans Blender, `yole_hull.glb` a un ratio de 5,14 : une silhouette de
// canot. C'est à l'écran seulement qu'il vaut 6,12. Quelqu'un qui « corrige »
// la largeur dans le GLB verra le runtime la rétrécir une SECONDE fois — ratio
// 7,3, une aiguille. Le seul garde-fou possible est un test, parce que le
// format glTF ne peut pas porter cette information : `npm run test:hull` refuse
// toute coque dont la demi-largeur n'est pas 1,08 m.
//
// ⚠️ CONSÉQUENCE NON RÉSOLUE. La physique flotte sur ses propres stations
// (`HULL_STATIONS`, src/sim/yole-physics.js), à x = ±1,08 au maître-bau. Une
// fois ce facteur appliqué, le bord visible est à 0,900 : les points de
// flottabilité tombent jusqu'à 18 cm HORS de la coque qu'on voit. Corriger
// demanderait de bouger une station, ce qui est AUTORITAIRE (SIMULATION_VERSION,
// replays). Mesuré et borné par test/hull-contract.test.mjs, pas corrigé.
// Voir docs/ASSET_CONTRACT.md.
const HULL_VISUAL_WIDTH_SCALE = 0.84;

// Déport latéral au-delà duquel un équipier est considéré totalement sorti sur
// le bois.
// Il couvre le seul poste extrême ; les profils courts gardent naturellement
// une pose plus tassée même lorsque la gîte est forte.
const CREW_HIKE_SPAN = 3.0;

// ─── POSE DE RAPPEL — d'après photo de course ────────────────────────────────
//
// ⚠️ Le défaut corrigé ici était GÉOMÉTRIQUE, pas esthétique.
//
// Les bois sont des cylindres tournés de 90° sur Z : leur axe est X, ils
// sortent perpendiculairement à la coque. Les équipiers, eux, gardaient un
// lacet de ZÉRO — ils regardaient vers la proue. Un homme assis face à +Z sur
// un bois qui court de gauche à droite n'est à cheval sur rien : il flottait
// en travers de la perche, et c'est ce qui faisait qu'il ne semblait pas
// attaché au bateau.
//
// Sur les photos du Tour, le corps est ALIGNÉ SUR LE BOIS, tête vers le large,
// jambes repliées vers la coque. Le bassin est le point d'appui, le buste
// bascule au-dessus de l'eau et les jambes remontent de l'autre côté : une
// balance, pas un passager assis.
//
// Le lacet ne va pas jusqu'à 90° : à pleine sortie on garde ~78°, ce qui laisse
// lire l'épaule et le maillot au lieu d'une silhouette de profil pur.
const CREW_HIKE_YAW = 1.36;
// Bascule du buste au-dessus de l'eau. L'ancienne valeur (0,62 rad appliquée à
// la racine) tenait l'homme presque droit ; la photo montre un renversement
// franc, tête plus basse que le bassin sur les hommes du bout.
//
// ⚠️ RAMENÉ À 1,62 LE 4 AOÛT 2026, SUR PHOTOS DE COURSE FOURNIES.
//
// Cette valeur avait été reculée à 1,30 parce qu'à 1,62 « les hommes passaient
// à l'horizontale et lisaient comme des plongeurs en vol ». Les photos du Tour
// montrent EXACTEMENT ça : au rappel plein le corps est horizontal, tête plus
// basse que le bassin, jambes repliées vers la coque. Le défaut de l'époque
// n'était donc pas le renversement mais ce qui l'accompagnait — bras traînant
// derrière et assise illisible, deux points corrigés depuis (`bindSplay`,
// contacts IK sur le bwa).
//
// ⚠️ ET CE N'EST PLUS LE LEVIER PRINCIPAL. Depuis que l'assise et la station
// tiennent l'essentiel de l'autorité, `syncRig` ne laisse au procédural que
// 41 % de son amplitude. Le renversement se joue donc surtout dans les seeds de
// `tools/build_crew_asset.py` (`Hips`), et cette constante ne fait plus que
// l'accompagner. Mesure de contrôle : `tools/mesure_silhouette_equipage.mjs`.
const CREW_HIKE_RECLINE = 1.62;
// Ouverture des cuisses de part et d'autre du bois. C'est ce qui fait lire
// « à califourchon » plutôt que « posé dessus ».
const CREW_STRADDLE = 0.34;
// Repli des jambes vers la coque. Sur une balance, le contrepoids d'un côté
// implique le repli de l'autre — sans ça, le buste part au large et les jambes
// suivent, ce qui n'accroche plus rien.
const CREW_LEG_HOOK = 0.62;
// Les mains vont chercher le bois EN ARRIÈRE du bassin. C'est le seul point de
// contact visible autre que l'assise, et c'est lui qui dit « accroché ».
// ⚠️ Cette valeur est comptée APRÈS annulation du renversement du bassin : il
// faut donc d'abord repayer le `recline` (~1,1 rad à pleine sortie) avant que le
// bras ne parte réellement vers l'arrière. Une valeur de 0,86 laissait les mains
// pendre à la verticale — visuellement, l'homme ne tenait rien.
const CREW_GRIP_REACH = 2.05;
// Variation de posture d'un homme à l'autre. Un équipage n'est pas six copies
// du même geste : ±12 % sur le renversement suffit à casser l'effet clone.
// Gorgée de rhum : retard entre deux hommes, et durée d'une gorgée.
const CREW_DRINK_STAGGER = 0.16;
const CREW_DRINK_SIP = 0.85;
const CREW_POSTURE = [1.0, 0.88, 1.12, 0.94, 1.06, 0.9];

// Poids de la respiration de repos, mélangée SOUS la pose procédurale.
// Volontairement bas : le plafond dur de `setClipBlend` est à 0,35, et on n'en
// prend même pas la moitié. Un corps vivant bouge de presque rien — au-delà,
// l'équipage se met à suivre le clip au lieu de suivre la mer.
const CREW_IDLE_BLEND = 0.16;

// Hauteur du bassin au-dessus de la racine, pour le corps PROCEDURAL.
// Le rig GLB, lui, la fait mesurer par `measureHipHeight` : il est
// normalise en hauteur et son bassin tombe ~12 cm plus bas.
const CREW_PROCEDURAL_HIP_HEIGHT = 0.38;

// Position en z des sept bois dressés. L'équipage en DÉRIVE (CREW_BEAMS) au
// lieu de porter sa propre table : sinon les deux dérivent l'une de l'autre, ce
// qui était le cas — aucun équipier n'était aligné sur un bois, l'écart allait
// de 0,15 à 0,50 m.
// Longueurs raccourcies d'environ 28 % : combinées au débord d'un seul bord,
// les anciennes perches portaient à 6,6 m du centre, très au-delà de ce que
// montrent les photos de course.
// ⚠️ RACCOURCIES UNE SECONDE FOIS LE 2 AOÛT 2026, SUR CAPTURE DE JEU RÉELLE.
//
// Mesuré : les perches dépassaient de **2,52 m en moyenne au-delà du dernier
// homme**, jusqu'à 3,47 m. Comme l'équipage ne sort qu'à 3,9 m, plus de la
// moitié de chaque bwa ne portait personne. À la distance de jeu — la seule qui
// compte pour le joueur — la yole lisait comme un RÂTEAU : des tiges nues qui
// dépassaient de partout, avec quelques points dessus.
//
// C'est un défaut que ni les mesures d'angle ni les gros plans du harnais ne
// pouvaient révéler : il n'apparaît qu'au cadrage du jeu, où le détail de pose
// est invisible et où seule compte la silhouette d'ensemble.
//
// Le plancher est verrouillé par `crew-seating` : `porteeAuVentMin > 4.40`,
// c'est-à-dire `longueur - BEAM_INBOARD_REACH > 4,40`, donc jamais moins de
// 5,16 m. On s'en approche sans y toucher, et on garde l'éventail.
// ⚠️ BOTTELÉS LE 2 AOÛT 2026, D'APRÈS IMAGES VIDÉO DE COURSE.
//
// C'ÉTAIT LE DÉFAUT PRINCIPAL, et ni les photos fixes ni les mesures d'angle ne
// l'avaient montré. Les sept bois étaient espacés d'environ **1 m**, étalés sur
// 5,9 m de coque. Sur les images de course, les perches sont serrées à **40 à
// 60 cm** et forment presque une plateforme continue.
//
// Conséquence directe : c'est ce vide entre les perches qui faisait lire la
// yole comme un RÂTEAU à la distance de jeu, avec des équipiers isolés comme
// des perles sur des rails. Sur la vidéo les hommes se touchent parce que
// LEURS PERCHES se touchent — la densité de l'équipage est une conséquence de
// la densité du gréement, pas un réglage de position.
//
// Espacement ramené à ~0,60 m, envergure de 5,9 m à 3,6 m. Les longueurs ne
// changent pas : le plancher `porteeAuVentMin > 4.40` reste tenu.
const BEAM_LAYOUT = [[-1.85, 5.4], [-1.22, 5.7], [-0.60, 5.9], [0.0, 6.0], [0.58, 5.8], [1.18, 5.6], [1.80, 5.3]];

// Quel bois porte quel équipier. Le septième reste libre.
//
// ⚠️ LE COMMENTAIRE QUI TENAIT ICI ÉTAIT FAUX, PAS LA TABLE.
// Il disait « z<0 est la proue » — d'après `yole-physics.js`, qui l'annonçait
// aussi et se trompait. La yole avance vers +z (démonstration en tête de
// `HULL_STATIONS`), donc le bois libre en 6 est à la PROUE, pas à la poupe, et
// le patron ne travaille pas là.
//
// La table, elle, reste juste et n'est pas décalée pour autant : le patron est
// désormais en z=−4,18, à 2,3 m du bois le plus proche, donc il a sa place sans
// qu'on déplace six hommes. Les longueurs de perche ne sont d'ailleurs pas
// interchangeables — réattribuer les bois faisait dépasser un équipier de
// 0,98 m au-delà du sien pendant une traversée (`crew-seating`).
const CREW_BEAMS = [0, 1, 2, 3, 4, 5];

// Six postes, mais seulement trois familles visuelles. Une bordée crédible
// forme une grappe autour du plat-bord : elle ne place pas six silhouettes
// identiques au bout de six perches.
//
// À charge installée, la distribution est volontairement :
//   1 intérieur · 2 courts · 2 intermédiaires · 1 extension.
// `deployStart/deployFull` échelonne leur sortie sans hasard et garde les
// replays visuellement déterministes.
export const CREW_STAGING_PROFILES = Object.freeze([
  Object.freeze({ family: "ancrage", station: "court", reach: 1.10, deployStart: 0.00, deployFull: 0.62 }),
  Object.freeze({ family: "levier", station: "intermediaire", reach: 1.72, deployStart: 0.12, deployFull: 0.86 }),
  Object.freeze({ family: "extension", station: "extreme", reach: 2.75, deployStart: 0.52, deployFull: 1.00 }),
  Object.freeze({ family: "ancrage", station: "interieur", reach: 0.58, deployStart: 0.00, deployFull: 0.48 }),
  Object.freeze({ family: "levier", station: "intermediaire", reach: 1.90, deployStart: 0.18, deployFull: 0.90 }),
  Object.freeze({ family: "ancrage", station: "court", reach: 1.28, deployStart: 0.04, deployFull: 0.68 })
]);

export const CREW_STAGING_FAMILIES = Object.freeze(["ancrage", "levier", "extension"]);

// Les noms correspondent exactement aux actions exportées par Blender. La
// station reste l'autorité : elle décrit où le corps travaille sur le bwa,
// tandis que la couche procédurale conserve houle, impacts et contre-gîte.
export const CREW_STATION_POSES = Object.freeze({
  interieur: "pont_interieur",
  court: "cale_court",
  intermediaire: "demi_sorti",
  extreme: "extension_extreme"
});

export function crewPoseForStation(station) {
  return CREW_STATION_POSES[station] ?? null;
}

// Poids de l'assise, tenu en permanence sous la station. Il est HAUT et pas
// « faible comme un clip » : ce n'est pas une texture de vie mélangée sous la
// simulation, c'est la pose du corps quand il est encore dans le bateau. Sans
// elle, ce moment-là n'avait aucune pose du tout.
export const CREW_SEAT_POSE_WEIGHT = 0.74;

// Autorité de la station à pleine sortie. Elle recouvre l'assise plutôt que le
// bind, donc elle peut monter plus haut qu'avant sans écraser la simulation :
// ce qu'elle remplace est déjà une pose posée à la main, pas un repos neutre.
export const CREW_STATION_POSE_WEIGHT = 0.82;

/** Pose tenue tant que l'homme n'est pas sorti au rappel. */
export function selectCrewSeatAction(library) {
  const action = CREW_STATION_POSES.interieur;
  return library?.has(action) ? action : null;
}

export function selectCrewPoseAction(library, role, station) {
  if (!library) return null;
  const action = role === "patron" || role === "ecoute"
    ? CREW_STATION_POSES.interieur
    : crewPoseForStation(station);
  return action && library.has(action) ? action : null;
}

export function selectCrewTransitionAction(library, sideChanging, compression) {
  if (!library || compression <= 0.015) return null;
  if (library.has("compression_transition")) return "compression_transition";
  if (sideChanging && library.has("traversee")) return "traversee";
  return library.has("charge") ? "charge" : null;
}

export const CREW_CONTACT_BOTH_FEET = 0;
export const CREW_CONTACT_LEAD_FOOT = 1;

// À l'extension maximale, une jambe s'accroche et l'autre équilibre la
// silhouette. Pendant la compression de traversée, le pied directeur reste
// seul verrouillé afin que l'autre puisse réellement changer d'appui.
// ⚠️ SEUIL D'OVERLAY RELEVÉ DE 0,05 À 0,35 LE 4 AOÛT 2026 — C'EST LUI QUI
// DÉCROCHAIT L'ÉQUIPAGE.
//
// Libérer un pied n'a de sens que pour l'homme en extension maximale, ou pour
// celui qui change réellement d'appui. Mais `compression` vaut
// `max(transferCrouch, brace × 0,58, catchLoad × 0,72)` : sous charge tenue, à
// gîte installée, la seule reprise d'appui suffisait à le porter au-dessus de
// 0,05. Mesuré dans le jeu à 30° de gîte, sans le moindre changement de bord :
// les SIX équipiers en `overlayWeight` 0,155 à 0,167, donc les six en mode
// pied directeur seul — chacun avec une jambe pendante dans le vide, entre
// 0,53 et 0,66 m du bois.
//
// C'est ce que le joueur lit comme « ils sont détachés des bois » : le bassin
// est pourtant posé au millimètre et la main directrice agrippe à 3 cm. Six
// jambes qui pendent suffisent à défaire les deux.
//
// Une VRAIE traversée pousse `transferCrouch` vers 1, donc l'overlay vers 0,68 :
// le seuil de 0,35 la laisse passer intacte et ferme la porte au reste.
const CREW_TRANSFER_FOOT_RELEASE = 0.35;

export function crewContactMode(poseAction, overlayAction, overlayWeight = 0, poseWeight = 1) {
  return (poseAction === "extension_extreme" && poseWeight > 0.05)
    || (overlayAction === "compression_transition" && overlayWeight > CREW_TRANSFER_FOOT_RELEASE)
    ? CREW_CONTACT_LEAD_FOOT
    : CREW_CONTACT_BOTH_FEET;
}

const CREW_FAMILY_POSE = Object.freeze({
  ancrage: Object.freeze({ yaw: 0.78, recline: 0.72, hook: 1.08, grip: 0.88 }),
  levier: Object.freeze({ yaw: 0.96, recline: 0.94, hook: 1.00, grip: 1.00 }),
  extension: Object.freeze({ yaw: 1.04, recline: 1.10, hook: 0.78, grip: 1.08 })
});

export function crewDeploymentForRoll(roll) {
  const heel = Math.abs(Number.isFinite(roll) ? roll : 0);
  // 2° : encore à bord. 6° : sortie partielle. 12° : charge complète.
  return smoothstep(0.035, 0.21, heel);
}

export function crewProfileDeployment(profile, deployment) {
  if (!profile) return 0;
  return smoothstep(
    profile.deployStart,
    profile.deployFull,
    clamp(Number.isFinite(deployment) ? deployment : 0, 0, 1)
  );
}

// Un changement de bord n'est pas un interrupteur. Le premier dresseur engage
// le nouveau rappel, le dernier garde l'ancien appui un peu plus longtemps.
// Ces délais ne touchent qu'au dessin : la physique reste entièrement dans
// YoleDynamics et les checksums de replay ne dépendent pas du framerate.
// Amplitude du ballant de sortie, en mètres. Volontairement petite : c'est un
// ajustement d'appui contre la risée, pas un va-et-vient. À 5,5 cm sur une
// perche qui porte à près de 4 m, ça se lit comme de la vie et jamais comme un
// homme qui glisse. La marge au bout du bois est de 1,34 m — il n'y a aucun
// risque de sortir de la perche, et `crew-seating` le vérifie.
const CREW_REACH_BREATH = 0.055;

// Cote d'attente d'un équipier non déployé, mesurée depuis l'axe du bateau.
// Le plat-bord est à ~0,90 m au maître-bau (demi-largeur de coque × l'affinage
// de rendu) : 0,86 pose l'homme SUR le bord, fesses au plat-bord et jambes
// dans la coque, sans déborder. C'est la position d'attente d'une bordée qui
// n'est pas encore sortie — pas une position de rappel.
const CREW_GUNWALE_REST = 0.86;

const CREW_SIDE_DELAYS = [0, 0.07, 0.14, 0.22, 0.32, 0.50];
const CREW_SIDE_TRAVEL = 0.46;
export const CREW_ROLES = Object.freeze([
  "premier", "corde", "dresseur", "ecopeur", "dresseur", "dernier"
]);
export const CREW_SPECIALIST_ROLES = Object.freeze(["ecoute", "patron"]);
// ⚠️ LES DEUX POSTES ÉTAIENT DU MAUVAIS CÔTÉ, POUR LA MÊME RAISON.
//
// Avec +z pour proue, l'ancien patron en z=+4,18 gouvernait DEPUIS L'AVANT — un
// homme debout à l'étrave, une pagaie de 3,55 m dont la pale sortait de la
// coque, et rien à faire là. Il gouverne désormais depuis la poupe, où sa
// pagaie a un bras de levier.
//
// L'écoute suivait : il tenait la corde de la voile 22 cm DEVANT le mât
// (`this.mast.position.z = 0.5`). On borde une écoute derrière le mât, sinon la
// corde traverse le gréement.
const CREW_SPECIALISTS = Object.freeze([
  Object.freeze({ role: "ecoute", x: -0.34, z: -0.28 }),
  Object.freeze({ role: "patron", x: 0.42, z: -4.18 })
]);

const motionPulse = (value, enterStart, enterEnd, leaveStart, leaveEnd) =>
  smoothstep(enterStart, enterEnd, value) * (1 - smoothstep(leaveStart, leaveEnd, value));

// Un bwa traverse la coque mais ne doit pas former une seconde aile côté sous
// le vent. On garde seulement cette longueur depuis l'axe jusqu'à son ancrage
// intérieur ; tout le reste de la perche porte l'équipage au vent. Calculer le
// décalage depuis la longueur propre à chaque bwa évite qu'un bois court et un
// bois long aient des débords opposés incohérents.
const BEAM_INBOARD_REACH = 0.76;

// Où la main du patron prend le manche, compté depuis le centre du cylindre.
// Le manche fait 3,55 m, donc sa poignée est à 1,775 m : la main tombe ainsi à
// une trentaine de centimètres du bout, ce qui laisse voir le pommeau.
const PADDLE_GRIP_DROP = 1.45;

// Longueur du brin d'écoute au repos. La distance réelle point d'amure ↔ poing
// varie avec la pose du manœuvrier, donc `sheetLine.scale.y` la corrige à
// chaque frame ; cette constante n'est plus que l'unité de cette échelle.
const SHEET_LINE_LENGTH = 2.45;

// Hauteur des bois dressés, reprise de leur construction (beamRoot.position.y).
// C'est la cote d'assise de l'équipage : les deux DOIVENT rester d'accord.
// Exportée pour le harnais silhouette, qui verrouille le contact bassin ↔ bois.
export const CREW_BEAM_Y = 0.25;

// Descente du bassin pour qu'il repose SUR le bois au lieu de flotter au-dessus
// (mesuré : 0,324 m d'écart au repos). Réservé au rig importé — le corps
// procédural a d'autres proportions et garde sa pose.
const CREW_SEAT_Y = -0.055;

// Retard de l'effort d'un équipier au suivant, de la proue vers la poupe. Il
// valait 1,13 rad, soit un déphasage de 65° : chacun battait la mesure dans son
// coin. Un équipage de yole travaille à l'unisson, avec juste ce qu'il faut de
// décalage pour que le geste se lise comme une vague.
const CREW_LAG = 0.17;

// Gabarits d'équipiers. La variation reste lisible sans ramener certains corps
// à une taille enfantine.
// Teintes de peau de l'équipage — partagées avec les noyés, pour que l'homme
// qui tombe soit le même que celui qui était à bord.
export const CREW_SKINS = [0x5d3328, 0x78442f, 0x955b3e, 0xb87852, 0x6c3a2c, 0x8b4e36];
const CREW_BUILD = [1.0, 0.96, 1.04, 0.98, 1.02, 0.95];

// Trois coiffes partagées par les six équipiers d'une yole. Casquette claire,
// foulard, et locks — la variante sombre et haute qui déborde du crâne.
export function makeHeadKits(THREE) {
  if (!THREE.SphereGeometry || !THREE.MeshStandardMaterial) return null;
  const dome = new THREE.SphereGeometry(0.115, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.52);
  const mop = new THREE.SphereGeometry(0.125, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.78);
  return [
    { geometry: dome, material: new THREE.MeshStandardMaterial({ color: 0xf2f7f0, roughness: 0.62 }), lift: 0, scale: { x: 1, y: 1, z: 1 } },
    { geometry: dome, material: new THREE.MeshStandardMaterial({ color: 0xffc531, roughness: 0.58 }), lift: -0.01, scale: { x: 1.04, y: 0.72, z: 1.04 } },
    { geometry: mop, material: new THREE.MeshStandardMaterial({ color: 0x241a14, roughness: 0.86 }), lift: -0.03, scale: { x: 1.12, y: 1.25, z: 1.12 } }
  ];
}

// Rake des mâts vers l'avant, en radians (~9°).
const MAST_RAKE = 0.155;

function makeHullGeometry(THREE) {
  const z = [-5.55, -4.7, -3.2, -1.5, 0, 1.7, 3.35, 4.72, 5.55];
  const width = [0.05, 0.48, 0.82, 1.0, 1.08, 1.0, 0.78, 0.42, 0.04];
  const positions = [];
  const indices = [];
  for (let index = 0; index < z.length; index++) {
    const keel = -0.62 + Math.abs(z[index]) * 0.028;
    positions.push(-width[index], 0.04, z[index]);
    positions.push(width[index], 0.04, z[index]);
    positions.push(0, keel, z[index]);
  }
  for (let index = 0; index < z.length - 1; index++) {
    const a = index * 3;
    const b = (index + 1) * 3;
    indices.push(a, b, a + 2, b, b + 2, a + 2);
    indices.push(a + 1, a + 2, b + 1, b + 1, a + 2, b + 2);
    indices.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// ─── VOILE ────────────────────────────────────────────────────────────────────
//
// C'est la plus grande surface de la yole à l'écran, et c'était un rectangle
// plat : tout le galbe venait de la déformation runtime, d'où une lecture de
// bâche plutôt que de voile sous le vent. Trois formes de repos sont désormais
// cuites dans la géométrie, aucune ne coûte un sommet de plus.
//
// ⚠️ ON NE TOUCHE NI AU NOMBRE DE SOMMETS, NI À LA TOPOLOGIE. `updateSail`
// réécrit ce maillage à chaque frame pour quatre yoles ; grossir la grille se
// paierait en CPU tous les frames, pas une fois au chargement. La densité
// supplémentaire au point de bordure vient d'une RÉPARTITION non uniforme des
// rangs, pas de rangs en plus.

// Creux de repos, au maître-couple. Volontairement modeste : `updateSail` ajoute
// par-dessus un ventre piloté par le vent (0,14 à 0,42 m). Cumulés sur une
// bordure de 3,65 m, on reste sous 15 % de creux — au-delà, une voile lit
// comme un sac.
const SAIL_CAMBER = 0.12;
// Rond de guindant : le bord d'attaque n'est pas une droite tendue, il bombe.
const SAIL_LUFF_ROUND = 0.16;
// Roach : la chute déborde de la ligne têtière→bordure. C'est ce qui donne sa
// silhouette pleine à la grand-voile du Tour.
const SAIL_ROACH = 0.22;
// Concentration des rangs vers la bordure. La voile fait 3,65 m au point de
// bordure contre 1,31 m à la têtière : la densité de texels varie d'un facteur
// 2,78 en hauteur, et une grille uniforme gaspille des rangs en haut là où il
// en manque en bas. Exposant > 1 => les rangs se resserrent vers v = 0.
const SAIL_FOOT_BIAS = 1.35;

export function makeSailGeometry(THREE, columns = 8, rows = 12) {
  const positions = [];
  const uvs = [];
  const indices = [];
  // Coordonnées paramétriques réelles, mémorisées pour `updateSail` : avec des
  // rangs non uniformes, `row / rows` ne vaut plus `v` et le ventre de vent se
  // poserait à la mauvaise hauteur.
  const paramV = new Float32Array(rows + 1);
  const paramU = new Float32Array(columns + 1);
  for (let column = 0; column <= columns; column++) paramU[column] = column / columns;

  for (let row = 0; row <= rows; row++) {
    const v = Math.pow(row / rows, SAIL_FOOT_BIAS);
    paramV[row] = v;
    const y = 0.48 + v * 5.55;
    // Bombé du guindant et de la chute : nuls aux deux extrémités, maximaux à
    // mi-hauteur, donc la têtière et le point d'amure restent où le gréement
    // les tient.
    const arc = Math.sin(Math.PI * v);
    const width = 3.65 * (1 - v * 0.64) + SAIL_ROACH * Math.pow(arc, 0.8);
    const luff = 0.55 - SAIL_LUFF_ROUND * arc;
    // Le creux s'efface vers la têtière, comme sur une voile réellement coupée.
    const camberHeight = 1 - v * 0.35;
    for (let column = 0; column <= columns; column++) {
      const u = paramU[column];
      // Creux maximal à 40 % de la corde : l'exposant décale le sinus vers
      // l'avant au lieu de le centrer bêtement à 50 %. Il vaut ln(0,5)/ln(0,40),
      // ce qui place le sommet exactement là — un 0,85 posé à vue le laissait à
      // 44,6 %, donc à 50 % une fois échantillonné sur neuf colonnes.
      const camber = Math.sin(Math.PI * Math.pow(u, 0.7565)) * SAIL_CAMBER * camberHeight;
      positions.push(0.055 + camber, y, luff - u * width);
      uvs.push(u, v);
    }
  }
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const a = row * (columns + 1) + column;
      const b = a + 1;
      const c = a + columns + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.userData.basePositions = new Float32Array(positions);
  geometry.userData.columns = columns;
  geometry.userData.rows = rows;
  geometry.userData.paramU = paramU;
  geometry.userData.paramV = paramV;
  return geometry;
}

function cylinderBetween(THREE, radius, length, material) {
  return new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.08, length, 7), material);
}

// Le rig d'équipage sort du générateur avec UNE seule texture couvrant peau ET
// tissu : teinter `material.color` repeindrait aussi la peau. Mesuré sur la
// texture livrée, les deux populations sont franchement bimodales — le tissu
// occupe 39 % des texels à chroma 0,0-0,1 (moyenne 228,223,216), la peau 60 % à
// chroma 0,7-0,8 (moyenne 111,48,36). On masque donc par chroma et luminance et
// on ne multiplie la couleur d'équipe que sur le tissu.
//
// Un matériau par yole, partagé par ses six équipiers : SkeletonUtils.clone()
// duplique la hiérarchie mais PARTAGE les matériaux, donc teinter sans cloner
// habillerait les 24 équipiers de la même couleur — c'est exactement le défaut
// qu'on corrige ici.
export function makeCrewMaterial(THREE, rig, color) {
  let source = null;
  rig.traverse((node) => { if (!source && node.material) source = node.material; });
  if (!source?.clone) return null;
  const material = source.clone();
  material.emissiveIntensity = 0;
  const teamTint = { value: new THREE.Color(color) };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTeam = teamTint;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
uniform vec3 uTeam;`)
      // Après map_fragment, diffuseColor porte la texture décodée en espace
      // LINÉAIRE : les seuils ci-dessous sont les valeurs mesurées converties,
      // pas celles lues dans le fichier sRGB.
      .replace("#include <map_fragment>", `#include <map_fragment>
        {
          float mx = max(max(diffuseColor.r, diffuseColor.g), diffuseColor.b);
          float mn = min(min(diffuseColor.r, diffuseColor.g), diffuseColor.b);
          float chroma = (mx - mn) / max(mx, 1e-4);
          float lum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          // smoothstep est indéfini quand edge0 >= edge1 : on inverse au lieu
          // de passer les bornes à l'envers.
          float cloth = (1.0 - smoothstep(0.14, 0.30, chroma)) * smoothstep(0.28, 0.50, lum);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uTeam, cloth);
        }`);
  };
  material.userData ??= {};
  // Le garage change cet uniforme plutôt que `material.color` : la texture du
  // rig contient aussi la peau, qui doit rester intacte.
  material.userData.yoleJerseyTint = teamTint;
  material.needsUpdate = true;
  return material;
}

// ⚠️ EXPORTÉ POUR LES NOYÉS. `CrewFallPool` construisait son propre mannequin
// (`createCrewDummy`) : torse et tête aux mauvaises proportions, quatre membres
// figés sans articulation, et aucune coiffe. Les hommes à l'eau n'étaient donc
// PAS les yoleurs du bateau — c'était visible et ça cassait l'illusion.
// Sans rig, ce constructeur bâtit exactement le corps procédural de bord.
export class CrewVisual {
  constructor(THREE, skinColor, jerseyColor, accentColor, phase, rig = null, crewMaterial = null, clipLibrary = null) {
    this.phase = phase;
    // Bibliothèque d'actions courtes, partagée par tout l'équipage d'une yole.
    // Absente ou vide => la pose de repos reste celle du GLB, et `syncRig` prend
    // exactement le chemin qu'il prenait avant l'existence de cette couche.
    // Voir src/render/crew-clips.js pour la règle de composition.
    this.clipLibrary = clipLibrary;
    this.clipAction = "rappel_idle";
    this.clipTime = 0;
    this.clipWeight = 0;
    this.clipScratch = THREE.Quaternion ? new THREE.Quaternion() : null;
    // Pose macro Blender + transition superposée. Tous les quaternions de
    // travail sont persistants : 18 os × 8 hommes × 60 fps ne doivent produire
    // aucune allocation dans la boucle de rendu.
    // ── TROIS COUCHES, PAS DEUX ────────────────────────────────────────────────
    //
    // assise (dans le bateau) → station (sorti au rappel) → traversée.
    //
    // ⚠️ POURQUOI L'ASSISE A DÛ EXISTER. Le poids de station valait
    // `0,78 × déploiement`, donc ZÉRO tant que la yole ne gîtait pas : plus
    // aucune pose macro, et le rig retombait sur son bind brut. C'est ce bind
    // que montrait tout le départ, depuis que l'équipage reste à bord tant
    // qu'il n'y a pas de gîte.
    //
    // Faire simplement basculer l'ACTION vers `pont_interieur` en dessous d'un
    // seuil aurait produit un saut : les poses macro sont distantes de 9 à 25°
    // (mesuré sur le GLB livré), et 25° d'un coup sur les bras se voient. Il
    // faut donc les deux en même temps, et un fondu entre elles — d'où une
    // couche de plus, l'emplacement de traversée restant pris par la
    // compression pendant les changements de bord.
    this.seatAction = null;
    this.seatTime = 0;
    this.seatWeight = 0;
    this.poseAction = null;
    this.poseTime = 0;
    this.poseWeight = 0;
    this.overlayAction = null;
    this.overlayTime = 0;
    this.overlayWeight = 0;
    this.seatScratch = THREE.Quaternion ? new THREE.Quaternion() : null;
    this.poseScratch = THREE.Quaternion ? new THREE.Quaternion() : null;
    this.overlayScratch = THREE.Quaternion ? new THREE.Quaternion() : null;
    this.poseBaseScratch = THREE.Quaternion ? new THREE.Quaternion() : null;
    this.proceduralScratch = THREE.Quaternion ? new THREE.Quaternion() : null;
    // Variation de posture, posée par le constructeur de YoleVisual. Défaut
    // neutre pour que la classe reste utilisable seule (tests, harnais).
    this.posture = 1;
    this.role = "dresseur";
    this.stagingFamily = "levier";
    this.stagingStation = "intermediaire";
    this.contactLead = 0;
    this.motionState = "rappel";
    this.contactError = 0;
    this.firmContactError = 0;
    this.softContactError = 0;
    this.root = new THREE.Group();
    this.root.userData.phase = phase;
    this.wasActive = true;
    this.fall = 0;
    this.fallSpin = phase * 0.37;
    this.fromRig = false;
    // Ouverture d'épaules déjà portée par le bind, mesurée par `bindRig`. Zéro
    // pour le corps procédural, dont les bras pendent à la verticale au repos.
    // Voir `measureBindSplay` : c'est la valeur qui fabriquait le T-pose.
    this.bindSplay = 0;
    this.jerseyMaterial = null;
    this.shortsMaterial = null;

    // Un rig GLB fournit la même hiérarchie sous d'autres noms : on lie les sept
    // articulations pilotées et update() ne change pas d'une ligne. Rig absent
    // ou incomplet => corps procédural, jamais un équipier à moitié animé.
    if (rig && this.bindRig(THREE, rig)) {
      if (crewMaterial) rig.traverse((node) => { if (node.material) node.material = crewMaterial; });
      this.jerseyMaterial = crewMaterial;
      this.root.add(rig);
      this.fromRig = true;
      return;
    }

    const skin = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.82 });
    const jersey = new THREE.MeshStandardMaterial({ color: jerseyColor, roughness: 0.66 });
    const shorts = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.78 });
    this.jerseyMaterial = jersey;
    this.shortsMaterial = shorts;

    this.hips = new THREE.Group();
    this.hips.position.y = 0.38;
    this.root.add(this.hips);

    this.torso = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.17, 0.46, 8), jersey);
    this.torso.position.y = 0.26;
    this.hips.add(this.torso);

    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.135, 10, 8), skin);
    this.head.position.y = 0.66;
    this.hips.add(this.head);

    this.leftArmPivot = new THREE.Group();
    this.rightArmPivot = new THREE.Group();
    this.leftArmPivot.position.set(-0.16, 0.48, 0);
    this.rightArmPivot.position.set(0.16, 0.48, 0);
    this.leftArm = cylinderBetween(THREE, 0.045, 0.38, skin);
    this.rightArm = cylinderBetween(THREE, 0.045, 0.38, skin);
    this.leftArm.position.y = -0.18;
    this.rightArm.position.y = -0.18;
    this.leftArmPivot.add(this.leftArm);
    this.rightArmPivot.add(this.rightArm);
    this.hips.add(this.leftArmPivot, this.rightArmPivot);

    this.leftLegPivot = new THREE.Group();
    this.rightLegPivot = new THREE.Group();
    this.leftLegPivot.position.set(-0.075, 0.05, 0);
    this.rightLegPivot.position.set(0.075, 0.05, 0);
    this.leftLeg = cylinderBetween(THREE, 0.052, 0.44, shorts);
    this.rightLeg = cylinderBetween(THREE, 0.052, 0.44, shorts);
    this.leftLeg.position.y = -0.2;
    this.rightLeg.position.y = -0.2;
    this.leftLegPivot.add(this.leftLeg);
    this.rightLegPivot.add(this.rightLeg);
    this.hips.add(this.leftLegPivot, this.rightLegPivot);
  }

  setKitColors(jerseyColor, shortsColor) {
    const tint = this.jerseyMaterial?.userData?.yoleJerseyTint?.value;
    if (tint?.setHex) tint.setHex(jerseyColor);
    else this.jerseyMaterial?.color?.setHex?.(jerseyColor);
    this.shortsMaterial?.color?.setHex?.(shortsColor);
  }

  // Toutes les articulations doivent répondre : un rig partiel serait pire que
  // pas de rig du tout (membres figés au milieu d'un corps animé).
  bindRig(THREE, rig) {
    const bound = {};
    for (const [logical, aliases] of Object.entries(CREW_JOINTS)) {
      const joint = AssetLibrary.findJoint(rig, aliases);
      if (!joint) return false;
      bound[logical] = joint;
    }
    const optional = {};
    for (const [logical, aliases] of Object.entries(CREW_OPTIONAL_JOINTS)) {
      const joint = AssetLibrary.findJoint(rig, aliases);
      if (joint) optional[logical] = joint;
    }
    // Le jeu ne pilote que des ROTATIONS : les proportions du rig source sont
    // donc libres. On normalise seulement la taille et on repose les pieds sur
    // le pont, ce qui rend acceptable un squelette Meshy ou Mixamo à 1,70 m.
    //
    const measured = this.measureRigHeight(THREE, rig);
    if (measured && measured.height > 1e-3) {
      const scale = CREW_TARGET_HEIGHT / measured.height;
      rig.scale.setScalar(scale);
      rig.position.y = -measured.min * scale;
    }

    // Un SkinnedMesh est culé sur une sphère englobante calculée en espace de
    // bind : posé sur une yole qui bouge et anime son squelette, il disparaît
    // par intermittence. Les équipiers sont minuscules et toujours collés à une
    // coque déjà visible — le culling individuel ne rapporte rien ici.
    rig.traverse((node) => {
      if (node.isSkinnedMesh || node.isMesh) node.frustumCulled = false;
      // L'audit Blender 5.2 révèle une Icosphere de 2 m, sans matériau, sans
      // skin et hors armature. Elle n'est ni un vêtement ni un accessoire : on
      // l'exclut du rendu sans réexport destructif du GLB.
      //
      // ⚠️ CE QU'ELLE EST VRAIMENT, vérifié dans Blender le 2 août 2026 : le
      // **widget d'affichage des os**. Les VINGT-QUATRE os du rig la portent en
      // `custom_shape` — d'où une boîte englobante d'armature de 15 m. Ce n'est
      // donc pas un mesh oublié dans la scène mais un artefact d'atelier, qui
      // n'a aucune raison d'exister dans un asset livré. Le masquage ci-dessous
      // reste juste ; le vrai correctif est de vider les `custom_shape` avant
      // export, ce qui supprimera aussi le nœud du GLB.
      if (node.name === "Icosphere" && node.isMesh && !node.isSkinnedMesh) {
        node.visible = false;
        node.userData.yoleHelperHidden = true;
      }
    });
    // update() écrit des rotations ABSOLUES : c'est l'héritage du corps
    // procédural, dont chaque pivot a l'identité pour repos. Un squelette réel
    // (Meshy, Mixamo) a des rotations de repos non identitaires — les écraser
    // détruit la pose de bind et le maillage s'effondre, invisible.
    //
    // On expose donc des proxys à update(), et syncRig() compose leur rotation
    // AVEC le repos de l'os. update() reste inchangé.
    // L'os réel de la tête, AVANT que la boucle suivante ne le remplace par son
    // proxy : c'est lui qui portera la calotte, un proxy n'étant pas dans le
    // graphe de scène.
    this.headBone = bound.head;
    this.rigRoot = rig;
    const actual = { ...bound, ...optional };
    this.rigJoints = [];
    const proxies = {};
    for (const [logical, joint] of Object.entries(actual)) {
      const proxy = new THREE.Object3D();
      // Le nom sert à retrouver la piste de rotation d'une action courte. On le
      // normalise comme les noms de pistes : `GLTFLoader` assainit les nœuds, et
      // supposer l'une ou l'autre graphie ferait rater la moitié des os.
      this.rigJoints.push({
        proxy,
        joint,
        rest: joint.quaternion.clone(),
        boneName: normalizeTrackTarget(joint.name)
      });
      proxies[logical] = proxy;
    }
    Object.assign(this, proxies);

    // Chaînes IK optionnelles. Le rig garde son contrat minimal à sept points,
    // mais un squelette Mixamo complet verrouille réellement mains et pieds sur
    // le bateau après la pose procédurale.
    this.ikChains = {
      leftArm: actual.leftHand && actual.leftForeArm
        ? { effector: actual.leftHand, joints: [actual.leftForeArm, actual.leftArmPivot], maxStep: 0.62, maxSwing: 1.35 }
        : null,
      rightArm: actual.rightHand && actual.rightForeArm
        ? { effector: actual.rightHand, joints: [actual.rightForeArm, actual.rightArmPivot], maxStep: 0.62, maxSwing: 1.35 }
        : null,
      leftLeg: actual.leftFoot && actual.leftLowerLeg
        ? { effector: actual.leftFoot, joints: [actual.leftLowerLeg, actual.leftLegPivot], maxStep: 0.90, maxSwing: 2.00 }
        : null,
      rightLeg: actual.rightFoot && actual.rightLowerLeg
        ? { effector: actual.rightFoot, joints: [actual.rightLowerLeg, actual.rightLegPivot], maxStep: 0.90, maxSwing: 2.00 }
        : null
    };
    for (const chain of Object.values(this.ikChains)) {
      if (chain) chain.pose = chain.joints.map(() => new THREE.Quaternion());
    }
    this.ikTargetLocal = new THREE.Vector3();
    this.ikTargetWorld = new THREE.Vector3();
    this.ikJointWorld = new THREE.Vector3();
    this.ikEffectorWorld = new THREE.Vector3();
    this.ikToEffector = new THREE.Vector3();
    this.ikToTarget = new THREE.Vector3();
    this.ikWorldDelta = new THREE.Quaternion();
    this.ikParentWorld = new THREE.Quaternion();
    this.ikParentInverse = new THREE.Quaternion();
    this.ikLocalDelta = new THREE.Quaternion();
    this.ikIdentity = new THREE.Quaternion();
    this.poleRootWorld = new THREE.Vector3();
    this.poleMidWorld = new THREE.Vector3();
    this.poleEndWorld = new THREE.Vector3();
    this.poleAxis = new THREE.Vector3();
    this.poleCurrent = new THREE.Vector3();
    this.poleDesired = new THREE.Vector3();
    this.poleCross = new THREE.Vector3();
    this.poleDelta = new THREE.Quaternion();
    this.captureRestPoles(THREE);
    this.measureBindSplay(THREE);
    this.measureHipHeight(THREE);
    return true;
  }

  // ── OUVERTURE D'ÉPAULES DU BIND ─────────────────────────────────────────────
  //
  // ⚠️ C'EST CE QUI FABRIQUAIT LE T-POSE, ET IL N'ÉTAIT PAS DANS L'ASSET.
  //
  // Les rotations `z` des pivots de bras décrivent une silhouette ABSOLUE :
  // `splay = 0,62` veut dire « bras ouverts de 35° ». Elles ont été calibrées
  // sur le corps procédural, dont les bras PENDENT À LA VERTICALE au repos.
  //
  // Le rig importé, lui, arrive déjà ouvert : 35,6° mesurés sur le bind de
  // `assets/models/yole_crew.glb` — un A-pose, pas un T-pose. Mais `syncRig`
  // compose `repos × proxy`, donc les deux ouvertures S'ADDITIONNENT.
  //
  // Mesuré le 4 août 2026 sur le GLB livré : 74,6° d'abduction et 1,47 m
  // d'envergure de mains pour 1,70 m de haut. C'est un T-pose, et c'était
  // l'état PAR DÉFAUT — au départ `crewDeploymentForRoll` rend zéro, donc
  // `poseWeight` vaut zéro et aucune pose macro ne venait le corriger.
  //
  // On défalque donc des consignes ce que le bind apporte déjà. MESURÉE plutôt
  // que constante, pour la même raison que les poles : un réexport qui repose
  // les bras autrement se corrige tout seul, sans valeur en dur à reprendre ici.
  measureBindSplay(THREE) {
    this.bindSplay = 0;
    const chain = this.ikChains?.leftArm ?? this.ikChains?.rightArm;
    if (!chain || !this.rigRoot?.updateWorldMatrix || !THREE?.Vector3) return;
    const epaule = chain.joints[chain.joints.length - 1];
    const coude = chain.joints[0];
    if (!epaule?.getWorldPosition || !coude?.getWorldPosition || !this.root?.worldToLocal) return;
    this.root.updateWorldMatrix(true, true);
    // Dans le repère du corps, pas dans celui du monde : la racine n'est pas
    // encore tournée à la construction, mais le dire évite de le supposer.
    const haut = this.root.worldToLocal(epaule.getWorldPosition(new THREE.Vector3()));
    const bas = this.root.worldToLocal(coude.getWorldPosition(new THREE.Vector3()));
    const lateral = Math.abs(bas.x - haut.x);
    const descente = haut.y - bas.y;
    if (!(lateral > 1e-4) || !(descente > 1e-4)) return;
    // Borné : un rig exotique ne doit pas pouvoir retourner les bras à
    // l'intérieur du torse. Au-delà d'un demi-droit, on renonce à corriger.
    this.bindSplay = clamp(Math.atan2(lateral, descente), 0, 0.9);
  }

  // Hauteur du bassin AU-DESSUS DE LA RACINE, mesurée sur le corps réellement
  // utilisé.
  //
  // Le fallback procédural place son bassin à 0,38 m, tandis que le rig source
  // 1,70 m le place vers 0,86 m. Réutiliser la constante du fallback ferait
  // flotter le rig au-dessus du bwa ; la cote vient donc de l'os réellement
  // chargé, avec une demi-hauteur humaine comme repli sûr.
  measureHipHeight(THREE) {
    this.hipHeight = CREW_TARGET_HEIGHT * 0.50;
    const hips = this.rigJoints?.find((entry) => entry.boneName === "Hips")?.joint;
    if (!hips?.getWorldPosition || !this.root?.worldToLocal || !THREE?.Vector3) return;
    this.root.updateWorldMatrix(true, true);
    const local = this.root.worldToLocal(hips.getWorldPosition(new THREE.Vector3()));
    // Une valeur aberrante (rig exotique, échelle inattendue) ne doit pas
    // asseoir l'équipage sous la coque. Les bornes suivent la taille canonique :
    // l'ancien plafond absolu de 0,72 m rejetait justement le bassin à ~0,86 m
    // du rig 1,70 m et réintroduisait une assise flottante.
    const minHip = CREW_TARGET_HEIGHT * 0.18;
    const maxHip = CREW_TARGET_HEIGHT * 0.72;
    if (Number.isFinite(local.y) && local.y > minHip && local.y < maxHip) {
      this.hipHeight = local.y;
    }
  }

  // ── POLE TARGETS ────────────────────────────────────────────────────────────
  //
  // ⚠️ LE DÉFAUT CORRIGÉ ICI ÉTAIT LE DERNIER POINT ROUGE DE L'AUDIT D'ÉQUIPAGE.
  //
  // Un CCD ne sait pas de quel CÔTÉ plier un coude : il cherche la position, pas
  // l'anatomie. Le limiteur d'oscillation (`maxSwing`) empêchait les cassures
  // franches, mais rien ne garantissait le SENS de flexion — sur 32 corps à
  // l'écran, un coude sur quatre partait à l'envers.
  //
  // `CREW_AUTHENTICITY_AUDIT.md` demandait « quatre contrôleurs de direction »
  // dans le prochain rig Blender. Mesure faite (`tools/inspect_crew_bend.py`,
  // Blender 5.2) : ce n'est pas nécessaire, l'information est DÉJÀ dans le rig.
  // La pose de repos fléchit de 35° au coude et 15° au genou, ce qui écarte le
  // milieu de 8,8 cm et 4,5 cm de la corde racine→extrémité. Un membre tendu ne
  // dirait rien ; celui-ci dit tout.
  //
  // On dérive donc le pole du repos au lieu de l'ajouter au GLB. Trois gains :
  // aucun asset à réexporter, aucun os supplémentaire à charger pour 32 corps,
  // et n'importe quel Mixamo standard fonctionne sans préparation.
  //
  // Stocké dans le repère du PARENT de la racine de chaîne : le pole suit alors
  // l'épaule et la hanche quand le corps tourne, sans recalcul.
  captureRestPoles(THREE) {
    if (!this.rigRoot?.updateWorldMatrix || !THREE?.Vector3) return;
    this.rigRoot.updateWorldMatrix(true, true);
    const root = new THREE.Vector3();
    const mid = new THREE.Vector3();
    const end = new THREE.Vector3();
    const axis = new THREE.Vector3();
    const pole = new THREE.Vector3();
    const parentQuaternion = new THREE.Quaternion();
    for (const chain of Object.values(this.ikChains)) {
      if (!chain) continue;
      chain.poleRest = null;
      const rootJoint = chain.joints[chain.joints.length - 1];
      const midJoint = chain.joints[0];
      if (!rootJoint?.parent || !midJoint) continue;
      rootJoint.getWorldPosition(root);
      midJoint.getWorldPosition(mid);
      chain.effector.getWorldPosition(end);
      axis.subVectors(end, root);
      const span = axis.length();
      if (span < 1e-4) continue;
      axis.multiplyScalar(1 / span);
      pole.subVectors(mid, root);
      pole.addScaledVector(axis, -pole.dot(axis));
      // Membre tendu au repos : aucun plan de flexion lisible. On laisse la
      // chaîne sans pole plutôt que d'inventer une direction — le limiteur
      // d'oscillation reste seul en charge, exactement comme avant.
      if (pole.length() < span * 0.02) continue;
      pole.normalize();
      rootJoint.parent.getWorldQuaternion(parentQuaternion);
      chain.poleRest = pole.clone().applyQuaternion(parentQuaternion.invert());
    }
  }

  // Fait tourner la chaîne entière autour de son axe racine→extrémité jusqu'à
  // ramener le coude (ou le genou) dans son plan de repos. L'extrémité ne bouge
  // pas : elle est SUR l'axe de rotation, donc le contact obtenu par le CCD est
  // conservé au pixel près. C'est ce qui permet d'appliquer la correction APRÈS
  // le solveur sans rien lui reprendre.
  applyPoleTarget(chain, strength) {
    if (!chain?.poleRest || !this.rigRoot?.updateWorldMatrix) return 0;
    const rootJoint = chain.joints[chain.joints.length - 1];
    const midJoint = chain.joints[0];
    if (!rootJoint?.parent || !midJoint) return 0;

    this.rigRoot.updateWorldMatrix(true, true);
    rootJoint.getWorldPosition(this.poleRootWorld);
    midJoint.getWorldPosition(this.poleMidWorld);
    chain.effector.getWorldPosition(this.poleEndWorld);

    this.poleAxis.subVectors(this.poleEndWorld, this.poleRootWorld);
    const span = this.poleAxis.length();
    if (span < 1e-4) return 0;
    this.poleAxis.multiplyScalar(1 / span);

    this.poleCurrent.subVectors(this.poleMidWorld, this.poleRootWorld);
    this.poleCurrent.addScaledVector(this.poleAxis, -this.poleCurrent.dot(this.poleAxis));
    // Chaîne quasi tendue : le plan est indéterminé et la correction serait du
    // bruit amplifié. On ne touche à rien.
    if (this.poleCurrent.length() < span * 0.02) return 0;
    this.poleCurrent.normalize();

    rootJoint.parent.getWorldQuaternion(this.ikParentWorld);
    this.poleDesired.copy(chain.poleRest).applyQuaternion(this.ikParentWorld);
    this.poleDesired.addScaledVector(this.poleAxis, -this.poleDesired.dot(this.poleAxis));
    if (this.poleDesired.length() < 1e-5) return 0;
    this.poleDesired.normalize();

    // Angle SIGNÉ autour de l'axe : c'est tout l'intérêt, un angle non signé
    // ramènerait le coude du mauvais côté une fois sur deux.
    this.poleCross.crossVectors(this.poleCurrent, this.poleDesired);
    const angle = Math.atan2(
      this.poleCross.dot(this.poleAxis),
      this.poleCurrent.dot(this.poleDesired)
    );
    if (!Number.isFinite(angle) || Math.abs(angle) < 1e-4) return 0;

    const corrected = clamp(angle * strength, -chain.maxStep, chain.maxStep);
    this.poleDelta.setFromAxisAngle(this.poleAxis, corrected);
    this.ikParentInverse.copy(this.ikParentWorld).invert();
    this.ikLocalDelta
      .copy(this.ikParentInverse)
      .multiply(this.poleDelta)
      .multiply(this.ikParentWorld);
    rootJoint.quaternion.premultiply(this.ikLocalDelta).normalize();

    // Le budget anatomique reste celui du solveur : la correction de pole ne
    // doit pas servir de porte dérobée pour dépasser `maxSwing`. Sans ce
    // reclampage, `crew-animation-v2.test.mjs` échouerait — et il aurait raison.
    const pose = chain.pose[chain.joints.length - 1];
    const swing = pose.angleTo(rootJoint.quaternion);
    if (swing > chain.maxSwing) {
      rootJoint.quaternion.copy(pose).slerp(rootJoint.quaternion, chain.maxSwing / swing).normalize();
    }
    return Math.abs(angle);
  }

  // Une calotte claire sur chaque tête. À 13 px de haut sur téléphone,
  // l'équipage est un liseré brun sur un fond de coque presque noir : ces 2 px
  // clairs sont ce qui permet de COMPTER les hommes. Coût mesuré à l'écran, et
  // c'est le seul détail de personnage qui survive à cette réduction.
  // Trois coiffes, UNE SEULE maille par équipier dans tous les cas : à 13 px de
  // haut c'est la silhouette qui distingue les hommes, pas la géométrie fine.
  // Casquette, foulard, et locks — qui se lisent comme une masse sombre plus
  // haute et plus large que le crâne, ce qui suffit et coûte zéro triangle de
  // plus qu'une casquette.
  addHeadgear(THREE, headJoint, kit) {
    if (!headJoint || !kit) return;
    const gear = new THREE.Mesh(kit.geometry, kit.material);
    gear.position.y = (this.fromRig ? 0.09 : 0.045) + kit.lift;
    gear.scale.set(kit.scale.x, kit.scale.y, kit.scale.z);
    gear.frustumCulled = false;
    headJoint.add(gear);
    this.headgear = gear;
  }

  // Sur un rig skinné, Box3 ment : un GLB Meshy porte une Armature à l'échelle
  // 0,01 (convention centimètres) et une géométrie déjà exprimée en mètres, donc
  // la boîte renvoie 0,017 pour un personnage de 1,70 m — d'où un facteur ×69 et
  // des équipiers hauts comme des mâts.
  //
  // Les positions monde des OS, elles, sont exactes : elles décrivent ce qui est
  // réellement rendu. On mesure là, et on retombe sur Box3 seulement pour les
  // rigs sans squelette (hiérarchie de nœuds simples, comme le gabarit).
  measureRigHeight(THREE, rig) {
    if (!THREE?.Box3 || !rig.updateWorldMatrix) return null;
    rig.updateWorldMatrix(true, true);
    let skeleton = null;
    rig.traverse((node) => {
      if (!skeleton && node.isSkinnedMesh && node.skeleton?.bones?.length) skeleton = node.skeleton;
    });
    if (skeleton) {
      const position = new THREE.Vector3();
      let min = Infinity;
      let max = -Infinity;
      for (const bone of skeleton.bones) {
        position.setFromMatrixPosition(bone.matrixWorld);
        min = Math.min(min, position.y);
        max = Math.max(max, position.y);
      }
      if (Number.isFinite(min) && max > min) return { height: max - min, min };
    }
    const box = new THREE.Box3().setFromObject(rig, true);
    const height = box.max.y - box.min.y;
    return Number.isFinite(height) ? { height, min: box.min.y } : null;
  }

  /**
   * Position MONDE d'un os piloté, après pose, procédural et IK.
   *
   * Les champs `leftHand`, `rightHand`… de cette classe sont des PROXYS : ils
   * portent la consigne de rotation mais ne sont pas dans le graphe de scène,
   * donc leur matrice monde ne veut rien dire. L'os réel vit dans `rigJoints`.
   * Sans ce détour, un accessoire « tenu en main » suivrait un objet immobile.
   *
   * Rend `null` sur le corps procédural, qui n'a pas ces os.
   */
  boneWorldPosition(boneName, out) {
    const joint = this.rigJoints?.find((entree) => entree.boneName === boneName)?.joint;
    if (!joint?.getWorldPosition || !out) return null;
    this.root.updateWorldMatrix(true, true);
    return joint.getWorldPosition(out);
  }

  // Rotation de repos × rotation de jeu, une fois par frame et par articulation.
  // Choisit l'action mélangée sous la pose procédurale.
  //
  // ⚠️ `weight` DÉPLACE LA POSE DE REPOS, il ne remplace pas la pose de jeu.
  // Au-delà de ~0,35 l'équipage commence à suivre le clip plutôt que la mer, ce
  // qui est exactement le défaut que l'architecture interdit. La borne est ici
  // et pas dans l'appelant, pour qu'aucun site d'appel ne puisse la contourner.
  setClipBlend(action, time = 0, weight = 0) {
    this.clipAction = action;
    this.clipTime = Number.isFinite(time) ? time : 0;
    this.clipWeight = clamp(Number.isFinite(weight) ? weight : 0, 0, 0.35);
    return this.clipWeight;
  }

  // Pose d'assise : ce que le corps fait quand il n'est PAS sorti au rappel.
  // Elle est tenue en permanence et la station se superpose par-dessus, ce qui
  // fait du déploiement un vrai fondu au lieu d'un changement d'action.
  setSeatBlend(action, time = 0, weight = 0) {
    this.seatAction = typeof action === "string" ? action : null;
    this.seatTime = Number.isFinite(time) ? time : 0;
    this.seatWeight = this.seatAction
      ? clamp(Number.isFinite(weight) ? weight : 0, 0, 0.82)
      : 0;
    return this.seatWeight;
  }

  setPoseBlend(action, time = 0, weight = 0, overlayAction = null, overlayTime = 0, overlayWeight = 0) {
    this.poseAction = typeof action === "string" ? action : null;
    this.poseTime = Number.isFinite(time) ? time : 0;
    this.poseWeight = this.poseAction
      ? clamp(Number.isFinite(weight) ? weight : 0, 0, 0.82)
      : 0;
    this.overlayAction = typeof overlayAction === "string" ? overlayAction : null;
    this.overlayTime = Number.isFinite(overlayTime) ? overlayTime : 0;
    this.overlayWeight = this.overlayAction
      ? clamp(Number.isFinite(overlayWeight) ? overlayWeight : 0, 0, 0.72)
      : 0;
    return this.poseWeight;
  }

  // Rotation de repos × rotation de jeu, une fois par frame et par articulation.
  //
  // Depuis le 2 août 2026, la pose de REPOS peut être tirée faiblement vers une
  // action courte (`crew-clips.js`) : repos → clip → procédural → IK. À poids
  // nul le calcul est identique au précédent, instruction pour instruction.
  syncRig() {
    const bibliotheque = this.clipLibrary;
    const seatActive = Boolean(
      bibliotheque && this.seatScratch && this.seatWeight > 0.001
      && bibliotheque.has(this.seatAction)
    );
    const poseActive = Boolean(
      bibliotheque && this.poseScratch && this.poseWeight > 0.001
      && bibliotheque.has(this.poseAction)
    );
    const overlayActive = Boolean(
      bibliotheque && this.overlayScratch && this.overlayWeight > 0.001
      && bibliotheque.has(this.overlayAction)
    );
    // Sans les nouvelles actions, le chemin historique reste strictement
    // identique. Les GLB déjà livrés et les tests à poids nul ne changent pas.
    if (seatActive || poseActive || overlayActive) {
      const seatRelative = seatActive && bibliotheque.isRelative(this.seatAction);
      const poseRelative = poseActive && bibliotheque.isRelative(this.poseAction);
      const overlayRelative = overlayActive && bibliotheque.isRelative(this.overlayAction);
      for (let index = 0; index < this.rigJoints.length; index++) {
        const { proxy, joint, rest, boneName } = this.rigJoints[index];
        const base = this.poseBaseScratch.copy(rest);
        let absoluteAuthority = 0;

        // L'assise pose le corps dans le bateau ; la station la recouvre à
        // mesure que l'homme sort. Un os que l'assise n'anime pas garde son
        // repos et la station le reprend telle quelle.
        if (seatActive && bibliotheque.sample(
          this.seatAction, boneName, this.seatTime, this.seatScratch
        )) {
          if (seatRelative) this.seatScratch.premultiply(rest);
          base.slerp(this.seatScratch, this.seatWeight);
          if (!seatRelative) absoluteAuthority = this.seatWeight;
        }

        if (poseActive && bibliotheque.sample(
          this.poseAction, boneName, this.poseTime, this.poseScratch
        )) {
          // Même règle que l'overlay : un offset relatif s'applique autour de
          // la pose déjà obtenue — donc autour de l'assise — pas autour du bind.
          if (poseRelative) this.poseScratch.premultiply(base);
          base.slerp(this.poseScratch, this.poseWeight);
          if (!poseRelative) absoluteAuthority = Math.max(absoluteAuthority, this.poseWeight);
        }

        if (overlayActive && bibliotheque.sample(
          this.overlayAction, boneName, this.overlayTime, this.overlayScratch
        )) {
          // Un overlay relatif s'applique autour de la pose macro déjà obtenue,
          // pas autour du bind ; un overlay glTF absolu devient la cible.
          if (overlayRelative) this.overlayScratch.premultiply(base);
          base.slerp(this.overlayScratch, this.overlayWeight);
          if (!overlayRelative) absoluteAuthority = Math.max(absoluteAuthority, this.overlayWeight);
        }

        // Une pose glTF est absolue : lui multiplier tout le procédural
        // reproduirait deux fois la flexion des hanches et des genoux. On garde
        // toutefois au moins 41 % des réactions courtes (houle, choc, souffle).
        const proceduralWeight = 1 - Math.min(0.59, absoluteAuthority * 0.72);
        this.proceduralScratch.identity().slerp(proxy.quaternion, proceduralWeight);
        joint.quaternion.copy(base).multiply(this.proceduralScratch);
      }
      return;
    }

    const poids = this.clipWeight;
    const melange = Boolean(
      bibliotheque && this.clipScratch && poids > 0.001 && bibliotheque.has(this.clipAction)
    );
    // ⚠️ Un clip glTF porte la rotation ABSOLUE du nœud et remplace le repos ;
    // un clip fabriqué en code porte un OFFSET à composer avec lui. Confondre
    // les deux faisait slerper le repos vers l'identité : une respiration réglée
    // pour 0,3° sortait à 15,7°. Voir crew-clips.js.
    const relatif = melange && bibliotheque.isRelative(this.clipAction);
    for (let index = 0; index < this.rigJoints.length; index++) {
      const { proxy, joint, rest, boneName } = this.rigJoints[index];
      if (melange && bibliotheque.sample(this.clipAction, boneName, this.clipTime, this.clipScratch)) {
        // Un os que le clip n'anime pas garde son repos : une action partielle
        // reste utilisable, au lieu de figer les membres qu'elle ne couvre pas.
        if (relatif) this.clipScratch.premultiply(rest);
        joint.quaternion.copy(rest).slerp(this.clipScratch, poids).multiply(proxy.quaternion);
      } else {
        joint.quaternion.copy(rest).multiply(proxy.quaternion);
      }
    }
  }

  solveLimbContact(chain, x, y, z, strength, iterations = 2) {
    if (!chain || strength <= 0.015 || !this.rigRoot?.updateWorldMatrix) return 0;
    // Le solveur ne pilote plus quatre membres vers des cibles symétriques :
    // il peut converger franchement sur les trois appuis intentionnels. Un
    // poids trop mou exigeait 8 à 12 passes et coûtait cher aux 32 personnages.
    const blend = clamp(strength * 0.78, 0.06, 0.84);
    for (let index = 0; index < chain.joints.length; index++) {
      chain.pose[index].copy(chain.joints[index].quaternion);
    }
    this.root.updateWorldMatrix(true, true);
    this.ikTargetLocal.set(x, y, z);
    this.ikTargetWorld.copy(this.ikTargetLocal);
    this.root.localToWorld(this.ikTargetWorld);

    for (let iteration = 0; iteration < iterations; iteration++) {
      for (let jointIndex = 0; jointIndex < chain.joints.length; jointIndex++) {
        const joint = chain.joints[jointIndex];
        if (!joint?.parent) continue;
        this.rigRoot.updateWorldMatrix(true, true);
        joint.getWorldPosition(this.ikJointWorld);
        chain.effector.getWorldPosition(this.ikEffectorWorld);
        this.ikToEffector.subVectors(this.ikEffectorWorld, this.ikJointWorld);
        this.ikToTarget.subVectors(this.ikTargetWorld, this.ikJointWorld);
        if (this.ikToEffector.lengthSq() < 1e-7 || this.ikToTarget.lengthSq() < 1e-7) continue;
        this.ikToEffector.normalize();
        this.ikToTarget.normalize();
        const angle = Math.acos(clamp(this.ikToEffector.dot(this.ikToTarget), -1, 1));
        const stepBlend = angle > 1e-5
          ? blend * Math.min(1, chain.maxStep / angle)
          : blend;
        this.ikWorldDelta
          .setFromUnitVectors(this.ikToEffector, this.ikToTarget)
          .slerp(this.ikIdentity, 1 - stepBlend);
        joint.parent.getWorldQuaternion(this.ikParentWorld);
        this.ikParentInverse.copy(this.ikParentWorld).invert();
        this.ikLocalDelta
          .copy(this.ikParentInverse)
          .multiply(this.ikWorldDelta)
          .multiply(this.ikParentWorld);
        joint.quaternion.premultiply(this.ikLocalDelta).normalize();
        // Sans pole target explicite dans ce GLB, un CCD libre peut retourner
        // un coude ou un genou pour gagner quelques centimètres. On limite la
        // correction autour de la pose procédurale de la frame : le contact
        // reste ferme, mais l'IK ne peut plus casser la silhouette.
        const pose = chain.pose[jointIndex];
        const swing = pose.angleTo(joint.quaternion);
        if (swing > chain.maxSwing) {
          joint.quaternion.copy(pose).slerp(joint.quaternion, chain.maxSwing / swing).normalize();
        }
      }
    }
    // Remise du coude / genou dans son plan de repos. APRÈS le CCD, et pas
    // pendant : la rotation se fait autour de l'axe racine→extrémité, donc elle
    // ne déplace pas l'effecteur et ne coûte rien au contact que le solveur
    // vient d'obtenir. L'intercaler dans la boucle ne ferait que payer quatre
    // fois le même travail.
    this.applyPoleTarget(chain, clamp(strength * 0.9, 0.15, 0.85));

    this.rigRoot.updateWorldMatrix(true, true);
    chain.effector.getWorldPosition(this.ikEffectorWorld);
    return this.ikEffectorWorld.distanceTo(this.ikTargetWorld);
  }

  applyRigContacts(hike, seated, catchLoad, transferCrouch) {
    if (!this.ikChains) return;
    const scale = Math.max(0.001, this.root.scale.y || 1);
    const beamY = (CREW_BEAM_Y - this.root.position.y) / scale;
    const rappelContact = clamp((hike - 0.16) / 0.58 + catchLoad * 0.55, 0, 1)
      * (1 - transferCrouch * 0.62);
    const deckContact = transferCrouch * (1 - seated * 0.7);
    let firmWorst = 0;
    let softWorst = 0;

    // ─── LA CIBLE VIT DANS LE REPÈRE DU BWA, PAS DANS CELUI DE L'HOMME ──────
    //
    // ⚠️ DÉFAUT CORRIGÉ LE 2 AOÛT 2026, TROUVÉ EN MESURANT.
    //
    // `solveLimbContact` interprète ses coordonnées dans le repère LOCAL de
    // l'équipier — or ce repère est tourné par le lacet, jusqu'à 78° à pleine
    // sortie. L'ancien décalage de `-0,17` en Z, censé placer la main « en
    // arrière du bassin », ressortait donc à 13,8 cm HORS de l'axe du bois.
    //
    // Mesuré avant correction : la cible tombait à 2,1 cm au-dessus du bwa —
    // donc juste en hauteur — mais la main finissait à 24 cm de côté, le long
    // de la coque. Les hommes n'ont jamais rien tenu.
    //
    // Le bwa court selon X dans le repère de la yole, à la cote `CREW_BEAM_Y`,
    // et passe par la racine de l'équipier (leur `z` est verrouillé identique
    // par `crew-seating`). On décrit donc la prise dans CE repère — écartement
    // le long du bois, décalage transversal NUL — puis on l'exprime dans le
    // repère tourné de l'homme en défaisant le lacet.
    const yaw = this.root.rotation.y;
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    // (dx, dz) exprimé dans la yole → local de l'équipier.
    const surLeBoisX = (dx) => dx * cosYaw;
    const surLeBoisZ = (dx) => dx * sinYaw;

    // Une prise ferme, pas deux menottes. Quand le corps est tourné vers le
    // large, la main extérieure peut réellement atteindre le bwa ; forcer la
    // seconde sur une cible symétrique demandait près de 70 cm d'étirement et
    // fabriquait les deux bras identiques du mannequin. La main libre reste
    // pilotée par la pose d'effort.
    const ECART_MAINS = 0.155;
    const mainExterieureDroite = this.root.position.x >= 0;
    const handDx = mainExterieureDroite ? ECART_MAINS : -ECART_MAINS;
    const handChain = mainExterieureDroite ? this.ikChains.rightArm : this.ikChains.leftArm;
    firmWorst = Math.max(firmWorst, this.solveLimbContact(
      handChain,
      surLeBoisX(handDx), beamY + 0.025, surLeBoisZ(handDx),
      rappelContact, 4
    ));

    // En rappel les pieds referment la pince autour du bois. Pendant la
    // traversée ils quittent la perche et cherchent deux appuis distincts sur
    // le pont, ce qui évite la glissade droite et sans poids.
    // ⚠️ LES PIEDS PRENNENT APPUI SUR LE BOIS, ILS NE PENDENT PAS.
    //
    // Corrigé le 2 août 2026 d'après images vidéo de course. L'ancienne cible
    // visait `beamY - 0.08` — donc SOUS la perche — à `z = -0,26` dans le repère
    // tourné de l'homme, exactement le même défaut de repère que les mains. Les
    // jambes tombaient donc dans le vide, à 77-83° de l'horizontale, et l'homme
    // formait un « L » suspendu.
    //
    // Les images montrent l'inverse : l'équipier est ASSIS sur le bois, jambes
    // repliées VERS LA COQUE, pieds calés sur une perche en deçà de son bassin.
    // Le « L » existe, mais il pointe vers l'intérieur du bateau, pas vers le bas.
    // 0,34 garde les deux appuis dans l'enveloppe anatomique du rig. La suite
    // `crew-animation-v2` refuse désormais une prise ferme au-delà de 10 cm.
    const APPUI_PIEDS = 0.34;
    // Vers la coque = sens opposé au déport de l'équipier.
    const versCoque = -(Math.sign(this.root.position.x) || 1);
    const enRappel = rappelContact > deckContact;
    // Deux pieds légèrement décalés LE LONG du bois : un appui parfaitement
    // symétrique lit comme une pose de mannequin.
    const appuiG = versCoque * (APPUI_PIEDS + 0.06);
    const appuiD = versCoque * (APPUI_PIEDS - 0.06);
    const footY = enRappel ? beamY + 0.02 : (0.12 - this.root.position.y) / scale;
    const legStrength = Math.max(rappelContact * 0.82, deckContact * 0.72);
    const leadLeft = this.contactLead % 2 === 0;
    const contactMode = crewContactMode(
      this.poseAction, this.overlayAction, this.overlayWeight, this.poseWeight
    );
    let leftFootError = 0;
    let rightFootError = 0;
    // La pose extrême de référence a une jambe crochetée et une jambe libre.
    // Résoudre quand même les deux pieds détruirait précisément cette asymétrie.
    if (contactMode === CREW_CONTACT_BOTH_FEET || leadLeft) {
      leftFootError = this.solveLimbContact(
        this.ikChains.leftLeg,
        enRappel ? surLeBoisX(appuiG) : -0.15,
        footY,
        enRappel ? surLeBoisZ(appuiG) : 0.02 - deckContact * 0.10,
        legStrength, 6
      );
    }
    if (contactMode === CREW_CONTACT_BOTH_FEET || !leadLeft) {
      rightFootError = this.solveLimbContact(
        this.ikChains.rightLeg,
        enRappel ? surLeBoisX(appuiD) : 0.15,
        footY,
        enRappel ? surLeBoisZ(appuiD) : 0.02 + deckContact * 0.10,
        legStrength, 6
      );
    }
    firmWorst = Math.max(firmWorst, leadLeft ? leftFootError : rightFootError);
    if (contactMode === CREW_CONTACT_BOTH_FEET) {
      softWorst = Math.max(softWorst, leadLeft ? rightFootError : leftFootError);
    }
    this.firmContactError = firmWorst;
    this.softContactError = softWorst;
    this.contactError = Math.max(firmWorst, softWorst);
  }

  update(time, dt, x, z, velocity, roll, impact, active, stumble = 0, boostForward = 0, boostSide = 0, cadence = 0, bail = 0, drink = 0, cohesion = 1, shiftMotion = null) {
    if (!active && this.wasActive) {
      this.fall = 1.25;
      this.fallSpin = Math.sign(x || 1) * (1.3 + this.phase * 0.08);
    }
    this.wasActive = active;

    if (!active && this.fall <= 0) {
      this.root.visible = false;
      return;
    }
    this.root.visible = true;

    if (!active) {
      this.fall -= dt;
      const progress = 1 - clamp(this.fall / 1.25, 0, 1);
      this.root.position.x += Math.sign(x || 1) * dt * (1.8 + progress * 2.5);
      this.root.position.y = 0.2 - progress * progress * 2.2;
      this.root.position.z = z - progress * 0.7;
      this.root.rotation.x += dt * 3.2;
      this.root.rotation.z += dt * this.fallSpin * 3.6;
      return;
    }

    this.root.rotation.set(0, 0, 0);
    this.root.position.x = damp(this.root.position.x, x, 10.5, dt);
    this.root.position.z = z;
    const run = clamp(Math.abs(velocity) * 0.52, 0, 1);
    // ── LA COHÉSION SE VOIT SUR LES HOMMES, PAS SUR UNE JAUGE ────────────
    //
    // `cohesion` pilote déjà trois choses dans la simulation : la vitesse à
    // laquelle un équipier gagne le bout du bois, la cadence d'écopage, et le
    // couple de rappel que son poids produit. À 0,16 — le plancher — ils
    // rampent six fois plus lentement et ne rendent que 0,68× du rappel.
    //
    // ⚠️ RIEN N'AFFICHAIT CETTE VALEUR. Le HUD compte huit lecteurs et pas un
    // seul pour la cohésion, alors qu'elle est dépensée par le turbo, par
    // chaque coup encaissé, et qu'elle était l'effet PRINCIPAL du lambi. Le
    // joueur subissait un équipage devenu mou sans jamais savoir pourquoi.
    //
    // Un neuvième chiffre à l'écran aurait empiré le HUD. On la lit donc sur le
    // bateau : plus l'équipage est désorganisé, plus il S'AVACHIT — buste
    // affaissé, prise molle sur le bois.
    //
    // ⚠️ UNE DÉSYNCHRONISATION AVAIT ÉTÉ TENTÉE, PUIS RETIRÉE. L'idée était de
    // déphaser les six hommes à mesure que la cohésion tombe. Mesuré : à
    // cohésion PLEINE, les instants de pic des six bras valent déjà
    // [67, 67, 66, 41, 40, 39] — l'équipage n'est PAS synchrone au départ.
    // `CREW_LAG` le décale volontairement : c'est la vague qui parcourt le
    // bateau, le geste d'une bordée qui travaille. Désynchroniser davantage ne
    // se lit donc pas comme « désorganisé », seulement comme un autre motif.
    //
    // Le retard réel des équipiers désorganisés est d'ailleurs DÉJÀ simulé :
    // `individualSpeed` est multiplié par `cohesion`, donc ils gagnent le bout
    // du bois six fois plus lentement au plancher. Ce qui manquait n'était pas
    // le décalage, c'était la POSTURE.
    const desordre = clamp(1 - cohesion, 0, 1);
    // Le déphasage est proportionnel à l'index de l'homme : à cohésion pleine
    // ils sont sur la même mesure, à cohésion basse chacun bat la sienne.
    const cycle = time * (8 + run * 7) + this.phase;
    const stride = Math.sin(cycle) * 0.58 * run;
    const boostLean = clamp(boostForward, 0, 1) * 0.36;
    const dashLean = clamp(boostSide, -1, 1) * 0.34;

    // Un yoleur ne se tient pas debout. Une yole ronde n'a ni quille ni
    // gouvernail : TOUT le couple de redressement vient du poids des hommes
    // assis à califourchon sur les bois dressés. Ils sortent sur la perche
    // quand ça gîte, ils rentrent quand ça mollit — et c'est exactement ce que
    // la simulation calcule déjà dans crewPositions[i].
    //
    // On mélange donc deux poses selon le déport : à bord (accroupi, en appui)
    // et au bout du bois (assis, buste renversé vers l'extérieur).
    // ⚠️ La pose se calcule sur la position RÉELLEMENT DESSINÉE, pas sur la
    // position visée. `root.position.x` est amortie (damp à 10,5) : pendant un
    // rappel, la consigne peut déjà être à 0,5 m alors que le corps est encore
    // à 1,6 m. Prendre `x` mettait donc un homme assis loin sur la perche dans
    // la pose de quelqu'un resté à bord — bassin 0,36 m au-dessus du bois,
    // relevé par test/crew-seating.
    const drawnX = this.root.position.x;
    const side = Math.sign(drawnX || x || 1);
    const hike = clamp(Math.abs(drawnX) / CREW_HIKE_SPAN, 0, 1);
    const settle = 1 - hike;

    // Un équipage de yole travaille À L'UNISSON. La seule animation existante
    // était une foulée pilotée par `velocity`, la vitesse de déplacement LATÉRAL
    // de l'équipier : sorti sur son bois il ne se déplace plus, donc `run` tombe
    // à zéro et l'homme se fige. Il l'était 87 % du temps — six statues.
    //
    // `cadence` est partagée par les six équipiers d'une même yole ; `this.phase`
    // ne vaut plus qu'un léger retard de proue en poupe, pour que l'effort se
    // propage en vague au lieu que chacun batte la mesure dans son coin.
    const pump = Math.sin(cadence + this.phase);
    // Sorti sur la perche on ne tient pas immobile : on relance le rappel à
    // chaque houle, buste et bras en opposition. L'amplitude suit le déport,
    // parce que c'est là que l'effort est réel.
    // ⚠️ NE PAS RÉDUIRE `effort` AVEC LA COHÉSION. Mesuré deux fois : c'est ce
    // terme qui porte la variation PROPRE À CHAQUE HOMME (`pump` vaut
    // `sin(cadence + this.phase)`, donc il diffère d'un équipier à l'autre). Le
    // rabattre uniformisait les six et faisait TOMBER la dispersion — 0,195 rad
    // à cohésion pleine contre 0,091 à cohésion cassée, soit un équipage
    // désorganisé qui paraissait plus soudé qu'un équipage à plein régime.
    //
    // L'avachissement doit passer par ce qui est COMMUN aux six (la tenue, le
    // buste), jamais par ce qui les distingue.
    const effort = (0.35 + hike * 0.65) * (0.6 + run * 0.4);
    // Écopage : poste PERMANENT en course, pas une réparation d'après-chavirage.
    // Seul l'homme resté à bord écope, et plus vite que la houle.
    const scoop = bail * settle * Math.max(0, Math.sin(cadence * 2.1 + this.phase * 1.7));
    // Contre-gîte : quatre phases lisibles, décalées par homme. L'anticipation
    // comprime les jambes, la poussée déplace la masse, la prise de charge
    // verrouille bras et bassin, puis le corps absorbe le retour de la coque.
    // On anime une FORCE, pas une roulade décorative : les pieds, les mains et
    // le bassin restent donc attachés au même bwa pendant tout le geste.
    const shiftLocal = shiftMotion
      ? shiftMotion.elapsed - (shiftMotion.delay ?? 0)
      : 99;
    const weightMomentum = clamp(shiftMotion?.momentum ?? 0, -1, 1);
    const loadRecoil = clamp(shiftMotion?.loadRecoil ?? 0, -1, 1);
    const roleLoad = this.role === "dernier" ? 1.08 : (this.role === "premier" ? 1.04 : 1);
    const shiftStrength = (shiftMotion?.kind >= 2
      ? 0.72 + (shiftMotion.precision ?? 0) * 0.28
      : 0.48) * roleLoad;
    const brace = motionPulse(shiftLocal, -0.08, 0.03, 0.12, 0.23) * shiftStrength;
    const drive = motionPulse(shiftLocal, 0.02, 0.20, 0.40, 0.69) * shiftStrength;
    const catchLoad = motionPulse(shiftLocal, 0.18, 0.31, 0.36, 0.58) * shiftStrength;
    const absorb = motionPulse(shiftLocal, 0.40, 0.55, 0.68, 0.92) * shiftStrength;
    const sideTransfer = clamp(shiftMotion?.sideTransfer ?? 1, 0, 1);
    const sideChanging = Boolean(shiftMotion?.sideChanging);
    const transferCrouch = sideChanging ? Math.sin(sideTransfer * Math.PI) : 0;
    const transferStep = sideChanging ? Math.sin(sideTransfer * Math.PI * 2) : 0;
    const anticipation = clamp(shiftMotion?.anticipation ?? 0, 0, 1);
    // Décrochage au chavirage : la perche se dresse, l'homme glisse vers la
    // coque et s'y accroche recroquevillé. Piloté par la gîte lissée côté
    // YoleVisual ; présentation seule.
    const decrochage = clamp(shiftMotion?.decrochage ?? 0, 0, 1);
    const scoutBrace = anticipation * (this.role === "premier" ? 0.16 : 0.055);
    this.shiftPhase = Math.max(brace, drive, catchLoad, absorb);
    this.motionState = sideChanging
      ? "changement_bord"
      : catchLoad > 0.08
        ? "prise_charge"
        : drive > 0.08
          ? "sortie_bwa"
          : brace > 0.08
            ? "anticipation"
            : absorb > 0.08
              ? "absorption"
              : hike > 0.42
                ? "rappel"
                : "pont";

    // LACET — on se tourne vers le large à mesure qu'on sort sur le bois.
    //
    // C'est la correction de fond : le corps s'aligne sur l'axe de la perche au
    // lieu de rester en travers. Une rotation POSITIVE sur Y amène la face de
    // +Z vers +X, donc `side` suffit à envoyer l'homme du bon bord. À bord
    // (hike = 0) le lacet retombe à zéro et l'équipier regarde la proue, comme
    // avant.
    const familyPose = CREW_FAMILY_POSE[this.stagingFamily] ?? CREW_FAMILY_POSE.levier;
    const yaw = side * hike * CREW_HIKE_YAW * familyPose.yaw;
    this.root.rotation.y = yaw;
    // ⚠️ La bascule N'EST PLUS à la racine. Elle y faisait pivoter l'homme
    // autour de ses pieds, ce qui décollait le bassin du bois. Elle passe au
    // bassin, seul point réellement en appui.
    this.root.rotation.z = 0;

    // Dans ce repère tourné, +Z local pointe vers le large : renverser le buste
    // au-dessus de l'eau est donc un TANGAGE positif du bassin. Et comme les
    // jambes sont filles du bassin, elles remontent du même geste vers la
    // coque — la balance se fait toute seule, avec le bois pour pivot.
    const recline = hike * CREW_HIKE_RECLINE * this.posture * familyPose.recline;

    // Jambes : à califourchon de part et d'autre du bois, repliées vers la
    // coque.
    //
    // ⚠️ Le `-recline` n'est pas un réglage, il ANNULE la rotation héritée du
    // bassin. Sans lui, les cuisses suivaient le buste vers le large et les
    // hommes finissaient DEBOUT sur la perche, en équilibre comme sur un fil.
    // On repart donc de la verticale, puis on replie vers la coque.
    //
    // ⚠️ TENTATIVE ANNULÉE LE 2 AOÛT 2026, ET POURQUOI ELLE A ÉCHOUÉ.
    // D'après photos de course, l'écart des cuisses et leur repli devaient
    // s'EFFACER au taquet (jambes droites et jointes) au lieu de croître. C'est
    // vrai d'une vraie yole. Appliqué ici, le rendu a EMPIRÉ — captures à
    // l'appui : les hommes sont passés de « accroupis » à « pendus raides ».
    //
    // La mesure a dit pourquoi. Le corps est aujourd'hui à 68-87° de l'axe du
    // bwa, c'est-à-dire EN TRAVERS, et à seulement 34-38° de la verticale.
    // Redresser les jambes d'un homme qui pend perpendiculairement ne fait que
    // mieux montrer qu'il pend. Le défaut est l'ORIENTATION DU CORPS, pas le
    // détail des cuisses, et tripler `recline` ne le corrige pas non plus :
    // mesuré, `torseBwa` reste collé à 87-90° quelle que soit son amplitude.
    // Voir docs/CREW_ANIMATION_ENGINE.md — « Le corps en travers du bwa ».
    this.leftLegPivot.rotation.x = stride * settle - recline - hike * CREW_LEG_HOOK * familyPose.hook;
    this.rightLegPivot.rotation.x = -stride * settle - recline - hike * CREW_LEG_HOOK * familyPose.hook;
    this.leftLegPivot.rotation.z = CREW_STRADDLE * hike;
    this.rightLegPivot.rotation.z = -CREW_STRADDLE * hike;
    this.leftLegPivot.rotation.x -= brace * 0.24 + catchLoad * 0.16 + transferCrouch * 0.42;
    this.rightLegPivot.rotation.x -= brace * 0.24 + catchLoad * 0.16 + transferCrouch * 0.42;
    this.leftLegPivot.rotation.x += transferStep * 0.34;
    this.rightLegPivot.rotation.x -= transferStep * 0.34;

    // Bras : ils vont chercher le bois EN ARRIÈRE du bassin, et se resserrent
    // au lieu de s'écarter. C'est le point de contact qui manquait — sans lui
    // l'homme paraît posé sur la perche, pas accroché à elle.
    // Même correction que pour les jambes : on annule l'héritage du bassin pour
    // que les mains visent le bois, et pas le ciel.
    // Et il tient mal le bois : les mains lâchent du terrain quand ça se
    // désorganise, ce qui donne cette silhouette avachie qu'on reconnaît de loin.
    const grip = hike * CREW_GRIP_REACH * familyPose.grip * (1 - desordre * 0.30) - recline;
    this.leftArmPivot.rotation.x = (-stride * 0.9 - 0.25) * settle + grip + pump * effort * 0.30;
    this.rightArmPivot.rotation.x = (stride * 0.9 - 0.25) * settle + grip + pump * effort * 0.30 - scoop * 1.15;
    // L'écart latéral se REFERME avec la sortie : les deux mains convergent
    // vers la perche au lieu de rester en croix.
    // `bindSplay` retire l'ouverture que le rig importé porte déjà dans son
    // bind ; il vaut zéro pour le corps procédural, qui garde donc au geste
    // près la silhouette d'avant. Voir `measureBindSplay`.
    const splay = 0.62 * settle + 0.16 * hike - this.bindSplay;
    this.leftArmPivot.rotation.z = -splay - impact * 0.8 - stumble * 0.45 - dashLean * 0.55;
    this.rightArmPivot.rotation.z = splay + impact * 0.8 + stumble * 0.45 - dashLean * 0.55;
    this.leftArmPivot.rotation.x += drive * 0.24 + catchLoad * 0.34;
    this.rightArmPivot.rotation.x += drive * 0.24 + catchLoad * 0.34;
    this.leftArmPivot.rotation.z += side * catchLoad * 0.08;
    this.rightArmPivot.rotation.z += side * catchLoad * 0.08;
    // Une main cherche le nouveau bord pendant que l'autre conserve l'ancien
    // appui. L'inversion à mi-traversée produit une vraie succession de prises.
    this.leftArmPivot.rotation.x += transferCrouch * 0.34 + transferStep * 0.30;
    this.rightArmPivot.rotation.x += transferCrouch * 0.34 - transferStep * 0.30;
    this.leftArmPivot.rotation.z -= transferStep * 0.16;
    this.rightArmPivot.rotation.z -= transferStep * 0.16;

    // Bassin : point d'appui sur le bois, buste renversé au-dessus de l'eau.
    this.hips.rotation.x = -0.12 + run * 0.16 * settle + recline
      + impact * Math.sin(cycle * 0.7) * 0.3 + stumble * 0.15 - boostLean
      + pump * effort * 0.17 + scoop * 0.42
      + brace * 0.20 - drive * 0.16 + catchLoad * 0.11 - absorb * 0.08
      + transferCrouch * 0.31 + scoutBrace;
    this.hips.rotation.z = -roll * 0.28 * settle
      + velocity * 0.018 + weightMomentum * 0.065
      + Math.sin(cycle * 0.4) * stumble * 0.18 - dashLean;
    // L'avachissement, lui, est COMMUN aux six : le buste s'affaisse et le
    // bassin s'écrase. C'est ce qu'on lit sur la silhouette de la bordée
    // entière, sans toucher à ce qui différencie les hommes entre eux.
    this.torso.rotation.x = -boostLean * 0.55 + hike * 0.14 - pump * effort * 0.22 + scoop * 0.55
      + desordre * 0.34 + brace * 0.24 - drive * 0.18 + catchLoad * 0.12
      + transferCrouch * 0.22 + scoutBrace * 0.75;
    this.torso.rotation.z = 0;

    // Le GLB complet dispose de la chaîne que le premier moteur laissait
    // inerte. On répartit maintenant la courbure au lieu de casser tout le
    // personnage sur un unique os Spine.
    if (this.spineMid) {
      this.spineMid.rotation.x = -pump * effort * 0.08 + catchLoad * 0.08 + transferCrouch * 0.12;
      this.spineMid.rotation.z = -roll * 0.035 * settle;
    }
    if (this.spineUpper) {
      this.spineUpper.rotation.x = -pump * effort * 0.07 + brace * 0.08 - drive * 0.06;
      this.spineUpper.rotation.z = -roll * 0.025 * settle;
    }
    if (this.leftForeArm) {
      this.leftForeArm.rotation.x = -0.36 * hike - catchLoad * 0.24 - transferStep * 0.26;
      this.leftForeArm.rotation.z = 0.10 * hike;
    }
    if (this.rightForeArm) {
      this.rightForeArm.rotation.x = -0.36 * hike - catchLoad * 0.24 + transferStep * 0.26;
      this.rightForeArm.rotation.z = -0.10 * hike;
    }
    if (this.leftHand) this.leftHand.rotation.z = -0.18 * hike - catchLoad * 0.10;
    if (this.rightHand) this.rightHand.rotation.z = 0.18 * hike + catchLoad * 0.10;
    if (this.leftLowerLeg) this.leftLowerLeg.rotation.x = 0.42 * hike + transferCrouch * 0.34;
    if (this.rightLowerLeg) this.rightLowerLeg.rotation.x = 0.42 * hike + transferCrouch * 0.34;
    if (this.leftFoot) this.leftFoot.rotation.x = -0.20 * hike - transferStep * 0.15;
    if (this.rightFoot) this.rightFoot.rotation.x = -0.20 * hike + transferStep * 0.15;

    // ── VARIÉTÉ D'ASSISE ─────────────────────────────────────────────────
    //
    // Photos de bordée sans gîte (Tour des yoles 2019, GFA Caraïbes) : au
    // repos les hommes ne font PAS le même geste — l'un regarde la voile,
    // l'autre le plan d'eau, un troisième se tourne vers son voisin. Six
    // silhouettes strictement identiques lisent comme des clones, pas comme
    // un équipage. Angle mort n°6 de l'audit, côté pose.
    //
    // Les coefficients dérivent de `this.phase` — `crewIndex * CREW_LAG`,
    // FIXE par homme : deux relectures d'un même replay montrent exactement
    // la même chose, et rien ici ne touche `dynamics`. Le tout s'efface dès
    // la sortie sur les bwa : au rappel, tout le monde travaille.
    const auPont = (this.role === "patron" || this.role === "ecoute")
      ? 0
      : (1 - clamp(hike * 2.4, 0, 1))
        * (1 - clamp(impact + stumble, 0, 1))
        * (1 - transferCrouch)
        * (1 - decrochage);
    const tourneRepos = Math.sin(this.phase * 2.63);
    const pencheRepos = Math.cos(this.phase * 1.71);
    if (auPont > 0.001) {
      this.root.rotation.y += tourneRepos * 0.24 * auPont;
      this.torso.rotation.z += pencheRepos * 0.06 * auPont;
      this.leftArmPivot.rotation.x += pencheRepos * 0.20 * auPont;
      this.rightArmPivot.rotation.x -= tourneRepos * 0.22 * auPont;
    }

    // Postes intérieurs documentés : le patron gouverne à la grande pagaie et
    // le manœuvrier d'écoute règle la voile. Ils partagent le même rig léger,
    // mais pas la gestuelle des dresseurs assis sur les bwa.
    if (this.role === "patron") {
      const helm = Math.sin(cadence * 0.58 + this.phase);
      this.motionState = "barre";
      this.root.rotation.y = -0.08 + helm * 0.045;
      this.hips.rotation.x = -0.23 + helm * 0.055 - roll * 0.10;
      this.hips.rotation.z = -roll * 0.22;
      this.torso.rotation.x = -0.17 - helm * 0.10;
      this.torso.rotation.z = helm * 0.06;
      this.leftArmPivot.rotation.x = -0.92 - helm * 0.23;
      this.rightArmPivot.rotation.x = -1.14 + helm * 0.19;
      // Consignes ABSOLUES, donc défalquées du bind comme le splay de course.
      this.leftArmPivot.rotation.z = -0.32 + this.bindSplay;
      this.rightArmPivot.rotation.z = 0.18 - this.bindSplay;
      this.leftLegPivot.rotation.x = -0.34;
      this.rightLegPivot.rotation.x = -0.46;
      if (this.leftForeArm) this.leftForeArm.rotation.x = -0.48 + helm * 0.16;
      if (this.rightForeArm) this.rightForeArm.rotation.x = -0.62 - helm * 0.13;
      if (this.neck) this.neck.rotation.y = 0.08 + helm * 0.06;
      // ── L'ORDRE DU PATRON ─────────────────────────────────────────────
      //
      // Angle mort n°7 de l'audit d'authenticité : rien n'annonçait le
      // changement de bord. Sur l'eau, le virement se COMMANDE — le patron
      // lève le bras et les dresseurs traversent dans la foulée. Le geste est
      // calé sur l'horloge réelle du virement (`bordElapsed`), pas sur la
      // gîte : un coup de tabac ne doit pas faire gesticuler le patron.
      // C'est le bras GAUCHE qui se lève : la main droite tient la pagaie.
      const ordre = motionPulse(shiftMotion?.bordElapsed ?? 99, 0.0, 0.09, 0.55, 0.88);
      if (ordre > 0.001) {
        // Bras presque TENDU et haut : à la distance de jeu, un coude plié se
        // lit comme un geste de fatigue, pas comme un commandement.
        this.leftArmPivot.rotation.x += (-2.68 - this.leftArmPivot.rotation.x) * ordre;
        this.leftArmPivot.rotation.z += (0.10 - this.leftArmPivot.rotation.z) * ordre;
        if (this.leftForeArm) {
          this.leftForeArm.rotation.x += (-0.06 - this.leftForeArm.rotation.x) * ordre;
        }
        // Il ne crie pas vers l'eau : il se tourne vers ses hommes.
        if (this.neck) this.neck.rotation.y += ordre * 0.34;
      }
    } else if (this.role === "ecoute") {
      const pull = Math.sin(cadence * 0.72 + this.phase);
      const load = 0.5 + 0.5 * Math.max(0, pull);
      this.motionState = "ecoute";
      this.root.rotation.y = 0.24;
      this.hips.rotation.x = -0.16 + load * 0.10;
      this.hips.rotation.z = -roll * 0.18;
      this.torso.rotation.x = -0.12 - load * 0.24;
      this.torso.rotation.z = -0.10;
      this.leftArmPivot.rotation.x = -0.72 - pull * 0.28;
      this.rightArmPivot.rotation.x = -1.08 + pull * 0.24;
      this.leftArmPivot.rotation.z = -0.22 + this.bindSplay;
      this.rightArmPivot.rotation.z = 0.26 - this.bindSplay;
      this.leftLegPivot.rotation.x = -0.42;
      this.rightLegPivot.rotation.x = -0.28;
      if (this.leftForeArm) this.leftForeArm.rotation.x = -0.58 + pull * 0.22;
      if (this.rightForeArm) this.rightForeArm.rotation.x = -0.44 - pull * 0.22;
      if (this.neck) this.neck.rotation.y = -0.11;
    }

    // ── LA GORGÉE DE RHUM ───────────────────────────────────────────────────
    //
    // Appliquée APRÈS la pose de course, en MÉLANGE et non en remplacement :
    // l'homme continue de tenir son bois et de suivre la houle, il porte juste
    // le goulot à la bouche. Écraser la pose ferait un mannequin figé au milieu
    // d'un bateau qui vit.
    //
    // ⚠️ Purement visuel — même règle que `setOverboard` : rien ici ne touche
    // `dynamics`, donc rien n'entre dans le checksum de replay.
    if (drink > 0.001) {
      // Bras droit levé, coude rentré : le geste du goulot, pas un salut.
      this.rightArmPivot.rotation.x += (-2.25 - this.rightArmPivot.rotation.x) * drink;
      this.rightArmPivot.rotation.z += (0.12 - this.rightArmPivot.rotation.z) * drink;
      // Tête et buste renversés en arrière — c'est ce mouvement-là qui se lit
      // de loin, bien plus que le bras.
      this.torso.rotation.x += (-0.34 - this.torso.rotation.x) * drink * 0.85;
      this.hips.rotation.x += (-0.20 - this.hips.rotation.x) * drink * 0.45;
    }
    // L'élan commun survit brièvement à l'arrêt des corps ; la reprise de
    // charge comprime ensuite bassin et buste. Aucun de ces offsets ne touche
    // la racine ni les cibles IK : mains, pieds et assise restent sur le bwa.
    const loadCompression = Math.max(0, loadRecoil);
    const loadRebound = Math.max(0, -loadRecoil);
    this.torso.rotation.z -= weightMomentum * 0.045;
    this.hips.rotation.x += loadCompression * 0.10 - loadRebound * 0.05;
    this.torso.rotation.x += loadCompression * 0.13 - loadRebound * 0.07;
    // La tête garde le plan d'eau dans le regard : elle compense l'essentiel du
    // renversement du buste, sinon l'homme fixe le ciel.
    this.head.rotation.x = boostLean * 0.32 - recline * 0.62 + pump * effort * 0.10 - scoop * 0.30;
    this.head.rotation.x += drive * 0.10 - catchLoad * 0.16 + absorb * 0.08;
    this.head.rotation.z = 0;
    this.head.rotation.y = this.role === "premier"
      ? Math.sin(cadence * 0.34 + this.phase) * 0.11 + scoutBrace * side * 0.85
      : transferStep * 0.08 + pencheRepos * 0.38 * auPont;
    // ── LE COUP D'ŒIL AU PATRON ──────────────────────────────────────────
    //
    // Avant de traverser, l'homme guette le commandement : le regard part vers
    // la poupe dans la demi-seconde qui précède son tour et revient dès qu'il
    // s'engage. La fenêtre se ferme au début de SA traversée — un regard qui
    // arriverait après son départ se lirait comme un retard. Le premier
    // dresseur n'en a pas besoin : c'est lui qui engage, il a déjà le sien.
    const attenteOrdre = (this.role === "patron" || this.role === "ecoute" || this.role === "premier")
      ? 0
      : motionPulse(
          (shiftMotion?.bordElapsed ?? 99) - (shiftMotion?.bordDelai ?? 0),
          -0.42, -0.22, -0.02, 0.12
        );
    if (attenteOrdre > 0.001) this.head.rotation.y += attenteOrdre * -side * 0.55;

    // ── DÉCROCHAGE : RECROQUEVILLÉ CONTRE LA COQUE ───────────────────────
    //
    // La glisse vers le plat-bord est déjà jouée par le déploiement (côté
    // YoleVisual) ; ici le corps se FERME : bassin et buste se replient, les
    // bras se ramènent devant, la tête rentre et cherche la coque. C'est la
    // posture de celui qui retient tout, en attendant que ça tranche.
    if (decrochage > 0.001) {
      this.hips.rotation.x += decrochage * 0.40;
      this.torso.rotation.x += decrochage * 0.32;
      this.leftArmPivot.rotation.x += decrochage * 0.30;
      this.rightArmPivot.rotation.x += decrochage * 0.30;
      this.head.rotation.x += decrochage * 0.20;
      this.head.rotation.y += decrochage * -side * 0.35;
    }
    if (this.neck) {
      this.neck.rotation.x = -recline * 0.18 + catchLoad * 0.08;
      this.neck.rotation.y = this.head.rotation.y * 0.42;
      this.neck.rotation.z = -roll * 0.04 * settle;
    }
    // La tête de la gorgée était auparavant écrite puis immédiatement écrasée
    // par la compensation de regard. Elle est maintenant appliquée en dernier.
    if (drink > 0.001) this.head.rotation.x += (0.62 - this.head.rotation.x) * drink;

    // ASSISE. À bord on est debout sur le pont (0,28) ; sorti sur le bois on
    // s'assoit DESSUS, donc le bassin descend au niveau de la perche.
    //
    // ⚠️ Mesuré : le groupe `hips` est à 0,38 au-dessus de la racine et les bois
    // à 0,25. Une racine laissée à 0,28 plaçait donc le bassin à 0,66, soit
    // 0,41 m AU-DESSUS de la perche — l'homme ne s'asseyait sur rien. C'est ça,
    // et pas la pose des membres, qui le faisait paraître détaché du bateau.
    //
    // ⚠️ L'assise ne suit PAS `hike`, qui mesure seulement à quelle distance on
    // est sorti. Être assis ou debout ne dépend pas de la distance mais du fait
    // d'avoir franchi le plat-bord (|x| = 0,90) : dès qu'on est dessus, on est
    // sur le bois. Lier les deux laissait un homme à 1,6 m — donc largement
    // au-dessus de l'eau — encore à moitié debout, bassin à 0,19 m de la perche.
    // ⚠️ SEUIL ABAISSÉ AVEC L'ARRIVÉE DE `CREW_GUNWALE_REST`, ET IL DEVAIT
    // BOUGER EN MÊME TEMPS.
    //
    // Il valait `(|x| − 0,75) / 0,75` : calibré pour le bwa, il n'atteignait 1
    // qu'à 1,50 m. Un homme posé au plat-bord à 0,86 m n'aurait été « assis »
    // qu'à 15 %, donc resté debout à 0,28 m de haut — on aurait remplacé le tas
    // au milieu par une haie de types debout sur le bord.
    //
    // Le plat-bord et le bwa sont à la MÊME cote (0,25) : s'asseoir sur l'un ou
    // sur l'autre est le même geste, et `seat` place déjà le bassin à cette
    // hauteur. Le seuil décrit donc simplement « a franchi le bord », ce qui
    // arrive dès 0,83 m.
    // ⚠️ ET LA RAMPE COMPTE AUTANT QUE LE SEUIL — CORRIGÉ LE 5 AOÛT 2026.
    //
    // La première version de ce reglage, `(|x| − 0,55) / 0,28`, atteignait bien
    // 1 au plat-bord mais sur 28 cm de course seulement, contre 75 cm avant.
    // Or l'assise fait varier la racine de 0,88 m : comprimée sur 28 cm, ça fait
    // plus de trois mètres de hauteur par mètre de déport.
    //
    // Mesuré au balayage de gîte : entre 4° et 6°, la hauteur du plus haut
    // équipier sautait de −0,53 m à +0,09 m. SOIXANTE-DEUX CENTIMÈTRES d'un
    // coup — deux hommes se dressaient debout sur le bord pendant que les
    // autres restaient assis. Ça arrive dès que le déport de simulation
    // s'oppose au côté visuel et ramène brièvement `|x|` sous le seuil.
    //
    // ⚠️ ET LA RAMPE DOIT ÊTRE PLEINE DÈS LA PLUS PETITE STATION.
    //
    // Élargir ne suffisait pas : il restait 31 cm de saut à 6°, et la mesure a
    // désigné le poste INTÉRIEUR. Sa portée est de 0,58 m, donc INFÉRIEURE à la
    // cote de repos de 0,86 : en se déployant, cet homme-là rentre vers l'axe
    // au lieu de sortir, repasse sous le seuil, et se lève.
    //
    // La rampe se termine donc à 0,58 — la plus petite portée de station — et
    // non au plat-bord. Tout homme au travail, quelle que soit sa station, est
    // alors franchement assis ; seul celui qu'on ramène vraiment au milieu de
    // la coque se redresse.
    const seated = clamp((Math.abs(drawnX) - 0.20) / 0.38, 0, 1);
    // ⚠️ L'ASSISE SUIT LE CORPS RÉELLEMENT UTILISÉ — MESURE DU 2 AOÛT 2026.
    // `0.38` était la hauteur de bassin du corps PROCÉDURAL, appliquée aussi au
    // rig GLB qui, lui, est normalisé en hauteur : ses six équipiers flottaient
    // de 7 à 17 cm au-dessus du bois, mains hors de portée de la perche.
    // `measureHipHeight` relève la vraie valeur à la liaison du rig.
    // ⚠️ × L'ÉCHELLE. ERREUR DE REPÈRE CORRIGÉE, ET ELLE ÉTAIT VISIBLE EN JEU.
    //
    // `measureHipHeight` relève la hauteur du bassin dans l'espace LOCAL de la
    // racine, donc AVANT l'échelle de présentation que `YoleVisual` pose ensuite. Or
    // `root.position.y` s'écrit dans l'espace du PARENT. Sans la conversion,
    // l'assise descendait de 0,58 au lieu de 0,51 : sept centimètres de trop.
    //
    // Effet constaté en début de partie, bateau encore droit — les équipiers
    // sortis à 1,8-3,8 m se retrouvaient 33 cm sous le plat-bord, donc SOUS LA
    // SURFACE, et l'équipage paraissait avoir disparu.
    //
    // L'ancien `0.38` du corps procédural souffrait déjà du même défaut, en plus
    // discret (4,6 cm) ; la conversion le corrige aussi.
    const echelleCorps = Math.max(0.001, this.root.scale.y || 1);
    const seat = CREW_BEAM_Y - (this.hipHeight ?? CREW_PROCEDURAL_HIP_HEIGHT) * echelleCorps;
    this.root.position.y = 0.28 * (1 - seated) + seat * seated
      + Math.abs(Math.sin(cycle)) * (0.035 + boostForward * 0.018) * run * (1 - seated)
      // Assis, le bassin EST le pivot sur le bois : l'abaisser pour donner du
      // poids ferait traverser la perche. La compression verticale ne concerne
      // donc que l'appui encore dans la coque ; dehors, bras/torse/jambes portent
      // toute la charge et le bwa fléchit sous lui.
      + (-brace * 0.055 - catchLoad * 0.075 + absorb * 0.025 - transferCrouch * 0.12) * (1 - seated);
    if (this.rigJoints) {
      // ─── RESPIRATION ──────────────────────────────────────────────────────
      //
      // ⚠️ LA PHASE, PAS LE HASARD. `this.phase` vaut `crewIndex * CREW_LAG` :
      // les six hommes respirent donc décalés, sans tirage aléatoire, donc deux
      // relectures d'un même replay montrent exactement la même chose.
      // Six respirations synchrones se lisent comme un bug d'animation ; c'est
      // le même raisonnement que pour la gorgée de rhum échelonnée.
      //
      // Le poids s'efface dès que le corps encaisse : sous impact, trébuchement
      // ou traversée, la simulation a bien mieux à dire qu'un souffle de repos.
      const calme = (1 - clamp(impact, 0, 1))
        * (1 - clamp(stumble, 0, 1))
        * (1 - transferCrouch)
        * (1 - decrochage);
      const clipTime = time * 0.62 + this.phase * 1.9;
      const poseAction = selectCrewPoseAction(
        this.clipLibrary, this.role, this.stagingStation
      );
      const compression = Math.max(
        transferCrouch,
        brace * 0.58,
        catchLoad * 0.72
      );
      const overlayAction = selectCrewTransitionAction(
        this.clipLibrary, sideChanging, compression
      );
      const deployment = Number.isFinite(this.stagingDeployment)
        ? clamp(this.stagingDeployment, 0, 1)
        : hike;
      // L'assise est tenue en permanence : c'est elle qui donne une pose à
      // l'homme resté dans le bateau, là où il n'en avait aucune.
      const seatAction = selectCrewSeatAction(this.clipLibrary);
      const seatWeight = seatAction ? CREW_SEAT_POSE_WEIGHT : 0;
      // La station se superpose à l'assise, donc son poids n'a plus à ramener
      // le corps depuis le bind : il ne décrit plus que la SORTIE. Elle reste
      // muette pour ceux dont la station EST l'assise — spécialistes et poste
      // intérieur — sinon la même pose se mélangerait à elle-même.
      const poseWeight = poseAction && poseAction !== seatAction
        ? CREW_STATION_POSE_WEIGHT * deployment
        : 0;
      const overlayWeight = overlayAction === "compression_transition"
        ? compression * 0.68
        : compression * 0.35;
      const overlayDuration = overlayAction
        ? this.clipLibrary.duration(overlayAction) || 1
        : 1;
      const overlayPhase = sideChanging
        ? sideTransfer
        : clamp((shiftLocal + 0.08) / 1.0, 0, 1);

      if (seatWeight > 0.001 || poseWeight > 0.001 || overlayWeight > 0.001) {
        this.setSeatBlend(seatAction, clipTime, seatWeight);
        this.setPoseBlend(
          poseAction,
          clipTime,
          poseWeight,
          overlayAction,
          overlayPhase * overlayDuration,
          overlayWeight
        );
        // Gardé prêt pour le retour au repos ; la branche macro l'ignore.
        this.setClipBlend("rappel_idle", clipTime, CREW_IDLE_BLEND * calme);
      } else {
        this.setSeatBlend(null, 0, 0);
        this.setPoseBlend(null, 0, 0, null, 0, 0);
        const legacyAction = this.role === "patron" && this.clipLibrary?.has("barre")
          ? "barre"
          : this.role === "ecoute" && this.clipLibrary?.has("ecoute")
            ? "ecoute"
            : "rappel_idle";
        this.setClipBlend(
          legacyAction,
          clipTime,
          legacyAction === "rappel_idle" ? CREW_IDLE_BLEND * calme : 0.22 * calme
        );
      }
      this.syncRig();
      if (shiftMotion?.solveContacts !== false) {
        this.applyRigContacts(hike, seated, catchLoad, transferCrouch);
      } else {
        this.firmContactError = 0;
        this.softContactError = 0;
        this.contactError = 0;
      }
    }
  }
}

export class YoleVisual {
  constructor(THREE, color, accent, index, assets = null, options = {}) {
    this.THREE = THREE;
    this.assets = assets;
    this.graphicStyle = Boolean(options.graphicStyle);
    // Signal d'équipe immuable pour le HUD, les impacts et la marque de voile.
    // La peinture de coque appliquée plus bas est un axe cosmétique distinct.
    this.identityColor = color;
    this.color = color;
    this.accent = accent;
    this.index = index;
    this.root = new THREE.Group();
    this.tiltRoot = new THREE.Group();
    this.root.add(this.tiltRoot);
    this.handlingReducedMotion = prefersReducedMotion();

    // La texture de coque est NEUTRE et désaturée : elle est multipliée par la
    // couleur d'équipe. Une texture déjà colorée écraserait cette teinte et
    // ferait perdre au joueur la lecture du classement — les quatre yoles
    // partagent la même géométrie et ne se distinguent QUE par la couleur.
    const hullTexture = assets?.texture?.("hull") ?? null;
    this.hullMaterial = new THREE.MeshStandardMaterial({
      map: hullTexture,
      color,
      roughness: this.graphicStyle ? 0.88 : 0.4,
      metalness: this.graphicStyle ? 0 : 0.06,
      flatShading: this.graphicStyle,
      emissive: new THREE.Color(color).multiplyScalar(this.graphicStyle ? 0.018 : 0.035)
    });
    // Ligne de flottaison : sans elle une coque est POSEE sur l'eau, jamais
    // dedans. On assombrit et on lustre la partie immergee, et on pose une
    // collerette d'ecume a la surface. Le niveau d'eau arrive en uniforme
    // depuis la simulation, donc la collerette suit la houle et la gite.
    this.waterLevelUniform = { value: 0 };
    this.hullMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.uWaterLevel = this.waterLevelUniform;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>
varying vec3 vHullWorld;`)
        .replace("#include <project_vertex>", `vHullWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
#include <project_vertex>`)
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>
uniform float uWaterLevel;
varying vec3 vHullWorld;`)
        .replace("#include <color_fragment>", `#include <color_fragment>
          float belowWater = uWaterLevel - vHullWorld.y;
          float wet = smoothstep(-0.04, 0.30, belowWater);
          diffuseColor.rgb *= mix(1.0, 0.46, wet);
          float foam = smoothstep(0.16, 0.0, abs(belowWater));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.99, 1.0), foam * 0.8);
        `)
        // roughnessFactor n'est déclaré qu'ici : l'assigner depuis
        // <color_fragment> ne compile pas (identifiant inconnu).
        .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
          roughnessFactor *= mix(1.0, 0.42, smoothstep(-0.04, 0.30, uWaterLevel - vHullWorld.y));
        `);
    };

    this.accentMaterial = new THREE.MeshStandardMaterial({
      color: accent,
      roughness: this.graphicStyle ? 0.9 : 0.52,
      metalness: 0,
      flatShading: this.graphicStyle
    });
    this.darkMaterial = new THREE.MeshStandardMaterial({
      color: 0x102531,
      roughness: this.graphicStyle ? 0.94 : 0.78,
      flatShading: this.graphicStyle
    });
    // Le bois est partagé par les 7 bois dressés, le mât et la vergue : une
    // seule texture couvre 28 perches à l'écran.
    const woodTexture = assets?.texture?.("wood") ?? null;
    if (woodTexture && THREE.RepeatWrapping) {
      woodTexture.wrapS = THREE.RepeatWrapping;
      woodTexture.wrapT = THREE.RepeatWrapping;
    }
    this.woodMaterial = new THREE.MeshStandardMaterial({
      map: woodTexture,
      color: woodTexture ? 0xffffff : 0xd69542,
      roughness: this.graphicStyle ? 0.94 : 0.74,
      flatShading: this.graphicStyle
    });

    // La coque peut venir d'un GLB partage ; le materiau reste celui de l'equipage,
    // sinon les quatre yoles perdraient leur couleur. Aucun asset => procedural.
    const hullGeometry = assets?.get("hull") ?? makeHullGeometry(THREE);
    this.hullFromAsset = Boolean(assets?.has("hull"));
    this.hull = new THREE.Mesh(hullGeometry, this.hullMaterial);
    this.hull.scale.x = HULL_VISUAL_WIDTH_SCALE;
    this.hull.castShadow = true;
    this.hull.receiveShadow = true;
    this.tiltRoot.add(this.hull);
    if (this.graphicStyle) {
      // Un contour de silhouette, pas un filtre d'arêtes plein écran : il reste
      // stable sur mobile, ne hachure pas la mer et coûte un seul mesh par yole.
      const outlineMaterial = new THREE.MeshBasicMaterial({
        color: 0x071c2b,
        side: THREE.BackSide,
        toneMapped: false
      });
      this.hullOutline = new THREE.Mesh(hullGeometry, outlineMaterial);
      this.hullOutline.scale.set(
        HULL_VISUAL_WIDTH_SCALE * 1.065,
        1.06,
        1.025
      );
      this.hullOutline.renderOrder = -1;
      this.tiltRoot.add(this.hullOutline);
    }

    const gunwaleLeft = new THREE.Mesh(new THREE.BoxGeometry(0.11 * HULL_VISUAL_WIDTH_SCALE, 0.13, 8.8), this.accentMaterial);
    const gunwaleRight = gunwaleLeft.clone();
    gunwaleLeft.position.set(-0.88 * HULL_VISUAL_WIDTH_SCALE, 0.16, 0);
    gunwaleRight.position.set(0.88 * HULL_VISUAL_WIDTH_SCALE, 0.16, 0);
    this.tiltRoot.add(gunwaleLeft, gunwaleRight);

    const deck = new THREE.Mesh(new THREE.BoxGeometry(1.48 * HULL_VISUAL_WIDTH_SCALE, 0.11, 5.9), this.darkMaterial);
    deck.position.y = 0.10;
    this.tiltRoot.add(deck);

    this.internalWaterMaterial = new THREE.MeshStandardMaterial({
      color: 0x1cc9e0,
      emissive: 0x075f78,
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.0,
      roughness: 0.18,
      depthWrite: false
    });
    this.internalWater = new THREE.Mesh(new THREE.BoxGeometry(1.35 * HULL_VISUAL_WIDTH_SCALE, 0.035, 5.25), this.internalWaterMaterial);
    this.internalWater.position.y = 0.14;
    this.tiltRoot.add(this.internalWater);

    // Les mâts d'une yole sont nettement raqués VERS L'AVANT : c'est une part
    // majeure de sa silhouette, et elle manquait. Un groupe porte tout le
    // gréement arrière pour que voile, marque et déchirures suivent le rake.
    this.rigMain = new THREE.Group();
    this.rigMain.rotation.x = MAST_RAKE;
    this.tiltRoot.add(this.rigMain);

    this.mastGroup = new THREE.Group();
    this.mast = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.095, 6.35, 9), this.woodMaterial);
    this.mast.position.set(0, 3.08, 0.5);
    this.mast.castShadow = true;
    this.mastGroup.add(this.mast);
    this.rigMain.add(this.mastGroup);

    this.brokenMast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.085, 3.1, 8), this.woodMaterial);
    this.brokenMast.position.set(0.15, 2.8, 0.2);
    this.brokenMast.visible = false;
    this.rigMain.add(this.brokenMast);

    this.sailGeometry = makeSailGeometry(THREE);
    // La voile est la plus grande surface d'une yole à l'écran, et elle a déjà
    // ses UV : c'est le meilleur rapport gain/effort de tout le rendu.
    // Atlas de voiles 2x2 : chaque yole prend sa case. C'est la personnalisation,
    // pour le prix d'un décalage d'UV — la voile est déjà UV-mappée.
    let sailTexture = assets?.texture?.("sail") ?? null;
    const atlas = assets?.texture?.("sailAtlas") ?? null;
    if (atlas) {
      sailTexture = atlas.clone();
      sailTexture.needsUpdate = true;
    }
    this.sailAtlasTexture = atlas ? sailTexture : null;
    this.sailMaterial = new THREE.MeshStandardMaterial({
      map: sailTexture,
      color: sailTexture ? 0xffffff : accent,
      side: THREE.DoubleSide,
      roughness: this.graphicStyle ? 0.94 : 0.52,
      flatShading: this.graphicStyle,
      transparent: false,
      opacity: 1,
      emissive: new THREE.Color(color).multiplyScalar(this.graphicStyle ? 0.025 : 0.07)
    });
    this.sail = new THREE.Mesh(this.sailGeometry, this.sailMaterial);
    this.sail.castShadow = true;
    this.rigMain.add(this.sail);
    this.sailLiveryIndex = 0;
    this.setSailLivery(index);

    const mark = new THREE.Mesh(new THREE.CircleGeometry(0.43, 24), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    mark.position.set(0.075, 3.15, -0.58);
    mark.rotation.y = Math.PI / 2;
    this.rigMain.add(mark);
    this.identityMark = mark;

    this.sailTears = [];
    const tearGeometry = new THREE.CircleGeometry(0.18, 10);
    const tearMaterial = new THREE.MeshBasicMaterial({ color: 0x07141b, transparent: true, opacity: 0.78, side: THREE.DoubleSide, depthWrite: false });
    for (const [y, z, scale] of [[2.1, -1.45, 1], [3.5, -0.7, 0.8], [4.55, -0.22, 0.65]]) {
      const tear = new THREE.Mesh(tearGeometry, tearMaterial);
      tear.position.set(0.068, y, z);
      tear.rotation.y = Math.PI / 2;
      tear.scale.set(scale, scale * 0.55, 1);
      tear.visible = false;
      this.sailTears.push(tear);
      this.rigMain.add(tear);
    }

    // Sur l'eau, les bois dressés forment un FAISCEAU serré sur lequel
    // l'équipage se déporte, pas quatre perches espacées. On densifie et on
    // fait varier les longueurs — c'est la signature visuelle du sport.
    this.beams = [];
    const beamGeometry = new THREE.CylinderGeometry(0.048, 0.068, 1, 6);
    const canInstanceBeams = Boolean(
      THREE.InstancedMesh && THREE.Object3D && THREE.Matrix4
    );
    this.beamInstances = canInstanceBeams
      ? new THREE.InstancedMesh(beamGeometry, this.woodMaterial, BEAM_LAYOUT.length)
      : null;
    if (this.beamInstances) {
      this.beamInstances.castShadow = true;
      // Le groupe yole est déjà culé comme un tout par Game.cullYoles().
      // L'enveloppe locale des instances change à chaque contre-gîte.
      this.beamInstances.frustumCulled = false;
      this.beamInstances.instanceMatrix.setUsage?.(THREE.DynamicDrawUsage);
      this.beamInstanceMatrix = new THREE.Matrix4();
      this.beamHiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
      this.tiltRoot.add(this.beamInstances);
    }
    for (const [z, length] of BEAM_LAYOUT) {
      const beamRoot = new THREE.Group();
      beamRoot.position.set(0, 0.25, z);
      // En WebGL réel, l'objet est un transform virtuel dont la matrice alimente
      // l'InstancedMesh. Les mocks de test sans InstancedMesh gardent le chemin
      // Mesh historique.
      const beam = this.beamInstances
        ? new THREE.Object3D()
        : new THREE.Mesh(beamGeometry, this.woodMaterial);
      beam.rotation.z = Math.PI / 2;
      beam.scale.y = length;
      beam.castShadow = true;
      if (!this.beamInstances) beamRoot.add(beam);
      this.beams.push({
        root: beamRoot,
        beam,
        length,
        baseZ: z,
        windwardOffset: length * 0.5 - BEAM_INBOARD_REACH
      });
      this.tiltRoot.add(beamRoot);
    }
    this.syncBeamInstances();

    this.cracks = [];
    const crackMaterial = new THREE.MeshBasicMaterial({ color: 0x190e0b, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false });
    for (let i = 0; i < 4; i++) {
      const crack = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 1.2 + i * 0.15), crackMaterial.clone());
      crack.position.set((i % 2 ? 1 : -1) * 0.91 * HULL_VISUAL_WIDTH_SCALE, -0.15, -2.8 + i * 1.8);
      crack.rotation.y = i % 2 ? -Math.PI / 2 : Math.PI / 2;
      crack.rotation.z = 0.45 + i * 0.18;
      crack.visible = false;
      this.cracks.push(crack);
      this.tiltRoot.add(crack);
    }

    this.crew = [];
    this.crewMaterial = null;
    this.overboard = false;
    this.crewCulled = false;
    this.crewDetail = 2;
    const skins = CREW_SKINS;
    const zPositions = CREW_BEAMS.map((beam) => BEAM_LAYOUT[beam][0]);
    for (let crewIndex = 0; crewIndex < 6; crewIndex++) {
      // Un squelette par équipier : instantiate() clone la hiérarchie ET sa
      // liaison d'os, sinon les 24 équipiers partageraient la même pose.
      const crewRig = assets?.hasRig("crew") ? assets.instantiate("crew") : null;
      if (crewRig && !this.crewMaterial) this.crewMaterial = makeCrewMaterial(THREE, crewRig, color);
      // Une seule bibliothèque d'actions pour toute la yole : les clips sont
      // identiques d'un équipier à l'autre, seule la PHASE diffère. En
      // construire une par corps indexerait trente-deux fois les mêmes pistes.
      if (!this.crewClips) {
        // La respiration de repli est TOUJOURS fusionnée. Un GLB qui fournit
        // les cinq poses macro mais pas `rappel_idle` ne doit pas rendre le
        // repos muet. Placée en premier, elle est remplacée naturellement si
        // l'asset livre plus tard sa propre action du même nom.
        const idle = makeDefaultIdleClip();
        const glbClips = assets?.animations?.("crew") ?? [];
        this.crewClips = new CrewClipLibrary(idle ? [idle, ...glbClips] : glbClips);
      }
      const visual = new CrewVisual(THREE, skins[(crewIndex + index) % skins.length], color, 0x0d2531, crewIndex * CREW_LAG, crewRig, this.crewMaterial, this.crewClips ?? null);
      // Géométries et matériaux de coiffe créés UNE FOIS par yole et partagés
      // par ses six équipiers : trois variantes, aucun coût de draw call
      // supplémentaire par rapport à la casquette unique.
      if (!this.headKits) this.headKits = makeHeadKits(THREE);
      // Répartition déterministe : le décalage par `index` évite que les quatre
      // yoles portent la même séquence de coiffes.
      const kit = this.headKits[(crewIndex * 2 + index) % this.headKits.length];
      visual.addHeadgear(THREE, visual.fromRig ? visual.headBone : visual.head, kit);
      // Tous les yoleurs n'ont pas le même gabarit. Motif déterministe, pas de
      // tirage : un équipage doit être identique d'une relecture à l'autre.
      visual.root.scale.setScalar(crewPresentationScale(
        visual.fromRig,
        CREW_BUILD[(crewIndex + index * 3) % CREW_BUILD.length]
      ));
      // Motif déterministe, pas de tirage : un équipage doit être identique
      // d'une relecture à l'autre, y compris dans ses postures.
      visual.posture = CREW_POSTURE[(crewIndex + index) % CREW_POSTURE.length];
      visual.role = CREW_ROLES[crewIndex] ?? "dresseur";
      const staging = CREW_STAGING_PROFILES[crewIndex];
      visual.stagingFamily = staging.family;
      visual.stagingStation = staging.station;
      visual.contactLead = crewIndex % 2;
      visual.root.userData.crewRole = visual.role;
      visual.root.userData.stagingFamily = staging.family;
      visual.root.userData.stagingStation = staging.station;
      visual.root.position.z = zPositions[crewIndex];
      // Seul le rig importé s'assoit : la table de descente est dérivée de SES
      // proportions. Le corps procédural garde la sienne (voir CREW_SEAT_Y).
      if (visual.fromRig) visual.root.position.y = CREW_SEAT_Y;
      this.crew.push({ visual, z: zPositions[crewIndex], shiftMotion: {} });
      this.tiltRoot.add(visual.root);
    }
    // Une grande yole à une voile compte couramment huit hommes : les six
    // dresseurs simulés restent sur les bwa, tandis que deux spécialistes
    // visuels occupent enfin les postes qui manquaient — écoute et patron.
    // Ils n'entrent pas dans activeCrew : ajouter leur masse à la physique
    // casserait les replays pour une correction d'abord iconographique.
    this.specialists = [];
    for (let specialistIndex = 0; specialistIndex < CREW_SPECIALISTS.length; specialistIndex++) {
      const station = CREW_SPECIALISTS[specialistIndex];
      const crewIndex = this.crew.length + specialistIndex;
      const crewRig = assets?.hasRig("crew") ? assets.instantiate("crew") : null;
      if (crewRig && !this.crewMaterial) this.crewMaterial = makeCrewMaterial(THREE, crewRig, color);
      const visual = new CrewVisual(
        THREE,
        skins[(crewIndex + index) % skins.length],
        color,
        0x0d2531,
        crewIndex * CREW_LAG,
        crewRig,
        this.crewMaterial,
        this.crewClips ?? null
      );
      if (!this.headKits) this.headKits = makeHeadKits(THREE);
      const kit = this.headKits[(crewIndex * 2 + index) % this.headKits.length];
      visual.addHeadgear(THREE, visual.fromRig ? visual.headBone : visual.head, kit);
      visual.root.scale.setScalar(crewPresentationScale(
        visual.fromRig,
        CREW_BUILD[(crewIndex + index * 3) % CREW_BUILD.length]
      ));
      visual.posture = CREW_POSTURE[(crewIndex + index) % CREW_POSTURE.length];
      visual.role = station.role;
      visual.contactLead = specialistIndex % 2;
      visual.root.userData.crewRole = station.role;
      visual.root.position.set(station.x, visual.fromRig ? CREW_SEAT_Y : 0.28, station.z);
      this.specialists.push({ visual, ...station, shiftMotion: {} });
      this.tiltRoot.add(visual.root);
    }
    this.crewSides = new Float32Array(this.crew.length);
    this.crewSideStarts = new Float32Array(this.crew.length);
    this.crewSideProgress = new Float32Array(this.crew.length);
    this.beamSides = new Float32Array(this.beams.length);
    this.windwardTarget = 0;
    this.sideChangeElapsed = 99;

    // Grande pagaie du patron et écoute de voile : deux silhouettes simples
    // qui survivent mieux à la caméra de course qu'un détail de mains.
    this.patronPaddleRoot = new THREE.Group();
    this.patronPaddle = cylinderBetween(THREE, 0.045, 3.55, this.woodMaterial);
    this.patronPaddleBlade = new THREE.Mesh(
      new THREE.BoxGeometry(0.30, 0.58, 0.075),
      this.woodMaterial
    );
    this.patronPaddleBlade.position.y = -1.83;
    this.patronPaddleRoot.add(this.patronPaddle, this.patronPaddleBlade);
    this.tiltRoot.add(this.patronPaddleRoot);
    this.paddleUp = new THREE.Vector3(0, 1, 0);
    this.paddleDirection = new THREE.Vector3();
    // Position de la main du patron, réutilisée d'une frame à l'autre : lire un
    // os à chaque image ne doit rien allouer.
    this.paddleGrip = new THREE.Vector3();

    const sheetMaterial = new THREE.MeshStandardMaterial({
      color: 0xe5d7aa,
      roughness: 0.92,
      metalness: 0
    });
    this.sheetRoot = new THREE.Group();
    this.sheetLine = cylinderBetween(THREE, 0.014, SHEET_LINE_LENGTH, sheetMaterial);
    this.sheetRoot.add(this.sheetLine);
    this.tiltRoot.add(this.sheetRoot);
    this.sheetDirection = new THREE.Vector3();
    // Point d'amure et poing du manœuvrier, réutilisés d'une frame à l'autre.
    this.sheetAnchor = new THREE.Vector3();
    this.sheetGrip = new THREE.Vector3();

    this.weaponPod = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.34, 0.9),
      new THREE.MeshStandardMaterial({ color: 0x0c2634, metalness: 0.48, roughness: 0.34 })
    );
    this.weaponPod.position.set(0, 0.38, 3.55);
    this.tiltRoot.add(this.weaponPod);
    this.cannonGlow = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 9), new THREE.MeshBasicMaterial({ color: 0x67f7ff }));
    this.cannonGlow.position.set(0, 0.48, 4.05);
    this.tiltRoot.add(this.cannonGlow);

    const turboMaterial = new THREE.MeshBasicMaterial({ color: 0xffdc4f, transparent: true, opacity: 0.0, depthWrite: false });
    this.turboFlame = new THREE.Mesh(new THREE.ConeGeometry(0.38, 2.4, 10), turboMaterial);
    this.turboFlame.rotation.x = Math.PI / 2;
    this.turboFlame.position.set(0, 0.18, 5.55);
    this.tiltRoot.add(this.turboFlame);
    const dashMaterial = new THREE.MeshBasicMaterial({ color: 0xff4ec4, transparent: true, opacity: 0.0, depthWrite: false });
    this.dashFlare = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.10, 6, 26), dashMaterial);
    this.dashFlare.rotation.x = Math.PI / 2;
    this.dashFlare.position.y = -0.05;
    this.tiltRoot.add(this.dashFlare);

    // Deux rails de mousse en un seul mesh : la direction du V montre l'angle
    // de glisse, sa largeur la derive et sa longueur le surf. Contrairement a
    // une gerbe de particules, ce repere reste lisible sans flash et ne cree
    // aucune allocation dans update(). Il est enfant de root (pas tiltRoot)
    // afin de rester plaque a l'eau quand la coque gite.
    const handlingWakeGeometry = new THREE.BufferGeometry();
    handlingWakeGeometry.setAttribute("position", new THREE.Float32BufferAttribute([
      -0.28, 0, 0, -0.06, 0, 0, -1.48, 0, -6.8, -0.92, 0, -6.8,
       0.06, 0, 0,  0.28, 0, 0,  0.92, 0, -6.8,  1.48, 0, -6.8
    ], 3));
    handlingWakeGeometry.setIndex([
      0, 2, 1, 1, 2, 3,
      4, 6, 5, 5, 6, 7
    ]);
    const handlingWakeMaterial = new THREE.MeshBasicMaterial({
      color: 0xd9fbff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this.handlingWakeRoot = new THREE.Group();
    this.handlingWakeRoot.position.z = -3.65;
    this.handlingWake = new THREE.Mesh(handlingWakeGeometry, handlingWakeMaterial);
    this.handlingWake.renderOrder = 3;
    this.handlingWakeRoot.add(this.handlingWake);
    this.root.add(this.handlingWakeRoot);

    // Bande de mousse asymétrique sur le bord immergé. Un mesh fixe par yole
    // remplace une gerbe de particules permanente : moins cher, plus lisible et
    // surtout directement corrélé à la gîte.
    const heelFoamGeometry = new THREE.BufferGeometry();
    heelFoamGeometry.setAttribute("position", new THREE.Float32BufferAttribute([
      -0.10, 0,  2.85,
       0.10, 0,  2.85,
      -0.36, 0, -2.85,
       0.36, 0, -2.85
    ], 3));
    heelFoamGeometry.setIndex([0, 2, 1, 1, 2, 3]);
    const heelFoamMaterial = new THREE.MeshBasicMaterial({
      color: 0xd9ffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
    this.heelFoam = new THREE.Mesh(heelFoamGeometry, heelFoamMaterial);
    this.heelFoam.renderOrder = 4;
    this.heelFoam.visible = false;
    this.root.add(this.heelFoam);

    this.impact = 0;
    this.normalFrame = -1;
    this.handlingSample = {};
    this.handlingSlip = 0;
    this.handlingSlipAngle = 0;
    this.handlingSurf = 0;
    this.handlingRecovery = 0;
    this.handlingWakeStrength = 0;
    this.waveHeave = 0;
    this.wavePitch = 0;
    this.crewMomentumSpring = { value: 0, velocity: 0 };
    this.counterHeelLoadSpring = { value: 0, velocity: 0 };
    this.counterHeelCatchSeen = false;
    this.counterHeelLastShiftElapsed = 0;
    this.rigProfileIndex = 1;
    this.crewKitIndex = 0;
    this.customization = null;
  }

  /**
   * Sélectionne réellement un quadrant de l'atlas 2×2. L'index reste normalisé
   * même sans texture, pour qu'un chargement dégradé garde un état cohérent.
   */
  setSailLivery(index) {
    const normalized = normalizeCustomization({ sailLivery: index }).sailLivery;
    this.sailLiveryIndex = normalized;
    const texture = this.sailAtlasTexture;
    if (texture) {
      texture.repeat?.set?.(0.5, 0.5);
      texture.offset?.set?.((normalized % 2) * 0.5, normalized < 2 ? 0.5 : 0);
      texture.needsUpdate = true;
      if (this.sailMaterial) this.sailMaterial.needsUpdate = true;
    }
    return normalized;
  }

  syncBeamInstances() {
    if (!this.beamInstances) return;
    for (let index = 0; index < this.beams.length; index++) {
      const entry = this.beams[index];
      if (!entry.beam.visible) {
        this.beamInstances.setMatrixAt(index, this.beamHiddenMatrix);
        continue;
      }
      entry.root.updateMatrix();
      entry.beam.updateMatrix();
      this.beamInstanceMatrix.multiplyMatrices(
        entry.root.matrix,
        entry.beam.matrix
      );
      this.beamInstances.setMatrixAt(index, this.beamInstanceMatrix);
    }
    this.beamInstances.instanceMatrix.needsUpdate = true;
  }

  /**
   * Rend le gréement choisi visible. Mât, voile, marque et déchirures restent
   * dans le même groupe ; la simulation demeure pilotée par setRig().
   */
  setRigProfile(index) {
    const normalized = normalizeCustomization({ rig: index }).rig;
    const profile = RIG_VISUAL_PROFILES[normalized] ?? RIG_VISUAL_PROFILES[1];
    this.rigProfileIndex = normalized;
    this.rigMain?.scale?.set?.(1, profile.height, profile.chord);
    if (this.rigMain?.rotation) this.rigMain.rotation.x = MAST_RAKE + profile.rake;
    return normalized;
  }

  setCrewKit(index) {
    const normalized = normalizeCustomization({ crewKit: index }).crewKit;
    const kit = CREW_KITS[normalized] ?? CREW_KITS[0];
    this.crewKitIndex = normalized;
    for (const entry of this.crew ?? []) {
      entry.visual?.setKitColors?.(kit.jersey, kit.shorts);
    }
    for (const entry of this.specialists ?? []) {
      entry.visual?.setKitColors?.(kit.jersey, kit.shorts);
    }
    return normalized;
  }

  /**
   * Applique un profil de garage et retourne sa forme canonique gelée.
   * `identityColor`, `color`, la marque de voile et Boat.color restent intacts :
   * les effets et le HUD conservent ainsi leur code d'équipe.
   */
  applyCustomization(profile) {
    const normalized = normalizeCustomization(profile);
    const hull = HULL_PAINTS[normalized.hullColor];
    const accent = GUNWALE_ACCENTS[normalized.accentColor];
    const wood = WOOD_FINISHES[normalized.woodFinish];

    this.hullMaterial?.color?.setHex?.(hull.color);
    this.accentMaterial?.color?.setHex?.(accent.color);
    this.woodMaterial?.color?.setHex?.(wood.color);
    if (this.woodMaterial) this.woodMaterial.roughness = wood.roughness;
    this.setCrewKit(normalized.crewKit);
    this.setSailLivery(normalized.sailLivery);
    this.setRigProfile(normalized.rig);
    this.customization = normalized;
    return normalized;
  }

  resetHandlingFeedback() {
    this.handlingSlip = 0;
    this.handlingSlipAngle = 0;
    this.handlingSurf = 0;
    this.handlingRecovery = 0;
    this.handlingWakeStrength = 0;
    this.waveHeave = 0;
    this.wavePitch = 0;
    this.tiltRoot.position.x = 0;
    this.tiltRoot.position.y = 0;
    this.handlingWakeRoot.rotation.y = 0;
    this.handlingWakeRoot.scale.x = 0.72;
    this.handlingWakeRoot.scale.z = 0.72;
    this.handlingWake.material.opacity = 0;
    this.handlingWake.visible = false;
    this.heelFoam.material.opacity = 0;
    this.heelFoam.visible = false;
  }

  resetCrewWeightFeedback() {
    this.crewMomentumSpring.value = 0;
    this.crewMomentumSpring.velocity = 0;
    this.counterHeelLoadSpring.value = 0;
    this.counterHeelLoadSpring.velocity = 0;
    this.counterHeelCatchSeen = false;
    this.counterHeelLastShiftElapsed = 0;
  }

  flashImpact(amount = 1) {
    this.impact = Math.max(this.impact, amount);
  }

  updateSail(time, windPower, storm, integrity) {
    const position = this.sailGeometry.attributes.position;
    const array = position.array;
    const base = this.sailGeometry.userData.basePositions;
    const columns = this.sailGeometry.userData.columns;
    const rows = this.sailGeometry.userData.rows;
    const damageFlutter = 1 - clamp(integrity, 0, 1);
    const billow = 0.14 + windPower * 0.28 + storm * 0.08;
    // ⚠️ `row / rows` N'EST PLUS `v`. Les rangs sont répartis de façon non
    // uniforme, resserrés vers la bordure où la densité de texels est 2,78 fois
    // plus forte. Continuer à déduire `v` de l'indice poserait le ventre de vent
    // trop haut sur la voile — le repli garde l'ancien calcul pour une
    // géométrie qui n'aurait pas ces tables.
    const paramU = this.sailGeometry.userData.paramU;
    const paramV = this.sailGeometry.userData.paramV;

    for (let row = 0; row <= rows; row++) {
      const v = paramV ? paramV[row] : row / rows;
      for (let column = 0; column <= columns; column++) {
        const u = paramU ? paramU[column] : column / columns;
        const vertex = row * (columns + 1) + column;
        const offset = vertex * 3;
        const envelope = Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
        const flutter = Math.sin(time * (6.5 + storm * 4) + u * 8.0 + v * 11.0) * (0.018 + damageFlutter * 0.12);
        array[offset] = base[offset] + envelope * billow + flutter * u;
        array[offset + 1] = base[offset + 1];
        array[offset + 2] = base[offset + 2] + flutter * 0.15;
      }
    }
    position.needsUpdate = true;
    const normalFrame = Math.floor(time * 10);
    if (this.sailGeometry.computeVertexNormals && normalFrame !== this.normalFrame && normalFrame % 3 === 0) {
      this.sailGeometry.computeVertexNormals();
      this.normalFrame = normalFrame;
    }
    const sailOpacity = 0.55 + integrity * 0.45;
    this.sailMaterial.opacity = sailOpacity;
    const wantsTransparency = sailOpacity < 0.985;
    if (this.sailMaterial.transparent !== wantsTransparency) {
      this.sailMaterial.transparent = wantsTransparency;
      this.sailMaterial.depthWrite = !wantsTransparency;
      this.sailMaterial.needsUpdate = true;
    }
    for (let i = 0; i < this.sailTears.length; i++) this.sailTears[i].visible = integrity < 0.76 - i * 0.18;
  }

  /**
   * Toute la bordée boit au goulot pendant `secondes`.
   *
   * ⚠️ PUREMENT VISUEL, comme `setOverboard`. L'effet de jeu du rhum est déjà
   * appliqué par `YoleDynamics.drinkRhum` ; ceci n'en est que la lecture, et
   * rien ici ne touche `dynamics` — donc rien n'entre dans le checksum.
   */
  setDrinking(secondes = 1.6) {
    this.drinkTimer = Math.max(this.drinkTimer ?? 0, secondes);
    this.drinkTotal = Math.max(0.35, this.drinkTimer);
  }

  // Chavirage : l'équipage passe par-dessus bord. PUREMENT VISUEL — on ne
  // touche pas à dynamics.activeCrew, qui entre dans le checksum de replay et
  // dont dépendent la pompe et le couple de rappel.
  // Équipage retiré parce qu'il est trop loin pour se lire — décision de RENDU,
  // prise chaque image par le jeu. Distincte de `overboard`, qui est un état de
  // partie : les deux se composent dans `applyCrewVisibility`, sinon le dernier
  // appelé écrasait l'autre et un équipage réinitialisé restait invisible.
  setCrewCulled(value) {
    this.setCrewDetail(value ? 0 : 2);
  }

  // 0 = aucune silhouette, 1 = trois dresseurs lisibles, 2 = équipage complet.
  // Le niveau intermédiaire est réservé aux rivaux sur mobile : il conserve la
  // signature humaine du sport et le mouvement de rappel tout en retirant
  // treize soumissions GPU par yole (trois rigs, deux spécialistes et leurs
  // accessoires). La simulation et les éjections continuent pour les huit.
  setCrewDetail(value) {
    const detail = clamp(value | 0, 0, 2);
    this.crewDetail = detail;
    this.crewCulled = detail === 0;
    // CrewVisual.update() remet une silhouette active à visible à chaque
    // image. La décision de LOD intervient ensuite, juste avant le rendu : elle
    // doit donc être réappliquée même si le niveau demandé n'a pas changé.
    this.applyCrewVisibility();
  }

  applyCrewVisibility() {
    const visible = !this.overboard && this.crewDetail > 0;
    for (let index = 0; index < this.crew.length; index++) {
      const visual = this.crew[index].visual;
      const stillAboardOrFalling = visual.wasActive || visual.fall > 0;
      visual.root.visible = visible
        && stillAboardOrFalling
        && (this.crewDetail >= 2 || index % 2 === 0);
    }
    const specialistsVisible = visible && this.crewDetail >= 2;
    for (const entry of this.specialists ?? []) {
      entry.visual.root.visible = specialistsVisible;
    }
    if (this.patronPaddleRoot) this.patronPaddleRoot.visible = specialistsVisible;
    if (this.sheetRoot) this.sheetRoot.visible = specialistsVisible;
  }

  setOverboard(value) {
    this.overboard = Boolean(value);
    if (this.overboard) this.resetCrewWeightFeedback();
    this.applyCrewVisibility();
    for (const entry of this.crew) {
      if (this.overboard) continue;
      // Remise à quai : l'animation de chute déplace root.position, et tant
      // qu'on est par-dessus bord update() ne repasse pas dessus. Sans ce
      // rappel, un équipier réinitialisé reprend la course à côté de son bois.
      const visual = entry.visual;
      visual.fall = 0;
      visual.wasActive = true;
      visual.root.position.set(0, visual.fromRig ? CREW_SEAT_Y : 0, entry.z);
      visual.root.rotation.set(0, 0, 0);
    }
    for (const entry of this.specialists ?? []) {
      if (this.overboard) continue;
      const visual = entry.visual;
      visual.fall = 0;
      visual.wasActive = true;
      visual.root.position.set(entry.x, visual.fromRig ? CREW_SEAT_Y : 0.28, entry.z);
      visual.root.rotation.set(0, 0, 0);
    }
  }

  update(state, time, dt, weather) {
    this.root.position.set(state.x, state.y, state.z);
    this.root.rotation.y = state.heading;
    // Frontière exacte de YoleDynamics.reset(). Le latch de prise de charge ne
    // doit surtout pas être réarmé par le reset générique de feedback : le
    // booléen physique reste volontairement collant pendant tout un geste.
    if (
      (state.shiftDuration ?? 0) === 0
      && (state.shiftElapsed ?? 0) === 0
      && (state.shiftKind ?? 0) === 0
      && !state.shiftCatchTriggered
      && Math.abs(state.crewShift ?? 0) < 1e-6
    ) {
      this.resetCrewWeightFeedback();
    }
    // YoleDynamics.reset() remet ces champs a zero AVANT l'unique update()
    // force par Boat.reset(). C'est un signal de frontiere de manche plus fiable
    // que le temps de rendu, et il evite de modifier Boat/Game pour un etat
    // exclusivement visuel.
    if (
      state.driveForce === 0
      && state.drive === 0
      && state.surf === 0
      && state.slip === 0
      && state.counterSteer === 0
      && state.arcadeBoostForward === 0
      && state.arcadeBoostLateral === 0
    ) {
      this.resetHandlingFeedback();
    }
    sampleHandlingMotion(state, this.handlingSample);
    const handlingActive = state.eliminated ? 0 : 1;
    const handlingSlipTarget = this.handlingSample.signedSlip * handlingActive;
    const handlingSurfTarget = this.handlingSample.surf * handlingActive;
    const handlingRecoveryTarget = this.handlingSample.recovery * handlingActive;
    this.handlingSlip = damp(
      this.handlingSlip,
      handlingSlipTarget,
      5.5 + handlingRecoveryTarget * 8.0,
      dt
    );
    this.handlingSlipAngle = damp(
      this.handlingSlipAngle,
      this.handlingSample.slipAngle * handlingActive,
      6.0 + handlingRecoveryTarget * 6.0,
      dt
    );
    this.handlingSurf = damp(
      this.handlingSurf,
      handlingSurfTarget,
      handlingSurfTarget > this.handlingSurf ? 4.2 : 2.8,
      dt
    );
    this.handlingRecovery = damp(
      this.handlingRecovery,
      handlingRecoveryTarget,
      handlingRecoveryTarget > this.handlingRecovery ? 9.5 : 5.2,
      dt
    );
    const wakeTarget = handlingActive
      * clamp(this.handlingSample.slipEnergy * 0.88 + this.handlingSample.surf * 0.62, 0, 1);
    this.handlingWakeStrength = damp(
      this.handlingWakeStrength,
      wakeTarget,
      wakeTarget > this.handlingWakeStrength ? 6.8 : 2.4,
      dt
    );

    // reduce-motion garde le V de mousse (information spatiale statique), mais
    // supprime les micro-deplacements de coque qui pourraient ajouter du mal
    // des transports. Aucun clignotement n'est introduit : reduceFlash n'a donc
    // rien a compenser sur la yole elle-meme.
    const hullMotion = this.handlingReducedMotion ? 0 : 1;
    const waterHeight = state.centerWaterHeight ?? state.y - 0.15;
    const bowWaterHeight = Number.isFinite(state.lastBowWaterHeight)
      ? state.lastBowWaterHeight
      : waterHeight;
    const speedWave = clamp(((state.speed ?? 0) - 2.5) / 19.5, 0, 1);
    const encounter = clamp(bowWaterHeight - waterHeight, -0.72, 0.72);
    const waveMotion = speedWave * hullMotion * (state.eliminated ? 0.25 : 1);
    const heaveTarget = encounter * HANDLING_MOTION.hullSwellHeave * waveMotion
      + Math.sin(time * (2.25 + speedWave * 1.15) + this.index * 1.7)
        * HANDLING_MOTION.hullSwellMicro
        * waveMotion
        * (0.45 + Math.abs(encounter) * 1.4);
    const pitchTarget = encounter * HANDLING_MOTION.hullSwellPitch * waveMotion;
    this.waveHeave = damp(this.waveHeave, heaveTarget, 6.4, dt);
    this.wavePitch = damp(this.wavePitch, pitchTarget, 5.8, dt);
    const catchRoll = -this.handlingSlip
      * this.handlingRecovery
      * HANDLING_MOTION.hullCounterRoll
      * hullMotion;
    this.tiltRoot.position.x = this.handlingSlip * HANDLING_MOTION.hullSlipOffset * hullMotion;
    this.tiltRoot.position.y =
      this.handlingSurf * HANDLING_MOTION.hullSurfLift * hullMotion
      + this.waveHeave;
    this.tiltRoot.rotation.z = -state.roll + catchRoll;
    this.tiltRoot.rotation.x = state.pitch
      - this.handlingSurf * HANDLING_MOTION.hullSurfPitch * hullMotion
      + this.wavePitch;

    this.handlingWakeRoot.position.y = waterHeight - state.y + 0.025;
    this.handlingWakeRoot.rotation.y = this.handlingSlipAngle * 0.82;
    this.handlingWakeRoot.scale.x = 0.72 + this.handlingWakeStrength * 0.82;
    this.handlingWakeRoot.scale.z = 0.72 + this.handlingSurf * 0.52;
    this.handlingWake.material.opacity = clamp(
      0.035 + this.handlingWakeStrength * 0.27,
      0,
      0.31
    );
    this.handlingWake.visible = this.handlingWakeStrength > 0.025;
    const heelDanger = clamp(Math.abs(state.roll ?? 0) / 1.15, 0, 1);
    const heelSide = Math.sign(state.roll ?? 0) || 1;
    const heelWash = heelDanger * clamp(0.22 + (state.speed ?? 0) / 23, 0.22, 1.2);
    this.heelFoam.position.set(
      heelSide * (1.02 + heelDanger * 0.20),
      waterHeight - state.y + 0.035,
      -0.18
    );
    this.heelFoam.scale.set(0.72 + heelDanger * 0.58, 1 + heelWash * 0.34, 1);
    this.heelFoam.material.opacity = clamp(heelWash * 0.42, 0, 0.46);
    this.heelFoam.visible = heelWash > 0.045;
    this.impact = Math.max(0, this.impact - dt * 2.8);

    // Le bord de rappel suit la gîte lissée, pas le vent apparent. L'amplitude
    // est ensuite distribuée par profil : le groupe se charge autour du
    // plat-bord avant que l'unique poste extrême gagne le bout du bwa.
    // `crewPositions` reste le transitoire physique de contre-gîte ajouté à ce
    // staging visuel ; la simulation et les checksums de replay ne changent pas.
    const roll = state.roll ?? 0;
    this.rollSlow = damp(this.rollSlow ?? roll, roll, 0.55, dt);
    const windward = -Math.tanh(this.rollSlow / 0.05);
    // Le choix du BORD peut saturer vite, pas l'AMPLITUDE. L'ancien calcul
    // repassait un tanh déjà saturé dans smoothstep : à ~1,7° de gîte les six
    // hommes étaient pratiquement à leur poste maximal. Le déploiement lit
    // maintenant la gîte brute et progresse de 2° à 12°.
    const deploiement = crewDeploymentForRoll(this.rollSlow);
    // ── DÉCROCHAGE AU CHAVIRAGE ──────────────────────────────────────────
    //
    // La plage de travail d'un rappel s'arrête vers 30-35° de gîte (0,52 rad
    // est déjà une gîte de course franche). Au-delà, la perche se dresse et
    // personne ne tient ASSIS dessus : l'équipage glisse le long du bwa vers
    // la coque, se recroqueville et s'accroche — puis la chute (`fall`) prend
    // le relais si le hors course se conclut. Captures de référence : à 49°
    // et 63°, six hommes restaient posés en rang sur des perches dressées.
    //
    // Le levier est le déploiement VISUEL : en le rabattant vers la cote de
    // repos, l'homme revient au plat-bord ET sa pose de station s'efface —
    // une seule valeur pilote la glisse et la posture. Présentation seule :
    // `dynamics.activeCrew` (checksum de replay) ne voit rien d'ici.
    const decrochage = clamp((Math.abs(this.rollSlow) - 0.68) / 0.37, 0, 1);
    // Tant que la gîte lissée est proche de zéro on conserve le bord courant :
    // le clapot ne doit jamais faire traverser six hommes. Lors d'un vrai
    // changement de bord, les racines des équipiers et leurs bwa se déplacent
    // en cascade, proue -> poupe, plutôt que de se téléporter ensemble.
    const desiredSide = Math.abs(this.rollSlow) > 0.035
      ? (Math.sign(windward) || this.windwardTarget || 1)
      : (this.windwardTarget || Math.sign(windward) || 1);
    if (!this.windwardTarget) {
      this.windwardTarget = desiredSide;
      this.crewSides.fill(desiredSide);
      this.crewSideStarts.fill(desiredSide);
      this.crewSideProgress.fill(1);
      this.beamSides.fill(desiredSide);
    } else if (desiredSide !== this.windwardTarget) {
      this.crewSideStarts.set(this.crewSides);
      this.windwardTarget = desiredSide;
      this.sideChangeElapsed = 0;
    }
    this.sideChangeElapsed += dt;
    for (let index = 0; index < this.crewSides.length; index++) {
      const progress = smoothstep(
        CREW_SIDE_DELAYS[index],
        CREW_SIDE_DELAYS[index] + CREW_SIDE_TRAVEL,
        this.sideChangeElapsed
      );
      this.crewSideProgress[index] = progress;
      this.crewSides[index] = this.crewSideStarts[index]
        + (this.windwardTarget - this.crewSideStarts[index]) * progress;
    }
    for (let beamIndex = 0; beamIndex < this.beamSides.length; beamIndex++) {
      const crewIndex = CREW_BEAMS.indexOf(beamIndex);
      this.beamSides[beamIndex] = crewIndex >= 0
        ? this.crewSides[crewIndex]
        : this.crewSides[this.crewSides.length - 1];
    }

    const active = this.overboard ? 0 : state.activeCrew;
    let meanCrewVelocity = 0;
    const velocityCount = Math.min(active, state.crewVelocities?.length ?? 0);
    for (let index = 0; index < velocityCount; index++) {
      meanCrewVelocity += Number.isFinite(state.crewVelocities[index])
        ? state.crewVelocities[index]
        : 0;
    }
    if (velocityCount > 0) meanCrewVelocity /= velocityCount;
    const crewMomentum = stepDampedSpring(
      this.crewMomentumSpring,
      clamp(meanCrewVelocity / 2.8, -1, 1),
      11.5,
      0.82,
      dt
    );

    const shiftElapsed = Number.isFinite(state.shiftElapsed) ? state.shiftElapsed : 0;
    if (
      shiftElapsed + 1e-4 < this.counterHeelLastShiftElapsed
      || !state.shiftCatchTriggered
    ) {
      this.counterHeelCatchSeen = false;
    }
    if (
      !this.overboard
      && active > 0
      && (state.shiftKind ?? 0) >= 2
      && state.shiftCatchTriggered
      && !this.counterHeelCatchSeen
    ) {
      this.counterHeelCatchSeen = true;
      const precision = clamp(state.shiftPrecision ?? 0, 0, 1);
      const strength = (state.shiftKind === 2 ? 1 : 0.72) * (0.65 + precision * 0.35);
      this.counterHeelLoadSpring.value = Math.max(
        this.counterHeelLoadSpring.value,
        0.28 * strength
      );
      this.counterHeelLoadSpring.velocity += 4.8 * strength;
    }
    this.counterHeelLastShiftElapsed = shiftElapsed;
    const counterHeelLoad = stepDampedSpring(
      this.counterHeelLoadSpring,
      0,
      17,
      0.68,
      dt
    );

    // Cadence COMMUNE aux six équipiers d'une yole : c'est elle qui les met à
    // l'unisson. Elle accélère avec la vitesse et sous turbo, et le décalage par
    // `this.index` évite que les quatre yoles battent la même mesure.
    const pace = 2.15 + clamp((state.speed ?? 0) / 26, 0, 1) * 1.5 + clamp(state.arcadeBoostForward ?? 0, 0, 1) * 1.2;
    this.cadence = (this.cadence ?? this.index * 1.9) + dt * pace;
    const cadence = this.cadence;
    // Le dernier dresseur ne peut plus être aussi l'écopeur : il doit conserver
    // le rappel pendant le changement de bord. Un poste distinct, au centre,
    // rentre visuellement vers la coque quand l'eau monte.
    const bailer = Math.min(Math.max(0, active - 1), CREW_ROLES.indexOf("ecopeur"));
    const bailStrength = clamp((state.waterMassKg ?? 0) / 45, 0, 1);
    const anticipation = clamp(
      (Math.abs(state.roll ?? 0) - 0.10) / 0.48
      + Math.max(0, (state.sailPower ?? 0.7) - 0.82) * 0.72,
      0,
      1
    );

    if (this.drinkTimer > 0) this.drinkTimer = Math.max(0, this.drinkTimer - dt);

    for (let index = 0; index < this.crew.length; index++) {
      if (this.overboard) break;
      const crew = this.crew[index];
      const normalized = state.crewPositions?.[index] ?? state.crewShift ?? 0;
      const velocity = state.crewVelocities?.[index] ?? 0;
      // L'écart de la simulation s'ajoute désormais à un repos DÉJÀ déporté :
      // garder l'ancien facteur 2,55 empilait les deux et sortait les hommes à
      // 5,2 m, très au-delà de la portée réelle d'un bois. Réduit pour que le
      // BWA SHIFT reste franchement lisible sans quitter la perche.
      const spread = 1.15 + index * 0.05;
      const bailRetraction = index === bailer ? bailStrength * 0.82 : 0;
      // Chaque famille possède sa propre fenêtre : les ancrages prennent la
      // charge tôt, les leviers suivent, l'extension ne sort que sous vraie gîte.
      const staging = CREW_STAGING_PROFILES[index];
      // Décrochage légèrement échelonné : six glissades parfaitement synchrones
      // liraient comme un ressort, pas comme des hommes qui perdent leur perche.
      const decrochageHomme = clamp(decrochage - (index % 3) * 0.10, 0, 1);
      const profileDeployment = crewProfileDeployment(staging, deploiement)
        * (1 - decrochageHomme * 0.85);
      const sideProgress = this.crewSideProgress[index] ?? 1;
      // ── RESPIRATION DE SORTIE ────────────────────────────────────────────
      //
      // ⚠️ MESURÉ LE 4 AOÛT 2026 : À GÎTE TENUE, LES SIX SONT À 1,00 PILE.
      //
      // Les profils échelonnent bien la SORTIE — les ancrages s'engagent à 6°
      // de gîte, l'homme du bout à 10° — mais dès que la charge est installée
      // tout le monde sature et l'échelonnement disparaît. Relevé dans le jeu à
      // 30° de gîte : **0,000 d'amplitude de déploiement** sur les six. Tout le
      // reste varie pourtant largement (2,14 m d'écart latéral, 49,7° de lacet,
      // 60,7° de bascule de buste, 9 % de gabarit) — cet axe-là, non.
      //
      // Un rappel réel ne se fige pas : la bordée avance et recule de quelques
      // centimètres au rythme des risées, et jamais ensemble. On rend donc ce
      // ballant, déphasé par homme ET de périodes légèrement différentes — une
      // période commune produirait une VAGUE parcourant la bordée, ce qui se lit
      // comme un ressort, pas comme six hommes qui tiennent.
      //
      // Il s'éteint sur l'homme encore à bord (`profileDeployment`) et pendant
      // une traversée (`sideProgress`), où le corps a déjà tout un déplacement
      // à raconter.
      //
      // ⚠️ PUREMENT VISUEL, ET C'EST STRUCTUREL. `restReach` ne touche ni
      // `dynamics` ni `crewPositions` : le couple de redressement, les
      // checksums de replay et le Duel local sont calculés en amont et ne
      // voient rien d'ici. Même règle que la gorgée de rhum.
      const souffle = Math.sin(time * (0.58 + index * 0.047) + index * 1.27)
        * CREW_REACH_BREATH
        * profileDeployment
        * sideProgress;
      // ── LA COTE DE REPOS, AU PLAT-BORD ───────────────────────────────────
      //
      // ⚠️ IL N'Y EN AVAIT AUCUNE, ET C'EST CE QUI FAISAIT LE TAS AU MILIEU.
      //
      // `restReach` valait `reach × deployment` : à gîte nulle il tombait à
      // ZÉRO. La formule savait où les hommes vont quand ils sortent, jamais où
      // ils sont quand ils ne sortent pas. Ils retombaient donc à l'axe du
      // bateau — mesuré `deportX = 0,04 m` — c'est-à-dire au milieu de la coque,
      // là où les bwa traversent toute la largeur à la cote 0,25. Les perches
      // leur passaient au travers du corps, et par-dessus ils tenaient une pose
      // accroupie. Six hommes empilés et empalés : c'est ce que le joueur voit
      // au départ de chaque course.
      //
      // Une bordée au repos est ASSISE SUR LE PLAT-BORD, épaules serrées,
      // jambes à l'intérieur — la position d'attente d'un équipage qui va
      // sortir. On lui donne donc sa cote, et le déploiement la remplace
      // progressivement au lieu de partir de rien.
      const restReach = Math.max(
        0,
        CREW_GUNWALE_REST * (1 - profileDeployment)
          + (staging.reach - bailRetraction) * profileDeployment
          + souffle
      );
      crew.visual.stagingDeployment = profileDeployment;
      // L'éventail de 7 cm par rang n'existe QUE sortis : c'est lui qui évite
      // six hommes alignés au cordeau sur les bwa. Au plat-bord, les photos
      // montrent l'inverse — une rangée serrée, épaules contre épaules. Le
      // laisser courir au repos tirait en outre les premiers rangs en deçà du
      // seuil d'assise, et ils restaient à mi-hauteur, ni debout ni assis.
      const x = this.crewSides[index] * restReach
        + normalized * spread + (index - 2.5) * 0.07 * profileDeployment;
      // La glisse de décrochage rabat AUSSI le déport de simulation : à 60° de
      // gîte, personne ne tient à deux mètres du bord quelle que soit la
      // contre-gîte demandée. On vise la bande du plat-bord, pas l'axe —
      // retomber au milieu de la coque relirait comme le « tas » d'avant la
      // cote de repos.
      const xGlisse = Math.abs(x) > 1e-4 ? Math.sign(x) * 0.75 : 0;
      const xDecroche = x + (xGlisse - x) * decrochageHomme * 0.8;
      const sideChanging = this.sideChangeElapsed >= CREW_SIDE_DELAYS[index] - 0.08
        && this.sideChangeElapsed < CREW_SIDE_DELAYS[index] + CREW_SIDE_TRAVEL;
      // ── GORGÉE DE RHUM, ÉCHELONNÉE ─────────────────────────────────────
      // Chaque homme boit avec un léger retard sur le précédent. Six gorgées
      // parfaitement simultanées lisent comme un bug d'animation ; échelonnées,
      // elles lisent comme une bordée qui se passe la bouteille.
      // Le décalage vient de l'INDEX, pas d'un tirage : deux relectures d'un
      // même replay doivent montrer exactement la même chose.
      let gorgee = 0;
      if ((this.drinkTimer ?? 0) > 0) {
        const total = this.drinkTotal || 1;
        const ecoule = total - this.drinkTimer;
        const debut = index * CREW_DRINK_STAGGER;
        const local = (ecoule - debut) / CREW_DRINK_SIP;
        // Montée franche, tenue, redescente : une gorgée, pas une oscillation.
        if (local > 0 && local < 1) gorgee = Math.sin(local * Math.PI) ** 0.6;
      }
      const shiftMotion = crew.shiftMotion;
      shiftMotion.elapsed = state.shiftElapsed ?? 99;
      shiftMotion.duration = state.shiftDuration ?? 0;
      shiftMotion.precision = state.shiftPrecision ?? 0;
      shiftMotion.kind = state.shiftKind ?? 0;
      shiftMotion.delay = state.crewStartDelays?.[index] ?? 0;
      shiftMotion.sideTransfer = sideProgress;
      shiftMotion.sideChanging = sideChanging;
      // Celui qui attend son tour guette le commandement : il lui faut l'horloge
      // du virement et son propre délai, pas seulement sa fenêtre de traversée.
      shiftMotion.bordElapsed = this.sideChangeElapsed;
      shiftMotion.bordDelai = CREW_SIDE_DELAYS[index];
      shiftMotion.decrochage = decrochageHomme;
      shiftMotion.anticipation = anticipation;
      shiftMotion.momentum = crewMomentum;
      shiftMotion.loadRecoil = counterHeelLoad * clamp(
        Math.abs(normalized) / Math.max(0.15, state.shiftLoadTargetAbs || 0.6),
        0,
        1
      );
      // Le LOD 1 ne dessine que les index pairs ; résoudre les dix passes IK
      // des corps masqués ne change aucun pixel. Le joueur en gros plan garde
      // toujours les contacts complets.
      shiftMotion.solveContacts = this.crewDetail >= 2
        || (this.crewDetail === 1 && index % 2 === 0);
      crew.visual.update(time, dt, xDecroche, crew.z, velocity, state.roll, this.impact, index < active, state.crewStumble ?? 0, state.arcadeBoostForward ?? 0, (state.arcadeBoostLateral ?? 0) * (state.lateralBoostDirection ?? 0), cadence, index === bailer ? bailStrength : 0, gorgee, state.cohesion ?? 1, shiftMotion);
    }

    if (!this.overboard) {
      for (let index = 0; index < this.specialists.length; index++) {
        const specialist = this.specialists[index];
        const isPatron = specialist.role === "patron";
        const roleX = specialist.x
          + (isPatron
            ? clamp((state.yawRate ?? 0) * 0.16, -0.16, 0.16)
            : this.windwardTarget * 0.07);
        const roleMotion = specialist.shiftMotion;
        roleMotion.elapsed = 99;
        roleMotion.duration = 0;
        roleMotion.precision = 0;
        roleMotion.kind = 0;
        roleMotion.delay = 0;
        roleMotion.sideTransfer = 1;
        roleMotion.sideChanging = false;
        roleMotion.anticipation = anticipation * 0.35;
        roleMotion.momentum = 0;
        roleMotion.loadRecoil = 0;
        // L'ordre du patron se cale sur le virement RÉEL : il reçoit l'horloge
        // du changement de bord, que seuls les dresseurs connaissaient jusqu'ici.
        const finBord = CREW_SIDE_DELAYS[CREW_SIDE_DELAYS.length - 1] + CREW_SIDE_TRAVEL;
        roleMotion.bordElapsed = isPatron && this.sideChangeElapsed <= finBord
          ? this.sideChangeElapsed
          : 99;
        roleMotion.solveContacts = this.crewDetail >= 2;
        specialist.visual.update(
          time,
          dt,
          roleX,
          specialist.z,
          (state.yawRate ?? 0) * 0.08,
          state.roll,
          this.impact,
          true,
          state.crewStumble ?? 0,
          state.arcadeBoostForward ?? 0,
          (state.arcadeBoostLateral ?? 0) * (state.lateralBoostDirection ?? 0),
          cadence,
          0,
          0,
          state.cohesion ?? 1,
          roleMotion
        );
      }

      // ── LA PAGAIE DU PATRON ────────────────────────────────────────────────
      //
      // ⚠️ ELLE N'ÉTAIT DANS LES MAINS DE PERSONNE.
      //
      // C'était un `Group` posé à une cote FIXE de la coque, sans le moindre
      // lien avec le squelette du patron. L'homme faisait son geste de barre
      // d'un côté, la pagaie flottait de l'autre — et sa pale tombait vers
      // z ≈ 6,0 alors que la coque s'arrête à 5,55, donc hors du bateau.
      //
      // On la fait désormais tenir : le manche part de la main HAUTE et vise la
      // main basse. Les deux mains sortent de l'IK d'équipage, donc la pagaie
      // hérite gratuitement de la houle, des chocs et du geste de barre.
      const helm = clamp((state.yawRate ?? 0) * 0.58 + (state.roll ?? 0) * 0.14, -0.55, 0.55);
      // L'INCLINAISON reste dictée par la barre, pas par la ligne des mains.
      // Un aviron de gouverne traîne derrière le bateau et n'entre dans l'eau
      // que par sa pale ; le déduire de deux mains distantes de cinquante
      // centimètres le dresserait à la verticale, ce qu'aucun patron ne fait.
      // `+Y` local court de la pale vers la poignée : la pale part donc vers le
      // bas ET vers l'arrière, soit −z depuis que la proue est en +z.
      // ⚠️ La composante verticale est CONTRAINTE PAR LA PALE, pas choisie.
      // Du poing à la pale il y a 3,28 m de manche (`PADDLE_GRIP_DROP` + 1,83),
      // et la main du patron tombe à 1,30 m au-dessus de la flottaison : à 0,36
      // la pale ressortait 11 cm AU-DESSUS de l'eau — un aviron de gouverne qui
      // ne gouverne rien. 0,50 la fait mordre de 34 cm.
      this.paddleDirection.set(0.10 - helm * 0.30, 0.50, 0.86).normalize();
      const patron = this.specialists.find((entree) => entree.role === "patron");
      const main = patron?.visual.boneWorldPosition("RightHand", this.paddleGrip);
      if (main) {
        // La main arrive en repère MONDE ; la pagaie vit sous `tiltRoot`, qui
        // porte déjà gîte et tangage. On repasse donc par lui, sinon la pagaie
        // encaisserait la gîte deux fois.
        this.tiltRoot.updateWorldMatrix(true, false);
        this.tiltRoot.worldToLocal(main);
        this.patronPaddleRoot.position
          .copy(main)
          .addScaledVector(this.paddleDirection, -PADDLE_GRIP_DROP);
      } else {
        // Corps procédural, ou équipage masqué : placement fixe, désormais côté
        // POUPE comme le patron lui-même.
        this.patronPaddleRoot.position.set(0.58 + helm * 0.12, 0.12, -4.35);
      }
      this.patronPaddleRoot.quaternion?.setFromUnitVectors?.(this.paddleUp, this.paddleDirection);

      // ── L'ÉCOUTE DE VOILE ──────────────────────────────────────────────────
      //
      // Même défaut que la pagaie, corrigé de la même façon : c'était un
      // cylindre posé à une cote fixe de la coque, sans lien avec le
      // manœuvrier. Une écoute qui ne part de la main de personne ne dit pas
      // qu'on règle la voile — elle dit qu'une corde flotte.
      //
      // Elle court désormais du point d'amure au POING, et sa longueur suit la
      // distance réelle : un brin de 2,45 m fixe traverserait le pont dès que
      // l'homme bouge. Le tirage anime le point haut, côté voile, parce que
      // c'est la voile qui travaille — la main, elle, tient.
      const sheetPull = Math.sin(cadence * 0.72 + this.index * 0.33) * 0.08;
      this.sheetAnchor.set(-0.07 + sheetPull, 2.67, 0.17);
      const ecoute = this.specialists.find((entree) => entree.role === "ecoute");
      const poing = ecoute?.visual.boneWorldPosition("LeftHand", this.sheetGrip);
      if (poing) {
        this.tiltRoot.updateWorldMatrix(true, false);
        this.tiltRoot.worldToLocal(poing);
      } else {
        // Corps procédural : on garde le bas de brin d'origine.
        this.sheetGrip.set(-0.17 + sheetPull, 0.26, 0.55);
      }
      // ⚠️ `set` et `copy` seulement : le mock Three des tests n'implémente ni
      // `subVectors` ni `addScaledVector`, et `full-game-smoke` tourne dessus.
      // S'appuyer sur l'API complète ici a cassé `npm run verify` une fois.
      const brinX = this.sheetAnchor.x - this.sheetGrip.x;
      const brinY = this.sheetAnchor.y - this.sheetGrip.y;
      const brinZ = this.sheetAnchor.z - this.sheetGrip.z;
      const brin = Math.hypot(brinX, brinY, brinZ);
      if (brin > 1e-3) {
        this.sheetDirection.set(brinX / brin, brinY / brin, brinZ / brin);
        // Le cylindre est centré sur son axe : son milieu tombe donc à
        // mi-distance, et son échelle rend la longueur exacte.
        this.sheetRoot.position.set(
          this.sheetGrip.x + brinX * 0.5,
          this.sheetGrip.y + brinY * 0.5,
          this.sheetGrip.z + brinZ * 0.5
        );
        this.sheetLine.scale.y = brin / SHEET_LINE_LENGTH;
        this.sheetRoot.quaternion?.setFromUnitVectors?.(this.paddleUp, this.sheetDirection);
      }
    }

    const windPower = clamp(state.sailPower ?? 0.7, 0, 1.5);
    this.rigFlex = damp(
      this.rigFlex ?? 0,
      clamp(-(state.roll ?? 0) * 0.045, -0.055, 0.055),
      2.4,
      dt
    );
    this.rigMain.rotation.z = this.rigFlex;
    this.updateSail(time, windPower + (state.arcadeBoostForward ?? 0) * 0.35, weather.stormAmount, state.structure.sail);
    this.cannonGlow.scale.setScalar(0.85 + Math.sin(time * 7 + this.index) * 0.12 + state.flow * 0.28);
    const turbo = clamp(state.arcadeBoostForward ?? 0, 0, 1);
    const dash = clamp(state.arcadeBoostLateral ?? 0, 0, 1);
    this.turboFlame.visible = turbo > 0.01;
    this.turboFlame.material.opacity = turbo * 0.82;
    this.turboFlame.scale.set(0.75 + turbo * 0.45, 0.75 + turbo * 0.45, 0.7 + turbo * 1.4);
    this.turboFlame.rotation.z = Math.sin(time * 22 + this.index) * 0.16;
    this.dashFlare.visible = dash > 0.01;
    this.dashFlare.material.opacity = dash * 0.72;
    this.dashFlare.material.color.setHex((state.lateralBoostDirection ?? 1) > 0 ? 0xff4ec4 : 0x55f5ff);
    this.dashFlare.scale.setScalar(0.8 + dash * 0.9);
    this.dashFlare.rotation.z += dt * 5.5;

    this.hullMaterial.emissive.setHex(this.color);
    this.hullMaterial.emissive.multiplyScalar(0.025 + this.impact * 0.12);
    this.hullMaterial.roughness = 0.4 + (1 - state.structure.hull) * 0.3;
    this.waterLevelUniform.value = state.centerWaterHeight ?? state.y - 0.15;
    this.mastGroup.rotation.z = (1 - state.structure.mast) * 0.28 * Math.sin(time * 2.2 + this.index);
    this.mast.visible = state.structure.mast > 0.36;
    this.brokenMast.visible = state.structure.mast <= 0.36 && state.structure.mast > 0.01;
    if (this.brokenMast.visible) {
      this.brokenMast.rotation.z = 0.65 + Math.sin(time * 1.8 + this.index) * 0.18;
      this.brokenMast.rotation.x = 0.22;
    }
    const rigUp = state.structure.sail > 0.02 && state.structure.mast > 0.02;
    this.sail.visible = rigUp;
    // Sept bois dressés pour quatre valeurs d'intégrité côté simulation :
    // on répartit proportionnellement plutôt que d'indexer au-delà du tableau.
    const bwa = state.structure.bwa;
    const bwaCount = bwa?.length || 1;
    this.beams.forEach((entry, index) => {
      const integrity = bwa?.[Math.min(bwaCount - 1, Math.floor(index * bwaCount / this.beams.length))] ?? 1;
      entry.beam.visible = integrity > 0.04;
      // Les bois débordent d'UN SEUL bord, celui au vent — un peigne symétrique
      // se lit à l'écran comme une arête de poisson, jamais comme une yole. Même
      // signal continu que l'équipage, donc ils sortent ensemble.
      const beamSide = this.beamSides[index] || this.windwardTarget || 1;
      entry.root.position.x = beamSide * entry.windwardOffset;
      // Un bois qui porte un homme ne doit ni raccourcir ni pivoter sous les
      // dégâts : il l'emmènerait dans le vide. Seul le bois 0, inoccupé, encaisse
      // visuellement la casse.
      const carriesCrew = CREW_BEAMS.includes(index);
      entry.beam.scale.y = entry.length
        * (carriesCrew ? 1 : clamp(integrity, 0.18, 1));
      entry.root.rotation.y = carriesCrew ? 0 : (1 - integrity) * 0.22;
      const crewIndex = CREW_BEAMS.indexOf(index);
      const localShiftTime = (state.shiftElapsed ?? 99) - (crewIndex >= 0 ? (state.crewStartDelays?.[crewIndex] ?? 0) : 0);
      const loadFlex = carriesCrew
        ? motionPulse(localShiftTime, 0.16, 0.30, 0.38, 0.62) * (0.65 + (state.shiftPrecision ?? 0) * 0.35)
        : 0;
      const actualCrewLoad = crewIndex >= 0
        ? clamp(
          Math.abs(state.crewPositions?.[crewIndex] ?? state.crewShift ?? 0)
            / Math.max(0.15, state.shiftLoadTargetAbs || 0.6),
          0,
          1
        )
        : 0;
      entry.root.rotation.z = carriesCrew
        ? -beamSide * (
          loadFlex * 0.028
          + counterHeelLoad * actualCrewLoad * 0.030
        )
        : (1 - integrity) * 0.16 * (index % 2 ? 1 : -1);
    });
    this.syncBeamInstances();

    const hullDamage = 1 - state.structure.hull;
    for (let i = 0; i < this.cracks.length; i++) {
      const opacity = clamp(hullDamage * 1.8 - i * 0.16, 0, 0.8);
      // Un mesh transparent à opacité nulle coûte quand même son draw call : les
      // 16 fissures des 4 yoles étaient dessinées en permanence alors qu'elles
      // ne se voient que sur une coque abîmée.
      this.cracks[i].visible = opacity > 0.004;
      this.cracks[i].material.opacity = opacity;
    }

    const water = clamp((state.waterMassKg ?? 0) / 180, 0, 1);
    this.internalWaterMaterial.opacity = water * 0.68;
    this.internalWater.visible = water > 0.01;
    this.internalWater.position.y = 0.105 + water * 0.12;
    const flood = state.flooding;
    if (flood) {
      // La simulation tient SIX compartiments (yole-physics.js:23-24) :
      //   0,1,2 = bâbord arrière/milieu/avant   3,4,5 = tribord arrière/milieu/avant
      // Ce bloc n'en lisait que quatre : flood[4] et flood[5] n'étaient jamais lus,
      // et « tribord » additionnait du bâbord-milieu avec du tribord-arrière — la
      // nappe s'inclinait donc du mauvais côté et sur le mauvais axe.
      const port = flood[0] + flood[1] + flood[2];
      const starboard = flood[3] + flood[4] + flood[5];
      const stern = flood[0] + flood[3];
      const bow = flood[2] + flood[5];
      // Coefficients ramenés de deux à trois compartiments par somme.
      this.internalWater.rotation.z = clamp((starboard - port) * 0.00187, -0.18, 0.18);
      this.internalWater.rotation.x = clamp((stern - bow) * 0.00147, -0.14, 0.14);
    }

    if (state.eliminated) {
      this.tiltRoot.rotation.z = -state.roll;
      this.root.position.y -= Math.min(2.2, state.sink * 0.58);
    }
  }
}
