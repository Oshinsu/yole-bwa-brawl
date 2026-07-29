"""Controle des trois paliers de qualite sur la MEME frame, plus le cout reel
de la chaine de bloom.

Deux pieges que ce script evite explicitement :

1. `performance.now()` autour de `render()` ne mesure QUE la soumission des
   commandes. Une premiere mesure « sans bloom » a 1,19 ms suivie d'une mesure
   « avec bloom » a 97,97 ms ne mesurait pas le bloom : elle mesurait la file
   d'attente GPU en train de se vider pendant la seconde boucle. Ici chaque
   image est suivie d'un `readPixels` 1x1, qui force la synchronisation.
2. Les deux configurations sont mesurees en alternance A/B/A/B, pour que la
   montee en temperature ou la mise en cache ne se retrouve pas entierement
   d'un seul cote.

    PORT=8791 python tools/serve.py &
    python tools/check_render_tiers.py
"""
from __future__ import annotations

import json
import os
import shutil
from pathlib import Path

from playwright.sync_api import sync_playwright

SORTIE = Path(__file__).resolve().parent.parent / "previews" / "paliers"
URL = os.environ.get("YOLE_URL", "http://127.0.0.1:8791/index.html")
if "debug" not in URL:
    URL += ("&" if "?" in URL else "?") + "debug=1"

# ⚠️ Le rendu et la LECTURE doivent tenir dans le MEME evaluate.
# `preserveDrawingBuffer` est desactive : entre deux appels, le compositeur peut
# vider le tampon de dessin et `drawImage` rend alors du noir. Symptome observe :
# un palier sur trois revenait a luma 0 — une mesure fausse, pas un defaut du jeu.
STATS = """(() => {
  const game = window.__YOLE_DEBUG__.game;
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
  let ecretes = 0, sommeSat = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255, v = data[i + 1] / 255, b = data[i + 2] / 255;
    lumas.push(0.2126 * r + 0.7152 * v + 0.0722 * b);
    if (Math.max(r, v, b) > 0.996) ecretes++;
    const max = Math.max(r, v, b), min = Math.min(r, v, b);
    sommeSat += max <= 0 ? 0 : (max - min) / max;
  }
  lumas.sort((a, b) => a - b);
  const q = (t) => lumas[Math.min(lumas.length - 1, Math.floor(t * lumas.length))];
  return {
    medianeLuma: +q(0.5).toFixed(4),
    p05: +q(0.05).toFixed(4),
    p95: +q(0.95).toFixed(4),
    partEcretee: +(ecretes / lumas.length).toFixed(4),
    saturationMoyenne: +(sommeSat / lumas.length).toFixed(4)
  };
})()"""

COUT_BLOOM = """(() => {
  const game = window.__YOLE_DEBUG__.game;
  const gl = game.renderer.getContext();
  const pixel = new Uint8Array(4);
  const reference = game.postFX.bloom;
  const streakRef = game.postFX.material.uniforms.uStreak.value;

  const uneImage = (bloom, streak) => {
    game.postFX.bloom = bloom;
    game.postFX.material.uniforms.uBloom.value = bloom;
    game.postFX.material.uniforms.uStreak.value = streak;
    const depart = performance.now();
    game.postFX.render(game.scene, game.camera);
    // Synchronisation forcee : sans elle on chronometre la soumission, pas le
    // rasterisation. C'est le seul point du script qui garantit une mesure.
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    return performance.now() - depart;
  };

  uneImage(reference, streakRef);
  uneImage(0, 0);

  const avec = [], sans = [];
  for (let tour = 0; tour < 8; tour++) {
    avec.push(uneImage(reference, streakRef));
    sans.push(uneImage(0, 0));
  }
  game.postFX.bloom = reference;
  game.postFX.material.uniforms.uBloom.value = reference;
  game.postFX.material.uniforms.uStreak.value = streakRef;

  const mediane = (liste) => {
    const trie = [...liste].sort((a, b) => a - b);
    return +trie[Math.floor(trie.length / 2)].toFixed(3);
  };
  return { avecBloomMs: mediane(avec), sansBloomMs: mediane(sans), tours: avec.length };
})()"""


def chromium():
    for nom in ("chrome", "chromium", "msedge", "google-chrome"):
        chemin = shutil.which(nom)
        if chemin:
            return chemin
    return None


def main():
    SORTIE.mkdir(parents=True, exist_ok=True)
    erreurs = []
    rapport = {}
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
        page.wait_for_timeout(1500)
        page.locator("#viewport canvas").screenshot(path=str(SORTIE / "00_menu.png"))
        rapport["menu"] = page.evaluate(STATS)

        page.evaluate("document.getElementById('playBtn').click()")
        page.wait_for_function("window.__YOLE_DEBUG__.getState().tick > 60", timeout=60000)
        page.keyboard.press("KeyW")
        page.wait_for_timeout(6000)
        page.evaluate("window.__YOLE_DEBUG__.game.paused = true")

        for nom, tier in (("LQ", 0), ("MQ", 1), ("HQ", 2)):
            page.evaluate("(t) => window.__YOLE_DEBUG__.game.quality.setTier(t, true)", tier)
            page.wait_for_timeout(700)
            rapport[nom] = page.evaluate(STATS)
            page.locator("#viewport canvas").screenshot(path=str(SORTIE / f"{nom}.png"))

        page.evaluate("() => window.__YOLE_DEBUG__.game.quality.setTier(2, true)")
        page.wait_for_timeout(700)
        rapport["coutBloomHQ"] = page.evaluate(COUT_BLOOM)

        navigateur.close()

    rapport["erreurs"] = erreurs[:6]
    print(json.dumps(rapport, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
