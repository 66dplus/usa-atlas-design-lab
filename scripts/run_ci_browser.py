#!/usr/bin/env python3
"""Run the required Chrome suite against the packaged preview runtime on a temporary port."""

import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
from urllib.error import URLError
from urllib.request import urlopen


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: run_ci_browser.py PACKAGE_DIR")
    package = Path(sys.argv[1]).resolve()
    entrypoint = package / "scripts/preview_server.py"
    if not package.is_dir() or not entrypoint.is_file():
        raise SystemExit("Packaged runtime entrypoint is missing: scripts/preview_server.py")
    temporary = Path(tempfile.mkdtemp(prefix="usa-atlas-ci-browser-", dir=tempfile.gettempdir()))
    feedback = temporary / "feedback"
    feedback.mkdir()
    output = temporary / "browser"
    port = free_port()
    env = os.environ.copy()
    env.update({"ATLAS_TEST_URL": f"http://127.0.0.1:{port}",
                "ATLAS_TEST_BROWSER": "chrome", "ATLAS_TEST_OUTPUT": str(output),
                "PGAPPNAME": "usa_atlas_ci_runtime", "PLAYWRIGHT_MODULE": "playwright"})
    server = subprocess.Popen([sys.executable, str(entrypoint), "--host", "127.0.0.1", "--port", str(port),
                               "--reports-dir", str(temporary / "private-reports")],
                              cwd=package, env=env, stdout=subprocess.DEVNULL,
                              stderr=subprocess.DEVNULL)
    try:
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            if server.poll() is not None:
                raise SystemExit("Packaged application runtime exited before readiness.")
            try:
                with urlopen(env["ATLAS_TEST_URL"] + "/ux/build.json", timeout=2) as response:
                    if response.status == 200:
                        break
            except (OSError, URLError):
                time.sleep(0.5)
        else:
            raise SystemExit("Packaged application runtime did not become ready.")
        source = Path(__file__).resolve().parents[1]
        required = subprocess.run([sys.executable, "scripts/run_release_regressions.py"], cwd=source, env=env)
        focused_env = env.copy()
        focused_env.update({"ATLAS_PACKAGE_ROOT": str(package), "ATLAS_TEST_OUTPUT": str(temporary / "post-react-ui"),
                            "ATLAS_TEST_RACE_AVAILABILITY_FIXTURE": "1"})
        focused = subprocess.run(["node", "ux/check-post-react-ui-fixes.mjs"], cwd=source, env=focused_env)
        print(json.dumps({"suite": "packaged-browser-regressions", "requiredExitCode": required.returncode,
                          "postReactUiExitCode": focused.returncode, "postReactUiFixtureOverride": True,
                          "package": str(package),
                          "runtimeUrl": env["ATLAS_TEST_URL"], "feedbackDirectory": str(feedback),
                          "requiredArtifacts": str(output), "postReactUiArtifacts": focused_env["ATLAS_TEST_OUTPUT"]}, indent=2))
        return required.returncode or focused.returncode
    finally:
        if server.poll() is None:
            server.terminate()
            try:
                server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait(timeout=5)


if __name__ == "__main__":
    raise SystemExit(main())
