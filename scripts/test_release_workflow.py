import json
from pathlib import Path
import tempfile
import threading
import unittest
from datetime import datetime, timezone
from unittest.mock import patch
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from scripts.release_workflow import (Coordinator, DockerBackend, ReleaseError,
    atomic_json, create_plan, deployment_lock, digest, json_sha, package_inventory,
    require_clean_checkout)


def write_json(path, data):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(data, sort_keys=True) + '\n')


def text_inventory(root):
    return {p.relative_to(root).as_posix(): p.read_text()
            for p in Path(root).rglob('*') if p.is_file() and p.suffix in
            ('.html', '.js', '.css', '.json', '.xml', '.txt', '.py', '.sql')}


def package(path, commit, release, content='same'):
    path = Path(path)
    path.mkdir(parents=True)
    (path / 'ux').mkdir()
    (path / 'Dockerfile').write_text('FROM pinned-image\n')
    (path / 'ux/index.html').write_text(content)
    (path / 'ux/catalog.json').write_text('{}\n')
    (path / 'ux/catalog-proposals.json').write_text('{}\n')
    (path / 'ux/map.js').write_text('const mapVersion = 1;\n')
    write_json(path / 'preview-assets.json', {'/ux/': 'ux/index.html'})
    names = ('Dockerfile', 'ux/index.html', 'ux/catalog.json', 'ux/catalog-proposals.json', 'ux/map.js')
    hashes = {name: digest((path / name).read_bytes()) for name in names}
    write_json(path / 'ux/build.json', {'release': release, 'sourceCommit': commit,
        'sourceBaseCommit': commit, 'previousRelease': 'older', 'previousBuildSha256': 'd'*64,
        'readerLockSha256': 'e'*64, 'readerSchemaFingerprint': 'schema-v1', 'shippedSha256': hashes,
        'sourceSha256': {'ux/index.html': hashes['ux/index.html']},
        'assetSha256': {'ux/index.html': hashes['ux/index.html']},
        'dataContractSha256': {}})


class FakeBackend:
    def __init__(self, baseline_sha, base_image='sha256:base'):
        self.live = {'containerId': 'container-old', 'name': 'primary', 'imageId': base_image,
                     'buildSha256': baseline_sha, 'mounts': [], 'readOnlyRoot': True,
                     'user': '10001:10001', 'sourceCommit':'b'*40, 'release':'base', 'state': 'running'}
        self.live['requiredFileSha256'] = {}
        self.stage_state = None
        self.removed_stages = []
        self.fail_after_switch = False
        self.change_identity = False

    def live_identity(self):
        if self.change_identity:
            self.live = dict(self.live, containerId='racing-writer')
        return dict(self.live)

    def stage(self, package_dir, release_id, prior):
        from scripts.release_workflow import package_sha
        inv = package_inventory(package_dir)
        self.stage_state = {'containerId': 'stage-' + release_id, 'name': 'stage',
                      'imageId': 'sha256:image', 'imageDigest': 'sha256:image',
                      'buildSha256': inv['buildSha256'],
                      'packageSha256': package_sha(package_dir), 'status': 'running'}
        return dict(self.stage_state)

    def stage_identity(self, stage):
        return {'containerId': self.stage_state['containerId'], 'imageId': self.stage_state['imageId'],
                'status': 'running', 'packageSha256': self.stage_state['packageSha256'],
                'buildSha256': self.stage_state['buildSha256'], 'sourceCommit':'a'*40}

    def reader_schema_proof(self, container_id, lock_path, contract_path):
        from scripts.release_workflow import contract_identity
        identity = contract_identity(lock_path, contract_path.relative_to(Path(lock_path).parent.parent).as_posix())
        return {'status':'pass','queryReadOnly':True,'source':'stage.database-schema-readonly',
                'schemaFingerprint':identity['readerSchemaFingerprint'],
                'containerId':container_id,
                'imageDigest': (self.stage_state or {}).get('imageId', 'sha256:base'),
                'buildSha256': (self.stage_state or {}).get('buildSha256', self.live['buildSha256']),
                'readerLockSha256':json_sha(lock_path),
                'checkedAt':datetime.now(timezone.utc).isoformat()}

    def activate(self, stage, prior):
        self.live = {'containerId': stage['containerId'], 'name': 'primary', 'imageId': stage['imageId'],
                     'buildSha256': stage['buildSha256'] if 'buildSha256' in stage else self.stage_state['buildSha256'],
                     'mounts': [], 'readOnlyRoot': True, 'user': '10001:10001', 'sourceCommit':'a'*40, 'release':'r1', 'state': 'running'}
        if self.fail_after_switch:
            raise RuntimeError('injected activation failure')
        return dict(self.live)

    def restore(self, prior, expected):
        if self.live.get('containerId') not in (expected.get('containerId'), prior.get('containerId')):
            raise ReleaseError('another writer owns live')
        if self.live.get('containerId') != prior.get('containerId'):
            self.live = dict(prior)

    def remove_stage(self, stage):
        self.removed_stages.append(stage['containerId'])
        if self.stage_state and self.stage_state['containerId'] == stage['containerId']:
            self.stage_state = None


class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.base, self.target = self.root/'base', self.root/'target'
        package(self.base, 'b'*40, 'base', 'old')
        package(self.target, 'a'*40, 'r1', 'new')
        self.baseline_sha = json_sha(self.base/'ux/build.json')
        self.lock = self.root/'contracts'/'reader-contract.lock.json'
        artifact=self.root/'contracts'/'reader'/'v1'/'contract.json'
        artifact.parent.mkdir(parents=True)
        write_json(artifact, {'version':'v1','schema_fingerprint':'schema-v1','read_only':True,
                              'admission_filter':"usa_atlas.ingest_run.status = 'pass'"})
        write_json(self.lock, {'producerRepository':'reader','sourceCommit':'a'*40,
            'contractVersion':'v1','artifactPath':'database/reader/v1',
            'localArtifactPath':'contracts/reader/v1/contract.json',
            'contractSha256':digest(artifact.read_bytes()),'schemaFingerprint':'schema-v1',
            'bootstrapSha256':'2'*64,'fixtureSha256':'3'*64,
            'readOnly':True,'admissionFilter':"usa_atlas.ingest_run.status = 'pass'"})
        for folder in (self.base, self.target):
            metadata = json.loads((folder/'ux/build.json').read_text())
            metadata['readerLockSha256'] = json_sha(self.lock)
            write_json(folder/'ux/build.json', metadata)
        self.baseline_sha = json_sha(self.base/'ux/build.json')
        target_metadata = json.loads((self.target/'ux/build.json').read_text())
        target_metadata['previousRelease'] = 'base'
        target_metadata['previousBuildSha256'] = self.baseline_sha
        write_json(self.target/'ux/build.json', target_metadata)
        self.target_sha = json_sha(self.target/'ux/build.json')
        self.reconstructed = (package_inventory(self.target),
                              (self.target/'ux/build.json').read_bytes(),
                              (self.target/'preview-assets.json').read_bytes())
        self.policy = self.root/'policy.json'
        write_json(self.policy, {'schema':1,'revokedImageDigests':[], 'revokedBuildSha256':[]})
        self.registry=self.root/'registry.json'
        write_json(self.registry, {'allowedArtifacts':[
            {'buildSha256':self.baseline_sha,'imageDigest':'sha256:base'},
            {'buildSha256':self.target_sha,'imageDigest':'sha256:image'}]})
        self.backend = FakeBackend(self.baseline_sha)
        self.backend.live['requiredFileSha256'] = {
            **package_inventory(self.base)['files'],
            'ux/build.json': self.baseline_sha,
            'preview-assets.json': package_inventory(self.base)['previewAssetsSha256']}
        self.records = self.root/'records'
        self.lockfile = self.root/'deploy.lock'
        self.coordinator = Coordinator(self.records, self.backend, self.policy, self.lock,
            self.lockfile, lambda commit: commit == 'a'*40, self.registry,
            'usa-atlas-application-acceptance-v1', ['application.staged-build-identity','application.staged-runtime-api','application.reader-contract','application.geography-contract','application.seo-static','application.source-checks','application.chrome-regressions'],
            source_repo=self.root, source_reconstructor=lambda *args: self.reconstructed)
        self.plan_path = self.root/'plan.json'
        self.snapshot=self.root/'baseline-snapshot.json'
        write_json(self.snapshot, {'release':'base','buildSha256':self.baseline_sha,
            'requiredFileSha256':package_inventory(self.base)['files'],
            'previewAssetsSha256':package_inventory(self.base)['previewAssetsSha256'],
            'requiredFileText':text_inventory(self.base),
            'containerId':'container-old','imageId':'sha256:base'})
        self.plan = create_plan(self.snapshot, self.target, 'base', self.baseline_sha,
            ['ux/build.json','ux/index.html'], self.plan_path)

    def tearDown(self):
        self.temp.cleanup()

    def receipt(self, operation, image='sha256:image', build=None, release='r1', started=None, source='a'*40):
        from scripts.release_workflow import contract_identity
        runtime_release = 'base' if operation == 'rollback' else release
        checks = {'stagedBuildIdentity': {'runtimeBuildSha256':build or self.target_sha,
                    'releaseId':runtime_release,'sourceCommit':source},
                  'stagedRuntimeApi': {'exitCode':0}}
        checks.update({check: {'exitCode':0} for check in self.coordinator.mandatory_checks
                       if check not in ('application.staged-build-identity','application.staged-runtime-api')})
        return {'format':'usa_atlas_release_acceptance','status':'pass','failures':[],
            'checks':checks,'releaseId':release,'operation':operation,
            'runtimeReleaseId':runtime_release,
            'testedImageDigest':image,'buildSha256':build or self.target_sha,
            'sourceCommit':source, 'suiteIdentity':'usa-atlas-application-acceptance-v1',
            **contract_identity(self.lock), 'mandatorySuccessfulCheckIDs':['application.staged-build-identity','application.staged-runtime-api','application.reader-contract','application.geography-contract','application.seo-static','application.source-checks','application.chrome-regressions'],
            'testedAt':datetime.now(timezone.utc).isoformat()}

    def stage(self, release='r1'):
        return self.coordinator.stage(release, self.target, self.plan, self.baseline_sha)

    def test_atomic_json_fsyncs_parent_directory_after_replace(self):
        import os
        import stat
        from scripts import release_workflow
        events = []
        real_fsync, real_replace = os.fsync, os.replace
        def fsync(fd):
            events.append(('fsync', stat.S_ISDIR(os.fstat(fd).st_mode)))
            return real_fsync(fd)
        def replace(source, destination):
            events.append(('replace', None))
            return real_replace(source, destination)
        with patch.object(release_workflow.os, 'fsync', side_effect=fsync), \
             patch.object(release_workflow.os, 'replace', side_effect=replace):
            atomic_json(self.root/'durable'/'record.json', {'status':'activating'})
        self.assertEqual([event[0] for event in events], ['fsync', 'replace', 'fsync'])
        self.assertEqual(events[-1], ('fsync', True))

    def test_early_recovery_retries_with_prior_primary_and_retires_exact_candidate(self):
        self.stage()
        record = json.loads((self.records/'r1.json').read_text())
        record['status'] = 'activating'
        record['activationTransaction'] = {'status':'pending-recovery',
            'priorIdentity': record['baselineAtOperationStart'],
            'candidateIdentity': record['stageIdentity']}
        write_json(self.records/'r1.json', record)
        remove_stage = self.backend.remove_stage
        attempts = []
        def interrupted_cleanup(stage):
            attempts.append(stage['containerId'])
            if len(attempts) == 1:
                raise RuntimeError('simulated interruption after prior verification')
            remove_stage(stage)
        self.backend.remove_stage = interrupted_cleanup
        with self.assertRaisesRegex(RuntimeError, 'simulated interruption'):
            self.coordinator.recover('r1')
        self.assertEqual(self.backend.live['containerId'], 'container-old')
        self.assertEqual(self.backend.stage_state['containerId'], 'stage-r1')
        self.assertEqual(json.loads((self.records/'r1.json').read_text())['activationTransaction']['status'],
                         'recovery-failed')
        result = self.coordinator.recover('r1')
        self.assertEqual(result['status'], 'activation-failed-restored')
        self.assertEqual(attempts, ['stage-r1', 'stage-r1'])
        self.assertEqual(self.backend.removed_stages, ['stage-r1'])
        self.assertIsNone(self.backend.stage_state)
        with self.assertRaisesRegex(ReleaseError, 'no interrupted activation transaction'):
            self.coordinator.recover('r1')

    def test_recovery_does_not_remove_prior_when_recorded_candidate_id_matches(self):
        record = {'status':'activating', 'activationTransaction': {
            'status':'pending-recovery',
            'priorIdentity': {'containerId':'container-old'},
            'candidateIdentity': {'containerId':'container-old'}}}
        self.records.mkdir(exist_ok=True)
        write_json(self.records/'r1.json', record)
        result = self.coordinator.recover('r1')
        self.assertEqual(result['status'], 'activation-failed-restored')
        self.assertEqual(self.backend.live['containerId'], 'container-old')
        self.assertEqual(self.backend.removed_stages, [])

    def test_baseline_identity_uses_raw_build_json_and_plan_full_diff(self):
        changed = json.loads((self.base/'preview-assets.json').read_text())
        changed['/different'] = 'ux/index.html'
        write_json(self.base/'preview-assets.json', changed)
        self.assertEqual(json_sha(self.base/'ux/build.json'), self.baseline_sha)
        with self.assertRaisesRegex(ReleaseError, 'declared shipped changes'):
            create_plan(self.base,self.target,'base',self.baseline_sha,[],self.plan_path)

    def test_old_legacy_hash_fields_are_required_and_validated(self):
        (self.target/'ux/index.html').write_text('tamper')
        with self.assertRaisesRegex(ReleaseError, 'hash mismatch'):
            package_inventory(self.target)

    def test_rejects_unlisted_file_symlink_path_and_sitecustomize(self):
        extra=self.target/'rogue.txt'; extra.write_text('bad')
        with self.assertRaisesRegex(ReleaseError, 'unlisted'):
            package_inventory(self.target)
        extra.unlink(); (self.target/'link').symlink_to(self.target/'Dockerfile')
        with self.assertRaisesRegex(ReleaseError, 'symlink'):
            package_inventory(self.target)
        (self.target/'link').unlink(); (self.target/'sitecustomize.py').write_text('x')
        with self.assertRaisesRegex(ReleaseError, 'sitecustomize'):
            package_inventory(self.target)

    def test_unsafe_declared_path_and_dirty_checkout_rejected(self):
        build=json.loads((self.target/'ux/build.json').read_text())
        build['shippedSha256']['../escape']='0'*64
        write_json(self.target/'ux/build.json',build)
        with self.assertRaisesRegex(ReleaseError, 'unsafe package path'):
            package_inventory(self.target)
        repo=self.root/'dirty'; repo.mkdir()
        import subprocess
        subprocess.run(['git','init',str(repo)],check=True,capture_output=True)
        (repo/'file').write_text('dirty')
        with self.assertRaisesRegex(ReleaseError,'dirty checkout'):
            require_clean_checkout(repo)

    def test_metadata_tamper_and_lost_ui_content_rejected(self):
        original=(self.target/'ux/build.json').read_bytes()
        raw=json.loads(original); raw['sourceCommit']='c'*40; raw['sourceBaseCommit']='c'*40
        write_json(self.target/'ux/build.json',raw)
        self.assertNotEqual(json_sha(self.target/'ux/build.json'),self.target_sha)
        with self.assertRaisesRegex(ReleaseError, 'sourceCommit differs from the reviewed plan targetCommit'):
            self.stage()
        (self.target/'ux/build.json').write_bytes(original)
        (self.target/'ux/index.html').write_text('oops')
        with self.assertRaisesRegex(ReleaseError, 'hash mismatch'):
            self.stage()

    def test_dirty_source_and_stale_production_baseline_rejected(self):
        self.coordinator.is_main_accepted=lambda _:False
        with self.assertRaisesRegex(ReleaseError, 'current public remote main'):
            self.stage()
        self.coordinator.is_main_accepted=lambda _:True
        self.backend.live['buildSha256']='f'*64
        with self.assertRaisesRegex(ReleaseError, 'stale production baseline'):
            self.stage()

    def test_matching_build_sha_does_not_hide_live_shipped_file_drift(self):
        self.backend.live['requiredFileSha256']['ux/index.html']='f'*64
        with self.assertRaisesRegex(ReleaseError,'shipped-file snapshot'):
            self.stage()

    def test_tampered_plan_diff_is_recomputed_before_build(self):
        self.plan['declaredChanges']=[]
        with self.assertRaisesRegex(ReleaseError,'declared diff does not match'):
            self.stage()

    def test_removed_or_altered_content_diff_rejected_with_valid_inventories(self):
        for value in ({}, {'ux/index.html': 'edited review text'}):
            plan = dict(self.plan, contentDiff=value)
            with self.assertRaisesRegex(ReleaseError, 'reviewed contentDiff'):
                self.coordinator.stage('r1', self.target, plan, self.baseline_sha)

    def test_self_consistent_main_claiming_package_tampering_fails_source_proof(self):
        source = self.target/'ux/map.js'
        source.write_text('const mapVersion = 99;\n')
        metadata = json.loads((self.target/'ux/build.json').read_text())
        metadata['shippedSha256']['ux/map.js'] = digest(source.read_bytes())
        write_json(self.target/'ux/build.json', metadata)
        # Rewrite both reviewed inventories to make this a valid self-declared package.
        from scripts.release_workflow import create_plan
        plan = create_plan(self.snapshot, self.target, 'base', self.baseline_sha,
                           ['ux/build.json', 'ux/index.html', 'ux/map.js'], self.plan_path)
        with self.assertRaisesRegex(ReleaseError, 'exact committed-source reconstruction'):
            self.coordinator.stage('r1', self.target, plan, self.baseline_sha)

    def test_activation_transaction_is_durable_before_backend_mutation(self):
        self.stage()
        def inspect_persisted(stage, prior):
            record = json.loads((self.records/'r1.json').read_text())
            self.assertEqual(record['status'], 'activating')
            self.assertEqual(record['activationTransaction']['priorIdentity']['containerId'], 'container-old')
            self.assertEqual(record['activationTransaction']['candidateIdentity']['containerId'], 'stage-r1')
            raise RuntimeError('simulated process interruption')
        self.backend.activate = inspect_persisted
        with self.assertRaisesRegex(RuntimeError, 'process interruption'):
            self.coordinator.activate('r1', self.receipt('activate', build=self.target_sha))
        persisted = json.loads((self.records/'r1.json').read_text())
        self.assertEqual(persisted['activationTransaction']['status'], 'restored')

    def test_explicit_recovery_restores_prior_and_preserves_foreign_owner(self):
        self.stage()
        self.coordinator.activate('r1', self.receipt('activate', build=self.target_sha))
        record = json.loads((self.records/'r1.json').read_text())
        record['status'] = 'activating'
        record['activationTransaction'] = {'status':'pending-recovery',
            'priorIdentity': record['baselineAtOperationStart'],
            'candidateIdentity': record['stageIdentity']}
        write_json(self.records/'r1.json', record)
        result = self.coordinator.recover('r1')
        self.assertEqual(result['status'], 'activation-failed-restored')
        self.assertEqual(self.backend.live['containerId'], 'container-old')
        self.assertEqual(self.backend.removed_stages, ['stage-r1'])
        self.assertIsNone(self.backend.stage_state)
        record = json.loads((self.records/'r1.json').read_text())
        record['status'] = 'activating'
        record['activationTransaction'] = {'status':'pending-recovery',
            'priorIdentity': record['baselineAtOperationStart'],
            'candidateIdentity': record['stageIdentity']}
        write_json(self.records/'r1.json', record)
        self.backend.live = dict(self.backend.live, containerId='foreign-writer')
        with self.assertRaisesRegex(ReleaseError, 'another writer owns live'):
            self.coordinator.recover('r1')
        self.assertEqual(self.backend.live['containerId'], 'foreign-writer')

    def test_rollback_stage_captures_live_baseline_while_holding_global_lock(self):
        self.stage()
        self.coordinator.activate('r1', self.receipt('activate', build=self.target_sha))
        captured = {}
        def stage_target(prior, current, release_id, identity, lock, artifact):
            import fcntl
            with self.lockfile.open('a+') as stream:
                with self.assertRaises(BlockingIOError):
                    fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
            captured.update(current=current, prior=prior)
            return {'containerId':'rollback-stage'}
        self.backend.stage_rollback_target = stage_target
        output = self.root/'rollback-stage.json'
        self.coordinator.stage_rollback('r1', output)
        self.assertEqual(captured['current']['containerId'], 'stage-r1')
        self.assertEqual(captured['prior']['containerId'], 'container-old')

    def test_self_consistent_unplanned_map_change_is_not_hidden_by_seo_paths(self):
        map_file = self.target/'ux/map.js'
        map_file.write_text('const mapVersion = 2;\n')
        metadata = json.loads((self.target/'ux/build.json').read_text())
        changed_hash = digest(map_file.read_bytes())
        metadata['shippedSha256']['ux/map.js'] = changed_hash
        write_json(self.target/'ux/build.json', metadata)
        self.target_sha = json_sha(self.target/'ux/build.json')
        with self.assertRaisesRegex(ReleaseError, 'declared shipped changes'):
            create_plan(self.snapshot, self.target, 'base', self.baseline_sha,
                        ['ux/build.json','ux/index.html'], self.plan_path)

    def test_actual_revoked_seo_image_digest_is_blocked(self):
        revoked = 'sha256:f6ede23c5fed55dcf9bda27d7796b4d19571d9affba098eb50e45889362116ea'
        policy = {'revocations':[{'imageDigest':revoked}], 'revokedImageDigests':[revoked]}
        from scripts.release_workflow import policy_not_revoked
        self.assertFalse(policy_not_revoked(policy, 'f'*64, revoked))
        self.assertTrue(policy_not_revoked(policy, 'f'*64, 'sha256:approved'))

    def test_stage_then_receipt_gated_activation_and_restore_on_failure(self):
        self.stage()
        with self.assertRaisesRegex(ReleaseError, 'receipt'):
            self.coordinator.activate('r1', {})
        self.backend.fail_after_switch=True
        with self.assertRaisesRegex(RuntimeError, 'injected'):
            self.coordinator.activate('r1', self.receipt('activate', started=True))
        self.assertEqual(self.backend.live['containerId'], 'container-old')
        rec=json.loads((self.records/'r1.json').read_text())
        self.assertEqual(rec['status'],'activation-failed-restored')

    def test_activation_requires_current_suite_and_every_mandatory_check(self):
        self.stage()
        incomplete=self.receipt('activate')
        incomplete['mandatorySuccessfulCheckIDs']=['reader-contract']
        with self.assertRaisesRegex(ReleaseError,'mandatory successful checks differ'):
            self.coordinator.activate('r1',incomplete)
        wrong_suite=self.receipt('activate')
        wrong_suite['suiteIdentity']='old-suite'
        with self.assertRaisesRegex(ReleaseError,'suite identity is not current'):
            self.coordinator.activate('r1',wrong_suite)
        fabricated=self.receipt('activate')
        fabricated['checks']['application.source-checks']['exitCode']=1
        with self.assertRaisesRegex(ReleaseError,'passing execution evidence'):
            self.coordinator.activate('r1',fabricated)

    def test_tampered_staged_image_identity_is_rejected(self):
        self.stage()
        self.backend.stage_state['imageId']='sha256:foreign'
        with self.assertRaisesRegex(ReleaseError,'immutable container/image identity'):
            self.coordinator.activate('r1',self.receipt('activate'))

    def test_historical_release_label_alone_does_not_revoke_other_images(self):
        write_json(self.policy, {'revocations':[{'releaseLabelForAuditOnly':'same-label',
            'imageDigest':'sha256:old'}], 'revokedImageDigests':['sha256:old']})
        self.stage()
        self.assertEqual(json.loads((self.records/'r1.json').read_text())['status'],'staged')

    def test_rollback_requires_current_approved_artifact_and_fresh_receipt(self):
        self.stage()
        self.coordinator.activate('r1', self.receipt('activate'))
        # Rollback compares to operation-start live identity and current registry.
        write_json(self.registry, {'allowedArtifacts':[{'buildSha256':self.target_sha,'imageDigest':'sha256:image'}]})
        with self.assertRaisesRegex(ReleaseError, 'not currently approved'):
            self.coordinator.rollback('r1', self.backend.live_identity(), self.receipt('rollback', image='sha256:base', build=self.baseline_sha))

    def test_rollback_uses_fresh_receipt_bound_to_current_live_baseline(self):
        self.stage()
        self.coordinator.activate('r1', self.receipt('activate'))
        current=self.backend.live_identity()
        receipt=self.receipt('rollback', image='sha256:base', build=self.baseline_sha, release='r1', source='b'*40)
        with self.assertRaisesRegex(ReleaseError, 'not bound to the current operation baseline'):
            self.coordinator.rollback('r1', current, receipt)
        receipt['operationBaselineContainerId']=current['containerId']
        receipt['operationBaselineBuildSha256']=current['buildSha256']
        self.coordinator.rollback('r1', current, receipt)
        self.assertEqual(self.backend.live['containerId'],'container-old')

    def test_activation_race_and_global_lock(self):
        self.stage()
        self.backend.change_identity=True
        with self.assertRaisesRegex(ReleaseError, 'baseline changed'):
            self.coordinator.activate('r1', self.receipt('activate'))
        entered, release=threading.Event(), threading.Event()
        def hold():
            with deployment_lock(self.lockfile):
                entered.set(); release.wait(2)
        thread=threading.Thread(target=hold); thread.start(); self.assertTrue(entered.wait(1))
        try:
            with self.assertRaisesRegex(ReleaseError, 'global deployment lock'):
                self.stage('r2')
        finally:
            release.set(); thread.join()

    def test_docker_activation_uses_immutable_ids_and_same_image(self):
        config={'network':'net','primaryContainer':'primary','primaryAddress':'172.19.0.4'}
        backend=DockerBackend(config)
        calls=[]
        def fake_subprocess(command, **kwargs):
            calls.append(command)
            import subprocess
            return subprocess.CompletedProcess(command,0,stdout='ok\n',stderr='')
        old={'containerId':'old-id','imageId':'sha256:old','buildSha256':'a'*64}
        staged={'containerId':'stage-id','imageId':'sha256:same','buildSha256':'b'*64}
        expected_live={'containerId':'stage-id','imageId':'sha256:same','buildSha256':'b'*64}
        old_object={'Id':'old-id','Name':'/primary','State':{'Status':'running'}}
        with patch('scripts.release_workflow.subprocess.run', side_effect=fake_subprocess), patch.object(backend,'inspect',return_value=old_object), patch.object(backend,'live_identity',return_value=expected_live), patch.object(backend,'healthcheck'):
            live=backend.activate(staged,old)
        self.assertEqual(live['imageId'],'sha256:same')
        self.assertTrue(all('old-id' in c or 'stage-id' in c or c[1]=='network' for c in calls))

    def test_recovery_preserves_foreign_primary_alias(self):
        backend = DockerBackend({'network':'net','primaryContainer':'primary',
                                 'primaryAddress':'172.19.0.4'})
        calls = []
        def fake_run(command, **kwargs):
            calls.append(command)
            import subprocess
            return subprocess.CompletedProcess(command, 0, stdout='', stderr='')
        with patch.object(backend, 'inspect', side_effect=[
                {'Id':'old-id','Name':'/archived-old','State':{'Running':False}}]), \
             patch.object(backend, '_primary_owner_id', return_value='foreign-id'), \
             patch('scripts.release_workflow.run', side_effect=fake_run), \
             self.assertRaisesRegex(ReleaseError, 'foreign container owns primary alias'):
            backend.restore({'containerId':'old-id'}, {'containerId':'stage-id'})
        self.assertEqual(calls, [])

    def test_wrong_live_alias_ip_never_passes_recovery(self):
        backend = DockerBackend({'network':'net','primaryContainer':'primary',
                                 'primaryAddress':'172.19.0.4'})
        with patch.object(backend, 'inspect', return_value={
                'Id':'old-id','Name':'/archived-old','State':{'Running':False}}), \
             patch.object(backend, '_primary_owner_id', return_value='foreign-id'), \
             self.assertRaisesRegex(ReleaseError, 'foreign container owns primary alias'):
            backend.restore({'containerId':'old-id'}, {'containerId':'stage-id'})

    def test_staged_readonly_mount_and_runtime_contract_is_enforced(self):
        config={'readerSecretDestination':'/run/secrets/reader_password',
                'databaseDestination':'/var/lib/postgresql/data','runtimeUser':'10001:10001'}
        backend=DockerBackend(config)
        bad={'Id':'stage-id','Name':'/stage','Image':'sha256:image',
             'State':{'Status':'running'},'Config':{'User':'10001:10001','Labels':{}},
             'HostConfig':{'ReadonlyRootfs':True},
             'Mounts':[{'Destination':'/run/secrets/reader_password','RW':False,'Type':'bind'}]}
        with patch.object(backend,'inspect',return_value=bad), self.assertRaisesRegex(ReleaseError,'required read-only mounts'):
            backend.stage_identity({'containerId':'stage-id'})

    def test_stage_address_collision_is_checked_before_container_creation(self):
        backend=DockerBackend({'network':'usa-atlas-private','stageAddress':'172.19.0.231'})
        with patch('scripts.release_workflow.docker_json',return_value=[{'Containers':{
                'other':{'IPv4Address':'172.19.0.231/16'}}}]), self.assertRaisesRegex(ReleaseError,'staging IP is already in use'):
            backend.ensure_stage_address_free()

    def test_snapshot_build_file_hash_is_explicit_diff_path(self):
        snapshot=self.root/'snapshot.json'
        write_json(snapshot, {'release':'base','buildSha256':self.baseline_sha,
            'requiredFileSha256':package_inventory(self.base)['files'],
            'previewAssetsSha256':package_inventory(self.base)['previewAssetsSha256'],
            'requiredFileText':text_inventory(self.base)})
        plan=create_plan(snapshot,self.target,'base',self.baseline_sha,
            ['ux/build.json','ux/index.html'],self.plan_path)
        self.assertIn('ux/build.json',plan['declaredChanges'])

    def test_healthcheck_sends_server_host_and_checks_raw_build_bytes(self):
        raw = b'{"release":"health-proof"}\n'
        class Handler(BaseHTTPRequestHandler):
            def do_GET(handler):
                if handler.headers.get('Host') != f'127.0.0.1:{handler.server.server_port}':
                    handler.send_error(400); return
                handler.send_response(200); handler.send_header('Content-Length', str(len(raw)))
                handler.end_headers(); handler.wfile.write(raw)
            def log_message(self, *_):
                pass
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        try:
            backend = DockerBackend({'primaryAddress':'127.0.0.1','port':server.server_port})
            backend.healthcheck(digest(raw))
        finally:
            server.shutdown(); thread.join(); server.server_close()

    def test_reader_schema_probe_requires_actual_columns_and_types(self):
        backend = DockerBackend({})
        lock = self.root / 'probe-lock.json'
        artifact = self.root / 'probe-contract.json'
        write_json(artifact, {'objects':{'catalog_field':{'catalog_field_id':'text'}}})
        write_json(lock, {'schemaFingerprint':'probe-fingerprint'})
        valid = 'catalog_field\tcatalog_field_id\ttext\t\n'
        identity = {'Id':'stage-container','Image':'sha256:test','State':{'Status':'running'}}
        def fake_run(command, **kwargs):
            if command[:3] == ['docker','exec','stage-container'] and command[-1:] == ['/app/ux/build.json']:
                return type('R', (), {'stdout':'{"release":"probe"}\n'})()
            return type('R', (), {'stdout':valid})()
        with patch('scripts.release_workflow.run', side_effect=fake_run) as mocked, patch.object(backend,'inspect',return_value=identity):
            proof = backend.reader_schema_proof('stage-container', lock, artifact)
        self.assertTrue(proof['queryReadOnly'])
        self.assertEqual(proof['source'], 'stage.database-schema-readonly')
        probe_command = mocked.call_args_list[0].args[0]
        self.assertIn("'-d','usa_atlas'", probe_command[-1])
        self.assertIn("'-w','-q'", probe_command[-1])
        query_call = next(call for call in mocked.call_args_list if 'input_text' in call.kwargs)
        self.assertIn('BEGIN READ ONLY', query_call.kwargs['input_text'])
        self.assertEqual(proof['imageDigest'],'sha256:test')
        self.assertEqual(proof['buildSha256'],digest(b'{"release":"probe"}\n'))
        self.assertNotIn('secret-value', str(mocked.call_args.args[0]))
        wrong = 'catalog_field\tcatalog_field_id\tinteger\t\n'
        with patch('scripts.release_workflow.run', return_value=type('R', (), {'stdout':wrong})()), \
             self.assertRaisesRegex(ReleaseError, 'missing or mistypes'):
            backend.reader_schema_proof('stage-container', lock, artifact)


if __name__=='__main__':
    unittest.main()
