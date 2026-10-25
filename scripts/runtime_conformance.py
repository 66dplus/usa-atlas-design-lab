"""Exact archived-runtime applicability; unknown candidates never opt out."""
import hashlib
import json

CAPABILITIES = ['react-ui-v1', 'support-about-report-v1', 'studio-bounded-reference-v1']
SUPPLEMENTS = ('react-ui', 'studio')
CORE_CASES = ['startup-definition-before-refresh',
              *[f'chrome-{size}-{theme}' for size in ('390x844', '360x640', '1440x900', '1440x640')
                for theme in ('light', 'dark')], 'api-failure-retry']
# Two public URLs share one raw template. Both permanently redirect to this
# route; its server-rendered metadata is the accepted SEO contract.
ARCHIVED_INDEX_PATHS = ('/ux/index.html', '/ux/')
ARCHIVED_INDEX_TARGET = '/united-states/unemployment'
ARCHIVED_INDEX_METADATA = {
    'redirectStatus': 301, 'documentStatus': 200,
    'canonical': 'https://usa-xray.online' + ARCHIVED_INDEX_TARGET,
    'robots': 'index,follow',
    'title': 'Unemployment rate in the United States | USA X-Ray',
    'description': 'pass', 'structuredData': 'pass',
}
# Immutable evidence from the accepted normalization release. This exception is
# an exact artifact, never a caller-supplied capability flag or source age rule.
ARCHIVED_A = {
    'profile': 'archived-versioning-A',
    'publicAssetCount': 124,
    'staticAssetCount': 123,
    'publicAssetManifestSha256': '726c3d4aa71cca0da8d550def107c2a584ae7c647292c2b1a8f90e490281d3f3',
    'releaseId': '20261025-versioning-ed8eefb-A',
    'sourceCommit': 'ed8eefbe22c3befcf2b40d5e16fde0948e696772',
    'buildSha256': '213f3c50fdd595420f19b917bb13c0b47c6463049695de0ae08ed9197a252859',
    'imageDigest': 'sha256:a19e40876e8cdc70ad94caad5ba25ca582a56da5388203fc3d0d12259d576df9',
}


def profile_for_identity(build_sha, source, release, image=None):
    if (build_sha == ARCHIVED_A['buildSha256'] and source == ARCHIVED_A['sourceCommit']
            and release == ARCHIVED_A['releaseId']):
        if image is not None and image != ARCHIVED_A['imageDigest']:
            raise ValueError('archived runtime image differs from its pinned provenance')
        return ARCHIVED_A['profile']
    return 'compiled-react-v1'


def observe_runtime(raw, image=None):
    build = json.loads(raw)
    identity = {'buildSha256': hashlib.sha256(raw).hexdigest(),
                'sourceCommit': build.get('sourceCommit'), 'releaseId': build.get('release'),
                'imageDigest': image}
    profile = profile_for_identity(identity['buildSha256'], identity['sourceCommit'],
                                   identity['releaseId'], image)
    if profile == 'compiled-react-v1':
        if (build.get('frontendFramework') != 'react-typescript' or
                build.get('conformanceCapabilities') != CAPABILITIES):
            raise ValueError('unrecognized runtime must declare the complete compiled candidate capabilities')
    return build, {'identity': identity, 'profile': profile,
                   'supplements': {name: {'applicable': profile == 'compiled-react-v1',
                        'reason': ('Declared compiled candidate contract' if profile == 'compiled-react-v1'
                                   else 'Exact pinned archived A predates React and Support/About; no feature conformance claim')}
                        for name in SUPPLEMENTS}}


def validate_conformance(report, *, build_sha, source, release, image=None):
    """Receipt validation repeats applicability from identities, never from flags."""
    if not isinstance(report, dict) or report.get('format') != 'usa_atlas_runtime_conformance':
        raise ValueError('runtime conformance execution report is required')
    expected = {'buildSha256': build_sha, 'sourceCommit': source, 'releaseId': release,
                'imageDigest': image}
    if report.get('identity') != expected:
        raise ValueError('runtime conformance report identity mismatch')
    profile = profile_for_identity(build_sha, source, release, image)
    if report.get('profile') != profile or report.get('status') != 'pass':
        raise ValueError('runtime conformance profile or status mismatch')
    if report.get('core') != {'status': 'pass', 'cases': CORE_CASES, 'webgl': 'pass',
                              'negativeFooter': 'expected_failure', 'httpSeo': 'pass'}:
        raise ValueError('complete current mandatory core execution evidence is required')
    if profile == ARCHIVED_A['profile'] and report.get('archivedPublicAssets') != {
            'status': 'pass', 'count': ARCHIVED_A['publicAssetCount'],
            'staticAssetCount': ARCHIVED_A['staticAssetCount'],
            'manifestSha256': ARCHIVED_A['publicAssetManifestSha256'],
            'dynamicIndexes': [{'path': path, **ARCHIVED_INDEX_METADATA}
                               for path in ARCHIVED_INDEX_PATHS]}:
        raise ValueError('archived static bytes and dynamic SSR semantics require complete pinned evidence')
    supplements = report.get('supplements')
    if not isinstance(supplements, dict) or set(supplements) != set(SUPPLEMENTS):
        raise ValueError('supplemental applicability evidence is incomplete')
    for name in SUPPLEMENTS:
        item = supplements[name]
        applicable = profile == 'compiled-react-v1'
        if (not isinstance(item, dict) or item.get('applicable') is not applicable or
                item.get('status') != ('pass' if applicable else 'not_applicable') or
                not item.get('reason') or (applicable and item.get('cases') != 8)):
            raise ValueError(f'conformance evidence invalid for {name}')
