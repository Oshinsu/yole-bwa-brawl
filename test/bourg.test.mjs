// Le bourg : cases créoles, gommiers et pontons semés sur les îlots (passe 83).
//
// LE CONTRAT CENTRAL : tout se pose DANS l'enveloppe de plage de l'îlot, que la
// physique traite déjà comme de la terre. Aucun collider n'est ajouté, donc rien
// ne doit dépasser là où une yole peut passer — sinon on verrait une coque
// traverser un ponton.
import assert from "node:assert/strict";
import * as THREE from "../vendor/three.module.min.js";
import { ARENAS, ARENA_DISTANCE, TOUR_STAGES } from "../src/game/balance.js";
import {
  WorldStreamer,
  distanceToIslandCollider,
  routeCenter
} from "../src/render/world.js";

// Sans GLB (Node n'a pas de chargeur), le semis est calculé quand même : la
// suite de tirages ne dépend pas de la présence d'un modèle.
const world = new WorldStreamer(THREE, new THREE.Scene(), 0x7a11e);
assert.equal(world.bourgGabarits(), null, "sans assets, aucun gabarit — et pourtant le semis doit tourner");

const COTES = [
  ...TOUR_STAGES.map((stage, index) => ({
    label: `étape ${index + 1}`,
    palette: stage.palette,
    environment: stage.environment,
    distance: stage.distance,
    seed: (0x91ab + Math.imul(index + 1, 0x9e3779b9)) >>> 0
  })),
  ...ARENAS.map((arena, index) => ({
    label: `arène ${arena.slug}`,
    palette: arena.palette,
    environment: arena.environment,
    distance: ARENA_DISTANCE,
    seed: (0x0b0a2026 + Math.imul(index + 3, 0x85ebca6b)) >>> 0
  }))
];

const FAMILLES = ["cases", "gommiers", "pontons"];
let pieces = 0;
let hameaux = 0;
let pireDebord = -Infinity;
let plusProcheDeLAxe = Infinity;

for (const cote of COTES) {
  for (let variante = 0; variante < 3; variante++) {
    const seed = (cote.seed + Math.imul(variante + 1, 0x27d4eb2d)) >>> 0;
    world.setStage(seed ^ 0x77ad, cote.palette, cote.environment, cote.distance);

    const iles = new Set();
    for (const chunk of world.chunks) {
      for (const famille of FAMILLES) {
        for (const piece of chunk.bourg[famille]) {
          pieces++;
          iles.add(piece.ile);

          // 1. L'îlot d'accueil est bien un îlot du tronçon.
          assert.ok(chunk.islands.includes(piece.ile), `${cote.label} : pièce rattachée à un îlot inconnu`);

          // 2. LE CONTRAT : la pièce ENTIÈRE tient dans l'enveloppe de collision
          //    de l'îlot. `distance` est négative à l'intérieur ; on y ajoute la
          //    demi-emprise du modèle pour tester son bord, pas son centre.
          const contact = distanceToIslandCollider(piece.ile, piece.x, piece.z, {});
          const debord = contact.distance + piece.emprise;
          pireDebord = Math.max(pireDebord, debord);
          assert.ok(
            debord <= 0,
            `${cote.label} : ${famille.slice(0, -1)} déborde de ${debord.toFixed(2)} m hors de la plage`
          );

          // 3. Rien ne se noie : tout est au-dessus de la flottaison.
          assert.ok(
            piece.y > -0.4,
            `${cote.label} : ${famille.slice(0, -1)} sous l'eau à ${piece.y.toFixed(2)} m`
          );

          // 4. Et rien ne s'installe sur l'axe de course.
          const ecart = Math.abs(piece.x - routeCenter(piece.z));
          plusProcheDeLAxe = Math.min(plusProcheDeLAxe, ecart);
          assert.ok(ecart > 25, `${cote.label} : ${famille.slice(0, -1)} à ${ecart.toFixed(1)} m de l'axe de course`);

          assert.ok(Number.isFinite(piece.rotation) && piece.scale > 0.5 && piece.scale < 1.5);
        }
      }
    }
    hameaux += iles.size;

    // 5. Un ponton ne va jamais sans son gommier : ils sont posés ensemble.
    const pontons = world.chunks.reduce((n, c) => n + c.bourg.pontons.length, 0);
    const gommiers = world.chunks.reduce((n, c) => n + c.bourg.gommiers.length, 0);
    assert.equal(pontons, gommiers, `${cote.label} : ${pontons} pontons pour ${gommiers} gommiers`);
  }
}

assert.ok(pieces > 200, `semis trop maigre : ${pieces} pièces sur ${COTES.length} côtes`);
assert.ok(hameaux > 60, `trop peu d'îlots habités : ${hameaux}`);

// 6. Le semis est déterministe et n'a pas déplacé le décor existant : deux
//    constructions de la même côte donnent le même bourg.
world.setStage(0x0b0a2026 ^ 0x77ad, ARENAS[0].palette, ARENAS[0].environment, ARENA_DISTANCE);
const premier = world.chunks.map((c) => c.bourg.cases.map((p) => [p.x, p.y, p.z, p.rotation]));
world.setStage(0x0b0a2026 ^ 0x77ad, ARENAS[0].palette, ARENAS[0].environment, ARENA_DISTANCE);
const second = world.chunks.map((c) => c.bourg.cases.map((p) => [p.x, p.y, p.z, p.rotation]));
assert.deepEqual(second, premier, "le semis du bourg doit être déterministe");

console.log(
  `bourg ok · ${pieces} pièces sur ${COTES.length} côtes × 3 graines · ${hameaux} îlots habités · `
  + `débord maximal ${pireDebord.toFixed(2)} m · au plus près de l'axe ${plusProcheDeLAxe.toFixed(0)} m`
);
