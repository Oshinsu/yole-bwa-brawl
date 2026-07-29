"""Captures comparables AVANT/APRES la conversion des textures en WebP.

⚠️ Comparer des captures de jeu exige de FIGER tout ce qui bouge. Sans ça, la
houle, les particules et l'heure de la journee changent entre deux prises et
toute difference devient illisible. On force donc la meme graine, le meme tick
et la meme meteo, et on coupe la boucle d'animation avant de photographier.

    PORT=8791 python tools/serve.py &
    python tools/capture_ab_webp.py avant
    python tools/capture_ab_webp.py apres
"""
from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
ETIQUETTE = sys.argv[1] if len(sys.argv) > 1 else "avant"
SORTIE = Path(__file__).resolve().parent.parent / "previews" / "webp"
URL = os.environ.get("YOLE_URL", "http://127.0.0.1:8791/index.html?debug=1")

SCENES = [
    ("menu", None),
    ("hud", "course"),
    ("vfx", "explosions"),
]


def chromium():
    for nom in ("chrome", "chromium", "msedge", "google-chrome"):
        chemin = shutil.which(nom)
        if chemin:
            return chemin
    return None


def main():
    SORTIE.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        lancement = {"headless": True, "args": [
            "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]}
        exe = chromium()
        if exe:
            lancement["executable_path"] = exe
        nav = p.chromium.launch(**lancement)
        page = nav.new_page(viewport={"width": 1280, "height": 720}, device_scale_factor=2)
        page.goto(URL, wait_until="networkidle", timeout=90000)
        page.wait_for_function("Boolean(window.__YOLE_DEBUG__)", timeout=30000)
        page.wait_for_timeout(1200)
        page.screenshot(path=str(SORTIE / f"menu-{ETIQUETTE}.png"))

        page.evaluate("document.getElementById('playBtn').click()")
        page.wait_for_function("window.__YOLE_DEBUG__.getState().tick > 240", timeout=90000)
        # ⚠️ ON FIGE L'HORLOGE, PAS SEULEMENT LA BOUCLE. Une première version
        # coupait `setAnimationLoop` puis appelait `frame(performance.now())` :
        # l'horodatage differait entre les deux prises, donc la houle n'etait pas
        # a la meme phase et la comparaison donnait un ecart maximal de 253 sur
        # 255 — de la mer, pas de la compression. On impose un temps FIXE.
        page.evaluate("""() => {
          const g = window.__YOLE_DEBUG__.game;
          g.renderer.setAnimationLoop(null);
          g.time = 120.0;
          g.frame(120000);
          g.frame(120016.7);
        }""")
        page.wait_for_timeout(400)
        page.screenshot(path=str(SORTIE / f"hud-{ETIQUETTE}.png"))

        # Une salve d'effets : c'est là que le WebP destructif se verrait.
        page.evaluate("""() => {
          const g = window.__YOLE_DEBUG__.game;
          const j = g.boats[0];
          for (let i = 0; i < 5; i++) {
            g.explosions?.spawn(j.x + (i - 2) * 5, 2.2, j.z + 16 + i * 3, 7.0, 1.0);
            g.spellVfx?.spawn(j.x + (i - 2) * 6, 2.6, j.z + 12, i % 4, 5.2, 0.9);
            g.juiceVfx?.spawn(j.x + (i - 2) * 4, 1.8, j.z + 20, i % 3, 4.6, 0.9);
          }
          g.time = 121.0;
          g.frame(121000);
        }""")
        page.wait_for_timeout(300)
        page.evaluate("() => { const g = window.__YOLE_DEBUG__.game; g.time = 121.2; g.frame(121200); }")
        page.screenshot(path=str(SORTIE / f"vfx-{ETIQUETTE}.png"))
        nav.close()
    print(f"captures « {ETIQUETTE} » ecrites dans {SORTIE}")


if __name__ == "__main__":
    main()
