// Contrainte de pole dérivée de la pose de repos.
//
// ⚠️ CE QUE CE TEST DOIT PROUVER. Un CCD cherche une POSITION, pas une
// anatomie : rien ne l'empêche de plier un coude à l'envers pour gagner deux
// centimètres. Le limiteur `maxSwing` bloquait les cassures franches sans jamais
// garantir le SENS de flexion — dernier point rouge de CREW_AUTHENTICITY_AUDIT.
//
// L'audit demandait quatre contrôleurs de direction dans le prochain rig
// Blender. Mesure faite avec `tools/inspect_crew_bend.py` sur le GLB livré :
// inutile. La pose de repos fléchit de 35° au coude et 15° au genou, ce qui
// écarte le milieu de 8,8 cm et 4,5 cm de la corde — le plan est déjà là.
//
// Trois propriétés à tenir, et le test échoue si l'une saute :
//   1. le pole des BRAS se capture sur un membre fléchi, et RESTE NUL sur un
//      membre tendu (sinon on inventerait une direction à partir de bruit) ;
//      celui des JAMBES est le plan du corps — avant, CREW_KNEE_SPREAD dehors —
//      depuis la passe 86 : mesuré en jeu, le bombement du bind (2 % de la
//      jambe) donnait un pôle à 30° et des genoux pliés de côté ;
//   2. un coude retourné revient de son côté ;
//   3. la correction ne DÉPLACE PAS la main — elle tourne autour de l'axe
//      racine→extrémité, donc le contact obtenu par le CCD est intact.

import assert from "node:assert/strict";
import * as THREE from "../vendor/three.module.min.js";
import { CrewVisual } from "../src/render/yole-visual.js";

function bone(name, x = 0, y = 0, z = 0) {
  const joint = new THREE.Bone();
  joint.name = name;
  joint.position.set(x, y, z);
  return joint;
}

// Rig calqué sur le GLB réel : coudes et genoux FLÉCHIS, pas alignés. Les
// décalages en z sont ce qui donne son plan à chaque articulation.
function makeBentRig({ straightArms = false } = {}) {
  const rig = new THREE.Group();
  const hips = bone("Hips", 0, 0.38, 0);
  const spine = bone("Spine", 0, 0.20, 0);
  const spine01 = bone("Spine01", 0, 0.15, 0);
  const spine02 = bone("Spine02", 0, 0.14, 0);
  const neck = bone("Neck", 0, 0.13, 0);
  const head = bone("Head", 0, 0.13, 0);
  hips.add(spine); spine.add(spine01); spine01.add(spine02);
  spine02.add(neck); neck.add(head);

  // Coude reculé en z : c'est le décalage hors corde qui porte le plan.
  const coude = straightArms ? 0 : -0.06;
  for (const [cote, signe] of [["Left", -1], ["Right", 1]]) {
    const arm = bone(`${cote}Arm`, signe * 0.16, 0.08, 0);
    const foreArm = bone(`${cote}ForeArm`, signe * 0.22, 0, coude);
    const hand = bone(`${cote}Hand`, signe * 0.20, 0, straightArms ? 0 : 0.06);
    arm.add(foreArm); foreArm.add(hand); spine02.add(arm);
  }
  // Genou avancé : flexion anatomique normale.
  for (const [cote, signe] of [["Left", -1], ["Right", 1]]) {
    const upLeg = bone(`${cote}UpLeg`, signe * 0.075, -0.04, 0);
    const leg = bone(`${cote}Leg`, 0, -0.25, 0.045);
    const foot = bone(`${cote}Foot`, 0, -0.24, 0.02);
    upLeg.add(leg); leg.add(foot); hips.add(upLeg);
  }
  rig.add(hips);
  return rig;
}

const makeVisual = (rig) => {
  const visual = new CrewVisual(THREE, 0x8a512f, 0xff5d55, 0x142a38, 0, rig);
  const scene = new THREE.Scene();
  scene.add(visual.root);
  return visual;
};

// ── 1. Capture, et refus de capturer sur un membre tendu ─────────────────────
const bent = makeVisual(makeBentRig());
assert.equal(bent.fromRig, true, "le rig fléchi n'a pas été accepté");
for (const [nom, chain] of Object.entries(bent.ikChains)) {
  assert.ok(chain, `chaîne ${nom} absente`);
  assert.ok(chain.poleRest, `chaîne ${nom} : aucun pole capturé sur un membre fléchi`);
  const longueur = Math.hypot(chain.poleRest.x, chain.poleRest.y, chain.poleRest.z);
  assert.ok(Math.abs(longueur - 1) < 1e-5, `pole ${nom} non normalisé: ${longueur}`);
}

const straight = makeVisual(makeBentRig({ straightArms: true }));
assert.equal(straight.ikChains.leftArm.poleRest, null,
  "un bras TENDU au repos ne porte aucun plan : inventer une direction est pire que ne rien faire");
assert.equal(straight.ikChains.rightArm.poleRest, null, "idem à droite");
assert.ok(straight.ikChains.leftLeg.poleRest,
  "les jambes restent fléchies : leur pole doit survivre à des bras tendus");

// ── outil de mesure : angle signé du pole courant vers le pole voulu ─────────
function ecartDePole(visual, chain) {
  const rootJoint = chain.joints[chain.joints.length - 1];
  const midJoint = chain.joints[0];
  visual.rigRoot.updateWorldMatrix(true, true);
  const a = rootJoint.getWorldPosition(new THREE.Vector3());
  const b = midJoint.getWorldPosition(new THREE.Vector3());
  const c = chain.effector.getWorldPosition(new THREE.Vector3());
  const axis = new THREE.Vector3().subVectors(c, a);
  const span = axis.length();
  if (span < 1e-6) return null;
  axis.multiplyScalar(1 / span);
  const courant = new THREE.Vector3().subVectors(b, a);
  courant.addScaledVector(axis, -courant.dot(axis));
  if (courant.length() < 1e-6) return null;
  courant.normalize();
  const parent = rootJoint.parent.getWorldQuaternion(new THREE.Quaternion());
  const voulu = chain.poleRest.clone().applyQuaternion(parent);
  voulu.addScaledVector(axis, -voulu.dot(axis));
  if (voulu.length() < 1e-6) return null;
  voulu.normalize();
  const croix = new THREE.Vector3().crossVectors(courant, voulu);
  return { angle: Math.atan2(croix.dot(axis), courant.dot(voulu)), main: c.clone() };
}

// ── 2. Un coude retourné revient de son côté ─────────────────────────────────
for (const nom of ["leftArm", "rightArm", "leftLeg", "rightLeg"]) {
  const visual = makeVisual(makeBentRig());
  const chain = visual.ikChains[nom];
  const rootJoint = chain.joints[chain.joints.length - 1];

  const repos = ecartDePole(visual, chain);
  // Bras : pole capturé sur le bind, écart nul au repos. Jambes : pole = plan du
  // corps (avant + CREW_KNEE_SPREAD dehors) ; au repos le genou du rig de test
  // bombe droit devant, la mesure vaut donc exactement cet écart voulu (0,12 rad).
  const toleranceRepos = nom.endsWith("Leg") ? 0.13 : 1e-3;
  assert.ok(repos && Math.abs(repos.angle) <= toleranceRepos,
    `${nom} : au repos, le pole courant doit DÉJÀ être le pole voulu (écart ${repos?.angle})`);

  // On retourne franchement l'articulation autour de la corde : 2,2 rad, très
  // au-delà de ce qu'un CCD produirait, pour que le retour soit indiscutable.
  visual.rigRoot.updateWorldMatrix(true, true);
  const a = rootJoint.getWorldPosition(new THREE.Vector3());
  const c = chain.effector.getWorldPosition(new THREE.Vector3());
  const axis = new THREE.Vector3().subVectors(c, a).normalize();
  const parent = rootJoint.parent.getWorldQuaternion(new THREE.Quaternion());
  const monde = new THREE.Quaternion().setFromAxisAngle(axis, 2.2);
  const local = parent.clone().invert().multiply(monde).multiply(parent);
  rootJoint.quaternion.premultiply(local).normalize();

  const casse = ecartDePole(visual, chain);
  assert.ok(Math.abs(casse.angle) > 1.5,
    `${nom} : le retournement de contrôle n'a pas pris (${casse.angle})`);

  // Chaque frame recapture la pose courante avant de solveur : on reproduit.
  let precedent = Math.abs(casse.angle);
  let mainAvant = casse.main;
  for (let frame = 0; frame < 12; frame++) {
    for (let i = 0; i < chain.joints.length; i++) chain.pose[i].copy(chain.joints[i].quaternion);
    visual.applyPoleTarget(chain, 0.85);
    const etat = ecartDePole(visual, chain);
    assert.ok(Math.abs(etat.angle) <= precedent + 1e-6,
      `${nom} : l'écart de pole a AUGMENTÉ (${precedent} -> ${etat.angle})`);
    // ── 3. la main ne bouge pas : rotation autour de l'axe qui la porte ──
    assert.ok(etat.main.distanceTo(mainAvant) < 2e-3,
      `${nom} : la correction de pole a DÉPLACÉ l'effecteur de ${etat.main.distanceTo(mainAvant)} m`);
    precedent = Math.abs(etat.angle);
    mainAvant = etat.main;
  }
  assert.ok(precedent < 0.25,
    `${nom} : le membre n'est jamais revenu dans son plan (reste ${precedent} rad)`);
}

// ── 4. Le budget anatomique reste celui du solveur ───────────────────────────
//
// ⚠️ CE QUE CETTE SECTION NE TESTE PAS, ET POURQUOI.
// Une première version injectait elle-même une rotation de 2,4 rad hors budget
// puis reprochait à `applyPoleTarget` de ne pas la réparer. C'était un faux
// test : la fonction sortait par sa garde « pole voulu parallèle à la corde »
// — comportement correct, il n'y a alors aucun plan de flexion défini — et le
// dépassement venait du test lui-même.
//
// La vraie propriété est plus modeste : QUAND elle agit, la correction laisse
// l'articulation dans son budget. On part donc d'une pose légitime et on force
// la plus grosse correction possible, via un retournement AUTOUR DE LA CORDE
// (qui, lui, garde le pole parfaitement défini).
//
// Noter que `maxStep` (0,34 au bras) est inférieur à `maxSwing` (0,72) sur les
// quatre chaînes : une seule passe ne peut pas saturer le budget. Le reclampage
// dans `applyPoleTarget` est donc défensif — il protège un futur réglage de
// constantes, pas la configuration actuelle.
for (const nom of ["leftArm", "leftLeg"]) {
  const visual = makeVisual(makeBentRig());
  const chain = visual.ikChains[nom];
  const rootJoint = chain.joints[chain.joints.length - 1];
  visual.rigRoot.updateWorldMatrix(true, true);
  const a = rootJoint.getWorldPosition(new THREE.Vector3());
  const c = chain.effector.getWorldPosition(new THREE.Vector3());
  const axis = new THREE.Vector3().subVectors(c, a).normalize();
  const parent = rootJoint.parent.getWorldQuaternion(new THREE.Quaternion());
  rootJoint.quaternion.premultiply(
    parent.clone().invert()
      .multiply(new THREE.Quaternion().setFromAxisAngle(axis, 2.2))
      .multiply(parent)
  ).normalize();

  for (let i = 0; i < chain.joints.length; i++) chain.pose[i].copy(chain.joints[i].quaternion);
  const bouge = visual.applyPoleTarget(chain, 1);
  assert.ok(bouge > 0.5, `${nom} : la correction aurait dû agir franchement (${bouge})`);
  const index = chain.joints.length - 1;
  const swing = chain.pose[index].angleTo(rootJoint.quaternion);
  assert.ok(swing <= chain.maxSwing + 1e-5,
    `${nom} : la correction de pole dépasse maxSwing (${swing} > ${chain.maxSwing})`);
  assert.ok(swing <= chain.maxStep + 1e-5,
    `${nom} : une seule passe dépasse maxStep (${swing} > ${chain.maxStep})`);
}

// ── 5. Un rig sans pole ne casse rien ────────────────────────────────────────
{
  const chain = straight.ikChains.leftArm;
  for (let i = 0; i < chain.joints.length; i++) chain.pose[i].copy(chain.joints[i].quaternion);
  const avant = chain.joints[chain.joints.length - 1].quaternion.clone();
  const bouge = straight.applyPoleTarget(chain, 0.85);
  assert.equal(bouge, 0, "une chaîne sans pole doit rendre 0");
  assert.ok(avant.angleTo(chain.joints[chain.joints.length - 1].quaternion) < 1e-9,
    "une chaîne sans pole ne doit toucher à aucune rotation");
}

console.log(JSON.stringify({
  ok: true,
  chainesAvecPole: Object.values(bent.ikChains).filter((c) => c.poleRest).length,
  brasTendusSansPole: [straight.ikChains.leftArm.poleRest, straight.ikChains.rightArm.poleRest]
    .every((p) => p === null),
  poleGaucheBras: bent.ikChains.leftArm.poleRest.toArray().map((v) => +v.toFixed(4)),
  poleGaucheJambe: bent.ikChains.leftLeg.poleRest.toArray().map((v) => +v.toFixed(4))
}, null, 2));
