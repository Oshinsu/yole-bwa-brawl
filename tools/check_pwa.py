"""Le jeu est-il VRAIMENT installable ? Chaque critere verifie, pas suppose.

⚠️ POURQUOI CE HARNAIS EXISTE. « La PWA est faite » est une affirmation qu'on ne
peut pas tenir en relisant le manifeste : une icone peut declarer `sizes` qui
ment, un `purpose` peut etre faux, une capture peut etre en 404, et rien de tout
cela n'apparait en console. Chrome refuse alors l'installation en silence.

Ce que le harnais controle, contre les fichiers reellement servis :

  - le manifeste se PARSE (une virgule en trop et tout tombe, sans erreur) ;
  - chaque icone et chaque capture repond 200 ET se DECODE dans le navigateur,
    aux dimensions exactes qu'elle declare ;
  - il existe une icone `any` >= 192 et une >= 512, et une `maskable` distincte ;
  - les icones maskables sont OPAQUES jusqu'aux coins — un lanceur Android
    recadre dans la forme de son choix et laisse voir son fond a travers l'alpha ;
  - `display`, `scope`, `start_url` et le service worker actif ;
  - la coherence `theme_color` entre le manifeste et la balise meta.

    PORT=8802 node tools/server.mjs &
    python tools/check_pwa.py
"""
from __future__ import annotations

import json
import os
import shutil
import sys

sys.stdout.reconfigure(encoding="utf-8")
URL = os.environ.get("YOLE_URL", "http://127.0.0.1:8802/index.html")

SONDE = """async () => {
  const lien = document.querySelector('link[rel=manifest]');
  if (!lien) return { erreur: "aucune balise <link rel=manifest>" };
  const reponse = await fetch(lien.href);
  if (!reponse.ok) return { erreur: `manifeste HTTP ${reponse.status}` };
  let manifeste;
  try { manifeste = JSON.parse(await reponse.text()); }
  catch (e) { return { erreur: `manifeste illisible : ${e.message}` }; }

  // ⚠️ ON DECODE POUR DE VRAI. Un HEAD 200 ne prouve pas qu'une image est
  // valide, ni qu'elle fait la taille annoncee, ni que le navigateur sait lire
  // son format — trois causes de rejet silencieux a l'installation.
  const mesurer = async (entree) => {
    const url = new URL(entree.src, lien.href).href;
    const res = await fetch(url);
    if (!res.ok) return { src: entree.src, statut: res.status };
    const blob = await res.blob();
    let bitmap = null;
    try { bitmap = await createImageBitmap(blob); } catch { /* format refuse */ }
    const mesure = bitmap ? `${bitmap.width}x${bitmap.height}` : null;
    const sortie = { src: entree.src, statut: res.status, declare: entree.sizes,
                     mesure, octets: blob.size, type: blob.type,
                     purpose: entree.purpose ?? null,
                     form_factor: entree.form_factor ?? null };
    // Opacite des quatre coins : seules les maskables en dependent.
    if (bitmap && (entree.purpose || "").includes("maskable")) {
      const c = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = c.getContext("2d");
      ctx.drawImage(bitmap, 0, 0);
      const w = bitmap.width, h = bitmap.height;
      sortie.coinsOpaques = [[1,1],[w-2,1],[1,h-2],[w-2,h-2]]
        .every(([x,y]) => ctx.getImageData(x, y, 1, 1).data[3] === 255);
    }
    if (bitmap) bitmap.close();
    return sortie;
  };

  const icones = await Promise.all((manifeste.icons ?? []).map(mesurer));
  const captures = await Promise.all((manifeste.screenshots ?? []).map(mesurer));
  const reg = navigator.serviceWorker
    ? await navigator.serviceWorker.getRegistration() : null;
  const meta = document.querySelector('meta[name=theme-color]');

  return {
    nom: manifeste.name, court: manifeste.short_name,
    display: manifeste.display, orientation: manifeste.orientation,
    scope: new URL(manifeste.scope ?? "./", lien.href).pathname,
    start_url: new URL(manifeste.start_url ?? "./", lien.href).pathname,
    themeManifeste: manifeste.theme_color, themeMeta: meta?.content ?? null,
    fond: manifeste.background_color,
    icones, captures,
    serviceWorker: reg ? { actif: Boolean(reg.active), etat: reg.active?.state } : null,
    appleTouchIcon: document.querySelector('link[rel=apple-touch-icon]')?.getAttribute('href') ?? null
  };
}"""


def controles(donnees: dict) -> list[str]:
    """Les criteres d'installabilite, un par un. Renvoie les manquements."""
    fautes = []
    icones = donnees.get("icones", [])
    captures = donnees.get("captures", [])

    for lot, nom in ((icones, "icone"), (captures, "capture")):
        for entree in lot:
            if entree.get("statut") != 200:
                fautes.append(f"{nom} {entree['src']} : HTTP {entree.get('statut')}")
            elif entree.get("mesure") is None:
                fautes.append(f"{nom} {entree['src']} : le navigateur ne sait pas la decoder")
            elif entree.get("declare") and entree["declare"] != entree["mesure"]:
                fautes.append(f"{nom} {entree['src']} : declare {entree['declare']},"
                              f" mesure {entree['mesure']}")

    def cote(entree):
        return int((entree.get("mesure") or "0x0").split("x")[0])

    quelconques = [i for i in icones if "any" in (i.get("purpose") or "any")]
    if not any(cote(i) >= 192 for i in quelconques):
        fautes.append("aucune icone `any` de 192 px ou plus")
    if not any(cote(i) >= 512 for i in quelconques):
        fautes.append("aucune icone `any` de 512 px ou plus")

    maskables = [i for i in icones if "maskable" in (i.get("purpose") or "")]
    if not maskables:
        fautes.append("aucune icone `maskable` : Android recadrera l'icone `any`")
    for entree in maskables:
        if entree.get("coinsOpaques") is False:
            fautes.append(f"maskable {entree['src']} : coins TRANSPARENTS")
        if "any" in (entree.get("purpose") or ""):
            fautes.append(f"{entree['src']} cumule `any` et `maskable` :"
                          " la meme image ne peut pas etre bonne dans les deux roles")

    if donnees.get("display") not in ("standalone", "fullscreen", "minimal-ui"):
        fautes.append(f"display `{donnees.get('display')}` : non installable")
    if not donnees.get("nom") and not donnees.get("court"):
        fautes.append("ni `name` ni `short_name`")
    if not (donnees.get("start_url") or "").startswith(donnees.get("scope") or "/"):
        fautes.append("start_url hors du scope")
    sw = donnees.get("serviceWorker")
    if not sw or not sw.get("actif"):
        fautes.append(f"service worker non actif : {sw}")

    if "horsLigne" in donnees:
        hors = donnees["horsLigne"]
        if hors.get("rechargement") != "ok":
            fautes.append(f"hors-ligne : {hors.get('rechargement')}")
        elif not hors.get("boutonJouer") or not hors.get("titreVisible"):
            fautes.append(f"hors-ligne : la page se charge mais le menu est vide {hors}")
        elif not hors.get("partieLancee"):
            fautes.append(f"hors-ligne : le menu s'affiche mais la partie ne demarre pas {hors}")
        if hors.get("rechargement") == "ok":
            musiques = hors.get("musiques") or []
            if len(musiques) != 8:
                fautes.append(f"hors-ligne : {len(musiques)}/8 musiques vérifiées")
            for musique in musiques:
                contenu = musique.get("contenu") or ""
                if (musique.get("statut") != 206
                        or musique.get("octets") != 32
                        or not contenu.startswith("bytes 0-31/")):
                    fautes.append(
                        f"musique hors-ligne {musique.get('fichier')} : "
                        f"HTTP {musique.get('statut')}, plage {contenu!r}, "
                        f"{musique.get('octets')} octets"
                    )

    # ⚠️ Sans capture `narrow`, Chrome Android retombe sur la bandelette
    # d'installation au lieu de la fiche riche. Ce n'est pas bloquant.
    if not any(c.get("form_factor") == "narrow" for c in captures):
        fautes.append("(avertissement) aucune capture `narrow` : fiche d'installation pauvre")
    if donnees.get("themeManifeste") != donnees.get("themeMeta"):
        fautes.append(f"(avertissement) theme_color {donnees.get('themeManifeste')}"
                      f" != meta {donnees.get('themeMeta')}")
    if (donnees.get("appleTouchIcon") or "").endswith("icon-192.png"):
        fautes.append("(avertissement) apple-touch-icon a coins transparents :"
                      " iOS les composera sur du noir")
    return fautes


def autotest() -> int:
    """Le harnais attrape-t-il les defauts qu'il pretend attraper ?

    ⚠️ UN CONTROLE QUI PASSE TOUJOURS NE PROUVE RIEN. On lui repasse donc l'etat
    EXACT du manifeste d'avant cette passe — une seule paire d'icones declaree
    `any maskable`, coins transparents mesures, aucune capture — et on exige
    qu'il le refuse. Sans cela, « installable » ne serait qu'une phrase.

        python tools/check_pwa.py --autotest
    """
    avant = {
        "nom": "YOLE: BWA BRAWL", "court": "BWA MAYHEM",
        "display": "fullscreen", "scope": "/", "start_url": "/",
        "themeManifeste": "#00b8c9", "themeMeta": "#061a29",
        "appleTouchIcon": "./icons/icon-192.png",
        "serviceWorker": {"actif": True, "etat": "activated"},
        "horsLigne": {
            "rechargement": "ok", "titreVisible": True, "boutonJouer": True,
            "partieLancee": True,
            "musiques": [
                {"fichier": f"piste-{index}.mp3", "statut": 206,
                 "contenu": "bytes 0-31/100", "octets": 32}
                for index in range(7)
            ] + [
                {"fichier": "piste-cassee.mp3", "statut": 503,
                 "contenu": "", "octets": 0}
            ]
        },
        "icones": [
            {"src": "./icons/icon-192.png", "statut": 200, "declare": "192x192",
             "mesure": "192x192", "purpose": "any maskable", "coinsOpaques": False},
            {"src": "./icons/icon-512.png", "statut": 200, "declare": "512x512",
             "mesure": "512x512", "purpose": "any maskable", "coinsOpaques": False},
        ],
        "captures": [],
    }
    attendus = ("coins TRANSPARENTS", "cumule `any` et `maskable`",
                "aucune capture `narrow`", "theme_color", "apple-touch-icon",
                "musique hors-ligne")
    fautes = controles(avant)
    manques = [a for a in attendus if not any(a in f for f in fautes)]
    for faute in fautes:
        print(f"  . {faute}")
    if manques:
        print(f"\n  ECHEC : le harnais n'a PAS vu {manques}")
        return 1
    print(f"\n  autotest OK : {len(fautes)} defauts connus tous detectes")
    return 0


def chromium():
    for nom in ("chrome", "chromium", "msedge", "google-chrome"):
        chemin = shutil.which(nom)
        if chemin:
            return chemin
    return None


def main():
    if "--autotest" in sys.argv:
        return autotest()
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("  ECHEC : Playwright est requis pour le contrôle navigateur.")
        print("  -> installe-le avec `python -m pip install playwright`.")
        return 1
    with sync_playwright() as p:
        lancement = {"headless": True, "args": [
            "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]}
        exe = chromium()
        if exe:
            lancement["executable_path"] = exe
        nav = p.chromium.launch(**lancement)
        page = nav.new_page(viewport={"width": 1280, "height": 720})
        page.goto(URL, wait_until="networkidle", timeout=90000)
        # Le service worker s'enregistre apres le chargement des modules.
        page.wait_for_function(
            "() => Boolean(navigator.serviceWorker.controller)",
            timeout=120000)
        donnees = page.evaluate(SONDE)

        # ⚠️ LE SEUL TEST QUI PROUVE LE HORS-LIGNE : couper le reseau et
        # recharger. Un cache rempli ne dit rien — il faut que la navigation
        # elle-meme soit servie, et que les modules ES suivent. Un seul import
        # manquant et la page reste blanche, sans erreur reseau visible.
        page.context.set_offline(True)
        hors_ligne = {"rechargement": None}
        try:
            page.reload(wait_until="domcontentloaded", timeout=30000)
            page.wait_for_timeout(4000)
            hors_ligne = page.evaluate("""() => ({
              rechargement: "ok",
              titreVisible: Boolean(document.querySelector('.menu-content h1')),
              boutonJouer: Boolean(document.getElementById('playBtn')),
              menuAffiche: !document.getElementById('menu')?.classList.contains('hidden'),
              troisJs: typeof WebGL2RenderingContext !== "undefined"
            })""")
            # Les HTMLAudioElement lisent les MP3 par plages. Un simple GET 200
            # ne prouve donc pas la musique hors ligne : on reproduit les huit
            # premières lectures `Range` avec les chemins exacts de PISTES.
            hors_ligne["musiques"] = page.evaluate("""async () => {
              const { PISTES } = await import("./src/core/music.js");
              const resultats = [];
              for (const { fichier } of Object.values(PISTES)) {
                const chemin = `./zik/${encodeURIComponent(fichier)}`;
                try {
                  const response = await fetch(chemin, {
                    headers: { Range: "bytes=0-31" }
                  });
                  const contenu = response.headers.get("Content-Range");
                  const octets = (await response.arrayBuffer()).byteLength;
                  resultats.push({
                    fichier, statut: response.status, contenu, octets,
                    type: response.headers.get("Content-Type")
                  });
                } catch (erreur) {
                  resultats.push({
                    fichier, statut: 0, contenu: null, octets: 0,
                    erreur: String(erreur).slice(0, 100)
                  });
                }
              }
              return resultats;
            }""")
            # Le menu s'affiche peut-etre, mais les GLB et les textures sont
            # chargees APRES : c'est la partie qu'il faut voir demarrer.
            page.evaluate("document.getElementById('playBtn').click()")
            page.wait_for_timeout(6000)
            hors_ligne.update(page.evaluate("""() => {
              const c = document.querySelector('canvas');
              return { partieLancee: Boolean(c) && c.width > 0,
                       largeurCanvas: c?.width ?? 0,
                       menuFerme: document.getElementById('menu')?.classList.contains('hidden') ?? null };
            }"""))
        except Exception as erreur:
            hors_ligne = {"rechargement": f"ECHEC : {str(erreur)[:120]}"}
        page.context.set_offline(False)
        donnees["horsLigne"] = hors_ligne
        nav.close()

    if donnees.get("erreur"):
        print(f"  ECHEC : {donnees['erreur']}")
        return 1

    fautes = controles(donnees)
    print(json.dumps(donnees, ensure_ascii=False, indent=1))
    bloquants = [f for f in fautes if not f.startswith("(avertissement)")]
    print()
    for faute in fautes:
        print(f"  {'!' if faute in bloquants else '~'} {faute}")
    if not fautes:
        print("  installable : tous les criteres verifies")
    return 1 if bloquants else 0


if __name__ == "__main__":
    raise SystemExit(main())
