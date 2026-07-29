// Entrées : manette, actions du joueur, zoom, liaison des contrôles de l'UI.
//
// Les actions passent par le même masque de bits que les replays, afin qu'une
// relecture rejoue exactement ce que le joueur a déclenché.

import { clamp } from "../core/math.js";
import { downloadReplay } from "../sim/replay.js";
import { SPELL_VFX } from "../render/vfx.js";
import { ACTION_BOOST_FORWARD, ACTION_BOOST_LATERAL, ACTION_RHUM, ACTION_HARPOON, ACTION_MINE, ACTION_REVENGE, ACTION_SHIFT, ACTION_WAVE, ACTION_BARIK, ACTION_CHADRON, ACTION_LANBI, ACTION_PWASON, AI_LEVELS, WEAPONS, RIGS, SAIL_LIVERIES, TOUR_STAGES, ZOOM_MAX, ZOOM_MIN, CRATE_WEAPONS } from "./balance.js";

// Écoute de voile au clavier.
//
// `min` est calé sur `YOLE_HANDLING.trimFeathered` (0,58) : c'est là que la
// poussée tombe à 24 % et que le frein de choque est plein. `max` à 1,0 est le
// plein bord. `cruise` (0,82) est la valeur que le clavier imposait AVANT, en
// dur : la yole y démarre donc exactement comme avant, et rien n'est perdu pour
// qui ne touche jamais aux flèches.
//
// La rampe est en unités PAR TICK FIXE, pas par image : l'accélérateur doit
// donner le même résultat à 30, 60 et 144 Hz, et surtout être rejouable.
export const KEYBOARD_TRIM = Object.freeze({
  min: 0.58,
  max: 1.0,
  cruise: 0.82,
  borderRate: 0.85,
  easeRate: 1.30,
  returnRate: 0.42
});

// Fenêtre du double-tap de barre qui déclenche le Bwa Dash, en millisecondes.
// 260 ms : au-delà, deux corrections de cap successives seraient prises pour un
// dash ; en deçà, il faut taper trop vite pour que ce soit jouable au clavier.
export const DASH_DOUBLE_TAP_MS = 260;
// Équivalent TACTILE du double-tap A/D, sur le joystick.
//
// ⚠️ Fenêtre plus large que celle du clavier (260 ms) : pousser deux fois un
// joystick au pouce est plus lent que taper deux fois une touche. À 260 ms le
// geste échouait presque toujours.
export const JOY_DASH_DOUBLE_TAP_MS = 340;
// Fraction de la course du joystick au-delà de laquelle on compte une poussée.
// Sous ce seuil, on barre ; au-dessus, on peut armer un dash.
export const JOY_DASH_THRESHOLD = 0.55;

export const AIM_MAX_RADIANS = Math.PI * 22 / 180;

// Débattement VERTICAL de la visée, en multiplicateur de vitesse ascensionnelle.
// À ±0,80 le coco part entre 20 % et 180 % de sa hausse nominale : tir tendu
// rasant vers le bas, cloche haute vers le haut.
//
// ⚠️ Les angles extrêmes sont ASSUMÉS, y compris ceux qu'aucun lanceur réel ne
// produirait — c'est un choix de jeu explicite. Le tir doit rester expressif,
// pas plausible.
export const AIM_PITCH_RANGE = 0.80;
const AIM_DRAG_VIEWPORT_RATIO = 0.28;
const AIM_DRAG_MIN_PX = 100;
const AIM_DRAG_MAX_PX = 240;

const isInteractiveKeyTarget = (target) => Boolean(target?.closest?.(
  "button,input,select,textarea,a[href],[contenteditable='true']"
));

export const InputSystems = {
  // Pendant une relecture, seul le replay a le droit de piloter. Les handlers de
  // l'UI, le clavier et la manette restaient actifs et mutaient directement les
  // dynamics : la relecture divergeait de l'enregistrement dès qu'on touchait un
  // bouton. Le garde `isApplyingReplay` ne protégeait que l'ENREGISTREMENT du
  // bit, pas la mutation physique.
  playerInputLocked() {
    // ⚠️ Le rebours verrouille AUSSI. Sans ça on pourrait tirer et border
    // pendant le 3-2-1 : les entrées seraient acceptées alors que la
    // simulation est gelée, et elles partiraient toutes d'un coup sur le GO.
    return Boolean(this.paused)
      || this.countdown > 0
      || (Boolean(this.playback) && !this.isApplyingReplay);
  },

  restartInputCue(element, className = "input-confirmed") {
    if (!element?.classList) return;
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
  },

  flashActionControl(bit) {
    let control = null;
    if (bit === ACTION_SHIFT) control = this.ui?.bwa;
    else if (bit === ACTION_BOOST_FORWARD) control = this.ui?.boostForward;
    else if (bit === ACTION_BOOST_LATERAL) control = this.ui?.boostLateral;
    else if (bit === ACTION_REVENGE) control = this.ui?.revenge;
    else if (WEAPONS.some((weapon) => weapon.action === bit)) control = this.ui?.weaponSlot;
    this.restartInputCue(control);
  },

  trapDialogFocus(event) {
    if (event.code !== "Tab") return false;
    const dialog = [
      this.ui?.versusScreen,
      this.ui?.customScreen,
      this.ui?.pause,
      this.ui?.end,
      this.ui?.fatal
    ].find((element) => element && !element.classList?.contains?.("hidden"));
    if (!dialog?.querySelectorAll) return false;
    // ⚠️ `summary` AJOUTE. Le panneau de raccourcis de l'écran de pause est un
    // <details>/<summary> : le navigateur le rend focusable nativement, mais ce
    // sélecteur ne le connaissait pas. La tabulation l'aurait donc sauté dans le
    // calcul d'enroulement, et le focus serait sorti du dialogue.
    const focusable = [...dialog.querySelectorAll(
      "button:not([disabled]),a[href],summary,input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])"
    )].filter((element) => !element.hidden && element.getAttribute?.("aria-hidden") !== "true");
    if (!focusable.length) return false;
    const active = globalThis.document?.activeElement;
    const index = focusable.indexOf(active);
    const target = event.shiftKey
      ? index <= 0 ? focusable.at(-1) : null
      : index < 0 || index === focusable.length - 1 ? focusable[0] : null;
    if (!target) return false;
    event.preventDefault?.();
    target.focus?.();
    return true;
  },

  focusWhenDialogOpens(screen, target) {
    const Observer = globalThis.MutationObserver;
    if (!Observer || !screen?.classList || !target) return null;
    let hidden = screen.classList.contains("hidden");
    const observer = new Observer(() => {
      const nextHidden = screen.classList.contains("hidden");
      if (hidden && !nextHidden) target.focus?.();
      hidden = nextHidden;
    });
    observer.observe(screen, { attributes: true, attributeFilter: ["class"] });
    (this.dialogFocusObservers ??= []).push(observer);
    return observer;
  },

  clearLiveInput() {
    if (!this.input) return;
    this.input.left = false;
    this.input.right = false;
    this.input.actions = 0;
    this.input.steer = 0;
    this.input.trim = KEYBOARD_TRIM.cruise;
    this.input.trimUp = false;
    this.input.trimDown = false;
    this.input.lookBack = false;
    this.input.joy = false;
    this.input.joyId = null;
    this.input.aim = 0;
    this.input.aimPitch = 0;
    this.input.aimActive = false;
    this.input.aimPointerId = null;
    this.aimOriginX = 0;
    this.aimOriginY = 0;
    this.aimDragSpan = AIM_DRAG_MIN_PX;
    this.gamepadSteer = null;
    this.gamepadTrim = null;
    this.hadLocalSteer = false;
    this.hadGamepadTrim = false;
    this.clearVersusInput?.();
    if (this.ui?.joyKnob?.style) this.ui.joyKnob.style.transform = "";
  },

  beginAimPointer(event, steeringActive = false, viewportWidth = 0) {
    if (this.mode !== "playing" || this.playerInputLocked() || this.input.aimActive) return false;
    const mouseAim = event.pointerType === "mouse" && event.button === 2;
    const touchAim = event.pointerType === "touch" && steeringActive;
    if (!mouseAim && !touchAim) return false;
    const width = viewportWidth || event.currentTarget?.clientWidth || this.ui?.viewport?.clientWidth || 640;
    this.aimOriginX = Number.isFinite(event.clientX) ? event.clientX : 0;
    this.aimDragSpan = clamp(width * AIM_DRAG_VIEWPORT_RATIO, AIM_DRAG_MIN_PX, AIM_DRAG_MAX_PX);
    this.input.aim = 0;
    this.input.aimPitch = 0;
    this.aimOriginY = Number.isFinite(event.clientY) ? event.clientY : 0;
    this.input.aimActive = true;
    this.input.aimPointerId = event.pointerId;
    this.restartInputCue(this.ui?.aimHelp);
    event.preventDefault?.();
    return true;
  },

  updateAimPointer(event) {
    if (
      this.paused
      || !this.input.aimActive
      || event.pointerId !== this.input.aimPointerId
    ) return false;
    const dx = (Number.isFinite(event.clientX) ? event.clientX : this.aimOriginX) - this.aimOriginX;
    this.input.aim = clamp(dx / Math.max(1, this.aimDragSpan), -1, 1);
    // Axe VERTICAL. L'écran a son y vers le bas : glisser vers le HAUT doit
    // lever le tir, d'où le signe. Sans cet axe, la balistique n'était réglable
    // qu'en gauche/droite et la cloche du coco était figée.
    const dy = (Number.isFinite(event.clientY) ? event.clientY : this.aimOriginY) - this.aimOriginY;
    this.input.aimPitch = clamp(-dy / Math.max(1, this.aimDragSpan), -1, 1);
    event.preventDefault?.();
    return true;
  },

  endAimPointer(event, fire = true) {
    if (event.pointerId !== this.input.aimPointerId) return false;
    this.updateAimPointer(event);
    this.input.aimActive = false;
    this.input.aimPointerId = null;
    event.preventDefault?.();
    if (fire && !this.playerInputLocked()) this.useActiveWeapon();
    return true;
  },

  withPlayerAim(player, callback) {
    const dynamics = player?.dynamics;
    if (!dynamics || player !== this.boats?.[0]) return callback();
    const originalHeading = dynamics.heading;
    // ⚠️ SIGNE NÉGATIF, et il n'est pas décoratif : la visée était INVERSÉE.
    //
    // La caméra regarde le long de +Z avec Y vers le haut, donc la droite de
    // l'écran est −X. Or `heading + aim` fait tourner l'avant de +Z vers +X,
    // c'est-à-dire vers la GAUCHE de l'écran, pendant que le viseur, lui, part
    // à droite (`left: 50 + aim * 24 %`). Glisser à droite tirait à gauche.
    //
    // Mesuré par projection écran, sans hypothèse sur la base de la caméra :
    // à `aim = +1`, viseur à 74 % de largeur et tir à −0,187 en NDC. Les deux
    // étaient opposés dans les deux sens.
    dynamics.heading = originalHeading - clamp(this.input.aim ?? 0, -1, 1) * AIM_MAX_RADIANS;
    try {
      return callback();
    } finally {
      dynamics.heading = originalHeading;
    }
  },

  findAimedTarget(owner, range, cone) {
    return this.withPlayerAim(owner, () => this.findTarget(owner, range, cone));
  },
  pollGamepad() {
    const pads = typeof navigator !== "undefined" ? navigator.getGamepads?.() : null;
    let pad = null;
    if (pads) {
      for (const candidate of pads) {
        if (candidate?.connected) { pad = candidate; break; }
      }
    }
    if (!pad) {
      this.gamepadPrev.length = 0;
      this.gamepadSteer = null;
      this.gamepadTrim = null;
      return;
    }
    const prev = this.gamepadPrev;
    const pressed = (index) => {
      const now = Boolean(pad.buttons[index]?.pressed);
      const was = prev[index] || false;
      prev[index] = now;
      return now && !was;
    };
    const startPressed = pressed(9);
    // Menus et écran de fin : Start démarre une manche comme le bouton Jouer.
    if (this.mode !== "playing") {
      for (let index = 0; index < pad.buttons.length; index++) {
        if (index !== 9) prev[index] = Boolean(pad.buttons[index]?.pressed);
      }
      if (startPressed) {
        if (this.versusLocal) this.startVersusMatch();
        else this.startMatch();
      }
      return;
    }
    // Start est traité AVANT toute action de bateau. Entrer en pause ou en
    // sortir consomme les autres fronts de boutons et efface l'état tenu : une
    // combinaison Start+A ne peut donc ni tirer sous le modal, ni tirer au
    // premier tick repris.
    if (this.paused || startPressed) {
      for (let index = 0; index < pad.buttons.length; index++) {
        if (index !== 9) prev[index] = Boolean(pad.buttons[index]?.pressed);
      }
      this.clearLiveInput();
      if (startPressed) this.togglePause();
      return;
    }
    // Le stick est lu ici mais appliqué dans la boucle fixe (cf. fixedUpdate),
    // pour rester déterministe et enregistrable dans les replays.
    const axisX = pad.axes[0] ?? 0;
    const axisY = pad.axes[1] ?? 0;
    const dpadX = (pad.buttons[15]?.pressed ? 1 : 0) - (pad.buttons[14]?.pressed ? 1 : 0);
    if (Math.abs(axisX) > 0.18) this.gamepadSteer = clamp(axisX, -1, 1);
    else if (dpadX) this.gamepadSteer = dpadX;
    else this.gamepadSteer = null;
    this.gamepadTrim = Math.abs(axisY) > 0.22
      ? clamp(KEYBOARD_TRIM.cruise - axisY * 0.22, KEYBOARD_TRIM.min, KEYBOARD_TRIM.max)
      : null;
    // Mapping standard : 0=A/✕ 1=B/○ 2=X/□ 3=Y/△ 4=LB 5=RB 8=Back 9=Start 12/13=croix haut/bas.
    if (pressed(0)) this.fireWave(this.boats[0]);
    if (pressed(2)) this.fireHarpoon(this.boats[0]);
    if (pressed(3)) this.dropMine(this.boats[0]);
    if (pressed(1)) this.triggerPlayerShift();
    if (pressed(5)) this.triggerForwardBoost(this.boats[0]);
    if (pressed(4)) this.triggerLateralBoost(this.boats[0], this.input.steer || -this.boats[0].roll || 1);
    if (pressed(8)) this.useRevenge();
    if (pressed(12)) this.adjustCameraZoom(-0.14);
    if (pressed(13)) this.adjustCameraZoom(0.14);
  },

  handleKeyboardInput(down, event) {
    const code = event.code;
    if (down && code === "Tab" && this.trapDialogFocus(event)) return;
    if (down && code === "Escape" && this.mode !== "playing") {
      let returnTarget = this.dialogReturnFocus;
      let closed = false;
      if (this.ui?.versusScreen && !this.ui.versusScreen.classList?.contains?.("hidden")) {
        this.closeVersusLobby?.();
        this.ui.versusBtn?.setAttribute?.("aria-expanded", "false");
        returnTarget ??= this.ui.versusBtn;
        closed = true;
      } else if (this.ui?.customScreen && !this.ui.customScreen.classList?.contains?.("hidden")) {
        this.ui.customScreen.classList.add("hidden");
        this.ui.customBtn?.setAttribute?.("aria-expanded", "false");
        returnTarget ??= this.ui.customBtn;
        closed = true;
      }
      if (closed) {
        event.preventDefault?.();
        returnTarget?.focus?.();
        this.dialogReturnFocus = null;
        return;
      }
    }
    const pauseKey = code === "Escape" || code === "KeyP";
    if (down && pauseKey && this.mode === "playing") {
      event.preventDefault?.();
      this.togglePause();
      return;
    }

    // Une touche qui active un bouton du modal appartient au DOM, pas à la
    // yole. En pause, aucune touche de gameplay ne peut non plus mettre un bit
    // en attente pour la reprise.
    if (this.mode !== "playing" || this.paused || isInteractiveKeyTarget(event.target)) {
      if (!down) {
        if (code === "ArrowLeft" || code === "KeyA") this.input.left = false;
        if (code === "ArrowRight" || code === "KeyD") this.input.right = false;
        if (code === "KeyC") this.input.lookBack = false;
        if (code === "ArrowUp") this.input.trimUp = false;
        if (code === "ArrowDown") this.input.trimDown = false;
        if (code === "KeyJ" && this.input2) this.input2.left = false;
        if (code === "KeyL" && this.input2) this.input2.right = false;
      }
      return;
    }

    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space", "KeyC"].includes(code)) event.preventDefault?.();
    // ÉCOUTE / BORDER : l'accélérateur du clavier.
    //
    // Le clavier figeait `trim` à 0,82, au-dessus du seuil `trimPowered` (0,70) :
    // `trimDrive` valait donc 1 en permanence et la yole était à plein gaz du
    // départ à l'arrivée. Toute la mécanique de voile existait déjà côté physique
    // — 24 % à 100 % de poussée, plus un frein de choque — mais aucune touche ne
    // l'atteignait. Il ne manquait que ça.
    // Maintenir C (ou la touche de vue) retourne la caméra vers la poupe.
    if (code === "KeyC") this.input.lookBack = down;
    if (code === "ArrowUp") this.input.trimUp = down;
    if (code === "ArrowDown") this.input.trimDown = down;
    if (this.versusLocal && ["KeyJ", "KeyL", "KeyI", "KeyO", "KeyU", "KeyM", "KeyK"].includes(code)) {
      event.preventDefault?.();
      if (code === "KeyJ") this.input2.left = down;
      if (code === "KeyL") this.input2.right = down;
      if (!down || event.repeat) return;
      let accepted = false;
      if (code === "KeyI") accepted = this.requestVersusWeapon();
      if (code === "KeyO") accepted = this.requestVersusCycle();
      if (code === "KeyU") accepted = this.requestVersusAction(ACTION_BOOST_FORWARD);
      if (code === "KeyM") accepted = this.requestVersusAction(ACTION_BOOST_LATERAL);
      if (code === "KeyK") accepted = this.requestVersusAction(ACTION_SHIFT);
      if (accepted) this.restartInputCue(this.ui?.versusHud?.querySelector?.(".p2"));
      return;
    }
    const gauche = code === "ArrowLeft" || code === "KeyA";
    const droite = code === "ArrowRight" || code === "KeyD";
    if (gauche) this.input.left = down;
    if (droite) this.input.right = down;
    // BWA DASH AU DOUBLE-TAP. Deux appuis du même côté dans la fenêtre lancent
    // le dash de ce côté-là — c'est le geste des jeux de combat, et il évite
    // d'avoir à lâcher la barre pour atteindre une touche dédiée. `X` et `Ctrl`
    // restent branchés pour qui préfère.
    if (down && !event.repeat && (gauche || droite)) {
      const cote = droite ? 1 : -1;
      // ⚠️ Horloge MURALE, pas l'horloge de simulation : ce handler tourne dans
      // le DOM, hors du tick fixe. C'est sans risque pour le replay, qui
      // n'enregistre que le BIT d'action produit, jamais le timing du tap.
      const maintenant = (globalThis.performance?.now?.() ?? 0);
      if (this.dashTapSide === cote && maintenant - (this.dashTapAt ?? -1e9) <= DASH_DOUBLE_TAP_MS) {
        this.dashTapSide = 0;
        this.dashTapAt = -1e9;
        this.dashDoubleTapSide = cote;
        this.requestAction(ACTION_BOOST_LATERAL);
      } else {
        this.dashTapSide = cote;
        this.dashTapAt = maintenant;
      }
    }
    if (!down) return;
    // ⚠️ HUIT SLOTS, ET ILS TIRENT.
    //
    // Avant : quatre touches qui ne faisaient que SÉLECTIONNER, puis il fallait
    // Espace pour tirer. Deux gestes pour une action, alors que le geste évident
    // — « j'appuie sur & pour envoyer un coco » — ne marchait pas. Et les quatre
    // armes de CAISSE n'avaient aucune touche : il fallait cycler avec E.
    const weaponDigit = /^Digit([1-8])$/.exec(code);
    if (weaponDigit) {
      event.preventDefault?.();
      if (!event.repeat) this.fireWeaponShortcut(Number(weaponDigit[1]) - 1);
      return;
    }
    if (code === "Space") this.useActiveWeapon();
    if (code === "KeyE") this.cycleWeapon();
    if (code === "ShiftLeft" || code === "ShiftRight") this.requestAction(ACTION_SHIFT);
    if (code === "KeyW" || code === "KeyF") this.requestAction(ACTION_BOOST_FORWARD);
    if (code === "KeyX" || code === "ControlLeft" || code === "ControlRight") this.requestAction(ACTION_BOOST_LATERAL);
    if (code === "Equal" || code === "NumpadAdd") this.adjustCameraZoom(-0.12);
    if (code === "Minus" || code === "NumpadSubtract") this.adjustCameraZoom(0.12);
    if (code === "KeyR") this.requestAction(ACTION_REVENGE);
    if (code === "F3") this.toggleSetting("showPerf");
  },

  adjustCameraZoom(delta) {
    this.cameraZoom = clamp(this.cameraZoom + delta, ZOOM_MIN, ZOOM_MAX);
    this.settings.set("cameraZoom", Math.round(this.cameraZoom * 100) / 100);
    if (this.ui.zoomValue) this.ui.zoomValue.textContent = `${Math.round(this.cameraZoom * 100)}%`;
    return this.cameraZoom;
  },

  useRevenge() {
    if (this.playerInputLocked()) return;
    if (this.tour) return;
    const player = this.boats[0];
    if (!player.eliminated || this.spiritUsed || this.revengePending) return;
    const target = this.boats.filter((boat) => !boat.eliminated).sort((a, b) => b.z - a.z)[0];
    if (!target) return;
    this.spiritUsed = true;
    this.ui.revenge.classList.add("hidden");
    this.revengePending = { target, delay: 0.72 };
    this.showMessage("🌪 FRAPPE DE SABLE", 0.9);
    if (!this.isApplyingReplay) this.input.actions |= ACTION_REVENGE;
  },

  triggerPlayerShift() {
    if (this.playerInputLocked()) return;
    const player = this.boats[0];
    if (!player || player.eliminated) return;
    const result = player.triggerShift();
    const water = this.waveField.sample(player.x, player.z, this.time, this.waterScratch);
    this.spellVfx?.spawn(player.x, water.height + 1.15, player.z, SPELL_VFX.BWA_SHIFT, result.critical ? 5.2 : 4.1, 0.52, {
      flipX: player.dynamics.crewTarget < 0
    });
    this.telemetry.track("bwa_shift", { critical: result.critical, precision: result.precision, cut: result.cut }, this.time);
    if (!this.isApplyingReplay) this.input.actions |= ACTION_SHIFT;
  },

  triggerForwardBoost(boat = this.boats[0]) {
    if (boat === this.boats[0] && this.playerInputLocked()) return false;
    if (!boat || boat.eliminated || !boat.triggerForwardBoost()) return false;
    const forward = boat.forward(this.boostForwardScratch || (this.boostForwardScratch = { x: 0, z: 0 }));
    const tailX = boat.x - forward.x * 4.5;
    const tailZ = boat.z - forward.z * 4.5;
    const water = this.waveField.sample(tailX, tailZ, this.time, this.waterScratch);
    this.ocean.wake.trail(tailX, tailZ, boat.dynamics.heading, boat.speed + 12, 2.0);
    this.particles.emitBurst(this.visualRng, { x: tailX, y: water.height + 0.22, z: tailZ }, 0xffea79, Math.floor(18 * this.particleBudget), {
      speed: 2.8, upward: 1.25, lifeMin: 0.22, lifeMax: 0.55, sizeMax: 0.48, gravity: 4.2
    });
    this.rings.burst(tailX, water.height, tailZ, 0xffd451, 0.7, 0.42);
    this.audio.play("turbo", { gain: boat.isPlayer ? 0.42 : 0.16, rate: 0.98, pan: this.panFor(boat.x), gap: 0.05 });
    if (boat.isPlayer) {
      this.stats.boosts++;
      this.showMessage("🔥 TURBO LANMÈ !", 0.48);
      this.postFX.pulse(0.28);
      this.haptic?.("turbo");
      if (!this.isApplyingReplay) this.input.actions |= ACTION_BOOST_FORWARD;
    }
    this.telemetry.track("boost_forward", { boat: boat.id }, this.time);
    return true;
  },

  triggerLateralBoost(boat = this.boats[0], direction = null) {
    if (boat === this.boats[0] && this.playerInputLocked()) return false;
    if (!boat || boat.eliminated) return false;
    const side = Math.sign(direction ?? boat.steer ?? this.input.steer ?? -boat.roll ?? 1) || 1;
    if (!boat.triggerLateralBoost(side)) return false;
    const forward = boat.forward(this.boostSideForwardScratch || (this.boostSideForwardScratch = { x: 0, z: 0 }));
    const rightX = forward.z;
    const rightZ = -forward.x;
    const water = this.waveField.sample(boat.x, boat.z, this.time, this.waterScratch);
    this.ocean.wake.burst(boat.x - rightX * side * 1.8, boat.z - rightZ * side * 1.8, 3.6, 1.15);
    this.rings.burst(boat.x, water.height, boat.z, side > 0 ? 0xff4eb8 : 0x55f5ff, 0.82, 0.46);
    this.particles.emitBurst(this.visualRng, { x: boat.x - rightX * side * 1.2, y: water.height + 0.28, z: boat.z - rightZ * side * 1.2 }, side > 0 ? 0xff75d0 : 0x89ffff, Math.floor(24 * this.particleBudget), {
      speed: 2.5, upward: 1.7, lifeMin: 0.20, lifeMax: 0.52, sizeMax: 0.52, gravity: 5.1
    });
    // La traînée de dash n'existait pas : seul un anneau plat marquait le coup.
    this.sprays?.spawn(boat.x - rightX * side * 2.4, water.height + 0.8, boat.z - rightZ * side * 2.4, 3.1, 0.5);
    this.spellVfx?.spawn(boat.x - rightX * side * 1.4, water.height + 1.0, boat.z - rightZ * side * 1.4, SPELL_VFX.BWA_DASH, 4.4, 0.48, {
      rotation: this.vfxScreenRotation(rightX * side, rightZ * side, 0)
    });
    this.audio.play("dash", { gain: boat.isPlayer ? 0.40 : 0.15, rate: 1.06, pan: this.panFor(boat.x), gap: 0.04 });
    if (boat.isPlayer) {
      this.stats.boosts++;
      this.showMessage(side > 0 ? "💨 BWA DASH DROITE !" : "💨 BWA DASH GAUCHE !", 0.50);
      this.postFX.pulse(0.34);
      this.haptic?.("dash");
      if (!this.isApplyingReplay) this.input.actions |= ACTION_BOOST_LATERAL;
    }
    this.telemetry.track("boost_lateral", { boat: boat.id, side }, this.time);
    return true;
  },

  // Le joueur DEMANDE une action ; elle s'exécute au point unique de
  // fixedUpdate, jamais au moment de l'événement DOM. C'est ce qui garantit que
  // le direct et la relecture empruntent le même chemin au même instant du tick
  // — l'en-tête de ce fichier le promettait déjà, le code ne le tenait pas.
  // L'arme ACTIVE est celle que la derniere caisse a donnee. Si elle tombe a
  // zero, on retombe sur la premiere non vide du registre : le joueur n'a jamais
  // un emplacement mort alors qu'il lui reste des munitions.
  activeWeapon(boat) {
    const held = WEAPONS.filter((w) => (boat?.ammo?.[w.key] ?? 0) > 0);
    if (!held.length) return null;
    return held.find((w) => w.key === boat.activeWeapon) || held[0];
  },

  useActiveWeapon() {
    const weapon = this.activeWeapon(this.boats[0]);
    if (!weapon) return;
    this.requestAction(weapon.action);
  },

  // Clavier seulement : sur telephone la caisse suffit a choisir.
  cycleWeapon() {
    const boat = this.boats[0];
    const held = WEAPONS.filter((w) => (boat?.ammo?.[w.key] ?? 0) > 0);
    if (held.length < 2) return;
    const index = held.findIndex((w) => w.key === boat.activeWeapon);
    boat.activeWeapon = held[(index + 1 + held.length) % held.length].key;
    this.restartInputCue(this.ui?.weaponSlot);
  },

  /**
   * Une touche chiffre = SÉLECTIONNER PUIS TIRER.
   *
   * C'est le geste que le joueur attend : appuyer sur « & » envoie un coco, il
   * n'y a pas à confirmer avec Espace. La sélection reste faite au passage,
   * pour que l'emplacement affiché suive et qu'Espace continue de fonctionner.
   *
   * Si la soute est vide, `selectWeaponShortcut` refuse et rien n'est tiré.
   */
  /** L'arme de caisse actuellement portée, s'il y en a une. */
  crateWeapon(boat) {
    const porte = boat ?? this.boats[0];
    if (!porte) return null;
    // Un seul emplacement de caisse depuis la refonte : la première trouvée
    // avec de la munition EST la bonne.
    return WEAPONS.find((entry) => CRATE_WEAPONS.includes(entry.key)
      && Number.isFinite(porte.ammo?.[entry.key])
      && porte.ammo[entry.key] > 0) ?? null;
  },

  /**
   * Tire une arme DÉSIGNÉE, sans passer par la sélection.
   *
   * ⚠️ C'est le geste tactile qui manquait. `cycleWeapon` n'existe qu'au
   * clavier (touche E) : au doigt, on tirait ce que `activeWeapon` valait et on
   * ne pouvait JAMAIS sortir sa deuxième arme de soute. Une tuile désigne son
   * arme, l'appui la tire — pas de mode, pas de sélection à faire pendant qu'on
   * barre.
   *
   * On pose quand même `activeWeapon` au passage : la barre d'espace et le
   * réticule continuent de suivre ce qu'on vient d'utiliser.
   */
  fireWeaponKey(key) {
    if (!key) return false;
    const index = WEAPONS.findIndex((entry) => entry.key === key);
    if (index < 0) return false;
    return this.fireWeaponShortcut(index);
  },

  fireWeaponShortcut(slotIndex) {
    if (!this.selectWeaponShortcut(slotIndex)) return false;
    // ⚠️ `useActiveWeapon` ne RENVOIE rien : elle se contente d'empiler le bit
    // d'action, qui sera rejoué par `applyActionMask` dans le pas fixe. Faire
    // `return this.useActiveWeapon()` propageait donc `undefined` — le tir
    // partait mais l'appelant croyait qu'il avait échoué.
    this.useActiveWeapon();
    return true;
  },

  selectWeaponShortcut(slotIndex) {
    if (this.playerInputLocked()) return false;
    const player = this.boats[0];
    const weapon = WEAPONS[slotIndex];
    // Huit armes, huit emplacements : les quatre armes de caisse ont désormais
    // leur touche au lieu de n'être joignables qu'en cyclant avec E.
    if (!player || !weapon || slotIndex < 0 || slotIndex >= WEAPONS.length) return false;
    const ammo = player.ammo?.[weapon.key] ?? 0;
    const shortcut = this.ui?.weaponShortcuts?.querySelectorAll?.("[data-weapon]")?.[slotIndex];
    if (ammo <= 0) {
      this.restartInputCue(shortcut, "input-rejected");
      this.showMessage?.(`SOUTE ${slotIndex + 1} · VIDE`, 0.48);
      return false;
    }
    player.activeWeapon = weapon.key;
    this.restartInputCue(shortcut);
    this.restartInputCue(this.ui?.weaponSlot);
    this.showMessage?.(`${slotIndex + 1} · ${weapon.label}`, 0.5);
    this.telemetry?.track?.("weapon_select", { slot: slotIndex + 1, weapon: weapon.key }, this.time);
    return true;
  },

  // Atelier. Deux axes seulement : le gréement, qui change la course, et la
  // livrée, qui ne change QUE l'allure. Trois autres axes avaient été conçus et
  // mesurés sous le seuil de perception — de la décoration payée au prix d'un
  // champ de checksum.
  buildCustomScreen() {
    const remplir = (hote, entrees, actuel, choisir) => {
      if (!hote) return;
      hote.textContent = "";
      entrees.forEach((entree, index) => {
        const bouton = document.createElement("button");
        bouton.type = "button";
        bouton.textContent = entree.label ?? entree;
        const active = index === actuel;
        bouton.classList.toggle("active", active);
        bouton.setAttribute?.("aria-pressed", String(active));
        bouton.onclick = () => {
          choisir(index);
          this.buildCustomScreen();
          hote.children?.[index]?.focus?.();
        };
        hote.appendChild(bouton);
      });
    };
    remplir(this.ui.rigChoices, RIGS, this.playerRig(), (index) => this.settings.set("rig", index));
    remplir(this.ui.liveryChoices, SAIL_LIVERIES, this.playerLivery(), (index) => {
      this.settings.set("sailLivery", index);
      // La livrée est du rendu pur : elle s'applique tout de suite, sans manche.
      this.boats?.[0]?.visual?.setSailLivery?.(index);
    });
    if (this.ui.rigDetail) this.ui.rigDetail.textContent = RIGS[this.playerRig()].detail;
  },

  // Bornage AU POINT D'ENTREE, pas au point d'usage : load() fusionne un JSON
  // arbitraire, et c'est la premiere fois qu'un reglage persiste touche la
  // simulation. Une valeur hors bornes retombe sur l'option mediane, celle qui
  // est numeriquement identique au jeu d'avant.
  playerRig() {
    const brut = this.settings.get("rig");
    return Number.isInteger(brut) && brut >= 0 && brut < RIGS.length ? brut : 1;
  },

  playerAiLevel() {
    const brut = this.settings.get("aiLevel");
    return AI_LEVELS.some((level) => level.key === brut) ? brut : "tour";
  },

  playerLivery() {
    const brut = this.settings.get("sailLivery");
    return Number.isInteger(brut) && brut >= 0 && brut < SAIL_LIVERIES.length ? brut : 0;
  },

  requestAction(bit) {
    if (this.playerInputLocked()) return false;
    const player = this.boats[0];
    if (!player || player.eliminated) return false;
    this.input.actions |= bit;
    this.flashActionControl(bit);
    return true;
  },

  applyActionMask(actions) {
    if (!actions) return;
    this.isApplyingReplay = true;
    const player = this.boats[0];
    const aimed = (callback) => this.withPlayerAim(player, callback);
    if (actions & ACTION_WAVE) aimed(() => this.fireWave(player));
    if (actions & ACTION_HARPOON) aimed(() => this.fireHarpoon(player));
    if (actions & ACTION_MINE) aimed(() => this.dropMine(player));
    if (actions & ACTION_SHIFT) this.triggerPlayerShift();
    if (actions & ACTION_REVENGE) this.useRevenge();
    if (actions & ACTION_BOOST_FORWARD) this.triggerForwardBoost(player);
    if (actions & ACTION_BOOST_LATERAL) {
      // ⚠️ La direction est convertie en repère MONDE. `steer` et le double-tap
      // sont désormais relatifs à l'ÉCRAN (positif = droite), alors que
      // triggerLateralBoost pousse le long de (cos θ, −sin θ), qui pointe vers
      // la gauche de l'écran. D'où le signe.
      const ecran = this.dashDoubleTapSide || this.input.steer || player.roll || -1;
      this.dashDoubleTapSide = 0;
      this.triggerLateralBoost(player, -Math.sign(ecran));
    }
    if (actions & ACTION_RHUM) this.drinkRhum(player);
    if (actions & ACTION_BARIK) aimed(() => this.dropBarik(player));
    if (actions & ACTION_CHADRON) aimed(() => this.sowChadron(player));
    if (actions & ACTION_LANBI) aimed(() => this.blowLanbi(player));
    if (actions & ACTION_PWASON) aimed(() => this.firePwason(player));
    this.isApplyingReplay = false;
  },

  bindUI() {
    const ui = this.ui;
    // ── INSTALLATION DE L'APPLICATION ────────────────────────────────────
    //
    // ⚠️ L'ÉVÉNEMENT NE SE REJOUE PAS. Le navigateur émet `beforeinstallprompt`
    // UNE fois, tôt, et si on ne le garde pas il est perdu : le bouton ne
    // pourra plus rien déclencher. On le capture donc et on le stocke.
    //
    // ⚠️ Le bouton reste MASQUÉ tant que l'événement n'est pas venu. Safari ne
    // l'émet jamais — sur iOS l'installation passe par Partager > Sur l'écran
    // d'accueil, et rien ne permet de la déclencher en JavaScript. Un bouton
    // toujours visible qui échoue une fois sur deux serait pire que rien.
    globalThis.addEventListener?.("beforeinstallprompt", (event) => {
      event.preventDefault();
      this.invitationInstall = event;
      ui.install?.classList?.remove("hidden");
    });
    globalThis.addEventListener?.("appinstalled", () => {
      this.invitationInstall = null;
      ui.install?.classList?.add("hidden");
    });
    if (ui.install) {
      ui.install.onclick = async () => {
        const invitation = this.invitationInstall;
        if (!invitation) return;
        this.invitationInstall = null;
        ui.install.classList.add("hidden");
        try { await invitation.prompt(); } catch { /* refus ou navigateur capricieux */ }
      };
    }
    // ⚠️ LA MUSIQUE MOURAIT AU PREMIER PASSAGE EN ARRIÈRE-PLAN.
    //
    // Sur mobile, quitter l'onglet met en pause les HTMLAudioElement. Au
    // retour, `setScene(nom)` sort immédiatement sur sa garde d'idempotence
    // (`this.scene === nom`) : la scène courante est déjà « course », donc
    // aucun `play()` n'est rappelé et la piste reste en pause pour le RESTE de
    // la session. Les bruitages, eux, revenaient — `AudioEngine.ensure()`
    // reprend le contexte suspendu à chaque image. Le joueur se retrouvait donc
    // avec les effets mais sans musique, sans comprendre pourquoi.
    //
    // On remet `scene` à null avant de rappeler `setScene` : ça contourne la
    // garde sans la supprimer, et le fondu enchaîné repart proprement.
    globalThis.addEventListener?.("visibilitychange", () => {
      if (globalThis.document?.visibilityState !== "visible") return;
      this.audio?.ensure?.();
      const scene = this.music?.scene;
      if (!scene) return;
      this.music.scene = null;
      this.music.setScene(scene);
    });
    // ⚠️ La musique de menu ne peut PAS démarrer au chargement : tout navigateur
    // suspend le contexte audio tant qu'aucun geste utilisateur n'a eu lieu.
    // On l'arme donc au premier pointeur, une seule fois, sans rien bloquer.
    const armerMusique = () => {
      if (this.audio?.ensure?.() && this.mode === "menu") this.music?.setScene?.("menu");
    };
    globalThis.addEventListener?.("pointerdown", armerMusique, { once: true });
    globalThis.addEventListener?.("keydown", armerMusique, { once: true });
    ui.play.onclick = () => this.startMatch();
    if (ui.versusBtn) ui.versusBtn.onclick = () => {
      this.dialogReturnFocus = globalThis.document?.activeElement || ui.versusBtn;
      if (this.openVersusLobby()) {
        ui.versusBtn.setAttribute?.("aria-expanded", "true");
        ui.versusStart?.focus?.();
      }
    };
    if (ui.versusClose) ui.versusClose.onclick = () => {
      const returnTarget = this.dialogReturnFocus || ui.versusBtn;
      this.closeVersusLobby();
      ui.versusBtn?.setAttribute?.("aria-expanded", "false");
      returnTarget?.focus?.();
      this.dialogReturnFocus = null;
    };
    if (ui.versusStart) ui.versusStart.onclick = () => {
      ui.versusBtn?.setAttribute?.("aria-expanded", "false");
      this.startVersusMatch();
    };
    if (ui.customBtn) ui.customBtn.onclick = () => {
      this.dialogReturnFocus = globalThis.document?.activeElement || ui.customBtn;
      this.buildCustomScreen();
      ui.customScreen.classList.remove("hidden");
      ui.customBtn.setAttribute?.("aria-expanded", "true");
      ui.customClose?.focus?.();
    };
    if (ui.customClose) ui.customClose.onclick = () => {
      ui.customScreen.classList.add("hidden");
      ui.customBtn?.setAttribute?.("aria-expanded", "false");
      const returnTarget = this.dialogReturnFocus || ui.customBtn;
      returnTarget?.focus?.();
      this.dialogReturnFocus = null;
    };
    if (ui.tourBtn) ui.tourBtn.onclick = () => this.startTour();
    ui.rematch.onclick = () => {
      if (this.versusLocal) { this.startVersusMatch(); return; }
      if (!this.tour) { this.startMatch(); return; }
      const nextStage = this.tour.stage + 1;
      if (nextStage < TOUR_STAGES.length) this.startTourStage(nextStage);
      else this.startTour();
    };
    ui.retry.onclick = () => location.reload();
    ui.pauseBtn.onclick = () => this.togglePause();
    if (ui.settingsBtn) ui.settingsBtn.onclick = () => this.togglePause(true);
    ui.resume.onclick = () => this.togglePause(false);
    ui.restart.onclick = () => {
      if (this.versusLocal) this.startVersusMatch();
      else if (this.tour) this.startTourStage(this.tour.stage);
      else this.startMatch();
    };
    ui.sound.onclick = () => {
      this.audio.setMuted(!this.audio.muted);
      this.settings.set("audio", !this.audio.muted);
      ui.sound.textContent = this.audio.muted ? "🔇" : "🔊";
      ui.sound.setAttribute?.("aria-pressed", String(!this.audio.muted));
    };
    if (ui.replay) ui.replay.onclick = () => this.latestReplay && this.startReplay(this.latestReplay);
    if (ui.downloadReplay) ui.downloadReplay.onclick = () => this.latestReplay && downloadReplay(this.latestReplay);
    if (ui.downloadTelemetry) ui.downloadTelemetry.onclick = () => this.downloadTelemetry();
    ui.quality.onclick = () => {
      const tier = this.quality.cycleManual();
      this.settings.set("quality", ["LQ", "MQ", "HQ"][tier]);
      this.applySettingsUI();
    };
    if (ui.hapticsToggle) ui.hapticsToggle.onclick = () => this.toggleSetting("haptics", [1, 0.5, 0]);
    if (ui.stableCameraToggle) ui.stableCameraToggle.onclick = () => this.toggleSetting("cameraRoll", [0.72, 0.94]);
    if (ui.flashToggle) ui.flashToggle.onclick = () => this.toggleSetting("reduceFlash");
    // SANS doit vraiment produire zéro mouvement caméra, pas un mouvement atténué.
    if (ui.impactToggle) ui.impactToggle.onclick = () => {
      this.toggleSetting("impact", [1, 0.5, 0]);
      this.impact.reset();
    };
    if (ui.difficultyToggle) {
      ui.difficultyToggle.onclick = () => {
        this.toggleSetting("aiLevel", AI_LEVELS.map((level) => level.key));
        if (this.mode === "playing") this.showMessage("ADVERSAIRES : PROCHAINE PARTIE", 0.85);
      };
    }
    if (ui.leftHandedToggle) ui.leftHandedToggle.onclick = () => this.toggleSetting("leftHanded");
    if (ui.perfToggle) ui.perfToggle.onclick = () => this.toggleSetting("showPerf");
    if (ui.autoQualityToggle) ui.autoQualityToggle.onclick = () => {
      if (this.quality.manual) { this.quality.setAutomatic(); this.settings.set("quality", "auto"); }
      else { this.quality.setTier(this.quality.tier, true); this.settings.set("quality", ["LQ", "MQ", "HQ"][this.quality.tier]); }
      this.applySettingsUI();
    };
    ui.bwa.onclick = () => this.requestAction(ACTION_SHIFT);
    // ── TROIS TUILES D'ARME, TIR DIRECT ──────────────────────────────────
    // La tuile TURBO est partie : elle doublonnait le double-tap sur l'eau,
    // déjà en place. Les trois tuiles rendues désignent chacune leur arme.
    const soute = (rang) => this.boats[0]?.loadout?.[rang] ?? null;
    if (ui.weaponSlot) ui.weaponSlot.onclick = () => this.fireWeaponKey(soute(0));
    if (ui.weaponHold2) ui.weaponHold2.onclick = () => this.fireWeaponKey(soute(1));
    if (ui.weaponCrate) {
      ui.weaponCrate.onclick = () => this.fireWeaponKey(this.crateWeapon()?.key ?? null);
    }
    // ⚠️ Le rétro est MAINTENU, donc il ne peut pas passer par `onclick` :
    // il faut le front descendant. Et `pointercancel` est obligatoire — sans
    // lui, un glissement hors du bouton laisserait la caméra retournée.
    if (ui.lookBack) {
      const regarder = (actif) => { this.input.lookBack = actif; };
      ui.lookBack.addEventListener("pointerdown", (event) => {
        event.preventDefault?.();
        regarder(true);
        ui.lookBack.setPointerCapture?.(event.pointerId);
      });
      for (const nom of ["pointerup", "pointercancel", "pointerleave"]) {
        ui.lookBack.addEventListener(nom, () => regarder(false));
      }
    }
    if (ui.zoomIn) ui.zoomIn.onclick = () => this.adjustCameraZoom(-0.14);
    if (ui.zoomOut) ui.zoomOut.onclick = () => this.adjustCameraZoom(0.14);
    if (ui.zoomReset) ui.zoomReset.onclick = () => this.adjustCameraZoom(1.18 - this.cameraZoom);
    ui.revenge.onclick = () => this.requestAction(ACTION_REVENGE);

    addEventListener("keydown", (event) => this.handleKeyboardInput(true, event));
    addEventListener("keyup", (event) => this.handleKeyboardInput(false, event));
    this.focusWhenDialogOpens(ui.end, ui.rematch);
    this.focusWhenDialogOpens(ui.fatal, ui.retry);

    const joystickMove = (event) => {
      if (this.paused || !this.input.joy || event.pointerId !== this.input.joyId) return;
      const dx = event.clientX - this.input.joyCenterX;
      const dy = event.clientY - this.input.joyCenterY;
      const radius = 45;
      const nx = clamp(dx / radius, -1, 1);
      const ny = clamp(dy / radius, -1, 1);
      this.input.steer = nx;

      // ── BWA DASH AU DOUBLE-COUP DE JOYSTICK ────────────────────────────
      //
      // ⚠️ SANS CE GESTE, LE DASH EST INJOUABLE AU DOIGT. Ses trois autres
      // déclencheurs sont `X`, `Ctrl` et le double-tap `A`/`D` — tous au
      // clavier. Le bouton de la barre du bas en était donc le SEUL accès
      // tactile, dans un jeu conçu mobile-first.
      //
      // On détecte un FRONT MONTANT : le manche doit repasser sous le seuil
      // entre deux poussées, donc tenir la barre à fond ne déclenche rien.
      const cote = nx > JOY_DASH_THRESHOLD ? 1 : nx < -JOY_DASH_THRESHOLD ? -1 : 0;
      if (cote === 0) this.joyDashLatch = 0;
      else if (this.joyDashLatch !== cote) {
        this.joyDashLatch = cote;
        // Horloge murale, comme pour le double-tap clavier : ce handler tourne
        // dans le DOM, hors du pas fixe. Le replay n'enregistre que le BIT
        // produit, jamais le timing du geste.
        const maintenant = (globalThis.performance?.now?.() ?? 0);
        if (this.joyDashSide === cote
            && maintenant - (this.joyDashAt ?? -1e9) <= JOY_DASH_DOUBLE_TAP_MS) {
          this.joyDashSide = 0;
          this.joyDashAt = -1e9;
          this.dashDoubleTapSide = cote;
          this.requestAction(ACTION_BOOST_LATERAL);
        } else {
          this.joyDashSide = cote;
          this.joyDashAt = maintenant;
        }
      }
      // Vertical travel doubles as an intuitive mobile sail trim: push up for power,
      // pull down to depower before an impact or a violent gust.
      this.input.trim = clamp(KEYBOARD_TRIM.cruise - ny * 0.22, KEYBOARD_TRIM.min, KEYBOARD_TRIM.max);
      ui.joyKnob.style.transform = `translate(${nx * radius}px,${ny * radius * 0.35}px)`;
    };
    ui.joystick.addEventListener("pointerdown", (event) => {
      if (this.paused || this.mode !== "playing") return;
      this.input.joy = true;
      this.input.joyId = event.pointerId;
      const rect = ui.joystick.getBoundingClientRect();
      this.input.joyCenterX = rect.left + rect.width / 2;
      this.input.joyCenterY = rect.top + rect.height / 2;
      ui.joystick.setPointerCapture(event.pointerId);
      joystickMove(event);
    });
    ui.joystick.addEventListener("pointermove", joystickMove);
    const joystickEnd = (event) => {
      if (event.pointerId !== this.input.joyId) return;
      this.input.joy = false;
      this.input.joyId = null;
      this.input.steer = 0;
      this.input.trim = KEYBOARD_TRIM.cruise;
      // Le verrou retombe au relâchement : la prochaine poussée compte comme un
      // nouveau front, sinon lever le pouce puis repousser du même côté ne
      // serait jamais lu comme un deuxième coup.
      this.joyDashLatch = 0;
      ui.joyKnob.style.transform = "";
    };
    ui.joystick.addEventListener("pointerup", joystickEnd);
    ui.joystick.addEventListener("pointercancel", joystickEnd);

    // ── Barre libre : diriger n'importe où sur l'eau ────────────────────────
    //
    // Le pad reste, mais il cesse d'être le seul point d'entrée. Poser le doigt
    // (ou la souris) sur le viewport crée un centre de barre À CET ENDROIT :
    // c'est plus direct et ça laisse le pouce où il est déjà. Le pad garde son
    // intérêt pour qui veut un repère fixe.
    //
    // DOUBLE TAP = TURBO. Le seuil est en DISTANCE autant qu'en temps : sans le
    // contrôle de distance, un balayage rapide en deux temps déclencherait un
    // turbo que le joueur n'a pas demandé.
    const libre = { actif: false, id: null, x: 0, y: 0, dernierTap: -1, dernierX: 0, dernierY: 0 };
    const RAYON_LIBRE = 62;
    const DOUBLE_TAP_MS = 280;
    const DOUBLE_TAP_PX = 44;

    const barreLibre = (event) => {
      if (this.paused || !libre.actif || event.pointerId !== libre.id) return;
      const dx = clamp((event.clientX - libre.x) / RAYON_LIBRE, -1, 1);
      const dy = clamp((event.clientY - libre.y) / RAYON_LIBRE, -1, 1);
      this.input.steer = dx;
      this.input.trim = clamp(KEYBOARD_TRIM.cruise - dy * 0.22, KEYBOARD_TRIM.min, KEYBOARD_TRIM.max);
    };

    ui.viewport.addEventListener("contextmenu", (event) => event.preventDefault());
    ui.viewport.addEventListener("pointerdown", (event) => {
      const steeringActive = (
        (this.input.joy && event.pointerId !== this.input.joyId)
        || (libre.actif && event.pointerId !== libre.id)
      );
      if (this.beginAimPointer(event, steeringActive, ui.viewport.clientWidth)) {
        ui.viewport.setPointerCapture?.(event.pointerId);
        return;
      }
      if (this.mode !== "playing" || this.paused || this.input.joy || this.input.aimActive) return;
      const maintenant = performance.now();
      const proche = Math.hypot(event.clientX - libre.dernierX, event.clientY - libre.dernierY) < DOUBLE_TAP_PX;
      if (maintenant - libre.dernierTap < DOUBLE_TAP_MS && proche) {
        this.requestAction(ACTION_BOOST_FORWARD);
        libre.dernierTap = -1;
      } else {
        libre.dernierTap = maintenant;
      }
      libre.dernierX = event.clientX;
      libre.dernierY = event.clientY;
      libre.actif = true;
      libre.id = event.pointerId;
      libre.x = event.clientX;
      libre.y = event.clientY;
      ui.viewport.setPointerCapture?.(event.pointerId);
    });
    ui.viewport.addEventListener("pointermove", (event) => {
      if (!this.updateAimPointer(event)) barreLibre(event);
    });
    const finBarreLibre = (event) => {
      if (event.pointerId !== libre.id) return;
      libre.actif = false;
      libre.id = null;
      this.input.steer = 0;
      this.input.trim = KEYBOARD_TRIM.cruise;
    };
    const finVisee = (event, fire) => {
      const pointerId = this.input.aimPointerId;
      if (!this.endAimPointer(event, fire)) return false;
      if (ui.viewport.hasPointerCapture?.(pointerId)) ui.viewport.releasePointerCapture?.(pointerId);
      return true;
    };
    ui.viewport.addEventListener("pointerup", (event) => {
      if (!finVisee(event, true)) finBarreLibre(event);
    });
    ui.viewport.addEventListener("pointercancel", (event) => {
      if (!finVisee(event, false)) finBarreLibre(event);
    });

    const addPressedState = (button) => {
      button.addEventListener("pointerdown", () => button.classList.add("pressed"));
      button.addEventListener("pointerup", () => button.classList.remove("pressed"));
      button.addEventListener("pointercancel", () => button.classList.remove("pressed"));
      button.addEventListener("lostpointercapture", () => button.classList.remove("pressed"));
      button.addEventListener("pointerleave", () => button.classList.remove("pressed"));
      button.addEventListener("blur", () => button.classList.remove("pressed"));
    };
    [ui.weaponSlot, ui.weaponHold2, ui.weaponCrate, ui.bwa].filter(Boolean).forEach(addPressedState);

    this.renderer.domElement.addEventListener?.("wheel", (event) => {
      event.preventDefault?.();
      this.adjustCameraZoom(Math.sign(event.deltaY || 0) * 0.10);
    }, { passive: false });
  }
,
  togglePause(force) {
    if (this.mode !== "playing") return;
    const nextPaused = typeof force === "boolean" ? force : !this.paused;
    if (nextPaused && !this.paused) {
      this.pauseReturnFocus = globalThis.document?.activeElement || this.ui.pauseBtn;
    }
    this.paused = nextPaused;
    this.clearLiveInput();
    this.ui.pause.classList.toggle("hidden", !this.paused);
    this.ui.pauseBtn?.setAttribute?.("aria-expanded", String(this.paused));
    this.ui.settingsBtn?.setAttribute?.("aria-expanded", String(this.paused));
    if (this.paused) this.ui.resume?.focus?.();
    else {
      this.pauseReturnFocus?.focus?.();
      this.pauseReturnFocus = null;
    }
  }
};
