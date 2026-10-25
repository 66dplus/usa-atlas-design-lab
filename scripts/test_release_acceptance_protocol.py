from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import tempfile
import unittest
from argparse import Namespace

from scripts.check_release_acceptance import bind_test_target, build_receipt
from scripts.release_workflow import ReleaseError, verify_receipt


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

if __name__ == "__main__":
    unittest.main()
