#!/usr/bin/env python3
"""Inspecte un GLB : noeuds, os, meshes, animations, et confronte le fichier au
contrat d'articulations du jeu.

Aucune dependance : le chunk JSON d'un GLB se lit directement.

    python3 tools/inspect_glb.py assets/models/yole_crew.glb

Sert a repondre a la seule question qui compte a l'import : « le jeu va-t-il
savoir piloter ce rig ? »
"""
from __future__ import annotations

import json
import pathlib
import re
import struct
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]


def read_gltf(path: pathlib.Path) -> dict:
    data = path.read_bytes()
    if data[:4] == b"glTF":
        magic, version, total = struct.unpack_from("<III", data, 0)
        if total != len(data):
            print(f"[!] longueur declaree {total} != taille reelle {len(data)}")
        length, kind = struct.unpack_from("<II", data, 12)
        if kind != 0x4E4F534A:
            raise SystemExit("premier chunk non-JSON")
        return json.loads(data[20:20 + length].decode("utf-8"))
    return json.loads(data.decode("utf-8"))


def crew_joint_contract() -> dict[str, list[str]]:
    """Relit CREW_JOINTS depuis la source : une seule verite, pas de copie."""
    source = (ROOT / "src" / "render" / "assets.js").read_text(encoding="utf-8")
    start = source.index("CREW_JOINTS = Object.freeze({")
    block = source[start:source.index("});", start)]
    return {
        name: re.findall(r'"([^"]+)"', body)
        for name, body in re.findall(r"(\w+): \[([^\]]+)\]", block)
    }


def sanitize(name: str) -> str:
    """Reproduit l'assainissement de THREE.PropertyBinding : GLTFLoader retire
    les caracteres qui casseraient un chemin d'animation (dont les points)."""
    return re.sub(r"[\s.:/\[\]]", "", name)


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    path = pathlib.Path(sys.argv[1])
    if not path.is_absolute():
        path = ROOT / path
    if not path.exists():
        raise SystemExit(f"introuvable: {path}")

    gltf = read_gltf(path)
    nodes = gltf.get("nodes", [])
    raw_names = [n.get("name", "") for n in nodes]
    names = {sanitize(n) for n in raw_names if n}

    print(f"== {path.relative_to(ROOT) if ROOT in path.parents else path}")
    print(f"   {path.stat().st_size} octets")
    print(f"   noeuds     : {len(nodes)}")
    print(f"   meshes     : {len(gltf.get('meshes', []))}")
    print(f"   skins      : {len(gltf.get('skins', []))}")
    print(f"   animations : {len(gltf.get('animations', []))}")
    print(f"   materiaux  : {len(gltf.get('materials', []))}  textures: {len(gltf.get('textures', []))}")

    triangles = 0
    for mesh in gltf.get("meshes", []):
        for prim in mesh.get("primitives", []):
            accessor = prim.get("indices")
            if accessor is not None:
                triangles += gltf["accessors"][accessor]["count"] // 3
    print(f"   triangles  : {triangles}")

    for skin in gltf.get("skins", []):
        joints = skin.get("joints", [])
        print(f"   squelette '{skin.get('name', '?')}' : {len(joints)} os")

    print("\n== contrat d'articulations")
    contract = crew_joint_contract()
    missing = []
    for logical, aliases in contract.items():
        hit = next((a for a in aliases if sanitize(a) in names), None)
        print(f"   {'OK ' if hit else 'NON'}  {logical:<16} -> {hit or 'AUCUN ALIAS TROUVE'}")
        if not hit:
            missing.append((logical, aliases))

    if missing:
        print("\n[!] rig NON pilotable : le jeu repassera en equipage procedural.")
        print("    Renommer les noeuds, ou ajouter l'alias dans CREW_JOINTS")
        print("    (src/render/assets.js). Noeuds presents dans le fichier :")
        for name in sorted(n for n in raw_names if n):
            print(f"      - {name}")
        return 1

    print("\n[OK] toutes les articulations sont resolues : rig pilotable.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
