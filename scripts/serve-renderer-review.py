"""Isolated loopback review server: frozen observations, no writes or credentials."""
import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
from urllib.parse import parse_qs, urlsplit


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--data', type=Path, required=True)
    parser.add_argument('--port', type=int, default=4438)
    args = parser.parse_args()

    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *handler_args, **kwargs):
            super().__init__(*handler_args, directory=str(args.root), **kwargs)

        def log_message(self, *_):
            pass

        def send_json(self, payload, status=200):
            data = json.dumps(payload).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            url = urlsplit(self.path)
            if url.path == '/api/atlas/catalog':
                return self.send_json(json.loads((args.data / 'catalog.json').read_text()))
            if url.path == '/api/atlas/observations':
                field = parse_qs(url.query).get('field', [''])[0]
                allowed = {record['field']: record['file'] for record in
                           json.loads((args.data / 'snapshot-manifest.json').read_text())['records']}
                if field not in allowed:
                    return self.send_json({'error': 'Series not captured in this review snapshot'}, 404)
                return self.send_json(json.loads((args.data / allowed[field]).read_text()))
            if url.path == '/api/analytics/config':
                return self.send_json({'enabled': False})
            if url.path == '/api/view-settings':
                settings = json.loads((args.root / 'ux/view-settings.json').read_text())
                return self.send_json({**settings, 'savedAt': None})
            return super().do_GET()

        def do_POST(self):
            return self.send_json({'error': 'Isolated review is read-only'}, 405)

        do_PUT = do_PATCH = do_DELETE = do_POST

    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    print(f'Isolated frozen-data review: http://127.0.0.1:{args.port}/ux/', flush=True)
    server.serve_forever()


if __name__ == '__main__':
    main()
