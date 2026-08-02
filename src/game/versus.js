// Duel local : deux pilotes humains partagent la même simulation fixe.
//
// Le second clavier ne touche jamais directement à la physique. Il remplit
// `input2`, lequel est quantifié puis consommé une seule fois dans fixedUpdate,
// exactement comme l'entrée du joueur 1. Les replays restent désactivés : leur
// schéma ne contient volontairement qu'un flux humain.

import { clamp } from "../core/math.js";
import { SPELL_VFX } from "../render/vfx.js";
import {
  ACTION_WAVE, ACTION_HARPOON, ACTION_MINE, ACTION_SHIFT,
  ACTION_BOOST_FORWARD, ACTION_BOOST_LATERAL, ACTION_RHUM,
  ACTION_BARIK, ACTION_CHADRON, ACTION_LANBI, ACTION_PWASON,
  WEAPONS, BALANCE
} from "./balance.js";

export const VERSUS_INPUT_PRECISION = 1000;

export function createVersusInput() {
  return {
    steer: 0,
    trim: 0.82,
    left: false,
    right: false,
    actions: 0,
    cycleQueued: 0
  };
}

export function quantizeVersusInput(input) {
  input.steer = Math.round(clamp(Number.isFinite(input.steer) ? input.steer : 0, -1, 1) * VERSUS_INPUT_PRECISION) / VERSUS_INPUT_PRECISION;
  input.trim = Math.round(clamp(Number.isFinite(input.trim) ? input.trim : 0.82, 0, 1) * VERSUS_INPUT_PRECISION) / VERSUS_INPUT_PRECISION;
  input.actions = input.actions >>> 0;
  input.cycleQueued = Math.max(0, Math.min(1, input.cycleQueued | 0));
  return input;
}

export function versusPilotLabel(boat) {
  if (boat?.id === 0) return "J1";
  if (boat?.id === 1) return "J2";
  return `IA · ${boat?.name ?? "RIVAL"}`;
}

export function versusCameraFrame(playerOne, playerTwo, out = {}) {
  const oneActive = Boolean(playerOne && !playerOne.eliminated);
  const twoActive = Boolean(playerTwo && !playerTwo.eliminated);
  if (oneActive !== twoActive) {
    const survivor = oneActive ? playerOne : playerTwo;
    out.x = survivor.x ?? 0;
    out.y = survivor.y ?? 0;
    out.z = survivor.z ?? 0;
    out.separation = 0;
    out.heading = survivor.dynamics?.heading ?? 0;
    return out;
  }
  const dx = (playerTwo?.x ?? 0) - (playerOne?.x ?? 0);
  const dz = (playerTwo?.z ?? 0) - (playerOne?.z ?? 0);
  const separation = Math.hypot(dx, dz);
  const headingOne = playerOne?.dynamics?.heading ?? 0;
  const headingTwo = playerTwo?.dynamics?.heading ?? headingOne;
  const sin = Math.sin(headingOne) + Math.sin(headingTwo);
  const cos = Math.cos(headingOne) + Math.cos(headingTwo);
  out.x = ((playerOne?.x ?? 0) + (playerTwo?.x ?? 0)) * 0.5;
  out.y = ((playerOne?.y ?? 0) + (playerTwo?.y ?? 0)) * 0.5;
  out.z = ((playerOne?.z ?? 0) + (playerTwo?.z ?? 0)) * 0.5;
  out.separation = separation;
  out.heading = Math.abs(sin) + Math.abs(cos) > 1e-6 ? Math.atan2(sin, cos) : headingOne;
  return out;
}

export const VersusSystems = {
  setVersusMode(enabled) {
    this.versusLocal = Boolean(enabled);
    if (!this.input2) this.input2 = createVersusInput();
    if (this.boats?.[1]) this.boats[1].localControlled = this.versusLocal;
    if (!this.versusLocal) this.clearVersusInput();
    this.ui?.versusHud?.classList?.toggle("hidden", !this.versusLocal || this.mode !== "playing");
    return this.versusLocal;
  },

  clearVersusInput() {
    if (!this.input2) this.input2 = createVersusInput();
    this.input2.steer = 0;
    this.input2.trim = 0.82;
    this.input2.left = false;
    this.input2.right = false;
    this.input2.actions = 0;
    this.input2.cycleQueued = 0;
  },

  openVersusLobby() {
    if (this.mode !== "menu") return false;
    this.ui?.customScreen?.classList?.add("hidden");
    this.ui?.versusScreen?.classList?.remove("hidden");
    return true;
  },

  closeVersusLobby() {
    this.ui?.versusScreen?.classList?.add("hidden");
    this.ui?.menu?.classList?.remove("hidden");
    return true;
  },

  startVersusMatch() {
    this.ui?.versusScreen?.classList?.add("hidden");
    this.startMatch({ versus: true });
    return true;
  },

  requestVersusAction(bit) {
    if (!this.versusLocal || this.playerInputLocked()) return false;
    const playerTwo = this.boats?.[1];
    if (!playerTwo || playerTwo.eliminated) return false;
    this.input2.actions = (this.input2.actions | bit) >>> 0;
    return true;
  },

  requestVersusCycle() {
    if (!this.versusLocal || this.playerInputLocked()) return false;
    this.input2.cycleQueued = 1;
    return true;
  },

  requestVersusWeapon() {
    if (!this.versusLocal || this.playerInputLocked()) return false;
    const playerTwo = this.boats?.[1];
    const weapon = this.activeWeapon(playerTwo);
    return weapon ? this.requestVersusAction(weapon.action) : false;
  },

  cycleVersusWeapon() {
    const boat = this.boats?.[1];
    if (!boat || boat.eliminated) return false;
    const held = WEAPONS.filter((weapon) => (boat.ammo?.[weapon.key] ?? 0) > 0);
    if (held.length < 2) return false;
    const current = held.findIndex((weapon) => weapon.key === boat.activeWeapon);
    boat.activeWeapon = held[(current + 1 + held.length) % held.length].key;
    return true;
  },

  applyVersusActionMask(actions) {
    if (!this.versusLocal || !actions) return;
    const playerTwo = this.boats?.[1];
    if (!playerTwo || playerTwo.eliminated) return;
    if (actions & ACTION_WAVE) this.fireWave(playerTwo);
    if (actions & ACTION_HARPOON) this.fireHarpoon(playerTwo);
    if (actions & ACTION_MINE) this.dropMine(playerTwo);
    if (actions & ACTION_SHIFT) {
      const result = playerTwo.triggerShift();
      const water = this.waveField.sample(playerTwo.x, playerTwo.z, this.time, this.waterScratch);
      this.spellVfx?.spawn(
        playerTwo.x,
        water.height + 1.15,
        playerTwo.z,
        SPELL_VFX.BWA_SHIFT,
        result.critical ? 2.8 : 2.2,
        result.critical ? 0.25 : 0.21,
        { flipX: playerTwo.dynamics.crewTarget < 0 }
      );
      this.telemetry.track("bwa_shift", {
        boat: playerTwo.id,
        critical: result.critical,
        precision: result.precision,
        cut: result.cut
      }, this.time);
    }
    if (actions & ACTION_BOOST_FORWARD) this.triggerForwardBoost(playerTwo);
    if (actions & ACTION_BOOST_LATERAL) this.triggerLateralBoost(playerTwo, this.input2.steer || -playerTwo.roll || 1);
    if (actions & ACTION_RHUM) this.drinkRhum(playerTwo);
    if (actions & ACTION_BARIK) this.dropBarik(playerTwo);
    if (actions & ACTION_CHADRON) this.sowChadron(playerTwo);
    if (actions & ACTION_LANBI) this.blowLanbi(playerTwo);
    if (actions & ACTION_PWASON) this.firePwason(playerTwo);
  },

  updateVersusHud() {
    if (!this.ui?.versusHud) return;
    const active = this.versusLocal && this.mode === "playing";
    this.ui.versusHud.classList.toggle("hidden", !active);
    if (!active) return;
    const status = (boat) => {
      if (!boat) return "ABSENT";
      if (boat.eliminated) return "ÉLIMINÉ · SPECTATEUR";
      const hull = Math.round(clamp(boat.dynamics?.structure?.hull ?? 0, 0, 1) * 100);
      const weapon = this.activeWeapon(boat);
      const ammo = weapon ? boat.ammo[weapon.key] : 0;
      return `${boat.score} PT · ${hull}% · ${weapon ? `${weapon.label} ×${ammo}` : "SOUTE VIDE"}`;
    };
    if (this.ui.versusP1Status) this.ui.versusP1Status.textContent = status(this.boats[0]);
    if (this.ui.versusP2Status) this.ui.versusP2Status.textContent = status(this.boats[1]);
  }
};
