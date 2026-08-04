import { clamp, damp, smoothstep } from "../core/math.js";
import {
  CONFIG,
  COUNTDOWN_GO_SECONDS,
  COUNTDOWN_SECONDS
} from "./balance.js";

export const CINEMATIC_TIMING = Object.freeze({
  countdown: COUNTDOWN_SECONDS + COUNTDOWN_GO_SECONDS,
  go: COUNTDOWN_GO_SECONDS,
  tourFinish: 1.65,
  roundEnd: 2.70,
  victoryDelay: 0.55
});

function makeTrack(loop, shots) {
  const frozenShots = shots.map((shot) => Object.freeze({ ...shot }));
  const duration = frozenShots.reduce((total, shot) => total + shot.duration, 0);
  return Object.freeze({
    loop,
    duration,
    shots: Object.freeze(frozenShots)
  });
}

// Positions dans le repère de la yole :
//   side   = tribord (+) / bâbord (-)
//   along  = proue (+) / poupe (-)
// Les plans du menu restent alignés sur l'écran afin de préserver la baie libre
// à droite du panneau principal.
export const CINEMATIC_TRACKS = Object.freeze({
  menu: makeTrack(true, [
    {
      id: "menu-hero",
      duration: 6.8,
      blend: 1.1,
      side: 13.2,
      along: -6.6,
      height: 5.35,
      // La caméra regarde plus loin à tribord : dans ce contrechamp, cela
      // projette la yole dans la baie droite laissée libre par le grand panneau.
      targetSide: 5.2,
      targetAlong: 0.9,
      targetHeight: 0.45,
      fov: 54
    },
    {
      id: "menu-crew",
      duration: 4.8,
      blend: 1.1,
      side: 11.2,
      along: -5,
      height: 3.65,
      targetSide: 7.6,
      targetAlong: 0.2,
      targetHeight: 0.55,
      fov: 52
    },
    {
      id: "menu-sail",
      duration: 6.0,
      blend: 1.1,
      side: 14.5,
      along: -7,
      height: 8,
      targetSide: 5.5,
      targetAlong: 0.5,
      targetHeight: 3.2,
      fov: 50
    }
  ]),
  start: makeTrack(false, [
    {
      id: "start-grid",
      duration: 1,
      blend: 0.24,
      side: 0,
      along: -31,
      height: 11.5,
      targetSide: 0,
      targetAlong: 6,
      targetHeight: 1,
      fov: 64
    },
    {
      id: "start-hero",
      duration: 1,
      blend: 0.24,
      side: 11.5,
      along: -4,
      height: 4.8,
      targetSide: 0.8,
      targetAlong: 0.8,
      targetHeight: 1.3,
      fov: 53
    },
    {
      id: "start-stern",
      duration: 1,
      blend: 0,
      side: 3.8,
      along: -17.5,
      height: 8.5,
      targetSide: 0.2,
      targetAlong: 5,
      targetHeight: 0.6,
      fov: 57
    }
  ]),
  tourFinish: makeTrack(false, [
    {
      id: "finish-waterline",
      duration: CINEMATIC_TIMING.tourFinish,
      blend: 0,
      side: 9.8,
      along: -2.8,
      height: 4.3,
      targetSide: 0,
      targetAlong: 2.5,
      targetHeight: 0.75,
      fov: 50
    }
  ]),
  victory: makeTrack(false, [
    {
      id: "victory-orbit",
      duration: CINEMATIC_TIMING.roundEnd - CINEMATIC_TIMING.victoryDelay,
      blend: 0,
      side: 10.5,
      along: -4,
      height: 5.3,
      targetSide: 0,
      targetAlong: 0.8,
      targetHeight: 1.05,
      fov: 52
    }
  ])
});

const POSE_FIELDS = Object.freeze([
  "side",
  "along",
  "height",
  "targetSide",
  "targetAlong",
  "targetHeight",
  "fov"
]);

/**
 * Échantillonne un track sans créer d'objet. Les plans tiennent leur pose, puis
 * fondent vers le suivant pendant `blend` secondes : aucun spline ni runtime
 * externe n'est nécessaire pour obtenir un langage de caméra lisible.
 */
export function sampleCinematicTrack(track, time, out = {}) {
  if (!track?.shots?.length) return null;
  let cursor = Number.isFinite(time) ? Math.max(0, time) : 0;
  if (track.loop && track.duration > 0) cursor %= track.duration;
  else cursor = Math.min(cursor, Math.max(0, track.duration - 1e-6));

  let start = 0;
  let index = track.shots.length - 1;
  for (let shotIndex = 0; shotIndex < track.shots.length; shotIndex++) {
    const end = start + track.shots[shotIndex].duration;
    if (cursor < end || shotIndex === track.shots.length - 1) {
      index = shotIndex;
      break;
    }
    start = end;
  }

  const shot = track.shots[index];
  const nextIndex = index + 1 < track.shots.length
    ? index + 1
    : (track.loop ? 0 : index);
  const next = track.shots[nextIndex];
  const local = cursor - start;
  const blend = Math.min(Math.max(shot.blend ?? 0, 0), shot.duration);
  const mix = blend > 0 && next !== shot
    ? smoothstep(shot.duration - blend, shot.duration, local)
    : 0;

  for (const field of POSE_FIELDS) {
    const a = Number.isFinite(shot[field]) ? shot[field] : 0;
    const b = Number.isFinite(next[field]) ? next[field] : a;
    out[field] = a + (b - a) * mix;
  }
  out.id = shot.id;
  out.nextId = next.id;
  out.index = index;
  out.mix = mix;
  out.time = cursor;
  return out;
}

export class MiniCinematicDirector {
  constructor(THREE) {
    this.THREE = THREE;
    this.pose = {};
    this.desired = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.anchor = new THREE.Vector3();
    this.activeCue = null;
    this.activeShot = null;
    this.elapsed = 0;
  }

  reset(game = null) {
    if (this.activeCue && game) game.cameraHandlingHardReset = true;
    this.activeCue = null;
    this.activeShot = null;
    this.elapsed = 0;
  }

  debugState() {
    return {
      cue: this.activeCue,
      shot: this.activeShot,
      elapsed: this.elapsed
    };
  }

  apply(game, follow, track, time, dt, options = {}) {
    const pose = sampleCinematicTrack(track, time, this.pose);
    if (!pose || !follow) return false;

    const heading = Number.isFinite(follow.dynamics?.heading)
      ? follow.dynamics.heading
      : 0;
    const forwardX = Math.sin(heading);
    const forwardZ = Math.cos(heading);
    const rightX = forwardZ;
    const rightZ = -forwardX;
    let side = pose.side;
    let along = pose.along;
    if (options.orbit) {
      const cosine = Math.cos(options.orbit);
      const sine = Math.sin(options.orbit);
      const rotatedSide = side * cosine - along * sine;
      along = side * sine + along * cosine;
      side = rotatedSide;
    }

    const worldAligned = Boolean(options.worldAligned);
    const cameraX = worldAligned
      ? follow.x + side
      : follow.x + rightX * side + forwardX * along;
    const cameraZ = worldAligned
      ? follow.z + along
      : follow.z + rightZ * side + forwardZ * along;
    const targetX = worldAligned
      ? follow.x + pose.targetSide
      : follow.x + rightX * pose.targetSide + forwardX * pose.targetAlong;
    const targetZ = worldAligned
      ? follow.z + pose.targetAlong
      : follow.z + rightZ * pose.targetSide + forwardZ * pose.targetAlong;

    this.desired.set(cameraX, follow.y + pose.height, cameraZ);
    this.target.set(targetX, follow.y + pose.targetHeight, targetZ);
    if (!worldAligned) {
      game.world?.constrainCamera?.(
        follow.visual?.root?.position ?? this.target,
        this.desired,
        this.desired
      );
    }

    const frameDt = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.1);
    const response = options.worldAligned ? 4.8 : 10.5;
    game.camera.position.lerp(this.desired, 1 - Math.exp(-response * frameDt));
    game.camera.lookAt(this.target);
    game.camera.fov = damp(game.camera.fov, pose.fov, options.worldAligned ? 5.2 : 9, frameDt);
    if (options.roll) game.camera.rotateZ(options.roll);
    if (!worldAligned) {
      game.impact?.applyToCamera?.(game.camera);
      game.impact?.applyOrientation?.(game.camera);
    }
    game.camera.updateProjectionMatrix();

    // Les tests et l'ancien code du menu lisent ces scratchs : les publier
    // maintient un seul contrat de cadrage, même si le directeur tient la pose.
    if (worldAligned) {
      game.menuCameraDesired = this.desired;
      game.menuCameraTarget = this.target;
    }
    game.sun?.position?.set?.(follow.x - 48, follow.y + 82, follow.z + 42);
    game.sun?.target?.position?.set?.(follow.x, 0, follow.z + 10);
    this.activeShot = pose.id;
    return true;
  }

  update(game, dt, follow) {
    const player = game.boats?.[0];
    if (!player || game.workshopActive) {
      this.reset(game);
      return false;
    }

    let cue = null;
    let track = null;
    let time = 0;
    let worldAligned = false;
    let orbit = 0;

    if (game.mode === "menu") {
      cue = "menu";
      track = CINEMATIC_TRACKS.menu;
      worldAligned = true;
    } else if (game.mode === "playing") {
      const countdown = Number(game.countdown) || 0;
      if (
        countdown > CINEMATIC_TIMING.go
        && Math.abs(Number(game.roundTime) || 0) < 1e-6
      ) {
        cue = "start";
        track = CINEMATIC_TRACKS.start;
        time = clamp(CINEMATIC_TIMING.countdown - countdown, 0, track.duration);
      } else if (game.tour && player.tourFinished) {
        const finishElapsed = Math.max(
          0,
          ((game.tick ?? 0) - (player.finishTick ?? 0)) * CONFIG.fixed
        );
        if (finishElapsed < CINEMATIC_TIMING.tourFinish) {
          cue = "tour-finish";
          track = CINEMATIC_TRACKS.tourFinish;
          time = finishElapsed;
        }
      } else if (!game.tour && !player.eliminated && game.roundEnding > 0) {
        const endingElapsed = CINEMATIC_TIMING.roundEnd - game.roundEnding;
        if (endingElapsed >= CINEMATIC_TIMING.victoryDelay) {
          cue = "victory";
          track = CINEMATIC_TRACKS.victory;
          time = endingElapsed - CINEMATIC_TIMING.victoryDelay;
          orbit = time * 0.52;
        }
      }
    }

    if (!cue || !track) {
      this.reset(game);
      return false;
    }
    if (cue !== this.activeCue) {
      this.activeCue = cue;
      this.elapsed = 0;
    } else {
      this.elapsed += clamp(Number.isFinite(dt) ? dt : 0, 0, 0.1);
    }
    if (cue === "menu") time = game.cameraReducedMotion ? 0 : this.elapsed;
    else this.elapsed = time;

    return this.apply(game, follow, track, time, dt, { worldAligned, orbit });
  }
}
