"""Les nouveaux retours visuels EXISTENT-ILS vraiment a l'ecran ?

Compiler et passer les tests ne prouve pas qu'on VOIT quelque chose. Ce harnais
declenche chaque effet dans une vraie partie et le constate :

  - nombres de degats : combien de divs .damage-number sont opaques ;
  - harpon rate : combien de segments du pool sont visibles ;
  - gorgee de rhum : rotation reelle du bras droit d'un equipier ;
  - explosion : capture d'ecran au moment de la detonation ;
  - camera de mort : la camera suit-elle encore NOTRE epave ?

    PORT=8791 python tools/serve.py &
    python tools/check_feedback.py
"""
from __future__ import annotations

import json
import os
import shutil
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8")

URL = os.environ.get("YOLE_URL", "http://127.0.0.1:8791/index.html")
if "debug" not in URL:
    URL += ("&" if "?" in URL else "?") + "debug=1"
SORTIE = Path(__file__).resolve().parent.parent / "previews" / "feedback"


def chromium():
    for nom in ("chrome", "chromium", "msedge", "google-chrome"):
        chemin = shutil.which(nom)
        if chemin:
            return chemin
    return None


def main():
    SORTIE.mkdir(parents=True, exist_ok=True)
    rapport = {}
    erreurs = []
    with sync_playwright() as p:
        lancement = {"headless": True, "args": [
            "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]}
        exe = chromium()
        if exe:
            lancement["executable_path"] = exe
        nav = p.chromium.launch(**lancement)
        page = nav.new_page(viewport={"width": 1280, "height": 720}, device_scale_factor=2)
        page.on("pageerror", lambda e: erreurs.append(str(e)[:180]))
        page.on("console", lambda m: erreurs.append(m.text[:180]) if m.type == "error" else None)
        page.goto(URL, wait_until="networkidle", timeout=60000)
        page.wait_for_function("Boolean(window.__YOLE_DEBUG__)", timeout=30000)
        page.evaluate("document.getElementById('playBtn').click()")
        page.wait_for_function("window.__YOLE_DEBUG__.getState().tick > 180", timeout=90000)

        # ── 1. DEGATS CHIFFRES ────────────────────────────────────────────
        page.evaluate("""() => {
          const g = window.__YOLE_DEBUG__.game;
          const joueur = g.boats[0];
          for (const cible of g.boats.slice(1, 3)) {
            cible.applyHit(joueur, { fromWeapon: true, rollImpulse: 0.4,
                                     structure: { hull: 0.20 } });
          }
          joueur.applyHit(g.boats[1], { fromWeapon: true, rollImpulse: 0.5,
                                        structure: { hull: 0.13 } });
        }""")
        page.wait_for_timeout(320)
        rapport["degats"] = page.evaluate("""() => {
          const els = [...document.querySelectorAll('.damage-number')];
          return { total: els.length,
                   visibles: els.filter(e => parseFloat(e.style.opacity || 0) > 0.05)
                              .map(e => ({ texte: e.textContent, classe: e.className,
                                           transform: (e.style.transform || '').slice(0, 46) })) };
        }""")
        page.screenshot(path=str(SORTIE / "degats.png"))

        # ── 2. HARPON RATE ────────────────────────────────────────────────
        page.evaluate("""() => {
          const g = window.__YOLE_DEBUG__.game, j = g.boats[0];
          j.cooldowns.harpoon = 0;
          // On vise le large : aucune coque sur l'axe, donc echec garanti.
          g.fireHarpoon(j, null);
        }""")
        page.wait_for_timeout(260)
        rapport["harponRate"] = page.evaluate("""() => {
          const g = window.__YOLE_DEBUG__.game;
          const v = g.harpoonMisses || [];
          return { pool: v.length,
                   enVol: v.filter(i => i.life > 0).length,
                   lignesVisibles: v.filter(i => i.line && i.line.visible).length };
        }""")
        page.screenshot(path=str(SORTIE / "harpon.png"))

        # ── 3. GORGEE DE RHUM ─────────────────────────────────────────────
        page.evaluate("""() => {
          const g = window.__YOLE_DEBUG__.game, j = g.boats[0];
          j.cooldowns.rhum = 0; j.ammo.rhum = 3;
          g.drinkRhum(j);
        }""")
        page.wait_for_timeout(420)
        rapport["rhum"] = page.evaluate("""() => {
          const g = window.__YOLE_DEBUG__.game, v = g.boats[0].visual;
          const bras = (v.crew || []).map(c => +(c.visual.rightArmPivot?.rotation.x ?? 0).toFixed(3));
          return { minuteur: +(v.drinkTimer ?? 0).toFixed(2), brasDroits: bras,
                   // Un bras leve pour boire descend vers -2,25 rad.
                   leves: bras.filter(x => x < -1.2).length };
        }""")
        page.screenshot(path=str(SORTIE / "rhum.png"))

        # ── 4. EXPLOSION + CAMERA DE MORT ─────────────────────────────────
        avant = page.evaluate("() => ({ x: window.__YOLE_DEBUG__.game.camera.position.x })")
        page.evaluate("""() => {
          const g = window.__YOLE_DEBUG__.game;
          g.eliminate(g.boats[0], 'CHAVIRÉ');
        }""")
        page.wait_for_timeout(420)
        page.screenshot(path=str(SORTIE / "explosion.png"))
        rapport["cameraDeMort"] = page.evaluate("""() => {
          const g = window.__YOLE_DEBUG__.game;
          const j = g.boats[0];
          const d = Math.hypot(g.camera.position.x - j.x, g.camera.position.z - j.z);
          return { minuteur: +(g.deathCamTimer ?? 0).toFixed(2),
                   distanceANotreEpave: +d.toFixed(1),
                   joueurElimine: j.eliminated };
        }""")
        # Apres expiration, la camera doit avoir change de cible.
        page.wait_for_timeout(4200)
        rapport["apresDeathCam"] = page.evaluate("""() => {
          const g = window.__YOLE_DEBUG__.game, j = g.boats[0];
          const d = Math.hypot(g.camera.position.x - j.x, g.camera.position.z - j.z);
          return { minuteur: +(g.deathCamTimer ?? 0).toFixed(2),
                   distanceANotreEpave: +d.toFixed(1) };
        }""")
        nav.close()

    rapport["erreurs"] = erreurs[:6]
    print(json.dumps(rapport, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
