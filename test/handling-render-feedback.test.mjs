import assert from "node:assert/strict";
import * as THREE from "./mock-three.module.js";
import { CameraSystems } from "../src/game/camera.js";
import { YoleVisual } from "../src/render/yole-visual.js";
import {
  HANDLING_MOTION,
  sampleHandlingMotion
} from "../src/render/handling-motion.js";
import {
  OCEAN_GLINT,
  oceanGlintEnvelope
} from "../src/render/ocean.js";

const dt = 1 / 60;

function handlingState(overrides = {}) {
  return {
    x: 0,
    y: 0.5,
    z: 0,
    heading: 0,
    speed: 20,
    roll: 0,
    pitch: 0,
    slip: 0,
    slipAngle: 0,
    surf: 0,
    counterSteer: 0,
    counterHeel: 0,
    counterSettle: 0,
    activeCrew: 6,
    crewPositions: new Float64Array(6),
    crewVelocities: new Float64Array(6),
    crewShift: 0,
    crewStumble: 0,
    sailPower: 0.8,
    arcadeBoostForward: 0,
    arcadeBoostLateral: 0,
    lateralBoostDirection: 0,
    flow: 0.5,
    centerWaterHeight: 0.35,
    waterMassKg: 0,
    flooding: new Float64Array(6),
    eliminated: false,
    sink: 0,
    structure: {
      hull: 1,
      mast: 1,
      sail: 1,
      bwa: new Float64Array([1, 1, 1, 1])
    },
    ...overrides
  };
}

// L'echantillonneur est borne, symetrique et reutilise bien le scratch fourni.
const sampleScratch = {};
const positive = sampleHandlingMotion({
  slipAngle: HANDLING_MOTION.fullSlipAngle,
  slip: 0.72,
  surf: 0.65,
  counterSteer: 0.8,
  counterHeel: 0.4,
  counterSettle: 0.09
}, sampleScratch);
assert.equal(positive, sampleScratch);
assert.ok(positive.signedSlip > 0.9);
assert.equal(positive.surf, 0.65);
assert.ok(positive.recovery > 0.8);
const negative = sampleHandlingMotion({ slipAngle: -HANDLING_MOTION.fullSlipAngle, slip: 0.72 }, {});
assert.ok(Math.abs(positive.slipEnergy - negative.slipEnergy) < 1e-12);
assert.ok(negative.signedSlip < -0.9);
const bounded = sampleHandlingMotion({ slipAngle: Infinity, slip: 9, surf: -2, counterSteer: NaN }, {});
assert.deepEqual(bounded, {
  slipAngle: 0,
  slipEnergy: 0.62,
  signedSlip: 0,
  surf: 0,
  counter: 0,
  recovery: 0,
  settle: 0
});

function makeCameraContext(dynamics, { reducedMotion = false, reduceFlash = false } = {}) {
  const rootPosition = new THREE.Vector3(dynamics.x, dynamics.y, dynamics.z);
  const boat = {
    x: dynamics.x,
    y: dynamics.y,
    z: dynamics.z,
    speed: dynamics.speed,
    roll: dynamics.roll,
    steer: 0,
    eliminated: false,
    dynamics,
    visual: { root: { position: rootPosition } },
    forward(out) {
      out.set(Math.sin(dynamics.heading), 0, Math.cos(dynamics.heading));
      return out;
    }
  };
  const context = {
    ...CameraSystems,
    THREE,
    boats: [boat],
    round: 1,
    mode: "playing",
    versusLocal: false,
    camera: new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1500),
    cameraZoom: 1,
    cameraReducedMotion: reducedMotion,
    world: {
      constrainCamera(_focus, desired, out) {
        out.copy(desired);
        return out;
      }
    },
    settings: {
      get(key) {
        if (key === "cameraRoll") return 1;
        if (key === "reduceFlash") return reduceFlash;
        return undefined;
      }
    },
    shake: 0,
    visualRng: { signed: () => 0 },
    impact: {
      applyToCamera() {},
      applyOrientation() {}
    },
    sun: {
      position: new THREE.Vector3(),
      target: { position: new THREE.Vector3() }
    },
    collectAlive: () => [boat]
  };
  return context;
}

function settleCamera(context, frames = 240) {
  for (let frame = 0; frame < frames; frame++) context.updateCamera(dt);
  return context;
}

const calmCamera = settleCamera(makeCameraContext(handlingState()));
const driftCamera = settleCamera(makeCameraContext(handlingState({
  slipAngle: 0.58,
  slip: 0.78
})));
const surfCamera = settleCamera(makeCameraContext(handlingState({ surf: 1 })));
const driftOffsetM = driftCamera.camera.position.x - calmCamera.camera.position.x;
assert.ok(
  driftOffsetM > 1.8,
  `derive camera trop faible: ${driftCamera.camera.position.x}`
);
assert.ok(
  surfCamera.camera.fov - calmCamera.camera.fov > 2.1,
  `surf FOV trop faible: ${surfCamera.camera.fov - calmCamera.camera.fov}`
);

const reducedCamera = settleCamera(makeCameraContext(handlingState({
  slipAngle: 0.58,
  slip: 0.78,
  surf: 1
}), { reducedMotion: true }));
assert.ok(Math.abs(reducedCamera.camera.position.x - calmCamera.camera.position.x) < 1e-9);
assert.ok(Math.abs(reducedCamera.camera.fov - calmCamera.camera.fov) < 1e-9);

const flashReducedCamera = settleCamera(makeCameraContext(
  handlingState({ surf: 1 }),
  { reduceFlash: true }
));
const fullSurfFovGain = surfCamera.camera.fov - calmCamera.camera.fov;
const reducedSurfFovGain = flashReducedCamera.camera.fov - calmCamera.camera.fov;
assert.ok(reducedSurfFovGain > 0);
assert.ok(reducedSurfFovGain < fullSurfFovGain * 0.20);

const scratchIdentity = driftCamera.cameraHandlingSample;
settleCamera(driftCamera, 120);
assert.equal(driftCamera.cameraHandlingSample, scratchIdentity);
// Changement de manche : aucun amortisseur de derive/surf ne survit au premier
// frame, et la pose de camera est recalee directement sur la nouvelle ligne.
driftCamera.round = 2;
driftCamera.boats[0].dynamics.slipAngle = 0;
driftCamera.boats[0].dynamics.slip = 0;
driftCamera.boats[0].dynamics.surf = 0;
driftCamera.boats[0].dynamics.counterSteer = 0;
driftCamera.updateCamera(dt);
assert.equal(driftCamera.cameraHandlingSlip, 0);
assert.equal(driftCamera.cameraHandlingSurf, 0);
assert.equal(driftCamera.cameraHandlingRecovery, 0);
assert.ok(Math.abs(driftCamera.camera.position.x) < 1e-12);

const weather = { stormAmount: 0 };
const visualState = handlingState({
  slipAngle: 0.58,
  slip: 0.78,
  surf: 0.82,
  counterSteer: 0.84,
  counterHeel: 0.42
});
const stateBeforeRender = JSON.stringify(visualState);
const visual = new YoleVisual(THREE, 0xffb000, 0x25e0ff, 0);
for (let frame = 0; frame < 240; frame++) visual.update(visualState, frame * dt, dt, weather);
assert.equal(JSON.stringify(visualState), stateBeforeRender, "le rendu a mute l'etat physique");
assert.ok(visual.handlingWake.visible);
assert.ok(visual.handlingWakeRoot.rotation.y > 0.45);
assert.ok(visual.handlingWakeRoot.scale.x > 1.35);
assert.ok(visual.handlingWakeRoot.scale.z > 1.10);
assert.ok(visual.tiltRoot.position.x > 0.09);
assert.ok(visual.tiltRoot.position.y > 0.05);
assert.ok(visual.tiltRoot.rotation.z < -0.04);

const reducedVisual = new YoleVisual(THREE, 0xffb000, 0x25e0ff, 1);
reducedVisual.handlingReducedMotion = true;
for (let frame = 0; frame < 240; frame++) reducedVisual.update(visualState, frame * dt, dt, weather);
assert.ok(Math.abs(reducedVisual.tiltRoot.position.x) < 1e-12);
assert.ok(Math.abs(reducedVisual.tiltRoot.position.y) < 1e-12);
assert.ok(Math.abs(reducedVisual.tiltRoot.rotation.z + visualState.roll) < 1e-12);
assert.ok(reducedVisual.handlingWake.visible, "reduce-motion a masque l'information de derive");

const calmState = handlingState();
for (let frame = 0; frame < 300; frame++) visual.update(calmState, 4 + frame * dt, dt, weather);
assert.equal(visual.handlingWake.visible, false, "le V de mousse ne s'eteint pas");

// Le vrai signal emis par YoleDynamics.reset() doit couper la trainee au tout
// premier rendu, sans attendre les 0,4 s de son enveloppe de sortie.
for (let frame = 0; frame < 180; frame++) visual.update(visualState, 10 + frame * dt, dt, weather);
const resetState = handlingState({
  driveForce: 0,
  drive: 0,
  surf: 0,
  slip: 0,
  slipAngle: 0,
  counterSteer: 0,
  arcadeBoostForward: 0,
  arcadeBoostLateral: 0
});
visual.update(resetState, 13, dt, weather);
assert.equal(visual.handlingSlip, 0);
assert.equal(visual.handlingSlipAngle, 0);
assert.equal(visual.handlingSurf, 0);
assert.equal(visual.handlingWakeStrength, 0);
assert.equal(visual.handlingWake.visible, false);

// Mesure du defaut QA : l'ancien chemin solaire gardait encore plus de la
// moitie de sa puissance a 18 degres au loin. Le nouveau lobe est plus etroit,
// et surtout une grande facette sans micro-crete ne peut plus saturer le bloom.
const angle12 = 12 * Math.PI / 180;
const dot12 = Math.cos(angle12);
const legacyNearAt12 =
  Math.pow(dot12, 132) * 1.0 * (0.76 + 0.5 * 0.32) * 1.05
  + Math.pow(dot12, 22) * (0.70 + 0.5 * 0.30) * 0.16;
const fixedNearAt12 = oceanGlintEnvelope(dot12, 1, 0.5);
assert.ok(
  fixedNearAt12 < legacyNearAt12 * 0.30,
  `lobe solaire encore trop large: ${fixedNearAt12} / ${legacyNearAt12}`
);
assert.ok(oceanGlintEnvelope(1, 1, 0) < 0.20, "facette lisse encore assez forte pour faire un aplat");
assert.ok(oceanGlintEnvelope(1, 1, 1) < 0.72, "pic de scintillement non borne");

const oldPathHalfWidthFar = Math.acos(Math.pow(0.5, 1 / 13)) * 180 / Math.PI;
const newPathHalfWidthFar = Math.acos(Math.pow(0.5, 1 / OCEAN_GLINT.pathExponentFar)) * 180 / Math.PI;
const oldPathHalfWidthNear = Math.acos(Math.pow(0.5, 1 / 22)) * 180 / Math.PI;
const newPathHalfWidthNear = Math.acos(Math.pow(0.5, 1 / OCEAN_GLINT.pathExponentNear)) * 180 / Math.PI;
assert.ok(newPathHalfWidthFar < oldPathHalfWidthFar * 0.70);
assert.ok(newPathHalfWidthNear < oldPathHalfWidthNear * 0.72);

console.log(JSON.stringify({
  ok: true,
  camera: {
    driftOffsetM: +driftOffsetM.toFixed(3),
    surfFovGainDeg: +fullSurfFovGain.toFixed(3),
    reduceFlashFovGainDeg: +reducedSurfFovGain.toFixed(3),
    reduceMotionAddedOffsetM: +(reducedCamera.camera.position.x - calmCamera.camera.position.x).toFixed(6)
  },
  yole: {
    wakeYawDeg: +(visualState.slipAngle * 0.82 * 180 / Math.PI).toFixed(2),
    maxHullSlipM: +HANDLING_MOTION.hullSlipOffset.toFixed(3),
    maxCounterRollDeg: +(HANDLING_MOTION.hullCounterRoll * 180 / Math.PI).toFixed(2),
    maxSurfLiftM: +HANDLING_MOTION.hullSurfLift.toFixed(3)
  },
  ocean: {
    glintAt12Legacy: +legacyNearAt12.toFixed(4),
    glintAt12Fixed: +fixedNearAt12.toFixed(4),
    farPathHalfWidthDeg: [+
      oldPathHalfWidthFar.toFixed(2), +newPathHalfWidthFar.toFixed(2)
    ],
    nearPathHalfWidthDeg: [+
      oldPathHalfWidthNear.toFixed(2), +newPathHalfWidthNear.toFixed(2)
    ]
  }
}, null, 2));
