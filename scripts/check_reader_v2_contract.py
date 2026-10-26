#!/usr/bin/env python3
"""Verify the separately pinned reader-v2 bundle and optional admitted CI schema."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
LOCK = ROOT / 'contracts/reader-v2-contract.lock.json'
ARTIFACT_ROOT = ROOT / 'contracts/reader/v2'
PASS_FILTER = "usa_atlas.ingest_run.status = 'pass'"
ADMITTED_FILTER = "usa_atlas.reader_batch.candidate_status = 'admitted'"
FULL_FILTER = f'{ADMITTED_FILTER} AND {PASS_FILTER}'
REQUIRED_OBJECTS = {
    'catalog_field', 'ingest_run', 'observation', 'reader_batch', 'reader_observation',
    'reader_v2_catalog_field', 'reader_v2_admission_event', 'geography_boundary',
    'election_contest', 'election_candidate', 'election_party_result', 'election_availability',
}


def sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def pinned_bundle() -> tuple[dict, dict, dict[str, str]]:
    lock_raw = LOCK.read_bytes()
    lock = json.loads(lock_raw)
    if (lock.get('format') != 'usa_atlas_reader_lock' or
            lock.get('contractVersion') != '2.0.0' or
            not re.fullmatch(r'[0-9a-f]{40}', str(lock.get('sourceCommit', ''))) or
            not re.fullmatch(r'[0-9a-f]{64}', str(lock.get('contractSha256', ''))) or
            not re.fullmatch(r'[0-9a-f]{64}', str(lock.get('schemaFingerprint', ''))) or
            lock.get('readOnly') is not True or lock.get('admissionFilter') != FULL_FILTER):
        raise ValueError('reader-v2 lock is incomplete or does not require admitted batches and passed ingests')
    root = ARTIFACT_ROOT.resolve()
    contract_path = root / 'contract.json'
    contract_raw = contract_path.read_bytes()
    contract = json.loads(contract_raw)
    if (sha256(contract_raw) != lock['contractSha256'] or
            contract.get('version') != '2.0.0' or contract.get('schema_fingerprint') != lock['schemaFingerprint'] or
            contract.get('admission_filter') != PASS_FILTER or
            contract.get('additional_reader_filter') != ADMITTED_FILTER or
            contract.get('read_only') is not True):
        raise ValueError('reader-v2 contract identity or mandatory admission filters do not match its lock')
    objects = contract.get('objects')
    if not isinstance(objects, dict):
        raise ValueError('reader-v2 contract omits required v1 or v2 reader objects')
    fingerprint_basis = {}
    for relation, declaration in objects.items():
        name = relation.split('.', 1)[-1]
        if name in fingerprint_basis:
            raise ValueError('reader-v2 contract declares duplicate relation names')
        if '.' in relation:
            if (not isinstance(declaration, dict) or declaration.get('access') != 'SELECT' or
                    set(declaration) != {'access', 'columns', 'reader_filter', 'version'}):
                raise ValueError('reader-v2 relation access declaration is malformed')
            columns = declaration['columns']
        else:
            columns = declaration
        if (not isinstance(columns, dict) or not columns or
                any(not isinstance(column, str) or not isinstance(sql_type, str) or not sql_type
                    for column, sql_type in columns.items())):
            raise ValueError('reader-v2 contract has an incomplete object column map')
        fingerprint_basis[name] = columns
    if not REQUIRED_OBJECTS <= set(fingerprint_basis):
        raise ValueError('reader-v2 contract omits required v1 or v2 reader objects')
    fingerprint = sha256(json.dumps(fingerprint_basis, sort_keys=True, separators=(',', ':')).encode())
    if fingerprint != lock['schemaFingerprint']:
        raise ValueError('reader-v2 schema fingerprint does not match declared object columns')
    artifacts = lock.get('artifacts')
    contract_artifacts = contract.get('artifact_sha256')
    if not isinstance(artifacts, dict) or not isinstance(contract_artifacts, dict) or 'schema.sql' not in artifacts:
        raise ValueError('reader-v2 lock must pin its schema and all contract artifacts')
    verified = {}
    for relative, expected in artifacts.items():
        path = (root / relative).resolve()
        if (not path.is_relative_to(root) or not re.fullmatch(r'[0-9a-f]{64}', str(expected)) or
                sha256(path.read_bytes()) != expected):
            raise ValueError(f'reader-v2 pinned artifact is missing or changed: {relative}')
        verified[relative] = expected
    for relative, expected in contract_artifacts.items():
        if artifacts.get(relative) != expected:
            raise ValueError(f'reader-v2 contract and lock disagree on artifact: {relative}')
    return lock, contract, verified


def check_postgres(contract: dict) -> None:
    psql = shutil.which('psql')
    if not psql:
        raise ValueError('required PostgreSQL client is unavailable')
    if os.environ.get('PGDATABASE') != 'usa_atlas':
        raise ValueError('PostgreSQL schema check must target the isolated usa_atlas CI database')
    result = subprocess.run([psql, '-X', '-w', '-qAt', '--dbname', 'usa_atlas',
        '--set', 'ON_ERROR_STOP=1', '-c', """
        SELECT n.nspname||'|'||c.relname||'|'||a.attname||'|'||format_type(a.atttypid,a.atttypmod)
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
        JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
        WHERE n.nspname='usa_atlas' AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped
        ORDER BY 1,2
        """], capture_output=True, text=True, timeout=30)
    if result.returncode:
        raise ValueError('required PostgreSQL service could not verify the v2 reader schema')
    actual: dict[str, dict[str, str]] = {}
    for line in result.stdout.splitlines():
        schema, table, column, sql_type = line.split('|', 3)
        if schema == 'usa_atlas':
            actual.setdefault(table, {})[column] = sql_type
    expected = {}
    for relation, declaration in contract['objects'].items():
        name = relation.split('.', 1)[-1]
        expected[name] = declaration.get('columns') if '.' in relation else declaration
    mismatches = [name for name, columns in expected.items() if actual.get(name) != columns]
    if mismatches:
        raise ValueError('CI database is missing the exact v2 schema objects: ' + ', '.join(mismatches))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--require-postgres', action='store_true')
    args = parser.parse_args()
    try:
        lock, contract, artifacts = pinned_bundle()
        if args.require_postgres:
            check_postgres(contract)
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError) as error:
        print(f'READER-V2 CHECK FAILED: {error}', file=sys.stderr)
        return 1
    print(f"READER-V2 CHECK PASS: {lock['sourceCommit']} {len(artifacts)} pinned artifacts" +
          ('; PostgreSQL schema verified' if args.require_postgres else ''))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
