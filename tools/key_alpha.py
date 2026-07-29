"""Reconstruit le canal alpha d'une decalcomanie en detourant son fond.

Un generateur d'images a qui on demande un fond noir ou blanc pur rend souvent
une image SANS alpha, ou avec un alpha entierement opaque. Posee sur la mer, la
decalcomanie devient alors un carre plein — c'est exactement ce qui est arrive a
sargasse.png (92 % de texels opaques dont 52 % quasi blancs).

Le detourage part des BORDS et se propage par remplissage : une meche blanchie
au milieu des sargasses garde son opacite, alors qu'un simple seuil sur la
luminance la trouerait. Les bords du masque sont adoucis pour eviter l'escalier.

Le fond MAGENTA #ff00ff est le plus sur : cette couleur n'existe nulle part dans
la palette du jeu, donc aucun texel du sujet ne peut etre confondu avec elle. Le
generateur, lui, rend un fond blanc meme quand on exige du noir.

    python tools/key_alpha.py assets/textures/sargasse.png --fond blanc
    python tools/key_alpha.py assets/textures/backdrop_near.png --fond magenta
"""
import argparse
from collections import deque

from PIL import Image, ImageFilter


def distance(pixel, reference):
    return max(abs(pixel[i] - reference[i]) for i in range(3))


REFERENCES = {"blanc": (255, 255, 255), "noir": (0, 0, 0), "magenta": (255, 0, 255)}


def decontamine(pixels, x, y, reference):
    """Retire la frange de fond des pixels de bord.

    Un detourage laisse un lisere de la couleur de fond sur les demi-pixels
    d'antialiasing. Sur du blanc ca passe inapercu ; sur du magenta ca fait un
    contour fluo. On rabat donc le canal en exces vers la moyenne des deux
    autres — pour du magenta pur, on ecrete rouge et bleu sur le vert.
    """
    r, g, b = pixels[x, y]
    if reference != (255, 0, 255):
        return (r, g, b)
    if r > g and b > g:
        limite = g + max(12, g // 3)
        return (min(r, limite), g, min(b, limite))
    return (r, g, b)


def key(path, fond, tolerance, adoucir):
    image = Image.open(path).convert("RGBA")
    width, height = image.size
    rgb = image.convert("RGB")
    pixels = rgb.load()

    reference = REFERENCES[fond]

    # Remplissage depuis les quatre bords : seul le fond CONNECTE au bord est
    # perce. Tout ce qui est enclave dans le sujet reste opaque.
    background = bytearray(width * height)
    queue = deque()
    for x in range(width):
        for y in (0, height - 1):
            queue.append((x, y))
    for y in range(height):
        for x in (0, width - 1):
            queue.append((x, y))

    while queue:
        x, y = queue.popleft()
        index = y * width + x
        if background[index]:
            continue
        if distance(pixels[x, y], reference) > tolerance:
            continue
        background[index] = 1
        if x > 0:
            queue.append((x - 1, y))
        if x < width - 1:
            queue.append((x + 1, y))
        if y > 0:
            queue.append((x, y - 1))
        if y < height - 1:
            queue.append((x, y + 1))

    alpha = Image.frombytes("L", (width, height), bytes(255 if not v else 0 for v in background))
    if adoucir > 0:
        alpha = alpha.filter(ImageFilter.GaussianBlur(adoucir))

    # Decontamination : sans elle, un fond magenta laisse un contour fluo sur
    # tous les bords antialiases du sujet.
    if reference == (255, 0, 255):
        propre = rgb.copy()
        cible = propre.load()
        for y in range(height):
            for x in range(width):
                if background[y * width + x]:
                    continue
                cible[x, y] = decontamine(pixels, x, y, reference)
        image = propre.convert("RGBA")

    image.putalpha(alpha)

    perces = sum(background)
    total = width * height
    print(f"  {path}: {perces * 100 // total}% du quad rendu transparent ({width}x{height})")
    return image


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("path")
    parser.add_argument("--fond", choices=["blanc", "noir", "magenta"], default="blanc")
    parser.add_argument("--tolerance", type=int, default=26, help="ecart max par canal au fond")
    parser.add_argument("--adoucir", type=float, default=0.8, help="rayon de flou du masque, 0 pour net")
    args = parser.parse_args()

    image = key(args.path, args.fond, args.tolerance, args.adoucir)
    image.save(args.path)
    print(f"[OK] {args.path} redetoure")


if __name__ == "__main__":
    main()
