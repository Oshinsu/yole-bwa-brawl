#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
import zipfile
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT.parent / "YOLE_BWA_BRAWL_THREEJS_TROPICAL_MAYHEM_V3_2.zip"
# La release zippait tout le dépôt moins trois dossiers : 133 Mo pour 6,9 Mo
# utiles. « art-source » (sources d'illustration haute définition) et
# « previews » (captures de mise au point) restent sur le disque de l'auteur,
# jamais dans le paquet du joueur.
EXCLUDED_DIRS = {
    "__pycache__",
    ".git",
    ".agents",
    ".claude",
    ".codex",
    ".playwright-mcp",
    ".venv",
    "art-source",
    "node_modules",
    "previews",
}
CHECKSUM_FILE = "SHA256SUMS.txt"
MANIFEST_FILE = "release-manifest.json"
EXCLUDED_FILE_SUFFIXES = (".lnk", ".pyc", ".tar.gz", ".zip")
EXCLUDED_FILES = {
    "docs/ZIK_ANALYSE.json",
    # Archives visuelles conservées dans le dépôt pour comparaison, mais
    # volontairement absentes du jeu, du précache et du paquet distribué.
    "assets/textures/v6/menu/menu_hero_backdrop.webp",
    "assets/textures/v6/menu/mode_combat_card.webp",
    "assets/textures/v6/menu/mode_tour_card.webp",
    "assets/textures/v6/menu/mode_versus_card.webp",
    "assets/textures/v6/menu/mode_workshop_card.webp",
    "assets/textures/v6/menu/versus_lobby_backdrop.webp",
}
AUTHORIZED_AUDIO_RIGHTS_STATUSES = {"owner-attested", "evidence-verified"}
ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
AUDIO_REGISTER_PATH = re.compile(
    r"`((?:zik|assets/audio)/[^`\r\n]+\.(?:aac|flac|m4a|mp3|ogg|wav))`",
    re.IGNORECASE,
)
AUDIO_FILE_SUFFIXES = {".aac", ".flac", ".m4a", ".mp3", ".ogg", ".wav"}
NPM_COMMAND = "npm.cmd" if sys.platform == "win32" else "npm"


def is_release_file(relative: Path) -> bool:
    relative_name = relative.as_posix()
    if any(part in EXCLUDED_DIRS for part in relative.parts):
        return False
    if relative_name in EXCLUDED_FILES:
        return False
    return not relative_name.lower().endswith(EXCLUDED_FILE_SUFFIXES)


def files_for_release(*, include_manifest: bool = False, include_checksum: bool = False):
    # Trier sur le chemin POSIX relatif rend l'ordre identique sous Windows,
    # macOS et Linux ; l'ordre natif de WindowsPath n'est pas le même.
    candidates = sorted(ROOT.rglob("*"), key=lambda path: path.relative_to(ROOT).as_posix())
    for path in candidates:
        if not path.is_file():
            continue
        relative = path.relative_to(ROOT)
        if not is_release_file(relative):
            continue
        relative_name = relative.as_posix()
        if relative_name == CHECKSUM_FILE and not include_checksum:
            continue
        if relative_name == MANIFEST_FILE and not include_manifest:
            continue
        yield path, relative


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_checksums(*, include_manifest: bool = True) -> tuple[int, int]:
    checksum_lines = []
    total_bytes = 0
    file_count = 0
    for path, relative in files_for_release(include_manifest=include_manifest):
        checksum_lines.append(f"{sha256(path)}  {relative.as_posix()}")
        total_bytes += path.stat().st_size
        file_count += 1
    (ROOT / CHECKSUM_FILE).write_text("\n".join(checksum_lines) + "\n", encoding="utf-8")
    return file_count, total_bytes


def is_valid_iso_date(value: object) -> bool:
    if not isinstance(value, str) or not ISO_DATE.fullmatch(value):
        return False
    try:
        return date.fromisoformat(value).isoformat() == value
    except ValueError:
        return False


def audio_inventory_errors(
    audio: dict,
    *,
    register_text: str | None = None,
    actual_paths: set[str] | None = None,
) -> list[str]:
    """Compare les fichiers distribués à l'inventaire exact du registre."""
    errors = []
    if register_text is None:
        register_path = ROOT / "AUDIO_RIGHTS.md"
        if not register_path.is_file():
            return ["AUDIO_RIGHTS.md est absent"]
        register_text = register_path.read_text(encoding="utf-8")
    registered = set(AUDIO_REGISTER_PATH.findall(register_text))
    if actual_paths is None:
        actual_paths = {
            path.relative_to(ROOT).as_posix()
            for base in (ROOT / "zik", ROOT / "assets" / "audio")
            if base.is_dir()
            for path in base.rglob("*")
            if path.is_file() and path.suffix.lower() in AUDIO_FILE_SUFFIXES
        }
    actual = actual_paths
    missing_from_register = sorted(actual - registered)
    missing_from_disk = sorted(registered - actual)
    if missing_from_register:
        errors.append(
            "audio distribué absent du registre : "
            + ", ".join(missing_from_register)
        )
    if missing_from_disk:
        errors.append(
            "audio inscrit au registre mais absent du disque : "
            + ", ".join(missing_from_disk)
        )

    actual_audio_counts = {
        "musicFiles": sum(path.startswith("zik/") for path in actual),
        "sampledEffectFiles": sum(path.startswith("assets/audio/") for path in actual),
    }
    for field, actual_count in actual_audio_counts.items():
        declared_count = audio.get(field)
        if (
            not isinstance(declared_count, int)
            or isinstance(declared_count, bool)
            or declared_count <= 0
        ):
            errors.append(f"BUILD_INFO.json doit déclarer un décompte audio positif pour {field}")
        elif declared_count != actual_count:
            errors.append(
                f"le décompte {field} ({declared_count}) ne correspond pas aux fichiers ({actual_count})"
            )
    return errors


def audio_rights_errors(
    audio: dict,
    authorization: dict,
    release_version: object = None,
) -> list[str]:
    """Valide la base de droits sans confondre attestation et pièces vérifiées."""
    errors = []
    status = audio.get("status")
    authorization_status = authorization.get("status")

    if status not in AUTHORIZED_AUDIO_RIGHTS_STATUSES:
        errors.append(f"statut de droits audio non publiable : {status!r}")
        return errors
    if authorization_status != status:
        errors.append("le statut d'autorisation du manifeste ne correspond pas à BUILD_INFO.json")
    if audio.get("commercialReleaseBlocked") is not False:
        errors.append("BUILD_INFO.json maintient un blocage commercial audio")
    if authorization.get("commercialDistributionIncluded") is not True:
        errors.append("l'autorisation ne couvre pas explicitement la distribution commerciale")
    if audio.get("register") != "AUDIO_RIGHTS.md":
        errors.append("BUILD_INFO.json ne référence pas AUDIO_RIGHTS.md")
    if authorization.get("register") != "AUDIO_RIGHTS.md":
        errors.append("l'autorisation ne référence pas AUDIO_RIGHTS.md")
    scope = authorization.get("scope")
    if not isinstance(scope, str) or not scope.strip():
        errors.append("le périmètre de l'autorisation audio est absent")
    elif isinstance(release_version, str) and release_version not in scope:
        errors.append("le périmètre audio ne nomme pas la version publiée")
    audio_files = authorization.get("audioFiles")
    if not isinstance(audio_files, dict):
        errors.append("le décompte audio autorisé est absent du manifeste")
    elif (
        audio_files.get("musicFiles") != audio.get("musicFiles")
        or audio_files.get("sampledEffectFiles") != audio.get("sampledEffectFiles")
    ):
        errors.append("le décompte audio autorisé ne correspond pas à BUILD_INFO.json")
    authorized_at = authorization.get("authorizedAt")
    if not is_valid_iso_date(authorized_at):
        errors.append("la date d'autorisation du manifeste est absente ou invalide")

    if status == "owner-attested":
        attested_at = audio.get("ownerAttestedAt")
        if audio.get("ownerAttested") is not True:
            errors.append("l'attestation du propriétaire n'est pas enregistrée")
        if not is_valid_iso_date(attested_at):
            errors.append("la date d'attestation propriétaire est absente ou invalide")
        if authorized_at != attested_at:
            errors.append("la date d'autorisation du manifeste ne correspond pas à l'attestation")
        if authorization.get("authorizedByRole") != "project-owner":
            errors.append("l'autorisation owner-attested ne vient pas du rôle project-owner")
        if authorization.get("authorizerIdentityEvidence") != "not-provided":
            errors.append("owner-attested doit signaler l'absence de justificatif d'identité")
        # Ces trois assertions empêchent de transformer l'attestation en
        # prétendue preuve documentaire lors d'une future édition.
        if audio.get("evidenceArchived") is not False:
            errors.append("owner-attested doit déclarer evidenceArchived=false")
        if audio.get("rightsVerified") is not False:
            errors.append("owner-attested doit déclarer rightsVerified=false")
        if authorization.get("documentaryEvidence") != "not-provided":
            errors.append("owner-attested doit déclarer les pièces documentaires non fournies")
        if authorization.get("independentVerification") is not False:
            errors.append("owner-attested ne doit pas prétendre à une vérification indépendante")
    elif status == "evidence-verified":
        if audio.get("evidenceArchived") is not True or audio.get("rightsVerified") is not True:
            errors.append("evidence-verified exige des pièces archivées et des droits vérifiés")
        if authorization.get("documentaryEvidence") != "archived":
            errors.append("evidence-verified exige documentaryEvidence=archived")
        if authorization.get("independentVerification") is not True:
            errors.append("evidence-verified exige une vérification indépendante déclarée")

    return errors


def release_readiness_errors(
    build_info: dict,
    declared_manifest: dict,
    *,
    verify_audio_inventory: bool = True,
) -> list[str]:
    errors = []
    if not isinstance(build_info, dict):
        return ["BUILD_INFO.json doit contenir un objet JSON"]
    if not isinstance(declared_manifest, dict):
        return ["release-manifest.json doit contenir un objet JSON"]
    if declared_manifest.get("releaseStatus") != "ready":
        errors.append("release-manifest.json n'est pas déclaré « ready »")
    blockers = declared_manifest.get("blockers")
    if not isinstance(blockers, list):
        errors.append("release-manifest.json doit déclarer blockers comme une liste")
    elif blockers:
        errors.append(f"release-manifest.json contient {len(blockers)} blocage(s)")
    if declared_manifest.get("version") != build_info.get("version"):
        errors.append("la version du manifeste ne correspond pas à BUILD_INFO.json")
    if declared_manifest.get("title") != build_info.get("title"):
        errors.append("le titre du manifeste ne correspond pas à BUILD_INFO.json")

    audio = build_info.get("audioRights")
    authorization = declared_manifest.get("releaseAuthorization")
    if not isinstance(audio, dict):
        errors.append("BUILD_INFO.json ne contient pas un objet audioRights valide")
        audio = {}
    if not isinstance(authorization, dict):
        errors.append("release-manifest.json ne contient pas un objet releaseAuthorization valide")
        authorization = {}
    errors.extend(audio_rights_errors(audio, authorization, build_info.get("version")))
    if verify_audio_inventory:
        errors.extend(audio_inventory_errors(audio))

    assets = build_info.get("assetStatus")
    if not isinstance(assets, dict):
        errors.append("BUILD_INFO.json ne contient pas un objet assetStatus valide")
        assets = {}
    pending_assets = assets.get("menuYoleReplacementsPending")
    if not isinstance(pending_assets, int) or isinstance(pending_assets, bool) or pending_assets < 0:
        errors.append("menuYoleReplacementsPending doit être un entier positif ou nul")
    elif pending_assets > 0:
        errors.append("les visuels de yoles du menu ne sont pas validés")
    return errors


def make_release_manifest(
    build_info: dict,
    declared_manifest: dict,
    *,
    verified_at: str,
    file_count: int,
    total_bytes: int,
) -> dict:
    """Construit le manifeste final sans perdre la base d'autorisation revue."""
    return {
        "title": build_info["title"],
        "version": build_info["version"],
        "releaseStatus": "ready",
        "builtAtUtc": verified_at,
        "verifiedAtUtc": verified_at,
        "verifiedCommand": "npm run verify",
        "fileCountBeforeManifest": file_count,
        "uncompressedBytesBeforeManifest": total_bytes,
        "archive": OUT.name,
        "releaseAuthorization": dict(declared_manifest["releaseAuthorization"]),
        "blockers": [],
        "entrypoints": [
            "PLAY_WINDOWS.bat",
            "play.sh",
            "index.html",
            "YOLE_BWA_BRAWL_TROPICAL_MAYHEM_V3_2_SINGLE_FILE_ONLINE.html",
        ],
    }


def verify_archive_checksums(archive: zipfile.ZipFile) -> None:
    prefix = f"{ROOT.name}/"
    checksum_entry = prefix + CHECKSUM_FILE
    manifest_entry = prefix + MANIFEST_FILE
    build_info_entry = prefix + "BUILD_INFO.json"
    audio_register_entry = prefix + "AUDIO_RIGHTS.md"
    names = {info.filename for info in archive.infolist() if not info.is_dir()}
    required_entries = {
        checksum_entry,
        manifest_entry,
        build_info_entry,
        audio_register_entry,
    }
    if not required_entries.issubset(names):
        raise RuntimeError("Archive incomplete: registre audio, manifeste, BUILD_INFO ou checksums absent")

    expected_entries = {checksum_entry}
    checksummed_entries = []
    bytes_before_manifest = 0
    checksum_text = archive.read(checksum_entry).decode("utf-8")
    for number, line in enumerate(checksum_text.splitlines(), start=1):
        match = re.fullmatch(r"([0-9a-f]{64})  (.+)", line)
        if not match:
            raise RuntimeError(f"Ligne SHA256 invalide: {number}")
        expected_hash, relative_name = match.groups()
        entry_name = prefix + relative_name
        if entry_name in expected_entries:
            raise RuntimeError(f"Entrée SHA256 dupliquée: {relative_name}")
        if entry_name not in names:
            raise RuntimeError(f"Entrée absente de l'archive: {relative_name}")
        digest = hashlib.sha256()
        with archive.open(entry_name) as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
        if digest.hexdigest() != expected_hash:
            raise RuntimeError(f"SHA256 obsolète dans l'archive: {relative_name}")
        expected_entries.add(entry_name)
        checksummed_entries.append(entry_name)
        if entry_name != manifest_entry:
            bytes_before_manifest += archive.getinfo(entry_name).file_size

    extras = sorted(names - expected_entries)
    if extras:
        raise RuntimeError(f"Entrée(s) non couverte(s) par SHA256: {', '.join(extras[:5])}")

    manifest = json.loads(archive.read(manifest_entry).decode("utf-8"))
    archived_build_info = json.loads(archive.read(build_info_entry).decode("utf-8"))
    readiness_errors = release_readiness_errors(
        archived_build_info,
        manifest,
        verify_audio_inventory=False,
    )
    archived_audio_paths = {
        name[len(prefix):]
        for name in names
        if (
            name.startswith(prefix + "zik/")
            or name.startswith(prefix + "assets/audio/")
        )
        and Path(name).suffix.lower() in AUDIO_FILE_SUFFIXES
    }
    readiness_errors.extend(audio_inventory_errors(
        archived_build_info.get("audioRights") or {},
        register_text=archive.read(audio_register_entry).decode("utf-8"),
        actual_paths=archived_audio_paths,
    ))
    if readiness_errors:
        raise RuntimeError(f"Manifeste archivé non publiable: {'; '.join(readiness_errors)}")
    expected_before_manifest = len(checksummed_entries) - 1
    if manifest.get("fileCountBeforeManifest") != expected_before_manifest:
        raise RuntimeError("Comptage de fichiers du manifeste incohérent")
    if manifest.get("uncompressedBytesBeforeManifest") != bytes_before_manifest:
        raise RuntimeError("Comptage d'octets du manifeste incohérent")


def main() -> int:
    args = sys.argv[1:]
    build_info_path = ROOT / "BUILD_INFO.json"
    manifest_path = ROOT / MANIFEST_FILE

    if args == ["--check-readiness"]:
        build_info = json.loads(build_info_path.read_text(encoding="utf-8"))
        declared_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        errors = release_readiness_errors(build_info, declared_manifest)
        if errors:
            print("Publication bloquée :", file=sys.stderr)
            for error in errors:
                print(f"  - {error}", file=sys.stderr)
            return 2
        audio = build_info.get("audioRights") or {}
        print(json.dumps({
            "ok": True,
            "releaseStatus": declared_manifest.get("releaseStatus"),
            "audioRightsStatus": audio.get("status"),
            "evidenceArchived": audio.get("evidenceArchived"),
            "rightsVerified": audio.get("rightsVerified"),
        }, indent=2))
        return 0
    if args == ["--checksums-only"]:
        file_count, total_bytes = write_checksums()
        print(json.dumps({
            "ok": True,
            "checksums": file_count,
            "checksummedBytes": total_bytes,
            "manifestIncluded": True,
            "checksumFileIncluded": False,
        }, indent=2))
        return 0
    if args:
        print("Usage: python tools/release.py [--check-readiness|--checksums-only]", file=sys.stderr)
        return 2

    build_info = json.loads(build_info_path.read_text(encoding="utf-8"))
    declared_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    readiness_errors = release_readiness_errors(build_info, declared_manifest)
    if readiness_errors:
        print("Release bloquée :", file=sys.stderr)
        for error in readiness_errors:
            print(f"  - {error}", file=sys.stderr)
        print("Aucune vérification destructive, archive ou mutation de manifeste effectuée.", file=sys.stderr)
        return 2

    print("[1/4] npm run verify", flush=True)
    result = subprocess.run(
        [NPM_COMMAND, "run", "verify"],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    print(result.stdout, end="")
    if result.returncode != 0:
        print("Verification failed; release aborted.", file=sys.stderr)
        return result.returncode

    # `npm run verify` exécute des outils qui peuvent modifier les artefacts
    # générés. Relire les deux sources d'autorité ferme la fenêtre entre le
    # contrôle initial et l'écriture des checksums / du ZIP.
    build_info = json.loads(build_info_path.read_text(encoding="utf-8"))
    declared_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    post_verify_errors = release_readiness_errors(build_info, declared_manifest)
    if post_verify_errors:
        print("Release re-bloquée après vérification :", file=sys.stderr)
        for error in post_verify_errors:
            print(f"  - {error}", file=sys.stderr)
        print("Aucun checksum, manifeste final ou ZIP n'a été écrit.", file=sys.stderr)
        return 2

    (ROOT / "VERIFY_OUTPUT.txt").write_text(result.stdout, encoding="utf-8")
    benchmark_elapsed = re.findall(r'"elapsedMs"\s*:\s*([0-9.]+)', result.stdout)
    benchmark_rate = re.findall(r'"boatStepsPerSecond"\s*:\s*([0-9.]+)', result.stdout)
    if benchmark_elapsed:
        build_info["validation"]["benchmarkElapsedMs"] = float(benchmark_elapsed[-1])
    if benchmark_rate:
        build_info["validation"]["benchmarkBoatStepsPerSecond"] = int(float(benchmark_rate[-1]))
    build_info_path.write_text(json.dumps(build_info, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print("[2/4] checksums", flush=True)
    file_count, total_bytes = write_checksums(include_manifest=False)

    verified_at = datetime.now(timezone.utc).isoformat()
    manifest = make_release_manifest(
        build_info,
        declared_manifest,
        verified_at=verified_at,
        file_count=file_count,
        total_bytes=total_bytes,
    )
    (ROOT / MANIFEST_FILE).write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    # Regenerate checksums including the manifest but never the checksum file itself.
    write_checksums()

    print("[3/4] zip", flush=True)
    if OUT.exists():
        OUT.unlink()
    with zipfile.ZipFile(OUT, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path, relative in files_for_release(include_manifest=True, include_checksum=True):
            archive.write(path, (Path(ROOT.name) / relative).as_posix())

    print("[4/4] archive verification", flush=True)
    with zipfile.ZipFile(OUT, "r") as archive:
        bad = archive.testzip()
        if bad:
            raise RuntimeError(f"Corrupt ZIP entry: {bad}")
        verify_archive_checksums(archive)
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
