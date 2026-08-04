import assert from "node:assert/strict";
import * as THREE from "./mock-three.module.js";
import {
  CINEMATIC_TIMING,
  CINEMATIC_TRACKS,
  MiniCinematicDirector,
  sampleCinematicTrack
} from "../src/game/cinematic.js";
import { MatchDirector } from "../src/game/match.js";

const DT = 1 / 60;

function makeBoat() {
  const dynamics = {
    x: 2,
    y: 0.6,
    z: 20,
    heading: 0.04,
    roll: 0,
    crewPositions: new Float32Array(6)
  };
  return {
    id: 0,
    name: "J1",
    dynamics,
    visual: { root: { position: new THREE.Vector3(dynamics.x, dynamics.y, dynamics.z) } },
    eliminated: false,
    tourFinished: false,
    finishTick: 0,
    get x() { return dynamics.x; },
    get y() { return dynamics.y; },
    get z() { return dynamics.z; }
  };
}

function makeGame(overrides = {}) {
  const player = makeBoat();
  let constraints = 0;
  const game = {
    THREE,
    boats: [player],
    mode: "menu",
    workshopActive: false,
    cameraReducedMotion: false,
    cameraHandlingHardReset: false,
    countdown: 0,
    roundTime: 0,
    tick: 0,
    roundEnding: 0,
    tour: null,
    camera: new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1500),
    sun: {
      position: new THREE.Vector3(),
      target: { position: new THREE.Vector3() }
    },
    world: {
      constrainCamera(_focus, desired, out) {
        constraints++;
        out.copy(desired);
        return out;
      }
    },
    impact: {
      applyToCamera() {},
      applyOrientation() {}
    },
    get constraintCalls() { return constraints; },
    ...overrides
  };
  return game;
}

// Le premier plan reprend exactement les chiffres du hero historique, puis la
// boucle visite réellement l'équipage et la voile sans coupe.
{
  const pose = sampleCinematicTrack(CINEMATIC_TRACKS.menu, 0, {});
  assert.equal(pose.id, "menu-hero");
  assert.equal(pose.side, 13.2);
  assert.equal(pose.along, -6.6);
  assert.equal(pose.height, 5.35);
  assert.equal(pose.targetSide, 5.2);
  assert.equal(pose.targetHeight, 0.45);
  assert.equal(pose.fov, 54);

  const transition = sampleCinematicTrack(CINEMATIC_TRACKS.menu, 6.25, {});
  assert.ok(transition.mix > 0 && transition.mix < 1);
  assert.ok(transition.side < 13.2 && transition.side > 11.2);
  assert.equal(sampleCinematicTrack(CINEMATIC_TRACKS.menu, 7, {}).id, "menu-crew");
  assert.equal(
    sampleCinematicTrack(CINEMATIC_TRACKS.menu, CINEMATIC_TRACKS.menu.duration, {}).id,
    "menu-hero",
    "la boucle du menu ne revient pas au plan hero"
  );
}

// Mouvement réduit : le réalisateur garde un hero fixe. Mode normal : le plan
// change après sa durée, sans que le rendu touche à l'état de la yole.
{
  const reducedGame = makeGame({ cameraReducedMotion: true });
  const reducedDirector = new MiniCinematicDirector(THREE);
  const before = JSON.stringify(reducedGame.boats[0].dynamics);
  for (let frame = 0; frame < 600; frame++) {
    assert.equal(reducedDirector.update(reducedGame, DT, reducedGame.boats[0]), true);
  }
  const settled = reducedGame.camera.position.clone();
  for (let frame = 0; frame < 120; frame++) {
    reducedDirector.update(reducedGame, DT, reducedGame.boats[0]);
  }
  assert.ok(Math.hypot(
    reducedGame.camera.position.x - settled.x,
    reducedGame.camera.position.y - settled.y,
    reducedGame.camera.position.z - settled.z
  ) < 1e-8);
  assert.equal(reducedDirector.debugState().shot, "menu-hero");
  assert.equal(JSON.stringify(reducedGame.boats[0].dynamics), before);

  const movingGame = makeGame();
  const movingDirector = new MiniCinematicDirector(THREE);
  for (let frame = 0; frame < 430; frame++) movingDirector.update(movingGame, DT, movingGame.boats[0]);
  assert.equal(movingDirector.debugState().shot, "menu-crew");

  movingGame.workshopActive = true;
  assert.equal(movingDirector.update(movingGame, DT, movingGame.boats[0]), false);
}

// Le flyby appartient seulement au premier vrai 3-2-1. Le mini-rebours d'une
// reprise ne doit jamais arracher la caméra au joueur.
{
  const startGame = makeGame({
    mode: "playing",
    countdown: CINEMATIC_TIMING.countdown - 0.2,
    roundTime: 0
  });
  const director = new MiniCinematicDirector(THREE);
  assert.equal(director.update(startGame, DT, startGame.boats[0]), true);
  assert.equal(director.debugState().cue, "start");
  assert.equal(director.debugState().shot, "start-grid");
  assert.ok(startGame.constraintCalls > 0);
  assert.ok(Number.isFinite(startGame.camera.fov));

  startGame.countdown = 0.8;
  assert.equal(director.update(startGame, DT, startGame.boats[0]), false, "GO devait rendre la poursuite");

  startGame.countdown = 3.2;
  startGame.roundTime = 9;
  assert.equal(director.update(startGame, DT, startGame.boats[0]), false, "une reprise a rejoué le flyby");

  const roundContext = {
    mode: "playing",
    round: 2,
    tick: 420,
    seed: 17,
    boats: [{
      reset() {},
      tourFinished: true,
      finishTick: 99
    }],
    resetPools() {},
    replay: { markRound() {} },
    showMessage() {},
    updateLeaderboard() {}
  };
  MatchDirector.resetRound.call(roundContext, true);
  assert.ok(roundContext.countdown >= 3.8, "la manche suivante n'arme pas son vrai 3-2-1");
}

// Arrivée et victoire emploient l'état déterministe existant. Une élimination
// laisse toujours la priorité à la death-cam.
{
  const finishGame = makeGame({ mode: "playing", tour: {}, tick: 600 });
  finishGame.boats[0].tourFinished = true;
  finishGame.boats[0].finishTick = 570;
  const finishDirector = new MiniCinematicDirector(THREE);
  assert.equal(finishDirector.update(finishGame, DT, finishGame.boats[0]), true);
  assert.equal(finishDirector.debugState().shot, "finish-waterline");

  finishGame.tick = 570 + Math.ceil(CINEMATIC_TIMING.tourFinish * 60);
  assert.equal(finishDirector.update(finishGame, DT, finishGame.boats[0]), false);

  const victoryGame = makeGame({
    mode: "playing",
    roundEnding: CINEMATIC_TIMING.roundEnd - CINEMATIC_TIMING.victoryDelay - 0.1
  });
  const victoryDirector = new MiniCinematicDirector(THREE);
  assert.equal(victoryDirector.update(victoryGame, DT, victoryGame.boats[0]), true);
  assert.equal(victoryDirector.debugState().shot, "victory-orbit");

  victoryGame.boats[0].eliminated = true;
  assert.equal(victoryDirector.update(victoryGame, DT, victoryGame.boats[0]), false);
}

console.log(JSON.stringify({
  ok: true,
  tracks: Object.fromEntries(
    Object.entries(CINEMATIC_TRACKS).map(([name, track]) => [name, {
      duration: track.duration,
      shots: track.shots.map((shot) => shot.id)
    }])
  )
}, null, 2));
