from datetime import datetime, timedelta, timezone
import contextlib
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from argparse import Namespace
from unittest.mock import patch

from scripts import check_release_acceptance
from scripts.check_release_acceptance import bind_test_target, build_receipt
from scripts.release_workflow import ReleaseError, verify_receipt
from scripts.test_runtime_conformance import passing_report


ROOT = Path(__file__).resolve().parents[1]
POLICY = json.loads((ROOT / "ops/acceptance-policy.json").read_text())
MANDATORY = POLICY["mandatoryCheckIDs"]
LOCK = ROOT / "contracts/reader-contract.lock.json"


class AcceptanceProtocolTests(unittest.TestCase):
    def test_policy_subprocess_target_overwrites_ambient_url(self):
        for observed_url in ("https://stage.example.test", "http://127.0.0.1:43210"):
            with self.subTest(observed_url=observed_url):
                env = {"ATLAS_TEST_URL": "https://attacker.example.test"}
                bind_test_target(env, observed_url)
                self.assertEqual(env["ATLAS_TEST_URL"], observed_url)

    def test_runner_commit_requires_clean_checkout(self):
        with tempfile.TemporaryDirectory() as directory:
            subprocess.run(["git", "init", "-q", directory], check=True)
            subprocess.run(["git", "-C", directory, "-c", "user.name=Test", "-c",
                            "user.email=test@example.test", "commit", "--allow-empty", "-qm", "base"], check=True)
            self.assertRegex(check_release_acceptance.runner_commit(Path(directory)), r"^[0-9a-f]{40}$")
            (Path(directory) / "dirty.txt").write_text("uncommitted\n")
            with self.assertRaisesRegex(RuntimeError, "checkout is dirty"):
                check_release_acceptance.runner_commit(Path(directory))

    def integration_fixture(self, directory, operation="activate"):
        lock = json.loads(LOCK.read_text())
        lock_sha = hashlib.sha256(LOCK.read_bytes()).hexdigest()
        source_commit = subprocess.run(
            ["git", "-C", str(ROOT), "rev-parse", "HEAD"],
            capture_output=True, text=True, check=True,
        ).stdout.strip()
        release_id = "releaseB"
        runtime_release = "releaseA" if operation == "rollback" else release_id
        image_digest = "sha256:" + "1" * 64
        build = {"release": runtime_release, "sourceCommit": source_commit,
                 "readerLockSha256": lock_sha,
                 "readerSchemaFingerprint": lock["schemaFingerprint"]}
        build_raw = json.dumps(build, separators=(",", ":")).encode()
        build_sha = hashlib.sha256(build_raw).hexdigest()
        container_id = "staged-container-" + operation
        now = datetime.now(timezone.utc).isoformat()
        stage = {
            "releaseId": release_id, "operation": operation,
            "testedImageDigest": image_digest, "imageDigest": image_digest,
            "runtimeBuildSha256": build_sha, "buildSha256": build_sha,
            "sourceCommit": source_commit, "readerLockSha256": lock_sha,
            "readerSchemaFingerprint": lock["schemaFingerprint"],
            "stageIdentity": {"containerId": container_id, "imageId": image_digest,
                              "buildSha256": build_sha, "releaseId": release_id,
                              "runtimeReleaseId": runtime_release,
                              "runtimeBuildSha256": build_sha,
                              "sourceCommit": source_commit},
            "stageVerifiedIdentity": {"containerId": container_id, "imageId": image_digest,
                                      "status": "running", "releaseId": release_id,
                                      "buildSha256": build_sha, "sourceCommit": source_commit},
            "readerSchemaProof": {"containerId": container_id, "imageDigest": image_digest,
                                  "buildSha256": build_sha, "readerLockSha256": lock_sha,
                                  "schemaFingerprint": lock["schemaFingerprint"],
                                  "status": "pass", "queryReadOnly": True,
                                  "source": "stage.database-schema-readonly", "checkedAt": now},
        }
        argv = ["check_release_acceptance.py", "--staged-url", "https://stage.example.test",
                "--release-id", release_id, "--operation", operation,
                "--image-digest", image_digest, "--build-sha256", build_sha,
                "--source-commit", source_commit, "--reader-lock", str(LOCK)]
        stage_path = Path(directory) / "stage.json"
        stage_path.write_text(json.dumps(stage))
        argv.extend(["--stage-evidence", str(stage_path)])
        if operation == "rollback":
            baseline = {"containerId": "baseline-container", "imageDigest": "sha256:" + "4" * 64,
                        "buildSha256": "5" * 64, "sourceCommit": "6" * 40}
            stage["targetRelease"] = runtime_release
            stage["runtimeReleaseId"] = runtime_release
            stage["containerId"] = container_id
            stage["rollbackBaseline"] = baseline
            stage["stageIdentity"].update({"containerId": container_id})
            stage["stageVerifiedIdentity"].update({"containerId": container_id,
                                                     "runtimeReleaseId": runtime_release})
            stage["stageVerifiedIdentity"]["buildSha256"] = build_sha
            stage["stageIdentity"]["imageId"] = image_digest
            baseline_path = Path(directory) / "baseline.json"
            baseline_path.write_text(json.dumps(baseline))
            argv.extend(["--rollback-baseline", str(baseline_path)])
            stage_path.write_text(json.dumps(stage))
        receipt_path = Path(directory) / "receipt.json"
        argv.extend(["--receipt", str(receipt_path)])
        return argv, stage, build_raw, receipt_path, release_id, image_digest, build_sha, source_commit

    def run_main_with_evidence(self, directory, operation="activate", mutate=None, runner_commits=None, mutate_conformance=None):
        (argv, stage, build_raw, receipt_path, release_id, image_digest,
         build_sha, source_commit) = self.integration_fixture(directory, operation)
        if mutate:
            mutate(stage)
            Path(argv[argv.index("--stage-evidence") + 1]).write_text(json.dumps(stage))

        def read_url(url):
            if url.endswith("/ux/build.json"):
                return build_raw
            if url.endswith("/api/atlas/catalog"):
                return json.dumps({"metrics": [{"id": "metric"}]}).encode()
            return json.dumps({"fieldId": "03.06:unemployment_rate", "observations": []}).encode()

        def successful_check(command, **kwargs):
            if 'scripts/run_release_regressions.py' in command:
                path = Path(kwargs['env']['ATLAS_CONFORMANCE_REPORT'])
                report=passing_report(build_sha, source_commit, stage.get('targetRelease', release_id), image_digest)
                if mutate_conformance: mutate_conformance(report)
                path.write_text(json.dumps(report))
            return {"command": command, "exitCode": 0, "stdout": "", "stderr": ""}

        output = io.StringIO()
        real_subprocess_run = subprocess.run
        def git_provenance(command, **kwargs):
            if command[:2] == ["git", "-C"] and command[2] == str(ROOT):
                return real_subprocess_run(command, **kwargs)
            return Namespace(returncode=0, stdout="", stderr="")

        with patch.object(sys, "argv", argv), \
             patch.object(check_release_acceptance, "runner_commit",
                          side_effect=runner_commits or [source_commit, source_commit]), \
             patch.object(check_release_acceptance, "read_url", side_effect=read_url), \
             patch.object(check_release_acceptance, "run", side_effect=successful_check), \
             patch.object(check_release_acceptance.subprocess, "run",
                          side_effect=git_provenance), \
             contextlib.redirect_stdout(output):
            result = check_release_acceptance.main()
        receipt = json.loads(receipt_path.read_text())
        return result, receipt, release_id, image_digest, build_sha, source_commit

    def assert_main_receipt_passes(self, result, receipt, release_id, image_digest, build_sha,
                                   source_commit, operation, runtime_release_id=None):
        self.assertEqual(result, 0)
        self.assertEqual(receipt["status"], "pass", receipt["failures"])
        verify_receipt(receipt, LOCK, release_id=release_id, operation=operation,
                       image_digest=image_digest, build_sha=build_sha,
                       source_commit=source_commit,
                       started_at=(datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat(),
                       suite_identity=POLICY["suiteIdentity"], mandatory_checks=MANDATORY,
                       vendored_artifact="contracts/reader/v1/contract.json",
                       runtime_release_id=runtime_release_id)

    def test_main_rejects_zero_exit_browser_without_complete_conformance(self):
        with tempfile.TemporaryDirectory() as directory:
            result, receipt, *_ = self.run_main_with_evidence(directory,
                mutate_conformance=lambda report:report['core'].pop('negativeFooter'))
            self.assertEqual(result,1)
            self.assertTrue(any('conformance' in error for error in receipt['failures']))

    def test_current_candidate_receipt_cannot_mark_new_checks_not_applicable(self):
        args,receipt=self.runner_receipt('activate')
        receipt['checks']['runtimeConformance']['supplements']['studio'].update(applicable=False,status='not_applicable')
        with self.assertRaisesRegex(ReleaseError,'conformance evidence invalid'):
            verify_receipt(receipt,LOCK,release_id=args.release_id,operation='activate',
                image_digest=args.image_digest,build_sha=args.build_sha256,source_commit=args.source_commit,
                started_at=(datetime.now(timezone.utc)-timedelta(seconds=1)).isoformat(),
                suite_identity=POLICY['suiteIdentity'],mandatory_checks=MANDATORY,
                vendored_artifact='contracts/reader/v1/contract.json')

    def test_main_accepts_coordinator_shaped_activation_evidence(self):
        with tempfile.TemporaryDirectory() as directory:
            result, receipt, release_id, image_digest, build_sha, source_commit = \
                self.run_main_with_evidence(directory)
            self.assert_main_receipt_passes(result, receipt, release_id, image_digest,
                                            build_sha, source_commit, "activate")

    def test_main_rejects_wrong_activation_stage_container_id(self):
        with tempfile.TemporaryDirectory() as directory:
            result, receipt, *_ = self.run_main_with_evidence(
                directory, mutate=lambda stage: stage["stageIdentity"].update(
                    containerId="different-staged-container"))
            self.assertEqual(result, 1)
            self.assertEqual(receipt["status"], "fail")
            self.assertTrue(any("stageVerifiedIdentity containerId" in failure
                                for failure in receipt["failures"]))

    def test_main_fails_receipt_when_runner_head_changes_during_checks(self):
        with tempfile.TemporaryDirectory() as directory:
            current = subprocess.run(["git", "-C", str(ROOT), "rev-parse", "HEAD"],
                                     capture_output=True, text=True, check=True).stdout.strip()
            result, receipt, *_ = self.run_main_with_evidence(
                directory, runner_commits=[current, "f" * 40])
            self.assertEqual(result, 1)
            self.assertEqual(receipt["status"], "fail")
            self.assertTrue(any("HEAD changed" in failure for failure in receipt["failures"]))

    def test_main_fails_receipt_for_dirty_runner_checkout(self):
        with tempfile.TemporaryDirectory() as directory:
            result, receipt, *_ = self.run_main_with_evidence(
                directory, runner_commits=[RuntimeError("acceptance runner checkout is dirty"),
                                           RuntimeError("acceptance runner checkout is dirty")])
            self.assertEqual(result, 1)
            self.assertEqual(receipt["status"], "fail")
            self.assertIsNone(receipt["acceptanceSourceCommit"])
            self.assertTrue(any("checkout is dirty" in failure for failure in receipt["failures"]))

    def test_runner_can_mint_clean_proposed_merge_receipt_without_main_lookup(self):
        with tempfile.TemporaryDirectory() as directory:
            proposed_merge = "f" * 40
            result, receipt, *_ = self.run_main_with_evidence(
                directory, runner_commits=[proposed_merge, proposed_merge])
            self.assertEqual(result, 0)
            self.assertEqual(receipt["status"], "pass")
            self.assertEqual(receipt["acceptanceSourceCommit"], proposed_merge)

    def test_main_rejects_missing_activation_stage_container_id(self):
        with tempfile.TemporaryDirectory() as directory:
            result, receipt, *_ = self.run_main_with_evidence(
                directory, mutate=lambda stage: stage["stageIdentity"].pop("containerId"))
            self.assertEqual(result, 1)
            self.assertEqual(receipt["status"], "fail")
            self.assertTrue(any("stage identity has no container identity" in failure
                                for failure in receipt["failures"]))

    def test_main_rejects_missing_schema_proof_container_id(self):
        with tempfile.TemporaryDirectory() as directory:
            result, receipt, *_ = self.run_main_with_evidence(
                directory, mutate=lambda stage: stage["readerSchemaProof"].pop("containerId"))
            self.assertEqual(result, 1)
            self.assertEqual(receipt["status"], "fail")
            self.assertTrue(any("schema proof has no backend container identity" in failure
                                for failure in receipt["failures"]))

    def test_main_rejects_wrong_activation_schema_proof_container_id(self):
        with tempfile.TemporaryDirectory() as directory:
            result, receipt, *_ = self.run_main_with_evidence(
                directory, mutate=lambda stage: stage["readerSchemaProof"].update(
                    containerId="different-staged-container"))
            self.assertEqual(result, 1)
            self.assertEqual(receipt["status"], "fail")
            self.assertTrue(any("schema proof containerId does not match staged runtime identity" in failure
                                for failure in receipt["failures"]))

    def test_main_preserves_rollback_top_level_container_binding(self):
        with tempfile.TemporaryDirectory() as directory:
            result, receipt, release_id, image_digest, build_sha, source_commit = \
                self.run_main_with_evidence(directory, operation="rollback")
            self.assert_main_receipt_passes(result, receipt, release_id, image_digest,
                                            build_sha, source_commit, "rollback",
                                            runtime_release_id="releaseA")
            self.assertEqual(receipt["operationBaselineContainerId"], "baseline-container")

    def test_main_rejects_wrong_rollback_top_level_container_id(self):
        with tempfile.TemporaryDirectory() as directory:
            result, receipt, *_ = self.run_main_with_evidence(
                directory, operation="rollback",
                mutate=lambda stage: stage.update(containerId="different-staged-container"))
            self.assertEqual(result, 1)
            self.assertEqual(receipt["status"], "fail")
            self.assertTrue(any("rollback stage identity containerId does not match" in failure
                                for failure in receipt["failures"]))

    def runner_receipt(self, operation):
        runtime_release = "releaseA" if operation == "rollback" else "releaseB"
        args = Namespace(release_id="releaseB", operation=operation,
                         image_digest="sha256:" + "1" * 64,
                         build_sha256="2" * 64, source_commit="3" * 40)
        checks = {
            "stagedBuildIdentity": {"exitCode": 0, "runtimeBuildSha256": args.build_sha256,
                                   "releaseId": runtime_release, "sourceCommit": args.source_commit},
            "stagedRuntimeApi": {"exitCode": 0},
        }
        checks['runtimeConformance'] = passing_report(args.build_sha256, args.source_commit, runtime_release, args.image_digest)
        successful = ["application.staged-build-identity", "application.staged-runtime-api"]
        for check_id in MANDATORY:
            if check_id not in successful:
                checks[check_id] = {"exitCode": 0}
                successful.append(check_id)
        baseline = ({"containerId": "operation-baseline-container", "buildSha256": "4" * 64}
                    if operation == "rollback" else None)
        receipt = build_receipt(
            args=args,
            lock_sha=__import__("hashlib").sha256(LOCK.read_bytes()).hexdigest(),
            schema_fingerprint=json.loads(LOCK.read_text())["schemaFingerprint"],
            policy=POLICY, checks=checks, failures=[], successful=successful,
            evidence_directory=Path(tempfile.gettempdir()) / "protocol-fixture",
            tested_at=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            operation_baseline=baseline, runtime_release_id=runtime_release,
            acceptance_source_commit="a" * 40,
        )
        return args, receipt

    def test_real_runner_receipt_shape_verifies_for_activation(self):
        args, receipt = self.runner_receipt("activate")
        verify_receipt(receipt, LOCK, release_id=args.release_id, operation="activate",
                       image_digest=args.image_digest, build_sha=args.build_sha256,
                       source_commit=args.source_commit,
                       started_at=(datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat(),
                       suite_identity=POLICY["suiteIdentity"], mandatory_checks=MANDATORY,
                       vendored_artifact="contracts/reader/v1/contract.json")

    def test_real_runner_rollback_receipt_keeps_operation_and_runtime_release(self):
        args, receipt = self.runner_receipt("rollback")
        self.assertEqual(receipt["releaseId"], "releaseB")
        self.assertEqual(receipt["runtimeReleaseId"], "releaseA")
        self.assertEqual(receipt["operationBaselineContainerId"], "operation-baseline-container")
        self.assertEqual(receipt["operationBaselineBuildSha256"], "4" * 64)
        verify_receipt(receipt, LOCK, release_id=args.release_id, operation="rollback",
                       image_digest=args.image_digest, build_sha=args.build_sha256,
                       source_commit=args.source_commit,
                       started_at=(datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat(),
                       suite_identity=POLICY["suiteIdentity"], mandatory_checks=MANDATORY,
                       vendored_artifact="contracts/reader/v1/contract.json",
                       runtime_release_id="releaseA")

    def test_verifier_rejects_legacy_receipt_without_runner_provenance(self):
        args, receipt = self.runner_receipt("activate")
        receipt.pop("acceptanceSourceCommit")
        with self.assertRaisesRegex(ReleaseError, "acceptanceSourceCommit"):
            verify_receipt(receipt, LOCK, release_id=args.release_id, operation="activate",
                           image_digest=args.image_digest, build_sha=args.build_sha256,
                           source_commit=args.source_commit,
                           started_at=(datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat(),
                           suite_identity=POLICY["suiteIdentity"], mandatory_checks=MANDATORY,
                           vendored_artifact="contracts/reader/v1/contract.json")

if __name__ == "__main__":
    unittest.main()
