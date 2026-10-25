#!/usr/bin/env python3
"""Verify a built package against the recovered 2026-10-25 runtime inputs."""

import argparse
import hashlib
import json
from pathlib import Path
import sys


EVIDENCE = (
    Path(__file__).resolve().parents[1]
    / "docs/releases/20261025-mobile-indicator-674e5b8"
)


def required_files():
    manifest = json.loads((EVIDENCE / "public-build.json").read_text())
    provenance = json.loads((EVIDENCE / "provenance.json").read_text())
    expected = {}
    for section in ("sourceSha256", "assetSha256", "dataContractSha256"):
        expected.update(manifest[section])
    expected.update(provenance["additionalRequiredInputs"])
    return expected


def verify(package: Path) -> list[str]:
    package = package.resolve()
    failures = []
    expected = required_files()
    for relative, digest in sorted(expected.items()):
        path = (package / relative).resolve()
        if not path.is_relative_to(package):
            failures.append(f"invalid required path: {relative}")
            continue
        try:
            actual = hashlib.sha256(path.read_bytes()).hexdigest()
        except OSError:
            failures.append(f"missing required file: {relative}")
            continue
        if actual != digest:
            failures.append(f"hash mismatch: {relative} (expected {digest}, got {actual})")
    return failures


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Verify recovered runtime input hashes in a built package."
    )
    parser.add_argument("package", type=Path, help="package root directory to verify")
    args = parser.parse_args()
    if not args.package.is_dir():
        parser.error(f"package directory does not exist: {args.package}")
    failures = verify(args.package)
    if failures:
        print("Recovered runtime verification failed:", file=sys.stderr)
        for failure in failures:
            print(f"- {failure}", file=sys.stderr)
        return 1
    print(f"Recovered runtime verification passed: {len(required_files())} required files checked.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
