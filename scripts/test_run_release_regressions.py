import json
from pathlib import Path
import tempfile
import unittest

from scripts.run_release_regressions import browser_env, require_footer_failure


class ReleaseRegressionRunnerTests(unittest.TestCase):
    def test_positive_clears_ambient_suite_bypasses_and_negative_is_narrow(self):
        ambient = {
            "ATLAS_TEST_WIDTH": "390", "ATLAS_TEST_HEIGHT": "844",
            "ATLAS_TEST_THEME": "dark", "ATLAS_TEST_SKIP_RETRY": "1",
            "ATLAS_TEST_MUTATION": "legacy-footer", "ATLAS_TEST_URL": "http://127.0.0.1:4321",
        }
        with tempfile.TemporaryDirectory() as temp:
            positive = browser_env(ambient, Path(temp) / "positive")
            self.assertEqual(positive["ATLAS_TEST_URL"], ambient["ATLAS_TEST_URL"])
            for name in ("ATLAS_TEST_WIDTH", "ATLAS_TEST_HEIGHT", "ATLAS_TEST_THEME",
                         "ATLAS_TEST_SKIP_RETRY", "ATLAS_TEST_MUTATION"):
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


if __name__ == "__main__":
    unittest.main()
