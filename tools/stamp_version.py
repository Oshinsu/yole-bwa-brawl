"""Estampille la version du cache du service worker AVANT chaque deploiement.

⚠️ LE PIEGE QUE CE SCRIPT DESAMORCE.

`service-worker.js` ouvre son cache sous un nom constant :

    const CACHE = "yole-bwa-brawl-tropical-mayhem-v3-9.1.0.0";

L'activation supprime les anciennes versions qui portent le prefixe YOLE, puis
`skipWaiting` et `clients.claim` prennent la main immediatement. Le mecanisme de
mise a jour est donc correct — mais il est entierement suspendu a UN changement
de cette chaine.

Deployer sans la changer, c'est laisser chaque joueur deja venu sur l'ANCIENNE
version, definitivement : son service worker sert son cache, ne voit aucune
raison de le purger, et aucune correction ne l'atteindra jamais. Le pire est
qu'on ne s'en apercoit pas — le site est en ligne, il repond, il est simplement
fige pour ceux qui comptent.

Le nom est derive du contenu REEL de ce qui est precache : deux deploiements
identiques produisent la meme empreinte et ne purgent donc rien inutilement,
alors qu'un seul octet change dans un fichier precache force la mise a jour.

    python tools/stamp_version.py
    python tools/stamp_version.py --verifier   # ne reecrit rien, sort 1 si obsolete
"""
from __future__ import annotations

import hashlib
import re
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
SW = RACINE / "service-worker.js"
FICHIERS_INSTALL_CRITIQUES = {
    "./vendor/three.module.min.js",
    "./vendor/three.core.min.js",
}


def fichiers_precaches(source: str) -> list[str]:
    r"""Les chemins du tableau CORE — et rien d'autre.

    ⚠️ Une premiere version ratissait tout le fichier avec `"(\./[^"?]+)"`. Elle
    ramassait aussi `"./src/"` et `"./vendor/"`, qui ne sont pas des entrees de
    precache mais des PREFIXES de test dans la logique du worker. Resultat : deux
    faux « fichiers manquants » et un refus d'estampiller.
    """
    bloc = re.search(r"const CORE = \[(.*?)\];", source, re.S)
    if not bloc:
        return []
    return re.findall(r'"(\./[^"?]+)"', bloc.group(1))


def empreinte(source: str) -> tuple[str, int, list[str]]:
    """Empreinte du CONTENU de tout ce qui est precache, plus les manquants.

    On hache le contenu et non les noms : renommer sans rien changer ne doit pas
    invalider les caches de tout le monde, mais corriger un shader doit le faire.
    """
    digest = hashlib.sha256()
    manquants: list[str] = []
    compte = 0
    for relatif in sorted(set(fichiers_precaches(source))):
        if relatif == "./":
            continue
        # ⚠️ PAS `lstrip("./")` : lstrip retire des CARACTERES, pas un prefixe.
        # Et `exists()` ne suffit pas — une entree pointant sur un DOSSIER
        # passait le test puis levait PermissionError a la lecture.
        chemin = RACINE / relatif[2:] if relatif.startswith("./") else RACINE / relatif
        if not chemin.is_file():
            manquants.append(relatif)
            continue
        digest.update(relatif.encode("utf-8"))
        digest.update(chemin.read_bytes())
        compte += 1
    return digest.hexdigest()[:12], compte, manquants


def main() -> int:
    verifier = "--verifier" in sys.argv
    source = SW.read_text(encoding="utf-8")

    actuel = re.search(r'const CACHE = "([^"]+)"', source)
    if not actuel:
        print("ECHEC: constante CACHE introuvable dans service-worker.js")
        return 1
    prefixe = re.search(r'const CACHE_PREFIX = "([^"]+)"', source)
    if not prefixe or not actuel.group(1).startswith(prefixe.group(1)):
        print("ECHEC: CACHE doit commencer par CACHE_PREFIX pour etre purgeable.")
        return 1

    precaches = set(fichiers_precaches(source))
    critiques_oublies = sorted(FICHIERS_INSTALL_CRITIQUES - precaches)
    if critiques_oublies:
        print("ECHEC: fichier(s) install-critique(s) absent(s) de CORE :")
        for absent in critiques_oublies:
            print(f"   {absent}")
        print("   -> leur contenu ne participerait pas a la version du cache.")
        return 1

    signature, compte, manquants = empreinte(source)

    # ⚠️ Un seul fichier precache absent fait echouer `cache.addAll` en bloc, et
    # AUCUNE ressource n'est mise en cache : le hors-ligne ne marche plus du tout.
    # C'est silencieux en ligne. On refuse d'estampiller dans ce cas.
    if manquants:
        print(f"ECHEC: {len(manquants)} fichier(s) precache(s) absent(s) du disque :")
        for absent in manquants:
            print(f"   {absent}")
        print("   -> cache.addAll echouerait en bloc et le hors-ligne serait mort.")
        return 1

    base = re.sub(r"-[0-9a-f]{12}$", "", actuel.group(1))
    nouveau = f"{base}-{signature}"

    if nouveau == actuel.group(1):
        print(f"a jour: {nouveau}  ({compte} fichiers precaches)")
        return 0

    if verifier:
        print(f"OBSOLETE: {actuel.group(1)} -> {nouveau}")
        print("   -> lance `npm run stamp` avant de deployer.")
        return 1

    SW.write_text(source.replace(actuel.group(1), nouveau, 1), encoding="utf-8")
    print(f"estampille: {actuel.group(1)}")
    print(f"        -> {nouveau}   ({compte} fichiers precaches)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
