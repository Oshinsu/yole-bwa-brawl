// La flotte : dix livrées, quatre yoles par course.
//
// ⚠️ CE QUE CE TEST DOIT PROUVER, ET POURQUOI CHAQUE POINT EXISTE.
//
// La livrée est le SEUL axe de variété entre les yoles — la coque est monotype
// et le restera (`hull-contract.test.mjs` la verrouille sur sept nombres). Une
// flotte qui se répète, ou qui change d'une relecture à l'autre, coûterait donc
// tout ce que cette passe apporte.
//
//   1. dix livrées complètes, aucune couleur de coque en double ;
//   2. le tirage est SANS REMISE : quatre yoles d'une course sont différentes ;
//   3. il est DÉTERMINISTE : même graine, même flotte — sinon une relecture
//      montrerait d'autres bateaux que la course enregistrée ;
//   4. le bateau du joueur garde l'index 0, que son garage recouvre ensuite ;
//   5. le matériel de pont existe et ne se pose que sur des emplacements connus.

import assert from "node:assert/strict";
import { YOLE_LIVERIES, fleetForSeed } from "../src/game/balance.js";
import { WOOD_FINISHES } from "../src/game/customization.js";

// ── 1. Le catalogue ──────────────────────────────────────────────────────────
assert.equal(YOLE_LIVERIES.length, 10, "la flotte doit compter dix livrées");

const CHAMPS = ["key", "name", "hull", "stripe", "accent", "wood", "sailMark", "sailTint", "jersey", "shorts", "props"];
const coques = new Set();
const cles = new Set();
for (const livree of YOLE_LIVERIES) {
  for (const champ of CHAMPS) {
    assert.ok(livree[champ] !== undefined, `livrée ${livree.key} : champ ${champ} manquant`);
  }
  assert.ok(!cles.has(livree.key), `clé de livrée en double : ${livree.key}`);
  cles.add(livree.key);
  // Deux coques de la même couleur seraient indiscernables à distance de course,
  // et le HUD leur donnerait la même pastille.
  assert.ok(!coques.has(livree.hull), `couleur de coque en double : ${livree.name}`);
  coques.add(livree.hull);
  assert.ok(livree.wood >= 0 && livree.wood < WOOD_FINISHES.length,
    `livrée ${livree.key} : finition de bois ${livree.wood} hors catalogue`);
  // L'atlas de voile est un 2×2 : au-delà de 3 le quadrant sort de la texture.
  assert.ok(livree.sailMark >= 0 && livree.sailMark <= 3,
    `livrée ${livree.key} : marque de voile ${livree.sailMark} hors de l'atlas 2×2`);
  // La bande de liston n'a d'intérêt que si elle TRANCHE sur la coque : c'est
  // elle qui distingue deux yoles de teinte voisine.
  const ecart = (a, b) => Math.abs(((a >> 16) & 255) - ((b >> 16) & 255))
    + Math.abs(((a >> 8) & 255) - ((b >> 8) & 255))
    + Math.abs((a & 255) - (b & 255));
  assert.ok(ecart(livree.hull, livree.stripe) > 90,
    `livrée ${livree.key} : bande de liston trop proche de la coque`);
}

// ── 5. Le matériel de pont ───────────────────────────────────────────────────
const EMPLACEMENTS = new Set(["arriere", "milieu", "avant", "proue"]);
const OBJETS = new Set(["coffre_yole", "bidon", "ecope", "glaciere", "sac_voile"]);
for (const livree of YOLE_LIVERIES) {
  assert.ok(Array.isArray(livree.props) && livree.props.length >= 2,
    `livrée ${livree.key} : au moins deux objets de pont`);
  const pris = new Set();
  for (const [objet, emplacement] of livree.props) {
    assert.ok(OBJETS.has(objet), `livrée ${livree.key} : objet inconnu « ${objet} »`);
    assert.ok(EMPLACEMENTS.has(emplacement), `livrée ${livree.key} : emplacement inconnu « ${emplacement} »`);
    // Deux objets au même endroit s'interpénètrent.
    assert.ok(!pris.has(emplacement), `livrée ${livree.key} : deux objets sur « ${emplacement} »`);
    pris.add(emplacement);
  }
}

// ── 2 et 4. Le tirage ────────────────────────────────────────────────────────
const GRAINES = [0x0b0a2026, 0x51d3c7, 0, 1, 0xffffffff, 42, 0x9e3779b1];
for (const graine of GRAINES) {
  const flotte = fleetForSeed(graine, 4);
  assert.equal(flotte.length, 4, `graine ${graine} : quatre yoles attendues`);
  assert.equal(flotte[0], 0, `graine ${graine} : le bateau du joueur garde la livrée d'origine`);
  assert.equal(new Set(flotte).size, 4, `graine ${graine} : deux yoles partagent une livrée`);
  for (const index of flotte) {
    assert.ok(Number.isInteger(index) && index >= 0 && index < YOLE_LIVERIES.length,
      `graine ${graine} : index de livrée ${index} hors catalogue`);
  }
}

// ── 3. Déterminisme ──────────────────────────────────────────────────────────
for (const graine of GRAINES) {
  assert.deepEqual(fleetForSeed(graine, 4), fleetForSeed(graine, 4),
    `graine ${graine} : deux tirages donnent des flottes différentes`);
}

// Et la graine change VRAIMENT la flotte : un tirage qui rendrait toujours la
// même chose passerait les trois contrats ci-dessus sans rien apporter.
const flottes = new Set(GRAINES.map((graine) => fleetForSeed(graine, 4).join("-")));
assert.ok(flottes.size >= 5,
  `sept graines ne produisent que ${flottes.size} flottes distinctes`);

// ── Bornes ───────────────────────────────────────────────────────────────────
// Plus de yoles que de livrées : on complète plutôt que de rendre un trou.
const trop = fleetForSeed(7, 14);
assert.equal(trop.length, 14, "une flotte plus grande que le catalogue doit être complétée");
assert.ok(trop.every((index) => Number.isInteger(index) && index >= 0 && index < YOLE_LIVERIES.length),
  "une flotte surdimensionnée a produit un index hors catalogue");
assert.equal(fleetForSeed(7, 0).length, 1,
  "un compte nul rend tout de même la livrée du joueur");

console.log(JSON.stringify({
  ok: true,
  livrees: YOLE_LIVERIES.length,
  coquesDistinctes: coques.size,
  flottesEchantillonnees: flottes.size,
  exemple: fleetForSeed(0x0b0a2026, 4).map((index) => YOLE_LIVERIES[index].name)
}, null, 2));
