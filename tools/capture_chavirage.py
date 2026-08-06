"""Captures du chavirage : gîte au-delà de la plage de travail de l'équipage.

Le harnais historique (`capture_crew_pose.py`) plafonne à roll=0,52 — la gîte
de course franche. Le chavirage commence là où elle finit. Ici on force 0,85
puis 1,10 rad (49° puis 63°) et on photographie l'équipage depuis le côté qui
se lève : c'est là que les hommes perchés deviennent impossibles.

    PORT=8791 python tools/serve.py &
    python tools/capture_chavirage.py
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
  return Boolean(game.boats?.[0]?.visual);
}"""

FORCE = """({ roll, frames }) => {
  const game = window.__YOLE_DEBUG__.game;
  const boat = game.boats[0];
  const d = boat.dynamics;
  d.roll = roll;
  d.rollVel = 0;
  d.activeCrew = 6;
  for (let i = 0; i < 6; i++) {
    d.crewPositions[i] = -Math.sign(roll) * (0.62 + i * 0.05);
    d.crewVelocities[i] = 0;
  }
  boat.visual.rollSlow = roll;
  for (let i = 0; i < frames; i++) boat.visual.update(d, game.time + i / 60, 1 / 60, game.atmosphere.weather);
  return { roll: d.roll, windward: boat.visual.windwardTarget };
}"""

PHOTO = """({ dx, dy, dz, tx, ty, tz }) => {
  const game = window.__YOLE_DEBUG__.game;
  const boat = game.boats[0];
  const windward = -Math.sign(boat.dynamics.roll) || 1;
  const root = boat.visual.root.position;
  game.camera.position.set(root.x + dx * windward, root.y + dy, root.z + dz);
  game.camera.lookAt(root.x + tx * windward, root.y + ty, root.z + tz);
  game.camera.fov = 40;
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

        for nom, roll in (("chavirage_049deg", 0.85), ("chavirage_063deg", 1.10)):
            rapport[nom] = page.evaluate(FORCE, {"roll": roll, "frames": 160})
            page.evaluate(PHOTO, {"dx": 7.6, "dy": 2.6, "dz": -1.5, "tx": 1.2, "ty": 0.8, "tz": 0.0})
            page.locator("#viewport canvas").screenshot(path=str(SORTIE / f"{nom}.png"))

        navigateur.close()
    print(json.dumps(rapport, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
