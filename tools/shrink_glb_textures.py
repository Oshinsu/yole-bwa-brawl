#!/usr/bin/env python3
"""Reduit les textures embarquees d'un GLB, en place.

Les generateurs 3D sortent systematiquement en 2048 ou 4096 PNG, ce qui pese
plusieurs megaoctets pour des objets hauts de quelques dizaines de pixels a
l'ecran. Ce jeu est une PWA hors-ligne : le poids telecharge compte autant que
le cout GPU.

    python3 tools/shrink_glb_textures.py assets/models/yole_crew.glb --size 256

Le chunk binaire est entierement reconstruit : tous les byteOffset sont
recalcules et realignes sur 4 octets, y compris ceux des accessors de maillage.
"""
from __future__ import annotations

import argparse
import io
import json
import pathlib
import struct
import sys

try:
    from PIL import Image
except ImportError:
    raise SystemExit("Pillow requis : python -m pip install Pillow")

ROOT = pathlib.Path(__file__).resolve().parents[1]


def align4(data: bytes, filler: bytes = b"\x00") -> bytes:
    remainder = len(data) % 4
    return data if remainder == 0 else data + filler * (4 - remainder)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("path")
    parser.add_argument("--size", type=int, default=256, help="cote max en pixels")
    parser.add_argument("--quality", type=int, default=88)
    args = parser.parse_args()

    path = pathlib.Path(args.path)
    if not path.is_absolute():
        path = ROOT / path
    data = path.read_bytes()
    if data[:4] != b"glTF":
        raise SystemExit("pas un GLB binaire")

    json_length, = struct.unpack_from("<I", data, 12)
    gltf = json.loads(data[20:20 + json_length].decode("utf-8"))
    bin_offset = 20 + json_length + 8
    binary = data[bin_offset:]

    views = gltf.get("bufferViews", [])
    payloads: list[bytes] = []
    for view in views:
        start = view.get("byteOffset", 0)
        payloads.append(binary[start:start + view["byteLength"]])

    before = len(data)
    for index, image in enumerate(gltf.get("images", [])):
        view_index = image.get("bufferView")
        if view_index is None:
            continue
        with Image.open(io.BytesIO(payloads[view_index])) as source:
            original = source.size
            picture = source.copy()
        has_alpha = picture.mode in ("RGBA", "LA") or "transparency" in picture.info
        picture.thumbnail((args.size, args.size), Image.LANCZOS)
        buffer = io.BytesIO()
        if has_alpha:
            picture.convert("RGBA").save(buffer, format="PNG", optimize=True)
            image["mimeType"] = "image/png"
        else:
            picture.convert("RGB").save(buffer, format="JPEG", quality=args.quality, optimize=True)
            image["mimeType"] = "image/jpeg"
        payloads[view_index] = buffer.getvalue()
        print(f"  image {index}: {original[0]}x{original[1]} -> {picture.size[0]}x{picture.size[1]} "
              f"({'PNG' if has_alpha else 'JPEG'}), {len(payloads[view_index]) / 1e6:.3f} Mo")

    rebuilt = bytearray()
    for view, payload in zip(views, payloads):
        view["byteOffset"] = len(rebuilt)
        view["byteLength"] = len(payload)
        rebuilt += align4(payload)
    gltf["buffers"][0]["byteLength"] = len(rebuilt)
    gltf["buffers"][0].pop("uri", None)

    json_bytes = align4(json.dumps(gltf, separators=(",", ":")).encode("utf-8"), b" ")
    binary_bytes = bytes(rebuilt)
    glb = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(json_bytes) + 8 + len(binary_bytes))
    glb += struct.pack("<II", len(json_bytes), 0x4E4F534A) + json_bytes
    glb += struct.pack("<II", len(binary_bytes), 0x004E4942) + binary_bytes
    path.write_bytes(glb)

    print(f"[OK] {path.name}: {before / 1e6:.2f} Mo -> {len(glb) / 1e6:.2f} Mo "
          f"({100 - len(glb) * 100 // before}% de gain)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
