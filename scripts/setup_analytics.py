"""Initialize only the new local Umami service; keep credentials outside Git."""
import argparse
import os
import secrets
from pathlib import Path
from analytics_api import UmamiAPI, read_env


def initialize_secrets(path):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    try:
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        print('Existing private analytics file preserved.')
        return
    with os.fdopen(descriptor, 'w') as stream:
        for key in ('UMAMI_DB_PASSWORD', 'UMAMI_APP_SECRET', 'UMAMI_2FA_KEY', 'UMAMI_ADMIN_PASSWORD'):
            stream.write(key + '=' + secrets.token_hex(32) + '\n')
    print('Private analytics secrets initialized outside Git.')


def setup(path):
    values = read_env(path)
    api = UmamiAPI('http://127.0.0.1:4300')
    try:
        api.login(values['UMAMI_ADMIN_PASSWORD'])
    except RuntimeError:
        if 'ATLAS_ANALYTICS_WEBSITE_ID' in values:
            raise
        user = api.login('umami')
        api.request('/api/users/' + user['id'], {'password': values['UMAMI_ADMIN_PASSWORD']})
        api.login(values['UMAMI_ADMIN_PASSWORD'])
    websites = api.request('/api/websites')['data']
    for name, key in [('USA Atlas · Local', 'ATLAS_ANALYTICS_WEBSITE_ID'), ('USA Atlas · Browser QA', 'ATLAS_ANALYTICS_TEST_WEBSITE_ID')]:
        website = next((item for item in websites if item['name'] == name), None)
        if website is None:
            website = api.request('/api/websites', {'name': name, 'domain': 'localhost'})
        values[key] = website['id']
    values.update(ATLAS_ANALYTICS_URL='http://127.0.0.1:4300', ATLAS_ANALYTICS_ENABLED='1')
    temporary = Path(str(path) + '.tmp')
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    os.fchmod(descriptor, 0o600)
    with os.fdopen(descriptor, 'w') as stream:
        stream.write(''.join(key + '=' + value + '\n' for key, value in values.items()))
    temporary.replace(path)
    print('Local Umami initialized; Local and Browser QA website IDs saved. No credentials printed.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--secrets-file', type=Path, default=Path.home() / '.config/usa-atlas/analytics.env')
    parser.add_argument('--init-secrets', action='store_true', help='Create the private file before Docker starts; preserve an existing file')
    args = parser.parse_args()
    if args.init_secrets:
        initialize_secrets(args.secrets_file)
    else:
        setup(args.secrets_file)
