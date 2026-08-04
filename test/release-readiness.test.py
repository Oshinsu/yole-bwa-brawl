#!/usr/bin/env python3
from __future__ import annotations

import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import release  # noqa: E402


def read_json(relative: str) -> dict:
    return json.loads((ROOT / relative).read_text(encoding="utf-8"))


class ReleaseReadinessTests(unittest.TestCase):
    def test_release_uses_platform_npm_launcher(self):
        expected = "npm.cmd" if sys.platform == "win32" else "npm"
        self.assertEqual(release.NPM_COMMAND, expected)

    def setUp(self) -> None:
        self.build_info = read_json("BUILD_INFO.json")
        self.manifest = read_json("release-manifest.json")

    def errors(self, build_info: dict | None = None, manifest: dict | None = None) -> list[str]:
        return release.release_readiness_errors(
            build_info if build_info is not None else self.build_info,
            manifest if manifest is not None else self.manifest,
        )

    def test_current_owner_attestation_is_publishable_but_not_evidence_verified(self) -> None:
        self.assertEqual(self.errors(), [])
        audio = self.build_info["audioRights"]
        authorization = self.manifest["releaseAuthorization"]
        self.assertEqual(audio["status"], "owner-attested")
        self.assertTrue(audio["ownerAttested"])
        self.assertFalse(audio["evidenceArchived"])
        self.assertFalse(audio["rightsVerified"])
        self.assertEqual(authorization["documentaryEvidence"], "not-provided")
        self.assertFalse(authorization["independentVerification"])
        self.assertEqual(authorization["authorizerIdentityEvidence"], "not-provided")

    def test_blocked_or_malformed_manifest_is_never_publishable(self) -> None:
        cases = {
            "status": ("releaseStatus", "candidate-blocked"),
            "blocker": ("blockers", ["droits à revoir"]),
            "missing blockers": ("blockers", None),
            "string blockers": ("blockers", ""),
        }
        for label, (field, value) in cases.items():
            with self.subTest(label=label):
                manifest = copy.deepcopy(self.manifest)
                if label == "missing blockers":
                    manifest.pop(field)
                else:
                    manifest[field] = value
                self.assertTrue(self.errors(manifest=manifest))

    def test_owner_attestation_requires_complete_honest_scope(self) -> None:
        mutations = {
            "scope absent": ("manifest", ("releaseAuthorization", "scope"), None),
            "invalid date": ("manifest", ("releaseAuthorization", "authorizedAt"), "2026-99-99"),
            "role absent": ("manifest", ("releaseAuthorization", "authorizedByRole"), None),
            "identity evidence invented": (
                "manifest",
                ("releaseAuthorization", "authorizerIdentityEvidence"),
                "verified",
            ),
            "documentary evidence invented": (
                "manifest",
                ("releaseAuthorization", "documentaryEvidence"),
                "archived",
            ),
            "independent verification invented": (
                "manifest",
                ("releaseAuthorization", "independentVerification"),
                True,
            ),
            "commercial scope absent": (
                "manifest",
                ("releaseAuthorization", "commercialDistributionIncluded"),
                None,
            ),
            "build register absent": ("build", ("audioRights", "register"), None),
            "manifest register absent": (
                "manifest",
                ("releaseAuthorization", "register"),
                None,
            ),
            "zero audio counts": ("build", ("audioRights", "musicFiles"), 0),
            "wrong authorized counts": (
                "manifest",
                ("releaseAuthorization", "audioFiles"),
                {"musicFiles": 7, "sampledEffectFiles": 15},
            ),
            "version mismatch": ("manifest", ("version",), "3.1.9"),
            "title mismatch": ("manifest", ("title",), "Un autre jeu"),
        }
        for label, (target, keys, value) in mutations.items():
            with self.subTest(label=label):
                build_info = copy.deepcopy(self.build_info)
                manifest = copy.deepcopy(self.manifest)
                subject = build_info if target == "build" else manifest
                for key in keys[:-1]:
                    subject = subject[key]
                if value is None:
                    subject.pop(keys[-1], None)
                else:
                    subject[keys[-1]] = value
                self.assertTrue(self.errors(build_info, manifest))

    def test_evidence_verified_cannot_reuse_owner_attested_disclaimers(self) -> None:
        build_info = copy.deepcopy(self.build_info)
        manifest = copy.deepcopy(self.manifest)
        audio = build_info["audioRights"]
        authorization = manifest["releaseAuthorization"]
        audio.update({
            "status": "evidence-verified",
            "evidenceArchived": True,
            "rightsVerified": True,
        })
        authorization["status"] = "evidence-verified"

        errors = self.errors(build_info, manifest)
        self.assertTrue(any("documentaryEvidence=archived" in error for error in errors))
        self.assertTrue(any("vérification indépendante" in error for error in errors))

        authorization["documentaryEvidence"] = "archived"
        authorization["independentVerification"] = True
        self.assertEqual(self.errors(build_info, manifest), [])

    def test_audio_register_must_match_exact_distributed_paths(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "zik").mkdir()
            (root / "assets" / "audio").mkdir(parents=True)
            (root / "zik" / "track.mp3").write_bytes(b"music")
            (root / "assets" / "audio" / "effect.mp3").write_bytes(b"effect")
            (root / "AUDIO_RIGHTS.md").write_text(
                "| `zik/track.mp3` |\n| `assets/audio/effect.mp3` |\n",
                encoding="utf-8",
            )
            audio = {"musicFiles": 1, "sampledEffectFiles": 1}
            with mock.patch.object(release, "ROOT", root):
                self.assertEqual(release.audio_inventory_errors(audio), [])
                (root / "assets" / "audio" / "rogue.MP3").write_bytes(b"rogue")
                errors = release.audio_inventory_errors(audio)
            self.assertTrue(any("rogue.MP3" in error for error in errors))

    def test_release_manifest_builder_preserves_authorization(self) -> None:
        built = release.make_release_manifest(
            self.build_info,
            self.manifest,
            verified_at="2026-07-30T20:00:00+00:00",
            file_count=123,
            total_bytes=456,
        )
        self.assertEqual(built["releaseAuthorization"], self.manifest["releaseAuthorization"])
        self.assertIsNot(built["releaseAuthorization"], self.manifest["releaseAuthorization"])
        self.assertEqual(
            release.release_readiness_errors(self.build_info, built),
            [],
        )

    def test_readiness_cli_is_read_only(self) -> None:
        watched = [
            ROOT / "BUILD_INFO.json",
            ROOT / "release-manifest.json",
            ROOT / "AUDIO_RIGHTS.md",
            ROOT / ".github" / "workflows" / "pages.yml",
        ]
        before = {path: path.read_bytes() for path in watched}
        result = subprocess.run(
            [sys.executable, "-B", "tools/release.py", "--check-readiness"],
            cwd=ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["audioRightsStatus"], "owner-attested")
        self.assertFalse(payload["evidenceArchived"])
        self.assertFalse(payload["rightsVerified"])
        self.assertEqual(before, {path: path.read_bytes() for path in watched})

    def test_pages_checks_readiness_again_immediately_before_upload(self) -> None:
        workflow = (ROOT / ".github" / "workflows" / "pages.yml").read_text(encoding="utf-8")
        gate = "python tools/release.py --check-readiness"
        positions = [
            index
            for index in range(len(workflow))
            if workflow.startswith(gate, index)
        ]
        self.assertEqual(len(positions), 2)
        self.assertLess(positions[0], workflow.index("npm test"))
        self.assertGreater(positions[1], workflow.index("Préparer uniquement les fichiers publics"))
        self.assertLess(positions[1], workflow.index("actions/upload-pages-artifact@v3"))
        self.assertLess(positions[1], workflow.index("actions/deploy-pages@v4"))
        self.assertNotIn("continue-on-error: true", workflow)
        self.assertNotIn("if: always()", workflow)
        for public_surface in ("legal.css", "privacy.html", "support.html", "credits.html"):
            self.assertIn(public_surface, workflow)

    def test_railway_deploy_is_also_guarded_before_and_after_verification(self) -> None:
        package = read_json("package.json")
        command = package["scripts"]["deploy:railway"]
        gate = "python -B tools/release.py --check-readiness"
        self.assertEqual(command.count(gate), 2)
        self.assertLess(command.find(gate), command.find("npm run verify"))
        self.assertGreater(command.rfind(gate), command.find("npm run verify"))
        railway_up = "npx --yes @railway/cli@5.30.4 up"
        self.assertEqual(command.count(railway_up), 1)
        self.assertLess(command.rfind(gate), command.find(railway_up))


if __name__ == "__main__":
    unittest.main(verbosity=2)
