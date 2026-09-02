// Jambes de l'équipage : la règle de pose par poste, et son autorité.
//
// La mesure sur le GLB livré vit dans tools/mesure_jambes_equipage.mjs (mode
// --strict dans npm run test:crew). Ici on verrouille la GRAMMAIRE, lisible
// sans rig : à bord on est assis, en traversée on marche, au rappel les jambes
// sont tendues vers le bas ou vers le bateau selon le poste — jamais une
// quatrième pose.
import assert from "node:assert/strict";

import {
  CREW_LEG_POSES,
  CREW_RAIL_X,
  CREW_TRACTION_DROP,
  CREW_SEAT_LIFT,
  crewLegAuthority,
  crewLegPoseFor,
  crewSeatOffsetForHike
} from "../src/render/yole-visual.js";

assert.deepEqual(CREW_LEG_POSES, ["repos", "pont", "bas", "bateau"]);
assert.ok(CREW_RAIL_X > 0.85 && CREW_RAIL_X < 0.95, `plat-bord visible attendu vers 0,91 m, lu ${CREW_RAIL_X}`);

// Le bassin reste posé SUR le bois à toute sortie : plus de traction dessous.
assert.equal(CREW_TRACTION_DROP, 0);
assert.equal(crewSeatOffsetForHike(0), CREW_SEAT_LIFT);
assert.equal(crewSeatOffsetForHike(1), CREW_SEAT_LIFT);
assert.equal(crewSeatOffsetForHike(NaN), CREW_SEAT_LIFT);

// Autorité : nulle à l'assise, pleine franchement sorti, bornée.
assert.equal(crewLegAuthority(0), 0);
assert.equal(crewLegAuthority(0.22), 0);
assert.ok(Math.abs(crewLegAuthority(0.33) - 0.5) < 1e-9);
assert.equal(crewLegAuthority(0.44), 1);
assert.equal(crewLegAuthority(2), 1);
assert.equal(crewLegAuthority(undefined), 0);

// La traversée gagne sur tout.
assert.equal(crewLegPoseFor({ family: "levier", hike: 1, x: 3, transferCrouch: 0.8 }), "pont");
assert.equal(crewLegPoseFor({ family: "ancrage", hike: 0.1, x: 0.5, transferCrouch: 0.5 }), "pont");

// À bord, ou juste au plat-bord : assis, quelle que soit la famille.
for (const family of ["ancrage", "levier", "extension"]) {
  assert.equal(crewLegPoseFor({ family, hike: 0.1, x: 0.3 }), "repos", family);
  assert.equal(crewLegPoseFor({ family, hike: 0.5, x: CREW_RAIL_X + 0.1 }), "repos", `${family} encore au bord`);
}

// Au rappel : les ancrages vers le bateau, les leviers vers le bas, l'homme du
// bout pend puis s'allonge le long du bois à pleine sortie.
assert.equal(crewLegPoseFor({ family: "ancrage", hike: 0.6, x: 1.8 }), "bateau");
assert.equal(crewLegPoseFor({ family: "ancrage", hike: 0.7, x: -2.1 }), "bateau", "le bord ne change rien");
assert.equal(crewLegPoseFor({ family: "levier", hike: 0.6, x: 1.8 }), "bas");
assert.equal(crewLegPoseFor({ family: "levier", hike: 1, x: 3.1 }), "bas");
assert.equal(crewLegPoseFor({ family: "extension", hike: 0.6, x: 1.8 }), "bas");
assert.equal(crewLegPoseFor({ family: "extension", hike: 0.9, x: 3.2 }), "bateau");
assert.equal(crewLegPoseFor({}), "repos", "sans rien, on est assis");
assert.equal(crewLegPoseFor({ family: "inconnue", hike: 0.8, x: 2.4 }), "bas", "une famille inconnue pend, elle ne plante pas");

// Toute pose rendue est l'une des quatre.
for (const family of ["ancrage", "levier", "extension"]) {
  for (let hike = 0; hike <= 1.0001; hike += 0.05) {
    for (const x of [0.2, 0.9, 1.3, 2.0, 2.9, 3.5]) {
      assert.ok(CREW_LEG_POSES.includes(crewLegPoseFor({ family, hike, x })));
    }
  }
}

console.log("crew legs: OK");
