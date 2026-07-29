"""La musique joue-t-elle VRAIMENT, et la bonne piste au bon moment ?

Compiler n'est pas jouer. Ce harnais ouvre un vrai navigateur avec l'autoplay
autorise, arme la musique, lance une partie, et verifie a chaque etape :

  - quelle piste est branchee sur la scene courante ;
  - si son element audio avance reellement (`currentTime` qui progresse) ;
  - si le gain de son bus est non nul ;
  - qu'aucune piste n'est marquee morte (fichier introuvable, decodeur absent).

    PORT=8791 python tools/serve.py &
    python tools/check_zik.py
"""
from __future__ import annotations

import json
import os
import shutil

from playwright.sync_api import sync_playwright

URL = os.environ.get("YOLE_URL", "http://127.0.0.1:8791/index.html")
if "debug" not in URL:
    URL += ("&" if "?" in URL else "?") + "debug=1"

ETAT = """() => {
  const m = window.__YOLE_DEBUG__.game.music;
  if (!m) return { erreur: "pas de directeur musical" };
  const pistes = {};
  for (const [nom, e] of m.pistes) {
    pistes[nom] = {
      fichier: e.definition.fichier,
      morte: e.morte,
      gain: e.gain ? +e.gain.gain.value.toFixed(3) : null,
      temps: e.element ? +e.element.currentTime.toFixed(2) : null,
      enPause: e.element ? e.element.paused : null
    };
  }
  return { scene: m.scene, sting: m.sting, volume: m.volume, pistes };
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
            "args": [
                "--autoplay-policy=no-user-gesture-required",
                "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
            ],
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

        # ⚠️ Le geste qui arme l'audio doit etre NEUTRE. Un clic au centre de
        # l'ecran tombe sur une carte de mode et lance le Tour des Yoles : la
        # sonde mesurait alors la mauvaise phase.
        page.keyboard.press("Shift")
        page.wait_for_timeout(3500)
        rapport["menu"] = page.evaluate(ETAT)

        page.evaluate("document.getElementById('playBtn').click()")
        page.wait_for_function("window.__YOLE_DEBUG__.getState().tick > 60", timeout=60000)
        page.wait_for_timeout(3500)
        rapport["course"] = page.evaluate(ETAT)

        # Le Grain colle au joueur : la musique doit basculer.
        page.evaluate("""() => {
          const g = window.__YOLE_DEBUG__.game;
          g.stormZ = g.boats[0].z - 30;
        }""")
        page.wait_for_timeout(2500)
        rapport["grain"] = page.evaluate(ETAT)

        # Fin de manche : sting. On quitte le mode « playing », sinon le HUD
        # reimpose la scene « grain » a chaque rafraichissement et la mesure
        # montre une boucle qui n'aurait pas du survivre.
        page.evaluate("""() => {
          const g = window.__YOLE_DEBUG__.game;
          g.mode = 'ended';
          g.music.setScene(null);
          g.music.jouerSting('victoire');
        }""")
        page.wait_for_timeout(2500)
        rapport["victoire"] = page.evaluate(ETAT)

        navigateur.close()

    rapport["erreurs"] = erreurs[:6]
    print(json.dumps(rapport, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
