#!/usr/bin/env python3
"""Balaye les intensites lumineuses en jeu et mesure ce qu'elles changent.

Hypothese a tester : les mornes sortent PALES ET GRIS non pas a cause de leurs
couleurs de sommet — recolorer n'a deplace leur luminance que de 0,389 a 0,394 —
mais parce que l'eclairement les delave. HemisphereLight 2,22 + DirectionalLight
4,35, c'est beaucoup pour des albedos de jungle.

Portee du changement, verifiee avant de mesurer : seuls les MeshStandardMaterial
reagissent aux lumieres de scene. La mer, le ciel et les bandeaux d'horizon sont
des ShaderMaterial / BasicMaterial — ils ne bougeront pas. C'est precieux : le
ciel devient un TEMOIN. S'il bouge, c'est la mesure qui est fausse.

Protocole A-B-A. On n'a pas de pause exploitable, et deux parties completes ne
rejouent pas a l'identique (97 % de coque contre 94 % sur deux captures du meme
scenario). On injecte donc la variante SANS recharger, et on encadre chaque
mesure de deux captures de reference : l'ecart entre ces deux-la donne le
PLANCHER DE BRUIT du au defilement. Un effet sous ce plancher n'est pas un effet.
"""
from __future__ import annotations

import json
import os
import shutil
from pathlib import Path

import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright

RACINE = Path(__file__).resolve().parents[1]
SORTIE = RACINE / "previews" / "lumiere"
URL = os.environ.get("YOLE_URL", "http://127.0.0.1:8791/index.html?debug")

# (hemisphere, directionnel). La reference d'abord.
VARIANTES = [
    ("ref", 2.22, 4.35),
    ("B", 1.40, 4.35),
    ("C", 0.90, 4.35),
    ("D", 1.40, 3.40),
    ("E", 0.90, 3.00),
    ("F", 0.60, 4.80),
]

# Regions du cadre 1280x760, hors interface.
ZONES = {
    "ciel (temoin)": (30, 140, 400, 900),
    "horizon+mornes": (195, 275, 300, 1250),
    "yole": (350, 520, 380, 780),
}
W = np.array([0.2126, 0.7152, 0.0722], np.float32)


def mesure(chemin, zone):
    y0, y1, x0, x1 = zone
    a = np.asarray(Image.open(chemin).convert("RGB")).astype(np.float32) / 255.0
    px = a[y0:y1, x0:x1].reshape(-1, 3)
    mx, mn = px.max(1), px.min(1)
    return float((px @ W).mean()), float(((mx - mn) / np.maximum(mx, 1e-4)).mean())


def chromium():
    for nom in ("chrome", "chromium", "msedge", "google-chrome"):
        chemin = shutil.which(nom)
        if chemin:
            return chemin
    return None


# ⚠️ Ecrire dans `hemisphere.intensity` ne sert a RIEN : frame() reecrit les deux
# intensites depuis la meteo a chaque tour, la valeur injectee vivait 16 ms. Le
# premier balayage a mesure du bruit de defilement et rien d'autre — le plancher
# A-B-A l'a d'ailleurs refuse. On ecrit dans `lightBase`, que frame() lit.
REGLER = """(v) => {
  const g = window.__YOLE_DEBUG__?.game;
  if (!g) return 'pas de crochet debug';
  g.lightBase.hemisphere = v[0];
  g.lightBase.sun = v[1];
  return `${g.lightBase.hemisphere} / ${g.lightBase.sun}`;
}"""


def main() -> int:
    SORTIE.mkdir(parents=True, exist_ok=True)
    lancement = {"headless": True, "args": [
        "--use-gl=angle", "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist",
    ]}
    exe = chromium()
    if exe:
        lancement["executable_path"] = exe

    with sync_playwright() as p:
        navigateur = p.chromium.launch(**lancement)
        page = navigateur.new_page(viewport={"width": 1280, "height": 760})
        page.goto(URL, wait_until="networkidle", timeout=90000)
        page.wait_for_timeout(2500)
        if page.evaluate("() => !window.__YOLE_DEBUG__") :
            print("ERREUR : __YOLE_DEBUG__ absent — l'URL doit porter ?debug")
            navigateur.close()
            return 1
        page.evaluate("document.getElementById('playBtn').click()")
        page.wait_for_timeout(6000)
        page.keyboard.press("KeyW")
        page.wait_for_timeout(2500)
        # On GELE la simulation. `paused` coupe la boucle a pas fixe mais laisse
        # frame() rendre : la scene devient immobile, et le plancher de bruit du
        # au defilement — +12 % sur l'horizon, qui avalait tous les effets —
        # tombe. On passe par le champ, pas par togglePause() qui ouvre le modal.
        # `paused` ne suffit pas : atmosphere.update() tourne sur le temps REEL
        # et le Grain continue de monter. Il assombrit la couleur d'horizon —
        # donc le ciel, le brouillard et la brume — de facon MONOTONE. On le
        # voyait au 3e echantillon de chaque balayage : un pas de -13 % qui ne
        # revenait jamais, identique pour trois variantes differentes. Les
        # mesures au-dela de la deuxieme paire etaient toutes empoisonnees.
        page.evaluate("""() => {
          const g = window.__YOLE_DEBUG__.game;
          g.paused = true;
          const fige = g.atmosphere.update(0, g.time, g.boats[0].visual.root.position, g.stormZ);
          g.atmosphere.update = () => fige;
        }""")
        page.wait_for_timeout(600)

        for nom, hemi, soleil in VARIANTES:
            page.evaluate(REGLER, [hemi, soleil])
            page.wait_for_timeout(260)
            page.screenshot(path=str(SORTIE / f"{nom}.png"))
            if nom != "ref":  # capture de reference d'encadrement
                page.evaluate(REGLER, [VARIANTES[0][1], VARIANTES[0][2]])
                page.wait_for_timeout(260)
                page.screenshot(path=str(SORTIE / f"ref_apres_{nom}.png"))
        navigateur.close()

    print(f"{'variante':<10} {'hemi':>5} {'soleil':>7}   " + "  ".join(f"{z:<16}" for z in ZONES))
    base = {z: mesure(SORTIE / "ref.png", zone) for z, zone in ZONES.items()}
    print(f"{'ref':<10} {2.22:>5.2f} {4.35:>7.2f}   " + "  ".join(
        f"{base[z][0]:.3f}/{base[z][1]:.3f}     " for z in ZONES))

    bruit = {z: [] for z in ZONES}
    for nom, hemi, soleil in VARIANTES[1:]:
        ligne = f"{nom:<10} {hemi:>5.2f} {soleil:>7.2f}   "
        for z, zone in ZONES.items():
            lum, sat = mesure(SORTIE / f"{nom}.png", zone)
            rl, _ = mesure(SORTIE / f"ref_apres_{nom}.png", zone)
            bruit[z].append(abs(rl - base[z][0]))
            ligne += f"{lum:.3f}/{sat:.3f} ({100*(lum-base[z][0])/max(base[z][0],1e-4):+5.1f}%)  "
        print(ligne)

    print()
    print("plancher de bruit (derive du defilement entre deux captures de reference) :")
    for z in ZONES:
        b = np.array(bruit[z])
        print(f"  {z:<16} moyen {100*b.mean()/max(base[z][0],1e-4):+.1f} %   pire {100*b.max()/max(base[z][0],1e-4):+.1f} %")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
