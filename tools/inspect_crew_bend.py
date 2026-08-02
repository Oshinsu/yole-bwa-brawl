"""Mesure le COUDE ET LE GENOU de la pose de repos du rig d'equipage.

  blender --background --factory-startup --python tools/inspect_crew_bend.py -- assets/models/yole_crew.glb

⚠️ POURQUOI CETTE MESURE AVANT DE TOUCHER AU RIG.
`CREW_AUTHENTICITY_AUDIT.md` demande "quatre controleurs de direction" parce que
l'IK CCD du jeu ne sait pas de quel COTE plier un coude. Mais avant d'ajouter des
os au GLB, il faut savoir si l'information n'est pas DEJA la : une pose de repos
dont les membres sont legerement flechis encode son plan de flexion. Si c'est le
cas, le pole target se derive du rig existant — aucun asset a reexporter, et ca
marche aussi pour un Mixamo quelconque.

Le script n'ecrit rien. Il sort un JSON.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


CHAINES = {
    "brasGauche": ("LeftArm", "LeftForeArm", "LeftHand"),
    "brasDroit": ("RightArm", "RightForeArm", "RightHand"),
    "jambeGauche": ("LeftUpLeg", "LeftLeg", "LeftFoot"),
    "jambeDroite": ("RightUpLeg", "RightLeg", "RightFoot"),
}


def arguments() -> list[str]:
    return sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def arrondi(valeur: float, chiffres: int = 4) -> float:
    return round(float(valeur), chiffres)


def vecteur(v) -> list[float]:
    return [arrondi(c) for c in v]


def analyse_chaine(os_par_nom: dict, racine: str, milieu: str, bout: str) -> dict:
    manquants = [n for n in (racine, milieu, bout) if n not in os_par_nom]
    if manquants:
        return {"ok": False, "manquants": manquants}

    a = os_par_nom[racine].head_local
    b = os_par_nom[milieu].head_local
    c = os_par_nom[bout].head_local

    segment_haut = b - a
    segment_bas = c - b
    if segment_haut.length < 1e-6 or segment_bas.length < 1e-6:
        return {"ok": False, "raison": "segment degenere"}

    # Angle interieur de l'articulation. 180 deg = membre parfaitement tendu,
    # donc AUCUNE information de plan : c'est le cas degenere qu'on cherche.
    angle = math.degrees(segment_haut.angle(-segment_bas))
    flexion = 180.0 - angle

    # Direction du pole : la perpendiculaire a la corde racine->bout, dans le
    # plan des deux segments, pointant du cote ou le milieu s'ecarte. C'est
    # exactement ce qu'un pole target encode.
    corde = c - a
    pole = Vector((0, 0, 0))
    ecart = 0.0
    if corde.length > 1e-6:
        projection = a + corde * (((b - a).dot(corde)) / corde.dot(corde))
        pole = b - projection
        ecart = pole.length
        if ecart > 1e-6:
            pole = pole / ecart

    return {
        "ok": True,
        "angleInterieurDeg": arrondi(angle, 2),
        "flexionDeg": arrondi(flexion, 2),
        "ecartHorsCordeM": arrondi(ecart),
        "directionPole": vecteur(pole),
        "tetes": {racine: vecteur(a), milieu: vecteur(b), bout: vecteur(c)},
    }


def main() -> None:
    args = arguments()
    if not args:
        raise SystemExit("chemin GLB manquant apres --")
    source = Path(args[0]).expanduser().resolve()
    if not source.is_file():
        raise SystemExit(f"GLB introuvable : {source}")

    bpy.ops.wm.read_factory_settings(use_empty=True)
    if "FINISHED" not in bpy.ops.import_scene.gltf(filepath=str(source)):
        raise SystemExit("import glTF echoue")

    armatures = [o for o in bpy.context.scene.objects if o.type == "ARMATURE"]
    if not armatures:
        raise SystemExit("aucune armature")
    os_par_nom = {b.name: b for b in armatures[0].data.bones}

    chaines = {
        nom: analyse_chaine(os_par_nom, *noms)
        for nom, noms in CHAINES.items()
    }

    exploitables = [c for c in chaines.values() if c.get("ok") and c["flexionDeg"] >= 3.0]
    rapport = {
        "blender": bpy.app.version_string,
        "source": str(source),
        "os": sorted(os_par_nom),
        "chaines": chaines,
        # Le verdict qui commande la suite : si la pose de repos flechit assez,
        # le pole target se DERIVE et le GLB n'a pas besoin d'os supplementaires.
        "poleDerivableDuRepos": len(exploitables) == len(CHAINES),
        "chainesExploitables": len(exploitables),
    }
    print("CREW_BEND_JSON=" + json.dumps(rapport, ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    main()
