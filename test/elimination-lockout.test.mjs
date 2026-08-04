import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BALANCE, ACTION_BOOST_FORWARD } from "../src/game/balance.js";
import { InputSystems } from "../src/game/input.js";
import { MatchDirector } from "../src/game/match.js";
import { VersusSystems, versusCameraFrame } from "../src/game/versus.js";
import { GAMEPLAY_VERSION } from "../src/sim/replay.js";

assert.equal(BALANCE.respawn, undefined, "l'équilibrage ne doit plus exposer de repêchage");
assert.equal(MatchDirector.respawn, undefined, "le directeur ne doit plus pouvoir remettre une yole à flot");
assert.equal(MatchDirector.updateRespawns, undefined, "aucune boucle cachée de repêchage ne doit subsister");
assert.equal(InputSystems.useRevenge, undefined, "un joueur éliminé ne doit plus agir via une vengeance");
assert.equal(ACTION_BOOST_FORWARD, 32, "le bit 16 retiré reste réservé pour ne pas décaler les replays");

{
  const victim = { name: "J1", eliminated: true, score: 0 };
  const survivor = { name: "KALBASS", eliminated: false, score: 0 };
  const rivalTwo = { name: "KOLIBRI", eliminated: false, score: 0 };
  const rivalThree = { name: "TI-MOUN", eliminated: false, score: 0 };
  let rescueCalls = 0;
  let resetCalls = 0;
  const game = {
    tour: null,
    roundEnding: 0,
    roundTime: 0,
    round: 1,
    boats: [victim, survivor, rivalTwo, rivalThree],
    collectAlive() { return this.boats.filter((boat) => !boat.eliminated); },
    showMessage() {},
    respawn() { rescueCalls++; },
    endMatch() {
      assert.fail("aucun bateau n'a encore atteint le score cible");
    }
  };
  Object.assign(game, MatchDirector);
  game.resetRound = () => {
    resetCalls++;
    for (const boat of game.boats) boat.eliminated = false;
  };
  // Quinze secondes dépassent largement l'ancien repêchage à 8,5 secondes.
  for (let tick = 0; tick < 15 * 60; tick++) game.updateRound(1 / 60);
  assert.equal(victim.eliminated, true, "la victime doit rester éliminée pendant la manche");
  assert.equal(rescueCalls, 0, "aucun repêchage ne doit être invoqué");
  assert.equal(resetCalls, 0, "la manche continue tant qu'au moins deux rivaux survivent");
  assert.equal(game.roundEnding, 0);

  rivalTwo.eliminated = true;
  rivalThree.eliminated = true;
  game.updateRound(1 / 60);
  assert.equal(survivor.score, 2, "le dernier survivant reçoit les points de manche");
  assert.ok(game.roundEnding > 0, "la fin de manche doit démarrer au dernier survivant");
  assert.equal(victim.eliminated, true, "la victime reste éliminée pendant le délai de résultat");

  game.updateRound(3);
  assert.equal(resetCalls, 1, "seule la manche suivante remet les yoles en jeu");
  assert.equal(victim.eliminated, false);
}

{
  const dead = { x: -40, y: 0, z: 10, eliminated: true, dynamics: { heading: -1 } };
  const alive = { x: 28, y: 2, z: 90, eliminated: false, dynamics: { heading: 0.4 } };
  const frame = versusCameraFrame(dead, alive);
  assert.deepEqual(
    { x: frame.x, y: frame.y, z: frame.z, separation: frame.separation, heading: frame.heading },
    { x: 28, y: 2, z: 90, separation: 0, heading: 0.4 },
    "la caméra Mêlée doit abandonner l'épave et cadrer le pilote encore actif"
  );
}

{
  const classList = { toggle() {} };
  const p1Status = {};
  const p2Status = {};
  VersusSystems.updateVersusHud.call({
    mode: "playing",
    versusLocal: true,
    boats: [{ eliminated: true }, { eliminated: true }],
    ui: {
      versusHud: { classList },
      versusP1Status: p1Status,
      versusP2Status: p2Status
    }
  });
  assert.equal(p1Status.textContent, "ÉLIMINÉ · SPECTATEUR");
  assert.equal(p2Status.textContent, "ÉLIMINÉ · SPECTATEUR");
}

const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const legacyAnchor = /<button\b[^>]*\bid="revengeBtn"[^>]*><\/button>/.exec(indexHtml)?.[0] ?? "";
assert.ok(legacyAnchor, "l'ancien JS PWA doit encore trouver son ancre revengeBtn");
for (const contract of [
  /\bhidden\b/,
  /\binert\b/,
  /\bdisabled\b/,
  /\baria-hidden="true"/,
  /\btabindex="-1"/,
  /\bdata-legacy-cache-anchor\b/
]) {
  assert.match(legacyAnchor, contract, "l'ancre de compatibilité doit rester cachée, inerte et non focalisable");
}
assert.equal((indexHtml.match(/\bid="revengeBtn"/g) ?? []).length, 1, "une seule ancre historique doit exister");
assert.doesNotMatch(indexHtml, /Frappe de Sable/i, "aucune action post-mort ne doit rester dans l'UI");

const singleFile = readFileSync(
  new URL("../YOLE_BWA_BRAWL_TROPICAL_MAYHEM_V3_2_SINGLE_FILE_ONLINE.html", import.meta.url),
  "utf8"
);
assert.doesNotMatch(
  singleFile,
  /updateRespawns|BALANCE\.respawn|ACTION_REVENGE|Frappe de Sable/i,
  "le monofichier livré ne doit pas conserver l'ancien repêchage"
);
assert.match(
  singleFile,
  /<button\b[^>]*\bid="revengeBtn"[^>]*\bhidden\b[^>]*\binert\b[^>]*\bdisabled\b[^>]*><\/button>/,
  "le monofichier doit conserver l'ancre PWA cachée sans restaurer l'action"
);
assert.ok(
  singleFile.includes(GAMEPLAY_VERSION),
  "le monofichier livré doit porter la version de gameplay courante"
);

console.log("elimination lockout: no rescue, no post-mort action, spectator camera and next-round reset OK");
