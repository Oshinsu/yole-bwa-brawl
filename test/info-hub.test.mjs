import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { closeInfoHub, openInfoHub } from "../src/game/info-hub.js";

const root = new URL("../", import.meta.url);
const source = await readFile(new URL("src/game/info-hub.js", root), "utf8");

assert.equal(openInfoHub(), false, "the module stays inert when no DOM exists");
assert.equal(closeInfoHub(), false, "closing an unbuilt hub is harmless");

assert.match(source, /export function openInfoHub\(\)/);
assert.match(source, /export function closeInfoHub\(\)/);
assert.match(source, /aria-labelledby/);
assert.match(source, /aria-describedby/);
assert.match(source, /aria-modal/);
assert.match(source, /addEventListener\("cancel"/);
assert.match(source, /infoHubPreviousFocus/);

for (const phrase of [
  "une seule coque en bois",
  "pas de quille ni de gouvernail",
  "le patron dirige notamment à la pagaie",
  "bwa dressés",
  "ballast mobile",
  "une grande voile",
  "aucune traduction non sourcée",
  "Partager → Sur l’écran d’accueil",
  "première visite complète",
  "Le mode privé",
  "licence MIT",
  "SIL Open Font License",
  "Droits confirmés",
  "ni affilié, ni sponsorisé, ni approuvé"
]) assert.ok(source.includes(phrase), `missing information contract: ${phrase}`);

for (const href of [
  "https://ich.unesco.org/",
  "https://www.martinique.org/",
  "https://tourdesyoles.com/"
]) assert.ok(source.includes(href), `missing official source: ${href}`);

assert.match(source, /target:\s*"_blank"/);
assert.match(source, /rel:\s*"noopener noreferrer"/);
assert.doesNotMatch(
  source,
  /\.(?:innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write|eval\s*\(|new Function/,
  "all copy, including changing installation status, must use textContent or text nodes"
);
assert.match(source, /status\.textContent\s*=/);
assert.match(source, /doc\.createTextNode\(description\)/);

console.log("info hub tests: OK");
