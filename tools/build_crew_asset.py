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
PIPELINE_VERSION = 1
FPS = 24
LOOP_FRAMES = (1.0, 37.0, 73.0)
TRANSITION_FRAMES = (1.0, 10.0, 20.0)

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
POSE_ROTATIONS_DEG = {
    "pont_interieur": {
        "Hips": (20, 0, 4),
        "Spine02": (12, 0, -2),
        "Spine01": (8, 0, -1),
        "Spine": (3, 0, 0),
        "neck": (-5, 0, 0),
        "LeftUpLeg": (25, 0, -10),
        "RightUpLeg": (29, 0, 9),
        "LeftLeg": (-40, 0, 0),
        "RightLeg": (-42, 0, 0),
        "LeftFoot": (12, 0, 0),
        "RightFoot": (12, 0, 0),
        "LeftArm": (-10, 0, 25),
        "RightArm": (-10, 0, -23),
        "LeftForeArm": (-35, 0, 5),
        "RightForeArm": (-32, 0, -5),
        "Head": (-5, 0, 0),
    },
    "cale_court": {
        "Hips": (45, 0, 3),
        "Spine02": (-5, 0, -2),
        "Spine01": (-4, 0, 0),
        "Spine": (-3, 0, 0),
        "neck": (-5, 0, 0),
        "LeftUpLeg": (10, 0, -12),
        "RightUpLeg": (5, 0, 11),
        "LeftLeg": (-30, 0, 0),
        "RightLeg": (-25, 0, 0),
        "LeftFoot": (10, 0, 0),
        "RightFoot": (8, 0, 0),
        "LeftArm": (0, 0, 35),
        "RightArm": (0, 0, -33),
        "LeftForeArm": (0, 0, 7),
        "RightForeArm": (0, 0, -7),
        "Head": (-10, 0, 0),
    },
    "demi_sorti": {
        "Hips": (58, 0, 2),
        "Spine02": (-6, 0, -3),
        "Spine01": (-5, 0, 0),
        "Spine": (-3, 0, 0),
        "neck": (-5, 0, 0),
        "LeftUpLeg": (10, 0, -10),
        "RightUpLeg": (-20, 0, 8),
        "LeftLeg": (-35, 0, 0),
        "RightLeg": (10, 0, 0),
        "LeftFoot": (12, 0, 0),
        "RightFoot": (-5, 0, 0),
        "LeftArm": (0, 0, 40),
        "RightArm": (0, 0, -38),
        "LeftForeArm": (-20, 0, 8),
        "RightForeArm": (-20, 0, -8),
        "Head": (-15, 0, 0),
    },
    "extension_extreme": {
        "Hips": (80, 0, 0),
        "Spine02": (-8, 0, -2),
        "Spine01": (-6, 0, 0),
        "Spine": (-4, 0, 0),
        "neck": (-8, 0, 0),
        "LeftUpLeg": (0, 0, -10),
        "RightUpLeg": (-45, 0, 5),
        "LeftLeg": (-25, 0, 0),
        "RightLeg": (25, 0, 0),
        "LeftFoot": (16, 0, 0),
        "RightFoot": (-8, 0, 0),
        "LeftArm": (-20, 0, 40),
        "RightArm": (-15, 0, -35),
        "LeftForeArm": (-60, 0, 8),
        "RightForeArm": (-50, 0, -7),
        "Head": (-20, 0, 0),
    },
    "compression_transition": {
        "Hips": (41, 0, -8),
        "Spine02": (15, 0, 4),
        "Spine01": (10, 0, 3),
        "Spine": (6, 0, 2),
        "neck": (-10, 0, 0),
        "LeftUpLeg": (50, 0, -12),
        "RightUpLeg": (-30, 0, 16),
        "LeftLeg": (-65, 0, 0),
        "RightLeg": (15, 0, 0),
        "LeftFoot": (18, 0, 0),
        "RightFoot": (-5, 0, 0),
        "LeftArm": (-20, 0, 40),
        "RightArm": (-5, 0, -25),
        "LeftForeArm": (-55, 0, 7),
        "RightForeArm": (-35, 0, -10),
        "Head": (-8, 0, 0),
    },
}

# Respiration/reprise d'appui à l'apex. Les amplitudes restent sous 1,5° :
# elles retirent l'effet mannequin sans concurrencer la simulation de gîte.
APEX_OFFSETS_DEG = {
    "Spine02": (1.5, 0.0, 0.0),
    "Spine01": (1.0, 0.0, 0.0),
    "Spine": (0.7, 0.0, 0.0),
    "neck": (-0.8, 0.0, 0.0),
    "LeftArm": (0.0, 0.0, 0.5),
    "RightArm": (0.0, 0.0, -0.5),
}

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


def scaffold_action(armature: bpy.types.Object, name: str) -> bpy.types.Action:
    action = bpy.data.actions.get(name)
    if action is not None:
        return action

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
    base_pose = POSE_ROTATIONS_DEG[name]
    frames = TRANSITION_FRAMES if name == "compression_transition" else LOOP_FRAMES
    keyed_bones = sorted(set(base_pose) | set(APEX_OFFSETS_DEG))
    missing_bones = [bone_name for bone_name in keyed_bones if bone_name not in armature.pose.bones]
    if missing_bones:
        raise CrewBuildError(
            f"Os requis absents pour {name} : {', '.join(missing_bones)}"
        )

    # Un très léger regard alterné empêche les six clones de respirer comme
    # un seul homme quand leurs actions sont déphasées dans le runtime.
    head_y_apex = 0.8 if REQUIRED_ACTIONS.index(name) % 2 == 0 else -0.8
    for frame_index, frame in enumerate(frames):
        at_apex = frame_index == 1
        for bone_name in keyed_bones:
            pose_bone = armature.pose.bones[bone_name]
            pose_bone.rotation_mode = "XYZ"
            base = base_pose.get(bone_name, (0.0, 0.0, 0.0))
            offset = APEX_OFFSETS_DEG.get(bone_name, (0.0, 0.0, 0.0))
            if bone_name == "Head" and at_apex:
                offset = (
                    offset[0],
                    offset[1] + head_y_apex,
                    offset[2],
                )
            angles = (
                math.radians(base[0] + (offset[0] if at_apex else 0.0)),
                math.radians(base[1] + (offset[1] if at_apex else 0.0)),
                math.radians(base[2] + (offset[2] if at_apex else 0.0)),
            )
            pose_bone.rotation_euler = angles
            inserted = pose_bone.keyframe_insert(
                data_path="rotation_euler",
                frame=frame,
                group=pose_bone.name,
            )
            if not inserted:
                raise CrewBuildError(
                    f"Impossible de créer les clés de {name}/{pose_bone.name}."
                )

    for fcurve in iter_action_fcurves(action):
        for point in fcurve.keyframe_points:
            point.interpolation = "BEZIER"
            point.handle_left_type = "AUTO_CLAMPED"
            point.handle_right_type = "AUTO_CLAMPED"
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
        scaffold_action(armature, action_name)

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


def prepare_scene(source: Path) -> dict:
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
    configure_master(armature, mesh, source)

    return {
        "nullActionsRemoved": removed_actions,
        "customShapesCleared": custom_shapes,
        "helperMeshesRemoved": removed_helpers,
    }


def upgrade_scene(source: Path) -> dict:
    """Complète un master interactif sans toucher à ses collections QA."""
    armature, mesh = imported_rig()
    removed_actions = remove_null_actions()
    custom_shapes = clear_custom_shapes((armature,))
    configure_master(armature, mesh, source)
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
        base_pose = POSE_ROTATIONS_DEG[action.name]
        frames = (
            TRANSITION_FRAMES
            if action.name == "compression_transition"
            else LOOP_FRAMES
        )
        keyed_bones = sorted(set(base_pose) | set(APEX_OFFSETS_DEG))
        curve_map = {
            (curve.data_path, curve.array_index): curve
            for curve in curves
        }
        seed_matches = len(curves) == len(keyed_bones) * 3
        head_y_apex = (
            0.8 if REQUIRED_ACTIONS.index(action.name) % 2 == 0 else -0.8
        )
        for frame_index, frame in enumerate(frames):
            at_apex = frame_index == 1
            for bone_name in keyed_bones:
                base = base_pose.get(bone_name, (0.0, 0.0, 0.0))
                offset = APEX_OFFSETS_DEG.get(bone_name, (0.0, 0.0, 0.0))
                if bone_name == "Head" and at_apex:
                    offset = (
                        offset[0],
                        offset[1] + head_y_apex,
                        offset[2],
                    )
                data_path = f'pose.bones["{bone_name}"].rotation_euler'
                for axis in range(3):
                    curve = curve_map.get((data_path, axis))
                    expected = math.radians(
                        base[axis] + (offset[axis] if at_apex else 0.0)
                    )
                    if curve is None or not math.isclose(
                        float(curve.evaluate(frame)),
                        expected,
                        rel_tol=0.0,
                        abs_tol=1e-6,
                    ):
                        seed_matches = False

    return {
        "name": action.name,
        "frameRange": list(span) if span else None,
        "durationFrames": (span[1] - span[0]) if span else 0.0,
        "curves": len(curves),
        "minimumKeysPerCurve": minimum_keys,
        "rotationOnly": rotation_only,
        "loopClosed": loop_closed,
        "authored": authored,
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
            cleanup = prepare_scene(args.source)
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
            cleanup = upgrade_scene(args.source)
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
