#!/usr/bin/env python3
"""Balaye le brouillard, en ne mesurant QUE les pixels qu'il touche.

Trois protocoles ont echoue avant celui-ci, et chacun pour une raison qu'il
faut garder ecrite :

1. La scene defilait entre deux captures. Plancher de bruit +12 % sur la bande
   d'horizon, soit plus que tous les effets mesures. -> `game.paused = true`.
2. Les valeurs injectees etaient ecrasees : frame() reecrit intensites, couleur
   et densite a chaque tour. -> elles vivent dans `lightBase`, `fogTint`,
   `fogBase`, que frame() lit.
3. Le Grain montait pendant la mesure. `atmosphere.update()` tourne sur le temps
   REEL meme en pause : il assombrit la couleur d'horizon de facon monotone, et
   tout echantillon au-dela de la deuxieme paire etait empoisonne — on voyait un
   pas de -13 % identique pour trois variantes differentes. -> on fige la meteo
   sur une valeur unique.

Il subsiste une derive residuelle, faible mais reelle : `ocean.update(raw, ...)`
recoit le temps REEL et continue d'animer la mer meme en pause. D'ou la colonne
« temoin hors masque » — elle doit rester CONSTANTE d'une variante a l'autre.
Si elle bouge entre deux lignes, ces deux lignes ne sont pas comparables ; si
elle est constante sur un bloc, le bloc l'est.

Reste un quatrieme probleme, de sensibilite : dans la bande d'horizon les mornes
ne pesent qu'une fraction des pixels, le reste est ciel et bandeau. Un effet
franc sur les mornes s'y lit dilue. On ne choisit donc plus la zone a la main :
on la fait DESIGNER PAR LE JEU. Une capture sans aucun brouillard, comparee a la
reference, donne exactement l'ensemble des pixels que le brouillard repeint.
C'est le masque. Tout se mesure dedans, et les pixels dehors servent de temoin.
"""
from __future__ import annotations

import os
import shutil
from pathlib import Path

import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

RACINE = Path(__file__).resolve().parents[1]
SORTIE = RACINE / "previews" / "brouillard"
URL = os.environ.get("YOLE_URL", "http://127.0.0.1:8791/index.html?debug")
W = np.array([0.2126, 0.7152, 0.0722], np.float32)

REF_TINT, REF_DENSITE = 0.82, 0.0026
SEUIL_MASQUE = 0.030  # ecart de luminance minimal pour dire « le brouillard agit ici »

VARIANTES = [
    ("densite 0.0026", 0.82, 0.0026),
    ("densite 0.0020", 0.82, 0.0020),
    ("densite 0.0015", 0.82, 0.0015),
    ("densite 0.0011", 0.82, 0.0011),
    ("densite 0.0008", 0.82, 0.0008),
    ("teinte 0.94", 0.94, 0.0015),
    ("teinte 0.70", 0.70, 0.0015),
]

FIGER = """() => {
  const g = window.__YOLE_DEBUG__.game;
  g.paused = true;
  const fige = g.atmosphere.update(0, g.time, g.boats[0].visual.root.position, g.stormZ);
  g.atmosphere.update = () => fige;
}"""

REGLER = """(v) => {
  const g = window.__YOLE_DEBUG__.game;
  g.fogTint = v[0];
  g.fogBase = v[1];
}"""


def charge(nom):
    return np.asarray(Image.open(SORTIE / f"{nom}.png").convert("RGB")).astype(np.float32) / 255.0


def stats(a, masque):
    px = a[masque]
    if px.size == 0:
        return 0.0, 0.0
    mx, mn = px.max(1), px.min(1)
    return float((px @ W).mean()), float(((mx - mn) / np.maximum(mx, 1e-4)).mean())


def main() -> int:
    SORTIE.mkdir(parents=True, exist_ok=True)
    lancement = {"headless": True, "args": [
        "--use-gl=angle", "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist",
    ]}
    exe = shutil.which("chrome") or shutil.which("msedge") or shutil.which("chromium")
    if exe:
        lancement["executable_path"] = exe

    with sync_playwright() as p:
        navigateur = p.chromium.launch(**lancement)
        page = navigateur.new_page(viewport={"width": 1280, "height": 760})
        page.goto(URL, wait_until="networkidle", timeout=90000)
        page.wait_for_timeout(2500)
        if page.evaluate("() => !window.__YOLE_DEBUG__"):
            print("ERREUR : __YOLE_DEBUG__ absent — l'URL doit porter ?debug")
            navigateur.close()
            return 1
        page.evaluate("document.getElementById('playBtn').click()")
        page.wait_for_timeout(6000)
        page.keyboard.press("KeyW")
        page.wait_for_timeout(2500)
        page.evaluate(FIGER)
        page.wait_for_timeout(700)

        page.evaluate(REGLER, [REF_TINT, REF_DENSITE])
        page.wait_for_timeout(320)
        page.screenshot(path=str(SORTIE / "reference.png"))
        page.evaluate(REGLER, [REF_TINT, 0.0])
        page.wait_for_timeout(320)
        page.screenshot(path=str(SORTIE / "sans_brouillard.png"))

        for i, (nom, tint, densite) in enumerate(VARIANTES):
            page.evaluate(REGLER, [tint, densite])
            page.wait_for_timeout(320)
            page.screenshot(path=str(SORTIE / f"v{i}.png"))
        # Retour a la reference : si elle ne se reproduit pas, la serie est nulle.
        page.evaluate(REGLER, [REF_TINT, REF_DENSITE])
        page.wait_for_timeout(320)
        page.screenshot(path=str(SORTIE / "reference_fin.png"))
        navigateur.close()

    ref = charge("reference")
    nu = charge("sans_brouillard")
    ecart = np.abs((ref @ W) - (nu @ W))
    masque = ecart > SEUIL_MASQUE
    # On ecarte l'interface : elle est dessinee en HTML par-dessus, jamais
    # touchee par le brouillard, donc absente du masque par construction.
    print(f"masque du brouillard : {100 * masque.mean():.1f} % du cadre "
          f"({masque.sum()} px, seuil {SEUIL_MASQUE})")
    hors = ~masque
    lr, sr = stats(ref, masque)
    lf, sf = stats(charge("reference_fin"), masque)
    print(f"repetabilite de la reference : luminance {lr:.4f} -> {lf:.4f} "
          f"({100 * (lf - lr) / max(lr, 1e-4):+.2f} %)")
    ln, sn = stats(nu, masque)
    print(f"sans brouillard du tout      : luminance {ln:.4f}  saturation {sn:.4f}")
    print()
    print(f"{'variante':<16} {'luminance':>10} {'saturation':>11}   {'temoin hors masque':>19}")
    for i, (nom, tint, densite) in enumerate(VARIANTES):
        a = charge(f"v{i}")
        lum, sat = stats(a, masque)
        tlum, _ = stats(a, hors)
        tref, _ = stats(ref, hors)
        print(f"{nom:<16} {lum:>10.4f} {sat:>11.4f}   {100 * (tlum - tref) / max(tref, 1e-4):>+18.2f} %")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
