import contextlib
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from scripts import run_ci_browser


class ReadyResponse:
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False


class RunningServer:
    def __init__(self):
        self.returncode = None
        self.terminated = False

    def poll(self):
        return self.returncode

    def terminate(self):
        self.terminated = True
        self.returncode = 0

    def wait(self, timeout=None):
        return self.returncode


class CiBrowserRunnerTests(unittest.TestCase):
    def invoke(self, suite=None, returncodes=(0, 0)):
        with tempfile.TemporaryDirectory() as root_name:
            root = Path(root_name)
            package = root / "package"
            entrypoint = package / "scripts/preview_server.py"
            entrypoint.parent.mkdir(parents=True)
            entrypoint.write_text("# packaged preview server fixture\n")
            temporary = root / "temporary"
            temporary.mkdir()
            server = RunningServer()
            calls = []
            process = SimpleNamespace(index=0)

            def run(command, **kwargs):
                calls.append((command, kwargs))
                code = returncodes[process.index]
                process.index += 1
                return SimpleNamespace(returncode=code)

            environ = {
                "PGHOST": "127.0.0.1",
                "PGPORT": "5432",
                "PGUSER": "atlas_reader",
                "PGPASSWORD": "atlas-ci-only-reader",
                "PGDATABASE": "usa_atlas",
                "REQUIRE_POSTGRES": "1",
                "ATLAS_CI_READER_PASSWORD": "atlas-ci-only-reader",
            }
            argv = [str(package)]
            if suite is not None:
                argv = ["--suite", suite, *argv]
            with patch.dict(os.environ, environ, clear=True), \
                    patch.object(run_ci_browser.subprocess, "Popen", return_value=server) as popen, \
                    patch.object(run_ci_browser.subprocess, "run", side_effect=run), \
                    patch.object(run_ci_browser, "urlopen", return_value=ReadyResponse()), \
                    patch.object(run_ci_browser.tempfile, "mkdtemp", return_value=str(temporary)), \
                    contextlib.redirect_stdout(io.StringIO()) as stdout:
                result = run_ci_browser.main(argv)

            self.assertTrue(server.terminated)
            self.assertEqual(popen.call_args.args[0][1], str(entrypoint.resolve()))
            return result, calls, json.loads(stdout.getvalue())

    def test_default_keeps_both_complete_suites_in_the_original_order(self):
        result, calls, report = self.invoke()
        self.assertEqual(result, 0)
        self.assertEqual([call[0] for call in calls], [
            [sys.executable, "scripts/run_release_regressions.py"],
            ["node", "ux/check-post-react-ui-fixes.mjs"],
        ])
        required_env = calls[0][1]["env"]
        focused_env = calls[1][1]["env"]
        self.assertEqual(required_env["PGUSER"], "atlas_reader")
        self.assertEqual(required_env["PGPASSWORD"], "atlas-ci-only-reader")
        self.assertEqual(required_env["REQUIRE_POSTGRES"], "1")
        self.assertEqual(required_env["ATLAS_READER_V2_MODE"], "admitted")
        self.assertEqual(required_env["PLAYWRIGHT_MODULE"], "playwright")
        self.assertNotIn("ATLAS_PACKAGE_ROOT", required_env)
        self.assertEqual(
            Path(focused_env["ATLAS_PACKAGE_ROOT"]).resolve(),
            (Path(calls[0][1]["env"]["ATLAS_TEST_OUTPUT"]).parent.parent / "package").resolve(),
        )
        self.assertEqual(focused_env["ATLAS_TEST_RACE_AVAILABILITY_FIXTURE"], "1")
        self.assertEqual(report["requiredExitCode"], 0)
        self.assertEqual(report["postReactUiExitCode"], 0)
        self.assertTrue(report["postReactUiFixtureOverride"])

    def test_each_ci_suite_can_run_alone_and_preserves_its_exit_status(self):
        result, calls, report = self.invoke("release-regressions", (17,))
        self.assertEqual(result, 17)
        self.assertEqual([call[0] for call in calls], [[sys.executable, "scripts/run_release_regressions.py"]])
        self.assertIsNone(report["postReactUiExitCode"])
        self.assertFalse(report["postReactUiFixtureOverride"])

        result, calls, report = self.invoke("post-react-ui", (9,))
        self.assertEqual(result, 9)
        self.assertEqual([call[0] for call in calls], [["node", "ux/check-post-react-ui-fixes.mjs"]])
        self.assertIsNone(report["requiredExitCode"])
        self.assertEqual(calls[0][1]["env"]["ATLAS_TEST_RACE_AVAILABILITY_FIXTURE"], "1")
        self.assertTrue(report["postReactUiFixtureOverride"])

    def test_default_still_runs_the_focused_suite_after_a_regression_failure(self):
        result, calls, report = self.invoke(returncodes=(5, 7))
        self.assertEqual(result, 5)
        self.assertEqual(len(calls), 2)
        self.assertEqual(report["requiredExitCode"], 5)
        self.assertEqual(report["postReactUiExitCode"], 7)


if __name__ == "__main__":
    unittest.main()
