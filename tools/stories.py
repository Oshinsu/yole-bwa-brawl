"""Trois stories 9:16 pour presenter le jeu, batties sur de VRAIES captures.

⚠️ POURQUOI PAS D'IMAGES GENEREES. Pour expliquer un jeu, ses propres images
valent mieux que de l'illustration : elles montrent ce qu'on va reellement
jouer, et elles restent dans la direction artistique du projet. Une image
generee a cote des captures se voit immediatement, et elle promet autre chose
que ce que le jeu tient.

⚠️ LES POLICES SONT CELLES DU JEU. Anton pour le titrage, Inter pour le texte,
lues dans assets/fonts/. Sans elles, Pillow retombe sur une bitmap systeme
minuscule et illisible en 1080 de large — le rendu serait inutilisable.

    python tools/stories.py
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.stdout.reconfigure(encoding="utf-8")
RACINE = Path(__file__).resolve().parent.parent
SOURCE = RACINE / "previews" / "story"
SORTIE = RACINE / "previews" / "story"

L, H = 1080, 1920                      # 9:16, le format des stories
MARGE = 72

ENCRE = (242, 252, 255)
CYAN = (78, 242, 255)
OR = (255, 224, 90)
ORANGE = (255, 120, 37)
MUET = (168, 211, 220)
FOND = (3, 23, 36)


def police(nom: str, taille: int) -> ImageFont.FreeTypeFont:
    chemin = RACINE / "assets" / "fonts" / nom
    if not chemin.exists():
        raise SystemExit(f"police introuvable : {chemin} — lance d'abord npm run verify")
    return ImageFont.truetype(str(chemin), taille)


def bandeau(image: Image.Image, capture: Path, haut: int, hauteur: int) -> None:
    """Colle une capture en bande pleine largeur, recadree au centre.

    Le jeu est en PAYSAGE et la story en portrait : on ne redimensionne donc
    pas la capture entiere, on y DECOUPE une bande. Le sujet reste a l'echelle
    au lieu d'etre ecrase.
    """
    src = Image.open(capture).convert("RGB")
    # ⚠️ RECOUVREMENT, PAS AJUSTEMENT. Une premiere version calait sur la seule
    # largeur : une capture 2560x1440 devenait 1080x607, plus COURTE que la
    # bande demandee, et laissait un grand vide sombre sous elle — avec le
    # degrade applique dans ce vide. On prend donc le plus grand des deux
    # rapports, comme un `object-fit: cover`, puis on recadre.
    ratio = max(L / src.width, hauteur / src.height)
    redim = src.resize((round(src.width * ratio), round(src.height * ratio)), Image.LANCZOS)
    # Horizontalement au centre ; verticalement sur le tiers superieur, la ou
    # sont l'horizon et l'action — pas le HUD du bas.
    x = round((redim.width - L) / 2)
    y = round(max(0, redim.height - hauteur) * 0.30)
    image.paste(redim.crop((x, y, x + L, y + hauteur)), (0, haut))


def degrade_bas(image: Image.Image, haut: int, hauteur: int, force: float = 1.0) -> None:
    """Fond noir progressif : sans lui, le texte pose sur une mer claire disparait."""
    voile = Image.new("RGBA", (L, hauteur), (0, 0, 0, 0))
    dessin = ImageDraw.Draw(voile)
    for ligne in range(hauteur):
        alpha = int(255 * force * (ligne / hauteur) ** 1.5)
        dessin.line([(0, ligne), (L, ligne)], fill=(3, 23, 36, alpha))
    image.paste(voile, (0, haut), voile)


def ecrire(dessin, xy, texte, fonte, couleur, espacement=0):
    """Ecrit avec un interlettrage optionnel — Pillow ne le gere pas nativement."""
    if not espacement:
        dessin.text(xy, texte, font=fonte, fill=couleur)
        return
    x, y = xy
    for caractere in texte:
        dessin.text((x, y), caractere, font=fonte, fill=couleur)
        x += dessin.textlength(caractere, font=fonte) + espacement


def largeur(dessin, texte, fonte, espacement=0):
    return dessin.textlength(texte, font=fonte) + espacement * max(0, len(texte) - 1)


def base(capture: str, hauteur_image: int) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    image = Image.new("RGB", (L, H), FOND)
    bandeau(image, SOURCE / capture, 0, hauteur_image)
    degrade_bas(image, hauteur_image - 420, 420)
    return image, ImageDraw.Draw(image)


def pastille(dessin, x, y, texte, fonte, couleur):
    w = dessin.textlength(texte, font=fonte)
    dessin.rounded_rectangle([x, y, x + w + 34, y + 54], 16, fill=couleur)
    dessin.text((x + 17, y + 10), texte, font=fonte, fill=FOND)
    return x + w + 34


# ─────────────────────────────────────────────────────────────────────────
def story_dev_diary() -> Path:
    image, d = base("cap-combat.png", 1080)
    titre = police("anton-400.woff2", 104)
    sur = police("inter-var.woff2", 28)
    corps = police("inter-var.woff2", 34)
    chiffre = police("anton-400.woff2", 76)
    petit = police("inter-var.woff2", 26)

    ecrire(d, (MARGE, 1000), "DEV DIARY · 29 JUILLET 2026", sur, CYAN, 5)
    d.text((MARGE, 1052), "56 PASSES", font=titre, fill=ENCRE)
    d.text((MARGE, 1160), "PLUS TARD", font=titre, fill=ORANGE)

    y = 1330
    for valeur, libelle, couleur in (
        ("6,98 Mo", "au premier chargement — c'était 12,81", OR),
        ("174", "fichiers en cache : le jeu tourne hors ligne", CYAN),
        ("60 Hz", "pas fixe, replays vérifiés au checksum", ENCRE),
    ):
        d.text((MARGE, y), valeur, font=chiffre, fill=couleur)
        d.text((MARGE + largeur(d, valeur, chiffre) + 24, y + 34), libelle, font=petit, fill=MUET)
        y += 108

    d.text((MARGE, 1700), "Le service worker ne s'était JAMAIS", font=corps, fill=ENCRE)
    d.text((MARGE, 1742), "enregistré. Zéro erreur en console.", font=corps, fill=ENCRE)
    d.text((MARGE, 1800), "Trouvé en mesurant, pas en relisant.", font=petit, fill=MUET)

    chemin = SORTIE / "story-1-dev-diary.png"
    image.save(chemin, quality=95)
    return chemin


def story_concept() -> Path:
    image, d = base("cap-course.png", 1180)
    titre = police("anton-400.woff2", 116)
    sur = police("inter-var.woff2", 28)
    corps = police("inter-var.woff2", 38)
    puce = police("inter-var.woff2", 32)

    ecrire(d, (MARGE, 1110), "COMBAT RACER MARTINIQUAIS", sur, CYAN, 5)
    d.text((MARGE, 1162), "YOLE", font=titre, fill=ENCRE)
    d.text((MARGE, 1280), "BWA BRAWL", font=titre, fill=ORANGE)

    d.text((MARGE, 1440), "Quatre yoles. Une seule règle :", font=corps, fill=ENCRE)
    d.text((MARGE, 1490), "ne pas chavirer.", font=corps, fill=ENCRE)

    # ⚠️ PAS D'EMOJI. Inter n'en contient aucun : ⚖ 🥥 🌪 sortaient en « tofu »,
    # ces rectangles barres qui affichent le code hexadecimal du caractere
    # manquant. On dessine donc les puces, ce qui est de toute facon plus propre
    # et suit la palette du jeu.
    y = 1580
    for couleur, texte in (
        (OR, "Ton équipage sort sur le bois — c'est TOI qui le rappelles"),
        (ORANGE, "Coco, harpon, torpille à tête chercheuse"),
        (CYAN, "La brume de sable avale le dernier"),
    ):
        d.rounded_rectangle([MARGE, y + 12, MARGE + 18, y + 30], 4, fill=couleur)
        d.text((MARGE + 44, y), texte, font=puce, fill=MUET)
        y += 62

    d.text((MARGE, 1810), "oshinsu.github.io/yole-bwa-brawl", font=corps, fill=CYAN)

    chemin = SORTIE / "story-2-concept.png"
    image.save(chemin, quality=95)
    return chemin


def story_touches() -> Path:
    image, d = base("cap-hud.png", 900)
    titre = police("anton-400.woff2", 96)
    sur = police("inter-var.woff2", 28)
    touche = police("anton-400.woff2", 40)
    libelle = police("inter-var.woff2", 32)
    petit = police("inter-var.woff2", 26)

    ecrire(d, (MARGE, 830), "PRENDS LA BARRE", sur, CYAN, 5)
    d.text((MARGE, 882), "LES TOUCHES", font=titre, fill=ENCRE)

    y = 1030
    for cles, texte, couleur in (
        (["Q", "D"], "barre", ENCRE),
        (["↑", "↓"], "border / choquer la voile", ENCRE),
        (["SHIFT"], "contre-gîte — le cœur du jeu", OR),
        (["Z"], "turbo", ENCRE),
        (["X"], "Bwa Dash · ou double-tap Q/D", ORANGE),
        (["&", "é", '"', "'"], "tirer tes armes", CYAN),
        (["C"], "regarder derrière", ENCRE),
    ):
        x = MARGE
        for cle in cles:
            w = d.textlength(cle, font=touche)
            # ⚠️ FOND OPAQUE ET SOMBRE. Une premiere version passait
            # `fill=(255, 255, 255, 22)` en croyant obtenir un blanc a 8 % —
            # mais l'image est en RGB, l'alpha est IGNORE et le rectangle
            # sortait blanc plein. Les lettres claires devenaient invisibles.
            d.rounded_rectangle([x, y - 6, x + w + 38, y + 58], 14,
                                fill=(11, 38, 55), outline=couleur, width=3)
            d.text((x + 19, y + 2), cle, font=touche, fill=couleur)
            x += w + 52
        d.text((max(x + 12, MARGE + 300), y + 12), texte, font=libelle, fill=MUET)
        y += 96

    d.text((MARGE, 1740), "Au doigt : glisse pour barrer,", font=petit, fill=MUET)
    d.text((MARGE, 1778), "une tuile = une arme, double-tap l'eau = turbo.", font=petit, fill=MUET)
    d.text((MARGE, 1836), "oshinsu.github.io/yole-bwa-brawl", font=libelle, fill=CYAN)

    chemin = SORTIE / "story-3-touches.png"
    image.save(chemin, quality=95)
    return chemin


if __name__ == "__main__":
    for fabrique in (story_dev_diary, story_concept, story_touches):
        chemin = fabrique()
        taille = Image.open(chemin).size
        print(f"  {chemin.name:26} {taille[0]}x{taille[1]}  {chemin.stat().st_size // 1024} Ko")
