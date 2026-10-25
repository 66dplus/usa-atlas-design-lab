#!/usr/bin/env python3
from __future__ import annotations
"""Run the real Chrome suite and prove its comparison-footer regression detector fires."""

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "ux/check-release-regressions.mjs"
FAILURE_MARKER = "comparison footer stays inside the pane instead of covering the viewport"
FILTER_VARIABLES = ("ATLAS_TEST_WIDTH", "ATLAS_TEST_HEIGHT", "ATLAS_TEST_THEME",
                    "ATLAS_TEST_SKIP_RETRY", "ATLAS_TEST_MUTATION", "ATLAS_BEFORE_URL")


def browser_env(env, output: Path, *, mutation: str | None = None, filtered: bool = False):
    run_env = dict(env)
    for name in FILTER_VARIABLES:
        run_env.pop(name, None)
    run_env.update({"ATLAS_TEST_OUTPUT": str(output), "ATLAS_TEST_BROWSER": "chrome",
                    "ATLAS_DISABLE_SECRET_FILE": "1"})
    if mutation:
        run_env["ATLAS_TEST_MUTATION"] = mutation
    if filtered:
        run_env.update({"ATLAS_TEST_WIDTH": "1440", "ATLAS_TEST_THEME": "light"})
    return run_env


def execute(env, output: Path, mutation: str | None = None):
    run_env = browser_env(env, output, mutation=mutation, filtered=bool(mutation))
    return subprocess.run(["node", str(SCRIPT)], cwd=ROOT, env=run_env,
                          capture_output=True, text=True, timeout=3600)


def require_footer_failure(result, evidence_path: Path):
    try:
        evidence = json.loads(evidence_path.read_text())
    except (OSError, json.JSONDecodeError) as error:
        raise SystemExit(f"footer mutation did not produce machine-readable evidence: {error}")
    if result.returncode == 0 or not any(FAILURE_MARKER in item.get("message", "")
                                         for item in evidence.get("failures", [])):
        raise SystemExit("negative Chrome mutation did not fail at the expected footer-overlap assertion")
    return evidence


def main():
    env = os.environ.copy()
    if not env.get("ATLAS_TEST_URL"):
        raise SystemExit("ATLAS_TEST_URL must point to the isolated staged application runtime.")
    output = Path(tempfile.mkdtemp(prefix="usa-atlas-release-regression-evidence-", dir=tempfile.gettempdir()))
    positive = execute(env, output / "positive")
    print(positive.stdout, end="")
    if positive.stderr:
        print(positive.stderr, file=sys.stderr, end="")
    if positive.returncode:
        raise SystemExit(positive.returncode)
    webgl_env = browser_env(env, output / "webgl")
    webgl_env["ATLAS_TEST_OUTPUT"] = str(output / "webgl")
    webgl = subprocess.run(["node", str(ROOT / "ux/check-webgl-ui.mjs")], cwd=ROOT,
                           env=webgl_env, capture_output=True, text=True, timeout=900)
    print(webgl.stdout, end="")
    if webgl.stderr:
        print(webgl.stderr, file=sys.stderr, end="")
    if webgl.returncode:
        raise SystemExit(webgl.returncode)
    # Exercise native React ownership and the shipped editor against this same
    # runtime. These are full matrices; no ambient viewport filters are retained.
    for name, script in (("react-ui", "check-react-ui.mjs"),
                         ("studio", "check-studio-react.mjs"),
                         ("http-seo", "check-http-seo.mjs")):
        native = subprocess.run(["node", str(ROOT / "ux" / script)], cwd=ROOT,
                                env=browser_env(env, output / name),
                                capture_output=True, text=True, timeout=900)
        print(native.stdout, end="")
        if native.stderr:
            print(native.stderr, file=sys.stderr, end="")
        if native.returncode:
            raise SystemExit(native.returncode)
    mutation = execute(env, output / "negative-footer", "legacy-footer")
    negative_result = output / "negative-footer/results.json"
    evidence = require_footer_failure(mutation, negative_result)
    print(json.dumps({"suite": "release-regressions", "positiveExitCode": positive.returncode,
                      "webglExitCode": webgl.returncode,
                      "negativeMutationExitCode": mutation.returncode,
                      "negativeMutation": "legacy-footer", "evidence": str(output)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
