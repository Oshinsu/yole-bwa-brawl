"""Convertit assets/textures/ en WebP et recable toutes les references.

⚠️ POURQUOI. Mesure du premier chargement derriere le serveur de production :
12,81 Mo, dont 9,43 Mo de TEXTURES. C'est le poste dominant et de loin, sur un
jeu annonce mobile-first.

⚠️ POURQUOI DESTRUCTIF ET PAS SANS PERTE. Mesure sur les 99 fichiers :
  - WebP sans perte : 20,26 -> 15,31 Mo  (-24 %)
  - WebP q88/q86    : 20,26 ->  5,49 Mo  (-73 %)
Le sans-perte ne vaut pas le derangement. Le destructif, si — a condition de
VERIFIER a l'oeil, ce que fait tools/capture_ab_webp.py.

⚠️ QUALITE PLUS HAUTE POUR LES ATLAS DE VFX. Ils sont rendus en fusion ADDITIVE
et leur canal alpha porte la silhouette : un artefact de compression s'y voit
comme un halo sale. Ils passent a 94 la ou l'habillage d'interface tient a 88.

Les icones PWA de icons/ ne sont PAS touchees : elles sont declarees dans le
manifeste et certaines plateformes n'acceptent que du PNG.

    python tools/convertir_webp.py --essai    # liste, ne modifie rien
    python tools/convertir_webp.py
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

from PIL import Image

sys.stdout.reconfigure(encoding="utf-8")
RACINE = Path(__file__).resolve().parent.parent
TEXTURES = RACINE / "assets" / "textures"
ESSAI = "--essai" in sys.argv

# Les fichiers ou une reference peut apparaitre. `asset-pack.json` est de la
# documentation d'atelier, jamais lue par le jeu : on la recable quand meme
# pour qu'elle ne mente pas.
SOURCES = [
    RACINE / "style.css",
    RACINE / "index.html",
    RACINE / "service-worker.js",
    *sorted((RACINE / "src").rglob("*.js")),
    *sorted(TEXTURES.rglob("asset-pack.json")),
]

# Un atlas de VFX est rendu en additif : son alpha porte la decoupe.
VFX = re.compile(r"(vfx|juice|atlas|flipbook|shockwave|explosion|burst|trail|aura|spark)", re.I)


def qualite(chemin: Path) -> int:
    if VFX.search(chemin.as_posix()):
        return 94
    return 86 if chemin.suffix.lower() in (".jpg", ".jpeg") else 88


def main() -> int:
    fichiers = sorted(p for p in TEXTURES.rglob("*")
                      if p.suffix.lower() in (".png", ".jpg", ".jpeg"))
    if not fichiers:
        print("aucune texture a convertir")
        return 0

    avant = sum(p.stat().st_size for p in fichiers)
    apres = 0
    renommages: dict[str, str] = {}
    for source in fichiers:
        cible = source.with_suffix(".webp")
        q = qualite(source)
        if not ESSAI:
            image = Image.open(source)
            image.save(cible, "WEBP", quality=q, method=6)
            apres += cible.stat().st_size
        renommages[source.name] = cible.name
        if ESSAI:
            print(f"  q{q}  {source.relative_to(RACINE).as_posix()}")

    if ESSAI:
        print(f"\n  {len(fichiers)} fichiers, {avant / 1e6:.2f} Mo actuellement")
        return 0

    # ── Recablage ────────────────────────────────────────────────────────
    # On remplace le NOM DE FICHIER, pas le chemin : les references sont
    # ecrites tantot en relatif depuis src/, tantot depuis la racine, tantot
    # dans une url() CSS. Le nom seul est le denominateur commun.
    total = 0
    for fichier in SOURCES:
        if not fichier.exists():
            continue
        texte = origine = fichier.read_text(encoding="utf-8")
        for ancien, nouveau in renommages.items():
            if ancien in texte:
                texte = texte.replace(ancien, nouveau)
        if texte != origine:
            fichier.write_text(texte, encoding="utf-8")
            total += 1

    for source in fichiers:
        source.unlink()

    print(f"  {len(fichiers)} textures converties")
    print(f"  {avant / 1e6:.2f} Mo  ->  {apres / 1e6:.2f} Mo   (-{(avant - apres) * 100 / avant:.0f} %)")
    print(f"  {total} fichiers recables")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
