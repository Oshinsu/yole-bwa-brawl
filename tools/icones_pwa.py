"""Genere les icones PWA manquantes : la variante MASKABLE et l'icone iOS.

⚠️ POURQUOI CE SCRIPT EXISTE. Le manifeste declarait `"purpose": "any maskable"`
sur les deux icones du jeu. Mesure sur icon-512.png :

    coins RGBA : [(0,0,0,0), (0,0,0,0), (0,0,0,0), (0,0,0,0)]
    pixels visibles hors safe-zone : 31096 / 64033 = 48,6 %

Une icone `maskable` est RECADREE par le lanceur Android dans la forme de son
choix — cercle, squircle, goutte — et seul un cercle de 80 % du cote est garanti
visible. Notre icone a des coins ARRONDIS TRANSPARENTS (dessin de style iOS) et
pres de la moitie de son contenu hors de cette zone : sous masque circulaire le
mot BRAWL et les extremites de la coque disparaissent, et les coins vides
laissent apparaitre le fond du lanceur.

Une icone maskable n'est donc pas la meme image en plus petit : c'est un dessin
PLEIN BORD A BORD, sujet centre et gros, sans texte fin.

⚠️ ET L'ICONE iOS. iOS ne connait pas `maskable` : il applique son propre
arrondi et compose l'alpha SUR DU NOIR. Servir une icone a coins transparents y
donne quatre coins noirs sous l'arrondi systeme. `apple-touch-icon` doit donc
etre OPAQUE, coins pleins, en 180x180 — la taille demandee par iOS.

    python tools/icones_pwa.py
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.stdout.reconfigure(encoding="utf-8")
RACINE = Path(__file__).resolve().parent.parent
ICONES = RACINE / "icons"
SOURCE = ICONES / "icon-512.png"

# Couleurs relevees sur l'icone existante, colonne centrale : le ciel en haut,
# la mer en bas. On les reprend pour que les deux icones restent parentes.
CIEL = (6, 40, 63)
MER = (6, 111, 140)

# Part du cote occupee par le dessin dans la variante maskable. A 0,78 le
# titrage du bas rentre tout juste dans le cercle de 80 % — mesure plus bas.
ECHELLE = 0.78


def fond(cote: int) -> Image.Image:
    """Degrade vertical plein, opaque jusqu'aux quatre coins."""
    image = Image.new("RGB", (1, cote))
    px = image.load()
    for y in range(cote):
        t = y / max(1, cote - 1)
        px[0, y] = tuple(round(CIEL[c] + (MER[c] - CIEL[c]) * t ** 0.85) for c in range(3))
    return image.resize((cote, cote), Image.BILINEAR)


def aplatie(cote: int) -> Image.Image:
    """L'icone du jeu posee sur son degrade : le dessin entier, coins pleins."""
    source = Image.open(SOURCE).convert("RGBA")
    plat = fond(source.width)
    plat.paste(source, (0, 0), source)
    return plat.resize((cote, cote), Image.LANCZOS) if cote != source.width else plat


def maskable(cote: int) -> Image.Image:
    """Le dessin ENTIER reduit dans la safe-zone, sur un fond etendu.

    ⚠️ DEUX VERSIONS RATEES AVANT CELLE-CI, toutes deux vues a la planche A/B :

    1. Decouper la yole et la reposer sur un degrade neuf. Le detourage n'etait
       pas fait : le rectangle de nuage violet partait avec elle et se lisait
       comme une vignette collee au milieu de l'icone.
    2. Prolonger le fond avec une copie FLOUE du dessin. Le raccord se voyait
       quand meme — un cadre net a 78 % du cote, cercle a l'exterieur.

    Ce qui marche : le fond du dessin EST deja le bon degrade. On pose donc le
    dessin reduit sur le meme degrade, et on estompe ses bords sur quelques
    pour cent pour que ses vagues se fondent au lieu de s'arreter au couteau.
    """
    image = fond(cote)
    large = round(cote * ECHELLE)
    dessin = aplatie(cote).resize((large, large), Image.LANCZOS)
    voile = Image.new("L", (large, large), 255)
    estompe = ImageDraw.Draw(voile)
    bord = max(2, round(large * 0.05))
    for i in range(bord):
        estompe.rectangle([i, i, large - 1 - i, large - 1 - i],
                          outline=round(255 * (i / bord) ** 0.7))
    image.paste(dessin, ((cote - large) // 2,) * 2, voile)
    return image


def apple(cote: int = 180) -> Image.Image:
    """L'icone existante aplatie : iOS compose l'alpha sur du noir."""
    return aplatie(cote)


def hors_zone(cote: int = 512, echelle: float = 1.0) -> float:
    """Part du DESSIN qu'un masque circulaire de 80 % peut retirer.

    ⚠️ ON MESURE LE DESSIN, PAS L'IMAGE. Une premiere version comptait les
    pixels non transparents : des que le fond devient opaque bord a bord — ce
    qu'une icone maskable DOIT etre — elle renvoyait 49,7 %, qui n'est rien
    d'autre que l'aire du carre hors du cercle. Tautologie. On ne compte donc
    que les pixels du dessin d'origine, c'est-a-dire son canal alpha.
    """
    import math
    alpha = Image.open(SOURCE).convert("RGBA").getchannel("A").resize((cote, cote), Image.LANCZOS)
    if echelle != 1.0:
        large = round(cote * echelle)
        vide = Image.new("L", (cote, cote), 0)
        vide.paste(alpha.resize((large, large), Image.LANCZOS), ((cote - large) // 2,) * 2)
        alpha = vide
    px = alpha.load()
    centre, rayon = cote / 2, cote * 0.4
    dehors = total = 0
    for y in range(0, cote, 2):
        for x in range(0, cote, 2):
            if px[x, y] > 12:
                total += 1
                if math.hypot(x - centre, y - centre) > rayon:
                    dehors += 1
    return 100 * dehors / max(1, total)


if __name__ == "__main__":
    if not SOURCE.is_file():
        raise SystemExit(f"source introuvable : {SOURCE}")
    sorties = []
    for cote in (192, 512):
        chemin = ICONES / f"icon-maskable-{cote}.png"
        image = maskable(cote)
        image.save(chemin, optimize=True)
        sorties.append((chemin, image))
    chemin = ICONES / "apple-touch-icon.png"
    image = apple()
    image.save(chemin, optimize=True)
    sorties.append((chemin, image))

    for chemin, image in sorties:
        px = image.convert("RGBA").load()
        opaques = all(px[x, y][3] == 255 for x, y in
                      ((1, 1), (image.width - 2, 1), (1, image.height - 2),
                       (image.width - 2, image.height - 2)))
        print(f"  {chemin.name:24} {image.width}x{image.height}"
              f"  {chemin.stat().st_size // 1024:3} Ko"
              f"  coins {'opaques' if opaques else 'TRANSPARENTS'}")
    print(f"\n  dessin hors safe-zone : {hors_zone(echelle=1.0):.1f} % a pleine taille"
          f"  ->  {hors_zone(echelle=ECHELLE):.1f} % a {ECHELLE:.0%}")
