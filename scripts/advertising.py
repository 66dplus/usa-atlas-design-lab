"""Local advertiser intake: validated creative -> configured Resend recipient."""
import base64
import binascii
import json
import math
import os
from pathlib import Path
import re
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from uuid import UUID

MAX_REQUEST = 8 * 1024 * 1024
MAX_IMAGE = 5 * 1024 * 1024
SAMPLE_IMAGE = 'assets/san-francisco-photo.jpg'
ROOT = Path(__file__).resolve().parent.parent


class DeliveryUnavailable(Exception):
    pass


def configured():
    return all(os.environ.get(key, '').strip() for key in
               ('RESEND_API_KEY', 'ATLAS_AD_FROM', 'ATLAS_AD_TO'))


def text(obj, key, maximum, required=False):
    value = obj.get(key)
    if not isinstance(value, str) or len(value) > maximum or '\x00' in value:
        raise ValueError('Invalid ' + key)
    if required and not value.strip():
        raise ValueError(key + ' is required')
    return value


def validate(data, metrics):
    if not isinstance(data, dict) or data.get('version') != 1:
        raise ValueError('Unsupported ad request')
    try:
        UUID(data['requestId'])
    except (KeyError, ValueError, TypeError, AttributeError):
        raise ValueError('Invalid request ID') from None
    creative, contact = data.get('creative'), data.get('contact')
    if not isinstance(creative, dict) or not isinstance(contact, dict):
        raise ValueError('Creative and contact details are required')
    for key, options in {'format': ('banner', 'ticker'), 'theme': ('graphite', 'light'),
                         'speed': ('slow', 'normal', 'fast')}.items():
        if creative.get(key) not in options:
            raise ValueError('Invalid ' + key)
    for key, limit, required in [('headline', 70, True), ('subtitle', 140, False),
                                 ('cta', 28, True), ('url', 2048, True)]:
        text(creative, key, limit, required)
    url = urlsplit(creative['url'])
    if url.scheme not in ('https', 'http') or not url.hostname or url.username or url.password:
        raise ValueError('Use an http or https destination URL without credentials')
    for key, low, high in [('imageArea', 20, 70), ('imageZoom', 100, 200), ('imagePosition', 0, 100)]:
        value = creative.get(key)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high:
            raise ValueError('Invalid ' + key)
    devices = creative.get('devices')
    if not isinstance(devices, list) or not devices or not all(isinstance(d, str) for d in devices) or len(devices) != len(set(devices)) or any(d not in ('desktop', 'mobile') for d in devices):
        raise ValueError('Select at least one valid device')
    indicators = creative.get('indicators')
    available = {m['id'] for m in metrics if m.get('plannedState') != 'proposed'}
    if not isinstance(indicators, list) or not indicators or not all(isinstance(i, str) for i in indicators) or len(indicators) != len(set(indicators)) or not set(indicators) <= available:
        raise ValueError('Select valid published catalog indicators')
    for key, limit, required in [('name', 100, True), ('company', 120, False),
                                 ('email', 254, True), ('message', 2000, False)]:
        text(contact, key, limit, required)
    if not re.fullmatch(r'[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+', contact['email']):
        raise ValueError('Enter a valid contact email')
    image = text(creative, 'image', 7 * 1024 * 1024, True)
    attachment = None
    if creative['format'] == 'banner':
        if image == SAMPLE_IMAGE:
            attachment = {'filename': 'example-photo.jpg', 'content': base64.b64encode((ROOT / 'ux' / image).read_bytes()).decode()}
        else:
            match = re.fullmatch(r'data:image/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)', image)
            if not match:
                raise ValueError('Choose a JPG, PNG or WebP image')
            try:
                raw = base64.b64decode(match[2], validate=True)
            except binascii.Error:
                raise ValueError('Invalid image encoding') from None
            kind = match[1]
            signature = (raw.startswith(b'\xff\xd8\xff') if kind == 'jpeg' else
                         raw.startswith(b'\x89PNG\r\n\x1a\n') if kind == 'png' else
                         raw.startswith(b'RIFF') and raw[8:12] == b'WEBP')
            if not raw or len(raw) > MAX_IMAGE or not signature:
                raise ValueError('Invalid image or image exceeds 5 MB')
            attachment = {'filename': 'creative.' + ('jpg' if kind == 'jpeg' else kind), 'content': match[2]}
    return attachment


def send_request(data, metrics, opener=urlopen):
    if not configured():
        raise DeliveryUnavailable('Email delivery is not configured. Download your draft instead.')
    attachment = validate(data, metrics)
    creative, contact = data['creative'], data['contact']
    names = {m['id']: m['name'] for m in metrics}
    lines = ['USA Atlas advertising request', '', 'Name: ' + contact['name'],
             'Company: ' + contact['company'], 'Email: ' + contact['email'], '',
             'Format: ' + creative['format'], 'Headline: ' + creative['headline'],
             'Supporting text: ' + creative['subtitle'], 'CTA: ' + creative['cta'],
             'Destination: ' + creative['url'], 'Devices: ' + ', '.join(creative['devices']),
             'Indicators: ' + ', '.join(names[i] for i in creative['indicators']),
             '', contact['message'], '', 'Preview request only. No ad has been published.']
    attachments = [{'filename': 'ad-request.json', 'content': base64.b64encode(json.dumps(data, ensure_ascii=False, indent=2).encode()).decode()}]
    if attachment:
        attachments.append(attachment)
    payload = {'from': os.environ['ATLAS_AD_FROM'], 'to': [os.environ['ATLAS_AD_TO']],
               'reply_to': contact['email'], 'subject': 'USA Atlas — advertising request',
               'text': '\n'.join(lines), 'attachments': attachments}
    request = Request('https://api.resend.com/emails', json.dumps(payload).encode(),
                      headers={'Authorization': 'Bearer ' + os.environ['RESEND_API_KEY'],
                               'Content-Type': 'application/json',
                               'User-Agent': 'USA-Atlas-Local-Advertising/1',
                               'Idempotency-Key': 'atlas-ad/' + data['requestId']}, method='POST')
    try:
        with opener(request, timeout=20) as response:
            result = json.load(response)
    except HTTPError:
        raise DeliveryUnavailable('The email provider rejected this request. Check the server’s Resend configuration.') from None
    except (URLError, TimeoutError, OSError, ValueError):
        raise DeliveryUnavailable('Email delivery was not confirmed. Retry the unchanged draft to avoid a duplicate.') from None
    if not isinstance(result, dict) or not isinstance(result.get('id'), str) or not result['id']:
        raise DeliveryUnavailable('Email delivery was not confirmed. Retry the unchanged draft to avoid a duplicate.')
    return {'id': result['id']}
