#!/usr/bin/env python3
"""Run mandatory checks against one staged identity and write a bound receipt."""

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
OUT_ROOT = Path(tempfile.gettempdir()) / "usa-xray-release-acceptance"
POLICY_PATH = ROOT / "ops/acceptance-policy.json"


def run(command, *, env, cwd=ROOT, timeout=1800):
    try:
        result = subprocess.run(command, cwd=cwd, env=env, text=True, capture_output=True, timeout=timeout)
        return {"command": [str(part) for part in command], "exitCode": result.returncode,
                "stdout": result.stdout[-12000:], "stderr": result.stderr[-12000:]}
    except (OSError, subprocess.TimeoutExpired) as error:
        return {"command": [str(part) for part in command], "exitCode": 1, "error": str(error)}


def read_url(url):
    with urlopen(url, timeout=20) as response:
        if response.status != 200:
            raise RuntimeError(f"HTTP {response.status} from staged endpoint")
        return response.read()


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def bind_test_target(env, base_url):
    """Make policy subprocesses exercise the runtime whose identity was observed."""
    env["ATLAS_TEST_URL"] = base_url


def sha(data):
    return hashlib.sha256(data).hexdigest()


def verify_package(package: Path, *, release_id: str, source_commit: str, build_sha256: str,
                   lock_sha256: str, schema_fingerprint: str):
    errors = []
    build_path = package / "ux/build.json"
    manifest_path = package / "preview-assets.json"
    try:
        raw = build_path.read_bytes()
        build = json.loads(raw)
        manifest = json.loads(manifest_path.read_text())
    except (OSError, json.JSONDecodeError) as error:
        return None, None, [f"package is missing valid build metadata or preview asset manifest: {error}"]
    if sha(raw) != build_sha256:
        errors.append("raw package ux/build.json SHA-256 differs from the expected build hash")
    if build.get("release") != release_id:
        errors.append("package release ID differs from the requested release ID")
    if build.get("sourceCommit") != source_commit:
        errors.append("package source commit is absent or differs from the requested source commit")
    if build.get("readerLockSha256") != lock_sha256:
        errors.append("package reader lock hash differs from the reviewed lock")
    if build.get("readerSchemaFingerprint") != schema_fingerprint:
        errors.append("package schema fingerprint differs from the reviewed lock")
    if not isinstance(manifest, dict) or not manifest:
        errors.append("package asset manifest is empty or invalid")
    else:
        for url_path, relative in manifest.items():
            if (not isinstance(url_path, str) or not url_path.startswith("/") or
                    not isinstance(relative, str) or ".." in Path(relative).parts):
                errors.append(f"invalid package asset mapping: {url_path!r}")
                continue
            path = (package / relative).resolve()
            if not path.is_relative_to(package.resolve()) or not path.is_file() or path.is_symlink():
                errors.append(f"missing or unsafe packaged asset: {relative}")
    for section in ("sourceSha256", "assetSha256", "dataContractSha256"):
        values = build.get(section)
        if not isinstance(values, dict) or not values:
            errors.append(f"build metadata has no {section} bindings")
            continue
        for relative, expected in values.items():
            path = (package / relative).resolve()
            if not path.is_relative_to(package.resolve()) or not path.is_file():
                errors.append(f"missing build-bound input: {relative}")
                continue
            if sha(path.read_bytes()) != expected:
                errors.append(f"build-bound input hash mismatch: {relative}")
    return build, sha(raw), errors


def build_receipt(*, args, lock_sha, schema_fingerprint, policy, checks, failures,
                  successful, evidence_directory, tested_at, operation_baseline=None,
                  runtime_release_id=None):
    receipt = {
        "format": "usa_atlas_release_acceptance",
        "releaseId": args.release_id,
        "operation": args.operation,
        "status": "pass" if not failures else "fail",
        "testedAt": tested_at,
        "suiteIdentity": policy.get("suiteIdentity", ""),
        "mandatorySuccessfulCheckIDs": sorted(set(successful)),
        "testedImageDigest": args.image_digest,
        "buildSha256": args.build_sha256,
        "sourceCommit": args.source_commit,
        "readerLockSha256": lock_sha,
        "readerSchemaFingerprint": schema_fingerprint,
        "runtimeReleaseId": runtime_release_id or args.release_id,
        "checks": checks,
        "failures": failures,
        "evidenceDirectory": str(evidence_directory),
    }
    if args.operation == "rollback" and isinstance(operation_baseline, dict):
        receipt["operationBaselineContainerId"] = operation_baseline.get("containerId")
        receipt["operationBaselineBuildSha256"] = operation_baseline.get("buildSha256")
    return receipt


def terminate(server):
    if not server or server.poll() is not None:
        return
    server.terminate()
    try:
        server.wait(timeout=5)
    except subprocess.TimeoutExpired:
        server.kill()
        server.wait(timeout=5)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument("--staged-url", help="staged URL for the isolated candidate runtime")
    target.add_argument("--package", type=Path, help="unpacked candidate package built for this release")
    parser.add_argument("--release-id", required=True)
    parser.add_argument("--operation", choices=("activate", "rollback"), required=True)
    parser.add_argument("--image-digest", required=True)
    parser.add_argument("--build-sha256", required=True)
    parser.add_argument("--source-commit", required=True)
    parser.add_argument("--reader-lock", type=Path, required=True)
    parser.add_argument("--stage-evidence", type=Path, required=True,
                        help="immutable backend stage record binding image, build, source and reader contract")
    parser.add_argument("--rollback-baseline", type=Path,
                        help="required for rollback: baseline container/image/build binding")
    parser.add_argument("--receipt", type=Path, help="receipt destination (defaults to unique /tmp path)")
    args = parser.parse_args()

    if not re.fullmatch(r"[A-Za-z0-9._-]{1,100}", args.release_id):
        parser.error("--release-id must be a bounded identifier")
    if not re.fullmatch(r"sha256:[0-9a-f]{64}", args.image_digest):
        parser.error("--image-digest must be sha256 followed by 64 lowercase hex characters")
    if not re.fullmatch(r"[0-9a-f]{64}", args.build_sha256):
        parser.error("--build-sha256 must contain 64 lowercase hex characters")
    if not re.fullmatch(r"[0-9a-f]{40}", args.source_commit):
        parser.error("--source-commit must contain 40 lowercase hex characters")
    if not args.reader_lock.is_file() or not args.stage_evidence.is_file():
        parser.error("--reader-lock and --stage-evidence must name existing files")

    started = datetime.now(timezone.utc)
    receipt_path = args.receipt or OUT_ROOT / f"receipt-{args.release_id}-{args.build_sha256[:12]}-{started.strftime('%Y%m%dT%H%M%S%fZ')}.json"
    if receipt_path.exists():
        parser.error("receipt destination already exists; acceptance receipts are immutable")
    receipt_path.parent.mkdir(parents=True, exist_ok=True)
    OUT_ROOT.mkdir(parents=True, exist_ok=True)
    workdir = Path(tempfile.mkdtemp(prefix="acceptance-", dir=OUT_ROOT))
    env = os.environ.copy()
    env["ATLAS_TEST_OUTPUT"] = str(workdir / "browser")
    env["ATLAS_TEST_BROWSER"] = "chrome"
    env.setdefault("PLAYWRIGHT_MODULE", "playwright")
    env["ATLAS_DISABLE_SECRET_FILE"] = "1"
    failures, checks, successful = [], {}, []
    server = None
    base_url = args.staged_url.rstrip("/") if args.staged_url else None
    lock = {}
    try:
        try:
            lock_raw = args.reader_lock.read_bytes()
            lock = json.loads(lock_raw)
            stage = json.loads(args.stage_evidence.read_text())
            policy = json.loads(POLICY_PATH.read_text())
            lock_sha = sha(lock_raw)
            schema_fingerprint = lock["schemaFingerprint"]
            canonical_lock_sha = sha((ROOT / "contracts/reader-contract.lock.json").read_bytes())
            if lock_sha != canonical_lock_sha:
                failures.append("candidate reader lock is not byte-identical to the reviewed application lock")
        except (OSError, json.JSONDecodeError, KeyError) as error:
            failures.append(f"reader lock, acceptance policy, or stage record is invalid: {error}")
            lock_sha, schema_fingerprint, stage, policy = "", "", {}, {"suiteIdentity": "", "checks": []}
        # The backend stage record is required proof that the tested URL resolves to
        # this immutable image/build. CLI values alone can never mint a passing receipt.
        # Consume the exact release coordinator record. The backend verified
        # container identity is nested under stageVerifiedIdentity; CLI values
        # only compare with the record and never supply missing evidence.
        if not isinstance(stage, dict):
            stage = {}
            failures.append("stage evidence must be a release coordinator JSON object")
        stage_verified = stage.get("stageVerifiedIdentity")
        stage_identity = stage.get("stageIdentity")
        if args.operation == "activate":
            if not isinstance(stage_identity, dict):
                stage_identity = {}
                failures.append("stage evidence has no backend stageIdentity object")
            stage_expected = {
                "releaseId": args.release_id, "operation": args.operation,
                "testedImageDigest": args.image_digest, "runtimeBuildSha256": args.build_sha256,
                "sourceCommit": args.source_commit, "readerLockSha256": lock_sha,
                "readerSchemaFingerprint": schema_fingerprint,
            }
        else:
            stage_expected = {
                "releaseId": args.release_id, "operation": args.operation,
                "testedImageDigest": args.image_digest, "buildSha256": args.build_sha256,
            }
            try:
                baseline = json.loads(args.rollback_baseline.read_text())
            except (AttributeError, OSError, json.JSONDecodeError):
                baseline = None
                failures.append("rollback baseline binding is invalid")
            if (not isinstance(baseline, dict) or
                    stage.get("rollbackBaseline") != {
                        "containerId": baseline.get("containerId"),
                        "imageDigest": baseline.get("imageDigest"),
                        "buildSha256": baseline.get("buildSha256"),
                        "sourceCommit": baseline.get("sourceCommit"),
                    }):
                failures.append("rollback stage evidence is not bound to the supplied operation baseline")
            if not isinstance(stage.get("containerId"), str) or not stage.get("containerId"):
                failures.append("rollback stage evidence has no backend test container identity")
            runtime_release_id = stage.get("targetRelease")
            if (not isinstance(runtime_release_id, str) or not runtime_release_id or
                    stage.get("runtimeReleaseId") != runtime_release_id):
                failures.append("rollback stage evidence has no consistent target runtime release identity")
            if stage.get("sourceCommit") != args.source_commit:
                failures.append("rollback stage source commit does not match the requested archived runtime")
            rollback_identity = stage.get("stageIdentity")
            rollback_verified = stage.get("stageVerifiedIdentity")
            if not isinstance(rollback_identity, dict) or not isinstance(rollback_verified, dict):
                failures.append("rollback stage evidence has no backend-verified runtime identity")
            else:
                identity_expected = {
                    "containerId": stage.get("containerId"), "imageId": args.image_digest,
                    "releaseId": args.release_id, "runtimeReleaseId": runtime_release_id,
                    "runtimeBuildSha256": args.build_sha256, "sourceCommit": args.source_commit,
                }
                for key, expected in identity_expected.items():
                    if rollback_identity.get(key) != expected:
                        failures.append(f"rollback stage identity {key} does not match the requested runtime")
                verified_expected = {
                    "containerId": stage.get("containerId"), "imageId": args.image_digest,
                    "status": "running", "releaseId": args.release_id,
                    "runtimeReleaseId": runtime_release_id,
                    "buildSha256": args.build_sha256, "sourceCommit": args.source_commit,
                }
                for key, expected in verified_expected.items():
                    if rollback_verified.get(key) != expected:
                        failures.append(f"backend rollback stage verification {key} does not match the requested runtime")
        stage_expected.update({"readerLockSha256": lock_sha,
                               "readerSchemaFingerprint": schema_fingerprint})
        for key, expected in stage_expected.items():
            if stage.get(key) != expected:
                failures.append(f"stage evidence {key} does not match the requested candidate")
        if args.operation == "activate" and not isinstance(stage_verified, dict):
            failures.append("stage evidence has no backend-verified stageVerifiedIdentity record")
        elif args.operation == "activate":
            stage_container_id = stage_identity.get("containerId")
            if not isinstance(stage_container_id, str) or not stage_container_id.strip():
                failures.append("backend stage identity has no container identity")
            verified_expected = {
                "containerId": stage_container_id,
                "imageId": args.image_digest, "status": "running",
                "releaseId": args.release_id, "buildSha256": args.build_sha256,
                "sourceCommit": args.source_commit,
            }
            for key, expected in verified_expected.items():
                if stage_verified.get(key) != expected:
                    failures.append(f"backend stageVerifiedIdentity {key} does not match the tested candidate")
            if stage.get("imageDigest") != args.image_digest:
                failures.append("backend stage imageDigest differs from the requested image")
        schema_proof = stage.get("readerSchemaProof") if isinstance(stage, dict) else None
        if not isinstance(schema_proof, dict):
            failures.append("stage evidence has no read-only current-database schema proof")
        else:
            if (schema_proof.get("status") != "pass" or
                    schema_proof.get("queryReadOnly") is not True or
                    schema_proof.get("schemaFingerprint") != schema_fingerprint or
                    schema_proof.get("source") != "stage.database-schema-readonly"):
                failures.append("read-only current-database schema proof does not match the pinned reader contract")
            try:
                proof_time = datetime.fromisoformat(schema_proof["checkedAt"].replace("Z", "+00:00"))
                if (proof_time.tzinfo is None or proof_time > started or
                        (started - proof_time).total_seconds() > 15 * 60):
                    raise ValueError("stale or future schema proof")
            except (KeyError, TypeError, ValueError, AttributeError):
                failures.append("read-only current-database schema proof timestamp is missing, stale, or invalid")
            stage_build_sha = stage.get("runtimeBuildSha256", stage.get("buildSha256"))
            proof_container_id = (stage_identity.get("containerId") if args.operation == "activate"
                                  else stage.get("containerId"))
            if not isinstance(proof_container_id, str) or not proof_container_id.strip():
                failures.append("staged runtime has no backend container identity for schema proof binding")
            proof_container = schema_proof.get("containerId")
            if not isinstance(proof_container, str) or not proof_container.strip():
                failures.append("read-only current-database schema proof has no backend container identity")
            proof_expected = {
                "containerId": proof_container_id,
                "imageDigest": args.image_digest,
                "buildSha256": stage_build_sha,
                "readerLockSha256": lock_sha,
            }
            for key, expected in proof_expected.items():
                if schema_proof.get(key) != expected:
                    failures.append(f"read-only current-database schema proof {key} does not match staged runtime identity")
        source_object = subprocess.run(["git", "-C", str(ROOT), "cat-file", "-e", f"{args.source_commit}^{{commit}}"],
                                       capture_output=True, text=True, timeout=15)
        if source_object.returncode:
            failures.append("requested source commit is not present as an immutable Git commit in the application checkout")
        if lock.get("sourceCommit") != "b405bfdf473614beea49dd5126a843a916168f7d":
            failures.append("reader lock source is not the merged producer contract commit")
        if args.operation == "rollback":
            if not args.rollback_baseline or not args.rollback_baseline.is_file():
                failures.append("rollback operation requires an immutable baseline container/build binding")
            else:
                try:
                    baseline = json.loads(args.rollback_baseline.read_text())
                    stage_baseline = stage.get("rollbackBaseline")
                    required_baseline = {"containerId", "imageDigest", "buildSha256", "sourceCommit"}
                    if not isinstance(baseline, dict) or not required_baseline <= baseline.keys() or stage_baseline != baseline:
                        failures.append("rollback stage identity does not match the supplied baseline container/build binding")
                except (OSError, json.JSONDecodeError):
                    failures.append("rollback baseline binding is invalid")
        if policy.get("suiteIdentity") != "usa-atlas-application-acceptance-v1":
            failures.append("application acceptance policy has an unexpected suite identity")

        if args.package:
            package = args.package.resolve()
            if not package.is_dir():
                failures.append("candidate package directory does not exist")
            else:
                build, observed_sha, package_errors = verify_package(
                    package, release_id=args.release_id, source_commit=args.source_commit,
                    build_sha256=args.build_sha256, lock_sha256=lock_sha,
                    schema_fingerprint=schema_fingerprint)
                checks["packageManifest"] = {"exitCode": 1 if package_errors else 0,
                                             "buildSha256": observed_sha, "errors": package_errors}
                if package_errors:
                    failures.extend(package_errors)
                port = free_port()
                env["ATLAS_TEST_OUTPUT"] = str(workdir / "browser")
                server = subprocess.Popen([sys.executable, str(package / "scripts/preview_server.py"),
                                           "--host", "127.0.0.1", "--port", str(port)],
                                          cwd=package, env=env, stdout=subprocess.DEVNULL,
                                          stderr=subprocess.DEVNULL)
                base_url = f"http://127.0.0.1:{port}"

        try:
            deadline = time.monotonic() + 45
            raw_build = None
            while time.monotonic() < deadline:
                if server and server.poll() is not None:
                    raise RuntimeError("candidate package runtime exited before readiness")
                try:
                    raw_build = read_url(base_url + "/ux/build.json")
                    break
                except (OSError, URLError, HTTPError):
                    time.sleep(0.5)
            if raw_build is None:
                raise RuntimeError("candidate staged runtime did not serve /ux/build.json")
            build = json.loads(raw_build)
            actual_build_sha = sha(raw_build)
            if actual_build_sha != args.build_sha256 or stage.get("runtimeBuildSha256") != actual_build_sha:
                raise RuntimeError("actual staged raw /ux/build.json bytes do not match the expected build and stage record")
            expected_runtime_release = (stage.get("targetRelease") if args.operation == "rollback"
                                        else args.release_id)
            if build.get("release") != expected_runtime_release or build.get("sourceCommit") != args.source_commit:
                raise RuntimeError("staged runtime release/source binding differs from the requested candidate")
            if build.get("readerLockSha256") != lock_sha or build.get("readerSchemaFingerprint") != schema_fingerprint:
                raise RuntimeError("staged runtime reader contract differs from the reviewed lock")
            checks["stagedBuildIdentity"] = {"exitCode": 0, "runtimeBuildSha256": actual_build_sha,
                                             "releaseId": build["release"], "sourceCommit": build["sourceCommit"]}
            successful.append("application.staged-build-identity")
            catalog = json.loads(read_url(base_url + "/api/atlas/catalog"))
            if not isinstance(catalog, dict) or not isinstance(catalog.get("metrics"), list) or not catalog["metrics"]:
                raise RuntimeError("staged catalog response does not contain published metrics")
            query = "/api/atlas/observations?field=03.06%3Aunemployment_rate"
            observations = json.loads(read_url(base_url + query))
            if observations.get("fieldId") != "03.06:unemployment_rate" or not isinstance(observations.get("observations"), list):
                raise RuntimeError("staged observation API did not return the requested published series")
            checks["stagedRuntimeApi"] = {"exitCode": 0, "catalogMetrics": len(catalog["metrics"]),
                                          "fieldId": observations["fieldId"]}
            successful.append("application.staged-runtime-api")
        except (OSError, URLError, HTTPError, json.JSONDecodeError, RuntimeError) as error:
            failures.append(f"staged build or API identity check failed: {error}")
            checks["stagedRuntimeApi"] = {"exitCode": 1, "error": str(error)}

        required = policy.get("checks", [])
        if not isinstance(required, list) or not required:
            failures.append("acceptance policy does not enumerate mandatory checks")
            required = []
        bind_test_target(env, base_url)
        for check in required:
            check_id, command = check.get("id"), check.get("command")
            if not isinstance(check_id, str) or not isinstance(command, list) or not command:
                failures.append("acceptance policy contains an invalid mandatory check")
                continue
            result = run([part.replace("{python}", sys.executable) for part in command], env=env,
                         timeout=int(check.get("timeoutSeconds", 1800)))
            checks[check_id] = result
            if result["exitCode"]:
                failures.append(f"mandatory acceptance check failed: {check_id}")
            else:
                successful.append(check_id)
        expected_ids = set(policy.get("mandatoryCheckIDs", []))
        if set(successful) != expected_ids:
            failures.append("executed successful check IDs do not exactly match mandatory acceptance policy")
        if not args.staged_url and not args.package:
            failures.append("no staged application runtime was tested")
    finally:
        terminate(server)

    tested_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    receipt = build_receipt(args=args, lock_sha=lock_sha, schema_fingerprint=schema_fingerprint,
                            policy=policy, checks=checks, failures=failures, successful=successful,
                            evidence_directory=workdir, tested_at=tested_at,
                            operation_baseline=baseline if args.operation == "rollback" else None,
                            runtime_release_id=(stage.get("targetRelease") if args.operation == "rollback"
                                                else args.release_id))
    receipt_path.write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps({"status": receipt["status"], "receipt": str(receipt_path), "failures": failures}, indent=2))
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
