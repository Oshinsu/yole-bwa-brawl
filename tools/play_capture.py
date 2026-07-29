"""Joue reellement au jeu dans un vrai navigateur, et en rapporte des captures.

Le harnais Node mesure la simulation ; il ne voit rien. Le panneau navigateur de
la session ne composite pas. Playwright, lui, ouvre un Chromium reel avec WebGL :
c'est le seul moyen de REGARDER le jeu plutot que de le supposer.
"""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

RACINE = Path(r"C:\Users\Gary\Desktop\yole_bwa_brawl_threejs_tropical_mayhem_v3_2")
SORTIE = Path(__file__).resolve().parent.parent / "previews"
import os
URL = os.environ.get("YOLE_URL", "http://127.0.0.1:8791/index.html")
# ⚠️ `window.__YOLE_DEBUG__` n'est publie que derriere `?debug`. Sans lui,
# YOLE_QUALITE ne faisait RIEN : `window.__YOLE_DEBUG__?.game` valait undefined et
# le chainage optionnel avalait l'appel sans erreur. Les captures « HQ » etaient
# donc prises au palier choisi par l'auto-qualite, c'est-a-dire LQ sous
# SwiftShader — soit precisement le seul palier qui contourne le post-FX.
if "debug" not in URL:
    URL += ("&" if "?" in URL else "?") + "debug=1"


def chromium():
    for nom in ("chrome", "chromium", "msedge", "google-chrome"):
        chemin = shutil.which(nom)
        if chemin:
            return chemin
    return None


def main():
    erreurs = []
    with sync_playwright() as p:
        lancement = {"headless": True, "args": [
            "--use-gl=angle", "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist",
        ]}
        exe = chromium()
        if exe:
            lancement["executable_path"] = exe
        navigateur = p.chromium.launch(**lancement)
        page = navigateur.new_page(viewport={"width": 1280, "height": 760})
        page.on("console", lambda m: erreurs.append(f"{m.type}: {m.text}") if m.type == "error" else None)
        page.on("pageerror", lambda e: erreurs.append(f"pageerror: {e}"))

        page.goto(URL, wait_until="networkidle", timeout=60000)
        page.wait_for_timeout(2500)
        page.screenshot(path=str(SORTIE / "01_menu.png"))

        # On lance une partie et on la LAISSE tourner, sans piloter : c'est l'IA
        # qui joue, et c'est deja representatif de ce que le joueur voit.
        # Qualite forcee par YOLE_QUALITE : LQ contourne le post-FX et recoit
        # donc le tone mapping du renderer, MQ/HQ passent par la cible de rendu
        # et ne le recoivent PAS. Les deux chemins ne sont pas colorimetriquement
        # equivalents — c'est ce qu'on veut mesurer.
        qualite = os.environ.get("YOLE_QUALITE")
        if qualite:
            page.evaluate("(q) => { const g = window.__YOLE_DEBUG__?.game; if (g) { g.quality.setTier({LQ:0,MQ:1,HQ:2}[q], true); } }", qualite)
            page.wait_for_timeout(300)
        page.evaluate("document.getElementById('playBtn').click()")
        page.wait_for_timeout(3000)
        page.screenshot(path=str(SORTIE / "02_depart.png"))

        # Puis on pilote : barre a droite, turbo, arme.
        page.keyboard.down("KeyD")
        page.wait_for_timeout(1200)
        page.keyboard.up("KeyD")
        page.keyboard.press("KeyW")
        page.wait_for_timeout(2500)
        page.screenshot(path=str(SORTIE / "03_course.png"))

        for _ in range(6):
            page.keyboard.press("Space")
            page.keyboard.press("ShiftLeft")
            page.wait_for_timeout(700)
        page.wait_for_timeout(2000)
        page.screenshot(path=str(SORTIE / "04_combat.png"))

        # Longue course : le Grain arrive, la mer se creuse, les caisses defilent.
        page.wait_for_timeout(14000)
        page.screenshot(path=str(SORTIE / "05_grain.png"))

        etat = page.evaluate("""() => ({
          perf: document.getElementById('perfStats')?.textContent ?? '',
          vitesse: document.getElementById('speedValue')?.textContent ?? '',
          coque: document.getElementById('hullText')?.textContent ?? '',
          turbo: document.getElementById('flowText')?.textContent ?? '',
          arme: document.getElementById('weaponSlotName')?.textContent ?? '',
          armeCd: document.getElementById('weaponSlotCd')?.textContent ?? '',
          barreTurbo: document.getElementById('flowBar')?.style.width ?? '',
          barreCoque: document.getElementById('hullBar')?.style.width ?? '',
          mode: document.getElementById('hud')?.classList.contains('hidden') ? 'hors course' : 'en course'
        })""")
        navigateur.close()

    print(json.dumps({"etat": etat, "erreurs": erreurs[:10]}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
