// Forme de repos de la voile.
//
// ⚠️ CE QUE CE TEST PROTÈGE. La voile est la plus grande surface de la yole à
// l'écran, et c'était un rectangle parfaitement plat : tout le galbe venait de
// la déformation runtime, d'où une lecture de bâche. Trois formes de repos sont
// désormais cuites dans la géométrie — creux, rond de guindant, roach — et une
// répartition non uniforme des rangs met de la densité là où les texels sont
// serrés.
//
// La contrainte dure est ailleurs : `updateSail` réécrit ce maillage à CHAQUE
// FRAME pour quatre yoles. Toute croissance du nombre de sommets se paie en CPU
// tous les frames. Le test verrouille donc la topologie autant que la forme.

import assert from "node:assert/strict";
import * as THREE from "../vendor/three.module.min.js";
import { makeSailGeometry } from "../src/render/yole-visual.js";

const COLONNES = 8;
const RANGS = 12;
const geometry = makeSailGeometry(THREE, COLONNES, RANGS);
const positions = geometry.attributes.position.array;
const { paramU, paramV, basePositions, columns, rows } = geometry.userData;

const sommet = (rang, colonne) => {
  const index = (rang * (COLONNES + 1) + colonne) * 3;
  return { x: positions[index], y: positions[index + 1], z: positions[index + 2] };
};

// ── Topologie : le budget CPU de chaque frame ────────────────────────────────
assert.equal(columns, COLONNES, "colonnes non mémorisées");
assert.equal(rows, RANGS, "rangs non mémorisés");
assert.equal(positions.length / 3, (RANGS + 1) * (COLONNES + 1),
  "le nombre de sommets a changé : updateSail le repaie à chaque frame");
assert.equal(geometry.index.count / 3, RANGS * COLONNES * 2, "topologie de grille rompue");
assert.equal(basePositions.length, positions.length, "basePositions désynchronisé");
assert.ok(geometry.attributes.uv, "UV absents : l'atlas de voiles ne se poserait plus");

// ── Tables paramétriques lues par updateSail ─────────────────────────────────
assert.ok(paramV && paramU, "paramU/paramV absents : updateSail retomberait sur row/rows");
assert.equal(paramV.length, RANGS + 1);
assert.equal(paramU.length, COLONNES + 1);
assert.ok(Math.abs(paramV[0]) < 1e-6, "le premier rang doit être la bordure (v=0)");
assert.ok(Math.abs(paramV[RANGS] - 1) < 1e-6, "le dernier rang doit être la têtière (v=1)");
for (let rang = 1; rang <= RANGS; rang++) {
  assert.ok(paramV[rang] > paramV[rang - 1], `paramV non monotone au rang ${rang}`);
}

// ── Densité : plus de rangs vers la bordure ──────────────────────────────────
// C'est la raison d'être de la répartition non uniforme : la voile fait 3,65 m
// au point de bordure contre ~1,31 m à la têtière, soit 2,78 fois plus de
// texels à couvrir en bas.
const rangsBas = paramV.filter((v) => v < 0.5).length;
const rangsHaut = paramV.filter((v) => v >= 0.5).length;
assert.ok(rangsBas > rangsHaut,
  `densité non concentrée vers la bordure : ${rangsBas} rangs bas contre ${rangsHaut} hauts`);

// ── Corde : le rapport bordure/têtière qui motive tout ───────────────────────
const corde = (rang) => Math.abs(sommet(rang, 0).z - sommet(rang, COLONNES).z);
const cordeBordure = corde(0);
const cordeTetiere = corde(RANGS);
assert.ok(Math.abs(cordeBordure - 3.65) < 0.05,
  `corde au point de bordure ${cordeBordure.toFixed(3)} m, attendu 3,65 m`);
assert.ok(Math.abs(cordeTetiere - 1.314) < 0.05,
  `corde à la têtière ${cordeTetiere.toFixed(3)} m, attendu 1,314 m`);

// ── Hauteur : le gréement n'a pas bougé ──────────────────────────────────────
assert.ok(Math.abs(sommet(0, 0).y - 0.48) < 1e-5, "pied de mât déplacé");
assert.ok(Math.abs(sommet(RANGS, 0).y - 6.03) < 1e-5, "têtière déplacée");

// ── Creux : la voile n'est plus plate ────────────────────────────────────────
let creuxMaximal = 0;
for (let rang = 0; rang <= RANGS; rang++) {
  for (let colonne = 0; colonne <= COLONNES; colonne++) {
    creuxMaximal = Math.max(creuxMaximal, sommet(rang, colonne).x - 0.055);
  }
}
assert.ok(creuxMaximal > 0.05, `voile encore plate : creux maximal ${creuxMaximal.toFixed(4)} m`);
// Cumulé au ventre de vent maximal de updateSail (0,14 + 0,28 + 0,08 = 0,50),
// on doit rester sous 20 % de la corde — au-delà, une voile lit comme un sac.
const creuxTotalRelatif = (creuxMaximal + 0.50) / cordeBordure;
assert.ok(creuxTotalRelatif < 0.20,
  `creux cumulé ${(creuxTotalRelatif * 100).toFixed(1)} % de la corde : trop`);
// Le creux se referme vers la têtière, comme sur une voile réellement coupée.
const creuxRang = (rang) => Math.max(...Array.from({ length: COLONNES + 1 },
  (_, colonne) => sommet(rang, colonne).x - 0.055));
assert.ok(creuxRang(1) > creuxRang(RANGS - 1),
  "le creux ne s'efface pas vers la têtière");
// Point de creux maximal dans le premier tiers avant de la corde, pas au milieu.
let colonneCreuxMaximal = 0;
let meilleur = -Infinity;
for (let colonne = 0; colonne <= COLONNES; colonne++) {
  const valeur = sommet(1, colonne).x;
  if (valeur > meilleur) { meilleur = valeur; colonneCreuxMaximal = colonne; }
}
const positionCreux = paramU[colonneCreuxMaximal];
assert.ok(positionCreux > 0.2 && positionCreux < 0.55,
  `creux maximal à ${(positionCreux * 100).toFixed(0)} % de corde, attendu vers 40 %`);

// ── Rond de guindant : le bord d'attaque bombe ───────────────────────────────
const guindant = (rang) => sommet(rang, 0).z;
const guindantMilieu = guindant(Math.round(RANGS / 2));
const guindantDroit = (guindant(0) + guindant(RANGS)) / 2;
assert.ok(guindantMilieu < guindantDroit - 0.05,
  `guindant encore rectiligne : milieu ${guindantMilieu.toFixed(3)} vs corde ${guindantDroit.toFixed(3)}`);

// ── Roach : la chute déborde de la ligne têtière→bordure ─────────────────────
//
// ⚠️ CETTE MESURE ENGLOBE LE ROND DE GUINDANT, et c'est normal : la chute est
// posée à `guindant − corde`, donc elle hérite du bombé du bord d'attaque. Le
// débord total attendu à mi-hauteur vaut SAIL_ROACH + SAIL_LUFF_ROUND pondérés
// par l'arc, soit ~0,36 m et non les 0,22 m du seul roach. Ne pas lire ce
// chiffre comme la valeur de la constante.
const chute = (rang) => sommet(rang, COLONNES).z;
const rangMilieu = Math.round(RANGS / 2);
const interpole = chute(0) + (chute(RANGS) - chute(0)) * paramV[rangMilieu];
const debordChute = interpole - chute(rangMilieu);
assert.ok(debordChute > 0.05,
  `aucun roach : chute à mi-hauteur ${chute(rangMilieu).toFixed(3)}, ligne droite ${interpole.toFixed(3)}`);
// Le roach seul se retrouve en retirant la part de guindant à la même hauteur.
const roachSeul = debordChute - (guindantDroit - guindantMilieu);
assert.ok(roachSeul > 0.05,
  `le débord de chute ne vient que du guindant : roach net ${roachSeul.toFixed(3)} m`);

// ── Rien de dégénéré ─────────────────────────────────────────────────────────
for (let index = 0; index < positions.length; index++) {
  assert.ok(Number.isFinite(positions[index]), `position non finie à l'indice ${index}`);
}

console.log(JSON.stringify({
  ok: true,
  sommets: positions.length / 3,
  triangles: geometry.index.count / 3,
  cordeBordure: +cordeBordure.toFixed(3),
  cordeTetiere: +cordeTetiere.toFixed(3),
  rapportCordes: +(cordeBordure / cordeTetiere).toFixed(2),
  rangsBas,
  rangsHaut,
  creuxMaximalM: +creuxMaximal.toFixed(4),
  creuxPositionCorde: +positionCreux.toFixed(2),
  rondGuindantM: +(guindantDroit - guindantMilieu).toFixed(3),
  debordChuteTotalM: +debordChute.toFixed(3),
  roachNetM: +roachSeul.toFixed(3)
}, null, 2));
