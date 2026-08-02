// Sonde de raideur de redressement. Deterministe, sans rendu.
//
// ⚠️ POURQUOI ELLE EXISTE. Le 2 aout 2026, les stations de flottabilite ont ete
// retrecies pour coller a la coque visible (elles debordaient de 18 cm). Le bras
// de levier du couple de redressement EST la demi-largeur de station
// (`rollTorque += localX * force`, src/sim/yole-physics.js) : retrecir la coque
// rend forcement la yole moins raide. Annoncer "c'est aligne" sans chiffrer ce
// que le joueur perd en stabilite n'aurait rien voulu dire.
//
//   node tools/probe_roll_stability.mjs
//
// Sort un JSON. Comparer deux passes AVANT/APRES un changement de HULL_STATIONS.
//
// ⚠️ ON NE PILOTE PAS `crewTargets` A LA MAIN : `updateCrew` les remet a zero
// tant qu'aucun shift n'est en cours. Le rappel d'equipage se declenche par
// `triggerShift()`, et c'est ce que fait le cas dedie.

import { WaveField } from "../src/sim/waves.js";
import { YoleDynamics } from "../src/sim/yole-physics.js";
import { SIMULATION_VERSION } from "../src/sim/replay.js";

const PAS = 1 / 60;
const DEG = (radians) => +(radians * 180 / Math.PI).toFixed(2);

// ⚠️ LES NOMS DE CHAMPS COMPTENT, ET UNE ERREUR ICI EST SILENCIEUSE.
// La physique lit `windX` / `windZ` / `waveScratch` / `coastPenalty`. Une
// premiere version de cette sonde passait `wind: {x, z}` : les `undefined`
// propageaient un NaN jusqu'a `this.roll`, que `finite()` ramenait a 0. La
// mesure rendait donc « gite nulle en toutes circonstances », ce qui ressemble
// a un resultat plausible et n'en est pas un. Copier la forme utilisee par
// test/boost-dynamics.test.mjs, pas l'inventer.
function environnement() {
  return {
    time: 0,
    windX: 3.2,
    windZ: 15.2,
    coastPenalty: 0,
    waveScratch: {},
    pointScratch: {},
    centerScratch: {},
    sampleDisturbance: () => 0
  };
}

function simule({ gite, meteo = 0.2, shift = false, secondes = 8 }) {
  const waves = new WaveField();
  waves.setWeather(meteo);
  const boat = new YoleDynamics(7, waves);
  boat.reset(0, 0, 0, 14);
  boat.roll = gite;
  boat.rollVel = 0;
  boat.setRig(1, 1, 1);
  if (shift) boat.triggerShift();

  const env = environnement();
  const input = { steer: 0, trim: 0.82 };
  const roulis = [];
  let chavire = false;
  let instantChavirage = null;
  // Temps mis a revenir sous 20 deg : la mesure la plus lisible de la raideur.
  let retourSous20 = null;

  const total = Math.round(secondes / PAS);
  for (let pas = 0; pas < total; pas++) {
    env.time = pas * PAS;
    boat.fixedStep(PAS, input, env);
    const amplitude = Math.abs(boat.roll);
    roulis.push(amplitude);
    if (retourSous20 === null && amplitude < 0.349) retourSous20 = +(pas * PAS).toFixed(2);
    if (!chavire && (boat.capsized || amplitude > 1.35)) {
      chavire = true;
      instantChavirage = +(pas * PAS).toFixed(2);
    }
  }

  const trie = [...roulis].sort((a, b) => a - b);
  return {
    giteInitialeDeg: DEG(gite),
    giteMedianeDeg: DEG(trie[Math.floor(trie.length / 2)]),
    giteMaxDeg: DEG(trie[trie.length - 1]),
    giteFinaleDeg: DEG(roulis[roulis.length - 1]),
    retourSous20Deg: retourSous20,
    chavire,
    instantChavirage
  };
}

const cas = {
  "depart a plat": { gite: 0 },
  "gitee 20 deg": { gite: 0.349 },
  "gitee 40 deg": { gite: 0.698 },
  "gitee 60 deg": { gite: 1.047 },
  "gitee 40 deg + contre-gite": { gite: 0.698, shift: true },
  "grain, gitee 40 deg": { gite: 0.698, meteo: 0.85 }
};

const resultats = {};
for (const [nom, parametres] of Object.entries(cas)) resultats[nom] = simule(parametres);

console.log(JSON.stringify({ simulationVersion: SIMULATION_VERSION, cas: resultats }, null, 2));
