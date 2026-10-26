"""Real file/lock transitions; systemd/Docker/network remain mocked locally."""
import copy
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from scripts import release_workflow as release
from scripts.runtime_conformance import ARCHIVED_A


class PublicRelaySyncTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='relay-sync-')
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name).resolve()
        self.target = root / 'private-existing.py'
        self.old = b'# original generic relay\n'
        self.new = b'# reviewed versioned relay\n'
        self.target.write_bytes(self.old)
        self.target.chmod(0o640)
        (root / 'deploy/public-relay').mkdir(parents=True)
        (root / 'deploy/public-relay/proxy.py').write_bytes(self.new)
        self.config = {'publicRelay': {'sourcePath': str(self.target), 'serviceUnit': 'private-existing.service'},
                       'runtimeUser': '10001:10001', 'primaryAddress': '172.19.0.4',
                       'readerSecretDestination': '/required-reader', 'databaseDestination': '/required-db',
                       'deploymentLockEnv': 'ATLAS_TEST_RELAY_LOCK'}
        self.baseline = {'containerId': 'restored-A', 'buildSha256': ARCHIVED_A['buildSha256'],
                         'imageId': ARCHIVED_A['imageDigest'], 'sourceCommit': ARCHIVED_A['sourceCommit'],
                         'release': ARCHIVED_A['releaseId'], 'readOnlyRoot': True, 'user': '10001:10001',
                         'networkAddress': '172.19.0.4', 'mounts': [
                             {'destination': '/required-reader', 'readOnly': True},
                             {'destination': '/required-db', 'readOnly': True}]}
        for name, value in [('config', self.config), ('policy', {}), ('registry', {'allowedArtifacts': [
            {'buildSha256': ARCHIVED_A['buildSha256'], 'imageDigest': ARCHIVED_A['imageDigest']} ]})]:
            (root / (name + '.json')).write_text(json.dumps(value))
        self.args = SimpleNamespace(config=root/'config.json', policy=root/'policy.json', registry=root/'registry.json',
            state_dir=root/'state', repo=root, id='correction-1', source_commit='a'*40,
            baseline_build_sha=ARCHIVED_A['buildSha256'], expected_preimage_sha256=release.digest(self.old))
        self.backend = SimpleNamespace(live_identity=lambda: copy.deepcopy(self.baseline),
                                      _reject_unapproved_writes=release.DockerBackend._reject_unapproved_writes)
        self.lock = root / 'global.lock'
        patches = [patch.dict(os.environ, {'ATLAS_TEST_RELAY_LOCK': str(self.lock)}),
                   patch.object(release, 'require_clean_checkout', return_value='a'*40),
                   patch.object(release, 'accepted_main', return_value=True),
                   patch.object(release, 'run', return_value=SimpleNamespace(stdout=self.new.decode())),
                   patch.object(release, 'DockerBackend', return_value=self.backend)]
        for item in patches:
            item.start()
            self.addCleanup(item.stop)
        self.restart = patch.object(release, '_restart_public_relay').start()
        self.health = patch.object(release, '_relay_health').start()
        self.addCleanup(patch.stopall)

    def test_atomic_success_backs_up_exact_source_preserves_mode_and_private_locations(self):
        record = release.sync_public_relay(self.args)
        self.assertEqual(record['status'], 'pass')
        self.assertEqual(self.target.read_bytes(), self.new)
        operation = self.args.state_dir/'relay-sync'/self.args.id
        self.assertEqual((operation/'before.py').read_bytes(), self.old)
        self.assertEqual((operation/'before.py').stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.target.stat().st_mode & 0o777, 0o640)
        self.assertEqual(self.restart.call_count, 1)
        self.assertEqual(self.health.call_count, 2)
        self.assertNotIn(str(self.target), json.dumps(record))
        self.assertNotIn('private-existing.service', json.dumps(record))

    def test_restart_failure_restores_prior_bytes_and_restarts_existing_service(self):
        self.restart.side_effect = [OSError('private-existing.service failed'), None]
        with self.assertRaisesRegex(release.ReleaseError, 'prior-source-service-restored') as caught:
            release.sync_public_relay(self.args)
        self.assertEqual(self.target.read_bytes(), self.old)
        self.assertEqual(self.restart.call_count, 2)
        self.assertNotIn('private-existing', str(caught.exception))

    def test_post_sync_health_failure_restores_prior_service_and_health(self):
        self.health.side_effect = [None, OSError('private path'), None]
        with self.assertRaisesRegex(release.ReleaseError, 'prior-source-service-restored'):
            release.sync_public_relay(self.args)
        self.assertEqual(self.target.read_bytes(), self.old)
        self.assertEqual(self.health.call_count, 3)

    def test_failed_restoration_is_honest_and_never_claims_success(self):
        self.restart.side_effect = OSError('private service unavailable')
        with self.assertRaisesRegex(release.ReleaseError, 'restoration-failed'):
            release.sync_public_relay(self.args)
        result = json.loads((self.args.state_dir/'relay-sync'/self.args.id/'result.json').read_text())
        self.assertEqual(result['status'], 'fail')
        self.assertEqual(result['recovery'], 'restoration-failed')

    def test_wrong_preimage_dirty_or_stale_source_never_mutates(self):
        for change in ('preimage', 'dirty', 'stale'):
            with self.subTest(change=change):
                self.args.expected_preimage_sha256 = 'f'*64 if change == 'preimage' else release.digest(self.old)
                with patch.object(release, 'require_clean_checkout', side_effect=release.ReleaseError('dirty') if change=='dirty' else None, return_value='a'*40), \
                     patch.object(release, 'accepted_main', return_value=change!='stale'), \
                     self.assertRaises(release.ReleaseError):
                    release.sync_public_relay(self.args)
                self.assertEqual(self.target.read_bytes(), self.old)
        self.restart.assert_not_called()

    def test_wrong_live_baseline_registry_or_readonly_mount_fails_closed(self):
        for key, value in [('buildSha256', 'f'*64), ('imageId', 'foreign'), ('readOnlyRoot', False), ('user', 'root')]:
            original = self.baseline[key]
            self.baseline[key] = value
            with self.subTest(key=key), self.assertRaises(release.ReleaseError):
                release.sync_public_relay(self.args)
            self.baseline[key] = original
        self.baseline['mounts'][0]['readOnly'] = False
        with self.assertRaises(release.ReleaseError):
            release.sync_public_relay(self.args)
        self.baseline['mounts'][0]['readOnly'] = True
        self.args.registry.write_text('{"allowedArtifacts":[]}')
        with self.assertRaises(release.ReleaseError):
            release.sync_public_relay(self.args)
        self.restart.assert_not_called()

    def test_global_lock_and_existing_operation_record_are_preserved(self):
        with release.deployment_lock(self.lock), self.assertRaises(release.ReleaseError):
            release.sync_public_relay(self.args)
        operation = self.args.state_dir/'relay-sync'/self.args.id
        operation.mkdir(parents=True)
        (operation/'result.json').write_text('immutable-existing-record')
        with self.assertRaises(release.ReleaseError):
            release.sync_public_relay(self.args)
        self.assertEqual((operation/'result.json').read_text(), 'immutable-existing-record')
        self.assertEqual(self.target.read_bytes(), self.old)
        self.restart.assert_not_called()

    def test_unsafe_private_configuration_is_redacted(self):
        for value in ['--arbitrary.service', 'private-existing.service\ncommand', '/private/service']:
            self.config['publicRelay']['serviceUnit'] = value
            self.args.config.write_text(json.dumps(self.config))
            with self.assertRaises(release.ReleaseError) as caught:
                release.sync_public_relay(self.args)
            self.assertNotIn(value, str(caught.exception))
        self.assertEqual(self.target.read_bytes(), self.old)

    def test_changed_live_baseline_or_source_before_replacement_is_rejected(self):
        self.backend.live_identity = iter([copy.deepcopy(self.baseline), {'containerId': 'foreign'}]).__next__
        with self.assertRaisesRegex(release.ReleaseError, 'not-mutated'):
            release.sync_public_relay(self.args)
        self.assertEqual(self.target.read_bytes(), self.old)
        self.restart.assert_not_called()

    def test_revoked_A_and_uncommitted_relay_bytes_are_rejected(self):
        with patch.object(release, 'policy_not_revoked', return_value=False), self.assertRaises(release.ReleaseError):
            release.sync_public_relay(self.args)
        with patch.object(release, 'run', return_value=SimpleNamespace(stdout='foreign')), self.assertRaises(release.ReleaseError):
            release.sync_public_relay(self.args)
        self.assertEqual(self.target.read_bytes(), self.old)
        self.restart.assert_not_called()

    def test_post_rename_fsync_failure_restores_original(self):
        original = release._replace_relay_bytes
        def replace(path, raw, *args):
            original(path, raw, *args)
            if path == self.target and raw == self.new:
                raise OSError('synthetic directory fsync failure after rename')
        with patch.object(release, '_replace_relay_bytes', side_effect=replace), \
                self.assertRaisesRegex(release.ReleaseError, 'prior-source-service-restored'):
            release.sync_public_relay(self.args)
        self.assertEqual(self.target.read_bytes(), self.old)
        self.assertEqual(self.restart.call_count, 1)

    def test_backup_failure_never_replaces_service_source(self):
        with patch.object(release, '_replace_relay_bytes', side_effect=OSError('backup unavailable')), \
                self.assertRaisesRegex(release.ReleaseError, 'not-mutated'):
            release.sync_public_relay(self.args)
        self.assertEqual(self.target.read_bytes(), self.old)
        self.restart.assert_not_called()


class RelayOperatorHelpersTests(unittest.TestCase):
    def test_restart_is_only_two_fixed_argv_operations_and_redacts_failure(self):
        with patch.object(release.subprocess, 'run', return_value=SimpleNamespace(returncode=0)) as run:
            release._restart_public_relay('synthetic.service')
            self.assertEqual([call.args[0] for call in run.call_args_list], [
                ['systemctl', 'restart', '--', 'synthetic.service'],
                ['systemctl', 'is-active', '--quiet', '--', 'synthetic.service']])
        with patch.object(release.subprocess, 'run', return_value=SimpleNamespace(returncode=1)), \
                self.assertRaisesRegex(release.ReleaseError, '^managed relay service did not become active$'):
            release._restart_public_relay('synthetic.service')

    def test_health_retries_unbound_socket_but_rejects_wrong_raw_identity(self):
        from unittest.mock import MagicMock
        response = MagicMock(status=200)
        response.__enter__.return_value = response
        response.read.return_value = b'exact baseline'
        with patch.object(release.urllib.request, 'urlopen', side_effect=[OSError('not ready'), response, response]) as get, \
                patch.object(release.time, 'sleep'):
            release._relay_health(release.digest(b'exact baseline'))
            self.assertEqual(get.call_count, 3)
        with patch.object(release.urllib.request, 'urlopen', return_value=response), \
                self.assertRaisesRegex(release.ReleaseError, 'identity mismatch'):
            release._relay_health('f' * 64)
