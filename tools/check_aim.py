"""Deux contrats de visee, mesures en jeu reel.

1. L'IA VISE-T-ELLE ? Elle appelait `fireWave` directement, qui lit le cap de la
   coque : elle tirait donc droit devant quelle que soit la position de la cible.
   On compte ici les tirs et les impacts, et on en tire un taux de reussite.

2. LE HARPON PEUT-IL RATER ? Il verrouillait la cible la plus proche dans un cone
   de 83 degres : viser ne servait a rien. Devenu un rayon, il doit toucher quand
   on pointe la cible et manquer quand on pointe a cote.

    PORT=8791 python tools/serve.py &
    python tools/check_aim.py
"""
from __future__ import annotations

import json
import os
import shutil

from playwright.sync_api import sync_playwright

URL = os.environ.get("YOLE_URL", "http://127.0.0.1:8791/index.html")
if "debug" not in URL:
    URL += ("&" if "?" in URL else "?") + "debug=1"
NIVEAU = os.environ.get("YOLE_IA", "channpyon")

INSTRUMENTER_IA = """() => {
  const game = window.__YOLE_DEBUG__.game;
  const t = { tirs: 0, impacts: 0, refus: 0 };
  window.__ia = t;
  const brutAimed = game.fireAimed.bind(game);
  game.fireAimed = (owner, cible, kind) => {
    const ok = brutAimed(owner, cible, kind);
    if (ok) t.tirs++; else t.refus++;
    return ok;
  };
  for (const boat of game.boats) {
    const brut = boat.applyHit.bind(boat);
    boat.applyHit = (src, data) => {
      // ⚠️ On ne compte QUE les impacts de coco/pwason venant d'une IA. Compter
      // tous les impacts d'arme melait mines et harpons, qui ne passent pas par
      // fireAimed — d'ou un « taux de reussite » de 550 %, absurde.
      if (data?.fromWeapon && data?.fromAimed && src && !src.isPlayer) t.impacts++;
      return brut(src, data);
    };
  }
}"""

HARPON = """({ ecartLateral }) => {
  const game = window.__YOLE_DEBUG__.game;
  game.renderer.setAnimationLoop(null);
  const tireur = game.boats[0];
  const cible = game.boats[1];
  // Scene controlee : cible droit devant, decalee lateralement de `ecartLateral`.
  tireur.dynamics.heading = 0;
  tireur.dynamics.x = 0; tireur.dynamics.z = 0;
  tireur.dynamics.vx = 0; tireur.dynamics.vz = 0;
  cible.dynamics.x = ecartLateral; cible.dynamics.z = 30;
  cible.dynamics.vx = 0; cible.dynamics.vz = 0;
  cible.dynamics.eliminated = false;
  const touche = game.raycastHarpoon(tireur);
  return { ecartLateral, touche: touche ? touche.name : null, accroche: Boolean(touche) };
}"""


def chromium():
    for nom in ("chrome", "chromium", "msedge", "google-chrome"):
        chemin = shutil.which(nom)
        if chemin:
            return chemin
    return None


def main():
    rapport = {}
    erreurs = []
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
        page.on("pageerror", lambda e: erreurs.append(str(e)[:200]))
        page.on("console", lambda m: erreurs.append(m.text[:200]) if m.type == "error" else None)

        page.goto(URL, wait_until="networkidle", timeout=60000)
        page.wait_for_function("Boolean(window.__YOLE_DEBUG__)", timeout=30000)
        page.evaluate("(n) => window.__YOLE_DEBUG__.game.settings.set('aiLevel', n)", NIVEAU)
        page.evaluate("document.getElementById('playBtn').click()")
        page.wait_for_function("window.__YOLE_DEBUG__.getState().tick > 60", timeout=60000)
        page.evaluate(INSTRUMENTER_IA)
        page.wait_for_timeout(40000)
        ia = page.evaluate("() => window.__ia")
        ia["causes"] = page.evaluate("() => window.__YOLE_DEBUG__.game.aimStats ?? null")
        total = ia["tirs"] + ia["refus"]
        rapport["ia"] = {
            **ia,
            "tauxReussite": round(ia["impacts"] * 100 / max(1, ia["tirs"]), 1),
            "partRefusee": round(ia["refus"] * 100 / max(1, total), 1),
        }

        rapport["harpon"] = [page.evaluate(HARPON, {"ecartLateral": e})
                             for e in (0.0, 2.0, 3.0, 4.5, 9.0)]
        navigateur.close()

    rapport["erreurs"] = erreurs[:5]
    print(json.dumps(rapport, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
