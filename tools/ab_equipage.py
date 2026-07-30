"""Que rapporterait, MESURE, chaque correction envisagee sur les equipages ?

⚠️ ON MESURE LA CORRECTION, PAS L'HYPOTHESE. Constater que les yoles coutent
cher ne dit pas quelle correction rapporte quoi. Chaque bras applique ici une
modification REELLE au materiau ou au maillage, en alternance serree avec la
scene d'origine, et rapporte le gain apparie.

Ce qui est teste, et pourquoi :

  1. MeshPhysicalMaterial -> MeshStandardMaterial. Le GLB des equipiers declare
     KHR_materials_specular (specularColorFactor 2,0) et KHR_materials_ior
     (1,45, quasi le defaut de three.js). Ces deux extensions suffisent a faire
     instancier a three.js son materiau le PLUS CHER, pour 24 personnages.
  2. doubleSided -> FrontSide. Le GLB porte doubleSided:true : chaque triangle
     d'equipier est rasterise deux fois, faces arriere comprises.
  3. Sans emissiveMap. assets.js met emissiveIntensity a 0, mais la TEXTURE
     reste branchee : three.js compile alors USE_EMISSIVEMAP et prend un
     echantillon par fragment... pour le multiplier par zero.
  4. Les trois ensemble.
  5. Equipages masques : la borne haute, ce que couterait leur suppression.

    PORT=8802 node tools/server.mjs &
    python tools/ab_equipage.py
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
TELEPHONE = {"width": 390, "height": 844}
DPR = 3
IMAGES = int(os.environ.get("YOLE_IMAGES", "9"))
PAIRES = int(os.environ.get("YOLE_PAIRES", "5"))

PREPARER = """() => {
  const jeu = window.__YOLE_DEBUG__.game;
  const THREE = jeu.THREE;
  // Inventaire des maillages skinnes d'equipage, avec leur materiau d'origine.
  const peaux = [];
  jeu.boats.forEach((b) => b.visual?.root?.traverse?.((o) => {
    if (o.isSkinnedMesh) peaux.push({ maillage: o, origine: o.material });
  }));
  window.__peaux = peaux;

  // Les variantes sont construites UNE FOIS : compiler un programme au milieu
  // d'un bloc chronometre mesurerait le compilateur, pas le rendu.
  const variantes = window.__variantes = {};
  const source = peaux[0]?.origine;
  if (source) {
    const commun = {
      map: source.map, normalMap: source.normalMap,
      roughness: source.roughness, metalness: source.metalness,
      side: source.side, skinning: true
    };
    variantes.standard = new THREE.MeshStandardMaterial(commun);
    variantes.frontSide = source.clone(); variantes.frontSide.side = THREE.FrontSide;
    variantes.sansEmissive = source.clone(); variantes.sansEmissive.emissiveMap = null;
    variantes.sansEmissive.needsUpdate = true;
    variantes.tout = new THREE.MeshStandardMaterial({ ...commun, side: THREE.FrontSide });
  }
  return {
    peaux: peaux.length,
    materiauOrigine: source?.type ?? null,
    doubleSided: source ? source.side === THREE.DoubleSide : null,
    emissiveMap: Boolean(source?.emissiveMap),
    emissiveIntensity: source?.emissiveIntensity ?? null,
    trianglesParEquipier: peaux[0]
      ? Math.round((peaux[0].maillage.geometry.index?.count
                    ?? peaux[0].maillage.geometry.attributes.position.count) / 3) : null
  };
}"""

BRAS = """(config) => {
  const jeu = window.__YOLE_DEBUG__.game;
  const rendu = jeu.renderer;
  const gl = rendu.getContext();
  const pixel = new Uint8Array(4);
  const peaux = window.__peaux;
  const variantes = window.__variantes;

  const appliquer = () => {
    if (config.masquer) { for (const p of peaux) p.maillage.visible = false; return; }
    const v = variantes[config.variante];
    if (v) for (const p of peaux) p.maillage.material = v;
  };
  const restaurer = () => {
    for (const p of peaux) { p.maillage.visible = true; p.maillage.material = p.origine; }
  };

  let horloge = performance.now();
  const image = () => { horloge += 16.67; jeu.frame(horloge); };
  const bloc = (n) => {
    for (let i = 0; i < 3; i++) image();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    const ms = [];
    for (let i = 0; i < n; i++) {
      const t0 = performance.now();
      image();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      ms.push(performance.now() - t0);
    }
    ms.sort((a, b) => a - b);
    return ms[Math.floor(ms.length / 2)];
  };

  const gains = [];
  for (let k = 0; k < config.paires; k++) {
    const ref = bloc(config.images);
    appliquer();
    const test = bloc(config.images);
    restaurer();
    gains.push({ ref, gain: ref - test });
  }
  const g = gains.map((x) => x.gain).sort((a, b) => a - b);
  const r = gains.map((x) => x.ref).sort((a, b) => a - b);
  return {
    referenceMediane: +r[Math.floor(r.length / 2)].toFixed(2),
    gainMedian: +g[Math.floor(g.length / 2)].toFixed(2),
    gainMin: +g[0].toFixed(2), gainMax: +g[g.length - 1].toFixed(2),
    signeConstant: (g[0] > 0) === (g[g.length - 1] > 0),
    programmes: rendu.info.programs?.length ?? null
  };
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
        contexte = nav.new_context(viewport=TELEPHONE, device_scale_factor=DPR,
                                   is_mobile=True, has_touch=True)
        page = contexte.new_page()
        page.goto(URL, wait_until="networkidle", timeout=120000)
        page.wait_for_function("Boolean(window.__YOLE_DEBUG__)", timeout=60000)
        page.evaluate("document.getElementById('playBtn').click()")
        page.wait_for_function(
            "window.__YOLE_DEBUG__.getState && window.__YOLE_DEBUG__.getState().tick > 90",
            timeout=90000)
        page.evaluate("() => window.__YOLE_DEBUG__.game.quality.setTier(2, true)")
        page.evaluate("() => window.__YOLE_DEBUG__.game.renderer.setAnimationLoop(null)")

        etat = page.evaluate(PREPARER)
        bras = [
            {"cle": "1. Physical -> Standard", "config": {"variante": "standard"}},
            {"cle": "2. doubleSided -> FrontSide", "config": {"variante": "frontSide"}},
            {"cle": "3. sans emissiveMap", "config": {"variante": "sansEmissive"}},
            {"cle": "4. les trois ensemble", "config": {"variante": "tout"}},
            {"cle": "5. equipages masques (borne haute)", "config": {"masquer": True}},
        ]
        resultats = []
        for b in bras:
            resultats.append({"bras": b["cle"], **page.evaluate(
                BRAS, {**b["config"], "images": IMAGES, "paires": PAIRES})})
        nav.close()

    for r in resultats:
        base = r["referenceMediane"] or 1
        r["part"] = f"{100 * r['gainMedian'] / base:.0f} %"
        if not r["signeConstant"]:
            r["part"] += " (BRUIT)"
    print(json.dumps({
        "avertissement": "SwiftShader : gains RELATIFS, pas des ms mobiles",
        "equipage": etat,
        "bras": resultats,
    }, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
