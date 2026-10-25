"""Exercise archived static hashes and SSR semantics through real isolated HTTP."""
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import threading
import unittest

from scripts.run_release_regressions import archived_public_assets, archived_dynamic_index
from scripts.runtime_conformance import (
    ARCHIVED_INDEX_METADATA, ARCHIVED_INDEX_PATHS, ARCHIVED_INDEX_TARGET,
)


TITLE = ARCHIVED_INDEX_METADATA['title']
CANONICAL = ARCHIVED_INDEX_METADATA['canonical']
DESCRIPTION = 'A synthetic source-based map description.'
SCHEMA = {
    '@context': 'https://schema.org', '@type': 'WebPage',
    'name': TITLE, 'url': CANONICAL, 'description': DESCRIPTION,
    'isPartOf': {'@type': 'WebSite', 'name': 'USA X-Ray', 'url': 'https://usa-xray.online'},
}


def document(schema=None):
    return (f'<html><head><title>{TITLE}</title>'
            f'<link rel="canonical" href="{CANONICAL}">'
            '<meta name="robots" content="index,follow">'
            f'<meta name="description" content="{DESCRIPTION}">'
            '<script type="application/ld+json">' + json.dumps(SCHEMA if schema is None else schema) +
            '</script></head><body>Test rendered UI</body></html>').encode()


class ArchivedSSRAssetsTests(unittest.TestCase):
    def setUp(self):
        self.requests = []
        self.responses = {
            path: (301, {'Location': ARCHIVED_INDEX_TARGET}, b'') for path in ARCHIVED_INDEX_PATHS
        }
        self.responses.update({
            ARCHIVED_INDEX_TARGET: (200, {'Content-Type': 'text/html; charset=utf-8'}, document()),
            '/ux/app.js': (200, {}, b'accepted static JS'),
            '/ux/advertise.html': (200, {'Content-Type': 'text/html'}, b'accepted static editor HTML'),
        })
        self.build = {'assetSha256': {
            name: hashlib.sha256(body).hexdigest() for name, body in (
                ('ux/app.js', b'accepted static JS'),
                ('ux/advertise.html', b'accepted static editor HTML'),
                ('ux/index.html', b'raw index template; not its HTTP representation'),
            )
        }}
        fixture = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                fixture.requests.append(self.path)
                status, headers, body = fixture.responses.get(self.path, (404, {}, b''))
                self.send_response(status)
                for key, value in headers.items():
                    self.send_header(key, value)
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *args):
                pass

        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = 'http://127.0.0.1:' + str(self.server.server_port)

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)

    def test_raw_template_differs_but_both_redirected_ssr_routes_are_verified(self):
        result = archived_public_assets(self.base, self.build)
        self.assertEqual(result['count'], 3)
        self.assertEqual(result['staticAssetCount'], 2)
        self.assertEqual(result['dynamicIndexes'], [
            {'path': path, **ARCHIVED_INDEX_METADATA} for path in ARCHIVED_INDEX_PATHS])
        self.assertEqual(self.requests.count(ARCHIVED_INDEX_TARGET), 2)
        self.assertTrue(all(path in self.requests for path in self.responses))

    def test_javascript_and_editor_html_still_require_exact_static_bytes(self):
        for path in ('/ux/app.js', '/ux/advertise.html'):
            original = self.responses[path]
            self.responses[path] = (200, {}, b'tampered asset')
            with self.subTest(path=path), self.assertRaisesRegex(ValueError, 'public asset mismatch'):
                archived_public_assets(self.base, self.build)
            self.responses[path] = original

    def test_static_redirects_and_errors_cannot_be_hidden_by_automatic_following(self):
        # Following this redirect would yield the exact expected bytes. The
        # response status itself must still reject the mapped static URL.
        self.responses['/alternate.js'] = (200, {}, b'accepted static JS')
        for status in (301, 302, 404, 503):
            self.responses['/ux/app.js'] = (
                status, {'Location': '/alternate.js'}, b'accepted static JS')
            with self.subTest(status=status), self.assertRaisesRegex(ValueError, 'HTTP 200'):
                archived_public_assets(self.base, self.build)

    def test_wrong_redirect_status_destination_or_origin_fails_closed(self):
        for path in ARCHIVED_INDEX_PATHS:
            for status, target in ((200, ARCHIVED_INDEX_TARGET), (302, ARCHIVED_INDEX_TARGET),
                    (308, ARCHIVED_INDEX_TARGET), (301, '/stats'), (301, path),
                    (301, 'https://unrelated.invalid/'), (301, ARCHIVED_INDEX_TARGET + '?extra=1')):
                self.responses[path] = (status, {'Location': target}, b'')
                with self.subTest(path=path, status=status, target=target), self.assertRaisesRegex(ValueError, 'permanently redirect'):
                    archived_dynamic_index(self.base, path)
            self.responses[path] = (301, {'Location': ARCHIVED_INDEX_TARGET}, b'')

    def test_destination_requires_actual_http_200_html(self):
        for status, content_type in ((404, 'text/html'), (301, 'text/html'), (200, 'application/json')):
            self.responses[ARCHIVED_INDEX_TARGET] = (status, {'Content-Type': content_type}, document())
            with self.subTest(status=status, content_type=content_type), self.assertRaisesRegex(ValueError, 'HTTP 200'):
                archived_dynamic_index(self.base, ARCHIVED_INDEX_PATHS[0])

    def test_bad_missing_duplicate_or_body_only_metadata_cannot_pass(self):
        good = document()
        mutations = {
            'title': good.replace(TITLE.encode(), b'Wrong title'),
            'duplicate-title': good.replace(b'</head>', b'<title>Extra title</title></head>'),
            'canonical': good.replace(CANONICAL.encode(), b'https://unrelated.invalid/'),
            'missing-canonical': good.replace(f'<link rel="canonical" href="{CANONICAL}">'.encode(), b''),
            'duplicate-canonical': good.replace(b'</head>', f'<link rel="canonical" href="{CANONICAL}"></head>'.encode()),
            'mixed-case-duplicate-canonical': good.replace(b'</head>', b'<link rel="Canonical alternate" href="https://unrelated.invalid/"></head>'),
            'robots': good.replace(b'index,follow', b'noindex,follow'),
            'missing-robots': good.replace(b'<meta name="robots" content="index,follow">', b''),
            'mixed-case-duplicate-robots': good.replace(b'</head>', b'<meta name="ROBOTS" content="noindex"></head>'),
            'description': good.replace(DESCRIPTION.encode(), b''),
            'body-only': good.replace(b'<head>', b'<body>').replace(b'</head>', b'</body>'),
            'invalid-json': good.replace(json.dumps(SCHEMA).encode(), b'{bad JSON}'),
            'missing-schema': good.replace(b'application/ld+json', b'text/plain'),
            'duplicate-schema': good.replace(b'</head>', b'<script type="application/ld+json">{}</script></head>'),
            'mixed-case-duplicate-schema': good.replace(b'</head>', b'<script type="APPLICATION/LD+JSON">{}</script></head>'),
        }
        for key, value in (('@context', 'https://unrelated.invalid'), ('@type', 'Product'),
                ('url', CANONICAL + '/wrong'), ('name', 'Wrong title'),
                ('description', 'Wrong description'), ('isPartOf', {})):
            mutations['schema-' + key] = document({**SCHEMA, key: value})
        for name, body in mutations.items():
            self.responses[ARCHIVED_INDEX_TARGET] = (200, {'Content-Type': 'text/html'}, body)
            with self.subTest(name=name), self.assertRaises(ValueError):
                archived_dynamic_index(self.base, ARCHIVED_INDEX_PATHS[0])


if __name__ == '__main__':
    unittest.main()
