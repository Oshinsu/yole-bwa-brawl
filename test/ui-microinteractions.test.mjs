import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ACTION_WAVE } from "../src/game/balance.js";
import { InputSystems } from "../src/game/input.js";

const root = new URL("../", import.meta.url);
const [html, css, hudSource, inputSource] = await Promise.all([
  readFile(new URL("index.html", root), "utf8"),
  readFile(new URL("style.css", root), "utf8"),
  readFile(new URL("src/game/hud.js", root), "utf8"),
  readFile(new URL("src/game/input.js", root), "utf8")
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

for (const state of [
  "round-cue",
  "charge-gained",
  "ready-cue",
  "resource-low",
  "aim-enter-cue",
  "target-cue",
  "p1-leading",
  "score-cue",
  "status-critical"
]) assert.ok(hudSource.includes(`"${state}"`), `HUD must drive ${state}`);
assert.match(hudSource, /toggleSetting|hapticsLevel/);
assert.match(hudSource, /\[1,\s*0\.5,\s*0\]/);
assert.match(inputSource, /toggleSetting\("haptics",\s*\[1,\s*0\.5,\s*0\]\)/);
assert.match(inputSource, /lostpointercapture/);
assert.match(inputSource, /trapDialogFocus/);
assert.match(inputSource, /focusWhenDialogOpens/);
assert.match(inputSource, /aria-pressed/);
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
    focus: () => { firstFocused++; }
  };
  const last = { hidden: false, getAttribute: () => null, focus() {} };
  const oldDocument = globalThis.document;
  globalThis.document = { activeElement: last };
  const context = {
    ui: {
      versusScreen: {
        classList: makeClassList(),
        querySelectorAll: () => [first, last]
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
