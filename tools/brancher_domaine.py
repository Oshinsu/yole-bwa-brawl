"""Branche un domaine personnalise sur la publication GitHub Pages.

⚠️ CE SCRIPT NE FAIT AUCUN ACHAT. Il suppose que le domaine est deja a toi. Il
ecrit le fichier `CNAME`, le pousse, et affiche les enregistrements DNS a poser
chez ton registrar.

⚠️ POURQUOI LE FICHIER `CNAME` N'EST PAS DEJA DANS LE DEPOT. GitHub Pages lit ce
fichier et se met a servir le site SOUS CE DOMAINE. Le committer avant d'avoir
achete le domaine casserait l'adresse actuelle en oshinsu.github.io sans rien
donner en echange : le site repondrait sur un nom qui ne resout nulle part.

    python tools/brancher_domaine.py bwabrawl.com            # affiche le plan
    python tools/brancher_domaine.py bwabrawl.com --appliquer
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
RACINE = Path(__file__).resolve().parent.parent


def adresses_pages() -> tuple[list[str], list[str]]:
    """Adresses de GitHub Pages, lues chez GitHub — jamais recopiees de memoire.

    Elles changent rarement mais elles CHANGENT. Une liste figee dans un script
    est une panne DNS silencieuse le jour ou GitHub bouge.
    """
    try:
        brut = subprocess.run(["gh", "api", "meta"], capture_output=True,
                              text=True, encoding="utf-8", check=True).stdout
        plages = json.loads(brut).get("pages", [])
    except Exception as erreur:
        print(f"  (lecture de l'API GitHub impossible : {erreur})")
        print("  -> recupere-les sur docs.github.com, rubrique « apex domain »")
        return [], []
    v4 = [p.split("/")[0] for p in plages if ":" not in p]
    v6 = [p.split("/")[0] for p in plages if ":" in p]
    # ⚠️ Les 192.30.252.x sont d'anciennes adresses encore annoncees. La doc
    # GitHub ne recommande QUE les 185.199.10x pour un domaine apex.
    v4 = [ip for ip in v4 if ip.startswith("185.199.")] or v4
    return v4, v6


def main() -> int:
    arguments = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not arguments:
        print(__doc__)
        return 1
    domaine = arguments[0].strip().lower().removeprefix("http://").removeprefix("https://").strip("/")
    if not re.fullmatch(r"[a-z0-9-]+(\.[a-z0-9-]+)+", domaine):
        print(f"  ECHEC : « {domaine} » n'est pas un nom de domaine valide.")
        return 1
    appliquer = "--appliquer" in sys.argv
    apex = domaine.count(".") == 1

    v4, v6 = adresses_pages()
    print(f"\n  DOMAINE : {domaine}   ({'apex' if apex else 'sous-domaine'})\n")
    print("  1. Chez ton registrar, pose ces enregistrements :\n")
    if apex:
        for ip in v4:
            print(f"       A     @      {ip}")
        for ip in v6:
            print(f"       AAAA  @      {ip}")
        print(f"       CNAME www    oshinsu.github.io.")
    else:
        sous = domaine.split(".")[0]
        print(f"       CNAME {sous:6} oshinsu.github.io.")
    print("\n  2. Puis, ici :\n")
    print(f"       python tools/brancher_domaine.py {domaine} --appliquer\n")
    print("  3. Enfin, sur GitHub : Settings > Pages > Custom domain,")
    print("     colle le domaine et coche « Enforce HTTPS ».")
    print("     ⚠️ La case HTTPS reste grisee tant que le certificat n'est pas")
    print("        emis — comptez de quelques minutes a une heure. C'est normal.\n")

    if not appliquer:
        print("  (rien n'a ete modifie — relance avec --appliquer quand le DNS est pose)")
        return 0

    (RACINE / "CNAME").write_text(domaine + "\n", encoding="utf-8")
    print(f"  CNAME ecrit : {domaine}")
    subprocess.run(["git", "add", "CNAME"], cwd=RACINE, check=False)
    subprocess.run(["git", "commit", "-m", f"Branche le domaine {domaine}"], cwd=RACINE, check=False)
    print("  -> `git push` pour publier.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
