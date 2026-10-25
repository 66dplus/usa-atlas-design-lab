import json
from pathlib import Path
import tempfile
import unittest
from contextlib import redirect_stdout
import io
import os
from types import SimpleNamespace
from unittest.mock import patch

from scripts.run_release_regressions import browser_env, require_footer_failure
from scripts import run_release_regressions as runner
from scripts.runtime_conformance import (
    ARCHIVED_A, CAPABILITIES, CORE_CASES, ARCHIVED_INDEX_PATHS, ARCHIVED_INDEX_METADATA,
)


class ReleaseRegressionRunnerTests(unittest.TestCase):
    def test_positive_clears_ambient_suite_bypasses_and_negative_is_narrow(self):
        ambient = {
            "ATLAS_TEST_WIDTH": "390", "ATLAS_TEST_HEIGHT": "844",
            "ATLAS_TEST_THEME": "dark", "ATLAS_TEST_SKIP_RETRY": "1",
            "ATLAS_TEST_MUTATION": "legacy-footer", "ATLAS_BEFORE_URL": "http://unrelated.invalid", "ATLAS_TEST_URL": "http://127.0.0.1:4321",
        }
        with tempfile.TemporaryDirectory() as temp:
            positive = browser_env(ambient, Path(temp) / "positive")
            self.assertEqual(positive["ATLAS_TEST_URL"], ambient["ATLAS_TEST_URL"])
            for name in ("ATLAS_TEST_WIDTH", "ATLAS_TEST_HEIGHT", "ATLAS_TEST_THEME",
                         "ATLAS_TEST_SKIP_RETRY", "ATLAS_TEST_MUTATION", "ATLAS_BEFORE_URL"):
                self.assertNotIn(name, positive)
            negative = browser_env(ambient, Path(temp) / "negative", mutation="legacy-footer", filtered=True)
            self.assertEqual(negative["ATLAS_TEST_WIDTH"], "1440")
            self.assertEqual(negative["ATLAS_TEST_THEME"], "light")
            self.assertEqual(negative["ATLAS_TEST_MUTATION"], "legacy-footer")
            self.assertNotIn("ATLAS_TEST_HEIGHT", negative)
            self.assertNotIn("ATLAS_TEST_SKIP_RETRY", negative)

    def test_negative_proof_requires_report_and_expected_failure_marker(self):
        class Result:
            returncode = 1
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "results.json"
            with self.assertRaises(SystemExit):
                require_footer_failure(Result(), path)
            path.write_text(json.dumps({"failures": [{"message": "different assertion failed"}]}))
            with self.assertRaises(SystemExit):
                require_footer_failure(Result(), path)
            path.write_text(json.dumps({"failures": [{"message": "comparison footer stays inside the pane instead of covering the viewport"}]}))
            self.assertTrue(require_footer_failure(Result(), path)["failures"])

    def run_pipeline(self, *, archived=False, fail_studio=False):
        """Mock browser execution only; inspect the actual orchestrator's decisions."""
        calls = []
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / 'execution'
            output.mkdir()
            report_path = Path(temp) / 'report.json'
            build = {'release': 'candidate', 'sourceCommit': 'a'*40,
                     'frontendFramework': 'react-typescript', 'conformanceCapabilities': CAPABILITIES}
            raw = json.dumps(build).encode()
            observation = runner.observe_runtime(raw)
            if archived:
                build.update(release=ARCHIVED_A['releaseId'], sourceCommit=ARCHIVED_A['sourceCommit'])
                observation = (build, {'identity': {key: ARCHIVED_A[key] for key in
                    ('releaseId', 'sourceCommit', 'buildSha256', 'imageDigest')},
                    'profile': ARCHIVED_A['profile'], 'supplements': {name: {
                        'applicable': False, 'reason': 'Exact pinned archived fixture'}
                        for name in ('react-ui', 'studio')}})

            def execute(command, **kwargs):
                env = kwargs['env']
                name = Path(command[-1]).name
                mutation = env.get('ATLAS_TEST_MUTATION')
                calls.append((name, mutation))
                destination = Path(env['ATLAS_TEST_OUTPUT'])
                destination.mkdir(parents=True, exist_ok=True)
                if mutation:
                    evidence = {'failures': [{'message': runner.FAILURE_MARKER}]}
                elif name == 'check-release-regressions.mjs':
                    evidence = {'pass': True, 'checks': [{'name': case, 'pass': True} for case in CORE_CASES]}
                else:
                    evidence = {'status': 'fail' if fail_studio and name == 'check-studio-react.mjs' else 'pass',
                                'checks': [{} for _ in range(8)]}
                (destination / 'results.json').write_text(json.dumps(evidence))
                return SimpleNamespace(returncode=1 if mutation or evidence.get('status') == 'fail' else 0,
                                       stdout='', stderr='')

            assets = {'status': 'pass', 'count': ARCHIVED_A['publicAssetCount'],
                      'staticAssetCount': ARCHIVED_A['staticAssetCount'],
                      'manifestSha256': ARCHIVED_A['publicAssetManifestSha256'],
                      'dynamicIndexes': [
                          {'path': path, **ARCHIVED_INDEX_METADATA} for path in ARCHIVED_INDEX_PATHS]}
            with patch.dict(os.environ, {'ATLAS_TEST_URL': 'http://fixture',
                    'ATLAS_CONFORMANCE_REPORT': str(report_path)}, clear=True), \
                    patch.object(runner, 'read_runtime', return_value=raw), \
                    patch.object(runner, 'observe_runtime', return_value=observation), \
                    patch.object(runner, 'archived_public_assets', return_value=assets), \
                    patch.object(runner.tempfile, 'mkdtemp', return_value=str(output)), \
                    patch.object(runner.subprocess, 'run', side_effect=execute), redirect_stdout(io.StringIO()):
                if fail_studio:
                    with self.assertRaises(ValueError):
                        runner.main()
                else:
                    self.assertEqual(runner.main(), 0)
            return calls, json.loads(report_path.read_text())

    def test_complete_candidate_executes_core_and_both_native_suites(self):
        calls, report = self.run_pipeline()
        self.assertEqual(len(calls), 6)
        self.assertEqual(report['core']['cases'], CORE_CASES)
        self.assertTrue(all(item['status'] == 'pass' for item in report['supplements'].values()))
        self.assertEqual(calls[-1], ('check-release-regressions.mjs', 'legacy-footer'))

    def test_native_failure_cannot_skip_http_or_negative_core_or_mint_pass(self):
        calls, report = self.run_pipeline(fail_studio=True)
        self.assertEqual(report['status'], 'fail')
        self.assertEqual(report['supplements']['studio']['status'], 'fail')
        self.assertIn(('check-http-seo.mjs', None), calls)
        self.assertEqual(report['core']['negativeFooter'], 'expected_failure')

    def test_archived_applicability_keeps_complete_core_without_false_feature_pass(self):
        calls, report = self.run_pipeline(archived=True)
        self.assertEqual(len(calls), 4)
        self.assertEqual(report['core']['cases'], CORE_CASES)
        self.assertTrue(all(item['status'] == 'not_applicable' for item in report['supplements'].values()))
        self.assertIn(('check-webgl-ui.mjs', None), calls)
        self.assertIn(('check-http-seo.mjs', None), calls)
        self.assertEqual(calls[-1], ('check-release-regressions.mjs', 'legacy-footer'))


if __name__ == "__main__":
    unittest.main()
