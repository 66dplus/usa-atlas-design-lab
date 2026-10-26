import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from scripts import check_reader_v2_contract as check


def sha(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


class ReaderV2BundleTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='atlas-reader-v2-contract-test-')
        self.root = Path(self.temp.name)
        self.artifact_root = self.root / 'reader-v2'
        self.artifact_root.mkdir()
        objects = {name: {'id': 'text'} for name in check.REQUIRED_OBJECTS}
        basis = json.dumps(objects, sort_keys=True, separators=(',', ':')).encode()
        self.contract = {
            'version': '2.0.0', 'read_only': True,
            'admission_filter': check.PASS_FILTER,
            'additional_reader_filter': check.ADMITTED_FILTER,
            'schema_fingerprint': sha(basis), 'objects': objects,
            'artifact_sha256': {},
        }
        schema_raw = b'CREATE SCHEMA usa_atlas;\n'
        (self.artifact_root / 'schema.sql').write_bytes(schema_raw)
        self.contract['artifact_sha256'] = {'schema.sql': sha(schema_raw)}
        contract_raw = json.dumps(self.contract, sort_keys=True).encode() + b'\n'
        (self.artifact_root / 'contract.json').write_bytes(contract_raw)
        lock = {
            'format': 'usa_atlas_reader_lock', 'contractVersion': '2.0.0',
            'sourceCommit': 'a' * 40, 'contractSha256': sha(contract_raw),
            'schemaFingerprint': self.contract['schema_fingerprint'], 'readOnly': True,
            'admissionFilter': check.FULL_FILTER,
            'artifacts': {'schema.sql': sha(schema_raw)},
        }
        self.lock_path = self.root / 'reader-v2-lock.json'
        self.lock_path.write_text(json.dumps(lock, sort_keys=True) + '\n')

    def tearDown(self):
        self.temp.cleanup()

    def test_separate_v2_lock_binds_contract_filter_schema_and_artifact(self):
        with patch.object(check, 'LOCK', self.lock_path), patch.object(check, 'ARTIFACT_ROOT', self.artifact_root):
            lock, contract, artifacts = check.pinned_bundle()
        self.assertEqual(lock['contractVersion'], '2.0.0')
        self.assertEqual(contract['additional_reader_filter'], check.ADMITTED_FILTER)
        self.assertEqual(artifacts['schema.sql'], sha((self.artifact_root / 'schema.sql').read_bytes()))

    def test_v2_lock_rejects_missing_admitted_batch_filter(self):
        lock = json.loads(self.lock_path.read_text())
        lock['admissionFilter'] = check.PASS_FILTER
        self.lock_path.write_text(json.dumps(lock))
        with patch.object(check, 'LOCK', self.lock_path), patch.object(check, 'ARTIFACT_ROOT', self.artifact_root):
            with self.assertRaisesRegex(ValueError, 'admitted batches'):
                check.pinned_bundle()


if __name__ == '__main__':
    unittest.main()
