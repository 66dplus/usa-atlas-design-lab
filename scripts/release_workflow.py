#!/usr/bin/env python3
"""Fail-closed release CLI and stdlib Docker transaction backend."""
import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
from datetime import timedelta
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path, PurePosixPath
import posixpath
import re
import shlex
import stat
import subprocess
import tempfile
import tarfile
import difflib
import time
import urllib.error
import urllib.request


try:
    from .runtime_conformance import validate_conformance, ARCHIVED_A
except ImportError:
    from runtime_conformance import validate_conformance, ARCHIVED_A


class ReleaseError(RuntimeError):
    pass


def digest(data):
    return hashlib.sha256(data).hexdigest()


def json_sha(path):
    return digest(Path(path).read_bytes())


def read_json(path):
    try:
        value = json.loads(Path(path).read_text())
    except (OSError, json.JSONDecodeError) as error:
        raise ReleaseError(f'cannot read JSON {path}: {error}') from error
    if not isinstance(value, dict):
        raise ReleaseError(f'JSON root must be an object: {path}')
    return value


def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(dir=path.parent, prefix=path.name + '.')
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(value, stream, indent=2, sort_keys=True)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, path)
        directory_fd = os.open(path.parent, os.O_RDONLY | getattr(os, 'O_DIRECTORY', 0))
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def run(command, *, capture=True, check=True, input_text=None, cwd=None):
    try:
        result = subprocess.run(command, cwd=cwd, text=True, input=input_text,
                                stdout=subprocess.PIPE if capture else None,
                                stderr=subprocess.PIPE if capture else None)
    except OSError as error:
        raise ReleaseError(f'command unavailable: {command[0]}') from error
    if check and result.returncode:
        if command and command[0] == 'docker':
            detail = (result.stderr or result.stdout or '').strip()
            raise ReleaseError(f'docker {command[1] if len(command) > 1 else "command"} failed ({result.returncode}): {detail}')
        if command and command[0] == 'git' and 'ls-remote' in command:
            raise ReleaseError('git ls-remote could not resolve the configured public main ref')
        detail = (result.stderr or result.stdout or '').strip()
        raise ReleaseError(f'{shlex.join(map(str, command))} failed ({result.returncode}): {detail}')
    return result


def require_clean_checkout(repo):
    status = run(['git', '-C', str(repo), 'status', '--porcelain', '--untracked-files=all']).stdout
    if status:
        raise ReleaseError('dirty checkout: commit or remove all changes before packaging')
    return run(['git', '-C', str(repo), 'rev-parse', 'HEAD']).stdout.strip()


def remote_main_sha(repo, remote='origin', branch='main'):
    rows = run(['git', '-C', str(repo), 'ls-remote', '--exit-code', remote,
                f'refs/heads/{branch}']).stdout.splitlines()
    matches = [row.split()[0] for row in rows if row.split()]
    if len(matches) != 1 or not re.fullmatch(r'[0-9a-f]{40}', matches[0]):
        raise ReleaseError('could not resolve one exact public remote main SHA')
    return matches[0]


def accepted_main(repo, commit, remote='origin', branch='main'):
    return bool(re.fullmatch(r'[0-9a-f]{40}', commit or '')) and remote_main_sha(repo, remote, branch) == commit


def _replace_relay_bytes(path, raw, mode, uid=None, gid=None):
    descriptor, temporary = tempfile.mkstemp(dir=path.parent, prefix='.relay-')
    try:
        with os.fdopen(descriptor, 'wb') as stream:
            os.fchmod(stream.fileno(), mode)
            if uid is not None and (os.fstat(stream.fileno()).st_uid, os.fstat(stream.fileno()).st_gid) != (uid, gid):
                os.fchown(stream.fileno(), uid, gid)
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def _restart_public_relay(unit):
    # Only this fixed managed-service operation is exposed, never arbitrary shell.
    for command in (['systemctl', 'restart', '--', unit],
                    ['systemctl', 'is-active', '--quiet', '--', unit]):
        result = subprocess.run(command, capture_output=True, timeout=30)
        if result.returncode:
            raise ReleaseError('managed relay service did not become active')


def _relay_health(expected):
    for url in ('http://127.0.0.1:8099/ux/build.json', 'https://usa-xray.online/ux/build.json'):
        deadline = time.monotonic() + 10
        while True:
            try:
                with urllib.request.urlopen(url, timeout=5) as response:
                    if response.status != 200 or digest(response.read()) != expected:
                        raise ReleaseError('relay/public baseline identity mismatch')
                break
            except (OSError, urllib.error.URLError):
                # A simple managed service can be active just before its socket binds.
                if time.monotonic() >= deadline:
                    raise ReleaseError('relay/public baseline unavailable') from None
                time.sleep(0.2)


def sync_public_relay(args):
    """Sync only the committed permanent relay, while approved A owns primary."""
    config = read_json(args.config)
    lock = Path(os.environ.get(config.get('deploymentLockEnv', 'USA_ATLAS_DEPLOYMENT_LOCK'), '/opt/usa-atlas-releases/deployment.lock'))
    state = args.state_dir or Path(os.environ.get(config.get('stateDirectoryEnv', 'USA_ATLAS_RELEASE_STATE_DIR'), '/opt/usa-atlas-releases'))
    if not re.fullmatch(r'[A-Za-z0-9._-]{1,80}', args.id) or args.id in ('.', '..'):
        raise ReleaseError('invalid relay sync identity')
    if not re.fullmatch(r'[0-9a-f]{64}', args.expected_preimage_sha256):
        raise ReleaseError('relay sync requires an exact preimage SHA256')
    operation = state / 'relay-sync' / args.id
    replaced = False
    created = False
    record = {'operation': 'public-relay-sync', 'id': args.id, 'status': 'checking'}
    phase = 'configuration'
    with deployment_lock(lock):
        try:
            private = config.get('publicRelay')
            if not isinstance(private, dict) or set(private) != {'sourcePath', 'serviceUnit'}:
                raise ReleaseError('explicit private relay location/service configuration required')
            target, unit = Path(private['sourcePath']), private['serviceUnit']
            if (not target.is_absolute() or not target.is_file() or
                    any(path.is_symlink() for path in (target, *target.parents)) or
                    not isinstance(unit, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.@-]{0,99}\.service', unit)):
                raise ReleaseError('invalid private relay configuration')
            phase = 'current-main'
            head = require_clean_checkout(args.repo)
            if head != args.source_commit or not accepted_main(args.repo, head, config.get('mainRemote', 'origin'), config.get('mainBranch', 'main')):
                raise ReleaseError('relay sync requires exact clean current accepted main')
            source = Path(args.repo) / 'deploy/public-relay/proxy.py'
            new = source.read_bytes()
            if source.is_symlink() or run(['git', '-C', str(args.repo), 'show', f'{head}:deploy/public-relay/proxy.py']).stdout.encode() != new:
                raise ReleaseError('relay differs from exact committed source')
            phase = 'approved-A-baseline'
            backend = DockerBackend(config)
            baseline = backend.live_identity()
            if (args.baseline_build_sha != ARCHIVED_A['buildSha256'] or
                    any(baseline.get(key) != ARCHIVED_A[value] for key, value in
                        [('buildSha256', 'buildSha256'), ('imageId', 'imageDigest'), ('sourceCommit', 'sourceCommit'), ('release', 'releaseId')]) or
                    baseline.get('readOnlyRoot') is not True or baseline.get('user') != config['runtimeUser'] or
                    baseline.get('networkAddress') != config['primaryAddress']):
                raise ReleaseError('relay sync requires restored immutable A at primary')
            mounts = {item['destination']: item for item in baseline['mounts']}
            if any(destination not in mounts or not mounts[destination]['readOnly']
                   for destination in (config['readerSecretDestination'], config['databaseDestination'])):
                raise ReleaseError('required baseline mounts must remain read-only')
            backend._reject_unapproved_writes(baseline['mounts'])
            registry = args.registry or Path(config.get('approvalRegistry', str(state / 'approved-artifacts.json')))
            if not policy_not_revoked(read_json(args.policy), baseline['buildSha256'], baseline['imageId']) or not policy_allows(read_json(registry), baseline['buildSha256'], baseline['imageId']):
                raise ReleaseError('A is not currently approved or is revoked')
            phase = 'preimage'
            old, metadata = target.read_bytes(), target.stat()
            if digest(old) != args.expected_preimage_sha256 or old == new or operation.exists():
                raise ReleaseError('relay preimage or unused operation identity mismatch')
            phase = 'initial-health'
            _relay_health(baseline['buildSha256'])
            if backend.live_identity() != baseline or require_clean_checkout(args.repo) != head or not accepted_main(args.repo, head, config.get('mainRemote', 'origin'), config.get('mainBranch', 'main')):
                raise ReleaseError('source or live baseline changed before sync')
            if target.read_bytes() != old:
                raise ReleaseError('relay preimage changed before sync')
            operation.mkdir(parents=True, mode=0o700)
            created = True
            _replace_relay_bytes(operation / 'before.py', old, 0o600)
            record.update(status='syncing', sourceCommit=head, preimageSha256=digest(old),
                          relaySha256=digest(new), baselineBuildSha256=baseline['buildSha256'],
                          baselineContainerId=baseline['containerId'])
            atomic_json(operation / 'result.json', record)
            phase = 'replacement'
            replaced = True  # Also restore if directory fsync fails after rename.
            _replace_relay_bytes(target, new, stat.S_IMODE(metadata.st_mode), metadata.st_uid, metadata.st_gid)
            phase = 'restart'
            _restart_public_relay(unit)
            phase = 'post-sync-health'
            _relay_health(baseline['buildSha256'])
            if backend.live_identity() != baseline or target.read_bytes() != new:
                raise ReleaseError('live baseline or installed relay changed')
            record.update(status='pass', verifiedAt=datetime.now(timezone.utc).isoformat())
            atomic_json(operation / 'result.json', record)
            return record
        except BaseException:
            recovery = 'not-mutated'
            if replaced:
                try:
                    _replace_relay_bytes(target, old, stat.S_IMODE(metadata.st_mode), metadata.st_uid, metadata.st_gid)
                    _restart_public_relay(unit)
                    _relay_health(baseline['buildSha256'])
                    if target.read_bytes() != old or backend.live_identity() != baseline:
                        raise ReleaseError('restoration identity mismatch')
                    recovery = 'prior-source-service-restored'
                except BaseException:
                    recovery = 'restoration-failed'
            if created:
                record.update(status='fail', failedPhase=phase, recovery=recovery)
                atomic_json(operation / 'result.json', record)
            # Private paths, service names and command output never enter diagnostics.
            raise ReleaseError(f'public relay sync failed during {phase}; {recovery}') from None


def _safe_rel(name):
    if not isinstance(name, str) or not name or name in ('.', '..') or '\x00' in name or '\\' in name or name.startswith('/'):
        raise ReleaseError(f'unsafe package path: {name!r}')
    path = PurePosixPath(name)
    if any(part in ('', '.', '..') for part in path.parts) or str(path) != name:
        raise ReleaseError(f'unsafe package path: {name!r}')
    return path


def expected_hashes(package, strict=False):
    package = Path(package)
    build_path = package / 'ux/build.json'
    if not build_path.is_file() or build_path.is_symlink():
        raise ReleaseError('package is missing regular ux/build.json')
    build = read_json(build_path)
    hashes = {}
    for field in ('shippedSha256', 'sourceSha256', 'assetSha256', 'dataContractSha256'):
        value = build.get(field, {})
        if not isinstance(value, dict):
            raise ReleaseError(f'build metadata {field} must be an object')
        for name, sha in value.items():
            _safe_rel(name)
            if not isinstance(sha, str) or not re.fullmatch(r'[0-9a-f]{64}', sha):
                raise ReleaseError(f'invalid {field} hash for {name}')
            previous = hashes.get(name)
            if previous is not None and previous != sha:
                raise ReleaseError(f'conflicting legacy/package hashes for {name}')
            hashes[name] = sha
    shipped = build.get('shippedSha256')
    if strict and (not isinstance(shipped, dict) or not {'Dockerfile', 'ux/catalog.json', 'ux/catalog-proposals.json'}.issubset(shipped)):
        raise ReleaseError('package lacks Dockerfile or legacy catalog inputs in shippedSha256')
    if 'sitecustomize.py' in hashes or (package / 'sitecustomize.py').exists():
        raise ReleaseError('sitecustomize.py is forbidden in a release package')
    return hashes, build


def include_legacy_runtime_inputs(root, hashes):
    for name in ('Dockerfile', 'ux/catalog.json', 'ux/catalog-proposals.json'):
        path = Path(root) / name
        if path.is_symlink() or not path.is_file():
            raise ReleaseError(f'legacy runtime input is missing or unsafe: {name}')
        hashes.setdefault(name, digest(path.read_bytes()))
    return hashes


def package_inventory(package):
    package = Path(package)
    if package.is_symlink() or not package.is_dir():
        raise ReleaseError('package root must be a real directory')
    hashes, build = expected_hashes(package, strict=True)
    actual = {}
    for path in package.rglob('*'):
        if path.is_symlink():
            raise ReleaseError(f'symlink in package: {path.relative_to(package)}')
        if path.is_file():
            rel = path.relative_to(package).as_posix()
            _safe_rel(rel)
            actual[rel] = digest(path.read_bytes())
    required = set(hashes) | {'ux/build.json', 'preview-assets.json'}
    extra = set(actual) - required
    missing = required - set(actual)
    if extra:
        raise ReleaseError('unlisted package files: ' + ', '.join(sorted(extra)))
    if missing:
        raise ReleaseError('package files missing: ' + ', '.join(sorted(missing)))
    routes = read_json(package / 'preview-assets.json')
    if not isinstance(routes, dict):
        raise ReleaseError('preview-assets.json must be an object')
    for name in routes.values():
        _safe_rel(name)
        if name not in actual:
            raise ReleaseError(f'preview route targets an unlisted or missing package file: {name}')
    for name, expected in hashes.items():
        if actual[name] != expected:
            raise ReleaseError(f'package file hash mismatch: {name}')
    build_raw = (package / 'ux/build.json').read_bytes()
    if not re.fullmatch(r'[0-9a-f]{40}', str(build.get('sourceCommit') or '')):
        raise ReleaseError('target sourceCommit must be a full Git SHA')
    if not re.fullmatch(r'[A-Za-z0-9._-]{1,80}', str(build.get('release') or '')):
        raise ReleaseError('build metadata release identity is missing or invalid')
    if not re.fullmatch(r'[A-Za-z0-9._-]{1,80}', str(build.get('previousRelease') or '')):
        raise ReleaseError('build metadata previousRelease is missing or invalid')
    if not re.fullmatch(r'[0-9a-f]{64}', str(build.get('previousBuildSha256') or '')):
        raise ReleaseError('build metadata previousBuildSha256 must bind the prior raw build.json')
    for field in ('readerLockSha256',):
        if not re.fullmatch(r'[0-9a-f]{64}', str(build.get(field) or '')):
            raise ReleaseError(f'build metadata {field} must be a SHA256')
    if not isinstance(build.get('readerSchemaFingerprint'), str) or not build['readerSchemaFingerprint']:
        raise ReleaseError('build metadata readerSchemaFingerprint is required')
    source_base = build.get('sourceBaseCommit')
    if (not re.fullmatch(r'[0-9a-f]{40}', str(source_base or '')) or
            source_base != build['sourceCommit']):
        raise ReleaseError('sourceBaseCommit must be an exact full SHA equal to sourceCommit')
    return {'buildSha256': digest(build_raw), 'buildRawSha256': digest(build_raw),
            'previewAssetsSha256': actual['preview-assets.json'],
            'sourceCommit': build['sourceCommit'], 'sourceBaseCommit': source_base,
            'files': {name: actual[name] for name in sorted(hashes)}}


def package_fingerprint(package):
    return package_inventory(package)


def package_sha(package):
    inventory = package_inventory(package)
    files = {**inventory['files'], 'ux/build.json': inventory['buildSha256'],
             'preview-assets.json': inventory['previewAssetsSha256']}
    return digest(json.dumps(files, sort_keys=True, separators=(',', ':')).encode())


def reconstruct_package(repo, commit, release, previous_release, previous_build_sha256):
    """Build package from an isolated checkout of the exact committed source."""
    repo = Path(repo).resolve()
    temp = Path(tempfile.mkdtemp(prefix='usa-release-source-proof-'))
    checkout, output = temp / 'source', temp / 'package'
    try:
        run(['git', '-C', str(repo), 'worktree', 'add', '--detach', str(checkout), commit])
        head = run(['git', '-C', str(checkout), 'rev-parse', 'HEAD']).stdout.strip()
        if head != commit:
            raise ReleaseError('source reconstruction checkout differs from requested commit')
        run(['npm', '--userconfig=/dev/null', '--cache', str(temp / 'npm-cache'),
             'ci', '--ignore-scripts'], capture=True, check=True, cwd=checkout)
        run(['python3', 'scripts/release_workflow.py', 'prepare',
             '--destination', str(output), '--release', release,
             '--source-commit', commit, '--previous-release', previous_release,
             '--previous-build-sha256', previous_build_sha256], capture=True,
            check=True, cwd=checkout)
        return package_inventory(output), (output / 'ux/build.json').read_bytes(), (output / 'preview-assets.json').read_bytes()
    finally:
        run(['git', '-C', str(repo), 'worktree', 'remove', '--force', str(checkout)], check=False)
        import shutil
        shutil.rmtree(temp, ignore_errors=True)


def compare_source_reconstruction(actual_package, reconstructed):
    inventory, build_raw, preview_raw = reconstructed
    actual = package_inventory(actual_package)
    if (actual != inventory or (Path(actual_package) / 'ux/build.json').read_bytes() != build_raw or
            (Path(actual_package) / 'preview-assets.json').read_bytes() != preview_raw):
        raise ReleaseError('package bytes differ from exact committed-source reconstruction')
    files = {**actual['files'], 'ux/build.json': actual['buildSha256'],
             'preview-assets.json': actual['previewAssetsSha256']}
    return {'sourceCommit': actual['sourceCommit'], 'packageSha256': digest(
        json.dumps(files, sort_keys=True, separators=(',', ':')).encode()),
        'buildRawSha256': digest(build_raw), 'previewAssetsSha256': digest(preview_raw)}


def recompute_content_diff(baseline_files, baseline_text, package):
    for name, text in baseline_text.items():
        if name not in baseline_files or digest(text.encode()) != baseline_files[name]:
            raise ReleaseError(f'plan baseline review text is not bound to snapshot hash: {name}')
    inventory = package_inventory(package)
    actual = {**inventory['files'], 'ux/build.json': inventory['buildSha256'],
              'preview-assets.json': inventory['previewAssetsSha256']}
    changes = sorted(name for name in set(baseline_files) | set(actual)
                     if baseline_files.get(name) != actual.get(name))
    result = {}
    for name in changes:
        if not name.lower().endswith(('.html', '.js', '.css', '.json', '.xml', '.txt', '.py', '.sql')):
            continue
        old = baseline_text.get(name)
        path = Path(package) / name
        new = path.read_text(errors='replace') if path.is_file() else None
        if old is None and name in baseline_files:
            raise ReleaseError(f'plan lacks hash-bound review text for changed baseline file: {name}')
        if old is not None or new is not None:
            result[name] = ''.join(difflib.unified_diff(
                (old or '').splitlines(keepends=True), (new or '').splitlines(keepends=True),
                fromfile=f'baseline/{name}', tofile=f'target/{name}'))
    return result


def _tree_hashes(directory, paths):
    root = Path(directory)
    out = {}
    for name in paths:
        _safe_rel(name)
        path = root / name
        if path.is_symlink() or not path.is_file():
            raise ReleaseError(f'snapshot required file missing or unsafe: {name}')
        out[name] = digest(path.read_bytes())
    return out


def create_plan(baseline_dir, target_dir, baseline_release, baseline_build_sha,
                declared_changes, plan_path, accepted_main_commits=()):
    baseline_dir, target_dir = Path(baseline_dir), Path(target_dir)
    baseline_container_id = baseline_image_id = None
    if baseline_dir.is_file():
        snapshot = read_json(baseline_dir)
        if snapshot.get('buildSha256') != baseline_build_sha:
            raise ReleaseError('baseline build.json SHA256 mismatch')
        if snapshot.get('release') != baseline_release:
            raise ReleaseError('baseline release identity mismatch')
        base_files = dict(snapshot.get('requiredFileSha256') or {})
        if not base_files:
            raise ReleaseError('trusted baseline snapshot has an empty requiredFileSha256 map')
        base_files['ux/build.json'] = snapshot['buildSha256']
        if snapshot.get('previewAssetsSha256'):
            base_files['preview-assets.json'] = snapshot['previewAssetsSha256']
        base_build_sha = snapshot['buildSha256']
        baseline_container_id = snapshot.get('containerId')
        baseline_image_id = snapshot.get('imageId')
    else:
        base_build_raw = (baseline_dir / 'ux/build.json').read_bytes()
        if digest(base_build_raw) != baseline_build_sha:
            raise ReleaseError('baseline build.json SHA256 mismatch')
        base_meta = json.loads(base_build_raw)
        if base_meta.get('release') != baseline_release:
            raise ReleaseError('baseline release identity mismatch')
        base_files = dict(package_inventory(baseline_dir)['files'])
        base_files['ux/build.json'] = baseline_build_sha
        base_files['preview-assets.json'] = json_sha(baseline_dir / 'preview-assets.json')
    target_inv = package_inventory(target_dir)
    before = base_files
    after = {**target_inv['files'], 'ux/build.json': target_inv['buildSha256'],
             'preview-assets.json': target_inv['previewAssetsSha256']}
    changes = sorted(name for name in set(before) | set(after) if before.get(name) != after.get(name))
    # Build metadata is identity and is included in the full content diff.
    changes = sorted(set(changes))
    content_diff = {}
    for name in changes:
        if not name.lower().endswith(('.html', '.js', '.css', '.json', '.xml', '.txt', '.py', '.sql')):
            continue
        old_text = None
        if not baseline_dir.is_file() and (baseline_dir / name).is_file():
            old_text = (baseline_dir / name).read_text(errors='replace')
        elif baseline_dir.is_file():
            old_text = (snapshot.get('requiredFileText') or {}).get(name)
            if name in before and old_text is None:
                raise ReleaseError(f'trusted baseline snapshot lacks reviewable text content for {name}')
        new_text = (target_dir / name).read_text(errors='replace') if (target_dir / name).is_file() else None
        if old_text is not None or new_text is not None:
            content_diff[name] = ''.join(difflib.unified_diff(
                (old_text or '').splitlines(keepends=True), (new_text or '').splitlines(keepends=True),
                fromfile=f'baseline/{name}', tofile=f'target/{name}'))
    if set(changes) != set(declared_changes):
        raise ReleaseError('declared shipped changes differ from computed diff: ' +
                           json.dumps({'computed': changes, 'declared': sorted(declared_changes)}))
    files = {**after, 'ux/build.json': target_inv['buildSha256'],
             'preview-assets.json': target_inv['previewAssetsSha256']}
    package_sha = digest(json.dumps(files, sort_keys=True, separators=(',', ':')).encode())
    plan = {'schema': 2, 'baselineRelease': baseline_release,
            'baselineBuildSha256': baseline_build_sha, 'targetCommit': target_inv['sourceCommit'],
            'baselineFiles': before, 'baselineContainerId': baseline_container_id,
            'baselineImageId': baseline_image_id,
            'baselineFileText': ({name: value for name, value in (snapshot.get('requiredFileText') or {}).items()
                                  if name in before} if baseline_dir.is_file() else
                                 {name: (baseline_dir / name).read_text(errors='replace')
                                  for name in before if (baseline_dir / name).is_file() and
                                  name.lower().endswith(('.html', '.js', '.css', '.json', '.xml', '.txt', '.py', '.sql'))}),
            'acceptedMainCommits': sorted(set(accepted_main_commits)),
            'targetWasAcceptedAtPlanning': target_inv['sourceCommit'] in set(accepted_main_commits),
            'declaredChanges': changes, 'diff': {name: {'before': before.get(name), 'after': after.get(name)} for name in changes},
            'contentDiff': content_diff,
            'packageFiles': files, 'packageSha256': package_sha,
            'createdAt': datetime.now(timezone.utc).isoformat()}
    atomic_json(plan_path, plan)
    return plan


def contract_identity(lock_path, vendored_artifact=None):
    lock = read_json(lock_path)
    required = ('producerRepository', 'sourceCommit', 'contractVersion', 'artifactPath',
                'contractSha256', 'schemaFingerprint', 'bootstrapSha256', 'fixtureSha256')
    if any(not lock.get(key) for key in required):
        raise ReleaseError('reader lock is missing required contract artifact identity fields')
    if not re.fullmatch(r'[0-9a-f]{40}', str(lock['sourceCommit'])):
        raise ReleaseError('reader lock sourceCommit must be a full Git SHA')
    for field in ('contractSha256', 'bootstrapSha256', 'fixtureSha256'):
        if not re.fullmatch(r'[0-9a-f]{64}', str(lock[field])):
            raise ReleaseError(f'reader lock {field} must be a SHA256')
    # artifactPath names the producer repository location. The vendored copy is
    # explicitly named by localArtifactPath and is never inferred from it.
    local_name = vendored_artifact or lock.get('localArtifactPath')
    if not local_name:
        raise ReleaseError('reader lock requires an explicit vendored local artifact path')
    artifact = _safe_rel(str(local_name))
    repo_root = Path(lock_path).resolve().parent.parent
    artifact_file = repo_root / artifact
    if artifact_file.is_dir():
        artifact_file = artifact_file / 'contract.json'
    if not artifact_file.is_file() or artifact_file.is_symlink() or json_sha(artifact_file) != lock['contractSha256']:
        raise ReleaseError('reader contract artifact is missing or differs from reader lock SHA256')
    contract = read_json(artifact_file)
    if (contract.get('schema_fingerprint') != lock['schemaFingerprint'] or
            contract.get('version') != lock['contractVersion'] or
            contract.get('read_only', contract.get('readOnly')) is not True or
            contract.get('admission_filter', contract.get('admissionFilter')) != "usa_atlas.ingest_run.status = 'pass'"):
        raise ReleaseError('reader lock does not bind the current read-only admitted schema contract')
    return {'readerLockSha256': json_sha(lock_path), 'readerSchemaFingerprint': lock['schemaFingerprint']}


def verify_receipt(receipt, lock_path, *, release_id, operation, image_digest, build_sha,
                   source_commit, started_at, suite_identity, mandatory_checks,
                   vendored_artifact=None, runtime_release_id=None):
    if (not isinstance(receipt, dict) or receipt.get('format') != 'usa_atlas_release_acceptance' or
            receipt.get('status') != 'pass' or receipt.get('failures') != []):
        raise ReleaseError('current behavioral acceptance receipt is required')
    identity = contract_identity(lock_path, vendored_artifact)
    runtime_release_id = runtime_release_id or release_id
    for key, expected in {'releaseId': release_id, 'operation': operation,
                          'testedImageDigest': image_digest, 'buildSha256': build_sha,
                          'sourceCommit': source_commit,
                          **identity}.items():
        if receipt.get(key) != expected:
            raise ReleaseError(f'acceptance receipt {key} mismatch')
    if not re.fullmatch(r'[0-9a-f]{40}', str(receipt.get('acceptanceSourceCommit') or '')):
        raise ReleaseError('acceptance receipt acceptanceSourceCommit must be a full Git SHA')
    if receipt.get('runtimeReleaseId') != (runtime_release_id or release_id):
        raise ReleaseError('acceptance receipt runtimeReleaseId mismatch')
    checks = receipt.get('mandatorySuccessfulCheckIDs')
    if not isinstance(checks, list) or not checks or any(not isinstance(x, str) for x in checks) or len(checks) != len(set(checks)):
        raise ReleaseError('receipt must list mandatorySuccessfulCheckIDs')
    if receipt.get('suiteIdentity') != suite_identity:
        raise ReleaseError('receipt acceptance suite identity is not current')
    if set(checks) != set(mandatory_checks):
        raise ReleaseError('receipt mandatory successful checks differ from current policy')
    if not isinstance(receipt.get('checks'), dict):
        raise ReleaseError('acceptance receipt must include per-check execution evidence')
    evidence = receipt['checks']
    staged_identity = evidence.get('stagedBuildIdentity')
    staged_api = evidence.get('stagedRuntimeApi')
    if (not isinstance(staged_identity, dict) or staged_identity.get('runtimeBuildSha256') != build_sha or
            staged_identity.get('releaseId') != runtime_release_id or staged_identity.get('sourceCommit') != source_commit or
            not isinstance(staged_api, dict) or staged_api.get('exitCode') != 0):
        raise ReleaseError('staged build and runtime API checks lack successful evidence')
    for check_id in mandatory_checks:
        if check_id in ('application.staged-build-identity', 'application.staged-runtime-api'):
            continue
        result = evidence.get(check_id)
        if not isinstance(result, dict) or result.get('exitCode') != 0:
            raise ReleaseError(f'acceptance receipt lacks passing execution evidence for {check_id}')
    try:
        validate_conformance(evidence.get('runtimeConformance'), build_sha=build_sha,
                             source=source_commit, release=runtime_release_id, image=image_digest)
    except ValueError as error:
        raise ReleaseError(str(error)) from error
    try:
        tested = datetime.fromisoformat(receipt['testedAt'].replace('Z', '+00:00'))
        start = datetime.fromisoformat(started_at.replace('Z', '+00:00'))
    except (KeyError, ValueError, TypeError) as error:
        raise ReleaseError('receipt must include valid testedAt') from error
    if tested.tzinfo is None or start.tzinfo is None or tested < start or start > datetime.now(timezone.utc):
        raise ReleaseError('acceptance receipt is stale for this operation')
    now = datetime.now(timezone.utc)
    if tested > now:
        raise ReleaseError('acceptance receipt timestamp is in the future')
    if now - tested > timedelta(minutes=15):
        raise ReleaseError('acceptance receipt is stale for this operation')


def policy_not_revoked(policy, build_sha, image_digest):
    revocations = policy.get('revocations', [])
    revoked = set(policy.get('revokedImageDigests', [])) | {
        item.get('imageDigest') for item in revocations if item.get('imageDigest')}
    revoked_builds = set(policy.get('revokedBuildSha256', [])) | {
        item.get('buildSha256') for item in revocations if item.get('buildSha256')}
    return image_digest not in revoked and build_sha not in revoked_builds


def policy_allows(policy, build_sha, image_digest):
    return any(
        row.get('buildSha256') == build_sha and row.get('imageDigest') == image_digest
        for row in policy.get('allowedArtifacts', []))


@contextmanager
def deployment_lock(lock_path):
    path = Path(lock_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('a+') as stream:
        try:
            fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise ReleaseError('another release transaction holds the global deployment lock') from error
        try:
            yield
        finally:
            fcntl.flock(stream, fcntl.LOCK_UN)


def docker_json(args):
    return json.loads(run(['docker', *args]).stdout)


class DockerBackend:
    """Docker runtime adapter. All container mutations use immutable container IDs."""
    def __init__(self, config):
        self.config = config

    def inspect(self, container):
        rows = docker_json(['inspect', container])
        if len(rows) != 1:
            raise ReleaseError(f'expected one Docker container for {container}')
        return rows[0]

    def image_digest(self, image):
        return docker_json(['image', 'inspect', image])[0]['Id']

    @staticmethod
    def _mount_identity(mount):
        source = mount.get('Source') or mount.get('Name') or ''
        normalized = posixpath.normpath(source)
        return {'type': mount.get('Type'), 'destination': mount.get('Destination'),
                'readOnly': not bool(mount.get('RW', True)),
                'sourceIdentity': digest(normalized.encode()) if normalized else None}

    def live_identity(self):
        obj = self.inspect(self.config['primaryContainer'])
        cid = obj['Id']
        build = run(['docker', 'exec', cid, 'cat', '/app/ux/build.json']).stdout.encode()
        temp = Path(tempfile.mkdtemp(prefix='usa-release-live-'))
        try:
            run(['docker', 'cp', f'{cid}:/app/.', str(temp)])
            raw = (temp / 'ux/build.json').read_bytes()
            if digest(raw) != digest(build):
                raise ReleaseError('container build metadata changed while reading live identity')
            hashes, metadata = expected_hashes(temp)
            include_legacy_runtime_inputs(temp, hashes)
            required = _tree_hashes(temp, hashes)
            required['ux/build.json'] = digest(raw)
            required['preview-assets.json'] = json_sha(temp / 'preview-assets.json')
        finally:
            import shutil
            shutil.rmtree(temp, ignore_errors=True)
        mounts = [self._mount_identity(m) for m in obj.get('Mounts', [])]
        network = (obj.get('NetworkSettings', {}).get('Networks', {}).get(self.config['network']) or {})
        return {'containerId': cid, 'name': obj['Name'].lstrip('/'), 'imageId': obj['Image'],
                'buildSha256': digest(build), 'requiredFileSha256': required,
                'sourceCommit': metadata.get('sourceCommit'),
                'sourceBaseCommit': metadata.get('sourceBaseCommit'),
                'release': metadata.get('release'),
                'mounts': sorted(mounts, key=lambda m: m['destination']),
                'network': self.config['network'], 'networkAddress': network.get('IPAddress'),
                'readOnlyRoot': bool(obj.get('HostConfig', {}).get('ReadonlyRootfs', False)),
                'user': obj.get('Config', {}).get('User'), 'state': obj.get('State', {}).get('Status')}

    def _reports_mount(self):
        """Resolve explicitly provisioned storage without recording its source."""
        storage = self.config.get('reportsStorage')
        if storage is None:
            return None
        if (not isinstance(storage, dict) or set(storage) != {'type', 'sourceEnv', 'destination'} or
                storage['type'] not in ('bind', 'volume') or
                storage['destination'] != '/var/lib/usa-atlas/reports' or
                not re.fullmatch(r'[A-Z][A-Z0-9_]{0,79}', str(storage['sourceEnv']))):
            raise ReleaseError('invalid private reports storage configuration')
        source = os.environ.get(storage['sourceEnv'], '')
        if not source or ',' in source or any(ord(char) < 32 for char in source):
            raise ReleaseError('private reports storage source is not configured')
        if storage['type'] == 'volume':
            if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,127}', source):
                raise ReleaseError('invalid private reports volume identity')
            try:
                volumes = docker_json(['volume', 'inspect', source])
            except ReleaseError:
                raise ReleaseError('private reports volume must be provisioned before staging') from None
            if len(volumes) != 1 or volumes[0].get('Name') != source or not volumes[0].get('Mountpoint'):
                raise ReleaseError('private reports volume must be provisioned before staging')
            mount = {'Type': 'volume', 'Name': source, 'Source': volumes[0]['Mountpoint']}
        else:
            directory = Path(source)
            if not directory.is_absolute() or not directory.is_dir():
                raise ReleaseError('private reports bind directory must be provisioned before staging')
            mount = {'Type': 'bind', 'Source': str(directory.resolve())}
        mount.update(Destination=storage['destination'], RW=True)
        return mount

    def _runtime_args(self):
        args = ['--port', str(self.config['port'])]
        if self.config.get('reportsStorage') is not None:
            args += ['--reports-dir', '/var/lib/usa-atlas/reports']
        import ipaddress
        for value in self.config.get('trustedProxyNetworks', []):
            try:
                network = ipaddress.ip_network(value, strict=False)
            except (ValueError, TypeError):
                raise ReleaseError('invalid trusted proxy network configuration') from None
            args += ['--trusted-proxy', str(network)]
        return args

    @staticmethod
    def _reject_unapproved_writes(mounts, expected=()):
        approved = {m['destination']: m for m in expected}
        for mount in mounts:
            if not mount['readOnly'] and (mount['destination'] != '/var/lib/usa-atlas/reports' or
                    mount != approved.get(mount['destination'])):
                raise ReleaseError('runtime has an unapproved writable mount')

    def _mount_args(self, identity, reports_mount=None, inherit_reports=True):
        old = self.inspect(identity['containerId'])
        args = []
        for mount in old.get('Mounts', []):
            dest = mount.get('Destination')
            if dest in (self.config['readerSecretDestination'], self.config['databaseDestination']):
                if mount.get('RW'):
                    raise ReleaseError(f'required mount {dest} must be read-only')
                if mount.get('Type') == 'bind':
                    args += ['--mount', f"type=bind,src={mount['Source']},dst={dest},readonly"]
                elif mount.get('Type') == 'volume':
                    args += ['--mount', f"type=volume,src={mount['Name']},dst={dest},readonly"]
                else:
                    raise ReleaseError(f'unsupported required read-only mount type at {dest}')
            elif dest == '/var/lib/usa-atlas/reports' and reports_mount is None and inherit_reports:
                # Rollback clones inherit the archived runtime's exact storage.
                expected = next((m for m in identity['mounts'] if m['destination'] == dest), None)
                if expected != self._mount_identity(mount) or not mount.get('RW'):
                    raise ReleaseError('archived private reports mount identity changed')
                source = mount['Source'] if mount['Type'] == 'bind' else mount.get('Name')
                if mount['Type'] not in ('bind', 'volume') or not source:
                    raise ReleaseError('unsupported archived private reports storage')
                args += ['--mount', f"type={mount['Type']},src={source},dst={dest}"]
        destinations = {m['destination'] for m in identity['mounts']}
        for dest in (self.config['readerSecretDestination'], self.config['databaseDestination']):
            if dest not in destinations:
                raise ReleaseError(f'primary container lacks required read-only mount: {dest}')
        if reports_mount is not None:
            source = reports_mount['Source'] if reports_mount['Type'] == 'bind' else reports_mount['Name']
            args += ['--mount', f"type={reports_mount['Type']},src={source},dst={reports_mount['Destination']}"]
        return args

    def ensure_stage_address_free(self):
        networks = docker_json(['network', 'inspect', self.config['network']])
        if len(networks) != 1:
            raise ReleaseError('configured Docker network is unavailable or ambiguous')
        attached = networks[0].get('Containers') or {}
        for item in attached.values():
            address = str(item.get('IPv4Address', '')).split('/')[0]
            if address == self.config['stageAddress']:
                raise ReleaseError('configured staging IP is already in use on the private network')

    def stage(self, package, release_id, prior, archive_dir=None):
        self.ensure_stage_address_free()
        reports_mount = self._reports_mount()
        runtime_args = self._runtime_args()
        image = f"usa-atlas-release:{release_id}"
        build_sha = json_sha(Path(package) / 'ux/build.json')
        source_commit = read_json(Path(package) / 'ux/build.json')['sourceCommit']
        full_package_sha = package_sha(package)
        build_metadata = read_json(Path(package) / 'ux/build.json')
        if build_metadata.get('release') != release_id:
            raise ReleaseError('package build.release must equal requested release ID')
        run(['docker', 'build', '--pull=false', '--label', f'org.usa-atlas.release-id={release_id}',
             '--label', f'org.usa-atlas.build-sha256={build_sha}',
             '--label', f'org.usa-atlas.source-commit={source_commit}',
             '--label', f'org.usa-atlas.package-sha256={full_package_sha}', '-t', image, str(package)])
        image_id = self.image_digest(image)
        if archive_dir is not None:
            archive_dir = Path(archive_dir)
            image_archive = archive_dir / 'image.tar'
            if image_archive.exists():
                raise ReleaseError('immutable image archive already exists')
            run(['docker', 'save', '--output', str(image_archive), image_id])
        name = f'usa-atlas-stage-{release_id}'
        args = ['docker', 'run', '-d', '--name', name, '--network', self.config['network'],
                '--ip', self.config['stageAddress'], '--user', self.config['runtimeUser'],
                '--read-only', '--memory', self.config.get('memory', '384m'),
                '--cpus', self.config.get('cpus', '1'), '--pids-limit', str(self.config.get('pidsLimit', 64)),
                *self._mount_args(prior, reports_mount=reports_mount, inherit_reports=False), image_id, *runtime_args]
        cid = run(args).stdout.strip()
        inventory = package_inventory(package)
        runtime_files = {**inventory['files'], 'ux/build.json': inventory['buildSha256'],
                         'preview-assets.json': inventory['previewAssetsSha256']}
        return {'containerId': cid, 'name': name, 'imageId': image_id, 'releaseId': release_id,
                'imageTag': image,
                'stageAddress': self.config['stageAddress'], 'port': self.config['port'],
                'imageDigest': image_id, 'buildSha256': digest((Path(package) / 'ux/build.json').read_bytes()),
                'sourceCommit': source_commit,
                'packageSha256': full_package_sha, 'packageFiles': runtime_files,
                'imageArchive': str(image_archive) if archive_dir is not None else None,
                'imageArchiveSha256': json_sha(image_archive) if archive_dir is not None else None,
                'expectedMounts': [m for m in prior['mounts'] if m['destination'] in
                    (self.config['readerSecretDestination'], self.config['databaseDestination'])] +
                    ([self._mount_identity(reports_mount)] if reports_mount is not None else []),
                'status': 'running'}

    def stage_identity(self, stage):
        obj = self.inspect(stage['containerId'])
        mounts = [self._mount_identity(m) for m in obj.get('Mounts', [])]
        required = {self.config['readerSecretDestination'], self.config['databaseDestination']}
        actual = {m['destination'] for m in mounts}
        if not required.issubset(actual) or any(not m['readOnly'] for m in mounts if m['destination'] in required):
            raise ReleaseError('staged container is missing required read-only mounts')
        if obj.get('Config', {}).get('User') != self.config['runtimeUser']:
            raise ReleaseError('staged container runtime UID/GID mismatch')
        if not obj.get('HostConfig', {}).get('ReadonlyRootfs'):
            raise ReleaseError('staged container root filesystem is writable')
        expected_mounts = {m['destination']: m for m in stage.get('expectedMounts', [])}
        actual_mounts = {m['destination']: m for m in mounts}
        if any(actual_mounts.get(dest) != expected for dest, expected in expected_mounts.items()):
            raise ReleaseError('staged required mount source identity differs from primary')
        self._reject_unapproved_writes(mounts, expected_mounts.values())
        network = (obj.get('NetworkSettings', {}).get('Networks', {}).get(self.config['network']) or {})
        if network.get('IPAddress') != self.config['stageAddress']:
            raise ReleaseError('staged container private network/IP does not match release policy')
        labels = obj.get('Config', {}).get('Labels') or {}
        for key in ('release-id', 'build-sha256', 'source-commit', 'package-sha256'):
            if labels.get(f'org.usa-atlas.{key}') != stage.get({'release-id':'releaseId','build-sha256':'buildSha256','source-commit':'sourceCommit','package-sha256':'packageSha256'}[key]):
                raise ReleaseError(f'staged image {key} label mismatch')
        temp = Path(tempfile.mkdtemp(prefix='usa-release-stage-'))
        try:
            run(['docker', 'cp', f"{obj['Id']}:/app/.", str(temp)])
            actual = _tree_hashes(temp, stage.get('packageFiles', {}))
            for name, expected_hash in stage.get('packageFiles', {}).items():
                if actual.get(name) != expected_hash:
                    raise ReleaseError(f'staged runtime file bytes mismatch: {name}')
            raw_build = (temp / 'ux/build.json').read_bytes()
            if digest(raw_build) != stage.get('buildSha256'):
                raise ReleaseError('staged runtime raw build.json bytes mismatch')
        finally:
            import shutil
            shutil.rmtree(temp, ignore_errors=True)
        return {'containerId': obj['Id'], 'name': obj['Name'].lstrip('/'), 'imageId': obj['Image'],
                'status': obj['State']['Status'], 'user': obj.get('Config', {}).get('User'),
                'readOnlyRoot': True, 'mounts': sorted(mounts, key=lambda m: m['destination']),
                'expectedMounts': list(expected_mounts.values()),
                'network': self.config['network'], 'networkAddress': network['IPAddress'],
                'releaseId': labels.get('org.usa-atlas.release-id'),
                'buildSha256': labels.get('org.usa-atlas.build-sha256'),
                'sourceCommit': labels.get('org.usa-atlas.source-commit'),
                'packageSha256': labels.get('org.usa-atlas.package-sha256')}

    def activate(self, stage_identity, prior):
        stage_id, old_id = stage_identity['containerId'], prior['containerId']
        if self.inspect(old_id)['State']['Status'] != 'running':
            raise ReleaseError('primary container stopped before activation')
        if self._primary_owner_id() != old_id:
            raise ReleaseError('primary alias is not owned by the staged baseline container')
        try:
            run(['docker', 'network', 'disconnect', self.config['network'], old_id])
            run(['docker', 'stop', old_id])
            run(['docker', 'rename', old_id, f"usa-atlas-archived-{old_id[:12]}"])
            run(['docker', 'rename', stage_id, self.config['primaryContainer']])
            run(['docker', 'network', 'disconnect', self.config['network'], stage_id])
            run(['docker', 'network', 'connect', '--ip', self.config['primaryAddress'], self.config['network'], stage_id])
            run(['docker', 'start', stage_id])
            live = self.live_identity()
            if live['containerId'] != stage_id:
                raise ReleaseError('primary name resolves to a different immutable container')
            self.healthcheck(live['buildSha256'])
            return live
        except BaseException:
            self.restore(prior, {'containerId': stage_id})
            raise

    def _primary_owner_id(self):
        try:
            return self.inspect(self.config['primaryContainer'])['Id']
        except ReleaseError as error:
            message = str(error).lower()
            if 'no such object' in message or 'no such container' in message:
                return None
            raise

    def healthcheck(self, expected_build_sha):
        url = f"http://{self.config['primaryAddress']}:{self.config['port']}/ux/build.json"
        request = urllib.request.Request(url, headers={
            'Host': f"127.0.0.1:{self.config['port']}"})
        deadline = time.monotonic() + 20
        last_error = 'no response'
        while time.monotonic() < deadline:
            try:
                with urllib.request.urlopen(request, timeout=2) as response:
                    if response.status == 200 and digest(response.read()) == expected_build_sha:
                        return
                    last_error = 'HTTP response or build metadata mismatch'
            except (OSError, urllib.error.URLError) as error:
                last_error = str(error)
            time.sleep(0.5)
        raise ReleaseError(f'primary HTTP health check failed after network switch: {last_error}')

    def reader_schema_proof(self, container_id, lock_path, contract_path):
        """Read-only introspection through the staged runtime's mounted DB credentials."""
        lock, contract = read_json(lock_path), read_json(contract_path)
        expected = {}
        for table, columns in contract.get('objects', {}).items():
            for name, declared_type in columns.items():
                expected[(table, name)] = declared_type
        if not expected:
            raise ReleaseError('reader contract has no pinned object/column types')
        sql = ("BEGIN READ ONLY; SELECT table_name, column_name, data_type, "
               "coalesce(character_maximum_length::text, '') "
               "FROM information_schema.columns WHERE table_schema='usa_atlas' "
               "ORDER BY table_name, ordinal_position; COMMIT;")
        probe = (
            "import os,pathlib,subprocess,sys; "
            "os.environ['PGPASSWORD']=pathlib.Path('/run/secrets/reader_password').read_text().strip(); "
            "p=subprocess.run(['psql','-X','-w','-q','-v','ON_ERROR_STOP=1','-d','usa_atlas','-A','-t','-F','\\t'], "
            "input=sys.stdin.read(),text=True,capture_output=True,env=os.environ); "
            "sys.stdout.write(p.stdout); sys.stderr.write(p.stderr); sys.exit(p.returncode)"
        )
        result = run(['docker', 'exec', '-i', container_id, 'python3', '-c', probe],
                     input_text=sql)
        actual = {}
        for line in result.stdout.splitlines():
            parts = line.split('\t')
            if len(parts) != 4:
                raise ReleaseError('database schema probe returned malformed metadata')
            table, column, data_type, length = parts
            actual[(table, column)] = (data_type, length)
        aliases = {'character(64)': ('character', '64'), 'text': ('text', ''),
                   'jsonb': ('jsonb', ''), 'uuid': ('uuid', ''), 'bigint': ('bigint', ''),
                   'timestamptz': ('timestamp with time zone', ''),
                   'timestamp with time zone': ('timestamp with time zone', ''),
                   'double precision': ('double precision', '')}
        mismatches = []
        for key, declared in expected.items():
            want = aliases.get(declared, (declared, ''))
            got = actual.get(key)
            if got != want:
                mismatches.append(f'{key[0]}.{key[1]}')
        if mismatches:
            raise ReleaseError('current database reader schema is missing or mistypes required columns: ' + ', '.join(mismatches))
        obj = self.inspect(container_id)
        if obj.get('State', {}).get('Status') != 'running':
            raise ReleaseError('schema proof container is not running')
        raw_build = run(['docker', 'exec', container_id, 'cat', '/app/ux/build.json']).stdout.encode()
        return {'status': 'pass', 'queryReadOnly': True,
                'schemaFingerprint': lock['schemaFingerprint'],
                'source': 'stage.database-schema-readonly',
                'containerId': obj['Id'], 'imageDigest': obj['Image'],
                'buildSha256': digest(raw_build), 'readerLockSha256': json_sha(lock_path),
                'checkedAt': datetime.now(timezone.utc).isoformat()}

    def identity_by_id(self, cid, allow_stopped=False):
        obj = self.inspect(cid)
        if not allow_stopped and obj['State']['Status'] != 'running':
            raise ReleaseError('container is not running after activation')
        build = run(['docker', 'exec', cid, 'cat', '/app/ux/build.json']).stdout.encode() if obj['State']['Running'] else b''
        return {'containerId': obj['Id'], 'name': obj['Name'].lstrip('/'), 'imageId': obj['Image'],
                'buildSha256': digest(build) if build else None, 'state': obj['State']['Status']}

    def restore(self, prior, expected_current):
        old_id = prior['containerId']
        old = self.inspect(old_id)
        if old['Id'] != old_id:
            raise ReleaseError('prior immutable container ID is unavailable')
        expected_id = expected_current.get('containerId')
        owner_id = self._primary_owner_id()
        if owner_id not in (None, old_id, expected_id):
            raise ReleaseError('foreign container owns primary alias; preserving foreign writer')
        if owner_id == expected_id and expected_id != old_id:
            current = self.inspect(expected_id)
            attached_current = current.get('NetworkSettings', {}).get('Networks', {}).get(self.config['network'])
            if attached_current:
                run(['docker', 'network', 'disconnect', self.config['network'], expected_id], check=False)
            if current['State'].get('Running'):
                run(['docker', 'stop', expected_id], check=False)
            current = self.inspect(expected_id)
            if current['Name'].lstrip('/') == self.config['primaryContainer']:
                run(['docker', 'rename', expected_id, f"usa-atlas-failed-{expected_id[:12]}"])
        owner_id = self._primary_owner_id()
        if owner_id not in (None, old_id):
            raise ReleaseError('foreign container took primary alias during recovery; preserving foreign writer')
        old = self.inspect(old_id)
        if old['Name'].lstrip('/') != self.config['primaryContainer']:
            run(['docker', 'rename', old_id, self.config['primaryContainer']])
        old = self.inspect(old_id)
        attached = (old.get('NetworkSettings', {}).get('Networks', {}).get(self.config['network']) or {})
        if attached.get('IPAddress') != self.config['primaryAddress']:
            if attached:
                run(['docker', 'network', 'disconnect', self.config['network'], old_id], check=False)
            run(['docker', 'network', 'connect', '--ip', self.config['primaryAddress'], self.config['network'], old_id])
        old = self.inspect(old_id)
        if not old.get('State', {}).get('Running'):
            run(['docker', 'start', old_id])
        if self._primary_owner_id() != old_id:
            raise ReleaseError('primary alias changed during recovery')
        restored = self.live_identity()
        if restored['containerId'] != old_id or restored['networkAddress'] != self.config['primaryAddress']:
            raise ReleaseError('prior container did not recover at the primary alias and IP')
        self.healthcheck(prior['buildSha256'])

    def remove_stage(self, stage):
        run(['docker', 'rm', '-f', stage['containerId']], check=False)
        # Keep the unique image tag and saved image for failure-label audit.

    def remove_baseline_test_stage(self, stage):
        obj = self.inspect(stage['containerId'])
        if (stage.get('purpose') != 'preactivation-baseline-rehearsal' or
                obj.get('Name') != '/usa-atlas-rollback-stage-' + stage['releaseId'] or
                obj.get('Image') != stage['testedImageDigest'] or
                self._primary_owner_id() == stage['containerId']):
            raise ReleaseError('baseline test container identity changed; preserving it')
        run(['docker', 'rm', '-f', stage['containerId']])

    def stage_rollback_target(self, prior, current, release_id, reader_identity,
                              lock_path, contract_path):
        """Run the exact archived image at the isolated stage IP for regression tests."""
        self.ensure_stage_address_free()
        image_id = prior['imageId']
        if self.image_digest(image_id) != image_id:
            raise ReleaseError('archived rollback image ID is unavailable or changed')
        name = f"usa-atlas-rollback-stage-{release_id}"
        cid = run(['docker', 'run', '-d', '--name', name, '--network', self.config['network'],
                   '--ip', self.config['stageAddress'], '--user', self.config['runtimeUser'],
                   '--read-only', '--memory', self.config.get('memory', '384m'),
                   '--cpus', self.config.get('cpus', '1'), '--pids-limit', str(self.config.get('pidsLimit', 64)),
                   *self._mount_args(prior), image_id,
                   *(self.inspect(prior['containerId']).get('Config', {}).get('Cmd') or [])]).stdout.strip()
        obj = self.inspect(cid)
        mounts = [self._mount_identity(m) for m in obj.get('Mounts', [])]
        expected_mounts = {m['destination']: m for m in prior.get('mounts', [])
                           if m['destination'] in (self.config['readerSecretDestination'], self.config['databaseDestination'], '/var/lib/usa-atlas/reports')}
        actual_mounts = {m['destination']: m for m in mounts}
        try:
            self._reject_unapproved_writes(mounts, expected_mounts.values())
        except ReleaseError:
            self.remove_stage({'containerId': cid})
            raise
        network = (obj.get('NetworkSettings', {}).get('Networks', {}).get(self.config['network']) or {})
        if (obj.get('Image') != image_id or obj.get('Config', {}).get('User') != self.config['runtimeUser'] or
                not obj.get('HostConfig', {}).get('ReadonlyRootfs') or
                network.get('IPAddress') != self.config['stageAddress'] or
                any(actual_mounts.get(dest) != mount for dest, mount in expected_mounts.items())):
            self.remove_stage({'containerId': cid})
            raise ReleaseError('rollback test container does not match the archived runtime contract')
        temp = Path(tempfile.mkdtemp(prefix='usa-release-rollback-stage-'))
        try:
            raw = run(['docker', 'exec', cid, 'cat', '/app/ux/build.json']).stdout.encode()
            run(['docker', 'cp', f'{cid}:/app/.', str(temp)])
            if digest((temp / 'ux/build.json').read_bytes()) != digest(raw) or digest(raw) != prior['buildSha256']:
                raise ReleaseError('archived rollback image runtime build identity differs from prior baseline')
            required = prior.get('requiredFileSha256')
            if not isinstance(required, dict) or not required or _tree_hashes(temp, required) != required:
                raise ReleaseError('archived rollback image files differ from the exact captured baseline')
            build = read_json(temp / 'ux/build.json')
            if (build.get('readerLockSha256') != reader_identity['readerLockSha256'] or
                    build.get('readerSchemaFingerprint') != reader_identity['readerSchemaFingerprint']):
                raise ReleaseError('archived rollback runtime reader contract differs from current reviewed lock')
        except BaseException:
            self.remove_stage({'containerId': cid})
            raise
        finally:
            import shutil
            shutil.rmtree(temp, ignore_errors=True)
        rollback_baseline = {'containerId': current['containerId'], 'imageDigest': current['imageId'],
                             'buildSha256': current['buildSha256'], 'sourceCommit': current['sourceCommit']}
        try:
            proof = self.reader_schema_proof(cid, lock_path, contract_path)
        except BaseException:
            self.remove_stage({'containerId': cid})
            raise
        runtime_release_id = build.get('release')
        if not isinstance(runtime_release_id, str) or not runtime_release_id:
            self.remove_stage({'containerId': cid})
            raise ReleaseError('archived rollback image has no runtime release identity')
        verified = {'containerId': obj['Id'], 'imageId': image_id, 'status': obj['State']['Status'],
                    'releaseId': release_id, 'runtimeReleaseId': runtime_release_id,
                    'buildSha256': prior['buildSha256'],
                    'sourceCommit': build.get('sourceCommit')}
        stage_identity = {'containerId': cid, 'imageId': image_id, 'releaseId': release_id,
                          'runtimeReleaseId': runtime_release_id,
                          'operation': 'rollback', 'testedImageDigest': image_id,
                          'runtimeBuildSha256': prior['buildSha256'],
                          'buildSha256': prior['buildSha256'],
                          'sourceCommit': build.get('sourceCommit'), **reader_identity}
        return {'releaseId': release_id, 'operation': 'rollback', 'targetRelease': runtime_release_id,
                'runtimeReleaseId': runtime_release_id, 'containerId': cid,
                'name': name, 'stageUrl': f"http://{self.config['stageAddress']}:{self.config['port']}",
                'testedImageDigest': image_id, 'imageDigest': image_id,
                'buildSha256': prior['buildSha256'], 'runtimeBuildSha256': prior['buildSha256'],
                'sourceCommit': build.get('sourceCommit'), **reader_identity,
                'stageIdentity': stage_identity, 'stageVerifiedIdentity': verified,
                'readerSchemaProof': proof, 'rollbackBaseline': rollback_baseline}


class Coordinator:
    def __init__(self, root, backend, policy_path, contract_lock, global_lock, is_main_accepted,
                 registry_path, suite_identity, mandatory_checks, contract_artifact=None,
                 source_repo=None, source_reconstructor=reconstruct_package):
        self.root, self.backend = Path(root), backend
        self.policy_path, self.contract_lock = Path(policy_path), Path(contract_lock)
        self.contract_artifact = (Path(contract_artifact) if contract_artifact else
                                  self.contract_lock.parent.parent / 'contracts/reader/v1/contract.json')
        self.global_lock, self.is_main_accepted = Path(global_lock), is_main_accepted
        self.source_repo, self.source_reconstructor = source_repo, source_reconstructor
        self.registry_path = Path(registry_path)
        if not suite_identity or not mandatory_checks:
            raise ReleaseError('current acceptance suite identity and required checks must be configured')
        if len(set(mandatory_checks)) != len(mandatory_checks) or any(not re.fullmatch(r'[a-z0-9][a-z0-9._-]*', item) for item in mandatory_checks):
            raise ReleaseError('mandatory acceptance check IDs must be unique stable identifiers')
        self.suite_identity, self.mandatory_checks = suite_identity, tuple(mandatory_checks)
        self.root.mkdir(parents=True, exist_ok=True)

    def _require_current_acceptance_source(self, receipt, *, expected=None):
        runner_commit = receipt.get('acceptanceSourceCommit') if isinstance(receipt, dict) else None
        if not isinstance(runner_commit, str) or not re.fullmatch(r'[0-9a-f]{40}', runner_commit):
            raise ReleaseError('acceptance receipt acceptanceSourceCommit must be a full Git SHA')
        if expected is not None and runner_commit != expected:
            raise ReleaseError('acceptance runner source is not the accepted release source commit')
        if not self.is_main_accepted(runner_commit):
            raise ReleaseError('acceptance runner source is not exact current public remote main SHA')

    def _record(self, release_id):
        if not re.fullmatch(r'[A-Za-z0-9._-]{1,80}', release_id):
            raise ReleaseError('invalid release identity')
        return self.root / (release_id + '.json')

    def stage(self, release_id, package, plan, baseline_build_sha):
        with deployment_lock(self.global_lock):
            path = self._record(release_id)
            if path.exists():
                raise ReleaseError('release identity has already been used')
            if not self.is_main_accepted(plan['targetCommit']):
                raise ReleaseError('production stage requires target to equal current public remote main SHA')
            current = self.backend.live_identity()
            if current['buildSha256'] != baseline_build_sha or plan['baselineBuildSha256'] != baseline_build_sha:
                raise ReleaseError('stale production baseline build.json identity')
            if plan.get('baselineFiles') and current.get('requiredFileSha256') != plan['baselineFiles']:
                raise ReleaseError('stale production baseline shipped-file snapshot')
            if plan.get('baselineContainerId') and current.get('containerId') != plan['baselineContainerId']:
                raise ReleaseError('stale production baseline container identity')
            if plan.get('baselineImageId') and current.get('imageId') != plan['baselineImageId']:
                raise ReleaseError('stale production baseline image identity')
            if hasattr(self.backend, 'config'):
                config = self.backend.config
                if current.get('user') != config['runtimeUser'] or current.get('readOnlyRoot') is not True:
                    raise ReleaseError('primary container UID/GID or read-only root does not match release policy')
                if current.get('network') != config['network'] or current.get('networkAddress') != config['primaryAddress']:
                    raise ReleaseError('primary container network/IP does not match release policy')
                required_mounts = {config['readerSecretDestination'], config['databaseDestination']}
                mount_rows = {m['destination']: m for m in current.get('mounts', [])}
                if not required_mounts.issubset(mount_rows) or any(not mount_rows[m]['readOnly'] for m in required_mounts):
                    raise ReleaseError('primary required mounts are absent or writable')
                if hasattr(self.backend, '_reject_unapproved_writes'):
                    self.backend._reject_unapproved_writes(current.get('mounts', []),
                        [m for m in current.get('mounts', []) if m['destination'] == '/var/lib/usa-atlas/reports'])
            inv = package_inventory(package)
            if inv['sourceCommit'] != plan.get('targetCommit'):
                raise ReleaseError('package sourceCommit differs from the reviewed plan targetCommit')
            reader = contract_identity(self.contract_lock, self.contract_artifact.relative_to(self.contract_lock.parent.parent).as_posix())
            build_meta = read_json(Path(package) / 'ux/build.json')
            if (build_meta.get('readerLockSha256') != reader['readerLockSha256'] or
                    build_meta.get('readerSchemaFingerprint') != reader['readerSchemaFingerprint']):
                raise ReleaseError('package reader contract identity differs from the reviewed lock')
            if read_json(Path(package) / 'ux/build.json').get('release') != release_id:
                raise ReleaseError('package build.release must equal requested release ID')
            if (build_meta.get('previousRelease') != current.get('release') or
                    build_meta.get('previousBuildSha256') != current['buildSha256']):
                raise ReleaseError('package previousRelease and previousBuildSha256 must match the captured production baseline')
            expected = digest(json.dumps(plan['packageFiles'], sort_keys=True, separators=(',', ':')).encode())
            actual_files = {**inv['files'], 'ux/build.json': inv['buildSha256'],
                            'preview-assets.json': inv['previewAssetsSha256']}
            if actual_files != plan['packageFiles'] or digest(json.dumps(actual_files, sort_keys=True, separators=(',', ':')).encode()) != expected:
                raise ReleaseError('stage package differs from approved full-content plan')
            if plan.get('packageSha256') != expected:
                raise ReleaseError('plan package fingerprint does not match its exact file inventory')
            baseline_files = plan.get('baselineFiles')
            if not isinstance(baseline_files, dict):
                raise ReleaseError('plan is missing its full baseline file inventory')
            changes = sorted(name for name in set(baseline_files) | set(actual_files)
                             if baseline_files.get(name) != actual_files.get(name))
            expected_diff = {name: {'before': baseline_files.get(name), 'after': actual_files.get(name)}
                             for name in changes}
            if changes != plan.get('declaredChanges') or expected_diff != plan.get('diff'):
                raise ReleaseError('plan declared diff does not match the full content inventories')
            if recompute_content_diff(baseline_files, plan.get('baselineFileText') or {}, package) != plan.get('contentDiff'):
                raise ReleaseError('reviewed contentDiff differs from the staged baseline and candidate bytes')
            if not self.source_repo:
                raise ReleaseError('exact committed-source reconstruction is not configured')
            reconstructed = self.source_reconstructor(
                self.source_repo, plan['targetCommit'], release_id,
                build_meta['previousRelease'], build_meta['previousBuildSha256'])
            source_proof = compare_source_reconstruction(package, reconstructed)
            if source_proof['sourceCommit'] != plan['targetCommit'] or source_proof['packageSha256'] != expected:
                raise ReleaseError('source proof does not bind the exact target commit and package')
            started = datetime.now(timezone.utc).isoformat()
            record = {'schema': 2, 'releaseId': release_id, 'status': 'staging',
                      'events':[{'status':'staging','at':started}], 'plan': plan,
                      'baselineAtOperationStart': current, 'buildSha256': inv['buildSha256'],
                      'sourceCommit': inv['sourceCommit'], 'sourceProof': source_proof,
                      'startedAt': started}
            atomic_json(path, record)
            stage = None
            archive_dir = self.root / (release_id + '.artifacts')
            try:
                archive_dir.mkdir(mode=0o700)
                package_archive = archive_dir / 'package.tar'
                with package_archive.open('xb') as stream, tarfile.open(fileobj=stream, mode='w') as archive:
                    archive.add(package, arcname='package', recursive=True)
                record['packageArchive'] = str(package_archive)
                record['packageArchiveSha256'] = json_sha(package_archive)
                if isinstance(self.backend, DockerBackend):
                    stage = self.backend.stage(package, release_id, current, archive_dir)
                else:
                    stage = self.backend.stage(package, release_id, current)
                inv_after = package_inventory(package)
                full_after = {**inv_after['files'], 'ux/build.json': inv_after['buildSha256'],
                              'preview-assets.json': inv_after['previewAssetsSha256']}
                if full_after != plan['packageFiles']:
                    raise ReleaseError('package changed while Docker built the pending image')
                if not policy_not_revoked(read_json(self.policy_path), inv_after['buildSha256'], stage['imageDigest']):
                    raise ReleaseError('staged artifact is revoked by immutable release policy')
                staged = self.backend.stage_identity(stage)
                if (staged.get('containerId') != stage.get('containerId') or
                        staged.get('imageId') != stage.get('imageId') or staged.get('status') != 'running'):
                    raise ReleaseError('staged runtime identity/configuration did not verify')
                if (staged.get('packageSha256') and staged['packageSha256'] != plan['packageSha256']) or (
                        staged.get('buildSha256') and staged['buildSha256'] != inv_after['buildSha256']) or (
                        staged.get('sourceCommit') and staged['sourceCommit'] != inv_after['sourceCommit']):
                    raise ReleaseError('staged runtime labels do not match the approved package')
                proof = self.backend.reader_schema_proof(stage['containerId'], self.contract_lock, self.contract_artifact)
                self._check_reader_proof(proof, stage, inv_after['buildSha256'])
                identity = contract_identity(self.contract_lock, self.contract_artifact.relative_to(self.contract_lock.parent.parent).as_posix())
                stage.update({'operation': 'activate', 'testedImageDigest': stage['imageDigest'],
                              'runtimeBuildSha256': stage['buildSha256'], **identity})
                staged.update(identity)
                record.update(status='staged', stageIdentity=stage,
                              imageDigest=stage['imageDigest'], stageVerifiedIdentity=staged,
                              operation='activate', testedImageDigest=stage['imageDigest'],
                              runtimeBuildSha256=stage['buildSha256'],
                              readerSchemaProof=proof, **identity,
                              stagedAt=datetime.now(timezone.utc).isoformat())
                record['events'].append({'status':'staged','at':record['stagedAt']})
                atomic_json(path, record)
                return record
            except BaseException as error:
                if stage:
                    try:
                        self.backend.remove_stage(stage)
                    except BaseException as cleanup_error:
                        record['stageCleanupError'] = str(cleanup_error)
                record.update(status='stage-failed', stageError=str(error))
                record['events'].append({'status':'stage-failed','at':datetime.now(timezone.utc).isoformat()})
                atomic_json(path, record)
                raise

    def activate(self, release_id, receipt):
        with deployment_lock(self.global_lock):
            path = self._record(release_id)
            record = read_json(path)
            if record['status'] != 'staged':
                raise ReleaseError('release is not staged')
            if not self.is_main_accepted(record['sourceCommit']):
                raise ReleaseError('activation source is not exact current public remote main SHA')
            self._require_current_acceptance_source(receipt, expected=record['sourceCommit'])
            prior = record['baselineAtOperationStart']
            if self.backend.live_identity() != prior:
                raise ReleaseError('production baseline changed since stage')
            proof = record.get('sourceProof') or {}
            if (proof.get('sourceCommit') != record.get('sourceCommit') or
                    proof.get('packageSha256') != record.get('plan', {}).get('packageSha256') or
                    proof.get('buildRawSha256') != record.get('buildSha256')):
                raise ReleaseError('activation requires a source proof bound to the staged package')
            stage_now = self.backend.stage_identity(record['stageIdentity'])
            if stage_now.get('containerId') != record['stageIdentity']['containerId'] or stage_now.get('imageId') != record['stageIdentity']['imageId']:
                raise ReleaseError('staged immutable container/image identity changed')
            if (stage_now.get('packageSha256') and stage_now['packageSha256'] != record['plan']['packageSha256']) or (
                    stage_now.get('buildSha256') and stage_now['buildSha256'] != record['buildSha256']) or (
                    stage_now.get('sourceCommit') and stage_now['sourceCommit'] != record['sourceCommit']):
                raise ReleaseError('staged image labels do not match the approved release package')
            if stage_now.get('buildSha256') != record['buildSha256']:
                raise ReleaseError('staged runtime raw build metadata differs from the approved package')
            if stage_now.get('status') != 'running':
                raise ReleaseError('staged container is not running for acceptance/activation')
            verify_receipt(receipt, self.contract_lock, release_id=release_id, operation='activate',
                           image_digest=record['imageDigest'], build_sha=record['buildSha256'],
                           source_commit=record['sourceCommit'], started_at=record['stagedAt'],
                           suite_identity=self.suite_identity, mandatory_checks=self.mandatory_checks,
                           vendored_artifact=self.contract_artifact.relative_to(self.contract_lock.parent.parent).as_posix())
            if not policy_not_revoked(read_json(self.policy_path), record['buildSha256'], record['imageDigest']):
                raise ReleaseError('candidate artifact is revoked by immutable release policy')
            if not policy_allows(read_json(self.registry_path), record['buildSha256'], record['imageDigest']):
                raise ReleaseError('candidate artifact is not currently approved in artifact registry')
            proof = self.backend.reader_schema_proof(record['stageIdentity']['containerId'], self.contract_lock, self.contract_artifact)
            self._check_reader_proof(proof, record['stageIdentity'], record['buildSha256'])
            record['readerSchemaProof'] = proof
            record['activationStartedAt'] = datetime.now(timezone.utc).isoformat()
            record.setdefault('events', []).append({'status':'activating','at':record['activationStartedAt']})
            record['status'] = 'activating'
            record['activationTransaction'] = {
                'priorIdentity': prior,
                'candidateIdentity': record['stageIdentity'],
                'status': 'pending-recovery',
                'startedAt': record['activationStartedAt']}
            atomic_json(path, record)
            try:
                live = self.backend.activate(record['stageIdentity'], prior)
                if live.get('containerId') != record['stageIdentity']['containerId'] or live.get('imageId') != record['stageIdentity']['imageId']:
                    raise ReleaseError('backend returned unexpected activated container/image identity')
                if hasattr(self.backend, 'config'):
                    config = self.backend.config
                    required_mounts = {config['readerSecretDestination'], config['databaseDestination']}
                    mounts = {item['destination']: item for item in live.get('mounts', [])}
                    if (live.get('network') != config['network'] or live.get('networkAddress') != config['primaryAddress'] or
                            live.get('user') != config['runtimeUser'] or live.get('readOnlyRoot') is not True or
                            not required_mounts.issubset(mounts) or any(not mounts[m]['readOnly'] for m in required_mounts)):
                        raise ReleaseError('activated container runtime configuration does not match release policy')
                    if hasattr(self.backend, '_reject_unapproved_writes'):
                        expected_mounts = record['stageIdentity'].get('expectedMounts', [])
                        self.backend._reject_unapproved_writes(live.get('mounts', []), expected_mounts)
                        actual_mounts = {m['destination']: m for m in live.get('mounts', [])}
                        if any(actual_mounts.get(m['destination']) != m for m in expected_mounts):
                            raise ReleaseError('activated private storage or read-only mount identity changed')
            except BaseException as error:
                try:
                    now = self.backend.live_identity()
                    if (now.get('containerId') == record['stageIdentity']['containerId'] and
                            now.get('imageId') == record['stageIdentity']['imageId']):
                        self.backend.restore(prior, now)
                        record['status'] = 'activation-failed-restored'
                    elif now.get('containerId') == prior.get('containerId'):
                        record['status'] = 'activation-failed-restored'
                    else:
                        raise ReleaseError('live container is not this transaction candidate; preserving foreign writer')
                    record['activationTransaction']['status'] = 'restored'
                    record['activationTransaction']['recoveredAt'] = datetime.now(timezone.utc).isoformat()
                except BaseException as recovery:
                    record['status'] = 'activation-recovery-conflict'
                    record['recoveryError'] = str(recovery)
                    record['activationTransaction']['status'] = 'recovery-failed'
                    record['activationTransaction']['error'] = str(recovery)
                record['activationError'] = str(error)
                record['events'].append({'status':record['status'],'at':datetime.now(timezone.utc).isoformat()})
                atomic_json(path, record)
                raise
            record.update(status='active', liveIdentity=live, activationReceipt=receipt,
                          activatedAt=datetime.now(timezone.utc).isoformat())
            record['activationTransaction']['status'] = 'complete'
            record['activationTransaction']['completedAt'] = record['activatedAt']
            record['events'].append({'status':'active','at':record['activatedAt']})
            atomic_json(path, record)
            return record

    def recover(self, release_id):
        with deployment_lock(self.global_lock):
            path = self._record(release_id)
            record = read_json(path)
            transaction = record.get('activationTransaction')
            if not transaction or transaction.get('status') not in ('pending-recovery', 'recovery-failed'):
                raise ReleaseError('release has no interrupted activation transaction to recover')
            prior = transaction.get('priorIdentity')
            candidate = transaction.get('candidateIdentity')
            if not isinstance(prior, dict) or not isinstance(candidate, dict):
                raise ReleaseError('activation recovery identities are incomplete')
            try:
                prior_id = prior.get('containerId')
                candidate_id = candidate.get('containerId')
                if not prior_id or not candidate_id:
                    raise ReleaseError('activation recovery container IDs are incomplete')
                self.backend.restore(prior, {'containerId': candidate_id})
                result = self.backend.live_identity()
                if result.get('containerId') != prior_id:
                    raise ReleaseError('recovery did not restore the recorded prior container')
                if candidate_id != prior_id:
                    self.backend.remove_stage({'containerId': candidate_id})
                transaction.update(status='restored', resultIdentity=result,
                                   recoveredAt=datetime.now(timezone.utc).isoformat())
                record.update(status='activation-failed-restored', recoveryResult='prior-restored')
            except BaseException as error:
                transaction.update(status='recovery-failed', error=str(error),
                                   attemptedAt=datetime.now(timezone.utc).isoformat())
                record.update(status='activation-recovery-conflict', recoveryError=str(error))
                atomic_json(path, record)
                raise
            record.setdefault('events', []).append({'status':record['status'],
                'at':transaction['recoveredAt']})
            atomic_json(path, record)
            return record

    def stage_current_baseline(self, proof_id, output):
        """Rehearse current approved runtime at stage before any candidate activation."""
        with deployment_lock(self.global_lock):
            if not self.is_main_accepted(require_clean_checkout(self.source_repo)):
                raise ReleaseError('baseline rehearsal requires clean current accepted main')
            path = self._record(proof_id + '-baseline-proof')
            if path.exists() or Path(output).exists():
                raise ReleaseError('baseline rehearsal identity/output already exists')
            current = self.backend.live_identity()
            if (not policy_not_revoked(read_json(self.policy_path), current['buildSha256'], current['imageId']) or
                    not policy_allows(read_json(self.registry_path), current['buildSha256'], current['imageId'])):
                raise ReleaseError('baseline runtime is not currently approved or is revoked')
            identity = contract_identity(self.contract_lock,
                self.contract_artifact.relative_to(self.contract_lock.parent.parent).as_posix())
            result = self.backend.stage_rollback_target(current, current, proof_id, identity,
                                                       self.contract_lock, self.contract_artifact)
            result.update(purpose='preactivation-baseline-rehearsal')
            try:
                if self.backend.live_identity() != current:
                    raise ReleaseError('live identity changed during baseline rehearsal')
                atomic_json(path, {'releaseId':proof_id, 'status':'baseline-test-staged',
                                   'stageEvidence':result})
                with Path(output).open('x') as stream:
                    json.dump(result, stream, indent=2, sort_keys=True)
                    stream.write('\n')
                    stream.flush(); os.fsync(stream.fileno())
            except BaseException:
                self.backend.remove_stage(result)
                atomic_json(path, {'releaseId': proof_id, 'status': 'baseline-test-failed',
                                   'stageEvidence': result, 'cleanupRequested': True})
                raise
            return result

    def discard_baseline_stage(self, proof_id):
        with deployment_lock(self.global_lock):
            path = self._record(proof_id + '-baseline-proof')
            record = read_json(path)
            if record.get('status') != 'baseline-test-staged':
                raise ReleaseError('baseline test stage is not pending cleanup')
            stage = record['stageEvidence']
            self.backend.remove_baseline_test_stage(stage)
            record.update(status='baseline-test-discarded', discardedAt=datetime.now(timezone.utc).isoformat())
            atomic_json(path, record)
            return record

    def stage_rollback(self, release_id, output):
        with deployment_lock(self.global_lock):
            record = read_json(self._record(release_id))
            if record.get('status') != 'active':
                raise ReleaseError('rollback target must be an active release')
            current = self.backend.live_identity()
            if current != record.get('liveIdentity'):
                raise ReleaseError('live identity changed; rollback staging would test against a stale baseline')
            prior = record['baselineAtOperationStart']
            if (not policy_not_revoked(read_json(self.policy_path), prior['buildSha256'], prior['imageId']) or
                    not policy_allows(read_json(self.registry_path), prior['buildSha256'], prior['imageId'])):
                raise ReleaseError('rollback image is not currently approved or is revoked')
            output = Path(output)
            if output.exists():
                raise ReleaseError('rollback stage evidence output already exists')
            output.parent.mkdir(parents=True, exist_ok=True)
            identity = contract_identity(self.contract_lock,
                self.contract_artifact.relative_to(self.contract_lock.parent.parent).as_posix())
            result = self.backend.stage_rollback_target(
                prior, current, release_id, identity, self.contract_lock, self.contract_artifact)
            try:
                with output.open('x') as stream:
                    json.dump(result, stream, indent=2, sort_keys=True)
                    stream.write('\n')
            except BaseException:
                self.backend.remove_stage(result)
                raise
            return result

    def rollback(self, release_id, current_baseline, receipt, stage_evidence=None):
        with deployment_lock(self.global_lock):
            path = self._record(release_id)
            record = read_json(path)
            if record['status'] != 'active':
                raise ReleaseError('only an active release can be rolled back')
            self._require_current_acceptance_source(receipt)
            live = self.backend.live_identity()
            if live != record['liveIdentity']:
                raise ReleaseError('live identity changed; rollback would overwrite another writer')
            # current_baseline is captured at rollback operation start, after any intervening release.
            if current_baseline.get('containerId') != live.get('containerId'):
                raise ReleaseError('rollback baseline is not the actual current container snapshot')
            prior = record['baselineAtOperationStart']
            policy = read_json(self.policy_path)
            target_sha = prior['buildSha256']
            if not policy_not_revoked(policy, target_sha, prior['imageId']) or not policy_allows(read_json(self.registry_path), target_sha, prior['imageId']):
                raise ReleaseError('rollback artifact is not currently approved or is revoked')
            verify_receipt(receipt, self.contract_lock, release_id=release_id, operation='rollback',
                           image_digest=prior['imageId'], build_sha=target_sha,
                           source_commit=prior.get('sourceCommit'),
                           started_at=(datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat(),
                           suite_identity=self.suite_identity, mandatory_checks=self.mandatory_checks,
                           vendored_artifact=self.contract_artifact.relative_to(self.contract_lock.parent.parent).as_posix(),
                           runtime_release_id=(stage_evidence or {}).get('targetRelease') or prior.get('release'))
            if current_baseline != live:
                raise ReleaseError('current baseline changed during rollback preparation')
            if (receipt.get('operationBaselineContainerId') != current_baseline.get('containerId') or
                    receipt.get('operationBaselineBuildSha256') != current_baseline.get('buildSha256')):
                raise ReleaseError('rollback receipt is not bound to the current operation baseline')
            if isinstance(self.backend, DockerBackend):
                if (stage_evidence.get('targetRelease') != prior.get('release') or
                        stage_evidence.get('runtimeReleaseId') != prior.get('release') or
                        stage_evidence.get('sourceCommit') != prior.get('sourceCommit') or
                        stage_evidence.get('buildSha256') != prior.get('buildSha256')):
                    raise ReleaseError('rollback stage runtime identity differs from the archived operation target')
                if (not isinstance(stage_evidence, dict) or stage_evidence.get('operation') != 'rollback' or
                        stage_evidence.get('releaseId') != release_id or
                        stage_evidence.get('testedImageDigest') != prior['imageId'] or
                        stage_evidence.get('buildSha256') != prior['buildSha256'] or
                        stage_evidence.get('rollbackBaseline') != {
                            'containerId':live['containerId'], 'imageDigest':live['imageId'],
                            'buildSha256':live['buildSha256'], 'sourceCommit':live.get('sourceCommit')}):
                    raise ReleaseError('rollback stage evidence is missing or bound to a different baseline/image')
                test_container = self.backend.inspect(stage_evidence.get('containerId', ''))
                stage_name = f"usa-atlas-rollback-stage-{release_id}"
                stage_network = (test_container.get('NetworkSettings', {}).get('Networks', {}).get(self.backend.config['network']) or {})
                if (test_container.get('Name', '').lstrip('/') != stage_name or
                        test_container.get('Image') != prior['imageId'] or
                        stage_network.get('IPAddress') != self.backend.config['stageAddress']):
                    raise ReleaseError('rollback test container identity changed; refusing cleanup or promotion')
                proof = self.backend.reader_schema_proof(stage_evidence['containerId'], self.contract_lock, self.contract_artifact)
                self._check_reader_proof(proof, {'containerId':stage_evidence['containerId'],
                    'imageId':prior['imageId']}, prior['buildSha256'])
            self.backend.restore(prior, live)
            if isinstance(self.backend, DockerBackend):
                self.backend.remove_stage({'containerId':stage_evidence['containerId']})
            record.update(status='rolled-back', rollbackReceipt=receipt,
                          rollbackBaseline=current_baseline, rolledBackAt=datetime.now(timezone.utc).isoformat())
            record.setdefault('events', []).append({'status':'rolled-back','at':record['rolledBackAt']})
            atomic_json(path, record)
            return record

    def _check_reader_proof(self, proof, identity, build_sha):
        expected = {'containerId':identity['containerId'],
                    'imageDigest':identity.get('imageId', identity.get('imageDigest')),
                    'buildSha256':build_sha, 'readerLockSha256':json_sha(self.contract_lock)}
        if (not isinstance(proof, dict) or proof.get('status') != 'pass' or
                proof.get('schemaFingerprint') != contract_identity(self.contract_lock)['readerSchemaFingerprint'] or
                any(proof.get(key) != value for key, value in expected.items())):
            raise ReleaseError('current reader schema proof is missing or bound to a different runtime/lock')
        try:
            checked = datetime.fromisoformat(proof['checkedAt'].replace('Z', '+00:00'))
        except (KeyError, ValueError, TypeError, AttributeError) as error:
            raise ReleaseError('current reader schema proof has no valid checkedAt timestamp') from error
        if checked.tzinfo is None or checked > datetime.now(timezone.utc) or datetime.now(timezone.utc) - checked > timedelta(minutes=15):
            raise ReleaseError('current reader schema proof is stale or from the future')


def capture_snapshot(config, output):
    """Read-only snapshot of the live runtime and all files named by its build metadata."""
    if Path(output).exists():
        raise ReleaseError('snapshot output already exists; immutable snapshots are never overwritten')
    backend = DockerBackend(config)
    live = backend.live_identity()
    temp = Path(tempfile.mkdtemp(prefix='usa-release-snapshot-'))
    try:
        run(['docker', 'cp', f"{live['containerId']}:/app/.", str(temp)])
        build_raw = (temp / 'ux/build.json').read_bytes()
        if digest(build_raw) != live['buildSha256']:
            raise ReleaseError('container build metadata changed while snapshotting')
        hashes, build = expected_hashes(temp)
        include_legacy_runtime_inputs(temp, hashes)
        # The running package can predate shippedSha256; include each legacy hash source.
        full = _tree_hashes(temp, hashes)
        full['ux/build.json'] = digest(build_raw)
        full['preview-assets.json'] = json_sha(temp / 'preview-assets.json')
        if full != live['requiredFileSha256']:
            raise ReleaseError('shipped files changed while capturing the baseline snapshot')
        record = {'schema': 1, 'capturedAt': datetime.now(timezone.utc).isoformat(),
                  'release': build.get('release'), 'buildSha256': digest(build_raw),
                  'previewAssetsSha256': full['preview-assets.json'],
                  'sourceCommit': build.get('sourceCommit'),
                  'sourceBaseCommit': build.get('sourceBaseCommit'),
                  'requiredFileText': {name: (temp / name).read_text(errors='replace')
                    for name in (set(hashes) | {'ux/build.json', 'preview-assets.json'})
                    if name.lower().endswith(('.html', '.js', '.css', '.json', '.xml', '.txt', '.py', '.sql'))},
                  'requiredFileSha256': full,
                  'imageId': live['imageId'], 'containerId': live['containerId'],
                  'containerName': live['name'], 'mounts': live['mounts'],
                  'user': live['user'], 'readOnlyRoot': live['readOnlyRoot'],
                  'network': config['network'], 'primaryAddress': config['primaryAddress']}
        atomic_json(output, record)
        return record
    finally:
        import shutil
        shutil.rmtree(temp, ignore_errors=True)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, default=Path('ops/release-config.example.json'))
    parser.add_argument('--policy', type=Path, default=Path('ops/release-policy.json'))
    parser.add_argument('--contracts-lock', type=Path, default=Path('contracts/reader-contract.lock.json'))
    parser.add_argument('--contracts-artifact', type=Path)
    parser.add_argument('--registry', type=Path)
    parser.add_argument('--repo', type=Path, default=Path('.'))
    parser.add_argument('--state-dir', type=Path)
    sub = parser.add_subparsers(dest='command', required=True)
    snap = sub.add_parser('snapshot'); snap.add_argument('--output', type=Path, required=True)
    prepare = sub.add_parser('prepare'); prepare.add_argument('--destination', type=Path, required=True); prepare.add_argument('--release', required=True); prepare.add_argument('--source-commit', required=True); prepare.add_argument('--previous-release', required=True); prepare.add_argument('--previous-build-sha256', required=True)
    plan = sub.add_parser('plan'); plan.add_argument('--baseline', type=Path, required=True); plan.add_argument('--package', type=Path, required=True); plan.add_argument('--baseline-build-sha', required=True); plan.add_argument('--baseline-release', required=True); plan.add_argument('--changes', nargs='*', default=[]); plan.add_argument('--output', type=Path, required=True)
    stage = sub.add_parser('stage'); stage.add_argument('--id', required=True); stage.add_argument('--package', type=Path, required=True); stage.add_argument('--plan', type=Path, required=True); stage.add_argument('--baseline-build-sha', required=True)
    recover = sub.add_parser('recover'); recover.add_argument('--id', required=True)
    activate = sub.add_parser('activate'); activate.add_argument('--id', required=True); activate.add_argument('--receipt', type=Path, required=True)
    rollback = sub.add_parser('rollback'); rollback.add_argument('--id', required=True); rollback.add_argument('--receipt', type=Path, required=True)
    rollback.add_argument('--stage-evidence', type=Path)
    rollback_stage = sub.add_parser('rollback-stage'); rollback_stage.add_argument('--id', required=True); rollback_stage.add_argument('--output', type=Path, required=True)
    baseline_stage = sub.add_parser('baseline-stage'); baseline_stage.add_argument('--id', required=True); baseline_stage.add_argument('--output', type=Path, required=True)
    discard_baseline = sub.add_parser('baseline-stage-discard'); discard_baseline.add_argument('--id', required=True)
    relay = sub.add_parser('relay-sync'); relay.add_argument('--id', required=True); relay.add_argument('--source-commit', required=True); relay.add_argument('--baseline-build-sha', required=True); relay.add_argument('--expected-preimage-sha256', required=True)
    args = parser.parse_args(argv)
    try:
        if args.command == 'relay-sync':
            result = sync_public_relay(args)
        elif args.command == 'snapshot':
            config = read_json(args.config)
            lock_path = Path(os.environ.get(config.get('deploymentLockEnv', 'USA_ATLAS_DEPLOYMENT_LOCK'), '/opt/usa-atlas-releases/deployment.lock'))
            with deployment_lock(lock_path):
                result = capture_snapshot(config, args.output)
        elif args.command == 'prepare':
            head = require_clean_checkout(args.repo)
            if head != args.source_commit:
                raise ReleaseError('prepare source commit must equal the clean checkout HEAD')
            builder_path = Path(__file__).with_name('build_temporary_preview.py')
            spec = importlib.util.spec_from_file_location('release_preview_builder', builder_path)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            result = module.build(args.destination, args.release, args.source_commit,
                                  args.previous_release, args.previous_build_sha256, emit=False)
        elif args.command == 'plan':
            result = create_plan(args.baseline, args.package, args.baseline_release,
                                 args.baseline_build_sha, args.changes, args.output)
        else:
            config = read_json(args.config)
            acceptance_policy = read_json(config.get('acceptancePolicy', 'ops/acceptance-policy.json'))
            if acceptance_policy.get('format') != 'usa_atlas_application_acceptance_policy':
                raise ReleaseError('current application acceptance policy is missing or has an unsupported format')
            immutable = read_json(args.policy).get('acceptancePolicy', {})
            if (json_sha(config.get('acceptancePolicy', 'ops/acceptance-policy.json')) != immutable.get('sha256') or
                    acceptance_policy.get('suiteIdentity') != immutable.get('suiteIdentity') or
                    acceptance_policy.get('mandatoryCheckIDs') != immutable.get('mandatoryCheckIDs')):
                raise ReleaseError('application acceptance policy bytes, suite identity, or mandatory checks differ from immutable release policy')
            state = args.state_dir or Path(os.environ.get(config.get('stateDirectoryEnv', 'USA_ATLAS_RELEASE_STATE_DIR'), '/opt/usa-atlas-releases'))
            backend = DockerBackend(config)
            coordinator = Coordinator(state / 'records', backend, args.policy, args.contracts_lock,
                                      Path(os.environ.get(config.get('deploymentLockEnv', 'USA_ATLAS_DEPLOYMENT_LOCK'), '/opt/usa-atlas-releases/deployment.lock')),
                                      lambda commit: (require_clean_checkout(args.repo) == commit and
                                          accepted_main(args.repo, commit, config.get('mainRemote', 'origin'), config.get('mainBranch', 'main'))),
                                      args.registry or Path(config.get('approvalRegistry', str(state / 'approved-artifacts.json'))),
                                      acceptance_policy.get('suiteIdentity'), acceptance_policy['mandatoryCheckIDs'],
                                      args.contracts_artifact or Path(config.get('readerContractArtifact', 'contracts/reader/v1/contract.json')),
                                      source_repo=args.repo)
            if args.command == 'stage':
                require_clean_checkout(args.repo)
                # Network query is mandatory even when stage is attempted before source approval.
                main_sha = remote_main_sha(args.repo, config.get('mainRemote', 'origin'), config.get('mainBranch', 'main'))
                plan_data = read_json(args.plan)
                if plan_data['targetCommit'] != main_sha:
                    raise ReleaseError('stage source must equal current public remote main SHA')
                result = coordinator.stage(args.id, args.package, plan_data, args.baseline_build_sha)
            elif args.command == 'activate':
                require_clean_checkout(args.repo)
                remote_main_sha(args.repo, config.get('mainRemote', 'origin'), config.get('mainBranch', 'main'))
                result = coordinator.activate(args.id, read_json(args.receipt))
            elif args.command == 'recover':
                result = coordinator.recover(args.id)
            elif args.command == 'baseline-stage':
                require_clean_checkout(args.repo)
                result = coordinator.stage_current_baseline(args.id, args.output)
            elif args.command == 'baseline-stage-discard':
                result = coordinator.discard_baseline_stage(args.id)
            elif args.command == 'rollback-stage':
                require_clean_checkout(args.repo)
                result = coordinator.stage_rollback(args.id, args.output)
            else:
                if not args.stage_evidence:
                    raise ReleaseError('rollback requires tested --stage-evidence from rollback-stage')
                checkout_sha = require_clean_checkout(args.repo)
                main_sha = remote_main_sha(args.repo, config.get('mainRemote', 'origin'), config.get('mainBranch', 'main'))
                if checkout_sha != main_sha:
                    raise ReleaseError('rollback requires the clean checkout at current public remote main')
                result = coordinator.rollback(args.id, backend.live_identity(), read_json(args.receipt),
                                              read_json(args.stage_evidence))
        print(json.dumps(result, indent=2, sort_keys=True))
        return 0
    except (ReleaseError, OSError, KeyError, ValueError, subprocess.SubprocessError) as error:
        parser.exit(2, f'release: {error}\n')


if __name__ == '__main__':
    raise SystemExit(main())
