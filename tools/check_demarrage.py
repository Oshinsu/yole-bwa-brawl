"""Ou part le temps pendant les premieres secondes ?

« Ca rame au debut a chaque fois » : le « a chaque fois » ecarte le cache froid.
Ce n'est donc pas du telechargement mais du travail REFAIT a chaque session —
compilation de shaders, televersement de textures, allocation.

Le harnais enregistre, image par image :
  - le delta rAF->rAF (c'est CA que le joueur ressent, pas le temps GPU) ;
  - les compteurs three.js (programmes, textures, geometries, appels de rendu) ;
  - les taches longues (PerformanceObserver longtask) avec leur attribution.

Un pic de dt qui coincide avec `programs+N` est une compilation de shader ;
avec `textures+N` un televersement ; avec ni l'un ni l'autre, du calcul JS.

⚠️ SwiftShader compile en logiciel : les valeurs absolues sont gonflees. C'est
la FORME de la courbe et l'ATTRIBUTION des pics qui informent, pas les ms.

    PORT=8791 python tools/serve.py &
    python tools/check_demarrage.py
"""
from __future__ import annotations

import json
import os
import shutil

from playwright.sync_api import sync_playwright

URL = os.environ.get("YOLE_URL", "http://127.0.0.1:8791/index.html")
if "debug" not in URL:
    URL += ("&" if "?" in URL else "?") + "debug=1"
IMAGES = int(os.environ.get("YOLE_IMAGES", "260"))

SONDE = """() => {
  const g = window.__YOLE_DEBUG__.game;
  const r = g.renderer;
  const t = { images: [], longues: [] };
  window.__demarrage = t;

  try {
    new PerformanceObserver((liste) => {
      for (const e of liste.getEntries())
        t.longues.push({ ms: +e.duration.toFixed(1), debut: +e.startTime.toFixed(0) });
    }).observe({ entryTypes: ["longtask"] });
  } catch { /* pas de longtask sur ce navigateur */ }

  // ⚠️ NE PAS instrumenter r.render : le PostFX l'appelle CINQ fois par image
  // (prefiltre bloom, deux flous, composite, scene). Mesurer entre deux appels
  // donne une mediane de 0 ms et place un faux pic tous les 5 « echantillons ».
  // On mesure donc d'image a image, en enveloppant la boucle d'animation.
  let passes = 0;
  const brutRender = r.render.bind(r);
  r.render = (scene, camera) => { passes++; return brutRender(scene, camera); };

  let precedent = performance.now();
  let dernier = { p: 0, tx: 0, g: 0 };
  const brutLoop = r.setAnimationLoop.bind(r);
  r.setAnimationLoop = (cb) => brutLoop(cb && ((heure, cadre) => {
    const avant = performance.now();
    passes = 0;
    cb(heure, cadre);
    const now = performance.now();
    const info = r.info;
    const p = info.programs ? info.programs.length : 0;
    const tx = info.memory.textures, ge = info.memory.geometries;
    t.images.push({
      n: t.images.length,
      dt: +(now - precedent).toFixed(2),   // image a image : ce que le joueur subit
      travail: +(now - avant).toFixed(2),  // le travail dans l'image
      passes,
      dProg: p - dernier.p, dTex: tx - dernier.tx, dGeo: ge - dernier.g,
      prog: p, appels: info.render.calls
    });
    dernier = { p, tx, g: ge };
    precedent = now;
  }));
  // La boucle tourne deja : on la relance a travers notre enveloppe.
  const actuel = r.getAnimationLoop ? r.getAnimationLoop() : (g.boucle || null);
  if (g.frame) r.setAnimationLoop(g.frame.bind(g));
  else if (actuel) r.setAnimationLoop(actuel);
}"""


def chromium():
    for nom in ("chrome", "chromium", "msedge", "google-chrome"):
        chemin = shutil.which(nom)
        if chemin:
            return chemin
    return None


def main():
    with sync_playwright() as p:
        lancement = {"headless": True, "args": [
            "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]}
        exe = chromium()
        if exe:
            lancement["executable_path"] = exe
        nav = p.chromium.launch(**lancement)
        page = nav.new_page(viewport={"width": 1280, "height": 720})
        page.goto(URL, wait_until="networkidle", timeout=60000)
        page.wait_for_function("Boolean(window.__YOLE_DEBUG__)", timeout=30000)
        page.evaluate(SONDE)
        page.evaluate("document.getElementById('playBtn').click()")
        page.wait_for_function(
            f"window.__demarrage && window.__demarrage.images.length >= {IMAGES}",
            timeout=180000)
        data = page.evaluate("() => window.__demarrage")
        nav.close()

    im = data["images"]
    dts = [x["dt"] for x in im]
    ordre = sorted(dts)

    def centile(q):
        return ordre[min(len(ordre) - 1, int(len(ordre) * q))]

    print(f"{len(im)} images  |  median {centile(.5):.1f} ms  p95 {centile(.95):.1f} ms  max {max(dts):.1f} ms")
    seuil = max(centile(.5) * 2.5, 40)
    print(f"\nPICS (> {seuil:.0f} ms) et leur cause :")
    for x in im:
        if x["dt"] > seuil:
            cause = []
            if x["dProg"]: cause.append(f"+{x['dProg']} SHADER")
            if x["dTex"]: cause.append(f"+{x['dTex']} texture")
            if x["dGeo"]: cause.append(f"+{x['dGeo']} geometrie")
            print(f"   image {x['n']:4}  dt={x['dt']:8.1f} ms  rendu={x["travail"]:7.1f}  "
                  f"{', '.join(cause) or 'aucun compteur — JS pur'}")
    print(f"\nProgrammes compiles au total : {im[-1]['prog']}")
    prem = [x for x in im if x["dProg"]]
    print(f"Images ayant compile un shader : {len(prem)}  "
          f"(derniere : image {prem[-1]['n'] if prem else '-'})")
    cumul = sum(x["dt"] for x in im if x["dProg"])
    print(f"Temps cumule sur les images qui compilent : {cumul:.0f} ms")
    print(f"\nTaches longues (>50 ms) : {len(data['longues'])}")
    for t in data["longues"][:8]:
        print(f"   {t['ms']:.0f} ms a t={t['debut']} ms")


if __name__ == "__main__":
    main()
