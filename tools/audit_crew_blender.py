"""Audit read-only du rig équipage depuis Blender.

Usage :
  blender --background --factory-startup --python tools/audit_crew_blender.py -- assets/models/yole_crew.glb

Le script n'enregistre rien. Il importe le GLB dans une scène vierge et écrit
un rapport JSON exploitable dans la CI ou pendant la production d'animations.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import bpy


def cli_arguments() -> list[str]:
    if "--" not in sys.argv:
        return []
    return sys.argv[sys.argv.index("--") + 1 :]


def rounded(value: float, digits: int = 5) -> float:
    return round(float(value), digits)


def vec(values) -> list[float]:
    return [rounded(component) for component in values]


def action_summary(action: bpy.types.Action) -> dict:
    frame_start, frame_end = action.frame_range
    slots = getattr(action, "slots", ())
    layers = getattr(action, "layers", ())
    return {
        "name": action.name,
        "frame_range": [rounded(frame_start, 3), rounded(frame_end, 3)],
        "duration_frames": rounded(frame_end - frame_start, 3),
        "slots": len(slots),
        "layers": len(layers),
        "layered": bool(getattr(action, "is_action_layered", False)),
    }


def mesh_summary(obj: bpy.types.Object) -> dict:
    mesh = obj.data
    mesh.calc_loop_triangles()
    influence_counts: list[int] = []
    weight_sums: list[float] = []
    for vertex in mesh.vertices:
        weights = [group.weight for group in vertex.groups if group.weight > 1e-6]
        influence_counts.append(len(weights))
        weight_sums.append(sum(weights))

    maximum_influences = max(influence_counts, default=0)
    excessive_influences = sum(count > 4 for count in influence_counts)
    bad_weight_sums = sum(
        not math.isclose(total, 1.0, rel_tol=0.0, abs_tol=0.015)
        for total in weight_sums
        if total > 0
    )
    return {
        "name": obj.name,
        "vertices": len(mesh.vertices),
        "triangles": len(mesh.loop_triangles),
        "materials": [slot.material.name if slot.material else None for slot in obj.material_slots],
        "vertex_groups": len(obj.vertex_groups),
        "max_influences": maximum_influences,
        "vertices_over_4_influences": excessive_influences,
        "vertices_with_bad_weight_sum": bad_weight_sums,
        "unweighted_vertices": sum(count == 0 for count in influence_counts),
        "dimensions": vec(obj.dimensions),
        "scale": vec(obj.scale),
    }


def armature_summary(obj: bpy.types.Object) -> dict:
    bones = obj.data.bones
    pose_bones = obj.pose.bones
    hierarchy = []
    for bone in bones:
        hierarchy.append(
            {
                "name": bone.name,
                "parent": bone.parent.name if bone.parent else None,
                "length": rounded(bone.length),
                "head": vec(bone.head_local),
                "tail": vec(bone.tail_local),
                "deform": bool(bone.use_deform),
            }
        )

    constrained = []
    for pose_bone in pose_bones:
        if not pose_bone.constraints:
            continue
        constrained.append(
            {
                "bone": pose_bone.name,
                "constraints": [
                    {
                        "name": constraint.name,
                        "type": constraint.type,
                        "influence": rounded(constraint.influence),
                    }
                    for constraint in pose_bone.constraints
                ],
            }
        )

    animation_data = obj.animation_data
    nla_tracks = []
    if animation_data:
        for track in animation_data.nla_tracks:
            nla_tracks.append(
                {
                    "name": track.name,
                    "mute": bool(track.mute),
                    "strips": [
                        {
                            "name": strip.name,
                            "action": strip.action.name if strip.action else None,
                            "frame_range": [rounded(strip.frame_start, 3), rounded(strip.frame_end, 3)],
                        }
                        for strip in track.strips
                    ],
                }
            )

    return {
        "name": obj.name,
        "bones": len(bones),
        "deform_bones": sum(bool(bone.use_deform) for bone in bones),
        "root_bones": [bone.name for bone in bones if bone.parent is None],
        "constraints": constrained,
        "active_action": (
            animation_data.action.name
            if animation_data and animation_data.action
            else None
        ),
        "nla_tracks": nla_tracks,
        "scale": vec(obj.scale),
        "rotation": vec(obj.rotation_euler),
        "hierarchy": hierarchy,
    }


def main() -> None:
    arguments = cli_arguments()
    if not arguments:
        raise SystemExit("Chemin GLB manquant après --")

    source = Path(arguments[0]).expanduser().resolve()
    if not source.is_file():
        raise SystemExit(f"GLB introuvable : {source}")

    bpy.ops.wm.read_factory_settings(use_empty=True)
    result = bpy.ops.import_scene.gltf(filepath=str(source))
    if "FINISHED" not in result:
        raise RuntimeError(f"Import glTF échoué : {result}")

    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    materials = list(bpy.data.materials)
    images = list(bpy.data.images)

    report = {
        "ok": True,
        "blender": bpy.app.version_string,
        "source": str(source),
        "scene": {
            "objects": len(bpy.context.scene.objects),
            "meshes": len(meshes),
            "armatures": len(armatures),
            "materials": len(materials),
            "images": len(images),
            "fps": rounded(
                bpy.context.scene.render.fps
                / max(1e-6, bpy.context.scene.render.fps_base),
                3,
            ),
        },
        "objects": [
            {
                "name": obj.name,
                "type": obj.type,
                "parent": obj.parent.name if obj.parent else None,
                "visible_viewport": not bool(obj.hide_viewport),
                "visible_render": not bool(obj.hide_render),
                "location": vec(obj.location),
                "dimensions": vec(obj.dimensions),
            }
            for obj in bpy.context.scene.objects
        ],
        "meshes": [mesh_summary(obj) for obj in meshes],
        "armatures": [armature_summary(obj) for obj in armatures],
        "actions": [action_summary(action) for action in bpy.data.actions],
        "materials": [
            {
                "name": material.name,
                "blend_method": getattr(material, "surface_render_method", "DITHERED"),
                "double_sided": not bool(material.use_backface_culling),
                "nodes": len(material.node_tree.nodes) if material.node_tree else 0,
            }
            for material in materials
        ],
        "images": [
            {
                "name": image.name,
                "size": list(image.size),
                "colorspace": image.colorspace_settings.name,
            }
            for image in images
        ],
    }
    print("CREW_AUDIT_JSON=" + json.dumps(report, ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    main()
