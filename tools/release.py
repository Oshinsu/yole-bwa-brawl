#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT.parent / "YOLE_BWA_BRAWL_THREEJS_TROPICAL_MAYHEM_V3_2.zip"
# La release zippait tout le dépôt moins trois dossiers : 133 Mo pour 6,9 Mo
# utiles. « art-source » (sources d'illustration haute définition) et
# « previews » (captures de mise au point) restent sur le disque de l'auteur,
# jamais dans le paquet du joueur.
EXCLUDED_DIRS = {"__pycache__", ".git", "node_modules", "art-source", "previews", ".playwright-mcp", ".claude"}
EXCLUDED_FILES = {"SHA256SUMS.txt", "release-manifest.json"}


def files_for_release():
    for path in sorted(ROOT.rglob("*")):
        if not path.is_file():
            continue
        relative = path.relative_to(ROOT)
        if any(part in EXCLUDED_DIRS for part in relative.parts):
            continue
        if relative.as_posix() in EXCLUDED_FILES:
            continue
        yield path, relative


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    print("[1/4] npm run verify", flush=True)
    result = subprocess.run(
        ["npm", "run", "verify"],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    print(result.stdout, end="")
    (ROOT / "VERIFY_OUTPUT.txt").write_text(result.stdout, encoding="utf-8")
    if result.returncode != 0:
        print("Verification failed; release aborted.", file=sys.stderr)
        return result.returncode

    benchmark_elapsed = re.findall(r'"elapsedMs"\s*:\s*([0-9.]+)', result.stdout)
    benchmark_rate = re.findall(r'"boatStepsPerSecond"\s*:\s*([0-9.]+)', result.stdout)
    build_info_path = ROOT / "BUILD_INFO.json"
    build_info = json.loads(build_info_path.read_text(encoding="utf-8"))
    if benchmark_elapsed:
        build_info["validation"]["benchmarkElapsedMs"] = float(benchmark_elapsed[-1])
    if benchmark_rate:
        build_info["validation"]["benchmarkBoatStepsPerSecond"] = int(float(benchmark_rate[-1]))
    build_info_path.write_text(json.dumps(build_info, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print("[2/4] checksums", flush=True)
    checksum_lines = []
    total_bytes = 0
    file_count = 0
    for path, relative in files_for_release():
        checksum_lines.append(f"{sha256(path)}  {relative.as_posix()}")
        total_bytes += path.stat().st_size
        file_count += 1
    (ROOT / "SHA256SUMS.txt").write_text("\n".join(checksum_lines) + "\n", encoding="utf-8")

    manifest = {
        "title": build_info["title"],
        "version": build_info["version"],
        "builtAtUtc": datetime.now(timezone.utc).isoformat(),
        "verifiedCommand": "npm run verify",
        "fileCountBeforeManifest": file_count,
        "uncompressedBytesBeforeManifest": total_bytes,
        "archive": OUT.name,
        "entrypoints": [
            "PLAY_WINDOWS.bat",
            "play.sh",
            "index.html",
            "YOLE_BWA_BRAWL_TROPICAL_MAYHEM_V3_2_SINGLE_FILE_ONLINE.html",
        ],
    }
    (ROOT / "release-manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    # Regenerate checksums including the manifest but never the checksum file itself.
    checksum_lines = []
    for path, relative in files_for_release():
        checksum_lines.append(f"{sha256(path)}  {relative.as_posix()}")
    (ROOT / "SHA256SUMS.txt").write_text("\n".join(checksum_lines) + "\n", encoding="utf-8")

    print("[3/4] zip", flush=True)
    if OUT.exists():
        OUT.unlink()
    with zipfile.ZipFile(OUT, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in sorted(ROOT.rglob("*")):
            if not path.is_file():
                continue
            relative = path.relative_to(ROOT)
            if any(part in EXCLUDED_DIRS for part in relative.parts):
                continue
            archive.write(path, (Path(ROOT.name) / relative).as_posix())

    print("[4/4] archive verification", flush=True)
    with zipfile.ZipFile(OUT, "r") as archive:
        bad = archive.testzip()
        if bad:
            raise RuntimeError(f"Corrupt ZIP entry: {bad}")
        entries = len(archive.infolist())

    print(json.dumps({
        "ok": True,
        "archive": str(OUT),
        "archiveBytes": OUT.stat().st_size,
        "entries": entries,
        "archiveSha256": sha256(OUT),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
