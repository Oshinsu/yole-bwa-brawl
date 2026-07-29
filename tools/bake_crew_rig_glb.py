#!/usr/bin/env python3
"""Cuit le rig d'equipage de reference en GLB.

Ce n'est PAS un asset de production : c'est le gabarit que l'artiste ouvre,
habille et reexporte. Les sept articulations portent exactement les noms que le
jeu pilote, et leurs positions reprennent celles du CrewVisual procedural, donc
un rig conforme s'anime immediatement sans toucher au code.

Sortie : assets/models/reference/yole_crew_rig.glb
Le jeu, lui, cherche assets/models/yole_crew.glb (voir YOLE_RIGS). Le gabarit
n'est donc jamais charge par accident et l'equipage procedural reste en place.

Voir docs/ASSET_CONTRACT.md.
"""
from __future__ import annotations

import json
import pathlib
import struct

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "models" / "reference" / "yole_crew_rig.glb"

# Cotes identiques a CrewVisual (src/render/yole-visual.js).
JOINTS = [
    # (nom, translation, enfant_mesh_offset, echelle_du_membre)
    ("torso", (0.0, 0.26, 0.0), None, (0.30, 0.46, 0.30)),
    ("head", (0.0, 0.66, 0.0), None, (0.27, 0.27, 0.27)),
    ("arm.L", (-0.16, 0.48, 0.0), (0.0, -0.18, 0.0), (0.09, 0.38, 0.09)),
    ("arm.R", (0.16, 0.48, 0.0), (0.0, -0.18, 0.0), (0.09, 0.38, 0.09)),
    ("leg.L", (-0.075, 0.05, 0.0), (0.0, -0.20, 0.0), (0.104, 0.44, 0.104)),
    ("leg.R", (0.075, 0.05, 0.0), (0.0, -0.20, 0.0), (0.104, 0.44, 0.104)),
]

# Cube unite centre : une seule geometrie, instanciee par les noeuds a l'echelle.
CUBE = [
    ((-0.5, -0.5, 0.5), (0.5, -0.5, 0.5), (0.5, 0.5, 0.5), (-0.5, 0.5, 0.5), (0, 0, 1)),
    ((0.5, -0.5, -0.5), (-0.5, -0.5, -0.5), (-0.5, 0.5, -0.5), (0.5, 0.5, -0.5), (0, 0, -1)),
    ((-0.5, 0.5, 0.5), (0.5, 0.5, 0.5), (0.5, 0.5, -0.5), (-0.5, 0.5, -0.5), (0, 1, 0)),
    ((-0.5, -0.5, -0.5), (0.5, -0.5, -0.5), (0.5, -0.5, 0.5), (-0.5, -0.5, 0.5), (0, -1, 0)),
    ((0.5, -0.5, 0.5), (0.5, -0.5, -0.5), (0.5, 0.5, -0.5), (0.5, 0.5, 0.5), (1, 0, 0)),
    ((-0.5, -0.5, -0.5), (-0.5, -0.5, 0.5), (-0.5, 0.5, 0.5), (-0.5, 0.5, -0.5), (-1, 0, 0)),
]


def pad(data: bytes, alignment: int, filler: bytes) -> bytes:
    remainder = len(data) % alignment
    return data if remainder == 0 else data + filler * (alignment - remainder)


def main() -> int:
    positions, normals, indices = [], [], []
    for face in CUBE:
        base = len(positions)
        for corner in face[:4]:
            positions.append(corner)
            normals.append(face[4])
        indices += [base, base + 1, base + 2, base, base + 2, base + 3]

    position_bytes = b"".join(struct.pack("<3f", *p) for p in positions)
    normal_bytes = b"".join(struct.pack("<3f", *n) for n in normals)
    index_bytes = pad(b"".join(struct.pack("<H", i) for i in indices), 4, b"\x00")
    binary = position_bytes + normal_bytes + index_bytes

    nodes: list[dict] = [
        {"name": "crew", "children": [1]},
        {"name": "hips", "translation": [0.0, 0.38, 0.0], "children": []},
    ]
    for name, translation, child_offset, scale in JOINTS:
        joint_index = len(nodes)
        nodes[1]["children"].append(joint_index)
        if child_offset is None:
            nodes.append({
                "name": name,
                "translation": list(translation),
                "scale": list(scale),
                "mesh": 0,
            })
        else:
            # Le membre pivote a l'articulation : le mesh est un enfant decale.
            nodes.append({"name": name, "translation": list(translation), "children": [joint_index + 1]})
            nodes.append({
                "name": f"{name}.mesh",
                "translation": list(child_offset),
                "scale": list(scale),
                "mesh": 0,
            })

    gltf = {
        "asset": {"version": "2.0", "generator": "YOLE BWA BRAWL bake_crew_rig_glb.py (gabarit d'equipage)"},
        "scene": 0,
        "scenes": [{"nodes": [0], "name": "crew_rig"}],
        "nodes": nodes,
        "meshes": [{
            "name": "limb",
            "primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1}, "indices": 2, "mode": 4}],
        }],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": len(positions), "type": "VEC3",
             "min": [-0.5, -0.5, -0.5], "max": [0.5, 0.5, 0.5]},
            {"bufferView": 1, "componentType": 5126, "count": len(normals), "type": "VEC3"},
            {"bufferView": 2, "componentType": 5123, "count": len(indices), "type": "SCALAR"},
        ],
        "bufferViews": [
            {"buffer": 0, "byteOffset": 0, "byteLength": len(position_bytes), "target": 34962},
            {"buffer": 0, "byteOffset": len(position_bytes), "byteLength": len(normal_bytes), "target": 34962},
            {"buffer": 0, "byteOffset": len(position_bytes) + len(normal_bytes),
             "byteLength": len(index_bytes), "target": 34963},
        ],
        "buffers": [{"byteLength": len(binary)}],
    }

    json_bytes = pad(json.dumps(gltf, separators=(",", ":")).encode("utf-8"), 4, b" ")
    binary = pad(binary, 4, b"\x00")
    glb = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(json_bytes) + 8 + len(binary))
    glb += struct.pack("<II", len(json_bytes), 0x4E4F534A) + json_bytes
    glb += struct.pack("<II", len(binary), 0x004E4942) + binary

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_bytes(glb)
    joint_names = ["hips"] + [name for name, _, _, _ in JOINTS]
    print(f"[OK] {OUT.relative_to(ROOT)}: {len(glb)} octets, {len(nodes)} noeuds")
    print(f"     articulations: {', '.join(joint_names)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
