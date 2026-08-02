// Verrou du GLB de coque REELLEMENT LIVRE au joueur.
//
// ⚠️ POURQUOI CE TEST EXISTE. `crew-seating.test.mjs` mesure bien un ratio de
// coque — mais en Node il n'y a pas de GLTFLoader, donc `assets.get("hull")`
// rend null et le test mesure la coque PROCEDURALE de repli. Le fichier qui
// part chez les joueurs n'etait verifie par rien.
//
// ⚠️ CE QUE `fit_hull_glb.py` NE VOIT PAS. Il normalise la BOITE ENGLOBANTE
// (longueur, demi-largeur, profondeur, origine). La forme interieure passe
// telle quelle : une carene peut deriver de 50 cm sans qu'aucun outil ne bronche.
//
// On decode le GLB a la main : pas de dependance, et le test tourne partout.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const racine = new URL('../', import.meta.url);
const chemin = fileURLToPath(new URL('assets/models/yole_hull.glb', racine));

// ── Decodage GLB minimal ─────────────────────────────────────────────────────
const COMPOSANTS = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const CARDINAL = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function lireGlb(fichier) {
  const octets = readFileSync(fichier);
  assert.equal(octets.readUInt32LE(0), 0x46546c67, 'entete glTF absente');
  const total = octets.readUInt32LE(8);
  let curseur = 12;
  let json = null;
  let binaire = null;
  while (curseur < total) {
    const longueur = octets.readUInt32LE(curseur);
    const type = octets.readUInt32LE(curseur + 4);
    const morceau = octets.subarray(curseur + 8, curseur + 8 + longueur);
    if (type === 0x4e4f534a) json = JSON.parse(morceau.toString('utf8'));
    else if (type === 0x004e4942) binaire = morceau;
    curseur += 8 + longueur;
  }
  return { json, binaire };
}

function lirePositions({ json, binaire }) {
  const primitive = json.meshes[0].primitives[0];
  const accesseur = json.accessors[primitive.attributes.POSITION];
  assert.equal(accesseur.componentType, 5126, 'positions non flottantes');
  const vue = json.bufferViews[accesseur.bufferView];
  const cardinal = CARDINAL[accesseur.type];
  const pas = vue.byteStride || COMPOSANTS[accesseur.componentType] * cardinal;
  const base = (vue.byteOffset ?? 0) + (accesseur.byteOffset ?? 0);
  const sortie = new Float32Array(accesseur.count * 3);
  for (let index = 0; index < accesseur.count; index++) {
    const decalage = base + index * pas;
    sortie[index * 3] = binaire.readFloatLE(decalage);
    sortie[index * 3 + 1] = binaire.readFloatLE(decalage + 4);
    sortie[index * 3 + 2] = binaire.readFloatLE(decalage + 8);
  }
  return sortie;
}

const glb = lireGlb(chemin);
const positions = lirePositions(glb);
const sommets = positions.length / 3;

// ── Enveloppe : STRICTE ──────────────────────────────────────────────────────
// C'est la seule partie du contrat qui engage autre chose que l'oeil. La coque
// doit occuper la place que la camera, les capsules de collision et les
// stations de flottabilite lui supposent.
let xMin = Infinity, xMax = -Infinity;
let yMin = Infinity, yMax = -Infinity;
let zMin = Infinity, zMax = -Infinity;
for (let index = 0; index < positions.length; index += 3) {
  xMin = Math.min(xMin, positions[index]); xMax = Math.max(xMax, positions[index]);
  yMin = Math.min(yMin, positions[index + 1]); yMax = Math.max(yMax, positions[index + 1]);
  zMin = Math.min(zMin, positions[index + 2]); zMax = Math.max(zMax, positions[index + 2]);
}

const longueur = zMax - zMin;
const demiLargeur = Math.max(xMax, -xMin);
const platBord = yMax;
const profondeur = platBord - yMin;

assert.ok(Math.abs(longueur - 11.10) < 0.11,
  `longueur hors tout ${longueur.toFixed(3)} m, contrat 11,10 m`);
assert.ok(Math.abs(platBord - 0.04) < 0.01,
  `plat-bord a y=${platBord.toFixed(3)}, contrat +0,04 m`);
assert.ok(profondeur <= 0.63,
  `coque plus profonde que le contrat : ${profondeur.toFixed(3)} m > 0,62 m`);
assert.ok(Math.abs(zMin + zMax) < 0.05,
  `origine hors du centre de flottaison : milieu a z=${((zMin + zMax) / 2).toFixed(3)}`);

// ── Le piege du facteur de largeur ───────────────────────────────────────────
// ⚠️ LIRE AVANT DE "CORRIGER" LA COQUE DANS BLENDER.
//
// Le ratio longueur/largeur vu a l'ecran est 6,12. Celui du MESH est 5,14 :
// l'ecart vient de `HULL_VISUAL_WIDTH_SCALE = 0.84` applique au runtime
// (src/render/yole-visual.js). Un artiste qui ouvre le GLB voit donc un canot,
// et s'il l'affine lui-meme pour atteindre 6,12 le runtime retrecira une
// seconde fois : ratio 7,3, une aiguille.
//
// Ce test refuse une coque deja pre-retrecie. C'est le seul garde-fou : rien
// dans le format GLB ne peut porter cette information.
const HULL_VISUAL_WIDTH_SCALE = 0.84;
const ratioMesh = longueur / (demiLargeur * 2);
const ratioEcran = longueur / (demiLargeur * 2 * HULL_VISUAL_WIDTH_SCALE);

assert.ok(Math.abs(demiLargeur - 1.08) < 0.02,
  `demi-largeur ${demiLargeur.toFixed(3)} m, contrat 1,08 m. Si elle vaut ~0,91, `
  + `la coque a ete pre-retrecie de 0,84 : le runtime le refera une seconde fois.`);
assert.ok(ratioMesh > 5.0 && ratioMesh < 5.3,
  `ratio du MESH ${ratioMesh.toFixed(2)} hors de [5,0 ; 5,3]`);
assert.ok(ratioEcran > 6.0,
  `ratio a l'ecran ${ratioEcran.toFixed(2)} : coque trop large une fois affichee`);

// ── Divergence mesuree entre les TROIS tables de coque du projet ─────────────
// Elles existent bel et bien, et elles ne sont pas d'accord :
//   1. `HULL_STATIONS`  (src/sim/yole-physics.js)   — 8 stations, AUTORITAIRE
//   2. `SECTION_Z/WIDTH` (contrat + yole-visual.js) — 9 sections, le gabarit
//   3. le GLB livre                                  — sculpte, tonture libre
//
// La physique ne lit JAMAIS le mesh : elle flotte sur ses propres points. Une
// coque hors gabarit ne peut donc pas "desaccorder la physique" — le contrat
// se trompait sur ce point. En revanche les points de flottabilite tombent
// aujourd'hui HORS de la coque visible, jusqu'a 18 cm au maitre-bau.
//
// CORRIGE LE 2 AOUT 2026 sur decision du proprietaire : les stations ont ete
// recalees sur la coque visible et SIMULATION_VERSION est passe a 4.0.0, ce qui
// refuse les replays anterieurs plutot que de les rejouer faux. Le debord
// residuel est desormais de l'ordre du centimetre, et ce test l'y maintient.
//
// ⚠️ IMPORTEE, PAS RECOPIEE. Une premiere version de ce test portait sa propre
// copie de la table — le defaut exact qu'il denonce. Elle a menti des la
// premiere correction : le test annoncait toujours 18 cm de debord alors que la
// physique etait deja recalee. Une seule source de verite, ou rien.
const { HULL_STATIONS } = await import('../src/sim/yole-physics.js');

function demiLargeurA(z, tolerance = 0.20) {
  let maximum = 0;
  let trouve = false;
  for (let index = 0; index < positions.length; index += 3) {
    if (Math.abs(positions[index + 2] - z) >= tolerance) continue;
    maximum = Math.max(maximum, Math.abs(positions[index]));
    trouve = true;
  }
  return trouve ? maximum : null;
}

let debordMaximal = 0;
let stationDebord = null;
for (const station of HULL_STATIONS) {
  const brut = demiLargeurA(station.z);
  if (brut === null) continue;
  const visible = brut * HULL_VISUAL_WIDTH_SCALE;
  const debord = station.width - visible;
  if (debord > debordMaximal) { debordMaximal = debord; stationDebord = station.z; }
}

// Etait 18,0 cm avant recalage ; le seuil est desormais serre a 2 cm, c'est-a-
// dire la tolerance d'echantillonnage de `demiLargeurA` (±0,20 m en z sur une
// coque qui s'affine). Tout retour vers l'ancien ecart fait echouer le build.
assert.ok(debordMaximal <= 0.02,
  `les points de flottabilite debordent de ${(debordMaximal * 100).toFixed(1)} cm `
  + `hors de la coque visible (station z=${stationDebord}). Seuil 2 cm. `
  + `Si HULL_STATIONS vient de bouger, SIMULATION_VERSION doit bouger aussi.`);

// ── Sante du maillage ────────────────────────────────────────────────────────
assert.equal(glb.json.meshes.length, 1, 'le chargeur ne prend QUE le premier mesh');
assert.equal(glb.json.meshes[0].primitives.length, 1, 'primitives multiples : pieces perdues');
assert.ok(!glb.json.materials?.length,
  'le GLB embarque un materiau : le jeu fournit le sien, il serait ignore');
assert.ok(glb.json.meshes[0].primitives[0].attributes.TEXCOORD_0 !== undefined,
  'UV absents : hull_paint.webp ne pourrait pas se poser');
assert.ok(Number.isFinite(positions[0]), 'positions non finies');

const triangles = glb.json.accessors[glb.json.meshes[0].primitives[0].indices].count / 3;
assert.ok(triangles < 6000, `coque a ${triangles} triangles : budget mobile depasse`);

console.log(JSON.stringify({
  ok: true,
  sommets,
  triangles,
  longueur: +longueur.toFixed(3),
  demiLargeur: +demiLargeur.toFixed(3),
  platBord: +platBord.toFixed(3),
  profondeur: +profondeur.toFixed(3),
  ratioMesh: +ratioMesh.toFixed(2),
  ratioEcran: +ratioEcran.toFixed(2),
  debordFlottabiliteCm: +(debordMaximal * 100).toFixed(1),
  stationDebord
}, null, 2));
