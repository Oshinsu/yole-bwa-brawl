// Mesure les JAMBES de l'équipage telles qu'elles arrivent à l'écran.
//
// Pourquoi un outil à part : `mesure_silhouette_equipage.mjs` juge le tronc,
// les bras et l'assise. Il imprime la flexion du genou mais ne dit rien de la
// DIRECTION des jambes — or c'est elle que les photos de course fixent : soit
// tendues vers le bas (assis à cheval sur le bwa), soit tendues vers le bateau
// (allongé sur la perche, ou pieds au plat-bord), soit assis dans la coque.
// Un genou plié à 100° avec les talons crochetés sous le bassin n'existe sur
// aucune photo, et aucun seuil ne l'attrapait.
//
// On charge le GLB livré, on rebâtit le squelette avec le vrai Three.js, on
// instancie le vrai `CrewVisual` pour chaque famille de station, on converge
// soixante images, puis on lit hanche, genou, cheville et pied dans le repère
// de la YOLE (X = axe du bwa, +X = vers le large pour l'homme mesuré).
//
//   node tools/mesure_jambes_equipage.mjs            # rapport lisible
//   node tools/mesure_jambes_equipage.mjs --json     # rapport machine
//   node tools/mesure_jambes_equipage.mjs --strict   # sort 1 si un contrat casse
//
// Contrats (en bas) : genoux tendus au rappel, jambes vers le bas OU vers le
// bateau, jamais repliées vers le haut, pieds jamais crochetés au-dessus du bois.

import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(ICI, "..");
const argGlb = process.argv.indexOf("--glb");
const GLB = argGlb > -1 && process.argv[argGlb + 1]
  ? path.resolve(RACINE, process.argv[argGlb + 1])
  : path.join(RACINE, "assets", "models", "yole_crew.glb");

const module = (...bouts) => import(pathToFileURL(path.join(RACINE, ...bouts)).href);
const THREE = await module("vendor", "three.module.min.js");
const { CrewClipLibrary } = await module("src", "render", "crew-clips.js");
const {
  CrewVisual, CREW_STAGING_PROFILES, CREW_ROLES, CREW_BEAM_Y, CREW_ROOT_SCALE,
  crewSeatOffsetForHike, HULL_VISUAL_WIDTH_SCALE
} = await module("src", "render", "yole-visual.js");

const DEG = 180 / Math.PI;
// Bord visible de la coque au maître-bau : demi-largeur de collision × affinage
// de rendu (voir HULL_VISUAL_WIDTH_SCALE dans yole-visual.js).
const PLAT_BORD_X = 1.08 * HULL_VISUAL_WIDTH_SCALE;
// Pied « au plat-bord » : plat-bord et lisse font 10 à 15 cm de large, la
// pointe du pied déborde d'un côté ou de l'autre selon l'appui.
const PLAT_BORD_TOLERANCE = 0.20;

// ── LECTURE DU GLB (même méthode que mesure_silhouette_equipage.mjs) ─────────

function lisGlb(chemin) {
  const buf = readFileSync(chemin);
  const longueurJson = buf.readUInt32LE(12);
  const json = JSON.parse(buf.slice(20, 20 + longueurJson).toString("utf8"));
  const binaire = buf.slice(20 + longueurJson + 8);
  return { json, binaire };
}

function accesseur(json, binaire, index) {
  const acces = json.accessors[index];
  const vue = json.bufferViews[acces.bufferView];
  const depart = (vue.byteOffset ?? 0) + (acces.byteOffset ?? 0);
  const composantes = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[acces.type];
  const sortie = new Float32Array(acces.count * composantes);
  for (let i = 0; i < sortie.length; i++) sortie[i] = binaire.readFloatLE(depart + i * 4);
  return sortie;
}

const assainis = (nom) => String(nom ?? "").replace(/[\s.:]/g, "");

function batisRig(json) {
  const os = json.nodes.map((noeud) => {
    const bone = new THREE.Bone();
    bone.name = assainis(noeud.name);
    if (noeud.translation) bone.position.fromArray(noeud.translation);
    if (noeud.rotation) bone.quaternion.fromArray(noeud.rotation);
    if (noeud.scale) bone.scale.fromArray(noeud.scale);
    return bone;
  });
  json.nodes.forEach((noeud, index) => {
    for (const enfant of noeud.children ?? []) os[index].add(os[enfant]);
  });
  const racine = new THREE.Group();
  racine.name = "CrewRig";
  json.nodes.forEach((_, index) => {
    if (!os[index].parent) racine.add(os[index]);
  });
  const peau = json.skins?.[0];
  if (peau) {
    const maille = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    maille.name = "CrewMesh";
    maille.skeleton = new THREE.Skeleton(peau.joints.map((j) => os[j]));
    maille.bind = () => {};
    racine.add(maille);
  }
  return racine;
}

function batisClips(json, binaire) {
  return (json.animations ?? []).map((anim) => {
    let duree = 0;
    const pistes = [];
    for (const canal of anim.channels) {
      if (canal.target.path !== "rotation") continue;
      const echantillonneur = anim.samplers[canal.sampler];
      const temps = accesseur(json, binaire, echantillonneur.input);
      const valeurs = accesseur(json, binaire, echantillonneur.output);
      duree = Math.max(duree, temps[temps.length - 1]);
      pistes.push({
        name: `${assainis(json.nodes[canal.target.node].name)}.quaternion`,
        times: temps,
        values: valeurs,
        interpolation: echantillonneur.interpolation ?? "LINEAR"
      });
    }
    return { name: anim.name, duration: duree, tracks: pistes };
  });
}

// ── MESURE ───────────────────────────────────────────────────────────────────

function osMonde(visuel, nom) {
  const os = visuel.rigJoints?.find((entree) => entree.boneName === nom)?.joint;
  if (!os) return null;
  return os.getWorldPosition(new THREE.Vector3());
}

function angleEntre(a, b) {
  const na = a.length();
  const nb = b.length();
  if (!(na > 1e-6) || !(nb > 1e-6)) return null;
  return Math.acos(Math.max(-1, Math.min(1, a.dot(b) / (na * nb)))) * DEG;
}

/** Jambe : hanche → genou → cheville → pied, dans le repère de la yole, côté +X. */
function mesureJambe(visuel, yole, cote, signe) {
  yole.updateWorldMatrix(true, true);
  const local = (nom) => {
    const monde = osMonde(visuel, nom);
    if (!monde) return null;
    const p = yole.worldToLocal(monde);
    // On ramène l'homme du côté +X : ainsi "+X" veut toujours dire "vers le large".
    p.x *= signe;
    return p;
  };
  const hanche = local(`${cote}UpLeg`);
  const genou = local(`${cote}Leg`);
  const cheville = local(`${cote}Foot`);
  const orteils = local(`${cote}ToeBase`) ?? local(`${cote}Toe_End`);
  if (!hanche || !genou || !cheville) return null;
  const cuisse = new THREE.Vector3().subVectors(genou, hanche);
  const tibia = new THREE.Vector3().subVectors(cheville, genou);
  const bas = new THREE.Vector3(0, -1, 0);
  const versBateau = new THREE.Vector3(-1, 0, 0);
  return {
    hanche, genou, cheville, orteils,
    flexionGenou: angleEntre(cuisse, tibia),
    cuisseDepuisBas: angleEntre(cuisse, bas),
    tibiaDepuisBas: angleEntre(tibia, bas),
    cuisseVersBateau: angleEntre(cuisse, versBateau),
    tibiaVersBateau: angleEntre(tibia, versBateau),
    // Le pied au-dessus de l'axe du bwa et du côté du bateau : c'est le crochet.
    piedAuDessusDuBois: cheville.y - CREW_BEAM_Y,
    piedVersLeBateau: hanche.x - cheville.x,
    piedHorsCoque: cheville.x - PLAT_BORD_X
  };
}

/**
 * Tronc : bassin → épaules (Spine02) → tête, dans le repère de la yole, côté +X.
 * Angles depuis la verticale, signés : positif = penché vers le large, négatif =
 * penché vers le bateau. `pliure` : cassure entre le bas et le haut du tronc.
 */
function mesureTronc(visuel, yole, signe) {
  yole.updateWorldMatrix(true, true);
  const local = (nom) => {
    const monde = osMonde(visuel, nom);
    if (!monde) return null;
    const p = yole.worldToLocal(monde);
    p.x *= signe;
    return p;
  };
  const bassin = local("Hips");
  const epaules = local("Spine02") ?? local("Spine2") ?? local("Spine1");
  const tete = local("Head");
  if (!bassin || !epaules || !tete) return null;
  const bas = new THREE.Vector3().subVectors(epaules, bassin);
  const haut = new THREE.Vector3().subVectors(tete, epaules);
  const up = new THREE.Vector3(0, 1, 0);
  const signeDe = (v) => (v.x >= 0 ? 1 : -1);
  const brasHaut = local("LeftArm");
  const avantBras = local("LeftForeArm");
  const main = local("LeftHand");
  return {
    bassinEpaules: signeDe(bas) * angleEntre(bas, up),
    epaulesTete: signeDe(haut) * angleEntre(haut, up),
    pliure: angleEntre(bas, haut),
    hauteurTete: tete.y - bassin.y,
    longueurBras: brasHaut && avantBras && main
      ? brasHaut.distanceTo(avantBras) + avantBras.distanceTo(main)
      : null
  };
}

/** Classe une jambe : "bas" (tendue vers l'eau), "bateau" (tendue vers la coque), "repliee". */
function lecture(jambe) {
  if (!jambe || jambe.flexionGenou === null) return "?";
  // Tendue vers l'eau : cuisse verticale, genou tendu.
  if (jambe.cuisseDepuisBas < 35 && jambe.flexionGenou < 40) return "bas";
  // Vers le bateau : cuisse couchée vers la coque et pied JAMAIS crocheté
  // au-dessus du bois. Le genou peut fléchir quand le pied se cale au
  // plat-bord (quatrième photo) ; couché sur la perche il doit être tendu.
  const piedAuPlatBord = Math.abs(jambe.piedHorsCoque) < PLAT_BORD_TOLERANCE;
  const cuisseVersCoqueMax = piedAuPlatBord ? 70 : 45;
  if (jambe.cuisseVersBateau < cuisseVersCoqueMax && jambe.piedAuDessusDuBois <= 0.16) return "bateau";
  if (jambe.flexionGenou > 45) return "repliee";
  return "oblique";
}

const SCENARIOS = [
  { nom: "ancrage · court, rappel", profil: 0, roll: 0.30, deployment: 1, x: 2.10 },
  { nom: "levier · intermediaire, rappel", profil: 1, roll: 0.30, deployment: 1, x: 2.90 },
  { nom: "extension · extreme, rappel", profil: 2, roll: 0.30, deployment: 1, x: 3.55 },
  { nom: "ancrage · interieur, a bord", profil: 3, roll: 0.0, deployment: 0, x: 0.58 },
  { nom: "ancrage · demi-sortie, plat-bord", profil: 0, roll: 0.18, deployment: 0.55, x: 1.45 },
  { nom: "levier · gite naissante", profil: 4, roll: 0.10, deployment: 0.35, x: 1.30 }
];

function joue(scenario, rig, bibliotheque) {
  const profil = CREW_STAGING_PROFILES[scenario.profil];
  const visuel = new CrewVisual(THREE, 0x8b4e36, 0x2f6f8f, 0x0d2531, 0, rig, null, bibliotheque);
  if (!visuel.fromRig) throw new Error("le rig n'a pas ete lie : la mesure ne vaudrait rien");
  visuel.root.scale.setScalar(CREW_ROOT_SCALE);
  const yole = new THREE.Group();
  yole.add(visuel.root);
  visuel.role = CREW_ROLES[scenario.profil % CREW_ROLES.length];
  visuel.stagingFamily = profil.family;
  visuel.stagingStation = profil.station;
  visuel.stagingDeployment = scenario.deployment;
  visuel.posture = 1;
  visuel.root.position.set(scenario.x, 0.28, 0.5);
  const mouvement = {
    elapsed: 99, duration: 0, precision: 0, kind: 0, delay: 0, sideTransfer: 1,
    sideChanging: false, anticipation: 0, momentum: 0, loadRecoil: 0, solveContacts: true
  };
  for (let k = 0; k < 90; k++) {
    visuel.update(10 + k / 60, 1 / 60, scenario.x, 0.5, 0, scenario.roll, 0, true, 0, 0, 0, 1.6, 0, 0, 1, mouvement);
  }
  const gauche = mesureJambe(visuel, yole, "Left", 1);
  const droite = mesureJambe(visuel, yole, "Right", 1);
  const tronc = mesureTronc(visuel, yole, 1);
  return {
    tronc,
    scenario: scenario.nom,
    famille: profil.family,
    x: +visuel.root.position.x.toFixed(3),
    hike: +(visuel.hikeAmount ?? 0).toFixed(3),
    poseJambes: visuel.legPose ?? null,
    bassinAuDessusDuBois: gauche ? +((gauche.hanche.y - CREW_BEAM_Y)).toFixed(3) : null,
    gauche, droite,
    lectureGauche: lecture(gauche),
    lectureDroite: lecture(droite),
    contactError: +(visuel.contactError ?? 0).toFixed(3),
    priseFerme: +(visuel.firmContactError ?? 0).toFixed(3),
    priseSouple: +(visuel.softContactError ?? 0).toFixed(3)
  };
}

const { json, binaire } = lisGlb(GLB);
const clips = batisClips(json, binaire);
const bibliotheque = new CrewClipLibrary(clips);
const releves = SCENARIOS.map((scenario) => joue(scenario, batisRig(json), bibliotheque));

// ── CONTRATS ─────────────────────────────────────────────────────────────────
//
// Photos de course (Tour des yoles) : au rappel, le genou est TENDU, la jambe
// est soit verticale (assis à cheval, pieds vers l'eau) soit couchée vers le
// bateau (allongé sur la perche, ou pieds au plat-bord). Un pied au-dessus de
// l'axe du bois, côté bateau, est un talon crocheté — le défaut à refuser.
const CONTRATS = {
  flexionGenouMaxRappel: 40,      // degrés : tendu, à la tolérance d'un dressage naturel
  flexionGenouMaxPlatBord: 90,    // pied calé au plat-bord : le genou fléchit autant que la distance l'impose (photo 4 : genoux à angle droit ; dos à la mer, 82-83° mesurés)
  piedAuDessusDuBoisMax: 0.16,    // mètres : pas de talon crocheté sur le bois (marge : pied posé au plat-bord)
  lecturesAdmises: ["bas", "bateau"]
};

if (!process.argv.includes("--json")) {
  console.log("");
  console.log("TRONC (depuis la verticale ; + = vers le large, - = vers le bateau)");
  console.log("  " + "scenario".padEnd(34) + "bassin->epaules".padStart(16) + "epaules->tete".padStart(15) + "pliure".padStart(8) + "tete/bassin".padStart(13) + "bras".padStart(7));
  for (const r of releves) {
    const t = r.tronc;
    if (!t) { console.log("  " + r.scenario.padEnd(34) + "(pas de tronc)"); continue; }
    console.log("  " + r.scenario.padEnd(34)
      + `${t.bassinEpaules.toFixed(0)}°`.padStart(16)
      + `${t.epaulesTete.toFixed(0)}°`.padStart(15)
      + `${t.pliure.toFixed(0)}°`.padStart(8)
      + `${(t.hauteurTete * 100).toFixed(0)} cm`.padStart(13)
      + (t.longueurBras === null ? "" : `${(t.longueurBras * 100).toFixed(0)} cm`.padStart(7)));
  }
}

const echecs = [];
for (const r of releves) {
  if (r.hike < 0.4) continue; // à bord : c'est le repos qui décide, pas le rappel
  for (const [nom, jambe, lect] of [["gauche", r.gauche, r.lectureGauche], ["droite", r.droite, r.lectureDroite]]) {
    if (!jambe) continue;
    const piedAuPlatBord = lect === "bateau" && Math.abs(jambe.piedHorsCoque) < PLAT_BORD_TOLERANCE;
    const genouMax = piedAuPlatBord ? CONTRATS.flexionGenouMaxPlatBord : CONTRATS.flexionGenouMaxRappel;
    if (jambe.flexionGenou > genouMax) {
      echecs.push(`« ${r.scenario} » : genou ${nom} plié à ${jambe.flexionGenou.toFixed(0)}°, maximum ${genouMax}°${piedAuPlatBord ? " (pied au plat-bord)" : ""}`);
    }
    if (!CONTRATS.lecturesAdmises.includes(lect)) {
      echecs.push(`« ${r.scenario} » : jambe ${nom} lue « ${lect} » — attendu tendue vers le bas ou vers le bateau`);
    }
    if (jambe.piedVersLeBateau > 0.25 && jambe.piedAuDessusDuBois > CONTRATS.piedAuDessusDuBoisMax) {
      echecs.push(`« ${r.scenario} » : pied ${nom} crocheté ${(jambe.piedAuDessusDuBois * 100).toFixed(0)} cm au-dessus du bois côté bateau`);
    }
  }
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ glb: path.relative(RACINE, GLB), releves, contrats: CONTRATS, echecs }, null, 2));
} else {
  console.log(`GLB : ${path.relative(RACINE, GLB)}   plat-bord x = ${PLAT_BORD_X.toFixed(3)} m   axe du bwa y = ${CREW_BEAM_Y}`);
  console.log("");
  console.log("  scenario                          x     hike  bassin/bois  jambe   genou  cuisse/bas  cuisse/bateau  pied/bois  pied->bateau  lecture");
  for (const r of releves) {
    for (const [nom, j, lect] of [["G", r.gauche, r.lectureGauche], ["D", r.droite, r.lectureDroite]]) {
      if (!j) continue;
      console.log(`  ${r.scenario.padEnd(32)} ${r.x.toFixed(2).padStart(5)} ${r.hike.toFixed(2).padStart(6)}  ${((r.bassinAuDessusDuBois ?? 0) * 100).toFixed(0).padStart(6)} cm     ${nom}     ${j.flexionGenou.toFixed(0).padStart(4)}°  ${j.cuisseDepuisBas.toFixed(0).padStart(8)}°  ${j.cuisseVersBateau.toFixed(0).padStart(11)}°  ${(j.piedAuDessusDuBois * 100).toFixed(0).padStart(7)} cm  ${(j.piedVersLeBateau * 100).toFixed(0).padStart(9)} cm  ${lect}`);
    }
  }
  console.log("");
  console.log("  genou : 0° = tendu. cuisse/bas : 0° = verticale vers l'eau. cuisse/bateau : 0° = couchée vers la coque.");
  console.log("  pied/bois : hauteur de la cheville au-dessus de l'axe du bwa. pied->bateau : recul du pied vers la coque depuis la hanche.");
  if (echecs.length) {
    console.log("");
    console.log("CONTRATS CASSÉS :");
    for (const e of echecs) console.log("  - " + e);
  } else {
    console.log("");
    console.log("Tous les contrats de jambes sont tenus.");
  }
}
if (process.argv.includes("--strict") && echecs.length) process.exit(1);
