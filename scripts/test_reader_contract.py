import json
from pathlib import Path
import shutil
import tempfile
import unittest

from check_reader_contract import ROOT, REQUIRED_SCHEMA, check_artifacts, incompatible_schema


class ReaderContractLockTests(unittest.TestCase):
    def test_published_producer_bundle_matches_lock_and_preserves_admission(self):
        self.assertEqual(check_artifacts(), [])

    def test_mutated_fixture_is_rejected_by_its_pinned_hash(self):
        with tempfile.TemporaryDirectory(prefix="reader-contract-mutated-") as temp:
            copy = Path(temp) / "repo"
            copy.mkdir()
            shutil.copytree(ROOT / "contracts", copy / "contracts")
            fixture = copy / "contracts/reader/v1/fixtures/reader-fixture.sql"
            fixture.write_text(fixture.read_text() + "\n-- altered fixture\n")
            self.assertIn("artifact hash mismatch: fixtures/reader-fixture.sql", check_artifacts(copy))

    def test_candidate_or_unpinned_producer_revision_is_rejected(self):
        with tempfile.TemporaryDirectory(prefix="reader-contract-candidate-") as temp:
            copy = Path(temp) / "repo"
            copy.mkdir()
            shutil.copytree(ROOT / "contracts", copy / "contracts")
            lock_path = copy / "contracts/reader-contract.lock.json"
            lock = json.loads(lock_path.read_text())
            lock["sourceCommit"] = "a" * 40
            lock_path.write_text(json.dumps(lock))
            self.assertIn("reader lock sourceCommit is not pinned to the published producer tag",
                          check_artifacts(copy))

    def test_incompatible_database_column_type_is_rejected(self):
        incompatible = set(REQUIRED_SCHEMA)
        incompatible.remove(("observation", "value", "double precision", ""))
        incompatible.add(("observation", "value", "text", ""))
        self.assertEqual(incompatible_schema(incompatible),
                         ["required reader schema column or type is missing"])


if __name__ == "__main__":
    unittest.main()
