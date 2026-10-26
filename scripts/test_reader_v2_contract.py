import unittest
from unittest.mock import patch

from scripts import check_reader_v2_contract as check


class ReaderV2ConsumerExportTests(unittest.TestCase):
    def test_frozen_contract_and_exact_consumer_export_verify(self):
        lock, contract, artifacts = check.pinned_bundle()
        self.assertEqual(lock['sourceCommit'], check.FROZEN_PRODUCER_COMMIT)
        self.assertEqual(lock['producerTag'], check.FROZEN_PRODUCER_TAG)
        self.assertNotIn('sourcePinStatus', lock)
        self.assertEqual(lock['contractSha256'],check.EXPECTED_PRODUCER_CONTRACT_SHA256)
        self.assertEqual(lock['schemaFingerprint'],check.EXPECTED_SCHEMA_FINGERPRINT)
        self.assertEqual(set(artifacts),set(check.CONSUMER_EXPORT.values()))
        self.assertEqual(contract['contract_id'],'usa_atlas.application_reader')
        self.assertEqual(len(contract['artifact_sha256']),30)
        self.assertNotIn('admission.py',artifacts)
        self.assertNotIn('load_local_review.py',artifacts)

    def test_export_rejects_unapproved_producer_or_local_paths(self):
        lock, _, _ = check.pinned_bundle()
        with patch.object(check,'LOCK') as lock_path:
            lock_path.read_bytes.return_value = __import__('json').dumps({
                **lock,'consumerExport':{**check.CONSUMER_EXPORT,
                    'database/reader/v2/admission.py':'admission.py'}}).encode()
            with self.assertRaisesRegex(ValueError,'exact allowlist'):
                check.pinned_bundle()

    def test_export_rejects_missing_mandatory_admission_filter(self):
        lock, _, _ = check.pinned_bundle()
        with patch.object(check,'LOCK') as lock_path:
            lock_path.read_bytes.return_value = __import__('json').dumps({**lock,'admissionFilter':check.PASS_FILTER}).encode()
            with self.assertRaisesRegex(ValueError,'admitted batches'):
                check.pinned_bundle()

    def test_export_rejects_pending_or_unaccepted_producer_pin(self):
        lock, _, _ = check.pinned_bundle()
        for changes in (
            {'sourceCommit': 'cfe51d44364ead0addf800dd663096c7bc8867d8'},
            {'sourcePinStatus': 'awaiting-accepted-producer-tag'},
            {'producerTag': 'reader-contract-v2.0.0-rc1'},
        ):
            with self.subTest(changes=changes), patch.object(check, 'LOCK') as lock_path:
                lock_path.read_bytes.return_value = __import__('json').dumps({**lock, **changes}).encode()
                with self.assertRaisesRegex(ValueError, 'lock is incomplete'):
                    check.pinned_bundle()


if __name__ == '__main__':
    unittest.main()
