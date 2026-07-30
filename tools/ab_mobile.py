"""Combien coute CHAQUE poste de rendu ? Mesure par soustraction, GPU synchronise.

⚠️ POURQUOI PAS `performance.now()` AUTOUR DE render(). Les commandes WebGL sont
mises en FILE : `render()` rend la main des que les ordres sont soumis, pas quand
l'image est calculee. Chronometrer la soumission mesure le pilote, pas le GPU.
On force donc une synchronisation par `readPixels` d'un seul pixel apres chaque
image : l'appel BLOQUE jusqu'a ce que le GPU ait fini.

⚠️ CE QUE CE CLASSEMENT VAUT. Il tourne sous SwiftShader, un rasteriseur
LOGICIEL. Il ne predit pas des millisecondes sur un Adreno. Mais SwiftShader,
comme un GPU mobile et contrairement a une grosse carte de bureau, est domine
par le COUT PAR PIXEL — l'ordre relatif des postes de remplissage y est donc
informatif. Le cout des changements d'etat et des draw calls, lui, ne se
transpose pas : ne pas lire ce tableau comme un budget d'images.

⚠️ MESURE PAR SOUSTRACTION. On ne mesure pas un poste isole — on mesure la scene
entiere, puis la meme scene sans ce poste. La difference est ce qu'il coute EN
SITUATION, occlusion et etat comprises.

    PORT=8802 node tools/server.mjs &
    python tools/ab_mobile.py
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

# ⚠️ LES NOEUDS DE SCENE N'ONT PAS DE `name`. Une premiere version reperait les
# groupes par `noeud.name` : aucun ne correspondait, et les bras « sans ocean »,
# « sans monde », « sans yoles » n'ont tout simplement JAMAIS ete ajoutes au
# protocole. Le harnais ne mesurait plus que le post-traitement, sans le dire.
# On passe donc par les proprietes du jeu, qui sont la vraie structure.
INVENTAIRE = """() => {
  const jeu = window.__YOLE_DEBUG__.game;
  const compter = (racine) => {
    let maillages = 0, instances = 0, triangles = 0;
    racine?.traverse?.((o) => {
      if (!o.isMesh && !o.isPoints && !o.isLine) return;
      if (!o.visible) return;
      maillages++;
      if (o.isInstancedMesh) instances += o.count;
      const g = o.geometry;
      const n = g?.index ? g.index.count : (g?.attributes?.position?.count ?? 0);
      triangles += (n / 3) * (o.isInstancedMesh ? o.count : 1);
    });
    return { maillages, instances, triangles: Math.round(triangles) };
  };
  const racines = window.__racines = {};
  const ajouter = (cle, noeud) => { if (noeud?.traverse) racines[cle] = noeud; };
  ajouter("ocean", jeu.ocean?.group ?? jeu.ocean?.mesh ?? jeu.ocean?.root);
  ajouter("ciel", jeu.atmosphere?.group ?? jeu.atmosphere?.root ?? jeu.sky?.group);
  ajouter("monde", jeu.world?.group ?? jeu.world?.root);
  ajouter("particules", jeu.particles?.points ?? jeu.particles?.group);
  ajouter("debris", jeu.debris?.group ?? jeu.debris?.mesh);
  jeu.boats?.forEach((b, i) => ajouter(`yole${i}`, b.visual?.root));
  const sortie = {};
  for (const [cle, noeud] of Object.entries(racines)) sortie[cle] = compter(noeud);
  // Ce que la scene contient en dehors de ces racines connues.
  sortie.__scene = compter(jeu.scene);
  return sortie;
}"""

# ⚠️ ALTERNANCE SERREE, PAS DEUX BLOCS. Une premiere version mesurait tous les
# bras a la suite : entre le premier et le dernier, la partie avait avance de
# plus de trois secondes de jeu — camera deplacee, brume plus proche, objets
# differents a l'ecran. Les bras n'observaient plus la meme scene, et le
# classement sortait NON MONOTONE (pixelRatio 1,0 « plus lent » que 1,35, ce
# qui est impossible). On alterne donc reference/bras/reference/bras et on
# apparie les differences : la derive de scene s'annule entre voisins.
BRAS = """(config) => {
  const jeu = window.__YOLE_DEBUG__.game;
  const rendu = jeu.renderer;
  const gl = rendu.getContext();
  const pixel = new Uint8Array(4);

  const etat = {};
  const appliquer = () => {
    etat.eteints = [];
    for (const cle of (config.racines ?? [])) {
      const noeud = window.__racines[cle];
      if (noeud && noeud.visible) { noeud.visible = false; etat.eteints.push(noeud); }
    }
    // `bloom = 0` ne coupe pas que le halo : la chaine (prefiltre en demi-
    // resolution puis deux flous en quart) est SAUTEE. C'est ce que fait deja
    // le profil LQ, on mesure donc exactement ce gain-la.
    if (config.sansBloom && jeu.postFX) {
      etat.bloom = jeu.postFX.bloom;
      etat.streak = jeu.postFX.material.uniforms.uStreak.value;
      jeu.postFX.setQuality(0, { bloom: 0, streak: 0 });
    }
    if (config.sansOmbres) {
      etat.ombres = rendu.shadowMap.enabled;
      rendu.shadowMap.enabled = false;
    }
    // ⚠️ `setPixelRatio` SEUL NE SUFFIT PAS : les cibles du PostFX ont leur
    // propre taille et resteraient a l'ancienne resolution. Le jeu appelle
    // `resize()` juste apres, on fait pareil.
    if (config.pixelRatio) {
      etat.ratio = rendu.getPixelRatio();
      rendu.setPixelRatio(config.pixelRatio);
      jeu.resize();
    }
  };
  const restaurer = () => {
    for (const noeud of (etat.eteints ?? [])) noeud.visible = true;
    if (config.sansBloom && jeu.postFX) {
      jeu.postFX.setQuality(2, { bloom: etat.bloom, streak: etat.streak });
    }
    if (config.sansOmbres) rendu.shadowMap.enabled = etat.ombres;
    if (config.pixelRatio) { rendu.setPixelRatio(etat.ratio); jeu.resize(); }
  };

  // ⚠️ HORLOGE VIRTUELLE. `frame(performance.now())` reinjecte le temps REEL :
  // a 100 ms par image mesuree, l'accumulateur reclamait SIX sous-pas de
  // simulation par appel, et le chronometre additionnait simulation + rendu.
  // On avance de 16,67 ms par image, exactement un pas fixe, pour que la part
  // de simulation soit constante d'un bloc a l'autre.
  let horloge = performance.now();
  const image = () => { horloge += 16.67; jeu.frame(horloge); };

  const bloc = (n) => {
    // Chauffe : la premiere image apres un changement d'etat paie une
    // reallocation de cible ou une recompilation.
    for (let i = 0; i < 3; i++) image();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    const ms = [];
    for (let i = 0; i < n; i++) {
      const t0 = performance.now();
      image();
      // ⚠️ LA BARRIERE. Sans ce readPixels on chronometre la soumission.
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      ms.push(performance.now() - t0);
    }
    ms.sort((a, b) => a - b);
    return ms[Math.floor(ms.length / 2)];
  };

  const paires = [];
  let callsRef = 0, callsBras = 0;
  for (let k = 0; k < config.paires; k++) {
    const ref = bloc(config.images);
    callsRef = rendu.info.render.calls;
    appliquer();
    const test = bloc(config.images);
    callsBras = rendu.info.render.calls;
    restaurer();
    paires.push({ ref, test, gain: ref - test });
  }
  const gains = paires.map((p) => p.gain).sort((a, b) => a - b);
  const refs = paires.map((p) => p.ref).sort((a, b) => a - b);
  return {
    referenceMediane: +refs[Math.floor(refs.length / 2)].toFixed(2),
    gainMedian: +gains[Math.floor(gains.length / 2)].toFixed(2),
    gainMin: +gains[0].toFixed(2),
    gainMax: +gains[gains.length - 1].toFixed(2),
    // ⚠️ Le signe doit etre CONSTANT. Si un bras gagne parfois et perd d'autres
    // fois, c'est du bruit, pas un effet — on le dit au lieu de le moyenner.
    signeConstant: gains[0] > 0 === gains[gains.length - 1] > 0,
    callsReference: callsRef,
    callsBras: callsBras
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
        # ⚠️ ON FIGE LE PALIER. Sans cela le QualityManager change de profil au
        # milieu du protocole et les bras ne sont plus comparables.
        page.evaluate("() => window.__YOLE_DEBUG__.game.quality.setTier(2, true)")
        page.evaluate("() => { window.__YOLE_DEBUG__.game.renderer.setAnimationLoop(null); }")

        inventaire = page.evaluate(INVENTAIRE)
        presentes = [c for c in inventaire if c != "__scene"]

        bras = [
            {"cle": "sans bloom + streak", "config": {"sansBloom": True}},
            {"cle": "sans ombres", "config": {"sansOmbres": True}},
            {"cle": "pixelRatio 1.0 (le profil MQ)", "config": {"pixelRatio": 1.0}},
            {"cle": "pixelRatio 0.78 (le profil LQ)", "config": {"pixelRatio": 0.78}},
        ]
        for cle in ("ocean", "ciel", "monde", "particules", "debris"):
            if cle in presentes:
                bras.append({"cle": f"sans {cle}", "config": {"racines": [cle]}})
        yoles = [c for c in presentes if c.startswith("yole")]
        if yoles:
            bras.append({"cle": f"sans les {len(yoles)} yoles + equipages",
                         "config": {"racines": yoles}})

        resultats = []
        for b in bras:
            config = {**b["config"], "images": IMAGES, "paires": PAIRES}
            resultats.append({"bras": b["cle"], **page.evaluate(BRAS, config)})
        nav.close()

    for r in resultats:
        base = r["referenceMediane"] or 1
        r["partDuCout"] = f"{100 * r['gainMedian'] / base:.0f} %"
        if not r["signeConstant"]:
            r["partDuCout"] += "  (BRUIT : le signe change d'une paire a l'autre)"

    print(json.dumps({
        "avertissement": "SwiftShader : classement relatif de cout par pixel, PAS des ms mobiles",
        "appareil": {**TELEPHONE, "dpr": DPR, "imagesParBloc": IMAGES, "paires": PAIRES},
        "scene": inventaire,
        "bras": sorted(resultats, key=lambda r: -r["gainMedian"]),
    }, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
