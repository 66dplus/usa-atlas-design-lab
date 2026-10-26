"""Permanent loopback public relay with an explicit request-header boundary.

The preview server only answers requests whose Host header is 127.0.0.1:4429.
The existing public nginx service connects over loopback. Preserve its origin,
JSON and client-chain metadata while rewriting Host and compressing responses.
"""
import gzip
import http.client
import io
import ipaddress
import re
import socketserver

LISTEN_HOST = '127.0.0.1'
LISTEN_PORT = 8099
ORIGIN_HOST = '172.19.0.4'
ORIGIN_PORT = 4429
ORIGIN_HOST_HEADER = '127.0.0.1:4429'
COMPRESSIBLE = ('application/json', 'application/javascript', 'text/css',
                'text/javascript', 'image/svg+xml', 'text/html', 'application/xml')
COMPRESS_MIN_BYTES = 8192
FORWARDED = {'origin': 'Origin', 'sec-fetch-site': 'Sec-Fetch-Site',
             'content-type': 'Content-Type', 'x-forwarded-for': 'X-Forwarded-For'}
MAX_BODY_BYTES = 8 * 1024 * 1024
HOP_BY_HOP = ('host', 'connection', 'proxy-connection', 'keep-alive', 'te',
              'trailer', 'transfer-encoding', 'upgrade', 'accept-encoding',
              'content-encoding', 'content-length')


class Proxy(socketserver.StreamRequestHandler):
    def request_headers(self, lines):
        values = {}
        for line in lines:
            name, separator, value = line.decode('latin-1').partition(':')
            if not separator or not re.fullmatch(r"[!#$%&'*+.^_`|~0-9A-Za-z-]+", name):
                raise ValueError('Invalid header')
            values.setdefault(name.lower(), []).append(value.strip())
        if 'transfer-encoding' in values:
            raise ValueError('Chunked requests are unsupported')
        for name in (*FORWARDED, 'content-length'):
            if len(values.get(name, [])) > 1:
                raise ValueError('Ambiguous request metadata')
        length = values.get('content-length', ['0'])[0]
        if not re.fullmatch(r'[0-9]{1,10}', length) or int(length) > MAX_BODY_BYTES:
            raise ValueError('Invalid request size')
        connection_fields = {part.strip().lower() for value in values.get('connection', [])
                             for part in value.split(',')}
        outgoing = {'Host': self.server.origin_host_header, 'Connection': 'close',
                    'Accept-Encoding': 'identity'}
        for name, target in FORWARDED.items():
            if name not in values or name in connection_fields:
                continue
            value = values[name][0]
            if len(value) > (512 if name == 'x-forwarded-for' else 2048):
                raise ValueError('Oversized request metadata')
            if name == 'x-forwarded-for':
                if not ipaddress.ip_address(self.client_address[0]).is_loopback:
                    continue
                chain = value.split(',')
                if not 1 <= len(chain) <= 10:
                    raise ValueError('Invalid client chain')
                for address in chain:
                    ipaddress.ip_address(address.strip())
            outgoing[target] = value
        return int(length), any('gzip' in value.lower() for value in values.get('accept-encoding', [])), outgoing

    def handle(self):
        self.connection.settimeout(90)
        try:
            request_line = self.rfile.readline(65536)
            if not request_line:
                return
            if len(request_line) >= 65536:
                raise ValueError('Oversized request')
            headers = []
            size = 0
            while True:
                line = self.rfile.readline(65536)
                if line in (b'\r\n', b'\n', b''):
                    break
                size += len(line)
                if size > 65536 or len(headers) >= 100:
                    raise ValueError('Oversized headers')
                headers.append(line)
            method, path, _ = request_line.decode('latin-1').split(' ', 2)
            if not path.startswith('/') or path.startswith('//'):
                raise ValueError('Expected origin-form path')
            length, accept_gzip, outgoing = self.request_headers(headers)
            body = self.rfile.read(length) if length else b''
            if len(body) != length:
                raise ValueError('Incomplete request')
        except ValueError:
            self.connection.sendall(b'HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\nConnection: close\r\n\r\n')
            return
        except OSError:
            return
        try:
            connection = http.client.HTTPConnection(self.server.origin_host, self.server.origin_port, timeout=90)
            connection.request(method, path, body=body, headers=outgoing)
            response = connection.getresponse()
            payload = response.read()
            content_type = response.getheader('Content-Type', '') or ''
            if (accept_gzip and len(payload) >= COMPRESS_MIN_BYTES
                    and any(content_type.startswith(kind) for kind in COMPRESSIBLE)):
                buffer = io.BytesIO()
                with gzip.GzipFile(fileobj=buffer, mode='wb', compresslevel=6) as compressor:
                    compressor.write(payload)
                payload = buffer.getvalue()
                extra_headers = [(b'Content-Encoding', b'gzip')]
            else:
                extra_headers = []
            connection.close()
            out = [b'HTTP/1.1 ' + str(response.status).encode() + b' ' + response.reason.encode() + b'\r\n']
            for name, value in response.getheaders():
                if name.lower() in HOP_BY_HOP:
                    continue
                out.append(name.encode() + b': ' + value.encode() + b'\r\n')
            for name, value in extra_headers:
                out.append(name + b': ' + value + b'\r\n')
            out.append(b'Content-Length: ' + str(len(payload)).encode() + b'\r\n')
            out.append(b'Connection: close\r\n\r\n')
            self.connection.sendall(b''.join(out) + payload)
        except OSError:
            try:
                self.connection.sendall(b'HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n'
                                        b'Connection: close\r\n\r\n')
            except OSError:
                pass


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

    def __init__(self, address, handler=Proxy, *, origin_host=ORIGIN_HOST,
                 origin_port=ORIGIN_PORT, origin_host_header=ORIGIN_HOST_HEADER):
        self.origin_host, self.origin_port = origin_host, origin_port
        self.origin_host_header = origin_host_header
        super().__init__(address, handler)


if __name__ == '__main__':
    with Server((LISTEN_HOST, LISTEN_PORT), Proxy) as server:
        server.serve_forever()
