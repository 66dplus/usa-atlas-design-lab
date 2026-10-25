"""Private report storage is the single explicit runtime write exception."""
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from scripts.release_workflow import DockerBackend, ReleaseError
from scripts.release_workflow import digest


class ReportsReleaseTests(unittest.TestCase):
    def setUp(self):
        self.config = {'readerSecretDestination': '/run/secrets/reader_password',
                       'databaseDestination': '/var/lib/postgresql/data', 'port': 4429}
        self.backend = DockerBackend(self.config)
        self.mounts = [
            {'Type': 'bind', 'Source': '/isolated/reader', 'Destination': '/run/secrets/reader_password', 'RW': False},
            {'Type': 'volume', 'Name': 'isolated-reader-data', 'Source': '/isolated/pg', 'Destination': '/var/lib/postgresql/data', 'RW': False}]
        self.identity = {'containerId': 'archived-container',
                         'mounts': [self.backend._mount_identity(m) for m in self.mounts]}

    def configure(self, kind='volume', destination='/var/lib/usa-atlas/reports'):
        self.config['reportsStorage'] = {'type': kind, 'sourceEnv': 'ATLAS_TEST_REPORTS_SOURCE', 'destination': destination}

    def test_unconfigured_reports_do_not_add_a_write_surface(self):
        self.assertIsNone(self.backend._reports_mount())
        self.assertEqual(self.backend._runtime_args(), ['--port', '4429'])
        with patch.object(self.backend, 'inspect', return_value={'Mounts': self.mounts}):
            args = self.backend._mount_args(self.identity, inherit_reports=False)
        self.assertEqual(sum('readonly' in value for value in args), 2)
        self.assertFalse(any('reports' in value for value in args))

    def test_named_volume_must_exist_and_source_is_not_recorded(self):
        self.configure()
        volume = {'Name': 'fixture-reports', 'Mountpoint': '/isolated/volumes/fixture-reports/data'}
        with patch.dict(os.environ, {'ATLAS_TEST_REPORTS_SOURCE': 'fixture-reports'}), \
                patch('scripts.release_workflow.docker_json', return_value=[volume]):
            mount = self.backend._reports_mount()
        identity = self.backend._mount_identity(mount)
        self.assertFalse(identity['readOnly'])
        self.assertEqual(identity['destination'], '/var/lib/usa-atlas/reports')
        self.assertNotIn('fixture-reports', str(identity))
        self.assertNotIn('/isolated/volumes', str(identity))
        with patch.object(self.backend, 'inspect', return_value={'Mounts': self.mounts}):
            args = self.backend._mount_args(self.identity, reports_mount=mount, inherit_reports=False)
        self.assertIn('type=volume,src=fixture-reports,dst=/var/lib/usa-atlas/reports', args)
        self.assertEqual(sum('readonly' in value for value in args), 2)
        self.assertEqual(self.backend._runtime_args(), ['--port', '4429', '--reports-dir', '/var/lib/usa-atlas/reports'])

    def test_bound_storage_accepts_only_the_explicit_private_destination(self):
        for destination in ('/app/reports', '/run/secrets/reader_password', '/var/lib/postgresql/data', '/', '/var/lib/usa-atlas/reports/child'):
            self.configure(destination=destination)
            with self.subTest(destination=destination), self.assertRaises(ReleaseError):
                self.backend._reports_mount()

    def test_missing_and_argument_injection_sources_fail_closed(self):
        self.configure()
        for source in ('', 'name,dst=/app', 'name\n--privileged', '../escape'):
            with self.subTest(source=source), patch.dict(os.environ, {'ATLAS_TEST_REPORTS_SOURCE': source}), self.assertRaises(ReleaseError):
                self.backend._reports_mount()

    def test_bind_storage_must_be_provisioned_and_is_hash_bound(self):
        self.configure(kind='bind')
        with tempfile.TemporaryDirectory(prefix='reports-release-') as root:
            with patch.dict(os.environ, {'ATLAS_TEST_REPORTS_SOURCE': root}):
                mount = self.backend._reports_mount()
            identity = self.backend._mount_identity(mount)
            self.assertFalse(identity['readOnly'])
            self.assertNotIn(root, str(identity))
            with patch.dict(os.environ, {'ATLAS_TEST_REPORTS_SOURCE': str(Path(root) / 'absent')}), self.assertRaises(ReleaseError):
                self.backend._reports_mount()

    def test_only_exact_approved_report_mount_can_be_writable(self):
        report = self.backend._mount_identity({'Type': 'volume', 'Name': 'reports', 'Source': '/isolated/reports', 'Destination': '/var/lib/usa-atlas/reports', 'RW': True})
        self.backend._reject_unapproved_writes(self.identity['mounts'] + [report], [report])
        for changed in (dict(report, sourceIdentity='changed'), dict(report, destination='/app'), dict(report, destination='/run/secrets/reader_password')):
            with self.subTest(changed=changed), self.assertRaises(ReleaseError):
                self.backend._reject_unapproved_writes([changed], [report])
        with self.assertRaises(ReleaseError):
            self.backend._reject_unapproved_writes([report])

    def test_required_mounts_remain_read_only_with_report_storage(self):
        bad = [dict(self.mounts[0], RW=True), self.mounts[1]]
        with patch.object(self.backend, 'inspect', return_value={'Mounts': bad}), self.assertRaisesRegex(ReleaseError, 'must be read-only'):
            self.backend._mount_args(self.identity)

    def test_rollback_inherits_only_the_exact_archived_report_mount(self):
        report = {'Type': 'volume', 'Name': 'archived-reports', 'Source': '/isolated/archived-reports', 'Destination': '/var/lib/usa-atlas/reports', 'RW': True}
        self.identity['mounts'].append(self.backend._mount_identity(report))
        with patch.object(self.backend, 'inspect', return_value={'Mounts': self.mounts + [report]}):
            self.assertIn('type=volume,src=archived-reports,dst=/var/lib/usa-atlas/reports', self.backend._mount_args(self.identity))
            self.assertFalse(any('reports' in arg for arg in self.backend._mount_args(self.identity, inherit_reports=False)))
        with patch.object(self.backend, 'inspect', return_value={'Mounts': self.mounts + [dict(report, Source='/changed')]}), self.assertRaises(ReleaseError):
            self.backend._mount_args(self.identity)

    def test_proxy_arguments_require_explicit_valid_networks(self):
        self.config['trustedProxyNetworks'] = ['172.19.0.1/32', '::1/128']
        self.assertEqual(self.backend._runtime_args(), ['--port', '4429', '--trusted-proxy', '172.19.0.1/32', '--trusted-proxy', '::1/128'])
        self.config['trustedProxyNetworks'] = ['not-a-network']
        with self.assertRaises(ReleaseError):
            self.backend._runtime_args()

    def test_stage_reinspection_retains_mount_binding_for_activation(self):
        self.config.update(runtimeUser='10001:10001', network='fixture', stageAddress='192.0.2.2')
        report = {'Type': 'volume', 'Name': 'reports', 'Source': '/isolated/reports',
                  'Destination': '/var/lib/usa-atlas/reports', 'RW': True}
        expected = [self.backend._mount_identity(m) for m in self.mounts + [report]]
        stage = {'containerId': 'stage', 'releaseId': 'fixture', 'buildSha256': digest(b'{}'),
                 'sourceCommit': 'a' * 40, 'packageSha256': 'b' * 64,
                 'expectedMounts': expected, 'packageFiles': {'ux/build.json': digest(b'{}')}}
        obj = {'Id': 'stage', 'Name': '/fixture', 'Image': 'sha256:fixture',
               'Mounts': self.mounts + [report], 'HostConfig': {'ReadonlyRootfs': True},
               'Config': {'User': '10001:10001', 'Labels': {
                   'org.usa-atlas.' + label: stage[field] for label, field in (
                       ('release-id', 'releaseId'), ('build-sha256', 'buildSha256'),
                       ('source-commit', 'sourceCommit'), ('package-sha256', 'packageSha256'))}},
               'State': {'Status': 'running'},
               'NetworkSettings': {'Networks': {'fixture': {'IPAddress': '192.0.2.2'}}}}
        def copy_package(command):
            root = Path(command[-1])
            (root / 'ux').mkdir()
            (root / 'ux/build.json').write_bytes(b'{}')
        with patch.object(self.backend, 'inspect', return_value=obj), \
                patch('scripts.release_workflow.run', side_effect=copy_package):
            identity = self.backend.stage_identity(stage)
            repeated = self.backend.stage_identity(identity | {'packageFiles': stage['packageFiles']})
        self.assertEqual(identity['expectedMounts'], expected)
        self.assertEqual(repeated['expectedMounts'], expected)
        self.backend._reject_unapproved_writes(identity['mounts'], identity['expectedMounts'])


if __name__ == '__main__':
    unittest.main()
