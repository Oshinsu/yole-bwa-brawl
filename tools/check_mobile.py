"""Ce que le jeu demande VRAIMENT a un telephone, mesure image par image.

⚠️ CE QUE CE HARNAIS PEUT ET NE PEUT PAS DIRE. Il tourne sous SwiftShader, un
rendu LOGICIEL : les millisecondes qu'il produit ne predisent pas un Adreno ou
un Apple GPU, et je ne les presente pas comme telles. Ce qu'il mesure est
exact et independant du GPU :

  - le PALIER de qualite au demarrage et sa trajectoire dans le temps ;
  - les DRAW CALLS et les triangles par image (`renderer.info`) ;
  - le nombre d'appels a `render()` par image, donc de passes plein ecran ;
  - la surface reellement rasterisee par image, DPR compris ;
  - la memoire de textures et de geometries tenue par three.js ;
  - le nombre de sous-pas de simulation executes par image.

Ces grandeurs-la sont les memes sur un telephone que sous SwiftShader. Ce sont
elles qui decident si un mobile tient, pas le chiffre de FPS d'ici.

    PORT=8802 node tools/server.mjs &
    python tools/check_mobile.py
"""
from __future__ import annotations

import json
import os
import shutil
import sys

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
BASE = os.environ.get("YOLE_URL", "http://127.0.0.1:8802/index.html")
URL = BASE + ("&" if "?" in BASE else "?") + "debug"

# Un telephone courant : 390x844 en points, ecran dense. Le DPR est le facteur
# le plus brutal du rendu mobile — il eleve la surface au CARRE.
TELEPHONE = {"width": 390, "height": 844}
DPR = 3
# Etranglement du fil principal. Un telephone milieu de gamme est environ 4x
# plus lent qu'un portable de developpement sur du JavaScript monofil.
ETRANGLEMENT = 4

INSTRUMENTER = """() => {
  const jeu = window.__YOLE_DEBUG__.game;
  const rendu = jeu.renderer;
  // ⚠️ ON COMPTE LES APPELS A render(), PAS LES IMAGES. La chaine PostFX en
  // enchaine plusieurs par image ; confondre les deux a deja fausse une mesure
  // de cette base de code (les medianes tombaient a zero).
  window.__mob = { appelsRender: 0, images: 0, ms: [], paliers: [], sousPas: [] };
  const origine = rendu.render.bind(rendu);
  rendu.render = (scene, camera) => { window.__mob.appelsRender++; return origine(scene, camera); };
  const image = jeu.frame.bind(jeu);
  let precedent = performance.now();
  let sousPasPrecedent = jeu.tick ?? 0;
  jeu.frame = (maintenant) => {
    const debut = performance.now();
    const sortie = image(maintenant);
    const m = window.__mob;
    m.images++;
    m.ms.push(performance.now() - debut);
    m.paliers.push(jeu.quality.tier);
    m.sousPas.push((jeu.tick ?? 0) - sousPasPrecedent);
    sousPasPrecedent = jeu.tick ?? 0;
    precedent = debut;
    return sortie;
  };
  return true;
}"""

RELEVE = """() => {
  const jeu = window.__YOLE_DEBUG__.game;
  const rendu = jeu.renderer;
  const m = window.__mob;
  const canvas = rendu.domElement;
  const trie = [...m.ms].sort((a, b) => a - b);
  const mediane = trie.length ? trie[Math.floor(trie.length / 2)] : null;
  const p95 = trie.length ? trie[Math.floor(trie.length * 0.95)] : null;
  return {
    images: m.images,
    appelsRenderParImage: m.images ? +(m.appelsRender / m.images).toFixed(2) : null,
    msMediane: mediane != null ? +mediane.toFixed(2) : null,
    msP95: p95 != null ? +p95.toFixed(2) : null,
    sousPasMax: m.sousPas.length ? Math.max(...m.sousPas) : null,
    sousPasMoyen: m.sousPas.length
      ? +(m.sousPas.reduce((a, b) => a + b, 0) / m.sousPas.length).toFixed(2) : null,
    palierDebut: m.paliers[0] ?? null,
    palierFin: m.paliers[m.paliers.length - 1] ?? null,
    palierMin: m.paliers.length ? Math.min(...m.paliers) : null,
    devicePixelRatio: window.devicePixelRatio,
    pixelRatioDemande: rendu.getPixelRatio(),
    canvasCss: `${canvas.clientWidth}x${canvas.clientHeight}`,
    canvasPixels: `${canvas.width}x${canvas.height}`,
    megapixelsParPasse: +((canvas.width * canvas.height) / 1e6).toFixed(3),
    info: {
      calls: rendu.info.render.calls,
      triangles: rendu.info.render.triangles,
      geometries: rendu.info.memory.geometries,
      textures: rendu.info.memory.textures,
      programmes: rendu.info.programs?.length ?? null
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
    erreurs = []
    with sync_playwright() as p:
        lancement = {"headless": True, "args": [
            "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]}
        exe = chromium()
        if exe:
            lancement["executable_path"] = exe
        nav = p.chromium.launch(**lancement)
        contexte = nav.new_context(viewport=TELEPHONE, device_scale_factor=DPR,
                                   is_mobile=True, has_touch=True)
        page = contexte.new_page()
        page.on("pageerror", lambda e: erreurs.append(str(e)[:160]))
        page.on("console", lambda m: erreurs.append(m.text[:160]) if m.type == "error" else None)

        cdp = contexte.new_cdp_session(page)
        cdp.send("Emulation.setCPUThrottlingRate", {"rate": ETRANGLEMENT})

        page.goto(URL, wait_until="networkidle", timeout=120000)
        page.wait_for_function("Boolean(window.__YOLE_DEBUG__)", timeout=60000)
        page.evaluate(INSTRUMENTER)
        page.evaluate("document.getElementById('playBtn').click()")

        # ⚠️ ON ECHANTILLONNE DANS LE TEMPS. Le palier de qualite BOUGE : le
        # relever une seule fois, a un instant choisi au hasard, ne dit rien de
        # ce que le joueur subit pendant ses premieres secondes.
        trajectoire = []
        ecoule = 0
        for seconde in (2, 5, 8, 12, 17, 24):
            page.wait_for_timeout((seconde - ecoule) * 1000)
            ecoule = seconde
            trajectoire.append({"t": seconde, **page.evaluate(
                "() => ({ palier: window.__YOLE_DEBUG__.game.quality.tier,"
                " moyenneMs: +window.__YOLE_DEBUG__.game.quality.frameAverage.toFixed(1),"
                " pixelRatio: window.__YOLE_DEBUG__.game.renderer.getPixelRatio(),"
                " calls: window.__YOLE_DEBUG__.game.renderer.info.render.calls })")})

        releve = page.evaluate(RELEVE)
        nav.close()

    rapport = {
        "appareilSimule": {**TELEPHONE, "dpr": DPR, "etranglementCpu": f"{ETRANGLEMENT}x"},
        "trajectoirePalier": trajectoire,
        "releve": releve,
        "erreurs": erreurs[:6],
    }
    # Surface reellement rasterisee : les passes plein ecran se paient en plus
    # de la scene. C'est le chiffre qui compte sur un GPU mobile.
    mp = releve.get("megapixelsParPasse") or 0
    passes = releve.get("appelsRenderParImage") or 0
    rapport["fillrate"] = {
        "megapixelsParPasse": mp,
        "passesParImage": passes,
        "megapixelsParImage": round(mp * passes, 2),
        "a60Hz_gigapixelsParSeconde": round(mp * passes * 60 / 1000, 2),
    }
    print(json.dumps(rapport, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
