import assert from "node:assert/strict";
import * as THREE from "../vendor/three.module.min.js";
import { RNG } from "../src/core/rng.js";
import { CREW_OPTIONAL_JOINTS } from "../src/render/assets.js";
import { CrewFallPool } from "../src/render/debris.js";
import {
  CREW_ROLES,
  CREW_SPECIALIST_ROLES,
  CrewVisual
} from "../src/render/yole-visual.js";

function bone(name, x = 0, y = 0, z = 0) {
  const joint = new THREE.Bone();
  joint.name = name;
  joint.position.set(x, y, z);
  return joint;
}

function makeCrewRig() {
  const rig = new THREE.Group();
  rig.name = "crew-test-rig";
  const hips = bone("Hips", 0, 0.38, 0);
  const spine = bone("Spine", 0, 0.20, 0);
  const spine01 = bone("Spine01", 0, 0.15, 0);
  const spine02 = bone("Spine02", 0, 0.14, 0);
  const neck = bone("Neck", 0, 0.13, 0);
  const head = bone("Head", 0, 0.13, 0);
  hips.add(spine);
  spine.add(spine01);
  spine01.add(spine02);
  spine02.add(neck);
  neck.add(head);

  const leftArm = bone("LeftArm", -0.16, 0.08, 0);
  const leftForeArm = bone("LeftForeArm", -0.22, 0, 0);
  const leftHand = bone("LeftHand", -0.20, 0, 0);
  leftArm.add(leftForeArm);
  leftForeArm.add(leftHand);
  spine02.add(leftArm);

  const rightArm = bone("RightArm", 0.16, 0.08, 0);
  const rightForeArm = bone("RightForeArm", 0.22, 0, 0);
  const rightHand = bone("RightHand", 0.20, 0, 0);
  rightArm.add(rightForeArm);
  rightForeArm.add(rightHand);
  spine02.add(rightArm);

  const leftUpLeg = bone("LeftUpLeg", -0.075, -0.04, 0);
  const leftLeg = bone("LeftLeg", 0, -0.25, 0);
  const leftFoot = bone("LeftFoot", 0, -0.24, 0.08);
  leftUpLeg.add(leftLeg);
  leftLeg.add(leftFoot);
  hips.add(leftUpLeg);

  const rightUpLeg = bone("RightUpLeg", 0.075, -0.04, 0);
  const rightLeg = bone("RightLeg", 0, -0.25, 0);
  const rightFoot = bone("RightFoot", 0, -0.24, 0.08);
  rightUpLeg.add(rightLeg);
  rightLeg.add(rightFoot);
  hips.add(rightUpLeg);
  rig.add(hips);
  return { rig, leftForeArm, rightForeArm, leftLeg, rightLeg };
}

assert.ok(
  Object.keys(CREW_OPTIONAL_JOINTS).length >= 11,
  "Crew V2 no longer exposes the full Mixamo finishing chain"
);
assert.deepEqual(
  CREW_ROLES,
  ["premier", "corde", "dresseur", "ecopeur", "dresseur", "dernier"],
  "crew posts no longer preserve the first/last dresseur sequence"
);
assert.deepEqual(
  CREW_SPECIALIST_ROLES,
  ["ecoute", "patron"],
  "the sheet operator and patron disappeared from the one-sail crew"
);

const source = makeCrewRig();
const visual = new CrewVisual(THREE, 0x8a512f, 0xff5d55, 0x142a38, 0, source.rig);
visual.role = "premier";
visual.root.scale.setScalar(0.88);
const scene = new THREE.Scene();
scene.add(visual.root);

assert.equal(visual.fromRig, true, "complete rig fell back to the procedural dummy");
assert.ok(
  Object.values(visual.ikChains).every(Boolean),
  "one of the four hand/foot contact chains is missing"
);

const shiftMotion = {
  elapsed: 0.30,
  delay: 0,
  precision: 0.92,
  kind: 2,
  sideTransfer: 1,
  sideChanging: false,
  anticipation: 0.8
};
visual.root.position.x = 2.75;
visual.update(2, 1 / 60, 2.75, 0, -1.4, 0.55, 0, true, 0, 0, 0, 3, 0, 0, 1, shiftMotion);

assert.equal(visual.motionState, "prise_charge");
assert.ok(Number.isFinite(visual.contactError), "IK produced a non-finite contact error");
assert.ok(visual.contactError < 0.72, `hands/feet never reached the bwa: ${visual.contactError}`);
const loadedContactError = visual.contactError;
assert.ok(
  source.leftForeArm.quaternion.angleTo(new THREE.Quaternion()) > 0.01
    || source.rightForeArm.quaternion.angleTo(new THREE.Quaternion()) > 0.01,
  "forearms remained frozen while the crew loaded the bwa"
);
for (const chain of Object.values(visual.ikChains)) {
  for (let index = 0; index < chain.joints.length; index++) {
    assert.ok(
      chain.pose[index].angleTo(chain.joints[index].quaternion) <= chain.maxSwing + 1e-5,
      "runtime IK exceeded its anatomical correction limit"
    );
  }
}

const transferMotion = {
  ...shiftMotion,
  elapsed: 1.2,
  sideTransfer: 0.5,
  sideChanging: true,
  anticipation: 0.4
};
visual.root.position.x = 0;
visual.update(2.2, 1 / 60, 0, 0, 2.2, 0.05, 0, true, 0, 0, 0, 3.2, 0, 0, 1, transferMotion);
assert.equal(visual.motionState, "changement_bord");
assert.ok(visual.root.position.y < 0.22, `crew did not crouch through the boat: ${visual.root.position.y}`);
assert.ok(Math.abs(visual.head.rotation.y) > 0.01, "first dresseur stopped scanning the new side");
assert.ok(
  source.leftLeg.quaternion.angleTo(source.rightLeg.quaternion) > 0.005,
  "feet cross the boat in lockstep instead of taking alternate supports"
);

visual.role = "patron";
visual.update(2.4, 1 / 60, 0.42, 4.18, 0.1, 0.18, 0, true, 0, 0, 0, 3.4);
assert.equal(visual.motionState, "barre");
visual.role = "ecoute";
visual.update(2.6, 1 / 60, -0.34, 0.72, 0, 0.12, 0, true, 0, 0, 0, 3.6);
assert.equal(visual.motionState, "ecoute");

const fallPool = new CrewFallPool(
  THREE,
  scene,
  [0xff5d55],
  1,
  {
    hasRig: (key) => key === "crew",
    instantiate: () => makeCrewRig().rig
  }
);
assert.equal(
  fallPool.items[0].visual.fromRig,
  true,
  "un chavirage remplace encore le yoleur GLB par un mannequin procédural"
);
fallPool.spawn(
  new RNG(0x5ca7),
  { x: 1, y: 2, z: 3 },
  { x: 0.5, z: 1.2 },
  -1,
  { color: 0x25e0ff, accent: 0x102638, boatId: 2, crewIndex: 4 }
);
fallPool.update(1 / 60, {
  sample: (_x, _z, _time, out = {}) => Object.assign(out, {
    height: 0,
    velocityY: 0
  })
}, 1, null);
assert.equal(fallPool.items[0].root.userData.sourceBoat, 2);
assert.equal(fallPool.items[0].root.userData.sourceCrew, 4);
assert.equal(fallPool.items[0].root.visible, true);

console.log(JSON.stringify({
  ok: true,
  optionalJoints: Object.keys(CREW_OPTIONAL_JOINTS).length,
  contactError: Number(loadedContactError.toFixed(4)),
  states: ["prise_charge", "changement_bord", "barre", visual.motionState],
  ikChains: Object.keys(visual.ikChains),
  overboardUsesCrewRig: fallPool.items[0].visual.fromRig
}, null, 2));
