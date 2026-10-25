"""Private, write-only storage for application bug reports."""
from collections import deque
from datetime import datetime, timezone
import ipaddress
import json
import os
from pathlib import Path
import re
import tempfile
import threading
import time
from urllib.parse import parse_qsl, urlencode, urlsplit
from uuid import uuid4

MAX_REPORT_BODY = 12 * 1024
_EMAIL = re.compile(r"^[^\s@<>]{1,64}@[^\s@<>.]+(?:\.[^\s@<>.]+)+$")
_IDENTIFIER = re.compile(r'^[A-Za-z0-9._-]{1,100}$')
_CONTEXT_KEYS = {'page', 'placeId', 'place', 'indicatorId', 'indicator', 'period'}
_PAGES = {'about', 'support', 'map', 'compare', 'stats', 'blog', 'article'}
_PUBLIC_PATH = re.compile(r'^/(?:about|support|stats|blog(?:/[a-z0-9-]{1,64})?|compare(?:/[a-z0-9-]{1,64}){1,7}|united-states(?:/[a-z0-9-]{1,64}){0,4})$')
_QUERY_KEYS = ('embed', 'preview', 'review', 'view', 'place', 'other', 'metric', 'metric2', 'comparison', 'rank')
_QUERY_VALUES = {
    'embed': re.compile(r'^1$'),
    'preview': re.compile(r'^1$'),
    'review': re.compile(r'^1$'),
    'view': re.compile(r'^(?:2d|3d)$'),
    'place': re.compile(r'^(?:US|[0-9]{2,5})$'),
    'other': re.compile(r'^(?:US|[0-9]{2,5})$'),
    'metric': re.compile(r'^[A-Za-z0-9._:-]{1,100}$'),
    'metric2': re.compile(r'^[A-Za-z0-9._:-]{1,100}$'),
    'comparison': re.compile(r'^(?:metrics|places)$'),
    'rank': re.compile(r'^(?:highest|lowest)$'),
}


def _text(value, field, maximum, *, multiline=False, optional=False):
    if value is None and optional:
        return ''
    if not isinstance(value, str):
        raise ValueError(f'Invalid {field}')
    value = value.strip()
    if optional and not value:
        return ''
    if not value or len(value) > maximum:
        raise ValueError(f'{field.capitalize()} must be between 1 and {maximum} characters')
    allowed_controls = {'\n', '\r', '\t'} if multiline else set()
    if any(ord(char) < 32 and char not in allowed_controls for char in value):
        raise ValueError(f'Invalid {field}')
    return value


def sanitize_page_url(value):
    """Keep only an approved public route and recognized, bounded app state."""
    value = _text(value, 'page URL', 2048)
    try:
        parsed = urlsplit(value)
    except ValueError:
        raise ValueError('The page URL must be a public USA X-Ray route') from None
    if parsed.scheme or parsed.netloc or parsed.path.startswith('//') or '\\' in parsed.path or not _PUBLIC_PATH.fullmatch(parsed.path):
        raise ValueError('The page URL must be a public USA X-Ray route')
    try:
        pairs = parse_qsl(parsed.query, keep_blank_values=True, max_num_fields=24)
    except ValueError:
        pairs = []
    values = {}
    duplicates = set()
    for key, item in pairs:
        if key not in _QUERY_VALUES:
            continue
        if key in values:
            duplicates.add(key)
        else:
            values[key] = item
    query = []
    for key in _QUERY_KEYS:
        item = values.get(key)
        if key in duplicates or item is None or not _QUERY_VALUES[key].fullmatch(item):
            continue
        query.append((key, item))
    return parsed.path + (f'?{urlencode(query)}' if query else '')


def validate_report(data):
    if not isinstance(data, dict) or set(data) != {'pageUrl', 'description', 'contact', 'context', 'website'}:
        raise ValueError('Invalid report fields')
    if not isinstance(data['website'], str):
        raise ValueError('Invalid report')
    if data['website'].strip():
        raise ValueError('Invalid report')

    page_url = sanitize_page_url(data['pageUrl'])

    description = _text(data['description'], 'description', 4000, multiline=True)
    if len(description) < 8:
        raise ValueError('Description must be at least 8 characters')
    contact = _text(data['contact'], 'contact', 254, optional=True)
    if contact and not _EMAIL.fullmatch(contact):
        try:
            contact_url = urlsplit(contact)
            if (contact_url.scheme != 'https' or not contact_url.hostname or
                    contact_url.username or contact_url.password or len(contact) > 254):
                raise ValueError
        except ValueError:
            raise ValueError('Enter an email address or an https profile link') from None

    context = data['context']
    if not isinstance(context, dict) or set(context) - _CONTEXT_KEYS:
        raise ValueError('Invalid report context')
    clean_context = {}
    for key, maximum in (('page', 32), ('placeId', 100), ('place', 160),
                         ('indicatorId', 100), ('indicator', 160), ('period', 80)):
        value = context.get(key)
        if value in (None, ''):
            continue
        value = _text(value, key, maximum)
        if key == 'page' and value not in _PAGES:
            raise ValueError('Invalid page context')
        if key in ('placeId', 'indicatorId') and not _IDENTIFIER.fullmatch(value):
            raise ValueError('Invalid report context')
        clean_context[key] = value

    return {
        'id': str(uuid4()),
        'createdAt': datetime.now(timezone.utc).isoformat(),
        'pageUrl': page_url,
        'description': description,
        'contact': contact or None,
        'context': clean_context,
    }


class BugReportStore:
    """Append private reports outside the served asset tree; there is no list/read API."""
    def __init__(self, directory, public_root=None):
        self.directory = Path(directory).expanduser().resolve()
        if public_root is not None and self.directory.is_relative_to(Path(public_root).resolve()):
            raise ValueError('Bug report storage must be outside the public application tree')
        self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        os.chmod(self.directory, 0o700)

    def save(self, report):
        report_id = report['id']
        final_path = self.directory / f'{report_id}.json'
        descriptor, temporary_path = tempfile.mkstemp(prefix='.pending-', dir=self.directory)
        descriptor_open = True
        replaced = False
        try:
            os.fchmod(descriptor, 0o600)
            stream = os.fdopen(descriptor, 'w', encoding='utf-8')
            descriptor_open = False
            with stream:
                json.dump(report, stream, ensure_ascii=False, separators=(',', ':'))
                stream.write('\n')
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary_path, final_path)
            replaced = True
            directory_fd = os.open(self.directory, os.O_RDONLY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
        except BaseException:
            if descriptor_open:
                try:
                    os.close(descriptor)
                except OSError:
                    pass
            try:
                os.unlink(temporary_path)
            except FileNotFoundError:
                pass
            if replaced:
                try:
                    os.unlink(final_path)
                except FileNotFoundError:
                    pass
            raise
        return report_id


class ReportRateLimiter:
    """Keep a small, in-memory per-client window. Client addresses are never saved."""
    def __init__(self, limit=5, window_seconds=3600):
        self.limit = limit
        self.window_seconds = window_seconds
        self.events = {}
        self.lock = threading.Lock()

    def allow(self, identity, now=None):
        now = now if now is not None else time.monotonic()
        with self.lock:
            for key, values in list(self.events.items()):
                while values and now - values[0] >= self.window_seconds:
                    values.popleft()
                if not values:
                    self.events.pop(key, None)
            values = self.events.setdefault(identity, deque())
            if len(values) >= self.limit:
                return False
            values.append(now)
            if len(self.events) > 4096:
                self.events.pop(next(iter(self.events)))
            return True


def create_report_store(directory, public_root):
    """Storage trouble disables submissions without taking the app server down."""
    if directory is None:
        return None
    try:
        return BugReportStore(directory, public_root)
    except (OSError, ValueError, RuntimeError):
        return None


def trusted_proxy_networks(values=()):
    try:
        return tuple(ipaddress.ip_network(value, strict=False) for value in values)
    except ValueError:
        raise ValueError('Invalid trusted proxy address or network') from None


def report_rate_limit_identity(remote_address, headers, trusted_proxies=()):
    """Use forwarding only when the socket peer was explicitly trusted."""
    try:
        peer = ipaddress.ip_address(remote_address)
    except ValueError:
        return 'unknown-peer'

    def is_trusted(address):
        return any(address in network for network in trusted_proxies)

    if not is_trusted(peer):
        return peer.compressed
    forwarded = headers.get('X-Forwarded-For', '')
    if not forwarded or len(forwarded) > 512:
        return peer.compressed
    try:
        chain = [ipaddress.ip_address(value.strip()) for value in forwarded.split(',')]
    except ValueError:
        return peer.compressed
    if not chain or len(chain) > 10:
        return peer.compressed
    client = peer
    for address in reversed(chain):
        if not is_trusted(client):
            break
        client = address
    return client.compressed


def same_origin(headers):
    origin = headers.get('Origin', '')
    try:
        parsed = urlsplit(origin)
        hostname = parsed.hostname
        port = parsed.port
    except ValueError:
        return False
    if not hostname or parsed.username or parsed.password or parsed.path not in ('', '/') or parsed.query or parsed.fragment:
        return False
    fetch_site = headers.get('Sec-Fetch-Site', '').lower()
    if fetch_site in ('cross-site', 'none'):
        return False
    if parsed.scheme == 'https' and hostname.casefold() == 'usa-xray.online' and port in (None, 443):
        return parsed.netloc.casefold() in ('usa-xray.online', 'usa-xray.online:443')
    if parsed.scheme != 'http':
        return False
    try:
        local_origin = hostname.casefold() == 'localhost' or ipaddress.ip_address(hostname).is_loopback
        request_host = headers.get('Host', '')
        request_authority = urlsplit('//' + request_host)
        request_host_name = request_authority.hostname
        request_port = request_authority.port
        local_request_host = (request_host_name.casefold() == 'localhost' or
                              ipaddress.ip_address(request_host_name).is_loopback) if request_host_name else False
    except ValueError:
        return False
    return (local_origin and local_request_host and
            parsed.netloc.casefold() == request_host.casefold() and
            hostname.casefold() == request_host_name.casefold() and port == request_port)
