"""Focused validation of private, write-only bug report handling."""
import http.client
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))

import bug_reports
from bug_reports import BugReportStore, ReportRateLimiter, report_rate_limit_identity, trusted_proxy_networks, validate_report
from preview_server import PreviewServer
import serve


def payload(host, **overrides):
    data = {
        'pageUrl': '/about?theme=dark&place=06075&token=private#fragment',
        'description': 'The map legend overlaps the source button on a narrow screen.',
        'contact': 'reader@example.com',
        'context': {
            'page': 'about', 'placeId': '06075', 'place': 'San Francisco County',
            'indicatorId': 'unemployment', 'indicator': 'Unemployment rate', 'period': '2024-M12'
        },
        'website': ''
    }
    data.update(overrides)
    return data


class RunningServer:
    def __init__(self, server):
        self.server = server
        self.thread = threading.Thread(target=server.serve_forever, daemon=True)
        self.thread.start()
        self.host = f'127.0.0.1:{server.server_port}'

    def request(self, method, path, data=None, *, origin=None, content_type='application/json',
                fetch_site='same-origin', extra_headers=None, include_headers=False):
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=3)
        body = json.dumps(data).encode() if data is not None else None
        headers = {'Host': self.host, 'Origin': origin or f'http://{self.host}', 'Content-Type': content_type}
        if fetch_site is not None:
            headers['Sec-Fetch-Site'] = fetch_site
        if body is not None:
            headers['Content-Length'] = str(len(body))
        headers.update(extra_headers or {})
        connection.request(method, path, body=body, headers=headers)
        response = connection.getresponse()
        response_body = response.read()
        result = json.loads(response_body) if response_body else {}
        response_headers = dict(response.getheaders())
        connection.close()
        return (response.status, result, response_headers) if include_headers else (response.status, result)

    def close(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=3)


class BugReportValidationTests(unittest.TestCase):
    def test_validation_rejects_bad_url_contact_context_and_honeypot(self):
        host = 'usa-xray.example'
        for data in (
            payload(host, pageUrl='https://elsewhere.example/about'),
            payload(host, pageUrl='/api/feedback'),
            payload(host, description='short'),
            payload(host, contact='not-an-email-or-profile'),
            payload(host, context={'private': 'unexpected'}),
            payload(host, website='filled by a bot')
        ):
            with self.subTest(data=data):
                with self.assertRaises(ValueError):
                    validate_report(data)
        report = validate_report(payload(host))
        self.assertEqual(report['pageUrl'], '/about?place=06075')

    def test_storage_is_private_and_cannot_be_inside_public_root(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / 'public'
            root.mkdir()
            with self.assertRaises(ValueError):
                BugReportStore(root / 'reports', root)
            store = BugReportStore(Path(temp) / 'private' / 'reports', root)
            record = validate_report(payload('usa-xray.example'))
            report_id = store.save(record)
            path = store.directory / f'{report_id}.json'
            self.assertEqual(os.stat(store.directory).st_mode & 0o777, 0o700)
            self.assertEqual(os.stat(path).st_mode & 0o777, 0o600)
            self.assertEqual(json.loads(path.read_text())['contact'], 'reader@example.com')

    def test_rate_limiter_is_bounded_by_window(self):
        limiter = ReportRateLimiter(limit=2, window_seconds=10)
        self.assertTrue(limiter.allow('127.0.0.1', now=1))
        self.assertTrue(limiter.allow('127.0.0.1', now=2))
        self.assertFalse(limiter.allow('127.0.0.1', now=3))
        self.assertTrue(limiter.allow('127.0.0.1', now=12))

    def test_forwarded_client_identity_requires_an_explicit_trusted_proxy(self):
        trusted = trusted_proxy_networks(['10.0.0.0/8'])
        self.assertEqual(report_rate_limit_identity('203.0.113.10', {'X-Forwarded-For': '198.51.100.1'}, trusted), '203.0.113.10')
        self.assertEqual(report_rate_limit_identity('10.0.0.8', {'X-Forwarded-For': '198.51.100.1'}, trusted), '198.51.100.1')
        self.assertNotEqual(
            report_rate_limit_identity('10.0.0.8', {'X-Forwarded-For': '198.51.100.1'}, trusted),
            report_rate_limit_identity('10.0.0.8', {'X-Forwarded-For': '198.51.100.2'}, trusted))
        self.assertEqual(report_rate_limit_identity('10.0.0.8', {'X-Forwarded-For': 'not-an-ip'}, trusted), '10.0.0.8')

    def test_save_failure_does_not_close_a_reused_descriptor(self):
        with tempfile.TemporaryDirectory() as temp:
            store = BugReportStore(Path(temp) / 'private')
            report = validate_report(payload('unused'))
            original_fdopen = os.fdopen
            captured = []
            sentinel = Path(temp) / 'sentinel'
            sentinel_fd = []

            def record_fdopen(descriptor, *args, **kwargs):
                captured.append(descriptor)
                return original_fdopen(descriptor, *args, **kwargs)

            def fail_replace(*_):
                descriptor = os.open(sentinel, os.O_CREAT | os.O_WRONLY, 0o600)
                sentinel_fd.append(descriptor)
                self.assertEqual(descriptor, captured[0])
                raise OSError('simulated rename failure')

            with patch.object(bug_reports.os, 'fdopen', side_effect=record_fdopen), \
                    patch.object(bug_reports.os, 'replace', side_effect=fail_replace):
                with self.assertRaisesRegex(OSError, 'simulated rename failure'):
                    store.save(report)
            os.fstat(sentinel_fd[0])
            os.close(sentinel_fd[0])


class BugReportEndpointTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='bug-report-test-')
        self.root = Path(self.temp.name)

    def tearDown(self):
        if hasattr(self, 'running'):
            self.running.close()
        self.temp.cleanup()

    def start_preview(self, *, configured=True, trusted=False):
        reports = self.root / 'private' if configured else None
        proxies = trusted_proxy_networks(['127.0.0.1/32']) if trusted else ()
        server = PreviewServer(('127.0.0.1', 0), {}, reports_dir=reports, trusted_proxies=proxies)
        self.running = RunningServer(server)
        return self.running

    def test_preview_endpoint_acknowledges_only_saved_reports_and_has_no_read_route(self):
        running = self.start_preview()
        report = payload(running.host)
        status, response = running.request('POST', '/api/bug-reports', report)
        self.assertEqual(status, 201)
        self.assertEqual(response['saved'], True)
        path = Path(self.root / 'private' / f"{response['id']}.json")
        self.assertTrue(path.is_file())
        self.assertFalse(path.stat().st_mode & 0o077)
        self.assertEqual(json.loads(path.read_text())['pageUrl'], '/about?place=06075')
        self.assertEqual(running.request('GET', '/api/bug-reports')[0], 404)

    def test_preview_rejects_cross_site_and_honeypot_and_rate_limits(self):
        running = self.start_preview()
        status, _ = running.request('POST', '/api/bug-reports', payload(running.host), origin='http://evil.example', fetch_site='cross-site')
        self.assertEqual(status, 403)
        status, _ = running.request('POST', '/api/bug-reports', payload(running.host), origin='https://unrelated.example', fetch_site='same-origin')
        self.assertEqual(status, 403)
        status, _ = running.request('POST', '/api/bug-reports', payload(running.host), origin='http://[broken')
        self.assertEqual(status, 403)
        status, _ = running.request('POST', '/api/bug-reports', payload(running.host), origin='https://usa-xray.online')
        self.assertEqual(status, 201)
        status, _ = running.request('POST', '/api/bug-reports', payload(running.host), origin='https://usa-xray.online.evil')
        self.assertEqual(status, 403)
        status, _ = running.request('POST', '/api/bug-reports', payload(running.host, website='bot'))
        self.assertEqual(status, 400)
        for _ in range(3):
            self.assertEqual(running.request('POST', '/api/bug-reports', payload(running.host))[0], 201)
        self.assertEqual(running.request('POST', '/api/bug-reports', payload(running.host))[0], 429)

    def test_only_post_can_write_and_other_readonly_methods_advertise_get_head(self):
        running = self.start_preview()
        for method in ('PUT', 'PATCH', 'DELETE', 'OPTIONS'):
            status, _, headers = running.request(method, '/api/bug-reports', payload(running.host), include_headers=True)
            self.assertEqual(status, 405)
            self.assertEqual(headers['Allow'], 'POST')
        status, _, headers = running.request('DELETE', '/api/atlas/catalog', include_headers=True)
        self.assertEqual(status, 405)
        self.assertEqual(headers['Allow'], 'GET, HEAD')
        status, _, headers = running.request('POST', '/ux/', payload(running.host), include_headers=True)
        self.assertEqual(status, 405)
        self.assertEqual(headers['Allow'], 'GET, HEAD')
        status, _, headers = running.request('POST', '/api/atlas/catalog', payload(running.host), include_headers=True)
        self.assertEqual(status, 405)
        self.assertEqual(headers['Allow'], 'GET, HEAD')
        self.assertEqual(list((self.root / 'private').glob('*.json')), [])

    def test_trusted_proxy_forwarded_clients_get_separate_limits(self):
        running = self.start_preview(trusted=True)
        for client in ('203.0.113.10', '203.0.113.11'):
            for _ in range(5):
                status, _ = running.request('POST', '/api/bug-reports', payload(running.host),
                                            extra_headers={'X-Forwarded-For': client})
                self.assertEqual(status, 201)
            self.assertEqual(running.request('POST', '/api/bug-reports', payload(running.host),
                                             extra_headers={'X-Forwarded-For': client})[0], 429)

    def test_preview_reports_disabled_when_no_private_directory_is_configured(self):
        running = self.start_preview(configured=False)
        status, _, headers = running.request('POST', '/api/bug-reports', payload(running.host), include_headers=True)
        self.assertEqual(status, 503)
        self.assertEqual(headers['Retry-After'], '60')

    def test_local_storage_write_failure_is_retryable_service_unavailable(self):
        reports = self.root / 'private'
        self.running = RunningServer(serve.create_server(0, self.root / 'feedback', reports))
        with patch.object(self.running.server.bug_report_store, 'save', side_effect=OSError('disk full')):
            status, _, headers = self.running.request('POST', '/api/bug-reports', payload(self.running.host), include_headers=True)
        self.assertEqual(status, 503)
        self.assertEqual(headers['Retry-After'], '60')

    def test_storage_configuration_failure_keeps_both_servers_available(self):
        occupied = self.root / 'not-a-directory'
        occupied.write_text('file')
        unavailable = occupied / 'reports'
        preview = self.start_preview()
        preview.close()
        del self.running
        self.running = RunningServer(PreviewServer(('127.0.0.1', 0), {}, reports_dir=unavailable))
        status, _, headers = self.running.request('POST', '/api/bug-reports', payload(self.running.host), include_headers=True)
        self.assertEqual(status, 503)
        self.assertEqual(headers['Retry-After'], '60')
        local = RunningServer(serve.create_server(0, self.root / 'feedback', unavailable))
        try:
            status, _, headers = local.request('POST', '/api/bug-reports', payload(local.host), include_headers=True)
            self.assertEqual(status, 503)
            self.assertEqual(headers['Retry-After'], '60')
        finally:
            local.close()

    def test_local_development_endpoint_uses_separate_storage(self):
        feedback = self.root / 'review'
        reports = self.root / 'private'
        self.running = RunningServer(serve.create_server(0, feedback, reports))
        status, response = self.running.request('POST', '/api/bug-reports', payload(self.running.host))
        self.assertEqual(status, 201)
        self.assertTrue((reports / f"{response['id']}.json").is_file())
        self.assertEqual(self.running.request('GET', '/api/bug-reports')[0], 404)


if __name__ == '__main__':
    unittest.main(verbosity=2)
