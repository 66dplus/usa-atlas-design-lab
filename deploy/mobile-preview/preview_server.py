"""Read-only public preview of the existing Atlas UI and data API."""
import posixpath
import sys
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

sys.path.insert(0, '/app/scripts')
from serve import Handler
import atlas_data
from preview_catalog import catalog
atlas_data.catalog = catalog


class PreviewHandler(Handler):
    def allowed_path(self):
        raw = unquote(urlsplit(self.path).path)
        normalized = posixpath.normpath(raw)
        if raw == '/':
            return True
        if normalized != raw.rstrip('/'):
            return False
        return (normalized.startswith('/ux/') or normalized == '/ux'
                or normalized.startswith('/node_modules/')
                or normalized in ('/api/atlas/catalog', '/api/atlas/observations',
                                  '/api/view-settings'))

    def do_GET(self):
        if not self.allowed_path():
            return self.respond(404, {'error': 'Not found'})
        if urlsplit(self.path).path == '/':
            self.send_response(302)
            self.send_header('Location', '/ux/')
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        return super().do_GET()

    def do_HEAD(self):
        if not self.allowed_path():
            return self.send_error(404)
        return super().do_HEAD()

    def do_POST(self):
        return self.respond(405, {'error': 'This preview is read-only'})


if __name__ == '__main__':
    feedback_dir = Path('/tmp/usa-atlas-preview-feedback')
    feedback_dir.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(('0.0.0.0', 4180), PreviewHandler)
    server.feedback_dir = feedback_dir
    print('USA Atlas mobile preview listening on 0.0.0.0:4180', flush=True)
    server.serve_forever()
