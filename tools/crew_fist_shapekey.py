# -*- coding: utf-8 -*-
"""Clé de forme « poing » sur le maillage de l'équipier — à lancer DANS Blender.

    blender --background <master.blend> --python tools/crew_fist_shapekey.py -- \
        --blend-out <copie.blend> [--render-dir <dossier>] [--curl 110] [--sign 1]

Le rig n'a pas d'os de doigts : la main est un gant rigide. Les photos de course
montrent des poings fermés sur le bois, gantés. On plie donc les DOIGTS du
maillage lui-même, dans une clé de forme que le jeu fond à mesure que la main se
pose (`morphTargetInfluences`, voir `CrewVisual.setFist`).

Méthode, mesurée sur le maillage plutôt que réglée à l'œil :
- les sommets de la main sont ceux pesés > 0,5 par le groupe `LeftHand` /
  `RightHand` ; l'axe de la main est l'os (tête → queue) ;
- les doigts sont les sommets au-delà de `--knuckle` (fraction de la longueur
  de l'os) le long de cet axe ; leur ligne d'articulation est l'axe principal
  (ACP) de leur section, perpendiculaire à l'os — les quatre doigts côte à côte
  sont larges dans ce sens, fins dans l'autre (la normale de la paume) ;
- chaque sommet tourne autour de cette ligne, d'un angle proportionnel à sa
  distance aux phalanges (`--curl` au bout) : la bande se roule en poing.

Le sens (`--sign`) ne se devine pas sur un maillage anonyme : on RENDU la main
fermée dans les deux sens (`--render-dir`), on regarde, on garde le bon.
"""
from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


def parse_arguments() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--blend-out", required=True)
    parser.add_argument("--render-dir", default=None)
    parser.add_argument("--curl", type=float, default=110.0)
    parser.add_argument("--sign", type=float, default=1.0)
    parser.add_argument("--knuckle", type=float, default=0.55)
    parser.add_argument("--mesh", default="CrewMesh")
    parser.add_argument("--no-save", action="store_true")
    return parser.parse_args(argv)


def find_armature(mesh_obj: bpy.types.Object) -> bpy.types.Object | None:
    for modifier in mesh_obj.modifiers:
        if modifier.type == "ARMATURE" and modifier.object:
            return modifier.object
    parent = mesh_obj.parent
    if parent and parent.type == "ARMATURE":
        return parent
    return None


def build_fist(mesh_obj: bpy.types.Object, armature: bpy.types.Object, curl_deg: float, sign: float, knuckle: float) -> dict:
    mesh = mesh_obj.data
    if mesh.shape_keys is None:
        mesh_obj.shape_key_add(name="Basis", from_mix=False)
    blocks = mesh.shape_keys.key_blocks
    if "poing" in blocks:
        mesh_obj.shape_key_remove(blocks["poing"])
    basis = blocks["Basis"]
    fist = mesh_obj.shape_key_add(name="poing", from_mix=False)
    fist.value = 0.0
    matrix_world = mesh_obj.matrix_world
    matrix_inverse = matrix_world.inverted()
    report: dict = {}
    for side in ("Left", "Right"):
        group = mesh_obj.vertex_groups.get(f"{side}Hand")
        bone = armature.data.bones.get(f"{side}Hand")
        if group is None or bone is None:
            report[side] = {"erreur": "groupe ou os absent"}
            continue
        head = armature.matrix_world @ bone.head_local
        tail = armature.matrix_world @ bone.tail_local
        axis = tail - head
        length = axis.length
        axis.normalize()
        group_index = group.index
        hand_points = []
        for vertex in mesh.vertices:
            weight = 0.0
            for element in vertex.groups:
                if element.group == group_index:
                    weight = element.weight
                    break
            if weight < 0.5:
                continue
            world = matrix_world @ basis.data[vertex.index].co
            hand_points.append((vertex.index, world, (world - head).dot(axis)))
        if not hand_points:
            report[side] = {"erreur": "aucun sommet pesé par la main"}
            continue
        t_max = max(t for _, _, t in hand_points)
        t_knuckle = knuckle * length
        fingers = [(index, world, t) for index, world, t in hand_points if t > t_knuckle]
        if len(fingers) < 8:
            report[side] = {"erreur": f"trop peu de sommets de doigts ({len(fingers)})", "sommetsMain": len(hand_points), "tMax": round(t_max, 4), "longueurOs": round(length, 4)}
            continue
        centre = Vector((0.0, 0.0, 0.0))
        for _, world, _ in fingers:
            centre += world
        centre /= len(fingers)
        u = axis.orthogonal().normalized()
        v = axis.cross(u).normalized()
        sxx = sxy = syy = 0.0
        for _, world, _ in fingers:
            delta = world - centre
            x = delta.dot(u)
            y = delta.dot(v)
            sxx += x * x
            sxy += x * y
            syy += y * y
        theta = 0.5 * math.atan2(2.0 * sxy, sxx - syy)
        knuckle_axis = (u * math.cos(theta) + v * math.sin(theta)).normalized()
        palm_normal = axis.cross(knuckle_axis).normalized()
        knuckle_point = head + axis * t_knuckle
        curl = math.radians(curl_deg) * sign
        for index, world, t in fingers:
            s = min(1.0, max(0.0, (t - t_knuckle) / max(1e-6, t_max - t_knuckle)))
            rotation = Matrix.Rotation(curl * s, 4, knuckle_axis)
            moved = knuckle_point + (rotation @ (world - knuckle_point))
            fist.data[index].co = matrix_inverse @ moved
        # Largeur et épaisseur de la section des doigts : le rapport dit si l'ACP
        # a bien trouvé la ligne des articulations (large) et la paume (fine).
        width = max(abs((world - centre).dot(knuckle_axis)) for _, world, _ in fingers)
        thickness = max(abs((world - centre).dot(palm_normal)) for _, world, _ in fingers)
        deplacement_max = max((matrix_world @ fist.data[i].co - matrix_world @ basis.data[i].co).length for i, _, _ in fingers)
        report[side] = {
            "deplacementMax": round(deplacement_max, 4),
            "sommetsMain": len(hand_points),
            "sommetsDoigts": len(fingers),
            "longueurOs": round(length, 4),
            "tMax": round(t_max, 4),
            "tArticulation": round(t_knuckle, 4),
            "largeurDoigts": round(width, 4),
            "epaisseurDoigts": round(thickness, 4),
            "tete": [round(c, 4) for c in head],
            "axe": [round(c, 4) for c in axis],
            "articulation": [round(c, 4) for c in knuckle_axis],
            "paume": [round(c, 4) for c in palm_normal],
        }
    return report


def render_hands(mesh_obj: bpy.types.Object, armature: bpy.types.Object, report: dict, render_dir: Path) -> list[str]:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x = 640
    scene.render.resolution_y = 480
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "SINGLE"
    scene.display.shading.single_color = (0.75, 0.55, 0.42)
    scene.display.shading.show_cavity = True
    for obj in scene.objects:
        obj.hide_render = obj is not mesh_obj
    camera_data = bpy.data.cameras.new("FistCam")
    camera_data.lens = 50
    camera = bpy.data.objects.new("FistCam", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    fist = mesh_obj.data.shape_keys.key_blocks["poing"]
    written: list[str] = []
    render_dir.mkdir(parents=True, exist_ok=True)
    for side, info in report.items():
        if "erreur" in info:
            continue
        head = Vector(info["tete"])
        axis = Vector(info["axe"])
        palm = Vector(info["paume"])
        knuckle = Vector(info["articulation"])
        centre = head + axis * (info["tMax"] * 0.55)
        views = {"paume": palm, "dos": -palm, "tranche": knuckle}
        for name, direction in views.items():
            camera.location = centre + direction.normalized() * 0.75
            camera.rotation_euler = (centre - camera.location).to_track_quat("-Z", "Y").to_euler()
            for value in (0.0, 1.0):
                fist.value = value
                target = render_dir / f"poing_{side.lower()}_{name}_{int(value)}.png"
                scene.render.filepath = str(target)
                bpy.ops.render.render(write_still=True)
                written.append(str(target))
    fist.value = 0.0
    bpy.data.objects.remove(camera, do_unlink=True)
    bpy.data.cameras.remove(camera_data, do_unlink=True)
    for obj in scene.objects:
        obj.hide_render = False
    return written


def main() -> None:
    args = parse_arguments()
    mesh_obj = bpy.data.objects.get(args.mesh)
    if mesh_obj is None or mesh_obj.type != "MESH":
        print(f"CREW_FIST_ERROR=maillage {args.mesh!r} introuvable")
        sys.exit(2)
    armature = find_armature(mesh_obj)
    if armature is None:
        print("CREW_FIST_ERROR=armature introuvable")
        sys.exit(2)
    report = build_fist(mesh_obj, armature, args.curl, args.sign, args.knuckle)
    print("CREW_FIST_REPORT=" + repr(report))
    if args.render_dir:
        written = render_hands(mesh_obj, armature, report, Path(args.render_dir))
        print("CREW_FIST_RENDERS=" + repr(written))
    if not args.no_save:
        bpy.ops.wm.save_as_mainfile(filepath=args.blend_out)
        print(f"CREW_FIST_SAVED={args.blend_out}")


main()
