// Les repères doivent SE VOIR (passe 81).
//
// Mesuré le 2 septembre 2026, avant : les cotes des bâtis étaient écrites en
// dur, réglées pour une île plate, alors que le morne du repère est tiré au
// hasard. Le phare de la Caravelle (21 m) était planté sous un morne de 46 m,
// la ville de Fort-de-France (9 m) sous un morne de 25 m, les mâts de
// Sainte-Anne (11 m) sous 13 m : trois repères sur huit ne rendaient aucun
// pixel. Ce contrat interdit que ça revienne.
import assert from "node:assert/strict";
import * as THREE from "../vendor/three.module.min.js";
import { ARENAS, ARENA_DISTANCE, TOUR_STAGES } from "../src/game/balance.js";
import { WorldStreamer } from "../src/render/world.js";

const world = new WorldStreamer(THREE, new THREE.Scene(), 0x7a11e);

const COTES = [
  ...TOUR_STAGES.map((stage, index) => ({
    label: `étape ${index + 1} · ${stage.slug}`,
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

/** Le rayon du point, en unités du morne : 1 = pied du relief. */
function rayonSurLeMorne(island, dx, dz) {
  const rotation = island.visualRotation || 0;
  const cosinus = Math.cos(rotation);
  const sinus = Math.sin(rotation);
  const localX = cosinus * dx - sinus * dz;
  const localZ = sinus * dx + cosinus * dz;
  return Math.hypot(localX / island.visualRx, localZ / island.visualRz);
}

let batisMesures = 0;
let reperesAvecBati = 0;
const lignes = [];

// On rejoue chaque côte sur plusieurs graines : le morne est aléatoire, et le
// défaut d'origine ne se voyait que sur les tirages hauts.
for (const cote of COTES) {
  for (let variante = 0; variante < 4; variante++) {
    const seed = (cote.seed + Math.imul(variante + 1, 0x27d4eb2d)) >>> 0;
    world.setStage(seed ^ 0x77ad, cote.palette, cote.environment, cote.distance);

    const iles = world.landmarkIslands.filter((ile) => ile.visualShape);
    const batis = world.landmarkRoot.children.filter((enfant) => enfant.isMesh);
    if (!batis.length) continue;
    if (variante === 0) reperesAvecBati++;

    let plusHaut = -Infinity;
    for (const bati of batis) {
      const hauteur = Math.abs(bati.scale.y);
      const sommet = bati.position.y + hauteur * 0.5;
      plusHaut = Math.max(plusHaut, sommet);

      // 1. Rien ne flotte ni ne se noie : tout bâti sort de l'eau.
      assert.ok(
        sommet > 1.5,
        `${cote.label} : un bâti culmine à ${sommet.toFixed(1)} m, sous la ligne d'eau`
      );

      // Un chapeau (lanterne, fanion) est posé sur un autre bâti, pas sur le sol.
      if (bati.userData.pose === "sommet") continue;

      const ile = iles.find((candidate) => rayonSurLeMorne(candidate, bati.position.x - candidate.x, bati.position.z - candidate.z) <= 1)
        ?? iles.find((candidate) => Math.hypot(
          (bati.position.x - candidate.x) / (candidate.sandRx || 1),
          (bati.position.z - candidate.z) / (candidate.sandRz || 1)
        ) <= 1);
      if (!ile) continue;
      batisMesures++;

      const dx = bati.position.x - ile.x;
      const dz = bati.position.z - ile.z;
      // Le MÊME sol que le moteur : lu sur le maillage, pas estimé.
      const sol = world.solDuRepere(ile, dx, dz);

      // 2. LE CONTRAT : au moins la moitié du bâti émerge du relief sur lequel
      //    il est posé. C'est exactement ce qui manquait.
      assert.ok(
        sommet - sol >= hauteur * 0.45,
        `${cote.label} : bâti de ${hauteur.toFixed(0)} m enterré dans un morne de `
        + `${ile.visualHeight.toFixed(0)} m — il n'en sort que ${(sommet - sol).toFixed(1)} m`
      );

      // 3. Et il ne flotte pas non plus au-dessus du sol.
      const base = bati.position.y - hauteur * 0.5;
      assert.ok(
        base - sol <= Math.max(0.5, hauteur * 0.06),
        `${cote.label} : bâti suspendu à ${(base - sol).toFixed(1)} m au-dessus du sol`
      );
    }

    // 4. Un repère se repère : son point le plus haut domine de 6 m.
    assert.ok(
      plusHaut >= 6,
      `${cote.label} : le repère culmine à ${plusHaut.toFixed(1)} m, invisible à 200 m`
    );
    if (variante === 0) lignes.push(`${cote.label.padEnd(34)} ${batis.length} bâtis, sommet ${plusHaut.toFixed(0)} m`);
  }
}

assert.ok(reperesAvecBati >= 10, `seulement ${reperesAvecBati} repères bâtis contrôlés`);
assert.ok(batisMesures >= 100, `seulement ${batisMesures} bâtis posés sur un morne contrôlés`);

for (const ligne of lignes) console.log(`  ${ligne}`);
console.log(`landmarks ok · ${COTES.length} côtes × 4 graines · ${batisMesures} bâtis mesurés sur leur morne`);
