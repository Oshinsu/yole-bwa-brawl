"""A/B de la passe de jouabilite : mes constantes contre les anciennes.

Le harnais isole montre une physique saine ; le jeu complet montre une yole
couchee en permanence. Pour savoir laquelle de mes modifications est en cause, on
remet les constantes d'AVANT dans les sources, on rejoue exactement le meme
scenario, puis on restaure. Les fichiers sont remis a l'identique meme en cas
d'erreur.

    PORT=8791 python tools/serve.py &
    python tools/ab_gameplay.py
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
PHYSICS = RACINE / "src/sim/yole-physics.js"
BALANCE = RACINE / "src/game/balance.js"

# (fichier, texte actuel, texte d'avant)
NEUTRALISATIONS = [
    (PHYSICS, "boostCooldown: 3.10,", "boostCooldown: 0.64,"),
    (PHYSICS, "lateralBoostCooldown: 2.35,", "lateralBoostCooldown: 0.70,"),
    (PHYSICS, "boostRollKick: 0.34,", "boostRollKick: 0.0,"),
    (PHYSICS, "boostRollVelKick: 0.55,", "boostRollVelKick: 0.0,"),
    (PHYSICS, "boostCohesionCost: 0.045,", "boostCohesionCost: -0.025,"),
    (BALANCE, "weaponBias: { roll: 2.0, hull: 0.62, water: 1.25 },",
              "weaponBias: { roll: 1.0, hull: 1.0, water: 1.0 },"),
]


def patcher(vers_avant: bool):
    for chemin, actuel, avant in NEUTRALISATIONS:
        texte = chemin.read_text(encoding="utf-8")
        source, cible = (actuel, avant) if vers_avant else (avant, actuel)
        if source not in texte:
            raise SystemExit(f"motif introuvable dans {chemin.name}: {source!r}")
        chemin.write_text(texte.replace(source, cible, 1), encoding="utf-8")


def mesurer(etiquette: str) -> dict:
    resultat = subprocess.run(
        [sys.executable, str(RACINE / "tools/playtest_probe.py")],
        cwd=RACINE, capture_output=True, text=True, timeout=600,
    )
    if resultat.returncode != 0:
        return {"etiquette": etiquette, "erreur": resultat.stderr[-800:]}
    bilan = json.loads(resultat.stdout)
    bilan["etiquette"] = etiquette
    return bilan


def main():
    mesures = []
    try:
        mesures.append(mesurer("APRES (constantes actuelles)"))
        patcher(vers_avant=True)
        mesures.append(mesurer("AVANT (constantes d'origine)"))
    finally:
        # Restauration inconditionnelle : un A/B ne doit jamais laisser le depot
        # dans l'etat de controle.
        try:
            patcher(vers_avant=False)
        except SystemExit:
            pass

    cles = ["rollMoyenRad", "rollMaxRad", "pourcentHorsControle", "vitesseMoyenneKmh",
            "chavirages", "eliminations", "positionJoueur", "turbosAcceptes", "shiftsParfaits"]
    print(f"{'mesure':<22}" + "".join(f"{m['etiquette'][:26]:>28}" for m in mesures))
    for cle in cles:
        ligne = f"{cle:<22}"
        for m in mesures:
            ligne += f"{str(m.get(cle, '—')):>28}"
        print(ligne)
    print()
    print(json.dumps(mesures, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
