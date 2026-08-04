import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ACTION_WAVE } from "../src/game/balance.js";
import { InputSystems } from "../src/game/input.js";

const root = new URL("../", import.meta.url);
const [html, css, hudSource, inputSource, tourHubSource, serviceWorker] = await Promise.all([
  readFile(new URL("index.html", root), "utf8"),
  readFile(new URL("style.css", root), "utf8"),
  readFile(new URL("src/game/hud.js", root), "utf8"),
  readFile(new URL("src/game/input.js", root), "utf8"),
  readFile(new URL("src/game/tour-hub.js", root), "utf8"),
  readFile(new URL("service-worker.js", root), "utf8")
]);

// Contrats accessibles : les alertes sont annoncées, le flux de combat reste un
// journal, et les raccourcis visibles correspondent aux commandes physiques.
assert.match(html, /id="message"[^>]+role="status"[^>]+aria-live="polite"/);
assert.match(html, /id="killfeed"[^>]+role="log"[^>]+aria-live="polite"/);
assert.match(html, /id="roundLabel"[^>]+role="status"[^>]+aria-live="polite"/);
assert.match(html, /id="timer"[^>]+role="timer"[^>]+aria-live="off"/);
assert.match(html, /id="aimHelp"[^>]+aria-live="off"/);
assert.match(html, /id="versusHud"[^>]+role="group"[^>]+aria-live="off"/);
assert.match(html, /id="versusAnnouncer"[^>]+role="status"[^>]+aria-live="polite"/);
assert.match(html, /id="weaponSlotBtn"[^>]+aria-keyshortcuts="Space"/);
assert.match(html, /id="bwaBtn"[^>]+aria-keyshortcuts="Shift"/);
assert.match(html, /id="versusBtn"[^>]+aria-haspopup="dialog"[^>]+aria-controls="versusScreen"/);
assert.match(html, /id="customBtn"[^>]+aria-expanded="false"/);
assert.match(html, /id="menuSettingsBtn"[^>]+aria-controls="pauseScreen"/);
assert.match(html, /id="replaysBtn"[^>]+aria-controls="replayLibrary"/);
assert.match(html, /id="aboutBtn"[^>]+aria-controls="infoHub"/);
assert.match(
  html,
  /id="playBtn"[\s\S]*id="tourBtn"[\s\S]*id="customBtn"[\s\S]*<details id="menuMore" class="menu-more">/
);
assert.match(
  html,
  /<details id="menuMore" class="menu-more">[\s\S]*AUTRES MODES &amp; OPTIONS[\s\S]*id="versusBtn"[\s\S]*id="dailyChallengeBtn"[\s\S]*<\/details>/
);
assert.match(html, /id="controlsScreen"[^>]+role="dialog"/);
assert.match(html, /id="keyboardControlsPanel"[^>]+aria-labelledby="keyboardControlsTab"/);
assert.match(html, /id="touchControlsPanel"[^>]+aria-labelledby="touchControlsTab"/);
assert.match(html, /id="gamepadControlsPanel"[^>]+aria-labelledby="gamepadControlsTab"/);
assert.match(html, /id="onboardingScreen"[^>]+role="dialog"/);
assert.equal((html.match(/data-onboarding-step=/g) ?? []).length, 1, "onboarding is one concise card; the three-step lesson continues live");
assert.match(html, /aria-label="Initiation express en trois gestes"/);
assert.match(html, /3 GESTES\. À L’EAU\./);
assert.match(html, /1 · DIRIGE[\s\S]*2 · REDRESSE[\s\S]*3 · TIRE COCO/);
assert.match(html, /id="loadoutChoices"[^>]+aria-label="Deux armes de soute parmi quatre"/);
assert.match(html, /id="pauseMenuBtn"[^>]*>QUITTER · MENU PRINCIPAL</);
assert.match(html, /id="endMenuBtn"[^>]*>RETOUR AU PORT</);
assert.match(html, /SHOWROOM 3D · MODÈLE DU JEU/);
assert.match(html, /id="customScreen"[^>]+aria-labelledby="customTitle"/);
assert.match(html, /<details class="result-advanced">[\s\S]*id="downloadReplayBtn"[\s\S]*id="downloadTelemetryBtn"[\s\S]*<\/details>/);
assert.match(html, /id="skipSpectatingBtn"[^>]*>PASSER AUX RÉSULTATS</);
for (const legend of ["&amp;", "é", "&quot;", "'"]) assert.ok(html.includes(`<kbd>${legend}</kbd>`));

const microStart = css.indexOf("=== UI MICRO-INTERACTIONS V6");
const microEnd = css.indexOf("=== END UI MICRO-INTERACTIONS V6");
assert.ok(microStart >= 0 && microEnd > microStart, "micro-interaction stylesheet section must exist");
const microCss = css.slice(microStart, microEnd);
assert.match(microCss, /@media\(hover:hover\) and \(pointer:fine\)/);
assert.match(microCss, /@media\(pointer:coarse\),\s*\(any-pointer:coarse\)/);
assert.match(microCss, /min-(?:width|height):44px/);
assert.match(microCss, /@media\(prefers-reduced-motion:reduce\)/);
assert.match(microCss, /button:focus-visible/);
assert.match(microCss, /\.action\.cooldown:not\(\.resource-low\)::before/);
assert.match(microCss, /\.versus-hud\.p1-leading/);
assert.doesNotMatch(microCss, /\binfinite\b/, "new UI cues must never loop");

const qaStart = css.indexOf("=== UI QA PASS V6.1");
const qaEnd = css.indexOf("=== END UI QA PASS V6.1");
assert.ok(qaStart >= 0 && qaEnd > qaStart, "QA stylesheet section must exist");
const qaCss = css.slice(qaStart, qaEnd);
assert.match(qaCss, /\.status\.status-surf:not\(\.status-danger\)/);
assert.match(qaCss, /@media\(min-width:1200px\) and \(min-height:700px\)/);
assert.match(qaCss, /grid-template-rows:repeat\(3,44px\)/);
assert.match(qaCss, /@media\(max-width:900px\) and \(max-height:520px\) and \(orientation:landscape\)/);
assert.match(qaCss, /position:absolute;\s*right:52px;\s*bottom:max\(4px,env\(safe-area-inset-bottom\)\)/);
assert.match(qaCss, /height:138px;\s*grid-template-rows:repeat\(3,46px\)/);
assert.match(qaCss, /@media\(prefers-reduced-motion:reduce\)/);
assert.doesNotMatch(qaCss, /\binfinite\b/);

const counterStart = css.indexOf("=== V12");
const counterEnd = css.indexOf("=== END V12");
assert.ok(counterStart >= 0 && counterEnd > counterStart, "central counter-heel stylesheet section must exist");
const counterCss = css.slice(counterStart, counterEnd);
assert.match(counterCss, /#bwaBtn\{[\s\S]*?position:fixed;[\s\S]*?left:50%;/);
assert.match(counterCss, /grid-template-columns:repeat\(3,/);
assert.match(counterCss, /--shift-meter/);
assert.match(counterCss, /spectator-controls-hidden \.actions/);

const menuV14Start = css.indexOf("=== V14 · MENU JOUEUR A DEUX NIVEAUX");
const menuV14End = css.indexOf("=== END V14 · MENU JOUEUR A DEUX NIVEAUX");
assert.ok(menuV14Start >= 0 && menuV14End > menuV14Start, "two-level player menu stylesheet must exist");
const menuV14Css = css.slice(menuV14Start, menuV14End);
assert.match(menuV14Css, /\.menu-more>summary/);
assert.match(menuV14Css, /\.menu-more-panel/);
assert.match(menuV14Css, /@media\(max-height:540px\) and \(orientation:landscape\)/);
assert.doesNotMatch(menuV14Css, /\binfinite\b/, "menu disclosure must never loop");
assert.doesNotMatch(counterCss, /\binfinite\b/, "central counter-heel cues must never loop");

const onboardingV15Start = css.indexOf("=== V15 · INITIATION EN TROIS GESTES");
const onboardingV15End = css.indexOf("=== END V15 · INITIATION EN TROIS GESTES");
assert.ok(onboardingV15Start >= 0 && onboardingV15End > onboardingV15Start, "one-card onboarding stylesheet must exist");
const onboardingV15Css = css.slice(onboardingV15Start, onboardingV15End);
assert.match(onboardingV15Css, /\.onboarding-essentials/);
assert.match(onboardingV15Css, /@media\(max-height:520px\) and \(orientation:landscape\)/);

const progressiveHudStart = css.indexOf("=== V16 · HUD PROGRESSIF ET CONTEXTUEL");
const progressiveHudEnd = css.indexOf("=== END V16 · HUD PROGRESSIF ET CONTEXTUEL");
assert.ok(progressiveHudStart >= 0 && progressiveHudEnd > progressiveHudStart, "progressive HUD stylesheet must exist");
const progressiveHudCss = css.slice(progressiveHudStart, progressiveHudEnd);
assert.match(progressiveHudCss, /\.hud-diagnostics-calm/);
assert.match(progressiveHudCss, /\.training-advanced-locked/);
assert.match(progressiveHudCss, /\.training-locked/);
assert.match(progressiveHudCss, /\.killfeed \.kill:nth-child\(n\+3\)/);
assert.match(progressiveHudCss, /@media\(pointer:coarse\),\(any-pointer:coarse\)/);
assert.doesNotMatch(progressiveHudCss, /\binfinite\b/, "progressive HUD cues must never loop");
assert.match(inputSource, /toggleSetting\("cameraRoll",\s*\[0\.82,\s*0\.94,\s*0\.72\]\)/);

const showroomStart = css.indexOf("=== V8 · MENU LIVE ET ATELIER 3D");
const showroomEnd = css.indexOf("=== END V8 · MENU LIVE ET ATELIER 3D");
assert.ok(showroomStart >= 0 && showroomEnd > showroomStart, "live menu/showroom stylesheet section must exist");
const showroomCss = css.slice(showroomStart, showroomEnd);
assert.match(showroomCss, /#customScreen\{[\s\S]*?backdrop-filter:none/);
assert.match(showroomCss, /\.pause-action-rail\{/);
for (const retired of [
  "menu_hero_backdrop.webp",
  "mode_combat_card.webp",
  "mode_tour_card.webp",
  "mode_versus_card.webp",
  "mode_workshop_card.webp",
  "versus_lobby_backdrop.webp"
]) {
  assert.doesNotMatch(
    `${html}\n${css}\n${serviceWorker}`,
    new RegExp(retired.replace(".", "\\.")),
    `${retired} must stay outside the runtime and precache`
  );
}

for (const state of [
  "round-cue",
  "charge-gained",
  "ready-cue",
  "aim-enter-cue",
  "target-cue",
  "p1-leading",
  "score-cue",
  "status-critical"
]) assert.ok(hudSource.includes(`"${state}"`), `HUD must drive ${state}`);
for (const turboState of [
  "data-turbo-state",
  "turbo-ready-cue",
  "turbo-confirmed",
  "turbo-rejected"
]) assert.ok(hudSource.includes(`"${turboState}"`), `HUD must drive ${turboState}`);
assert.match(hudSource, /toggleSetting|hapticsLevel/);
assert.match(hudSource, /\[1,\s*0\.5,\s*0\]/);
assert.match(inputSource, /toggleSetting\("haptics",\s*\[1,\s*0\.5,\s*0\]\)/);
assert.match(inputSource, /lostpointercapture/);
assert.match(inputSource, /trapDialogFocus/);
assert.match(inputSource, /focusWhenDialogOpens/);
assert.match(inputSource, /aria-pressed/);
assert.match(inputSource, /startWithOnboarding/);
assert.match(inputSource, /requestReturnToMenu/);
assert.match(inputSource, /pauseForInterruption/);
assert.match(inputSource, /LOADOUT_POOL/);
assert.match(inputSource, /activatePrimaryAction/);
assert.match(inputSource, /openTourHub\(this\)/);
assert.match(inputSource, /ui\.replaysBtn\.onclick = \(\) => openReplayLibrary\(this\)/);
assert.match(inputSource, /ui\.aboutBtn\.onclick = \(\) => openInfoHub\(\)/);
assert.match(tourHubSource, /dialog\.setAttribute\("aria-modal", "true"\)/);
assert.match(tourHubSource, /dialog\.hidden = true/);
assert.match(tourHubSource, /hub\.hidden = false/);
assert.match(tourHubSource, /hub\.setAttribute\("open", ""\)/);
assert.match(tourHubSource, /hub\.removeAttribute\("open"\)/);
assert.match(tourHubSource, /event\.key === "Escape"/);
assert.match(tourHubSource, /event\.key !== "Tab"/);
assert.match(tourHubSource, /getClientRects\(\)\.length > 0/);
assert.match(css, /@media\(pointer:coarse\),\s*\(any-pointer:coarse\)[\s\S]*\.weapon-shortcuts\{display:none!important\}/);
assert.match(css, /body\.input-touch \[data-device-copy="touch"\]/);
assert.match(css, /\.tour-hub\{/);
assert.match(css, /\.tour-route\{/);
assert.match(css, /\.tour-standings\{/);
// Garde-fous issus de la passe navigateur 390×844 et 844×390 :
// les dialogues courts doivent rester atteignables sans déborder latéralement,
// et l'indication de rotation ne doit jamais réapparaître au menu.
assert.match(css, /#pauseScreen\{\s*place-items:start center;\s*overflow:auto;/);
assert.match(css, /\.versus-screen\{\s*overflow-x:hidden;\s*overflow-y:auto;/);
assert.match(css, /\.versus-shell\{width:min\(96vw,calc\(100vw - 36px\)\)/);
assert.doesNotMatch(css, /\.rotate-hint\{display:block!important\}/);
assert.match(inputSource, /overflow \? ui\.versusClose : ui\.versusStart/);
assert.match(inputSource, /ui\.versusScreen\.scrollTop = 0/);
// ⚠️ 1-4 → 1-8. Les quatre armes de CAISSE (barik, chadron, lanbi, pwason)
// n'avaient aucune touche dédiée : il fallait cycler avec E. Et les chiffres
// TIRENT désormais au lieu de simplement sélectionner — d'où `fireWeaponShortcut`.
assert.match(inputSource, /\^Digit\(\[1-8\]\)\$/);
assert.match(inputSource, /fireWeaponShortcut/);
// ⚠️ CONTREPARTIE DU RETRAIT DE LA TUILE BWA DASH. Ses autres déclencheurs
// (`X`, `Ctrl`, double-tap `A`/`D`) sont tous au CLAVIER : le bouton était le
// seul accès tactile, dans un jeu mobile-first. Le double-coup de barre le
// remplace, et ces deux assertions empêchent qu'on le supprime sans s'en
// apercevoir — le plancher de contrôles tactiles de browser-smoke.py a été
// abaissé de 8 à 7 en contrepartie.
assert.match(inputSource, /JOY_DASH_THRESHOLD/);
assert.match(inputSource, /JOY_DASH_DOUBLE_TAP_MS/);
assert.match(hudSource, /critical \? "assertive" : "polite"/);
assert.match(hudSource, /Son activÃ©|Son activé/);
assert.match(hudSource, /versusAnnouncer/);

const makeClassList = (...initial) => {
  const values = new Set(initial);
  return {
    add: (...names) => names.forEach((name) => values.add(name)),
    remove: (...names) => names.forEach((name) => values.delete(name)),
    contains: (name) => values.has(name),
    toggle: (name, force) => {
      const enabled = force ?? !values.has(name);
      if (enabled) values.add(name);
      else values.delete(name);
      return enabled;
    }
  };
};

// L'aide suit réellement le dernier périphérique et n'affiche qu'une fiche.
{
  const oldDocument = globalThis.document;
  const bodyClasses = makeClassList();
  const focusCounts = { keyboard: 0, touch: 0, gamepad: 0 };
  const tabs = ["keyboard", "touch", "gamepad"].map((device) => ({
    dataset: { controlDevice: device },
    classList: makeClassList(),
    setAttribute(name, value) { this[name] = value; },
    focus() { focusCounts[device]++; },
    tabIndex: 0
  }));
  const panels = ["keyboard", "touch", "gamepad"].map((device) => ({
    dataset: { controlPanel: device },
    classList: makeClassList()
  }));
  globalThis.document = { body: { classList: bodyClasses } };
  const context = { ui: { controlTabs: tabs, controlPanels: panels } };
  Object.assign(context, InputSystems);
  try {
    context.setInputDevice("touch");
    assert.equal(bodyClasses.contains("input-touch"), true);
    assert.equal(tabs[1].classList.contains("active"), true);
    assert.equal(tabs[1]["aria-selected"], "true");
    assert.equal(panels[0].classList.contains("hidden"), true);
    assert.equal(panels[1].classList.contains("hidden"), false);
    let prevented = 0;
    assert.equal(context.handleControlTabKey({
      key: "ArrowRight",
      preventDefault() { prevented++; }
    }, tabs[1]), true);
    assert.equal(tabs[2]["aria-selected"], "true");
    assert.equal(tabs[2].tabIndex, 0);
    assert.equal(focusCounts.gamepad, 1);
    assert.equal(context.handleControlTabKey({
      key: "Home",
      preventDefault() { prevented++; }
    }, tabs[2]), true);
    assert.equal(tabs[0]["aria-selected"], "true");
    assert.equal(focusCounts.keyboard, 1);
    assert.equal(context.handleControlTabKey({
      key: "ArrowLeft",
      preventDefault() { prevented++; }
    }, tabs[0]), true);
    assert.equal(tabs[2]["aria-selected"], "true", "ArrowLeft wraps to the final tab");
    assert.equal(prevented, 3);

    // Séquence DOM réelle : le handler de l'onglet s'exécute sur la cible,
    // puis le même événement remonte au listener clavier global.
    context.setInputDevice("keyboard");
    const bubblingArrow = {
      key: "ArrowRight",
      code: "ArrowRight",
      target: tabs[0],
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; }
    };
    assert.equal(context.handleControlTabKey(bubblingArrow, tabs[0]), true);
    assert.equal(bubblingArrow.defaultPrevented, true);
    context.handleKeyboardInput(true, bubblingArrow);
    assert.equal(
      tabs[1]["aria-selected"],
      "true",
      "the global keyboard listener must not undo a tab selection consumed on the target"
    );

    // Une touche ordinaire non consommée continue bien d'annoncer le clavier.
    context.setInputDevice("touch");
    context.handleKeyboardInput(true, {
      code: "KeyQ",
      target: null,
      defaultPrevented: false,
      preventDefault() {}
    });
    assert.equal(tabs[0]["aria-selected"], "true", "normal keyboard shortcuts still select the keyboard device");
  } finally {
    if (oldDocument === undefined) delete globalThis.document;
    else globalThis.document = oldDocument;
  }
}

// Une action acceptée donne un retour sur son contrôle ; une action verrouillée
// n'en met aucun en attente et ne ment pas visuellement.
{
  const weaponSlot = { classList: makeClassList() };
  const context = {
    paused: false,
    playback: null,
    isApplyingReplay: false,
    input: { actions: 0 },
    boats: [{ eliminated: false }],
    ui: { weaponSlot }
  };
  Object.assign(context, InputSystems);
  assert.equal(context.requestAction(ACTION_WAVE), true);
  assert.equal(context.input.actions, ACTION_WAVE);
  assert.equal(weaponSlot.classList.contains("input-confirmed"), true);
}
{
  const weaponSlot = { classList: makeClassList() };
  const context = {
    paused: true,
    playback: null,
    isApplyingReplay: false,
    input: { actions: 0 },
    boats: [{ eliminated: false }],
    ui: { weaponSlot }
  };
  Object.assign(context, InputSystems);
  assert.equal(context.requestAction(ACTION_WAVE), false);
  assert.equal(context.input.actions, 0);
  assert.equal(weaponSlot.classList.contains("input-confirmed"), false);
}

// Échap ferme le lobby et rend le focus au CTA qui l'a ouvert.
{
  const lobbyClasses = makeClassList();
  let focused = 0;
  let prevented = 0;
  const returnTarget = { focus: () => { focused++; } };
  const context = {
    mode: "menu",
    ui: {
      versusScreen: { classList: lobbyClasses },
      versusBtn: returnTarget
    },
    dialogReturnFocus: returnTarget,
    closeVersusLobby() { lobbyClasses.add("hidden"); }
  };
  Object.assign(context, InputSystems);
  context.handleKeyboardInput(true, {
    code: "Escape",
    preventDefault() { prevented++; }
  });
  assert.equal(lobbyClasses.contains("hidden"), true);
  assert.equal(focused, 1);
  assert.equal(prevented, 1);
}

// Tab reste dans le dialogue actif, même si le focus courant arrive de
// l'arrière-plan.
{
  let firstFocused = 0;
  let prevented = 0;
  const first = {
    hidden: false,
    getAttribute: () => null,
    getClientRects: () => [{}],
    focus: () => { firstFocused++; }
  };
  const last = {
    hidden: false,
    getAttribute: () => null,
    getClientRects: () => [{}],
    focus() {}
  };
  // Simule restart/pauseMenu masqués par .menu-settings ou un bouton placé
  // dans un <details> fermé : hidden reste faux, mais aucun rect n'est rendu.
  const cssHiddenTail = {
    hidden: false,
    getAttribute: () => null,
    getClientRects: () => [],
    focus() { throw new Error("CSS-hidden control must never receive focus"); }
  };
  const oldDocument = globalThis.document;
  globalThis.document = { activeElement: last };
  const context = {
    ui: {
      versusScreen: {
        classList: makeClassList(),
        querySelectorAll: () => [first, last, cssHiddenTail]
      }
    }
  };
  Object.assign(context, InputSystems);
  try {
    assert.equal(context.trapDialogFocus({
      code: "Tab",
      shiftKey: false,
      preventDefault() { prevented++; }
    }), true);
    assert.equal(firstFocused, 1);
    assert.equal(prevented, 1);
  } finally {
    if (oldDocument === undefined) delete globalThis.document;
    else globalThis.document = oldDocument;
  }
}

// Un résultat ou une erreur qui apparaît sans clic reçoit immédiatement un
// point d'entrée clavier.
{
  const oldObserver = globalThis.MutationObserver;
  let mutationCallback = null;
  let focused = 0;
  globalThis.MutationObserver = class {
    constructor(callback) { mutationCallback = callback; }
    observe() {}
  };
  const screen = { classList: makeClassList("hidden") };
  const target = { focus: () => { focused++; } };
  const context = {};
  Object.assign(context, InputSystems);
  try {
    context.focusWhenDialogOpens(screen, target);
    screen.classList.remove("hidden");
    mutationCallback();
    assert.equal(focused, 1);
  } finally {
    if (oldObserver === undefined) delete globalThis.MutationObserver;
    else globalThis.MutationObserver = oldObserver;
  }
}

console.log("UI micro-interaction contracts: accessibility, touch, motion and feedback OK");
