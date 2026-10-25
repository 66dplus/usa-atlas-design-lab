"""Initialize the standalone production Umami service and render public config."""
import argparse
import json
import os
from pathlib import Path
import re
import secrets
import stat
import sys
import tempfile
from urllib.parse import quote, urlsplit
from uuid import UUID

from analytics_api import UmamiAPI


SECRET_KEYS = (
    'UMAMI_DB_PASSWORD',
    'UMAMI_APP_SECRET',
    'UMAMI_2FA_KEY',
    'UMAMI_ADMIN_PASSWORD',
)
PRODUCTION_ID_KEY = 'ATLAS_ANALYTICS_WEBSITE_ID'
QA_ID_KEY = 'ATLAS_ANALYTICS_TEST_WEBSITE_ID'
ALLOWED_KEYS = set(SECRET_KEYS) | {
    'ATLAS_ANALYTICS_URL', PRODUCTION_ID_KEY, QA_ID_KEY,
}
WEBSITES = (
    ("USA X-Ray Production", PRODUCTION_ID_KEY),
    ("USA X-Ray Production QA", QA_ID_KEY),
)
DOMAIN = 'usa-xray.online'
TRACKER_URL = '/analytics/script.js'
CONFIG_URL = 'https://usa-xray.online/api/analytics/config'
PLACEHOLDER = '__PRODUCTION_WEBSITE_ID__'
DEFAULT_ORIGIN = 'http://127.0.0.1:4300'
TEMPLATE_PATH = Path(__file__).resolve().parent.parent / 'deploy/analytics/nginx-production.conf.template'
REPOSITORY_ROOT = TEMPLATE_PATH.parents[2]


class SetupError(Exception):
    """An expected error with a safe, concise message."""


def env_text(values):
    return ''.join(f'{key}={value}\n' for key, value in values.items())


def sync_directory(directory):
    descriptor = os.open(directory, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def atomic_write(path, content, mode):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700 if mode == 0o600 else 0o755)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f'.{path.name}.', dir=path.parent)
    temporary = Path(temporary_name)
    try:
        os.fchmod(descriptor, mode)
        with os.fdopen(descriptor, 'w', encoding='utf-8') as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        sync_directory(path.parent)
    except BaseException:
        try:
            os.close(descriptor)
        except OSError:
            pass
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass
        raise


def initialize_secrets(path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    content = env_text({key: secrets.token_hex(32) for key in SECRET_KEYS})
    descriptor, temporary_name = tempfile.mkstemp(prefix=f'.{path.name}.', dir=path.parent)
    temporary = Path(temporary_name)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, 'w', encoding='utf-8') as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        try:
            # A same-directory hard link atomically creates the target without
            # replacing a file another operator may have created concurrently.
            os.link(temporary, path)
        except FileExistsError:
            try:
                existing = path.lstat()
                if not stat.S_ISREG(existing.st_mode):
                    raise SetupError('Existing private analytics path is not a regular file.')
                os.chmod(path, 0o600)
            except OSError:
                raise SetupError('Could not secure the existing private analytics file.') from None
            print('Existing private analytics file preserved.')
            return False
        sync_directory(path.parent)
    finally:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass
    print('Private production analytics secrets initialized; values were not displayed.')
    return True


def read_private_env(path):
    try:
        lines = Path(path).read_text(encoding='utf-8').splitlines()
    except (OSError, UnicodeError):
        raise SetupError('Could not read the private analytics file.') from None
    values = {}
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith('#'):
            continue
        key, separator, value = line.partition('=')
        if not separator or not re.fullmatch(r'[A-Z][A-Z0-9_]*', key) or key not in ALLOWED_KEYS:
            raise SetupError('The private file must contain only supported analytics settings.')
        if key in values:
            raise SetupError('The private analytics file contains a duplicate setting.')
        values[key] = value
    for key in SECRET_KEYS:
        if not values.get(key):
            raise SetupError('The private analytics file is missing a required secret; initialize or repair it securely.')
    return values


def validate_uuid(value, setting):
    try:
        parsed = UUID(value)
    except (ValueError, TypeError, AttributeError):
        raise SetupError(f'{setting} is not a valid website ID.') from None
    if str(parsed) != value:
        raise SetupError(f'{setting} is not a canonical website ID.')
    return value


def validate_origin(origin):
    try:
        parsed = urlsplit(origin)
        parsed.port  # Validate that an explicitly supplied port is numeric and in range.
        valid = bool(parsed.scheme in ('http', 'https') and parsed.hostname and
                 parsed.username is None and parsed.password is None and
                 not parsed.path and not parsed.query and not parsed.fragment)
    except (TypeError, ValueError):
        valid = False
    if not valid:
        raise SetupError('Origin must be an HTTP(S) origin without credentials, path, query, or fragment.')
    return origin.rstrip('/')


def is_auth_rejection(error):
    return str(error) == 'Umami returned HTTP 401 for /api/auth/login'


def login(api, password, has_saved_ids):
    try:
        return api.login(password)
    except RuntimeError as error:
        if not is_auth_rejection(error):
            raise SetupError('Umami admin authentication failed; check service health and the private credentials.') from None
        if has_saved_ids:
            raise SetupError('The saved admin password did not authenticate while website IDs exist; refusing bootstrap recovery.') from None

    try:
        user = api.login('umami')
    except Exception:
        raise SetupError('Admin authentication failed; verify first-start state and the private credentials.') from None
    user_id = user.get('id') if isinstance(user, dict) else None
    if not isinstance(user_id, str) or not user_id or len(user_id) > 200:
        raise SetupError('Umami returned an invalid admin identity during first-start setup.')
    try:
        api.request('/api/users/' + quote(user_id, safe=''), {'password': password})
    except Exception:
        raise SetupError('Could not replace the initial Umami admin password.') from None
    try:
        return api.login(password)
    except Exception:
        raise SetupError('The new admin password did not authenticate after first-start setup.') from None


def website_record(api, name, setting, saved_id, websites):
    named = [item for item in websites if isinstance(item, dict) and item.get('name') == name]
    if len(named) > 1:
        raise SetupError('Multiple Umami websites have the same required name; resolve the duplicate manually.')
    if named:
        website = named[0]
        if website.get('domain') != DOMAIN:
            raise SetupError('A required Umami website has the expected name but a different domain.')
    else:
        if saved_id:
            raise SetupError('A saved website ID no longer matches a required Umami website; refusing to recreate it.')
        try:
            website = api.request('/api/websites', {'name': name, 'domain': DOMAIN})
        except Exception:
            raise SetupError('Could not create a required Umami website.') from None
    if not isinstance(website, dict) or website.get('name') != name or website.get('domain') != DOMAIN:
        raise SetupError('Umami returned a website record with unexpected name or domain.')
    website_id = validate_uuid(website.get('id'), setting)
    if saved_id and website_id != saved_id:
        raise SetupError('A saved website ID does not match the required Umami website; refusing to change it.')
    return website_id


def template_text(website_id):
    try:
        template = TEMPLATE_PATH.read_text(encoding='utf-8')
    except (OSError, UnicodeError):
        raise SetupError('Could not read the production Nginx template.') from None
    if template.count(PLACEHOLDER) != 1:
        raise SetupError('The production Nginx template must contain exactly one website ID placeholder.')
    return template.replace(PLACEHOLDER, validate_uuid(website_id, PRODUCTION_ID_KEY))


def public_config_text(production_id, qa_id):
    return json.dumps({
        'productionWebsiteId': validate_uuid(production_id, PRODUCTION_ID_KEY),
        'qaWebsiteId': validate_uuid(qa_id, QA_ID_KEY),
        'scriptUrl': TRACKER_URL,
        'configUrl': CONFIG_URL,
    }, indent=2) + '\n'


def validate_external_paths(secrets_file, output_paths=()):
    paths = [Path(secrets_file), *(Path(path) for path in output_paths if path)]
    resolved = []
    for path in paths:
        # Check both the normalized spelling and resolved target: atomic replace
        # must never turn a repository symlink into an in-tree secret file.
        for candidate in (Path(os.path.abspath(path)), path.resolve(strict=False)):
            try:
                candidate.relative_to(REPOSITORY_ROOT)
            except ValueError:
                continue
            raise SetupError('Private credentials and generated files must be outside the repository.')
        resolved.append(path.resolve(strict=False))
    if len(set(resolved)) != len(resolved):
        raise SetupError('The secrets file and output paths must be different files.')


def setup(args):
    validate_external_paths(args.secrets_file, (args.nginx_output, args.public_config_output))
    values = read_private_env(args.secrets_file)
    origin = validate_origin(args.origin)
    saved_ids = {}
    for key, label in ((PRODUCTION_ID_KEY, 'production website ID'), (QA_ID_KEY, 'QA website ID')):
        if key in values:
            saved_ids[key] = validate_uuid(values[key], label)
    has_saved_ids = bool(saved_ids)

    rendered_template = None
    if args.nginx_output:
        # Validate the template before making any API-side changes.
        try:
            initial_template = TEMPLATE_PATH.read_text(encoding='utf-8')
        except (OSError, UnicodeError):
            raise SetupError('Could not read the production Nginx template.') from None
        if initial_template.count(PLACEHOLDER) != 1:
            raise SetupError('The production Nginx template must contain exactly one website ID placeholder.')

    api = UmamiAPI(origin)
    login(api, values['UMAMI_ADMIN_PASSWORD'], has_saved_ids)
    try:
        result = api.request('/api/websites')
    except Exception:
        raise SetupError('Could not list Umami websites.') from None
    websites = result.get('data') if isinstance(result, dict) else None
    if not isinstance(websites, list):
        raise SetupError('Umami returned an invalid website list.')

    website_ids = {}
    for name, key in WEBSITES:
        website_ids[key] = website_record(api, name, key, saved_ids.get(key), websites)
        # Include newly created sites while resolving the next required site.
        websites = [item for item in websites if not (isinstance(item, dict) and item.get('name') == name)]
        websites.append({'id': website_ids[key], 'name': name, 'domain': DOMAIN})

    values['ATLAS_ANALYTICS_URL'] = origin
    values[PRODUCTION_ID_KEY] = website_ids[PRODUCTION_ID_KEY]
    values[QA_ID_KEY] = website_ids[QA_ID_KEY]
    if args.nginx_output:
        rendered_template = template_text(website_ids[PRODUCTION_ID_KEY])
    rendered_public = None
    if args.public_config_output:
        rendered_public = public_config_text(website_ids[PRODUCTION_ID_KEY], website_ids[QA_ID_KEY])

    # The private file changes only after authentication, API readback, website
    # validation, and requested output rendering have all succeeded.
    atomic_write(args.secrets_file, env_text(values), 0o600)
    if args.nginx_output:
        atomic_write(args.nginx_output, rendered_template, 0o644)
    if args.public_config_output:
        atomic_write(args.public_config_output, rendered_public, 0o644)
    print('Production and QA Umami websites verified; private IDs saved and requested public files rendered.')


def build_parser():
    parser = argparse.ArgumentParser(description='Initialize the independent production Umami service.')
    parser.add_argument('--secrets-file', type=Path, required=True,
                        help='Private analytics environment file outside the repository')
    parser.add_argument('--origin', default=DEFAULT_ORIGIN,
                        help='Private Umami origin used for setup (default: loopback)')
    parser.add_argument('--init-secrets', action='store_true',
                        help='Create an independent 0600 secrets file if it does not already exist')
    parser.add_argument('--nginx-output', type=Path,
                        help='Render the exact production Nginx locations using only the production website ID')
    parser.add_argument('--public-config-output', type=Path,
                        help='Write website IDs and public URLs without credentials')
    return parser


def main():
    parser = build_parser()
    args = parser.parse_args()
    try:
        if args.init_secrets:
            if args.nginx_output or args.public_config_output:
                parser.error('--init-secrets cannot be combined with output options')
            validate_external_paths(args.secrets_file)
            initialize_secrets(args.secrets_file)
            return 0
        setup(args)
        return 0
    except SetupError as error:
        print(f'Production Umami setup failed: {error}', file=sys.stderr)
        return 1
    except Exception:
        # API adapters and OS errors may carry response or path details. Keep
        # their bodies, tokens, and arbitrary exception strings out of logs.
        print('Production Umami setup failed: an API or file operation failed.', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
