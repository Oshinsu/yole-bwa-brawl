// Les APPUIS d'un yoleur, mesurés sur le GLB livré, dans le repère de la yole.
//
// Une pose se définit par ses contacts, pas par ses angles : le bassin posé sur
// le bois, les mains qui serrent la perche, les pieds qui portent. Les outils
// précédents (jambes, silhouette) mesuraient des angles — tous au vert pendant
// que le bassin flottait trente centimètres au-dessus de la perche et que les
// mains pendaient dans le vide. Celui-ci mesure les distances qui comptent.
//
//   node tools/mesure_appuis_equipage.mjs [--strict] [--json]
//
// Le rayon du bwa vaut 0,06 m (perche de 11-13 cm de diamètre) : le DESSUS du
// bois est à CREW_BEAM_Y + 0,06.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(ICI, "..");
const GLB = path.join(RACINE, "assets", "models", "yole_crew.glb");
const module = (...bouts) => import(pathToFileURL(path.join(RACINE, ...bouts)).href);
const THREE = await module("vendor", "three.module.min.js");
const { CrewClipLibrary } = await module("src", "render", "crew-clips.js");
const {
  CrewVisual, CREW_ROOT_SCALE, CREW_ROLES, CREW_STAGING_PROFILES, CREW_BEAM_Y
} = await module("src", "render", "yole-visual.js");

const RAYON_BWA = 0.06;
const DESSUS_DU_BOIS = CREW_BEAM_Y + RAYON_BWA;
const DEG = 180 / Math.PI;

// ── GLB → rig et clips, sans chargeur (même lecture que mesure_jambes) ─────────
function lisGlb(chemin) {
  const buffer = readFileSync(chemin);
  const longueurJson = buffer.readUInt32LE(12);
  const json = JSON.parse(buffer.subarray(20, 20 + longueurJson).toString("utf8"));
  const debutBin = 20 + longueurJson + 8;
  return { json, binaire: buffer.subarray(debutBin) };
}
function accesseur(json, binaire, index) {
  const acc = json.accessors[index];
  const vue = json.bufferViews[acc.bufferView];
  const composantes = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[acc.type];
  const debut = (vue.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  return new Float32Array(binaire.buffer, binaire.byteOffset + debut, acc.count * composantes);
}
const assainis = (nom) => String(nom ?? "").replace(/[\s.:]/g, "");
function batisRig(json) {
  const noeuds = json.nodes.map((n) => {
    const os = new THREE.Bone();
    os.name = assainis(n.name);
    if (n.translation) os.position.fromArray(n.translation);
    if (n.rotation) os.quaternion.fromArray(n.rotation);
    if (n.scale) os.scale.fromArray(n.scale);
    return os;
  });
  json.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => noeuds[i].add(noeuds[c])));
  const rig = new THREE.Group();
  const racines = new Set(json.nodes.map((_, i) => i));
  json.nodes.forEach((n) => (n.children ?? []).forEach((c) => racines.delete(c)));
  for (const r of racines) rig.add(noeuds[r]);
  return rig;
}
function batisClips(json, binaire) {
  return (json.animations ?? []).map((anim) => {
    const pistes = [];
    for (const canal of anim.channels) {
      const ech = anim.samplers[canal.sampler];
      const temps = accesseur(json, binaire, ech.input);
      const valeurs = accesseur(json, binaire, ech.output);
      const cible = assainis(json.nodes[canal.target.node].name);
      const prop = canal.target.path;
      if (prop === "rotation") pistes.push(new THREE.QuaternionKeyframeTrack(`${cible}.quaternion`, Array.from(temps), Array.from(valeurs)));
      else if (prop === "translation") pistes.push(new THREE.VectorKeyframeTrack(`${cible}.position`, Array.from(temps), Array.from(valeurs)));
      else if (prop === "scale") pistes.push(new THREE.VectorKeyframeTrack(`${cible}.scale`, Array.from(temps), Array.from(valeurs)));
    }
    return new THREE.AnimationClip(anim.name, -1, pistes);
  });
}

function osMonde(visuel, nom) {
  const os = visuel.rigJoints?.find((e) => e.boneName === nom)?.joint;
  return os ? os.getWorldPosition(new THREE.Vector3()) : null;
}

// ── Scénarios : les trois poses, plus la demi-sortie ────────────────────────
const SCENARIOS = [
  { nom: "assis a cheval (levier)", profil: 1, roll: 0.30, deployment: 1, x: 2.90 },
  { nom: "vers le bateau (ancrage)", profil: 0, roll: 0.30, deployment: 1, x: 2.10 },
  { nom: "allonge (extension)", profil: 2, roll: 0.30, deployment: 1, x: 3.55 },
  { nom: "a bord (interieur)", profil: 3, roll: 0.0, deployment: 0, x: 0.58 },
  { nom: "demi-sortie (ancrage)", profil: 0, roll: 0.18, deployment: 0.55, x: 1.45 }
];

function joue(scenario, rig, bibliotheque) {
  const profil = CREW_STAGING_PROFILES[scenario.profil];
  const visuel = new CrewVisual(THREE, 0x8b4e36, 0x2f6f8f, 0x0d2531, 0, rig, null, bibliotheque);
  if (!visuel.fromRig) throw new Error("rig non lié");
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
  yole.updateWorldMatrix(true, true);
  const local = (nom) => { const m = osMonde(visuel, nom); return m ? yole.worldToLocal(m) : null; };

  const hips = local("Hips");
  const hancheG = local("LeftUpLeg");
  const hancheD = local("RightUpLeg");
  const epaules = local("Spine02");
  const tete = local("Head");
  const mainG = local("LeftHand");
  const mainD = local("RightHand");
  const piedG = local("LeftFoot");
  const piedD = local("RightFoot");
  const genouG = local("LeftLeg");
  const genouD = local("RightLeg");
  const epauleG = local("LeftArm");
  const epauleD = local("RightArm");

  // Le point d'assise : entre les deux têtes de fémur, un peu sous elles.
  // C'est le périnée, ce qui touche le bois quand on est assis à cheval.
  const perinee = hancheG && hancheD
    ? new THREE.Vector3().addVectors(hancheG, hancheD).multiplyScalar(0.5).add(new THREE.Vector3(0, -0.06, 0))
    : null;
  const tronc = epaules && hips ? new THREE.Vector3().subVectors(epaules, hips) : null;
  const up = new THREE.Vector3(0, 1, 0);
  const large = new THREE.Vector3(Math.sign(scenario.x) || 1, 0, 0);
  const angle = (v) => v ? Math.acos(Math.max(-1, Math.min(1, v.clone().normalize().dot(up)))) * DEG : null;
  const signeLarge = (v) => v ? (v.dot(large) >= 0 ? 1 : -1) : 1;
  const flexion = (a, b, c) => (a && b && c) ? Math.acos(Math.max(-1, Math.min(1,
    new THREE.Vector3().subVectors(a, b).normalize().dot(new THREE.Vector3().subVectors(c, b).normalize())))) * DEG : null;
  // Distance d'un point à l'AXE du bwa (qui court selon X à la cote CREW_BEAM_Y, z = 0.5).
  const distAxe = (p) => p ? Math.hypot(p.y - CREW_BEAM_Y, p.z - 0.5) : null;

  // Sonde de pole : direction de flexion du genou retenue au repos, exprimee
  // dans le repere de la yole, et normale du plan de flexion courant.
  const chaineG = visuel.ikChains?.leftLeg;
  let poleMonde = null;
  if (chaineG?.poleRest && chaineG.joints?.[1]?.parent) {
    const q = chaineG.joints[1].parent.getWorldQuaternion(new THREE.Quaternion());
    const v = chaineG.poleRest.clone().applyQuaternion(q);
    const qy = yole.getWorldQuaternion(new THREE.Quaternion()).invert();
    v.applyQuaternion(qy);
    poleMonde = [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];
  }
  const normaleGenou = (hancheG && genouG && piedG)
    ? new THREE.Vector3().crossVectors(genouG.clone().sub(hancheG), piedG.clone().sub(genouG)).normalize()
    : null;
  return {
    scenario: scenario.nom,
    pose: visuel.legPose ?? null,
    poleRestGauche: chaineG?.poleRest ? [+chaineG.poleRest.x.toFixed(2), +chaineG.poleRest.y.toFixed(2), +chaineG.poleRest.z.toFixed(2)] : null,
    poleGaucheYole: poleMonde,
    normaleGenouGauche: normaleGenou ? [+normaleGenou.x.toFixed(2), +normaleGenou.y.toFixed(2), +normaleGenou.z.toFixed(2)] : null,
    lacetRacine: +(visuel.root.rotation.y * DEG).toFixed(0),
    cuisseGauche: (hancheG && genouG) ? genouG.clone().sub(hancheG).normalize().toArray().map((v) => +v.toFixed(2)) : null,
    tibiaGauche: (genouG && piedG) ? piedG.clone().sub(genouG).normalize().toArray().map((v) => +v.toFixed(2)) : null,
    chaineGauche: chaineG ? chaineG.joints.map((j) => j.name || j.type) : null,
    pivotJambeGauche: visuel.leftLegPivot ? [visuel.leftLegPivot.rotation.x, visuel.leftLegPivot.rotation.y, visuel.leftLegPivot.rotation.z].map((v) => +(v * DEG).toFixed(0)) : null,
    // Le contact qui manquait : le périnée au-dessus du DESSUS du bois.
    assiseAuDessusDuBois: perinee ? +(perinee.y - DESSUS_DU_BOIS).toFixed(3) : null,
    hipsAuDessusDeLAxe: hips ? +(hips.y - CREW_BEAM_Y).toFixed(3) : null,
    troncDepuisVerticale: tronc ? +(signeLarge(tronc) * angle(tronc)).toFixed(0) : null,
    // Les mains : distance à l'axe du bois moins le rayon = écart au bois. 0 = posée.
    mainGauche: mainG ? +(distAxe(mainG) - RAYON_BWA).toFixed(3) : null,
    mainDroite: mainD ? +(distAxe(mainD) - RAYON_BWA).toFixed(3) : null,
    // Les genoux : 180 = tendu.
    genouGauche: flexion(hancheG, genouG, piedG) !== null ? +(180 - flexion(hancheG, genouG, piedG)).toFixed(0) : null,
    genouDroit: flexion(hancheD, genouD, piedD) !== null ? +(180 - flexion(hancheD, genouD, piedD)).toFixed(0) : null,
    // Le tronc traverse-t-il le bois ? Distance minimale de l'axe au segment bassin→épaules.
    troncAuBois: (hips && epaules) ? +(distanceSegmentAxe(hips, epaules) - RAYON_BWA).toFixed(3) : null,
    piedGaucheY: piedG ? +(piedG.y - CREW_BEAM_Y).toFixed(2) : null,
    piedDroitY: piedD ? +(piedD.y - CREW_BEAM_Y).toFixed(2) : null,
    teteY: tete ? +(tete.y - CREW_BEAM_Y).toFixed(2) : null,
    epauleY: epauleG && epauleD ? +((epauleG.y + epauleD.y) / 2 - CREW_BEAM_Y).toFixed(2) : null
  };
}

/** Distance minimale entre le segment AB et l'axe du bwa (droite y=CREW_BEAM_Y, z=0.5, selon X). */
function distanceSegmentAxe(a, b) {
  let meilleur = Infinity;
  for (let t = 0; t <= 1; t += 0.05) {
    const y = a.y + (b.y - a.y) * t;
    const z = a.z + (b.z - a.z) * t;
    meilleur = Math.min(meilleur, Math.hypot(y - CREW_BEAM_Y, z - 0.5));
  }
  return meilleur;
}

const { json, binaire } = lisGlb(GLB);
const bibliotheque = new CrewClipLibrary(batisClips(json, binaire));
const releves = SCENARIOS.map((s) => joue(s, batisRig(json), bibliotheque));

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ dessusDuBois: DESSUS_DU_BOIS, releves }, null, 2));
} else {
  console.log(`APPUIS — dessus du bois à y = ${DESSUS_DU_BOIS.toFixed(2)} (axe ${CREW_BEAM_Y}, rayon ${RAYON_BWA})`);
  console.log("  " + "scenario".padEnd(26) + "pose".padEnd(8) + "assise/bois".padStart(12) + "tronc".padStart(7)
    + "main G".padStart(8) + "main D".padStart(8) + "genou G".padStart(9) + "genou D".padStart(9) + "tronc/bois".padStart(11) + "tete".padStart(6));
  for (const r of releves) {
    console.log("  " + r.scenario.padEnd(26) + String(r.pose).padEnd(8)
      + `${(r.assiseAuDessusDuBois * 100).toFixed(0)} cm`.padStart(12)
      + `${r.troncDepuisVerticale}°`.padStart(7)
      + `${(r.mainGauche * 100).toFixed(0)} cm`.padStart(8)
      + `${(r.mainDroite * 100).toFixed(0)} cm`.padStart(8)
      + `${r.genouGauche}°`.padStart(9)
      + `${r.genouDroit}°`.padStart(9)
      + `${(r.troncAuBois * 100).toFixed(0)} cm`.padStart(11)
      + `${r.teteY}`.padStart(6));
  }
  console.log("");
  console.log("  assise/bois : périnée moins dessus du bois — 0 = assis dessus, + = flotte, − = enfoncé.");
  console.log("  tronc : bassin → épaules depuis la verticale, + = vers le large.  main : écart au bois, 0 = posée.");
  console.log("  genou : 0 = tendu.  tronc/bois : distance du segment bassin→épaules au bois, − = le traverse.");
}

// ── CONTRATS DE CONTACT ───────────────────────────────────────────────────────
if (process.argv.includes("--strict")) {
  const echecs = [];
  for (const r of releves) {
    if (r.pose === "repos" || r.pose === "pont") continue;
    // Le perinee est une estimation (milieu des tetes de femur, moins 6 cm) : on tolere 8 cm d enfoncement, 3 cm de flottement.
    if (r.assiseAuDessusDuBois > 0.03 || r.assiseAuDessusDuBois < -0.08) echecs.push(`« ${r.scenario} » : bassin à ${(r.assiseAuDessusDuBois * 100).toFixed(0)} cm du bois (tolérance ±3 cm)`);
    if (r.mainGauche > 0.04 && r.mainDroite > 0.04) echecs.push(`« ${r.scenario} » : aucune main sur le bois (${(r.mainGauche * 100).toFixed(0)} et ${(r.mainDroite * 100).toFixed(0)} cm)`);
    if (r.troncAuBois < -0.02) echecs.push(`« ${r.scenario} » : le tronc traverse le bois de ${(-r.troncAuBois * 100).toFixed(0)} cm`);
    if (r.troncDepuisVerticale < 15) echecs.push(`« ${r.scenario} » : tronc à ${r.troncDepuisVerticale}° — un yoleur au rappel penche vers le large`);
    if (r.troncDepuisVerticale > 85) echecs.push(`« ${r.scenario} » : tronc à ${r.troncDepuisVerticale}° — plus bas que l'horizontale`);
  }
  if (echecs.length) {
    console.log("\nCONTRATS D'APPUI CASSÉS :");
    for (const e of echecs) console.log("  - " + e);
    process.exit(1);
  }
  console.log("\nTous les contrats d'appui sont tenus.");
}
