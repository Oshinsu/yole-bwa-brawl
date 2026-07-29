#!/usr/bin/env python3
"""Cuit la coque procedurale de la yole en GLB binaire valide.

Meme table de sections que makeHullGeometry() dans src/render/yole-visual.js :
l'asset produit est donc geometriquement identique au rendu procedural. Il sert
a la fois d'asset de test du chargeur et de point de depart editable (Blender,
Meshy, Mixamo) pour remplacer la coque par un vrai modele.

Contrat respecte : +Z avant, +Y haut, +X tribord, unites metres, echelle 1.0,
origine au centre de flottaison, un seul mesh nomme "hull", aucun materiau.

Ecrit dans reference/ et NON dans models/ : une vraie coque generee occupe
desormais assets/models/yole_hull.glb, ce gabarit ne doit pas l'ecraser.
Voir docs/ASSET_CONTRACT.md.
"""
from __future__ import annotations

import json
import math
import pathlib
import struct

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "models" / "reference" / "yole_hull_reference.glb"

# Identique a src/render/yole-visual.js
SECTION_Z = [-5.55, -4.7, -3.2, -1.5, 0, 1.7, 3.35, 4.72, 5.55]
SECTION_WIDTH = [0.05, 0.48, 0.82, 1.0, 1.08, 1.0, 0.78, 0.42, 0.04]


def build_mesh() -> tuple[list[tuple[float, float, float]], list[int]]:
    positions: list[tuple[float, float, float]] = []
    for z, width in zip(SECTION_Z, SECTION_WIDTH):
        keel = -0.62 + abs(z) * 0.028
        positions.append((-width, 0.04, z))  # babord
        positions.append((width, 0.04, z))   # tribord
        positions.append((0.0, keel, z))     # quille
    indices: list[int] = []
    for index in range(len(SECTION_Z) - 1):
        a = index * 3
        b = (index + 1) * 3
        indices += [a, b, a + 2, b, b + 2, a + 2]              # flanc babord
        indices += [a + 1, a + 2, b + 1, b + 1, a + 2, b + 2]  # flanc tribord
        indices += [a, a + 1, b, b, a + 1, b + 1]              # plat-bord
    return positions, indices


def vertex_normals(positions, indices):
    """Equivalent de BufferGeometry.computeVertexNormals : accumulation des
    produits vectoriels non normalises (donc ponderee par l'aire), puis
    normalisation."""
    normals = [[0.0, 0.0, 0.0] for _ in positions]
    for i in range(0, len(indices), 3):
        ia, ib, ic = indices[i], indices[i + 1], indices[i + 2]
        ax, ay, az = positions[ia]
        bx, by, bz = positions[ib]
        cx, cy, cz = positions[ic]
        e1 = (cx - bx, cy - by, cz - bz)
        e2 = (ax - bx, ay - by, az - bz)
        nx = e1[1] * e2[2] - e1[2] * e2[1]
        ny = e1[2] * e2[0] - e1[0] * e2[2]
        nz = e1[0] * e2[1] - e1[1] * e2[0]
        for target in (ia, ib, ic):
            normals[target][0] += nx
            normals[target][1] += ny
            normals[target][2] += nz
    out = []
    for nx, ny, nz in normals:
        length = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
        out.append((nx / length, ny / length, nz / length))
    return out


def pad(data: bytes, alignment: int, filler: bytes) -> bytes:
    remainder = len(data) % alignment
    return data if remainder == 0 else data + filler * (alignment - remainder)


def main() -> int:
    positions, indices = build_mesh()
    normals = vertex_normals(positions, indices)

    position_bytes = b"".join(struct.pack("<3f", *p) for p in positions)
    normal_bytes = b"".join(struct.pack("<3f", *n) for n in normals)
    index_bytes = b"".join(struct.pack("<H", i) for i in indices)
    index_bytes = pad(index_bytes, 4, b"\x00")

    binary = position_bytes + normal_bytes + index_bytes
    position_offset = 0
    normal_offset = len(position_bytes)
    index_offset = normal_offset + len(normal_bytes)

    minimum = [min(p[axis] for p in positions) for axis in range(3)]
    maximum = [max(p[axis] for p in positions) for axis in range(3)]

    gltf = {
        "asset": {
            "version": "2.0",
            "generator": "YOLE BWA BRAWL bake_yole_glb.py (coque procedurale de reference)",
        },
        "scene": 0,
        "scenes": [{"nodes": [0], "name": "yole"}],
        "nodes": [{"mesh": 0, "name": "hull"}],
        "meshes": [{
            "name": "hull",
            "primitives": [{
                "attributes": {"POSITION": 0, "NORMAL": 1},
                "indices": 2,
                "mode": 4,
            }],
        }],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": len(positions),
             "type": "VEC3", "min": minimum, "max": maximum},
            {"bufferView": 1, "componentType": 5126, "count": len(normals), "type": "VEC3"},
            {"bufferView": 2, "componentType": 5123, "count": len(indices), "type": "SCALAR"},
        ],
        "bufferViews": [
            {"buffer": 0, "byteOffset": position_offset, "byteLength": len(position_bytes), "target": 34962},
            {"buffer": 0, "byteOffset": normal_offset, "byteLength": len(normal_bytes), "target": 34962},
            {"buffer": 0, "byteOffset": index_offset, "byteLength": len(index_bytes), "target": 34963},
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
    print(f"[OK] {OUT.relative_to(ROOT)}: {len(glb)} octets, "
          f"{len(positions)} sommets, {len(indices) // 3} triangles")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
