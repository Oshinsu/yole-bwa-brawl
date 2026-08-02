#!/usr/bin/env python3
"""Normalise une coque generee au contrat du jeu.

Un generateur 3D sort une orientation, une echelle et une origine arbitraires.
Le contrat de coque, lui, est strict (docs/ASSET_CONTRACT.md) :

    +Z avant, +Y haut, +X tribord, longueur 11,10 m,
    origine au centre de flottaison, plat-bord a y = +0,04.

L'outil reconstruit un GLB propre : primitives fusionnees, transformations de
noeuds cuites, materiaux abandonnes (le jeu fournit le sien), un seul mesh
nomme "hull".

    python3 tools/fit_hull_glb.py entree.glb -o assets/models/yole_hull.glb
"""
from __future__ import annotations

import argparse
import json
import math
import pathlib
import struct

ROOT = pathlib.Path(__file__).resolve().parents[1]

TARGET_LENGTH = 11.10    # hors tout, axe Z
TARGET_HALF_BEAM = 1.08  # demi-largeur au maitre-bau
TARGET_DEPTH = 0.62      # du plat-bord au point le plus bas
GUNWALE_Y = 0.04         # plat-bord

COMPONENT = {5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2),
             5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4)}
NUM_COMPONENTS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def load_glb(path: pathlib.Path):
    data = path.read_bytes()
    if data[:4] != b"glTF":
        raise SystemExit("pas un GLB binaire")
    json_length, = struct.unpack_from("<I", data, 12)
    gltf = json.loads(data[20:20 + json_length].decode("utf-8"))
    binary = data[20 + json_length + 8:]
    return gltf, binary


def read_accessor(gltf, binary, index):
    accessor = gltf["accessors"][index]
    fmt, size = COMPONENT[accessor["componentType"]]
    count = accessor["count"]
    components = NUM_COMPONENTS[accessor["type"]]
    view = gltf["bufferViews"][accessor.get("bufferView", 0)]
    base = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    stride = view.get("byteStride") or size * components
    out = []
    for element in range(count):
        offset = base + element * stride
        out.append(struct.unpack_from("<" + fmt * components, binary, offset))
    return out


def node_matrix(node):
    if "matrix" in node:  # colonne-majeur
        m = node["matrix"]
        return [[m[0], m[4], m[8], m[12]], [m[1], m[5], m[9], m[13]],
                [m[2], m[6], m[10], m[14]], [m[3], m[7], m[11], m[15]]]
    tx, ty, tz = node.get("translation", [0, 0, 0])
    qx, qy, qz, qw = node.get("rotation", [0, 0, 0, 1])
    sx, sy, sz = node.get("scale", [1, 1, 1])
    rot = [
        [1 - 2 * (qy * qy + qz * qz), 2 * (qx * qy - qz * qw), 2 * (qx * qz + qy * qw)],
        [2 * (qx * qy + qz * qw), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz - qx * qw)],
        [2 * (qx * qz - qy * qw), 2 * (qy * qz + qx * qw), 1 - 2 * (qx * qx + qy * qy)],
    ]
    scale = [sx, sy, sz]
    return [[rot[r][c] * scale[c] for c in range(3)] + [[tx, ty, tz][r]] for r in range(3)] + [[0, 0, 0, 1]]


def multiply(a, b):
    return [[sum(a[r][k] * b[k][c] for k in range(4)) for c in range(4)] for r in range(4)]


def apply(matrix, point, translate=True):
    x, y, z = point
    w = 1.0 if translate else 0.0
    return tuple(matrix[r][0] * x + matrix[r][1] * y + matrix[r][2] * z + matrix[r][3] * w for r in range(3))


def gather(gltf, binary):
    """Aplatit la scene : sommets en espace monde, indices reindexes."""
    positions, normals, uvs, indices = [], [], [], []
    nodes = gltf.get("nodes", [])

    def walk(index, parent):
        node = nodes[index]
        world = multiply(parent, node_matrix(node))
        if "mesh" in node:
            for prim in gltf["meshes"][node["mesh"]].get("primitives", []):
                attributes = prim.get("attributes", {})
                if "POSITION" not in attributes:
                    continue
                base = len(positions)
                for point in read_accessor(gltf, binary, attributes["POSITION"]):
                    positions.append(apply(world, point))
                # Les UV existaient dans la source et étaient JETÉES ici : la
                # coque arrivait donc en jeu sans coordonnées de texture, ce qui
                # rendait toute peinture impossible.
                if "TEXCOORD_0" in attributes:
                    for uv in read_accessor(gltf, binary, attributes["TEXCOORD_0"]):
                        uvs.append((uv[0], uv[1]))
                else:
                    uvs.extend([(0.0, 0.0)] * (len(positions) - base))
                if "NORMAL" in attributes:
                    for normal in read_accessor(gltf, binary, attributes["NORMAL"]):
                        vector = apply(world, normal, translate=False)
                        length = math.sqrt(sum(component * component for component in vector)) or 1.0
                        normals.append(tuple(component / length for component in vector))
                else:
                    normals.extend([(0.0, 1.0, 0.0)] * (len(positions) - base))
                if "indices" in prim:
                    for triple in read_accessor(gltf, binary, prim["indices"]):
                        indices.append(triple[0] + base)
                else:
                    indices.extend(range(base, len(positions)))
        for child in node.get("children", []):
            walk(child, world)

    identity = [[1 if r == c else 0 for c in range(4)] for r in range(4)]
    for scene_node in gltf["scenes"][gltf.get("scene", 0)]["nodes"]:
        walk(scene_node, identity)
    return positions, normals, uvs, indices


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("-o", "--output", default="assets/models/yole_hull.glb")
    args = parser.parse_args()

    source = pathlib.Path(args.input)
    if not source.is_absolute():
        source = ROOT / source
    gltf, binary = load_glb(source)
    positions, normals, uvs, indices = gather(gltf, binary)
    if not positions:
        raise SystemExit("aucune geometrie trouvee")

    extent = [(min(p[axis] for p in positions), max(p[axis] for p in positions)) for axis in range(3)]
    spans = [hi - lo for lo, hi in extent]
    print(f"   entree : {len(positions)} sommets, {len(indices)//3} triangles")
    print(f"   etendue: X {spans[0]:.3f}  Y {spans[1]:.3f}  Z {spans[2]:.3f}")

    # Une coque est bien plus longue que large, et bien plus large que haute.
    order = sorted(range(3), key=lambda axis: spans[axis], reverse=True)
    length_axis, beam_axis, depth_axis = order[0], order[1], order[2]
    print(f"   axes   : longueur={'XYZ'[length_axis]}  largeur={'XYZ'[beam_axis]}  hauteur={'XYZ'[depth_axis]}")

    remapped = [(p[beam_axis], p[depth_axis], p[length_axis]) for p in positions]
    remapped_normals = [(n[beam_axis], n[depth_axis], n[length_axis]) for n in normals]

    # Repere direct : une permutation impaire inverse l'orientation des faces.
    if (beam_axis, depth_axis, length_axis) in ((0, 2, 1), (1, 0, 2), (2, 1, 0)):
        remapped = [(-x, y, z) for x, y, z in remapped]
        remapped_normals = [(-x, y, z) for x, y, z in remapped_normals]

    # Mise a l'echelle par axe, pas uniforme. La physique du jeu (16 points de
    # flottabilite, capsules de collision) est calee en dur sur cette enveloppe :
    # c'est elle qui fait foi, pas les proportions du generateur. Une conversion
    # image-vers-3D depuis une vue 3/4 estime tres mal la profondeur — la coque
    # generee sortait 4x trop creuse.
    def span(axis):
        return max(p[axis] for p in remapped) - min(p[axis] for p in remapped)

    scale_x = (TARGET_HALF_BEAM * 2) / (span(0) or 1)
    scale_y = TARGET_DEPTH / (span(1) or 1)
    scale_z = TARGET_LENGTH / (span(2) or 1)
    print(f"   echelle: X {scale_x:.3f}  Y {scale_y:.3f}  Z {scale_z:.3f}")
    remapped = [(x * scale_x, y * scale_y, z * scale_z) for x, y, z in remapped]
    # Les normales suivent l'inverse transpose d'une mise a l'echelle diagonale.
    remapped_normals = [
        (n[0] / scale_x, n[1] / scale_y, n[2] / scale_z) for n in remapped_normals
    ]
    remapped_normals = [
        (lambda L: (n[0] / L, n[1] / L, n[2] / L))(math.sqrt(n[0] ** 2 + n[1] ** 2 + n[2] ** 2) or 1.0)
        for n in remapped_normals
    ]

    # La proue est l'extremite la plus effilee ; le tableau arriere reste large.
    zs = [p[2] for p in remapped]
    z_min, z_max = min(zs), max(zs)
    cut = (z_max - z_min) * 0.12
    front = max((abs(p[0]) for p in remapped if p[2] > z_max - cut), default=0)
    back = max((abs(p[0]) for p in remapped if p[2] < z_min + cut), default=0)
    if front > back:
        print(f"   proue  : detectee vers -Z (demi-largeur {back:.3f} contre {front:.3f}) -> retournement")
        remapped = [(-x, y, -z) for x, y, z in remapped]
        remapped_normals = [(-x, y, -z) for x, y, z in remapped_normals]
    else:
        print(f"   proue  : deja vers +Z (demi-largeur {front:.3f} contre {back:.3f})")

    center_x = (min(p[0] for p in remapped) + max(p[0] for p in remapped)) / 2
    center_z = (min(p[2] for p in remapped) + max(p[2] for p in remapped)) / 2
    top_y = max(p[1] for p in remapped)
    remapped = [(x - center_x, y - top_y + GUNWALE_Y, z - center_z) for x, y, z in remapped]

    final = [(min(p[a] for p in remapped), max(p[a] for p in remapped)) for a in range(3)]
    print(f"   sortie : longueur {final[2][1]-final[2][0]:.3f} m, demi-largeur {final[0][1]:.3f} m, "
          f"fond {final[1][0]:.3f} m, plat-bord {final[1][1]:.3f} m")

    position_bytes = b"".join(struct.pack("<3f", *p) for p in remapped)
    normal_bytes = b"".join(struct.pack("<3f", *n) for n in remapped_normals)
    wide = len(remapped) > 65535
    index_fmt, index_component = ("<I", 5125) if wide else ("<H", 5123)
    index_bytes = b"".join(struct.pack(index_fmt, i) for i in indices)
    if len(index_bytes) % 4:
        index_bytes += b"\x00" * (4 - len(index_bytes) % 4)

    uv_bytes = b"".join(struct.pack("<2f", *uv) for uv in uvs)
    blob = position_bytes + normal_bytes + uv_bytes + index_bytes
    out_gltf = {
        "asset": {"version": "2.0", "generator": "YOLE BWA BRAWL fit_hull_glb.py"},
        "scene": 0,
        "scenes": [{"nodes": [0], "name": "yole"}],
        "nodes": [{"mesh": 0, "name": "hull"}],
        "meshes": [{"name": "hull", "primitives": [
            {"attributes": {"POSITION": 0, "NORMAL": 1, "TEXCOORD_0": 2}, "indices": 3, "mode": 4}]}],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": len(remapped), "type": "VEC3",
             "min": [final[a][0] for a in range(3)], "max": [final[a][1] for a in range(3)]},
            {"bufferView": 1, "componentType": 5126, "count": len(remapped_normals), "type": "VEC3"},
            {"bufferView": 2, "componentType": 5126, "count": len(uvs), "type": "VEC2"},
            {"bufferView": 3, "componentType": index_component, "count": len(indices), "type": "SCALAR"},
        ],
        "bufferViews": [
            {"buffer": 0, "byteOffset": 0, "byteLength": len(position_bytes), "target": 34962},
            {"buffer": 0, "byteOffset": len(position_bytes), "byteLength": len(normal_bytes), "target": 34962},
            {"buffer": 0, "byteOffset": len(position_bytes) + len(normal_bytes),
             "byteLength": len(uv_bytes), "target": 34962},
            {"buffer": 0, "byteOffset": len(position_bytes) + len(normal_bytes) + len(uv_bytes),
             "byteLength": len(index_bytes), "target": 34963},
        ],
        "buffers": [{"byteLength": len(blob)}],
    }

    json_bytes = json.dumps(out_gltf, separators=(",", ":")).encode("utf-8")
    if len(json_bytes) % 4:
        json_bytes += b" " * (4 - len(json_bytes) % 4)
    glb = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(json_bytes) + 8 + len(blob))
    glb += struct.pack("<II", len(json_bytes), 0x4E4F534A) + json_bytes
    glb += struct.pack("<II", len(blob), 0x004E4942) + blob

    target = pathlib.Path(args.output)
    if not target.is_absolute():
        target = ROOT / target
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(glb)
    try:
        shown = target.relative_to(ROOT)
    except ValueError:
        shown = target
    print(f"[OK] {shown}: {len(glb)} octets")

    # ⚠️ CET OUTIL NE NORMALISE QUE LA BOITE ENGLOBANTE.
    #
    # La forme interieure — tonture, rocker, sections — passe telle quelle. Une
    # carene peut deriver d'un demi-metre sans que rien ici ne bronche, et c'est
    # exactement ce qui est arrive a la coque livree (207 mm d'ecart median a la
    # ligne de quille du gabarit). C'est ACCEPTE, mais il faut le savoir.
    #
    # L'autorite sur ce qui est verifie, c'est `npm run test:hull`, qui decode le
    # GLB reellement livre. On ne redouble pas ses controles ici : deux tables de
    # verite qui derivent l'une de l'autre est precisement le defaut documente
    # dans docs/ASSET_CONTRACT.md.
    half_beam = max(abs(final[0][0]), abs(final[0][1]))
    ratio = (final[2][1] - final[2][0]) / (half_beam * 2) if half_beam else 0.0
    print(f"     enveloppe : L={final[2][1] - final[2][0]:.3f} m  "
          f"demi-largeur={half_beam:.3f} m  ratio={ratio:.2f}")
    print("     ⚠️ le ratio du MESH doit rester ~5,14 : le runtime applique")
    print("        ensuite HULL_VISUAL_WIDTH_SCALE=0,84 pour afficher 6,12.")
    print("     -> valider avec : npm run test:hull")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
