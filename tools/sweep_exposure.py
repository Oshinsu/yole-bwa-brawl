"""Balayage d'exposition de la passe de sortie, sur une MEME frame gelee.

La passe de composition fait desormais tone mapping ACES puis encodage sRGB.
`uExposure` est le seul bouton global qui reste, et le choisir a l'oeil sur une
capture n'est pas une mesure. Ici : une frame, N expositions, et pour chacune
l'histogramme du cadre de jeu (le HUD est exclu — il est en HTML, il ne traverse
pas le shader, et il fausserait toutes les statistiques).

    PORT=8791 python tools/serve.py &
    python tools/sweep_exposure.py
"""
from __future__ import annotations

import json
import os
import shutil
from pathlib import Path

from playwright.sync_api import sync_playwright

SORTIE = Path(__file__).resolve().parent.parent / "previews" / "exposition"
URL = os.environ.get("YOLE_URL", "http://127.0.0.1:8791/index.html")
if "debug" not in URL:
    URL += ("&" if "?" in URL else "?") + "debug=1"
VALEURS = [float(v) for v in os.environ.get("YOLE_EXPO", "0.70,0.85,1.00,1.20,1.45").split(",")]
QUALITE = {"LQ": 0, "MQ": 1, "HQ": 2}


def chromium():
    for nom in ("chrome", "chromium", "msedge", "google-chrome"):
        chemin = shutil.which(nom)
        if chemin:
            return chemin
    return None


# Mesure faite dans la page : un canvas 2D recoit le canvas WebGL reduit, et on
# lit les pixels. `preserveDrawingBuffer` n'est pas active, donc la lecture doit
# suivre IMMEDIATEMENT le rendu, dans le meme tour de boucle.
MESURE = """({ exposition }) => {
  const game = window.__YOLE_DEBUG__.game;
  game.postFX.material.uniforms.uExposure.value = exposition;
  game.postFX.render(game.scene, game.camera);
  const source = game.renderer.domElement;
  const largeur = 160;
  const hauteur = Math.max(1, Math.round(largeur * source.height / source.width));
  const scratch = document.createElement('canvas');
  scratch.width = largeur; scratch.height = hauteur;
  const ctx = scratch.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, largeur, hauteur);
  const data = ctx.getImageData(0, 0, largeur, hauteur).data;
  const lumas = [];
  let sombres = 0, ecretes = 0, sommeSat = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255, v = data[i + 1] / 255, b = data[i + 2] / 255;
    const luma = 0.2126 * r + 0.7152 * v + 0.0722 * b;
    lumas.push(luma);
    if (luma < 0.06) sombres++;
    if (Math.max(r, v, b) > 0.996) ecretes++;
    const max = Math.max(r, v, b), min = Math.min(r, v, b);
    sommeSat += max <= 0 ? 0 : (max - min) / max;
  }
  lumas.sort((a, b) => a - b);
  const q = (t) => lumas[Math.min(lumas.length - 1, Math.floor(t * lumas.length))];
  const n = lumas.length;
  return {
    exposition,
    medianeLuma: +q(0.5).toFixed(4),
    p05: +q(0.05).toFixed(4),
    p95: +q(0.95).toFixed(4),
    partSombre: +(sombres / n).toFixed(4),
    partEcretee: +(ecretes / n).toFixed(4),
    saturationMoyenne: +(sommeSat / n).toFixed(4)
  };
}"""


def main():
    SORTIE.mkdir(parents=True, exist_ok=True)
    erreurs = []
    palier = os.environ.get("YOLE_QUALITE", "HQ")
    with sync_playwright() as p:
        lancement = {
            "headless": True,
            "args": [
                "--use-gl=angle",
                "--use-angle=swiftshader",
                "--enable-unsafe-swiftshader",
                "--ignore-gpu-blocklist",
            ],
        }
        exe = chromium()
        if exe:
            lancement["executable_path"] = exe
        navigateur = p.chromium.launch(**lancement)
        page = navigateur.new_page(viewport={"width": 1280, "height": 760})
        page.on("console", lambda m: erreurs.append(f"{m.type}: {m.text}") if m.type == "error" else None)
        page.on("pageerror", lambda e: erreurs.append(f"pageerror: {e}"))

        page.goto(URL, wait_until="networkidle", timeout=60000)
        page.wait_for_function("Boolean(window.__YOLE_DEBUG__)", timeout=30000)
        page.evaluate("document.getElementById('playBtn').click()")
        page.wait_for_function("window.__YOLE_DEBUG__.getState().tick > 60", timeout=60000)
        page.keyboard.press("KeyW")
        page.wait_for_timeout(6000)
        page.evaluate(
            "(tier) => window.__YOLE_DEBUG__.game.quality.setTier(tier, true)",
            QUALITE.get(palier, 2),
        )
        page.wait_for_timeout(1200)
        # Simulation gelee : toutes les expositions portent sur la meme image.
        page.evaluate("window.__YOLE_DEBUG__.game.paused = true")

        mesures = []
        for valeur in VALEURS:
            mesures.append(page.evaluate(MESURE, {"exposition": valeur}))
            page.evaluate(
                """(v) => {
                  const game = window.__YOLE_DEBUG__.game;
                  game.postFX.material.uniforms.uExposure.value = v;
                  game.postFX.render(game.scene, game.camera);
                }""",
                valeur,
            )
            page.locator("#viewport canvas").screenshot(path=str(SORTIE / f"expo_{valeur:.2f}.png"))

        navigateur.close()

    print(json.dumps({"palier": palier, "mesures": mesures, "erreurs": erreurs[:6]}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
