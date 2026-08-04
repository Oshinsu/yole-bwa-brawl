// Bibliothèque d'actions courtes mélangées SOUS la pose procédurale.
//
// ⚠️ LA PROPRIÉTÉ CRITIQUE EST LA NON-RÉGRESSION. `CREW_ANIMATION_ENGINE.md`
// pose que « le jeu pilote le squelette, il ne joue pas d'animation », parce
// que la pose d'un yoleur est déterminée par la gîte et le bwa. Cette couche a
// donc le droit de DÉPLACER LA POSE DE REPOS, jamais de remplacer la pose de
// jeu — et à poids nul elle doit être strictement invisible.

import assert from "node:assert/strict";
import * as THREE from "../vendor/three.module.min.js";
import {
  CrewClipLibrary,
  CREW_CLIPS,
  breatheKeyframes,
  makeDefaultIdleClip,
  normalizeTrackTarget
} from "../src/render/crew-clips.js";
import {
  CrewVisual,
  CREW_CONTACT_BOTH_FEET,
  CREW_CONTACT_LEAD_FOOT,
  crewContactMode,
  crewPoseForStation,
  selectCrewPoseAction,
  selectCrewTransitionAction
} from "../src/render/yole-visual.js";

// ── Fabrication de clips de test ─────────────────────────────────────────────
const axeVersQuat = (x, y, z, angle) => {
  const q = new THREE.Quaternion();
  q.setFromAxisAngle(new THREE.Vector3(x, y, z).normalize(), angle);
  return [q.x, q.y, q.z, q.w];
};

function piste(nom, cles) {
  const times = new Float32Array(cles.map(([t]) => t));
  const values = new Float32Array(cles.flatMap(([, v]) => v));
  return { name: `${nom}.quaternion`, times, values };
}

function clip(nom, duree, pistes) {
  return { name: nom, duration: duree, tracks: pistes };
}

// ── 1. Sélection : ce qui entre et ce qui est refusé ─────────────────────────
{
  const bibliotheque = new CrewClipLibrary([
    clip("Armature|rappel_idle|baselayer", 2.0, [
      piste("LeftArm", [[0, axeVersQuat(1, 0, 0, 0)], [1, axeVersQuat(1, 0, 0, 0.4)], [2, axeVersQuat(1, 0, 0, 0)]])
    ]),
    // Une seule clé et durée nulle : c'est une POSE, pas une animation. Le GLB
    // d'équipage en porte justement une (`Armature|clip0|baselayer`), signalée
    // par l'audit Blender. Elle doit être refusée, sinon elle écraserait le
    // repos sans jamais bouger.
    clip("Armature|clip0|baselayer", 0, [
      piste("Hips", [[0, axeVersQuat(0, 1, 0, 0.9)]])
    ]),
    // Aucune piste de rotation : position/échelle déplaceraient le corps hors
    // du bwa, or c'est la simulation qui décide où le corps se trouve.
    { name: "charge", duration: 1.5, tracks: [{ name: "Hips.position", times: new Float32Array([0, 1]), values: new Float32Array([0, 0, 0, 0, 1, 0]) }] }
  ]);

  assert.equal(bibliotheque.size, 1, "une seule action aurait dû être retenue");
  assert.ok(bibliotheque.has("rappel_idle"), "le nom Blender bavard n'a pas été réduit à l'action");
  assert.ok(!bibliotheque.has("clip0"), "une pose d'une seule frame est entrée comme animation");
  assert.ok(!bibliotheque.has("charge"), "un clip sans rotation est entré");

  const rapport = bibliotheque.report();
  assert.equal(rapport.refusees.length, 2);
  assert.ok(rapport.refusees.some((r) => r.reason === "pose figée"), "la pose figée n'est pas diagnostiquée");
  assert.deepEqual(
    rapport.manquantes.sort(),
    CREW_CLIPS.filter((a) => a !== "rappel_idle").sort(),
    "le rapport des actions manquantes est faux"
  );
}

// ── 2. Normalisation des noms de pistes ──────────────────────────────────────
// `GLTFLoader` assainit les nœuds : un `arm.L` de Blender arrive en `armL`.
assert.equal(normalizeTrackTarget("Hips.quaternion"), "Hips");
assert.equal(normalizeTrackTarget("arm.L.quaternion"), "armL");
assert.equal(normalizeTrackTarget("mixamorig:LeftArm.quaternion"), "mixamorigLeftArm");
assert.equal(normalizeTrackTarget("Hips"), "Hips", "un nom nu doit rester stable (idempotence)");

// Les noms Blender bavards et la sélection runtime doivent rester d'accord.
{
  const poses = new CrewClipLibrary([
    clip("Armature|pont_interieur|baselayer", 1, [
      piste("Hips", [[0, axeVersQuat(1, 0, 0, 0)], [1, axeVersQuat(1, 0, 0, 0.1)]])
    ]),
    clip("Armature|extension_extreme|baselayer", 1, [
      piste("Hips", [[0, axeVersQuat(1, 0, 0, 0)], [1, axeVersQuat(1, 0, 0, 0.2)]])
    ]),
    clip("compression_transition", 1, [
      piste("Hips", [[0, axeVersQuat(1, 0, 0, 0)], [1, axeVersQuat(1, 0, 0, 0.3)]])
    ])
  ]);
  assert.equal(crewPoseForStation("extreme"), "extension_extreme");
  assert.equal(selectCrewPoseAction(poses, "dresseur", "extreme"), "extension_extreme");
  assert.equal(selectCrewPoseAction(poses, "patron", "extreme"), "pont_interieur");
  assert.equal(selectCrewTransitionAction(poses, true, 0.8), "compression_transition");
  assert.equal(poses.firstAvailable(["cale_court", "pont_interieur"]), "pont_interieur");
  assert.equal(crewContactMode("demi_sorti", null), CREW_CONTACT_BOTH_FEET);
  assert.equal(
    crewContactMode("extension_extreme", null, 0, 0.8),
    CREW_CONTACT_LEAD_FOOT
  );
}

// ── 3. Échantillonnage : interpolation et bouclage ───────────────────────────
{
  const bibliotheque = new CrewClipLibrary([
    clip("rappel_idle", 2.0, [
      piste("LeftArm", [
        [0, axeVersQuat(1, 0, 0, 0)],
        [1, axeVersQuat(1, 0, 0, 1.0)],
        [2, axeVersQuat(1, 0, 0, 0)]
      ])
    ])
  ]);
  const q = new THREE.Quaternion();

  assert.equal(bibliotheque.sample("rappel_idle", "Inconnu", 0.5, q), false,
    "un os non animé doit rendre false pour que l'appelant garde son repos");
  assert.equal(bibliotheque.sample("inexistante", "LeftArm", 0.5, q), false);

  const angle = (t) => {
    assert.equal(bibliotheque.sample("rappel_idle", "LeftArm", t, q), true);
    return 2 * Math.acos(Math.min(1, Math.abs(q.w)));
  };
  assert.ok(angle(0) < 1e-4, `t=0 doit rendre l'identité, obtenu ${angle(0)}`);
  assert.ok(Math.abs(angle(1) - 1.0) < 1e-3, `t=1 doit rendre 1,0 rad, obtenu ${angle(1)}`);
  assert.ok(angle(0.5) > 0.3 && angle(0.5) < 0.7, `interpolation absente au milieu : ${angle(0.5)}`);
  // Une action de rappel n'a pas de fin : elle boucle.
  assert.ok(Math.abs(angle(3) - angle(1)) < 1e-3, "le clip ne boucle pas");
  assert.ok(Math.abs(angle(-1) - angle(1)) < 1e-3, "un temps négatif ne boucle pas");
}

// ── 4. Non-régression : à poids nul, rien ne bouge ───────────────────────────
function bone(name, x = 0, y = 0, z = 0) {
  const b = new THREE.Bone();
  b.name = name;
  b.position.set(x, y, z);
  return b;
}

function rigDeTest() {
  const rig = new THREE.Group();
  const hips = bone("Hips", 0, 0.38, 0);
  const spine = bone("Spine", 0, 0.20, 0);
  const spine01 = bone("Spine01", 0, 0.15, 0);
  const spine02 = bone("Spine02", 0, 0.14, 0);
  const neck = bone("Neck", 0, 0.13, 0);
  const head = bone("Head", 0, 0.13, 0);
  hips.add(spine); spine.add(spine01); spine01.add(spine02);
  spine02.add(neck); neck.add(head);
  for (const [cote, signe] of [["Left", -1], ["Right", 1]]) {
    const a = bone(`${cote}Arm`, signe * 0.16, 0.08, 0);
    const f = bone(`${cote}ForeArm`, signe * 0.22, 0, -0.06);
    const h = bone(`${cote}Hand`, signe * 0.20, 0, 0.06);
    a.add(f); f.add(h); spine02.add(a);
  }
  for (const [cote, signe] of [["Left", -1], ["Right", 1]]) {
    const u = bone(`${cote}UpLeg`, signe * 0.075, -0.04, 0);
    const l = bone(`${cote}Leg`, 0, -0.25, 0.045);
    const p = bone(`${cote}Foot`, 0, -0.24, 0.02);
    u.add(l); l.add(p); hips.add(u);
  }
  rig.add(hips);
  return rig;
}

const actions = [
  clip("rappel_idle", 2.0, [
    piste("LeftArm", [[0, axeVersQuat(1, 0, 0, 0)], [1, axeVersQuat(1, 0, 0, 0.5)], [2, axeVersQuat(1, 0, 0, 0)]]),
    piste("Spine", [[0, axeVersQuat(0, 0, 1, 0)], [1, axeVersQuat(0, 0, 1, 0.2)], [2, axeVersQuat(0, 0, 1, 0)]])
  ])
];

{
  const sans = new CrewVisual(THREE, 0x8a512f, 0xff5d55, 0x142a38, 0, rigDeTest(), null, null);
  const avec = new CrewVisual(THREE, 0x8a512f, 0xff5d55, 0x142a38, 0, rigDeTest(), null, new CrewClipLibrary(actions));
  assert.equal(sans.fromRig, true);
  assert.equal(avec.fromRig, true);

  // Même pose procédurale injectée des deux côtés.
  for (const visual of [sans, avec]) {
    visual.leftArmPivot.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.3);
    visual.torso.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.15);
  }
  avec.setClipBlend("rappel_idle", 1.0, 0);   // poids NUL
  sans.syncRig();
  avec.syncRig();

  // ⚠️ ON COMPARE LES COMPOSANTES, PAS `angleTo`.
  // `angleTo` fait un `acos` au voisinage de 1, où la fonction est mal
  // conditionnée : une erreur de 4e-16 sur le produit scalaire ressort en 3e-8
  // d'angle. Une première version de ce test échouait donc sur du bruit
  // flottant en croyant mesurer une régression. « Bit pour bit » se vérifie sur
  // x, y, z, w.
  for (let i = 0; i < sans.rigJoints.length; i++) {
    const a = sans.rigJoints[i].joint.quaternion;
    const b = avec.rigJoints[i].joint.quaternion;
    const nom = sans.rigJoints[i].boneName;
    for (const composante of ["x", "y", "z", "w"]) {
      assert.equal(a[composante], b[composante],
        `poids nul mais l'os ${nom} diffère sur ${composante} : ${a[composante]} vs ${b[composante]}`);
    }
  }
}

// ── 5. À poids non nul, le repos bouge — la pose de jeu, non ─────────────────
{
  const visual = new CrewVisual(THREE, 0x8a512f, 0xff5d55, 0x142a38, 0, rigDeTest(), null, new CrewClipLibrary(actions));
  visual.leftArmPivot.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.3);

  visual.setClipBlend("rappel_idle", 1.0, 0);
  visual.syncRig();
  const neutre = visual.rigJoints.map((j) => j.joint.quaternion.clone());

  const applique = visual.setClipBlend("rappel_idle", 1.0, 0.3);
  assert.ok(Math.abs(applique - 0.3) < 1e-9, "le poids demandé n'a pas été retenu");
  visual.syncRig();

  const parOs = new Map(visual.rigJoints.map((j, i) => [j.boneName, j.joint.quaternion.angleTo(neutre[i])]));
  assert.ok(parOs.get("LeftArm") > 0.05, `l'os animé n'a pas bougé (${parOs.get("LeftArm")})`);
  assert.ok(parOs.get("Spine") > 0.02, `l'os animé n'a pas bougé (${parOs.get("Spine")})`);
  // Un os que le clip n'anime pas doit rester EXACTEMENT sur son repos : une
  // action partielle reste utilisable au lieu de figer le reste du corps.
  // Composantes, pas `angleTo` — même raison qu'à la section précédente.
  const intacts = new Map(visual.rigJoints.map((j, i) => [j.boneName, [j.joint.quaternion, neutre[i]]]));
  for (const nom of ["RightArm", "Head", "RightUpLeg"]) {
    const [q, reference] = intacts.get(nom);
    for (const composante of ["x", "y", "z", "w"]) {
      assert.equal(q[composante], reference[composante],
        `un os non animé (${nom}) a bougé sur ${composante}`);
    }
  }
}

// ── 6. Le plafond de mélange n'est pas contournable ──────────────────────────
// Au-delà, l'équipage suivrait le clip plutôt que la mer : c'est exactement le
// défaut que l'architecture interdit. La borne vit dans setClipBlend, pas dans
// l'appelant, pour qu'aucun site d'appel ne puisse passer outre.
{
  const visual = new CrewVisual(THREE, 0x8a512f, 0xff5d55, 0x142a38, 0, rigDeTest(), null, new CrewClipLibrary(actions));
  assert.equal(visual.setClipBlend("rappel_idle", 0, 1.0), 0.35, "le plafond de 0,35 est contournable");
  assert.equal(visual.setClipBlend("rappel_idle", 0, -3), 0, "un poids négatif passe");
  assert.equal(visual.setClipBlend("rappel_idle", 0, Number.NaN), 0, "un NaN passe");
  visual.setClipBlend("rappel_idle", Number.NaN, 0.2);
  assert.equal(visual.clipTime, 0, "un temps NaN passe");
}

// ── 7. Bibliothèque vide : le chemin d'origine, intact ───────────────────────
{
  const vide = new CrewClipLibrary([]);
  assert.equal(vide.size, 0);
  const visual = new CrewVisual(THREE, 0x8a512f, 0xff5d55, 0x142a38, 0, rigDeTest(), null, vide);
  visual.setClipBlend("rappel_idle", 1.0, 0.35);
  visual.syncRig();   // ne doit pas lever
  assert.ok(Number.isFinite(visual.rigJoints[0].joint.quaternion.w));
}

// ── 8. Sans vidéo : une pose de photo, animée ────────────────────────────────
// C'est la voie recommandée par docs/CREW_CLIP_LIBRARY.md — cinq poses posées
// à la main contre les photos de référence, sans captation ni droit à l'image.
{
  const identite = [0, 0, 0, 1];
  const pose = { LeftArm: identite, Spine: identite, Head: identite };
  const cles = breatheKeyframes(pose, {
    Spine: { axis: [1, 0, 0], angle: 0.03 },
    LeftArm: { axis: [0, 0, 1], angle: 0.02 }
  }, 3.4);

  assert.equal(cles.length, 3, "repos → inspiration → repos");
  assert.equal(cles[0].time, 0);
  assert.equal(cles[2].time, 3.4);
  // La boucle doit se refermer EXACTEMENT, sinon un saut à chaque cycle.
  assert.deepEqual(cles[0].bones, cles[2].bones, "la boucle de respiration ne se referme pas");
  // Un os sans réglage de souffle reste sur sa pose.
  assert.deepEqual(cles[1].bones.Head, identite, "un os non soufflé a bougé");

  const clipPose = CrewClipLibrary.fromKeyframes("rappel_idle", cles);
  assert.ok(clipPose, "la synthèse depuis poses clés a échoué");
  assert.equal(clipPose.duration, 3.4);
  assert.equal(clipPose.tracks.length, 3, "les trois os devraient être suivis");

  const bibliotheque = new CrewClipLibrary([clipPose]);
  assert.ok(bibliotheque.has("rappel_idle"), "le clip synthétisé a été refusé");

  const q = new THREE.Quaternion();
  bibliotheque.sample("rappel_idle", "Spine", 1.7, q);
  const angleMax = 2 * Math.acos(Math.min(1, Math.abs(q.w)));
  assert.ok(Math.abs(angleMax - 0.03) < 5e-3,
    `l'amplitude de souffle n'est pas respectée : ${angleMax}`);
  bibliotheque.sample("rappel_idle", "Spine", 0, q);
  assert.ok(2 * Math.acos(Math.min(1, Math.abs(q.w))) < 1e-6, "le repos n'est pas neutre");

  // Un os absent d'une seule clé est écarté : une piste trouée sauterait.
  const troue = CrewClipLibrary.fromKeyframes("charge", [
    { time: 0, bones: { LeftArm: identite, Spine: identite } },
    { time: 1, bones: { LeftArm: identite } }
  ]);
  assert.equal(troue.tracks.length, 1, "un os présent dans une seule clé est passé");

  // Garde-fous d'entrée.
  assert.equal(CrewClipLibrary.fromKeyframes("x", []), null);
  assert.equal(CrewClipLibrary.fromKeyframes("x", [{ time: 0, bones: { A: identite } }]), null,
    "une clé unique ne fait pas une animation");
  assert.equal(
    CrewClipLibrary.fromKeyframes("x", [
      { time: 0, bones: { A: identite } },
      { time: 0, bones: { A: identite } }
    ]),
    null,
    "une durée nulle ne fait pas une animation"
  );
}

// ── 9. Absolu contre relatif : la distinction qui coûte cher ─────────────────
//
// ⚠️ Un clip glTF porte la rotation ABSOLUE du nœud — c'est la spec, il REMPLACE
// le repos. Un clip fabriqué en code porte un OFFSET à composer AVEC lui.
//
// Mesuré dans le jeu le 2 août 2026 : traiter la respiration comme absolue
// faisait slerper le repos vers l'identité. L'os `LeftArm` a un repos à 81° de
// l'identité ; un offset de 0,9° mélangé à 0,16 déplaçait donc l'os de ~13° au
// lieu de 0,15°. Quatre-vingts fois trop, et parfaitement invisible en test
// unitaire tant que la sémantique n'est pas explicite.
{
  const idle = makeDefaultIdleClip("rappel_idle", 3.4);
  assert.ok(idle, "le clip de respiration par défaut n'a pas été fabriqué");
  assert.equal(idle.relative, true, "la respiration DOIT être marquée relative");

  const bibliotheque = new CrewClipLibrary([idle]);
  assert.equal(bibliotheque.isRelative("rappel_idle"), true,
    "le drapeau relatif n'a pas survécu à l'indexation");

  // Un clip glTF ordinaire reste absolu : rien ne doit basculer par défaut.
  const glb = new CrewClipLibrary([clip("charge", 1.2, [
    piste("Spine", [[0, axeVersQuat(1, 0, 0, 0)], [1.2, axeVersQuat(1, 0, 0, 0.3)]])
  ])]);
  assert.equal(glb.isRelative("charge"), false,
    "un clip glTF a été pris pour un offset — il remplacerait le repos de travers");

  // L'offset lui-même reste minuscule : c'est une respiration, pas un geste.
  const q = new THREE.Quaternion();
  let maximum = 0;
  for (let t = 0; t <= 3.4; t += 0.1) {
    bibliotheque.sample("rappel_idle", "Spine", t, q);
    maximum = Math.max(maximum, 2 * Math.acos(Math.min(1, Math.abs(q.w))));
  }
  const degres = maximum * 180 / Math.PI;
  assert.ok(degres > 0.5 && degres < 3,
    `amplitude de respiration hors échelle : ${degres.toFixed(2)}° (on vise ~1,7°)`);
}

console.log(JSON.stringify({
  ok: true,
  actionsAttendues: CREW_CLIPS,
  plafondMelange: 0.35,
  voieSansVideo: "poses clés + breatheKeyframes",
  respirationParDefaut: "relative, ~1,7° d'offset, 0,27° à l'écran au poids 0,16"
}, null, 2));
