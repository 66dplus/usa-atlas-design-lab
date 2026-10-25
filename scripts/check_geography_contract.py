#!/usr/bin/env python3
"""Verify the application geography contract against vendored boundary inputs."""

import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
CONTRACT_PATH = ROOT / "contracts/geography/boundaries.json"


def check() -> list[str]:
    contract = json.loads(CONTRACT_PATH.read_text())
    expected = {
        contract["vendor"]["path"]: contract["vendor"]["sha256"],
        contract["countyBoundaryRepair"]["path"]: contract["countyBoundaryRepair"]["sha256"],
        **{item["path"]: item["sha256"] for item in contract["stateBoundaryFiles"].values()},
    }
    failures = []
    for relative, digest in sorted(expected.items()):
        path = (ROOT / relative).resolve()
        if not path.is_relative_to(ROOT.resolve()):
            failures.append(f"invalid geography path: {relative}")
            continue
        try:
            actual = hashlib.sha256(path.read_bytes()).hexdigest()
        except OSError:
            failures.append(f"missing geography input: {relative}")
            continue
        if actual != digest:
            failures.append(f"geography hash mismatch: {relative}")
    manifest = ROOT / "ux/boundaries/manifest.json"
    actual_manifest = hashlib.sha256(manifest.read_bytes()).hexdigest()
    if actual_manifest != contract["boundaryManifestSha256"]:
        failures.append("boundary manifest hash mismatch")
    if len(contract["stateBoundaryFiles"]) != 51:
        failures.append("expected 51 source boundary files (50 states plus DC)")
    return failures


if __name__ == "__main__":
    failures = check()
    if failures:
        print("Geography contract check failed:", file=sys.stderr)
        for failure in failures:
            print(f"- {failure}", file=sys.stderr)
        raise SystemExit(1)
    print("Geography contract boundary hashes passed.")
