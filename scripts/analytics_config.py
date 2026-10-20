"""Public tracker configuration. Authentication credentials are never returned."""
import os
from urllib.parse import urlsplit
from uuid import UUID


def public_config():
    if os.environ.get('ATLAS_ANALYTICS_ENABLED') != '1':
        return {'enabled': False}
    website_id = str(UUID(os.environ.get('ATLAS_ANALYTICS_WEBSITE_ID', '')))
    base = os.environ.get('ATLAS_ANALYTICS_URL', '').rstrip('/')
    url = urlsplit(base)
    if url.scheme not in ('http', 'https') or not url.hostname or url.username or url.password or url.query or url.fragment or url.path:
        raise ValueError('ATLAS_ANALYTICS_URL must be an origin without credentials')
    return {'enabled': True, 'websiteId': website_id, 'scriptUrl': base + '/script.js'}
