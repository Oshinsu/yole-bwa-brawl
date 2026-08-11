#!/usr/bin/env python3
"""Prépare et exporte l'asset d'équipage sans toucher à la production.

Ce script s'exécute *dans Blender* :

    blender --background --factory-startup \
      --python tools/build_crew_asset.py -- --mode all

Sorties par défaut (toutes hors du paquet livré) :

    art-source/3d/crew/yole_crew_master.blend
    tmp/crew-v2/yole_crew_candidate.glb
    tmp/crew-v2/yole_crew_candidate.report.json

Le pipeline a deux responsabilités volontairement séparées :

* ``prepare`` importe ``art-source/yoleur_stylise.glb``, retire le clip nul et
  les formes de contrôle importées, crée cinq Actions de travail et sauvegarde
  un .blend canonique ;
* ``export`` ouvre ce .blend, exporte uniquement la collection
  ``YBB_CREW_EXPORT`` et audite le GLB produit.

Les cinq Actions initiales portent une première passe biomécanique vérifiée
dans Blender (pose + micro-cycle fermé). ``productionReady`` reste faux tant
que leurs contacts avec les proxies de coque/bwa n'ont pas été validés et
marqués par l'artiste.

Garde-fou absolu : ce script refuse d'écrire
``assets/models/yole_crew.glb``. Le branchement production reste une opération
distincte, explicite et relue.
"""

from __future__ import annotations

import argparse
import json
import math
import struct
import sys
from pathlib import Path
from typing import Iterable

import bpy


ROOT = Path(__file__).resolve().parents[1]
PRODUCTION_GLB = (ROOT / "assets" / "models" / "yole_crew.glb").resolve()
DEFAULT_SOURCE = ROOT / "art-source" / "yoleur_stylise.glb"
DEFAULT_BLEND = ROOT / "art-source" / "3d" / "crew" / "yole_crew_master.blend"
DEFAULT_DIR = ROOT / "tmp" / "crew-v2"
DEFAULT_GLB = DEFAULT_DIR / "yole_crew_candidate.glb"
DEFAULT_REPORT = DEFAULT_DIR / "yole_crew_candidate.report.json"

EXPORT_COLLECTION = "YBB_CREW_EXPORT"
GUIDES_COLLECTION = "YBB_CREW_GUIDES"
PIPELINE_VERSION = 2
FPS = 24

# ⚠️ TROIS CLÉS NE FONT PAS UNE ANIMATION, ET C'EST CE QU'ON LIVRAIT.
#
# Les boucles tenaient sur (1, 37, 73) : un repos, un apex, un retour. Mesuré le
# 4 août 2026 sur le GLB livré, ça donnait 1,5° d'amplitude interne maximum,
# toujours sur Spine02, IDENTIQUE dans les cinq actions — et neuf canaux sur
# seize strictement gelés. Le rapport validait pourtant tout en vert : il
# comptait les clés sans jamais les comparer entre elles.
#
# Douze intervalles portent six échantillons par cycle de respiration, ce qui
# suffit largement à une interpolation LINÉAIRE : l'erreur de corde reste sous
# 3 % de l'amplitude, invisible sur un corps haut de treize pixels. On garde
# donc des clés éparses plutôt qu'un échantillonnage par frame, qui pèserait
# vingt fois plus pour la même lecture.
LOOP_FRAMES = tuple(1.0 + 6.0 * index for index in range(13))
TRANSITION_FRAMES = tuple(1.0 + 5.0 * index for index in range(5))

REQUIRED_ACTIONS = (
    "pont_interieur",
    "cale_court",
    "demi_sorti",
    "extension_extreme",
    "compression_transition",
)

ACTION_BRIEFS = {
    "pont_interieur": "Bassin dans la coque, masse compacte, appuis proches.",
    "cale_court": "Bassin au plat-bord, deux contacts fermes, levier court.",
    "demi_sorti": "Corps engagé dehors, appui principal lisible, un membre libre.",
    "extension_extreme": "Extension maximale réservée à un seul dresseur.",
    "compression_transition": "Reprise d'appui basse avant le déplacement suivant.",
}

# Rotations validées dans Blender 5.2 après import TEMPERANCE. Elles sont
# relatives au bind, en Euler XYZ, et ne contiennent volontairement aucune
# translation de Hips. C'est une base biomécanique : les contacts exacts avec
# les bwa restent ajustés par les proxies/IK et le runtime.
#
# ── LE RENVERSEMENT ET LE REPLI, D'APRÈS PHOTOS DE COURSE ───────────────────
#
# ⚠️ RECALÉS LE 4 AOÛT 2026 SUR IMAGES DU TOUR DES YOLES.
#
# Un dresseur au rappel n'est pas « penché » : il est en BALANCE, bassin sur le
# bwa, TÊTE PLUS BASSE QUE LES HANCHES, jambes repliées franchement et
# crochetées vers la coque. Deux critères se lisent directement sur une photo et
# ne se truquent pas : l'inclinaison du tronc et la flexion du genou.
#
# Mesuré avant correction (`tools/mesure_silhouette_equipage.mjs`) : tronc à 67°
# avec la tête 26 cm AU-DESSUS des hanches, et genou fléchi de 21° — des jambes
# quasi tendues. Les hommes lisaient comme des passagers inclinés.
#
# ⚠️ ET LE BASSIN N'ÉTAIT PAS LE BON LEVIER — CORRIGÉ LE MÊME JOUR.
#
# Première tentative : monter `Hips` jusqu'à 140° pour passer la tête sous les
# hanches, comme le montrent les photos de rappel extrême. La mesure disait vert.
# Elle était aveugle au ROULIS : au-delà de ~110° le bassin ne penche plus,
# il ROULE l'homme sur le VENTRE. Mesuré dans le repère de la yole :
#
#   Hips 140 -> corps dehors, tête −0,40 m, regard −0,67  = ventre à la mer
#   Hips  70 -> corps dehors, tête +0,31 m, regard +0,42  = DOS à la mer
#   Hips  40 -> corps dehors, tête +0,54 m, regard +0,80  = dos à la mer, assis
#
# Un yoleur travaille DOS À LA MER, en levier : c'est le dos qui porte, la face
# reste tournée vers le bateau et la voile. L'échelle revient donc près de ses
# valeurs d'origine, plafonnée à 70° — au-delà, la lecture bascule.
#
# Ce que la première passe a corrigé et qui RESTE, parce que c'est un défaut
# indépendant du bassin : le genou ne pliait que de 19°, jambes quasi tendues.
#
# ── LA TÊTE, RELEVÉE LE MÊME JOUR ───────────────────────────────────────────
#
# La nuque était molle : regard mesuré à −1,00, plein sur l'eau — la lecture
# d'un corps inerte drapé sur une barre. Sur les images les têtes sont RELEVÉES,
# l'homme regarde devant : il travaille. C'est le détail qui sépare « accroché »
# de « posé », et il ne coûte que deux os. Relevé de 35° à la tête, 16° à la
# nuque.
#
# Regard obtenu, par station : +0,26 à l'intérieur, +0,61 au court, +0,46 à
# l'intermédiaire, +0,36 en extension. Positif = face vers le ciel, donc DOS à
# la mer — la lecture de levier.
#
# ⚠️ TROIS LECTURES SUCCESSIVES ONT ÉTÉ FAITES DE CES PHOTOS, DEUX ÉTAIENT
# FAUSSES. Il a d'abord été conclu « ventral » depuis des vues d'arrière où l'on
# croyait voir des dos au ciel, puis l'inverse. Ce n'est pas une photo qui a
# tranché mais un praticien : le yoleur travaille DOS À LA MER. Aucune vue de
# trois quarts ne permet de décider — seul un profil, ou quelqu'un qui pratique.
#
# ⚠️ POURQUOI `Hips` PORTE MAINTENANT L'ESSENTIEL. Le renversement venait du
# procédural (`CREW_HIKE_RECLINE`), mais `syncRig` ne lui laisse plus que 41 %
# d'amplitude depuis que l'assise et la station tiennent l'autorité. Le tripler
# ne suffisait donc plus — c'est un constat mesuré, pas une préférence.
POSE_ROTATIONS_DEG = {
    # Assise recalée le 6 août 2026 sur photos de bordée SANS gîte (Tour des
    # yoles 2019, GFA Caraïbes, CC BY-SA — tmp/references/) : l'homme est ASSIS
    # sur le plat-bord, cuisses relevées vers l'horizontale, tibias vers le fond
    # de la coque, avant-bras posés sur les cuisses. La version précédente
    # (cuisses à 25°, jambes à −95°) le laissait à genoux sur le pont — une
    # lecture « pirogue à rameurs » que les photos ne montrent jamais.
    "pont_interieur": {
        "LeftShoulder": (2, 0, 5),
        "RightShoulder": (2, 0, -5),
        "Hips": (-11, 0, 4),
        "Spine02": (12, 0, -2),
        "Spine01": (8, 0, -1),
        "Spine": (3, 0, 0),
        "neck": (-21, 0, 0),
        "LeftUpLeg": (62, 0, -8),
        "RightUpLeg": (66, 0, 8),
        "LeftLeg": (-100, 0, 0),
        "RightLeg": (-104, 0, 0),
        "LeftFoot": (8, 0, 0),
        "RightFoot": (6, 0, 0),
        "LeftArm": (-13, 0, 25),
        "RightArm": (-15, 0, -23),
        "LeftForeArm": (-62, 0, 4),
        "RightForeArm": (-56, 0, -4),
        "Head": (-40, 0, 0),
    },
    "cale_court": {
        "LeftShoulder": (1, 0, 4),
        "RightShoulder": (1, 0, -4),
        "Hips": (40, 0, 3),
        "Spine02": (4, 0, -2),
        "Spine01": (1, 0, 0),
        "Spine": (1, 0, 0),
        "neck": (-28, 0, 0),
        "LeftUpLeg": (10, 0, -12),
        "RightUpLeg": (5, 0, 11),
        "LeftLeg": (-95, 0, 0),
        "RightLeg": (-85, 0, 0),
        "LeftFoot": (10, 0, 0),
        "RightFoot": (8, 0, 0),
        "LeftArm": (0, 0, 35),
        "RightArm": (0, 0, -33),
        "LeftForeArm": (0, 0, 7),
        "RightForeArm": (0, 0, -7),
        "Head": (-56, 0, 0),
    },
    "demi_sorti": {
        "LeftShoulder": (0, 0, 3),
        "RightShoulder": (1, 0, -3),
        "Hips": (55, 0, 2),
        "Spine02": (7, 0, -3),
        "Spine01": (3, 0, 0),
        "Spine": (2, 0, 0),
        "neck": (-31, 0, 0),
        "LeftUpLeg": (10, 0, -10),
        "RightUpLeg": (-20, 0, 8),
        "LeftLeg": (-100, 0, 0),
        "RightLeg": (-60, 0, 0),
        "LeftFoot": (12, 0, 0),
        "RightFoot": (-5, 0, 0),
        "LeftArm": (0, 0, 40),
        "RightArm": (0, 0, -38),
        "LeftForeArm": (-20, 0, 8),
        "RightForeArm": (-20, 0, -8),
        "Head": (-66, 0, 0),
    },
    "extension_extreme": {
        "LeftShoulder": (-3, 0, 2),
        "RightShoulder": (2, 0, -6),
        "Hips": (70, 0, 0),
        "Spine02": (9, 0, -2),
        "Spine01": (4, 0, 0),
        "Spine": (3, 0, 0),
        "neck": (-38, 0, 0),
        "LeftUpLeg": (0, 0, -10),
        "RightUpLeg": (-45, 0, 5),
        "LeftLeg": (-105, 0, 0),
        "RightLeg": (-75, 0, 0),
        "LeftFoot": (16, 0, 0),
        "RightFoot": (-8, 0, 0),
        "LeftArm": (-42, 0, 16),
        "RightArm": (-38, 0, -14),
        "LeftForeArm": (-24, 0, 6),
        "RightForeArm": (-20, 0, -5),
        "Head": (-75, 0, 0),
    },
    "compression_transition": {
        "LeftShoulder": (3, 0, 6),
        "RightShoulder": (0, 0, -3),
        "Hips": (48, 0, -8),
        "Spine02": (15, 0, 4),
        "Spine01": (10, 0, 3),
        "Spine": (6, 0, 2),
        "neck": (-26, 0, 0),
        "LeftUpLeg": (50, 0, -12),
        "RightUpLeg": (-30, 0, 16),
        "LeftLeg": (-115, 0, 0),
        "RightLeg": (-50, 0, 0),
        "LeftFoot": (18, 0, 0),
        "RightFoot": (-5, 0, 0),
        "LeftArm": (-20, 0, 40),
        "RightArm": (-5, 0, -25),
        "LeftForeArm": (-55, 0, 7),
        "RightForeArm": (-35, 0, -10),
        "Head": (-43, 0, 0),
    },
}

# ── MOUVEMENT PORTÉ PAR CHAQUE POSE ─────────────────────────────────────────
#
# Par os : amplitude en degrés sur (x, y, z), nombre de CYCLES sur la boucle, et
# déphasage en tours. La valeur écrite à la clé est
# `base + amplitude * sin(2π * (cycles * u + phase))`, avec u la progression
# dans la boucle. Un nombre entier de cycles referme donc la boucle exactement,
# ce que le rapport vérifie encore.
#
# ⚠️ CE QUE CES AMPLITUDES DOIVENT ÊTRE, ET CE QU'ELLES NE DOIVENT PAS ÊTRE.
#
# L'ancien jeu d'offsets était calibré comme un CLIP mélangé faiblement — sous
# 1,5°, parce que le plafond de `setClipBlend` est à 0,35 et qu'un clip ne doit
# pas concurrencer la mer. Mais ces cinq actions ne passent PAS par ce plafond :
# elles sont des poses macro, tenues à 0,74 pour l'assise et jusqu'à 0,82 pour
# la station. Ce qui est écrit ici arrive donc à l'écran quasiment au réel.
#
# 1,5° × 0,8 ne se voyait pas. Cinq degrés se voient. Vingt seraient de la
# gymnastique : un homme sous charge respire et se rétablit, il ne danse pas.
#
# Les déphasages désolidarisent les membres. Sans eux, seize os montent et
# descendent ensemble et le corps entier « pompe » — un défaut plus visible que
# l'immobilité, parce qu'aucun corps réel ne fait ça.
POSE_MOTION_DEG = {
    # os                amplitude (x, y, z)   cycles  phase
    "Spine02": ((5.0, 0.0, 1.2), 2.0, 0.00),
    "Spine01": ((3.4, 0.0, 0.8), 2.0, 0.04),
    "Spine": ((2.0, 0.0, 0.5), 2.0, 0.08),
    "neck": ((-2.6, 1.4, 0.0), 2.0, 0.12),
    # La tête suit sa propre horloge : c'est le seul os dont le décalage se lit
    # à la distance de jeu, et il suffit à distinguer six hommes déphasés.
    "Head": ((-2.0, 4.5, 0.0), 1.0, 0.30),
    # Les clavicules. Elles n'étaient KEYÉES NULLE PART — huit os sur vingt-
    # quatre ne l'étaient pas, et ce sont elles qui portent la ceinture
    # scapulaire. Sans elles, l'épaule est une bille : le bras bouge, le buste
    # ne l'accompagne jamais.
    "LeftShoulder": ((1.6, 0.0, 3.2), 2.0, 0.02),
    "RightShoulder": ((1.6, 0.0, -3.2), 2.0, 0.02),
    "LeftArm": ((2.4, 0.0, 2.0), 1.0, 0.10),
    "RightArm": ((2.4, 0.0, -2.0), 1.0, 0.60),
    "LeftForeArm": ((3.0, 0.0, 0.0), 1.0, 0.15),
    "RightForeArm": ((3.0, 0.0, 0.0), 1.0, 0.65),
    "Hips": ((2.2, 1.6, 0.0), 1.0, 0.00),
    # Les jambes en opposition de phase : un appui se charge pendant que
    # l'autre se relâche. C'est ce report de poids qui fait « tenir », et il est
    # invisible si les deux jambes bougent ensemble.
    "LeftUpLeg": ((2.0, 0.0, 1.2), 1.0, 0.50),
    "RightUpLeg": ((2.0, 0.0, -1.2), 1.0, 0.00),
    "LeftLeg": ((-2.4, 0.0, 0.0), 1.0, 0.55),
    "RightLeg": ((-2.4, 0.0, 0.0), 1.0, 0.05),
    "LeftFoot": ((1.4, 0.0, 0.0), 1.0, 0.60),
    "RightFoot": ((1.4, 0.0, 0.0), 1.0, 0.10),
}

# La transition n'est pas une boucle : elle est jouée par PROGRESSION de la
# traversée, pas par le temps. Elle garde donc un seul cycle — comprimer, puis
# rendre — et une amplitude plus franche, parce qu'elle décrit un geste et non
# une tenue.
TRANSITION_MOTION_GAIN = 2.1

# Plancher d'amplitude d'une action, en degrés. Volontairement bas : on exige un
# signe de vie, pas une chorégraphie. L'ancien jeu de poses plafonnait à 1,5° et
# passait tous les contrôles.
MINIMUM_ACTION_AMPLITUDE_DEG = 4.0


def pose_keyframes(name: str) -> list[tuple[float, dict[str, tuple[float, float, float]]]]:
    """Les clés d'une action, en degrés, dans l'ordre des frames.

    ⚠️ UNE SEULE SOURCE DE VÉRITÉ, ET C'EST LE POINT DE CETTE FONCTION.
    `scaffold_action` écrivait la formule, `action_summary` la RECOPIAIT pour
    vérifier que le .blend correspondait toujours au seed. Deux recopies de la
    même règle finissent toujours par diverger sans rien dire — le projet a
    déjà payé ce défaut sur `HULL_STATIONS`. Les deux appellent désormais ici.
    """
    base_pose = POSE_ROTATIONS_DEG[name]
    transition = name == "compression_transition"
    frames = TRANSITION_FRAMES if transition else LOOP_FRAMES
    gain = TRANSITION_MOTION_GAIN if transition else 1.0
    keyed_bones = sorted(set(base_pose) | set(POSE_MOTION_DEG))
    # Chaque action décale sa propre horloge : le runtime déphase déjà les six
    # hommes entre eux, mais deux actions voisines qui démarreraient au même
    # endroit du cycle rendraient ce déphasage illisible sur un changement de
    # station.
    offset = REQUIRED_ACTIONS.index(name) * 0.17
    span = frames[-1] - frames[0]
    keys: list[tuple[float, dict[str, tuple[float, float, float]]]] = []
    for frame in frames:
        progress = (frame - frames[0]) / span if span else 0.0
        angles: dict[str, tuple[float, float, float]] = {}
        for bone_name in keyed_bones:
            base = base_pose.get(bone_name, (0.0, 0.0, 0.0))
            amplitude, cycles, phase = POSE_MOTION_DEG.get(
                bone_name, ((0.0, 0.0, 0.0), 1.0, 0.0)
            )
            # La traversée est un GESTE, pas une tenue : un seul aller-retour,
            # quel que soit le rythme propre de l'os dans les boucles.
            if transition:
                cycles = 1.0
            wave = math.sin(math.tau * (cycles * progress + phase + offset))
            angles[bone_name] = tuple(
                float(base[axis]) + float(amplitude[axis]) * gain * wave
                for axis in range(3)
            )
        keys.append((float(frame), angles))
    return keys


def action_keyed_bones(name: str) -> list[str]:
    return sorted(set(POSE_ROTATIONS_DEG[name]) | set(POSE_MOTION_DEG))

EXPECTED_BONES = (
    "Hips",
    "LeftUpLeg",
    "LeftLeg",
    "LeftFoot",
    "LeftToeBase",
    "RightUpLeg",
    "RightLeg",
    "RightFoot",
    "RightToeBase",
    "Spine02",
    "Spine01",
    "Spine",
    "LeftShoulder",
    "LeftArm",
    "LeftForeArm",
    "LeftHand",
    "RightShoulder",
    "RightArm",
    "RightForeArm",
    "RightHand",
    "neck",
    "Head",
    "head_end",
    "headfront",
)


class CrewBuildError(RuntimeError):
    """Erreur attendue du pipeline, affichée sans traceback verbeux."""


def blender_arguments() -> list[str]:
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def project_path(raw: str | Path) -> Path:
    path = Path(raw).expanduser()
    if not path.is_absolute():
        path = ROOT / path
    return path.resolve()


def assert_project_output(path: Path, label: str) -> None:
    if path != ROOT and ROOT not in path.parents:
        raise CrewBuildError(f"{label} doit rester dans le projet : {path}")
    if path == PRODUCTION_GLB:
        raise CrewBuildError(
            "Refus d'écraser assets/models/yole_crew.glb : "
            "le builder ne produit que des candidats."
        )
    if label == "blend" and (path == ROOT / "assets" or ROOT / "assets" in path.parents):
        raise CrewBuildError("Le .blend canonique ne doit pas entrer dans assets/.")


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--mode",
        choices=("prepare", "upgrade", "export", "all"),
        default="all",
        help=(
            "prepare crée le .blend, upgrade complète le master existant sans "
            "retirer son studio QA, export l'audite, all prépare puis exporte."
        ),
    )
    parser.add_argument("--source", default=str(DEFAULT_SOURCE))
    parser.add_argument("--blend-out", default=str(DEFAULT_BLEND))
    parser.add_argument("--glb-out", default=str(DEFAULT_GLB))
    parser.add_argument("--report-out", default=str(DEFAULT_REPORT))
    parser.add_argument(
        "--force-prepare",
        action="store_true",
        help="Autorise la régénération du .blend candidat. Jamais la production.",
    )
    parser.add_argument(
        "--reauthor-actions",
        action="store_true",
        help=(
            "Réécrit les cinq Actions depuis les seeds au lieu de conserver "
            "celles du .blend. Décision explicite : elle écrase le posing."
        ),
    )
    parser.add_argument(
        "--require-authored-actions",
        action="store_true",
        help="Retourne une erreur tant que les cinq Actions sont encore neutres.",
    )
    args = parser.parse_args(blender_arguments())
    args.source = project_path(args.source)
    args.blend_out = project_path(args.blend_out)
    args.glb_out = project_path(args.glb_out)
    args.report_out = project_path(args.report_out)
    assert_project_output(args.blend_out, "blend")
    assert_project_output(args.glb_out, "glb")
    assert_project_output(args.report_out, "report")
    return args


def iter_action_fcurves(action: bpy.types.Action):
    """Traverse les Actions modernes (Blender 4.4+) et l'ancien format."""
    seen: set[int] = set()
    for layer in getattr(action, "layers", ()):
        for strip in layer.strips:
            for channel_bag in getattr(strip, "channelbags", ()):
                for fcurve in channel_bag.fcurves:
                    pointer = fcurve.as_pointer()
                    if pointer not in seen:
                        seen.add(pointer)
                        yield fcurve
    for fcurve in getattr(action, "fcurves", ()):
        pointer = fcurve.as_pointer()
        if pointer not in seen:
            seen.add(pointer)
            yield fcurve


def action_key_span(action: bpy.types.Action) -> tuple[float, float] | None:
    frames = [
        float(point.co.x)
        for fcurve in iter_action_fcurves(action)
        for point in fcurve.keyframe_points
    ]
    return (min(frames), max(frames)) if frames else None


def is_null_action(action: bpy.types.Action) -> bool:
    span = action_key_span(action)
    return span is None or span[1] - span[0] <= 1e-4


def detach_action(action: bpy.types.Action) -> None:
    for obj in bpy.data.objects:
        animation = obj.animation_data
        if animation is None:
            continue
        if animation.action == action:
            animation.action = None
        for track in list(animation.nla_tracks):
            for strip in list(track.strips):
                if strip.action == action:
                    track.strips.remove(strip)
            if not track.strips:
                animation.nla_tracks.remove(track)


def remove_null_actions() -> list[str]:
    removed: list[str] = []
    for action in list(bpy.data.actions):
        if is_null_action(action):
            removed.append(action.name)
            detach_action(action)
            bpy.data.actions.remove(action)
    return removed


def clear_custom_shapes(armatures: Iterable[bpy.types.Object]) -> int:
    count = 0
    for armature in armatures:
        for pose_bone in armature.pose.bones:
            if pose_bone.custom_shape is not None:
                pose_bone.custom_shape = None
                count += 1
    return count


def armature_for_mesh(obj: bpy.types.Object) -> bpy.types.Object | None:
    for modifier in obj.modifiers:
        if modifier.type == "ARMATURE" and modifier.object is not None:
            return modifier.object
    return obj.parent if obj.parent and obj.parent.type == "ARMATURE" else None


def imported_rig() -> tuple[bpy.types.Object, bpy.types.Object]:
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    skinned = [
        obj
        for obj in bpy.context.scene.objects
        if obj.type == "MESH" and armature_for_mesh(obj) is not None
    ]
    if len(armatures) != 1 or len(skinned) != 1:
        raise CrewBuildError(
            f"Source ambiguë : {len(armatures)} armature(s), "
            f"{len(skinned)} mesh(es) skinné(s), attendu 1 + 1."
        )
    if armature_for_mesh(skinned[0]) != armatures[0]:
        raise CrewBuildError("Le mesh skinné ne référence pas l'unique armature.")
    return armatures[0], skinned[0]


def remove_helper_meshes(skinned_mesh: bpy.types.Object) -> list[str]:
    """Retire notamment l'Icosphere utilisée comme custom shape des 24 os."""
    removed: list[str] = []
    for obj in list(bpy.context.scene.objects):
        if obj.type != "MESH" or obj == skinned_mesh:
            continue
        removed.append(obj.name)
        data = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if data.users == 0:
            bpy.data.meshes.remove(data)
    return removed


def ensure_collection(name: str) -> bpy.types.Collection:
    collection = bpy.data.collections.get(name)
    if collection is None:
        collection = bpy.data.collections.new(name)
    if collection.name not in {child.name for child in bpy.context.scene.collection.children}:
        bpy.context.scene.collection.children.link(collection)
    return collection


def move_to_collection(obj: bpy.types.Object, collection: bpy.types.Collection) -> None:
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)


def reset_pose(armature: bpy.types.Object) -> None:
    armature.data.pose_position = "POSE"
    for pose_bone in armature.pose.bones:
        pose_bone.matrix_basis.identity()
        pose_bone.rotation_mode = "XYZ"
    bpy.context.view_layer.update()


def scaffold_action(
    armature: bpy.types.Object, name: str, reauthor: bool = False
) -> bpy.types.Action:
    action = bpy.data.actions.get(name)
    if action is not None and not reauthor:
        return action
    if action is not None:
        # Réécriture demandée : le datablock est jeté et refait. Les cinq
        # actions sont ENTIÈREMENT dérivées du seed — `declaredSeedMatches` le
        # vérifiait déjà à chaque export — donc il n'y a rien de fait main à
        # préserver ici. Le jour où il y en aura, ce sera à `--reauthor-actions`
        # de rester une décision explicite, ce qu'elle est.
        armature.animation_data_clear()
        bpy.data.actions.remove(action)

    action = bpy.data.actions.new(name=name)
    action.use_fake_user = True
    action["ybb_role"] = "crew_pose"
    action["ybb_status"] = "authored_seed_v1"
    action["ybb_brief"] = ACTION_BRIEFS[name]
    action["ybb_rotations_only"] = True
    action["ybb_relative_to_bind"] = True
    action["ybb_contact_validated"] = False

    animation = armature.animation_data_create()
    animation.action = action
    keyed_bones = action_keyed_bones(name)
    missing_bones = [bone_name for bone_name in keyed_bones if bone_name not in armature.pose.bones]
    if missing_bones:
        raise CrewBuildError(
            f"Os requis absents pour {name} : {', '.join(missing_bones)}"
        )

    for frame, angles in pose_keyframes(name):
        for bone_name in keyed_bones:
            pose_bone = armature.pose.bones[bone_name]
            pose_bone.rotation_mode = "XYZ"
            pose_bone.rotation_euler = tuple(
                math.radians(value) for value in angles[bone_name]
            )
            inserted = pose_bone.keyframe_insert(
                data_path="rotation_euler",
                frame=frame,
                group=pose_bone.name,
            )
            if not inserted:
                raise CrewBuildError(
                    f"Impossible de créer les clés de {name}/{pose_bone.name}."
                )

    # ⚠️ LINÉAIRE, ET CE N'EST PAS UN DÉTAIL DE CONFORT.
    #
    # Avec des poignées Bézier et `export_force_sampling=False`, l'exportateur
    # glTF sort du CUBICSPLINE : la spec y range TROIS quaternions par clé —
    # tangente entrante, valeur, tangente sortante. `GLTFLoader` laisse ce
    # tampon tel quel, et le consommateur qui lit `values[k * 4]` ramène alors
    # une TANGENTE. Celles d'une pose Blender valent (0, 0, 0, 0), et un
    # quaternion nul finit en échelle d'os — c'est le défaut mesuré le 4 août.
    #
    # Le runtime sait désormais lire les deux pas, mais rien ne justifie de
    # tripler le tampon : `CrewClipLibrary` interpole en slerp et ignore de
    # toute façon les tangentes. Douze intervalles par boucle rendent la corde
    # indiscernable de la courbe.
    for fcurve in iter_action_fcurves(action):
        for point in fcurve.keyframe_points:
            point.interpolation = "LINEAR"
    animation.action = None
    reset_pose(armature)
    return action


def write_blend_readme() -> None:
    text = bpy.data.texts.get("YBB_CREW_PIPELINE_README")
    if text is None:
        text = bpy.data.texts.new("YBB_CREW_PIPELINE_README")
    text.clear()
    text.write(
        "YOLE BWA BRAWL — EQUIPAGE CANDIDAT\n\n"
        "Ne pas exporter à la main vers assets/models/yole_crew.glb.\n"
        "Actions requises :\n- "
        + "\n- ".join(REQUIRED_ACTIONS)
        + "\n\n"
        "Contrat : rotations d'os seulement, boucle fermée, aucun déplacement "
        "de root caché. Le builder headless exporte et audite le candidat.\n"
    )


def configure_master(
    armature: bpy.types.Object,
    mesh: bpy.types.Object,
    source: Path,
    reauthor_actions: bool = False,
) -> None:
    reset_pose(armature)
    armature.name = "CrewArmature"
    armature.data.name = "CrewRig"
    mesh.name = "CrewMesh"
    mesh.data.name = "CrewMeshData"

    export_collection = ensure_collection(EXPORT_COLLECTION)
    ensure_collection(GUIDES_COLLECTION)
    move_to_collection(armature, export_collection)
    move_to_collection(mesh, export_collection)

    for action_name in REQUIRED_ACTIONS:
        scaffold_action(armature, action_name, reauthor=reauthor_actions)

    scene = bpy.context.scene
    scene.render.fps = FPS
    scene.render.fps_base = 1.0
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.length_unit = "METERS"
    scene["ybb_pipeline_version"] = PIPELINE_VERSION
    scene["ybb_source_glb"] = str(source.relative_to(ROOT))
    scene["ybb_export_collection"] = EXPORT_COLLECTION
    scene["ybb_required_actions"] = json.dumps(REQUIRED_ACTIONS)
    armature["ybb_export"] = True
    mesh["ybb_export"] = True
    write_blend_readme()

    # Les images embarquées dans le GLB source doivent rester autonomes dans
    # le .blend, sans dépendre d'un chemin temporaire d'import.
    try:
        bpy.ops.file.pack_all()
    except RuntimeError:
        # Une image générée sans fichier n'a rien à empaqueter ; la validation
        # de texture du GLB exporté reste l'autorité.
        pass


def prepare_scene(source: Path, reauthor_actions: bool = False) -> dict:
    if not source.is_file():
        raise CrewBuildError(f"Source GLB introuvable : {source}")

    bpy.ops.wm.read_factory_settings(use_empty=True)
    # Ces quatre options sont intentionnelles :
    # - TEMPERANCE conserve des os lisibles sans altérer les matrices de skin ;
    # - disable_bone_shape évite l'Icosphere de contrôle créée par l'importeur ;
    # - guess_original_bind_pose restaure le bind glTF quand Blender peut le
    #   déduire des inverse bind matrices ;
    # - import_pack_images rend le master .blend autonome.
    result = bpy.ops.import_scene.gltf(
        filepath=str(source),
        bone_heuristic="TEMPERANCE",
        disable_bone_shape=True,
        guess_original_bind_pose=True,
        import_pack_images=True,
    )
    if "FINISHED" not in result:
        raise CrewBuildError(f"Import glTF échoué : {result}")

    armature, mesh = imported_rig()
    removed_actions = remove_null_actions()
    custom_shapes = clear_custom_shapes((armature,))
    removed_helpers = remove_helper_meshes(mesh)
    configure_master(armature, mesh, source, reauthor_actions=reauthor_actions)

    return {
        "nullActionsRemoved": removed_actions,
        "customShapesCleared": custom_shapes,
        "helperMeshesRemoved": removed_helpers,
    }


def upgrade_scene(source: Path, reauthor_actions: bool = False) -> dict:
    """Complète un master interactif sans toucher à ses collections QA."""
    armature, mesh = imported_rig()
    removed_actions = remove_null_actions()
    custom_shapes = clear_custom_shapes((armature,))
    configure_master(armature, mesh, source, reauthor_actions=reauthor_actions)
    return {
        "nullActionsRemoved": removed_actions,
        "customShapesCleared": custom_shapes,
        "helperMeshesRemoved": [],
        "qaCollectionsPreserved": [
            collection.name
            for collection in bpy.data.collections
            if collection.name not in {EXPORT_COLLECTION, GUIDES_COLLECTION}
        ],
    }


def action_summary(action: bpy.types.Action) -> dict:
    curves = list(iter_action_fcurves(action))
    paths = sorted({curve.data_path for curve in curves})
    span = action_key_span(action)
    rotation_only = bool(curves) and all(
        path.endswith((".rotation_quaternion", ".rotation_euler", ".rotation_axis_angle"))
        for path in paths
    )
    minimum_keys = min(
        (len(curve.keyframe_points) for curve in curves),
        default=0,
    )
    loop_closed = bool(curves) and all(
        len(curve.keyframe_points) >= 2
        and math.isclose(
            float(curve.keyframe_points[0].co.y),
            float(curve.keyframe_points[-1].co.y),
            rel_tol=0.0,
            abs_tol=1e-4,
        )
        for curve in curves
    )

    authored = False
    for curve in curves:
        if curve.data_path.endswith(".rotation_quaternion"):
            identity = 1.0 if curve.array_index == 0 else 0.0
        elif curve.data_path.endswith(".rotation_euler"):
            identity = 0.0
        elif curve.data_path.endswith(".rotation_axis_angle"):
            identity = 0.0 if curve.array_index == 0 else None
        else:
            identity = None
        if identity is not None and any(
            not math.isclose(
                float(point.co.y),
                identity,
                rel_tol=0.0,
                abs_tol=1e-4,
            )
            for point in curve.keyframe_points
        ):
            authored = True
            break

    seed_matches: bool | None = None
    if action.name in POSE_ROTATIONS_DEG:
        keyed_bones = action_keyed_bones(action.name)
        curve_map = {
            (curve.data_path, curve.array_index): curve
            for curve in curves
        }
        seed_matches = len(curves) == len(keyed_bones) * 3
        for frame, angles in pose_keyframes(action.name):
            for bone_name in keyed_bones:
                data_path = f'pose.bones["{bone_name}"].rotation_euler'
                for axis in range(3):
                    curve = curve_map.get((data_path, axis))
                    expected = math.radians(angles[bone_name][axis])
                    if curve is None or not math.isclose(
                        float(curve.evaluate(frame)),
                        expected,
                        rel_tol=0.0,
                        abs_tol=1e-6,
                    ):
                        seed_matches = False

    # ── AMPLITUDE ────────────────────────────────────────────────────────────
    #
    # ⚠️ LA MESURE QUI MANQUAIT, ET QUI A LAISSÉ PASSER CINQ POSES FIGÉES.
    #
    # Tout ce qui précède COMPTE : des courbes, des clés, des os, des chemins.
    # Rien ne comparait jamais deux clés entre elles. Une action de trois clés
    # rigoureusement identiques cochait donc `authored`, `loopClosed`,
    # `minimumKeysPerCurve` et sortait `productionReady`.
    #
    # `frozenCurves` compte les courbes plates, `amplitudeMaxDeg` mesure la plus
    # grande excursion de l'action. Une action dont l'amplitude ne dépasse pas
    # `MINIMUM_ACTION_AMPLITUDE_DEG` n'est pas une animation : c'est une pose.
    frozen_curves = 0
    amplitude_max = 0.0
    amplitude_bone = ""
    for curve in curves:
        values = [float(point.co.y) for point in curve.keyframe_points]
        if not values:
            continue
        excursion = math.degrees(max(values) - min(values))
        if excursion <= 1e-9:
            frozen_curves += 1
        if excursion > amplitude_max:
            amplitude_max = excursion
            amplitude_bone = curve.data_path

    return {
        "name": action.name,
        "frameRange": list(span) if span else None,
        "durationFrames": (span[1] - span[0]) if span else 0.0,
        "curves": len(curves),
        "minimumKeysPerCurve": minimum_keys,
        "rotationOnly": rotation_only,
        "loopClosed": loop_closed,
        "authored": authored,
        "amplitudeMaxDeg": round(amplitude_max, 3),
        "amplitudeBone": amplitude_bone,
        "frozenCurves": frozen_curves,
        "animated": amplitude_max >= MINIMUM_ACTION_AMPLITUDE_DEG,
        "contactValidated": bool(action.get("ybb_contact_validated", False)),
        "declaredStatus": action.get("ybb_status", "unknown"),
        "declaredSeedMatches": seed_matches,
        "paths": paths,
    }


def mesh_summary(mesh_obj: bpy.types.Object) -> dict:
    mesh = mesh_obj.data
    mesh.calc_loop_triangles()
    influence_counts: list[int] = []
    bad_weight_sums = 0
    for vertex in mesh.vertices:
        weights = [group.weight for group in vertex.groups if group.weight > 1e-6]
        influence_counts.append(len(weights))
        if weights and not math.isclose(sum(weights), 1.0, rel_tol=0.0, abs_tol=0.015):
            bad_weight_sums += 1
    world_dimensions = [round(float(value), 5) for value in mesh_obj.dimensions]
    return {
        "name": mesh_obj.name,
        "vertices": len(mesh.vertices),
        "triangles": len(mesh.loop_triangles),
        "dimensions": world_dimensions,
        "worldDimensionsM": world_dimensions,
        "worldHeightM": world_dimensions[2],
        "materials": len(mesh_obj.material_slots),
        "vertexGroups": len(mesh_obj.vertex_groups),
        "maxInfluences": max(influence_counts, default=0),
        "verticesOver4Influences": sum(value > 4 for value in influence_counts),
        "unweightedVertices": sum(value == 0 for value in influence_counts),
        "badWeightSums": bad_weight_sums,
    }


def validate_scene() -> dict:
    export_collection = bpy.data.collections.get(EXPORT_COLLECTION)
    if export_collection is None:
        raise CrewBuildError(f"Collection {EXPORT_COLLECTION} absente du .blend.")

    export_objects = list(export_collection.all_objects)
    armatures = [obj for obj in export_objects if obj.type == "ARMATURE"]
    meshes = [obj for obj in export_objects if obj.type == "MESH"]
    if len(armatures) != 1 or len(meshes) != 1:
        raise CrewBuildError(
            f"{EXPORT_COLLECTION} doit contenir 1 armature et 1 mesh ; "
            f"reçu {len(armatures)} + {len(meshes)}."
        )

    armature = armatures[0]
    mesh = meshes[0]
    # La hauteur contractuelle est celle du bind, pas celle de l'Action restée
    # active quand l'artiste a sauvegardé le master. Sans cette neutralisation,
    # une pose accroupie faisait tomber artificiellement le rig de 1,70 m à
    # 1,28 m et rendait l'export dépendant de l'état de l'interface Blender.
    animation = armature.animation_data_create()
    animation.action = None
    reset_pose(armature)
    mesh_info = mesh_summary(mesh)
    armature_scale = [round(float(value), 5) for value in armature.scale]
    bones = sorted(bone.name for bone in armature.data.bones)
    actions = {
        name: action_summary(bpy.data.actions[name])
        for name in REQUIRED_ACTIONS
        if name in bpy.data.actions
    }
    missing_actions = [name for name in REQUIRED_ACTIONS if name not in actions]
    invalid_actions = [
        name
        for name, info in actions.items()
        if info["durationFrames"] <= 0
        or info["minimumKeysPerCurve"] < 2
        or not info["rotationOnly"]
        or not info["loopClosed"]
    ]
    unauthored_actions = [
        name for name, info in actions.items() if not info["authored"]
    ]
    # `authored` ne dit que « au moins une clé sort de l'identité » : une pose
    # tenue trois clés durant le satisfait. `frozen_actions` dit si l'action
    # BOUGE, ce qui n'a jamais été vérifié nulle part.
    frozen_actions = [
        name for name, info in actions.items() if not info["animated"]
    ]
    unvalidated_contacts = [
        name for name, info in actions.items() if not info["contactValidated"]
    ]

    checks = {
        "oneSkinnedMesh": (
            len(meshes) == 1 and armature_for_mesh(mesh) == armature
        ),
        "triangleBudget2000to3000": 2000 <= mesh_info["triangles"] <= 3000,
        "restWorldHeight160to180cm": 1.60 <= mesh_info["worldHeightM"] <= 1.80,
        # Le GLB source et le GLB de production utilisent tous deux cette
        # échelle d'armature. Les os sont stockés en unités centimétriques et
        # le scale 0,01 ramène leurs longueurs en mètres (cuisse ~0,314 m).
        # L'appliquer au rig modifierait le bind pour un gain purement
        # cosmétique ; on préserve donc explicitement le contrat éprouvé.
        "sourceBindScalePreserved": all(
            math.isclose(value, 0.01, rel_tol=0.0, abs_tol=1e-6)
            for value in armature.scale
        ),
        "maximum4Influences": mesh_info["maxInfluences"] <= 4,
        "allVerticesWeighted": mesh_info["unweightedVertices"] == 0,
        "normalizedWeights": mesh_info["badWeightSums"] == 0,
        "exact24BoneContract": bones == sorted(EXPECTED_BONES),
        "allRequiredActionsPresent": not missing_actions,
        "allActionsStructurallyValid": not invalid_actions,
        "allActionsAuthored": not unauthored_actions,
        "allActionsAnimated": not frozen_actions,
        "allDeclaredSeedsMatch": all(
            info["declaredSeedMatches"] is not False
            for info in actions.values()
        ),
        "allContactsArtistValidated": not unvalidated_contacts,
    }
    structural_keys = tuple(
        key
        for key in checks
        if key not in {"allActionsAuthored", "allContactsArtistValidated"}
    )
    return {
        "armature": {
            "name": armature.name,
            "bones": len(bones),
            "boneNames": bones,
            "scale": armature_scale,
            "scaleIntent": "source-compatible centimetric rig; world mesh remains 1.70 m",
        },
        "mesh": mesh_info,
        "actions": list(actions.values()),
        "missingActions": missing_actions,
        "invalidActions": invalid_actions,
        "unauthoredActions": unauthored_actions,
        "frozenActions": frozen_actions,
        "minimumActionAmplitudeDeg": MINIMUM_ACTION_AMPLITUDE_DEG,
        "unvalidatedContacts": unvalidated_contacts,
        "checks": checks,
        "structuralOk": all(checks[key] for key in structural_keys),
        "productionReady": all(checks.values()),
        "_objects": (armature, mesh),
    }


def select_export_objects(objects: Iterable[bpy.types.Object]) -> None:
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    object_list = list(objects)
    for obj in object_list:
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = next(
        obj for obj in object_list if obj.type == "ARMATURE"
    )


def export_candidate(path: Path, objects: Iterable[bpy.types.Object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    select_export_objects(objects)
    result = bpy.ops.export_scene.gltf(
        filepath=str(path),
        check_existing=False,
        export_format="GLB",
        use_selection=True,
        use_active_scene=True,
        export_cameras=False,
        export_lights=False,
        export_extras=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_unused_images=False,
        export_unused_textures=False,
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
        export_apply=False,
        export_yup=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_merge_animation="ACTION",
        export_extra_animations=True,
        export_force_sampling=False,
        export_optimize_animation_size=False,
        export_skins=True,
        export_influence_nb=4,
        export_all_influences=False,
        export_morph=False,
        export_gpu_instances=False,
    )
    if "FINISHED" not in result or not path.is_file():
        raise CrewBuildError(f"Export glTF échoué : {result}")


def read_glb_json(path: Path) -> dict:
    data = path.read_bytes()
    if data[:4] != b"glTF":
        raise CrewBuildError(f"Sortie non GLB : {path}")
    _, version, declared_size = struct.unpack_from("<III", data, 0)
    if version != 2 or declared_size != len(data):
        raise CrewBuildError(
            f"Entête GLB invalide : version={version}, "
            f"taille={declared_size}/{len(data)}."
        )
    offset = 12
    while offset + 8 <= len(data):
        length, kind = struct.unpack_from("<II", data, offset)
        offset += 8
        chunk = data[offset : offset + length]
        offset += length
        if kind == 0x4E4F534A:
            return json.loads(chunk.decode("utf-8"))
    raise CrewBuildError("Chunk JSON absent du GLB.")


def glb_summary(path: Path) -> dict:
    gltf = read_glb_json(path)
    triangles = 0
    for mesh in gltf.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            if primitive.get("mode", 4) != 4:
                continue
            accessor_index = primitive.get("indices")
            if accessor_index is not None:
                count = gltf["accessors"][accessor_index]["count"]
            else:
                position_index = primitive["attributes"]["POSITION"]
                count = gltf["accessors"][position_index]["count"]
            triangles += count // 3

    animation_names = [animation.get("name", "") for animation in gltf.get("animations", [])]
    non_rotation_channels: list[dict] = []
    for animation in gltf.get("animations", []):
        for channel in animation.get("channels", []):
            path_name = channel.get("target", {}).get("path")
            if path_name != "rotation":
                non_rotation_channels.append(
                    {"animation": animation.get("name", ""), "path": path_name}
                )

    skins = gltf.get("skins", [])
    checks = {
        "oneMesh": len(gltf.get("meshes", [])) == 1,
        "oneSkin": len(skins) == 1,
        "triangleBudget2000to3000": 2000 <= triangles <= 3000,
        "exact24SkinJoints": len(skins) == 1 and len(skins[0].get("joints", [])) == 24,
        "requiredAnimationsExported": set(REQUIRED_ACTIONS).issubset(animation_names),
        "rotationChannelsOnly": not non_rotation_channels,
    }
    return {
        "path": str(path.relative_to(ROOT)),
        "bytes": path.stat().st_size,
        "nodes": len(gltf.get("nodes", [])),
        "meshes": len(gltf.get("meshes", [])),
        "skins": len(skins),
        "triangles": triangles,
        "skinJoints": [len(skin.get("joints", [])) for skin in skins],
        "animations": animation_names,
        "materials": len(gltf.get("materials", [])),
        "textures": len(gltf.get("textures", [])),
        "nonRotationChannels": non_rotation_channels,
        "checks": checks,
        "ok": all(checks.values()),
    }


def save_blend(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    result = bpy.ops.wm.save_as_mainfile(filepath=str(path), check_existing=False)
    if "FINISHED" not in result or not path.is_file():
        raise CrewBuildError(f"Sauvegarde .blend échouée : {result}")


def write_report(path: Path, report: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def public_scene_report(scene_report: dict) -> dict:
    return {key: value for key, value in scene_report.items() if key != "_objects"}


def main() -> int:
    try:
        args = parse_arguments()
        cleanup: dict = {}

        if args.mode in {"prepare", "all"}:
            if args.blend_out.exists() and not args.force_prepare:
                raise CrewBuildError(
                    f"Le .blend candidat existe déjà : {args.blend_out}. "
                    "Utiliser --mode export pour préserver le posing, ou "
                    "--force-prepare pour repartir explicitement de la source."
                )
            cleanup = prepare_scene(args.source, reauthor_actions=args.reauthor_actions)
            scene_report = validate_scene()
            if not scene_report["structuralOk"]:
                raise CrewBuildError("La scène préparée viole le contrat structurel.")
            save_blend(args.blend_out)
        elif args.mode == "upgrade":
            if not args.blend_out.is_file():
                raise CrewBuildError(f".blend candidat introuvable : {args.blend_out}")
            result = bpy.ops.wm.open_mainfile(filepath=str(args.blend_out))
            if "FINISHED" not in result:
                raise CrewBuildError(f"Ouverture .blend échouée : {result}")
            cleanup = upgrade_scene(args.source, reauthor_actions=args.reauthor_actions)
            scene_report = validate_scene()
            if not scene_report["structuralOk"]:
                raise CrewBuildError("Le master upgradé viole le contrat structurel.")
            save_blend(args.blend_out)
        else:
            if not args.blend_out.is_file():
                raise CrewBuildError(f".blend candidat introuvable : {args.blend_out}")
            result = bpy.ops.wm.open_mainfile(filepath=str(args.blend_out))
            if "FINISHED" not in result:
                raise CrewBuildError(f"Ouverture .blend échouée : {result}")
            scene_report = validate_scene()

        output_report = None
        if args.mode in {"export", "all"}:
            export_candidate(args.glb_out, scene_report["_objects"])
            output_report = glb_summary(args.glb_out)

        public_scene = public_scene_report(scene_report)
        structural_ok = scene_report["structuralOk"] and (
            output_report is None or output_report["ok"]
        )
        authored_ready = structural_ok and not scene_report["unauthoredActions"]
        production_ready = scene_report["productionReady"] and (
            output_report is not None and output_report["ok"]
        )
        ok = authored_ready if args.require_authored_actions else structural_ok
        report = {
            "schemaVersion": 1,
            "ok": ok,
            "authoredReady": authored_ready,
            "productionReady": production_ready,
            "mode": args.mode,
            "blender": bpy.app.version_string,
            "pipelineVersion": PIPELINE_VERSION,
            "source": str(args.source.relative_to(ROOT)),
            "blend": str(args.blend_out.relative_to(ROOT)),
            "candidateGlb": (
                str(args.glb_out.relative_to(ROOT))
                if args.mode in {"export", "all"}
                else None
            ),
            "productionGlbUntouched": str(PRODUCTION_GLB.relative_to(ROOT)),
            "cleanup": cleanup,
            "scene": public_scene,
            "output": output_report,
        }
        write_report(args.report_out, report)
        print(
            "CREW_BUILD_JSON="
            + json.dumps(report, ensure_ascii=False, separators=(",", ":"))
        )
        if not ok:
            if args.require_authored_actions and scene_report["unauthoredActions"]:
                raise CrewBuildError(
                    "Actions encore neutres : "
                    + ", ".join(scene_report["unauthoredActions"])
                )
            raise CrewBuildError("Validation du candidat échouée.")
        return 0
    except CrewBuildError as error:
        print(f"CREW_BUILD_ERROR={error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
