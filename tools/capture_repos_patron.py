"""Captures ciblées : équipage au repos (roll ~ 0) et ordre du patron.

Variante de tools/capture_crew_pose.py, pour les états que ce harnais ne
couvre pas (il force une gîte franche). Sorties dans previews/equipage/ avec
le préfixe `repos_` / `ordre_`, comme les captures historiques.

    PORT=8791 python tools/serve.py &
    python tools/capture_repos_patron.py
"""
from __future__ import annotations

import json
import os
import shutil
from pathlib import Path

from playwright.sync_api import sync_playwright

SORTIE = Path(__file__).resolve().parent.parent / "previews" / "equipage"
URL = os.environ.get("YOLE_URL", "http://127.0.0.1:8791/index.html")
if "debug" not in URL:
    URL += ("&" if "?" in URL else "?") + "debug=1"

SETUP = """() => {
  const game = window.__YOLE_DEBUG__.game;
  game.paused = true;
  game.renderer.setAnimationLoop(null);
  const boat = game.boats[0];
  return Boolean(boat?.visual);
}"""

# Repos : gîte nulle, équipage au plat-bord au vent (côté négatif, comme le
# ferait une gîte positive convergée puis relâchée). On laisse la logique de
# jeu placer les hommes : on impose juste la gîte et on converge.
REPOS = """({ frames }) => {
  const game = window.__YOLE_DEBUG__.game;
  const boat = game.boats[0];
  const d = boat.dynamics;
  d.roll = 0.002;
  d.rollVel = 0;
  d.activeCrew = 6;
  for (let i = 0; i < 6; i++) {
    d.crewPositions[i] = -0.86;
    d.crewVelocities[i] = 0;
  }
  boat.visual.rollSlow = 0.002;
  for (let i = 0; i < frames; i++) boat.visual.update(d, game.time + i / 60, 1 / 60, game.atmosphere.weather);
  return { roll: d.roll, windward: boat.visual.windwardTarget };
}"""

# Ordre : après convergence au repos (bord au vent = +1), on bascule la gîte
# lissée de l'autre bord — le virement démarre à la première frame — et on
# n'avance que ~0,4 s, en pleine fenêtre du geste de commandement.
ORDRE = """({ frames }) => {
  const game = window.__YOLE_DEBUG__.game;
  const boat = game.boats[0];
  const d = boat.dynamics;
  d.roll = 0.25;
  boat.visual.rollSlow = 0.25;
  for (let i = 0; i < frames; i++) boat.visual.update(d, game.time + 3 + i / 60, 1 / 60, game.atmosphere.weather);
  const patron = boat.visual.specialists.find((s) => s.role === "patron");
  return {
    bordElapsed: boat.visual.sideChangeElapsed,
    brasGaucheX: patron.visual.leftArmPivot.rotation.x,
    lacet: patron.visual.root.rotation.y
  };
}"""

PHOTO = """({ dx, dy, dz, tx, ty, tz }) => {
  const game = window.__YOLE_DEBUG__.game;
  const boat = game.boats[0];
  const root = boat.visual.root.position;
  game.camera.position.set(root.x + dx, root.y + dy, root.z + dz);
  game.camera.lookAt(root.x + tx, root.y + ty, root.z + tz);
  game.camera.fov = 38;
  game.camera.updateProjectionMatrix();
  game.postFX.render(game.scene, game.camera);
  return true;
}"""


def chromium():
    for nom in ("chrome", "chromium", "msedge", "google-chrome"):
        chemin = shutil.which(nom)
        if chemin:
            return chemin
    return None


def main():
    SORTIE.mkdir(parents=True, exist_ok=True)
    rapport = {}
    with sync_playwright() as p:
        lancement = {
            "headless": True,
            "args": ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
        }
        exe = chromium()
        if exe:
            lancement["executable_path"] = exe
        navigateur = p.chromium.launch(**lancement)
        page = navigateur.new_page(viewport={"width": 1100, "height": 700})
        page.goto(URL, wait_until="networkidle", timeout=60000)
        page.wait_for_function("Boolean(window.__YOLE_DEBUG__)", timeout=30000)
        page.evaluate("document.getElementById('playBtn').click()")
        page.evaluate(
            "() => { const b = document.getElementById('onboardingSkipBtn');"
            " if (b && b.offsetParent !== null) b.click(); }"
        )
        page.wait_for_function(
            "Boolean(window.__YOLE_DEBUG__.game?.boats?.[0]?.visual)", timeout=90000
        )
        page.evaluate("() => { window.__YOLE_DEBUG__.game.countdown = 0; }")
        page.wait_for_timeout(1200)
        page.evaluate("() => window.__YOLE_DEBUG__.game.quality.setTier(2, true)")
        page.wait_for_timeout(900)
        page.evaluate("() => document.getElementById('hud').style.display = 'none'")
        page.evaluate(SETUP)

        # 1. Repos, vue de jeu (le cadrage que le joueur voit).
        rapport["repos"] = page.evaluate(REPOS, {"frames": 160})
        page.evaluate(PHOTO, {"dx": 0.0, "dy": 9.5, "dz": -17.0, "tx": 0.0, "ty": 1.2, "tz": 1.5})
        page.locator("#viewport canvas").screenshot(path=str(SORTIE / "repos_06_vue_de_jeu.png"))

        # 2. Repos, trois-quarts rapproché — la variété d'assise se lit ici.
        page.evaluate(PHOTO, {"dx": 5.8, "dy": 2.4, "dz": -5.2, "tx": -0.8, "ty": 0.6, "tz": 0.0})
        page.locator("#viewport canvas").screenshot(path=str(SORTIE / "repos_02_trois_quarts.png"))

        # 2b. Repos, gros plan de PROFIL depuis le bord où siège l'équipage :
        # c'est l'angle des photos de référence (Tour 2019, GFA).
        page.evaluate(PHOTO, {"dx": -6.2, "dy": 1.5, "dz": 0.4, "tx": -0.7, "ty": 0.55, "tz": 0.0})
        page.locator("#viewport canvas").screenshot(path=str(SORTIE / "repos_07_profil.png"))

        # 3. Ordre du patron : bascule de bord, capture à ~0,4 s.
        rapport["ordre"] = page.evaluate(ORDRE, {"frames": 24})
        page.evaluate(PHOTO, {"dx": 4.8, "dy": 1.9, "dz": -7.6, "tx": 0.3, "ty": 1.0, "tz": -4.0})
        page.locator("#viewport canvas").screenshot(path=str(SORTIE / "ordre_patron.png"))

        navigateur.close()
    print(json.dumps(rapport, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
