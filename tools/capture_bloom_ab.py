"""Capture A/B de la chaine de bloom, sur une MEME frame de jeu.

Comparer deux executions differentes ne prouve rien : la meteo, la houle et l'IA
ont bouge entre les deux. Ici on met le jeu en pause sur une frame, on rend
l'image avec la chaine de bloom active puis desactivee, et on ecrit les deux.
Le seul delta possible est donc le post-traitement.

    PORT=8791 python tools/serve.py &
    YOLE_URL=http://127.0.0.1:8791/index.html python tools/capture_bloom_ab.py
"""
from __future__ import annotations

import json
import os
import shutil
from pathlib import Path

from playwright.sync_api import sync_playwright

SORTIE = Path(__file__).resolve().parent.parent / "previews" / "bloom_ab"
URL = os.environ.get("YOLE_URL", "http://127.0.0.1:8791/index.html")
# `window.__YOLE_DEBUG__` n'existe QUE derriere `?debug` : sans ce parametre, tout
# pilotage par evaluate() est silencieusement sans effet (chainage optionnel).
if "debug" not in URL:
    URL += ("&" if "?" in URL else "?") + "debug=1"
QUALITE = {"LQ": 0, "MQ": 1, "HQ": 2}


def chromium():
    for nom in ("chrome", "chromium", "msedge", "google-chrome"):
        chemin = shutil.which(nom)
        if chemin:
            return chemin
    return None


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

        # Palier verrouille APRES le depart : `startMatch` peut relire les
        # reglages, et l'auto-qualite retrograde en quelques secondes sous
        # SwiftShader. `manual = true` est ce qui fait taire QualityManager.
        page.evaluate(
            """(tier) => {
              const game = window.__YOLE_DEBUG__.game;
              game.quality.setTier(tier, true);
            }""",
            QUALITE.get(palier, 2),
        )
        page.wait_for_timeout(1500)

        mesure = page.evaluate(
            """() => {
              const game = window.__YOLE_DEBUG__.game;
              const chrono = (bloom, streak, frames) => {
                game.postFX.bloom = bloom;
                game.postFX.material.uniforms.uBloom.value = bloom;
                game.postFX.material.uniforms.uStreak.value = streak;
                // Deux tours a blanc : le premier paie la compilation du
                // programme et le redimensionnement des cibles.
                game.postFX.render(game.scene, game.camera);
                game.postFX.render(game.scene, game.camera);
                const depart = performance.now();
                for (let index = 0; index < frames; index++) game.postFX.render(game.scene, game.camera);
                const ecoule = performance.now() - depart;
                return { msParImage: ecoule / frames, appels: game.renderer.info.render.calls };
              };
              const reference = { bloom: game.postFX.bloom, streak: game.postFX.material.uniforms.uStreak.value };
              const sans = chrono(0, 0, 12);
              const avec = chrono(reference.bloom, reference.streak, 12);
              return { sans, avec, palier: game.qualityProfile.label, reference };
            }"""
        )

        # Meme frame, deux compositions. `paused` gele la simulation ; le rendu,
        # lui, continue a etre declenche a la main juste avant chaque capture.
        page.evaluate("window.__YOLE_DEBUG__.game.paused = true")
        for nom, bloom, streak in (
            ("avec_bloom", mesure["reference"]["bloom"], mesure["reference"]["streak"]),
            ("sans_bloom", 0, 0),
        ):
            page.evaluate(
                """({ bloom, streak }) => {
                  const game = window.__YOLE_DEBUG__.game;
                  game.postFX.bloom = bloom;
                  game.postFX.material.uniforms.uBloom.value = bloom;
                  game.postFX.material.uniforms.uStreak.value = streak;
                  game.postFX.render(game.scene, game.camera);
                }""",
                {"bloom": bloom, "streak": streak},
            )
            page.locator("#viewport canvas").screenshot(path=str(SORTIE / f"{nom}.png"))

        etat = page.evaluate("() => document.getElementById('perfStats')?.textContent ?? ''")
        navigateur.close()

    print(json.dumps({"palier": palier, "mesure": mesure, "perf": etat, "erreurs": erreurs[:10]}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
