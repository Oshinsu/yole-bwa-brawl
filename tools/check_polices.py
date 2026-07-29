"""Les polices sont-elles VRAIMENT chargees et appliquees ?

Declarer un @font-face ne prouve rien : le fichier peut manquer, le format peut
etre refuse, et `font-family` peut retomber silencieusement sur la police
systeme sans la moindre erreur console. C'est exactement le defaut qu'on
corrige, donc on le mesure au lieu de le supposer.

On verifie trois choses distinctes :
  1. `document.fonts` a bien CHARGE chaque famille (status + check()) ;
  2. chaque titre est effectivement RENDU dans la police voulue, mesure par la
     largeur du texte : une meme chaine rendue en Anton et en repli n'a pas la
     meme largeur ;
  3. aucune requete de police n'a echoue.

    PORT=8791 python tools/serve.py &
    python tools/check_polices.py
"""
from __future__ import annotations

import json
import os
import shutil
from pathlib import Path

from playwright.sync_api import sync_playwright

URL = os.environ.get("YOLE_URL", "http://127.0.0.1:8791/index.html")
SORTIE = Path(__file__).resolve().parent.parent / "previews" / "polices"

ETAT = """() => {
  const fam = (el) => getComputedStyle(el).fontFamily;
  // Largeur d'une meme chaine dans la police cible puis dans le repli : si les
  // deux sont egales, la police cible n'est PAS appliquee.
  const largeur = (police, taille = 64) => {
    const c = document.createElement("canvas").getContext("2d");
    c.font = `${taille}px ${police}`;
    return c.measureText("YOLE BWA BRAWL 2026").width;
  };
  const cible = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    return { famille: fam(el), taille: getComputedStyle(el).fontSize,
             graisse: getComputedStyle(el).fontWeight };
  };
  return {
    chargees: [...document.fonts].map(f => ({ famille: f.family, statut: f.status, graisse: f.weight })),
    check: {
      inter: document.fonts.check('16px "Inter var"'),
      anton: document.fonts.check('16px "Anton"')
    },
    largeurs: {
      anton: largeur('"Anton"'),
      inter: largeur('"Inter var"'),
      repli: largeur('sans-serif'),
      inexistante: largeur('"NExistePasDuTout"')
    },
    corps: fam(document.body),
    titres: {
      h1: cible(".menu-content h1"),
      chargement: cible(".loading-screen strong"),
      carte: cible(".menu-actions .mode-card strong")
    }
  };
}"""


def chromium():
    for nom in ("chrome", "chromium", "msedge", "google-chrome"):
        chemin = shutil.which(nom)
        if chemin:
            return chemin
    return None


def main():
    SORTIE.mkdir(parents=True, exist_ok=True)
    echecs = []
    with sync_playwright() as p:
        lancement = {"headless": True, "args": [
            "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]}
        exe = chromium()
        if exe:
            lancement["executable_path"] = exe
        nav = p.chromium.launch(**lancement)
        page = nav.new_page(viewport={"width": 1280, "height": 800},
                            device_scale_factor=2)
        page.on("requestfailed", lambda r: echecs.append(r.url[-60:]))
        page.goto(URL, wait_until="networkidle", timeout=60000)
        page.evaluate("() => document.fonts.ready")
        page.wait_for_timeout(1200)
        rapport = page.evaluate(ETAT)
        page.screenshot(path=str(SORTIE / "menu.png"))
        nav.close()
    rapport["requetesEchouees"] = echecs
    print(json.dumps(rapport, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
