"""Le jeu tourne-t-il derriere le serveur de PRODUCTION, service worker compris ?

`npm run verify` teste le code. `tools/serve.py` sert en developpement, avec
`no-store` sur tout — donc il ne teste JAMAIS le service worker ni la politique
de cache reelle. Ce harnais ouvre le jeu derriere `tools/server.mjs`, celui qui
sera en ligne, et verifie ce qui casse une mise en ligne :

  - le service worker s'INSTALLE-t-il (un seul fichier absent fait echouer
    `cache.addAll` EN BLOC, et le hors-ligne meurt en silence) ;
  - combien d'octets partent au PREMIER chargement ;
  - le dossier zik/ (12 Mo) reste-t-il bien hors du chargement initial ;
  - la partie se lance-t-elle sans erreur console.

    PORT=8802 node tools/server.mjs &
    python tools/check_prod.py
"""
from __future__ import annotations

import json
import os
import shutil
import sys

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
URL = os.environ.get("YOLE_URL", "http://127.0.0.1:8802/index.html")


def chromium():
    for nom in ("chrome", "chromium", "msedge", "google-chrome"):
        chemin = shutil.which(nom)
        if chemin:
            return chemin
    return None


def main():
    erreurs = []
    requetes = []
    with sync_playwright() as p:
        lancement = {"headless": True, "args": [
            "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]}
        exe = chromium()
        if exe:
            lancement["executable_path"] = exe
        nav = p.chromium.launch(**lancement)
        page = nav.new_page(viewport={"width": 1280, "height": 720})
        page.on("pageerror", lambda e: erreurs.append(f"page: {str(e)[:150]}"))
        page.on("console", lambda m: erreurs.append(f"console: {m.text[:150]}")
                if m.type == "error" else None)

        def noter(reponse):
            try:
                longueur = int(reponse.headers.get("content-length") or 0)
            except ValueError:
                longueur = 0
            requetes.append({
                "url": reponse.url.split("127.0.0.1:8802")[-1],
                "statut": reponse.status,
                "octets": longueur,
                "cache": reponse.headers.get("cache-control", ""),
                "type": reponse.headers.get("content-type", "")[:40]
            })
        page.on("response", noter)

        page.goto(URL, wait_until="networkidle", timeout=90000)
        page.wait_for_timeout(2500)

        sw = page.evaluate("""async () => {
          if (!navigator.serviceWorker) return { supporte: false };
          const reg = await navigator.serviceWorker.getRegistration();
          if (!reg) return { supporte: true, enregistre: false };
          const noms = await caches.keys();
          const total = {};
          for (const nom of noms) {
            const c = await caches.open(nom);
            total[nom] = (await c.keys()).length;
          }
          return { supporte: true, enregistre: true,
                   actif: Boolean(reg.active), etat: reg.active?.state ?? null,
                   caches: total };
        }""")

        page.evaluate("document.getElementById('playBtn').click()")
        page.wait_for_timeout(4000)
        jouable = page.evaluate("""() => {
          const c = document.querySelector('canvas');
          return { canvas: Boolean(c),
                   largeur: c?.width ?? 0,
                   menuCache: document.getElementById('menu')?.classList.contains('hidden') ?? null };
        }""")
        nav.close()

    echecs = [r for r in requetes if r["statut"] >= 400]
    zik = [r for r in requetes if "/zik/" in r["url"]]
    total = sum(r["octets"] for r in requetes)
    print(json.dumps({
        "requetes": len(requetes),
        "echecs": echecs[:8],
        "octetsPremierChargement": total,
        "megaoctets": round(total / 1e6, 2),
        "zikCharge": [z["url"] for z in zik],
        "serviceWorker": sw,
        "jouable": jouable,
        "erreurs": erreurs[:8]
    }, ensure_ascii=False, indent=1))
    return 1 if echecs or erreurs else 0


if __name__ == "__main__":
    raise SystemExit(main())
