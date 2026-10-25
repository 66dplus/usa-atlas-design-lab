#!/usr/bin/env python3
from __future__ import annotations
"""Run the real Chrome suite and prove its comparison-footer regression detector fires."""

import json
import os
from html.parser import HTMLParser
from pathlib import Path
import subprocess
import sys
import tempfile
from urllib.error import HTTPError
from urllib.request import HTTPRedirectHandler, Request, build_opener
import hashlib

try:
    from .runtime_conformance import (
        observe_runtime, validate_conformance, CORE_CASES,
        ARCHIVED_INDEX_PATHS, ARCHIVED_INDEX_TARGET, ARCHIVED_INDEX_METADATA,
    )
except ImportError:
    from runtime_conformance import (
        observe_runtime, validate_conformance, CORE_CASES,
        ARCHIVED_INDEX_PATHS, ARCHIVED_INDEX_TARGET, ARCHIVED_INDEX_METADATA,
    )

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "ux/check-release-regressions.mjs"
FAILURE_MARKER = "comparison footer stays inside the pane instead of covering the viewport"
FILTER_VARIABLES = ("ATLAS_TEST_WIDTH", "ATLAS_TEST_HEIGHT", "ATLAS_TEST_THEME",
                    "ATLAS_TEST_SKIP_RETRY", "ATLAS_TEST_MUTATION", "ATLAS_BEFORE_URL")


def browser_env(env, output: Path, *, mutation: str | None = None, filtered: bool = False):
    run_env = dict(env)
    for name in FILTER_VARIABLES:
        run_env.pop(name, None)
    run_env.update({"ATLAS_TEST_OUTPUT": str(output), "ATLAS_TEST_BROWSER": "chrome",
                    "ATLAS_DISABLE_SECRET_FILE": "1"})
    if mutation:
        run_env["ATLAS_TEST_MUTATION"] = mutation
    if filtered:
        run_env.update({"ATLAS_TEST_WIDTH": "1440", "ATLAS_TEST_THEME": "light"})
    return run_env


def execute(env, output: Path, mutation: str | None = None):
    run_env = browser_env(env, output, mutation=mutation, filtered=bool(mutation))
    return subprocess.run(["node", str(SCRIPT)], cwd=ROOT, env=run_env,
                          capture_output=True, text=True, timeout=3600)


def require_footer_failure(result, evidence_path: Path):
    try:
        evidence = json.loads(evidence_path.read_text())
    except (OSError, json.JSONDecodeError) as error:
        raise SystemExit(f"footer mutation did not produce machine-readable evidence: {error}")
    if result.returncode == 0 or not any(FAILURE_MARKER in item.get("message", "")
                                         for item in evidence.get("failures", [])):
        raise SystemExit("negative Chrome mutation did not fail at the expected footer-overlap assertion")
    return evidence


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def read_http(url):
    """Inspect the actual response; never hide a bad status or redirect target."""
    try:
        response = build_opener(NoRedirect).open(
            Request(url, headers={'Accept-Encoding': 'identity'}), timeout=30)
    except HTTPError as error:
        response = error
    with response:
        return response.status, response.headers, response.read()


def read_runtime(url):
    status, _, raw = read_http(url)
    if status != 200:
        raise ValueError('runtime resource did not return HTTP 200: ' + url)
    return raw


class SSRMetadata(HTMLParser):
    """Collect singular metadata from the head, without executing client code."""
    def __init__(self):
        super().__init__()
        self.in_head = False
        self.capture = None
        self.text = []
        self.values = {key: [] for key in ('title', 'canonical', 'robots', 'description', 'schema')}

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'head':
            self.in_head = True
        if not self.in_head:
            return
        if tag == 'link' and 'canonical' in (attrs.get('rel') or '').lower().split():
            self.values['canonical'].append(attrs.get('href'))
        name = (attrs.get('name') or '').lower()
        if tag == 'meta' and name in ('robots', 'description'):
            self.values[name].append(attrs.get('content'))
        if tag == 'title' or (tag == 'script' and (attrs.get('type') or '').lower() == 'application/ld+json'):
            self.capture = 'title' if tag == 'title' else 'schema'
            self.text = []

    def handle_data(self, data):
        if self.capture:
            self.text.append(data)

    def handle_endtag(self, tag):
        capture_ended = ((tag == 'title' and self.capture == 'title') or
                         (tag == 'script' and self.capture == 'schema'))
        if capture_ended:
            self.values[self.capture].append(''.join(self.text).strip())
            self.capture = None
        if tag == 'head':
            self.in_head = False
            self.capture = None


def archived_dynamic_index(base, path):
    status, headers, _ = read_http(base + path)
    if status != 301 or headers.get('Location') != ARCHIVED_INDEX_TARGET:
        raise ValueError('archived index must permanently redirect to the canonical route: ' + path)
    status, headers, body = read_http(base + ARCHIVED_INDEX_TARGET)
    content_type = headers.get('Content-Type', '').split(';')[0].strip().lower()
    if status != 200 or content_type != 'text/html':
        raise ValueError('archived index destination must return an HTML document with HTTP 200: ' + path)
    parser = SSRMetadata()
    parser.feed(body.decode('utf-8'))
    values = parser.values
    for key in ('title', 'canonical', 'robots'):
        if values[key] != [ARCHIVED_INDEX_METADATA[key]]:
            raise ValueError('archived SSR index has incorrect ' + key + ': ' + path)
    descriptions = values['description']
    if len(descriptions) != 1 or not isinstance(descriptions[0], str) or not descriptions[0].strip():
        raise ValueError('archived SSR index requires one nonempty description: ' + path)
    try:
        schema = json.loads(values['schema'][0]) if len(values['schema']) == 1 else None
    except json.JSONDecodeError:
        schema = None
    site = {'@type': 'WebSite', 'name': 'USA X-Ray', 'url': 'https://usa-xray.online'}
    if (not isinstance(schema, dict) or schema.get('@context') != 'https://schema.org' or
            schema.get('@type') != 'WebPage' or schema.get('url') != ARCHIVED_INDEX_METADATA['canonical'] or
            schema.get('name') != ARCHIVED_INDEX_METADATA['title'] or
            schema.get('description') != descriptions[0] or schema.get('isPartOf') != site):
        raise ValueError('archived SSR index has missing or incorrect structured data: ' + path)
    return {'path': path, **ARCHIVED_INDEX_METADATA}


def archived_public_assets(base, build):
    """An exact old manifest cannot be a facade for different new UI bytes."""
    assets = build.get('assetSha256')
    if not isinstance(assets, dict) or not assets:
        raise ValueError('archived public asset bindings are missing')
    static_count = 0
    for name, expected in assets.items():
        if name.startswith('/') or '..' in name.split('/'):
            raise ValueError('unsafe archived asset binding')
        if name == 'ux/index.html':
            continue  # Its two HTTP routes are verified semantically below.
        if hashlib.sha256(read_runtime(base + '/' + name)).hexdigest() != expected:
            raise ValueError('archived runtime public asset mismatch: ' + name)
        static_count += 1
    dynamic = ([archived_dynamic_index(base, path) for path in ARCHIVED_INDEX_PATHS]
               if 'ux/index.html' in assets else [])
    return {'status': 'pass', 'count': len(assets), 'staticAssetCount': static_count,
            'dynamicIndexes': dynamic, 'manifestSha256': hashlib.sha256(
        json.dumps(assets, sort_keys=True, separators=(',', ':')).encode()).hexdigest()}


def main():
    env = os.environ.copy()
    if not env.get('ATLAS_TEST_URL'):
        raise SystemExit('ATLAS_TEST_URL must point to the isolated staged application runtime.')
    base = env['ATLAS_TEST_URL'].rstrip('/')
    raw = read_runtime(base + '/ux/build.json')
    expected_build = env.get('ATLAS_CONFORMANCE_BUILD_SHA256')
    if expected_build and hashlib.sha256(raw).hexdigest() != expected_build:
        raise SystemExit('runtime differs from acceptance-bound build identity')
    build, applicability = observe_runtime(raw, env.get('ATLAS_CONFORMANCE_IMAGE_DIGEST'))
    output = Path(tempfile.mkdtemp(prefix='usa-atlas-release-regression-evidence-', dir=tempfile.gettempdir()))
    report = {'format': 'usa_atlas_runtime_conformance', **applicability, 'status': 'fail',
              'core': {}, 'evidenceDirectory': str(output)}
    report_path = Path(env.get('ATLAS_CONFORMANCE_REPORT', str(output / 'conformance.json')))
    if report_path.exists():
        raise SystemExit('conformance evidence already exists; use a fresh destination')
    failed = False
    def execute_check(command, name, timeout=900):
        nonlocal failed
        result = subprocess.run(command, cwd=ROOT, env=browser_env(env, output / name),
                                capture_output=True, text=True, timeout=timeout)
        print(result.stdout, end='')
        if result.stderr:
            print(result.stderr, file=sys.stderr, end='')
        failed = failed or result.returncode != 0
        return result
    try:
        if applicability['profile'] == 'archived-versioning-A':
            report['archivedPublicAssets'] = archived_public_assets(base, build)
        positive = execute(env, output / 'positive')
        print(positive.stdout, end='')
        if positive.stderr:
            print(positive.stderr, file=sys.stderr, end='')
        evidence = json.loads((output / 'positive/results.json').read_text())
        cases = evidence.get('checks', [])
        positive_pass = (positive.returncode == 0 and evidence.get('pass') is True and
                         [item.get('name') for item in cases] == CORE_CASES and
                         all(item.get('pass') is True for item in cases))
        failed = failed or not positive_pass
        report['core'].update(status='pass' if positive_pass else 'fail', cases=[item.get('name') for item in cases])
        webgl = execute_check(['node', str(ROOT / 'ux/check-webgl-ui.mjs')], 'webgl')
        report['core']['webgl'] = 'pass' if webgl.returncode == 0 else 'fail'
        for name, script in (('react-ui', 'check-react-ui.mjs'), ('studio', 'check-studio-react.mjs')):
            item = report['supplements'][name]
            if not item['applicable']:
                item['status'] = 'not_applicable'
                continue
            result = execute_check(['node', str(ROOT / 'ux' / script)], name)
            native = json.loads((output / name / 'results.json').read_text())
            item['cases'] = len(native.get('checks', []))
            item['status'] = 'pass' if result.returncode == 0 and item['cases'] == 8 and native.get('status') == 'pass' else 'fail'
            failed = failed or item['status'] != 'pass'
        http = execute_check(['node', str(ROOT / 'ux/check-http-seo.mjs')], 'http-seo')
        report['core']['httpSeo'] = 'pass' if http.returncode == 0 else 'fail'
        # The detector remains mandatory even if supplemental conformance fails.
        mutation = execute(env, output / 'negative-footer', 'legacy-footer')
        require_footer_failure(mutation, output / 'negative-footer/results.json')
        report['core']['negativeFooter'] = 'expected_failure'
        report['status'] = 'fail' if failed else 'pass'
        validate_conformance(report, build_sha=report['identity']['buildSha256'],
                             source=build['sourceCommit'], release=build['release'],
                             image=report['identity']['imageDigest'])
    finally:
        report_path.parent.mkdir(parents=True, exist_ok=True)
        with report_path.open('x') as stream:
            json.dump(report, stream, indent=2)
            stream.write('\n')
    print(json.dumps(report, indent=2))
    return 1 if failed else 0


if __name__ == '__main__':
    raise SystemExit(main())
