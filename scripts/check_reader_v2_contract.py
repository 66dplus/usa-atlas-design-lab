#!/usr/bin/env python3
"""Verify the pinned reader-v2 consumer export and optional PostgreSQL schema."""
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
FULL_FILTER = f'{PASS_FILTER} AND {ADMITTED_FILTER}'
REQUIRED_OBJECTS = {
    'catalog_field', 'ingest_run', 'observation', 'reader_batch', 'reader_observation',
    'reader_v2_catalog_field', 'reader_v2_admission_event', 'geography_boundary',
    'election_contest', 'election_candidate', 'election_party_result', 'election_availability',
}
# Exact cross-repository consumer export. Producer hash entries outside this
# map stay in contract.json as opaque provenance and are verified by producer CI.
CONSUMER_EXPORT = {
    'database/reader/v2/contract.json': 'contract.json',
    'database/reader/v2/schema.sql': 'schema.sql',
    'database/reader/v2/consumer-protocol.md': 'consumer-protocol.md',
    'database/reader/v2/fixtures/reader-fixture.sql': 'fixtures/reader-fixture.sql',
    'database/reader/v2/fixtures/reader-query.sql': 'fixtures/reader-query.sql',
}
EXPECTED_PRODUCER_CONTRACT_SHA256 = '8916c8d0fda359c56ae66ce7a94b66c0a8cea5f6307c02a0cb95f2cc4dfefe5c'
EXPECTED_SCHEMA_FINGERPRINT = '2a319fe39b1045bddb48bcdf688a20032875f4f0ea823784c07a0611f9428fa1'
FROZEN_PRODUCER_COMMIT = 'cfe51d44364ead0addf800dd663096c7bc8867d8'
# This is present in the byte-pinned producer DDL but omitted from its frozen
# consumer object map. It remains schema-checked, while the app never consumes it.
PINNED_SCHEMA_ONLY_COLUMNS = {'election_contest': {'source_mode_raw': 'text'}}


def sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def pinned_bundle() -> tuple[dict, dict, dict[str, str]]:
    lock_raw = LOCK.read_bytes()
    lock = json.loads(lock_raw)
    if (lock.get('format') != 'usa_atlas_reader_lock' or lock.get('contractVersion') != '2.0.0' or
            lock.get('producerRepository') != 'usa-atlas-data-collection' or
            lock.get('artifactPath') != 'database/reader/v2' or
            lock.get('localArtifactPath') != 'contracts/reader/v2' or
            lock.get('sourceCommit') != FROZEN_PRODUCER_COMMIT or
            not re.fullmatch(r'[0-9a-f]{40}', str(lock.get('sourceCommit', ''))) or
            not re.fullmatch(r'[0-9a-f]{64}', str(lock.get('contractSha256', ''))) or
            not re.fullmatch(r'[0-9a-f]{64}', str(lock.get('schemaFingerprint', ''))) or
            lock.get('readOnly') is not True or lock.get('admissionFilter') != FULL_FILTER):
        raise ValueError('reader-v2 lock is incomplete or does not require admitted batches and passed ingests')
    if lock.get('consumerExport') != CONSUMER_EXPORT:
        raise ValueError('reader-v2 lock consumer export differs from the reviewed exact allowlist')
    root = ARTIFACT_ROOT.resolve()
    contract_path = (root / 'contract.json').resolve()
    if not contract_path.is_relative_to(root):
        raise ValueError('reader-v2 contract escapes its artifact directory')
    contract_raw = contract_path.read_bytes()
    contract = json.loads(contract_raw)
    if (sha256(contract_raw) != lock['contractSha256'] or lock['contractSha256'] != EXPECTED_PRODUCER_CONTRACT_SHA256 or
            contract.get('format') != 'usa_atlas_reader_contract' or
            contract.get('contract_id') != 'usa_atlas.application_reader' or
            contract.get('contract_version') != '2.0.0' or contract.get('schema_fingerprint') != lock['schemaFingerprint'] or
            lock['schemaFingerprint'] != EXPECTED_SCHEMA_FINGERPRINT or
            contract.get('admission_filter') != PASS_FILTER or
            contract.get('additional_reader_filter') != ADMITTED_FILTER or contract.get('read_only') is not True):
        raise ValueError('reader-v2 contract identity, fingerprint, or mandatory admission filters do not match its lock')
    objects = contract.get('objects')
    metadata = contract.get('object_metadata')
    if not isinstance(objects, dict) or not REQUIRED_OBJECTS <= set(objects) or not isinstance(metadata, dict):
        raise ValueError('reader-v2 contract omits required reader objects or metadata')
    if set(metadata) != set(objects):
        raise ValueError('reader-v2 object metadata must cover exactly the declared object set')
    for relation, columns in objects.items():
        info = metadata.get(relation)
        if (not isinstance(columns, dict) or not columns or
                any(not isinstance(c, str) or not isinstance(t, str) or not t for c, t in columns.items()) or
                not isinstance(info, dict) or info.get('access') != 'SELECT' or
                set(info) != {'access', 'reader_filter', 'version'}):
            raise ValueError(f'reader-v2 object declaration is incomplete: {relation}')
        expected_filter = PASS_FILTER if info.get('version') == 'v1-retained' else FULL_FILTER
        if info.get('version') not in {'v1-retained', 'v2-additive'} or info.get('reader_filter') != expected_filter:
            raise ValueError(f'reader-v2 object has an invalid access filter: {relation}')
    fingerprint = sha256(json.dumps(objects, sort_keys=True, separators=(',', ':')).encode())
    if fingerprint != lock['schemaFingerprint']:
        raise ValueError('reader-v2 schema fingerprint does not match declared object columns')
    producer_hashes = contract.get('artifact_sha256')
    if not isinstance(producer_hashes, dict) or not producer_hashes:
        raise ValueError('reader-v2 contract omits the producer artifact inventory')
    if set(lock.get('artifacts', {})) != set(CONSUMER_EXPORT.values()):
        raise ValueError('reader-v2 lock must pin exactly the approved consumer export files')
    verified = {}
    for producer_path, consumer_path in CONSUMER_EXPORT.items():
        expected = lock['artifacts'].get(consumer_path)
        if producer_path != 'database/reader/v2/contract.json':
            expected_source = producer_hashes.get(producer_path)
            if not expected_source or expected != expected_source:
                raise ValueError(f'reader-v2 consumer copy is not bound to producer inventory: {producer_path}')
        path = (root / consumer_path).resolve()
        if (not path.is_relative_to(root) or not re.fullmatch(r'[0-9a-f]{64}', str(expected)) or
                sha256(path.read_bytes()) != expected):
            raise ValueError(f'reader-v2 pinned consumer artifact is missing or changed: {consumer_path}')
        verified[consumer_path] = expected
    return lock, contract, verified


def check_postgres(contract: dict) -> None:
    psql = shutil.which('psql')
    if not psql:
        raise ValueError('required PostgreSQL client is unavailable')
    if os.environ.get('PGDATABASE') != 'usa_atlas':
        raise ValueError('PostgreSQL schema check must target the isolated usa_atlas CI database')
    result = subprocess.run([psql, '-X', '-w', '-qAt', '--dbname', 'usa_atlas', '--set', 'ON_ERROR_STOP=1', '-c', """
      SELECT n.nspname||'|'||c.relname||'|'||a.attname||'|'||format_type(a.atttypid,a.atttypmod)
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
      WHERE n.nspname='usa_atlas' AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped
      ORDER BY c.relname,a.attname
    """], capture_output=True, text=True, timeout=30)
    if result.returncode:
        raise ValueError('required PostgreSQL service could not verify the v2 reader schema')
    actual: dict[str, dict[str, str]] = {}
    for line in result.stdout.splitlines():
        schema, table, column, sql_type = line.split('|', 3)
        if schema == 'usa_atlas':
            actual.setdefault(table, {})[column] = sql_type
    expected = {name: dict(columns) for name, columns in contract['objects'].items()}
    for name, columns in PINNED_SCHEMA_ONLY_COLUMNS.items():
        if name not in expected or set(columns) & set(expected[name]):
            raise ValueError('reader-v2 schema-only compatibility declaration overlaps its consumer contract')
        expected[name].update(columns)
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
    print(f"READER-V2 CHECK PASS: {lock['sourceCommit']} {len(artifacts)} consumer artifacts" +
          ('; PostgreSQL schema verified' if args.require_postgres else ''))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
