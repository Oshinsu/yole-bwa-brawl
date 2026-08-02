import assert from "node:assert/strict";
import * as THREE from "./mock-three.module.js";
import * as REAL_THREE from "../vendor/three.module.min.js";
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
    lastBowWaterHeight: 0.35,
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

function makeMenuBoat(index) {
  const dynamics = handlingState({ x: 0, y: 0.5, z: 0, speed: 0 });
  const root = { position: new THREE.Vector3() };
  return {
    id: index,
    dynamics,
    visual: { root },
    get x() { return dynamics.x; },
    get y() { return dynamics.y; },
    get z() { return dynamics.z; },
    get roll() { return dynamics.roll; },
    get speed() { return dynamics.speed; },
    eliminated: false,
    renderUpdate() {
      root.position.set(dynamics.x, dynamics.y, dynamics.z);
      this.renderCalls = (this.renderCalls ?? 0) + 1;
    },
    forward(out) {
      out.set(Math.sin(dynamics.heading), 0, Math.cos(dynamics.heading));
      return out;
    }
  };
}

function makeMenuCameraContext({ workshop = false, reducedMotion = false } = {}) {
  const boats = Array.from({ length: 4 }, (_, index) => makeMenuBoat(index));
  return {
    ...CameraSystems,
    THREE,
    boats,
    mode: "menu",
    time: 5,
    workshopActive: workshop,
    cameraReducedMotion: reducedMotion,
    camera: new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1500),
    waveField: {
      sample(_x, _z, _time, out = {}) {
        out.height = 0.2;
        out.slopeX = 0;
        out.slopeZ = 0;
        return out;
      }
    },
    waterScratch: {},
    atmosphere: { weather: { stormAmount: 0 } },
    sun: {
      position: new THREE.Vector3(),
      target: { position: new THREE.Vector3() }
    },
    collectAlive: () => boats
  };
}

// Le menu présente désormais la vraie yole 3D en premier plan, puis le
// showroom isole J1 et expose une orbite contrôlable sans animer en mode réduit.
{
  const attract = makeMenuCameraContext({ reducedMotion: true });
  attract.updateAttract(dt);
  assert.equal(attract.boats[0].z, 20);
  assert.ok(attract.boats[1].z > attract.boats[0].z);
  assert.ok(attract.boats[0].dynamics.crewShift > 0.7);
  settleCamera(attract, 240);
  const heroDistance = Math.hypot(
    attract.camera.position.x - attract.boats[0].x,
    attract.camera.position.y - attract.boats[0].y,
    attract.camera.position.z - attract.boats[0].z
  );
  assert.ok(heroDistance < 18, `menu hero camera is too far from J1: ${heroDistance}`);
  assert.ok(Math.abs(attract.camera.fov - 54) < 0.01);
  assert.ok(
    attract.menuCameraTarget.x >= attract.boats[0].x + 1.3,
    "menu hero must aim right of J1 so the boat clears the desktop menu panel"
  );

  const showroom = makeMenuCameraContext({ workshop: true });
  showroom.boats[0].dynamics.eliminated = true;
  showroom.boats[0].dynamics.sink = 8;
  showroom.boats[0].dynamics.waterMassKg = 180;
  showroom.boats[0].dynamics.activeCrew = 0;
  showroom.boats[0].dynamics.structure.hull = 0.2;
  showroom.boats[0].dynamics.structure.mast = 0.1;
  showroom.boats[0].dynamics.structure.sail = 0.3;
  showroom.boats[0].dynamics.structure.bwa.fill(0.25);
  showroom.workshopOrbit = { yaw: -0.45, pitch: 0.28, distance: 12, dragging: true };
  showroom.updateAttract(dt);
  assert.ok(
    showroom.boats[0].y > 1.25,
    `workshop hull must clear the water instead of using race flotation: ${showroom.boats[0].y}`
  );
  assert.ok(Math.abs(showroom.boats[0].roll) < 0.05, "workshop hull must be nearly level");
  assert.equal(showroom.boats[0].dynamics.sink, 0, "a sunk race hull leaked into the workshop");
  assert.equal(showroom.boats[0].dynamics.eliminated, false);
  assert.equal(showroom.boats[0].dynamics.waterMassKg, 0);
  assert.equal(showroom.boats[0].dynamics.activeCrew, 6);
  assert.equal(showroom.boats[0].dynamics.structure.hull, 1);
  assert.equal(showroom.boats[0].dynamics.structure.mast, 1);
  assert.equal(showroom.boats[0].dynamics.structure.sail, 1);
  assert.deepEqual([...showroom.boats[0].dynamics.structure.bwa], [1, 1, 1, 1]);
  for (const rival of showroom.boats.slice(1)) {
    assert.ok(rival.x > 250 && rival.y < -40 && rival.z < -250, "showroom rival stayed in scene");
  }
  settleCamera(showroom, 240);
  const firstPose = showroom.camera.position.clone();
  const hullTargetY = showroom.menuCameraTarget.y;
  assert.ok(
    showroom.menuCameraTarget.x > showroom.boats[0].x + 1.4,
    "wide workshop must bias J1 into the unobstructed preview bay"
  );
  showroom.workshopTab = "sail";
  showroom.updateCamera(dt);
  assert.ok(
    showroom.menuCameraTarget.y - hullTargetY > 2.4,
    "the workshop camera must frame the selected part instead of keeping one generic pose"
  );
  const autoWhileDragging = showroom.workshopAutoOrbit ?? 0;
  showroom.workshopOrbit.yaw += Math.PI / 2;
  settleCamera(showroom, 240);
  assert.ok(
    Math.hypot(
      showroom.camera.position.x - firstPose.x,
      showroom.camera.position.z - firstPose.z
    ) > 8,
    "manual workshop orbit did not move around J1"
  );
  assert.equal(showroom.workshopAutoOrbit ?? 0, autoWhileDragging);
  showroom.workshopOrbit.dragging = false;
  const beforeAuto = showroom.workshopAutoOrbit ?? 0;
  showroom.updateCamera(dt);
  assert.ok(showroom.workshopAutoOrbit > beforeAuto, "idle showroom orbit did not advance");

  const reducedShowroom = makeMenuCameraContext({ workshop: true, reducedMotion: true });
  reducedShowroom.workshopOrbit = { yaw: 0.1, pitch: 0.3, distance: 13, dragging: false };
  reducedShowroom.updateAttract(dt);
  settleCamera(reducedShowroom, 120);
  assert.equal(reducedShowroom.workshopAutoOrbit ?? 0, 0);
}

const calmCamera = settleCamera(makeCameraContext(handlingState()));
const driftCamera = settleCamera(makeCameraContext(handlingState({
  slipAngle: 0.58,
  slip: 0.78
})));
const surfCamera = settleCamera(makeCameraContext(handlingState({ surf: 1 })));
const driftOffsetM = driftCamera.camera.position.x - calmCamera.camera.position.x;
assert.ok(
  calmCamera.cameraLook.z < 8,
  `le point de visée éloigne la yole hors du cadre: ${calmCamera.cameraLook.z}`
);
assert.ok(
  calmCamera.cameraLook.y - calmCamera.boats[0].y <= 0.36,
  "la cible verticale repousse encore la coque sous le HUD"
);
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
// Le mock volontairement minimal n'expose pas Matrix4 : YoleVisual garde alors
// son fallback à sept Mesh. Le navigateur réel couvre le chemin instancié.
if (THREE.Matrix4) {
  assert.ok(visual.beamInstances, "les sept bwa ne sont plus instancies");
  assert.equal(visual.beamInstances.count, visual.beams.length);
}
const realVisual = new YoleVisual(REAL_THREE, 0xffb000, 0x25e0ff, 3);
assert.ok(realVisual.beamInstances?.isInstancedMesh, "le vrai moteur ne groupe pas les bwa");
assert.equal(realVisual.beamInstances.count, realVisual.beams.length);
visual.setCrewDetail(1);
assert.equal(
  visual.crew.filter((entry) => entry.visual.root.visible).length,
  3,
  "le LOD mobile ne conserve pas trois silhouettes de dresseurs"
);
assert.equal(
  visual.specialists.filter((entry) => entry.visual.root.visible).length,
  0,
  "les specialistes lointains coutent encore des draw calls"
);
// CrewVisual.update() réactive les équipiers : le LOD doit reprendre la main
// juste avant chaque rendu, même si son niveau n'a pas changé.
visual.update(visualState, 4.1, dt, weather);
visual.setCrewDetail(1);
assert.equal(visual.crew.filter((entry) => entry.visual.root.visible).length, 3);
visual.setCrewDetail(2);
assert.ok(visual.handlingWake.visible);
assert.ok(visual.handlingWakeRoot.rotation.y > 0.45);
assert.ok(visual.handlingWakeRoot.scale.x > 1.35);
assert.ok(visual.handlingWakeRoot.scale.z > 1.10);
assert.ok(visual.tiltRoot.position.x > 0.09);
assert.ok(visual.tiltRoot.position.y > 0.05);
assert.ok(visual.tiltRoot.rotation.z < -0.04);

const swellState = handlingState({
  surf: 0,
  speed: 22,
  centerWaterHeight: 0.20,
  lastBowWaterHeight: 0.62
});
const swellVisual = new YoleVisual(THREE, 0xffb000, 0x25e0ff, 2);
for (let frame = 0; frame < 180; frame++) {
  swellVisual.update(swellState, frame * dt, dt, weather);
}
assert.ok(swellVisual.waveHeave > 0.045, "la proue monte sans faire rebondir la coque");
assert.ok(swellVisual.wavePitch > 0.045, "la houle ne relève pas visiblement la proue");

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
    maxSurfLiftM: +HANDLING_MOTION.hullSurfLift.toFixed(3),
    swellHeaveM: +swellVisual.waveHeave.toFixed(3),
    swellPitchDeg: +(swellVisual.wavePitch * 180 / Math.PI).toFixed(2)
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
