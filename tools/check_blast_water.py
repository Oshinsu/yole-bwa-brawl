"""L'explosion deforme-t-elle VRAIMENT l'eau sous la coque ?

Les armes stampent la grille de sillage (`ocean.wake.burst`) et la physique lit
`sampleDisturbance` pour composer la hauteur d'eau a chaque point de flottaison.
La chaine existe donc sur le papier. Reste a savoir si elle produit quelque chose
de MESURABLE, ou si l'effet est noye sous l'impulsion directe de l'explosion.

Protocole : une yole a l'arret, deux explosions identiques a cote d'elle, la
premiere avec l'impulsion directe (`applyHit`) neutralisee. Ce qui reste est
exactement la contribution de l'EAU.

    PORT=8791 python tools/serve.py &
    python tools/check_blast_water.py
"""
from __future__ import annotations

import json
import os
import shutil

from playwright.sync_api import sync_playwright

URL = os.environ.get("YOLE_URL", "http://127.0.0.1:8791/index.html")
if "debug" not in URL:
    URL += ("&" if "?" in URL else "?") + "debug=1"

MESURE = """({ arme, neutraliserImpulsion, distance }) => {
  const game = window.__YOLE_DEBUG__.game;
  game.renderer.setAnimationLoop(null);
  const j = game.boats[0];
  const d = j.dynamics;

  // Yole au repos, a plat, loin de tout : seul l'effet mesure doit bouger.
  d.roll = 0; d.rollVel = 0; d.pitch = 0; d.pitchVel = 0;
  d.vx = 0; d.vz = 0; d.vy = 0;
  d.flooding.fill(0); d.updateWaterMass();
  d.structure.hull = 1;
  const brut = j.applyHit.bind(j);
  if (neutraliserImpulsion) j.applyHit = () => {};

  // On laisse l'eau se calmer avant de mesurer la reference.
  for (let i = 0; i < 60; i++) game.fixedUpdate(1 / 60);
  const avant = { roll: d.roll, rollVel: d.rollVel, y: d.y, vy: d.vy, pitchVel: d.pitchVel };

  // Explosion posee A COTE, pas dessus : on veut l'onde, pas le contact.
  const x = j.x + distance;
  const z = j.z;
  if (arme === 'mine') {
    game.ocean.wake.burst(x, z, 6.4, 1.62);
    game.ocean.wake.burst(x, z, 11.2, 1.18);
    game.ocean.wake.burst(x, z, 17.5, 0.82);
  } else {
    game.ocean.wake.burst(x, z, 7.4, 1.72);
    game.ocean.wake.burst(x, z, 11.5, 0.94);
  }

  let rollMax = 0, monteeMax = 0, vyMax = 0;
  for (let i = 0; i < 150; i++) {
    game.fixedUpdate(1 / 60);
    rollMax = Math.max(rollMax, Math.abs(d.roll - avant.roll));
    monteeMax = Math.max(monteeMax, Math.abs(d.y - avant.y));
    vyMax = Math.max(vyMax, Math.abs(d.vy));
  }
  j.applyHit = brut;
  return {
    arme,
    distance,
    impulsionNeutralisee: neutraliserImpulsion,
    rollMaxRad: +rollMax.toFixed(4),
    monteeMaxM: +monteeMax.toFixed(4),
    vitesseVerticaleMax: +vyMax.toFixed(4)
  };
}"""


def chromium():
    for nom in ("chrome", "chromium", "msedge", "google-chrome"):
        chemin = shutil.which(nom)
        if chemin:
            return chemin
    return None


def main():
    resultats = []
    with sync_playwright() as p:
        lancement = {
            "headless": True,
            "args": ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
        }
        exe = chromium()
        if exe:
            lancement["executable_path"] = exe
        navigateur = p.chromium.launch(**lancement)
        page = navigateur.new_page(viewport={"width": 900, "height": 600})
        erreurs = []
        page.on("pageerror", lambda e: erreurs.append(str(e)[:200]))
        page.goto(URL, wait_until="networkidle", timeout=60000)
        page.wait_for_function("Boolean(window.__YOLE_DEBUG__)", timeout=30000)
        page.evaluate("document.getElementById('playBtn').click()")
        page.wait_for_function("window.__YOLE_DEBUG__.getState().tick > 90", timeout=30000)
        page.wait_for_timeout(1000)

        for arme in ("mine", "coco"):
            for distance in (4.0, 9.0):
                resultats.append(page.evaluate(
                    MESURE, {"arme": arme, "neutraliserImpulsion": True, "distance": distance}
                ))
        navigateur.close()

    print(json.dumps({"resultats": resultats, "erreurs": erreurs[:4]}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
