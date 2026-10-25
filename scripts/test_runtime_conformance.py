"""New candidate conformance cannot be disabled by metadata or ambient flags."""
import copy
import json
from pathlib import Path
import unittest
from unittest.mock import patch
from scripts.runtime_conformance import (
    ARCHIVED_A, CAPABILITIES, CORE_CASES, observe_runtime, profile_for_identity,
    validate_conformance, ARCHIVED_INDEX_PATHS, ARCHIVED_INDEX_METADATA,
)
from scripts.run_release_regressions import archived_public_assets


def passing_report(build_sha='b'*64, source='a'*40, release='candidate', image='sha256:'+'1'*64):
    profile = profile_for_identity(build_sha, source, release, image)
    applicable = profile == 'compiled-react-v1'
    report = {'format':'usa_atlas_runtime_conformance', 'status':'pass', 'profile':profile,
              'identity':{'buildSha256':build_sha,'sourceCommit':source,'releaseId':release,'imageDigest':image},
              'core':{'status':'pass','cases':CORE_CASES,'webgl':'pass','httpSeo':'pass','negativeFooter':'expected_failure'},
              'supplements':{name:{'applicable':applicable,'status':'pass' if applicable else 'not_applicable',
                  'reason':'Fixture conformance execution' if applicable else 'Exact immutable archived A predates feature',
                  **({'cases':8} if applicable else {})} for name in ('react-ui','studio')}}
    if not applicable:
        report['archivedPublicAssets']={'status':'pass','count':ARCHIVED_A['publicAssetCount'],
            'staticAssetCount':ARCHIVED_A['staticAssetCount'],
            'manifestSha256':ARCHIVED_A['publicAssetManifestSha256'],
            'dynamicIndexes': [
                {'path': path, **ARCHIVED_INDEX_METADATA} for path in ARCHIVED_INDEX_PATHS]}
    return report


class RuntimeConformanceTests(unittest.TestCase):
    def candidate(self, **updates):
        return json.dumps({'release':'candidate','sourceCommit':'a'*40,
            'frontendFramework':'react-typescript','conformanceCapabilities':CAPABILITIES,**updates}).encode()

    def test_compiled_candidate_requires_all_supplements(self):
        _, report=observe_runtime(self.candidate())
        self.assertTrue(all(item['applicable'] for item in report['supplements'].values()))

    def test_missing_or_partial_capabilities_cannot_opt_out(self):
        for caps in (None,[],CAPABILITIES[:-1],CAPABILITIES+['unknown']):
            with self.subTest(caps=caps),self.assertRaises(ValueError):
                observe_runtime(self.candidate(conformanceCapabilities=caps))
        with self.assertRaises(ValueError):
            observe_runtime(self.candidate(frontendFramework=None))

    def test_archived_release_labels_or_source_age_are_not_an_exception(self):
        with self.assertRaises(ValueError):
            observe_runtime(json.dumps({'release':ARCHIVED_A['releaseId'],
                'sourceCommit':ARCHIVED_A['sourceCommit']}).encode())
        self.assertEqual(profile_for_identity('0'*64,ARCHIVED_A['sourceCommit'],ARCHIVED_A['releaseId']),'compiled-react-v1')
        with self.assertRaises(ValueError):
            profile_for_identity(ARCHIVED_A['buildSha256'],ARCHIVED_A['sourceCommit'],ARCHIVED_A['releaseId'],'sha256:'+'0'*64)

    def test_exact_archived_identity_records_not_applicable_not_pass(self):
        report=passing_report(ARCHIVED_A['buildSha256'],ARCHIVED_A['sourceCommit'],ARCHIVED_A['releaseId'],ARCHIVED_A['imageDigest'])
        validate_conformance(report,**self.arguments(report))
        self.assertEqual(report['supplements']['react-ui']['status'],'not_applicable')
        for field in ('webgl','negativeFooter','httpSeo'):
            bad=copy.deepcopy(report);bad['core'].pop(field)
            with self.subTest(field=field),self.assertRaises(ValueError):validate_conformance(bad,**self.arguments(report))
        bad=copy.deepcopy(report);bad.pop('archivedPublicAssets')
        with self.assertRaises(ValueError):validate_conformance(bad,**self.arguments(report))
        incomplete = (
            ('staticAssetCount', 124),
            ('dynamicIndexes', []),
            ('dynamicIndexes', report['archivedPublicAssets']['dynamicIndexes'][:1]),
        )
        for field, value in incomplete:
            bad = copy.deepcopy(report)
            bad['archivedPublicAssets'][field] = value
            with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                validate_conformance(bad, **self.arguments(report))

    def arguments(self,report):
        identity=report['identity'];return {'build_sha':identity['buildSha256'],'source':identity['sourceCommit'],
            'release':identity['releaseId'],'image':identity['imageDigest']}

    def test_current_candidate_cannot_claim_not_applicable_or_partial_matrix(self):
        report=passing_report();validate_conformance(report,**self.arguments(report))
        for patch_item in ({'applicable':False,'status':'not_applicable'},{'cases':7},{'status':'not_run'}):
            bad=copy.deepcopy(report);bad['supplements']['studio'].update(patch_item)
            with self.subTest(patch=patch_item),self.assertRaises(ValueError):validate_conformance(bad,**self.arguments(report))
        bad=copy.deepcopy(report);bad['core']['cases']=CORE_CASES[:-1]
        with self.assertRaises(ValueError):validate_conformance(bad,**self.arguments(report))
        bad=copy.deepcopy(report);bad['identity']['buildSha256']='c'*64
        with self.assertRaises(ValueError):validate_conformance(bad,**self.arguments(report))

    def test_old_manifest_cannot_hide_replaced_public_bytes(self):
        import hashlib
        build={'assetSha256':{'ux/app.js':hashlib.sha256(b'old bytes').hexdigest()}}
        with patch('scripts.run_release_regressions.read_runtime',return_value=b'new bytes'),self.assertRaises(ValueError):
            archived_public_assets('http://fixture',build)
        with patch('scripts.run_release_regressions.read_runtime',return_value=b'old bytes'):
            self.assertEqual(archived_public_assets('http://fixture',build)['count'],1)
