// Fantôme : courir contre sa propre trace — ou celle d'un ami importée dans la
// replayothèque — sur la même graine, sans serveur.
//
// La course se rejoue à l'identique quand la graine est la même : mer, vent,
// caisses et rivaux au coup d'envoi. Le fantôme est donc une comparaison
// honnête tant que les trajectoires n'ont pas divergé, et un simple repère
// ensuite. Il se contente de LIRE la trace embarquée dans le replay
// (`replay.ghost`, voir sim/replay.js) : aucune seconde simulation, aucun tirage
// aléatoire, aucune écriture dans l'état de jeu. Il n'existe pas en relecture
// (il recouvrirait la yole rejouée) ni en Mêlée locale (deux flux humains, un
// seul fantôme n'aurait pas de sens).

import { GhostTrack, isReplayCompatible, normalizeGhostTrace } from "../sim/replay.js";
import { GhostVisual, GHOST_DEFAULT_COLOR } from "../render/ghost-visual.js";

// Après le GO, on laisse le premier message de manche vivre : l'annonce du
// fantôme attend une demi-seconde de course.
const GHOST_ANNOUNCE_TICK = 30;
const GHOST_GAP_EVEN_METERS = 2.5;

function ghostStageOf(replay) {
  const stage = replay?.metadata?.tourStage;
  return Number.isInteger(stage) && stage >= 0 ? stage : null;
}

/**
 * Choisit, parmi les entrées du coffre (les plus récentes d'abord), la trace à
 * courir : même graine, même étape du Tour (ou aucune), replay compatible et
 * trace valide. La plus récente gagne — c'est « ta dernière course ici ».
 */
export function selectGhostReplay(entries, { seed, tourStage = null } = {}) {
  const wantedSeed = seed >>> 0;
  const wantedStage = Number.isInteger(tourStage) && tourStage >= 0 ? tourStage : null;
  for (const item of Array.isArray(entries) ? entries : []) {
    const replay = item && typeof item === "object" && "replay" in item ? item.replay : item;
    if (!replay || typeof replay !== "object") continue;
    let compatible = false;
    try { compatible = isReplayCompatible(replay); } catch { compatible = false; }
    if (!compatible) continue;
    if ((replay.seed >>> 0) !== wantedSeed) continue;
    if (ghostStageOf(replay) !== wantedStage) continue;
    if (!normalizeGhostTrace(replay.ghost)) continue;
    return replay;
  }
  return null;
}

/** Libellé de l'écart, du point de vue du joueur. */
export function ghostGapLabel(gapMeters) {
  const gap = Number.isFinite(gapMeters) ? gapMeters : 0;
  if (Math.abs(gap) <= GHOST_GAP_EVEN_METERS) return "À TA HAUTEUR";
  const meters = Math.round(Math.abs(gap));
  return gap > 0 ? `${meters} M DEVANT` : `${meters} M DERRIÈRE`;
}

export const GhostSystems = {
  initGhost() {
    this.ghost = {
      track: null,
      replay: null,
      visual: null,
      visible: false,
      announced: false,
      gap: 0,
      status: "off",
      pose: { x: 0, y: 0, z: 0, heading: 0, roll: 0, pitch: 0 }
    };
    return this.ghost;
  },

  ghostEnabled() {
    return this.settings?.get?.("ghost") !== false;
  },

  /**
   * Arme le fantôme pour la partie qui démarre. À appeler quand graine, mode et
   * étape sont connus, avant la première manche.
   */
  armGhost({ tourStage = null } = {}) {
    if (!this.ghost) this.initGhost();
    this.disarmGhost();
    if (this.playback || this.versusLocal || !this.ghostEnabled()) return false;
    let entries = [];
    try { entries = this.replayVault?.list?.() ?? []; } catch { entries = []; }
    const replay = selectGhostReplay(entries, { seed: this.seed, tourStage });
    if (!replay) return false;
    try {
      this.ghost.track = new GhostTrack(replay.ghost);
    } catch {
      this.ghost.track = null;
      return false;
    }
    this.ghost.replay = replay;
    this.ghost.status = "armed";
    this.telemetry?.track?.("ghost_armed", {
      seed: this.seed >>> 0,
      tourStage: Number.isInteger(tourStage) ? tourStage : -1
    }, 0);
    return true;
  },

  disarmGhost() {
    const ghost = this.ghost;
    if (!ghost) return false;
    ghost.track = null;
    ghost.replay = null;
    ghost.visible = false;
    ghost.announced = false;
    ghost.gap = 0;
    ghost.status = "off";
    ghost.visual?.setVisible?.(false);
    return true;
  },

  ghostVisual() {
    if (!this.ghost.visual) {
      this.ghost.visual = new GhostVisual(this.THREE, this.assets ?? null, GHOST_DEFAULT_COLOR);
      this.scene?.add?.(this.ghost.visual.root);
    }
    return this.ghost.visual;
  },

  /**
   * Côté rendu, à chaque image : lit la pose au tick courant de la manche en
   * cours. Ne touche ni la simulation ni le replay.
   */
  updateGhostRender() {
    const ghost = this.ghost;
    if (!ghost?.track) return false;
    const live = this.mode === "playing" && (this.countdown ?? 0) <= 0;
    const sinceRoundStart = this.tick - (this.roundStartTick ?? 0);
    const pose = live ? ghost.track.poseAt(this.round, sinceRoundStart, ghost.pose) : null;
    if (!pose) {
      if (ghost.visible) {
        ghost.visible = false;
        ghost.visual?.setVisible?.(false);
      }
      ghost.status = live && sinceRoundStart > 0 ? "gone" : "waiting";
      return false;
    }
    const visual = this.ghostVisual();
    visual.setPose(pose, this.time);
    if (!ghost.visible) {
      visual.setVisible(true);
      ghost.visible = true;
    }
    if (!ghost.announced && sinceRoundStart >= GHOST_ANNOUNCE_TICK) {
      ghost.announced = true;
      this.showMessage?.("👻 TON FANTÔME EST SUR L'EAU", 1.3);
    }
    const player = this.boats?.[0];
    ghost.gap = player ? pose.z - player.z : 0;
    ghost.status = "racing";
    return true;
  },

  /** Pastille HUD : présente dès qu'une trace est armée, muette sinon. */
  updateGhostChip() {
    const chip = this.ui?.ghostChip;
    if (!chip) return false;
    const ghost = this.ghost;
    const show = Boolean(ghost?.track) && this.mode === "playing";
    chip.classList?.toggle?.("hidden", !show);
    if (!show) return false;
    const value = this.ui.ghostGap;
    if (value) {
      value.textContent = ghost.status === "racing"
        ? ghostGapLabel(ghost.gap)
        : ghost.status === "gone" ? "HORS COURSE" : "AU DÉPART";
    }
    chip.classList?.toggle?.("ghost-ahead", ghost.status === "racing" && ghost.gap > GHOST_GAP_EVEN_METERS);
    chip.classList?.toggle?.("ghost-behind", ghost.status === "racing" && ghost.gap < -GHOST_GAP_EVEN_METERS);
    return true;
  }
};
