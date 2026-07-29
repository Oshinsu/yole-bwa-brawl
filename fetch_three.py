#!/usr/bin/env python3
"""Télécharge localement les deux modules officiels Three.js 0.185.1.
Le jeu peut aussi les charger depuis un CDN, mais le vendoring rend le prototype autonome.
"""
from __future__ import annotations

from pathlib import Path
from urllib.request import Request, urlopen
import sys

ROOT = Path(__file__).resolve().parent
VENDOR = ROOT / "vendor"
CDN = "https://cdn.jsdelivr.net/npm/three@0.185.1"
FILES = {
    "three.module.min.js": f"{CDN}/build/three.module.min.js",
    "three.core.min.js": f"{CDN}/build/three.core.min.js",
}

# Addons pour le chargement de modèles. Leurs imports sont réécrits vers le core
# vendoré : pas d'importmap à maintenir, et aucune seconde instance de Three.
# Si vendor/ est absent, l'import dynamique échoue et le jeu reste procédural.
ADDONS = {
    "addons/GLTFLoader.js": f"{CDN}/examples/jsm/loaders/GLTFLoader.js",
    "addons/BufferGeometryUtils.js": f"{CDN}/examples/jsm/utils/BufferGeometryUtils.js",
    "addons/SkeletonUtils.js": f"{CDN}/examples/jsm/utils/SkeletonUtils.js",
}

ADDON_REWRITES = (
    ("from 'three'", "from '../three.module.min.js'"),
    ('from "three"', 'from "../three.module.min.js"'),
    ("from '../utils/BufferGeometryUtils.js'", "from './BufferGeometryUtils.js'"),
    ("from '../utils/SkeletonUtils.js'", "from './SkeletonUtils.js'"),
)


def download(name: str, url: str) -> None:
    target = VENDOR / name
    if target.exists() and target.stat().st_size > 100_000:
        print(f"[OK] {name} déjà présent ({target.stat().st_size // 1024} Ko)")
        return
    print(f"[>] Telechargement {name}...")
    req = Request(url, headers={"User-Agent": "YOLE-BWA-BRAWL/1.1-STORMFORGE"})
    with urlopen(req, timeout=60) as response:
        data = response.read()
    if len(data) < 100_000:
        raise RuntimeError(f"Réponse anormalement petite pour {name}: {len(data)} octets")
    target.write_bytes(data)
    print(f"[OK] {name}: {len(data) // 1024} Ko")


def download_addon(name: str, url: str) -> None:
    target = VENDOR / name
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and target.stat().st_size > 5_000:
        print(f"[OK] {name} déjà présent ({target.stat().st_size // 1024} Ko)")
        return
    print(f"[>] Telechargement {name}...")
    req = Request(url, headers={"User-Agent": "YOLE-BWA-BRAWL/1.2-TROPICAL-MAYHEM"})
    with urlopen(req, timeout=60) as response:
        source = response.read().decode("utf-8")
    if len(source) < 5_000:
        raise RuntimeError(f"Réponse anormalement petite pour {name}: {len(source)} octets")
    for old, new in ADDON_REWRITES:
        source = source.replace(old, new)
    if "from 'three'" in source or 'from "three"' in source:
        raise RuntimeError(f"{name}: specifier 'three' non réécrit")
    target.write_text(source, encoding="utf-8")
    print(f"[OK] {name}: {len(source) // 1024} Ko")


def main() -> int:
    VENDOR.mkdir(parents=True, exist_ok=True)
    try:
        for name, url in FILES.items():
            download(name, url)
        for name, url in ADDONS.items():
            download_addon(name, url)
    except Exception as exc:
        print(f"[!] Vendoring impossible: {exc}")
        print("Le jeu essaiera automatiquement jsDelivr puis UNPKG dans le navigateur.")
        return 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
