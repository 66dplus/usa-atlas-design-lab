#!/usr/bin/env python3
from __future__ import annotations
"""Verify the pinned producer bundle and, when requested, execute its fixture in PostgreSQL."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import uuid

ROOT = Path(__file__).resolve().parents[1]
LOCK_PATH = ROOT / "contracts/reader-contract.lock.json"
ARTIFACT_ROOT = ROOT / "contracts/reader/v1"
PRODUCER_COMMIT = "b405bfdf473614beea49dd5126a843a916168f7d"
PRODUCER_TAG = "reader-contract-v1.0.0"
REQUIRED_SCHEMA = {
    ("catalog_field", "catalog_field_id", "text", ""),
    ("catalog_field", "catalog_label", "text", ""),
    ("catalog_field", "planned_state", "text", ""),
    ("catalog_field", "contract", "jsonb", ""),
    ("ingest_run", "ingest_id", "uuid", ""),
    ("ingest_run", "status", "text", ""),
    ("observation", "geo_id", "text", ""),
    ("observation", "geo_type", "text", ""),
    ("observation", "period", "text", ""),
    ("observation", "field_id", "text", ""),
    ("observation", "catalog_field_id", "text", ""),
    ("observation", "value", "double precision", ""),
    ("observation", "unit", "text", ""),
    ("observation", "source", "text", ""),
    ("observation", "source_release", "text", ""),
    ("observation", "source_url", "text", ""),
    ("observation", "methodology_note", "text", ""),
    ("observation", "retrieved_at", "timestamp with time zone", ""),
    ("observation", "ingest_id", "uuid", ""),
}


def incompatible_schema(observed: set[tuple[str, str, str, str]]) -> list[str]:
    return [] if REQUIRED_SCHEMA <= observed else ["required reader schema column or type is missing"]


def check_artifacts(root: Path = ROOT) -> list[str]:
    lock_path = root / "contracts/reader-contract.lock.json"
    artifact_root = root / "contracts/reader/v1"
    lock = json.loads(lock_path.read_text())
    contract = json.loads((artifact_root / "contract.json").read_text())
    failures = []
    expected_binding = {
        "producerRepository": "usa-atlas-data-collection",
        "sourceCommit": PRODUCER_COMMIT,
        "producerTag": PRODUCER_TAG,
        "contractVersion": "1.0.0",
        "artifactPath": "database/reader/v1",
        "localArtifactPath": "contracts/reader/v1",
        "prodArtifactPath": "database/reader/v1",
    }
    for key, value in expected_binding.items():
        if lock.get(key) != value:
            failures.append(f"reader lock {key} is not pinned to the published producer tag")
    if contract.get("contract_id") != "usa_atlas.application_reader":
        failures.append("producer contract id is incorrect")
    if contract.get("version") != lock.get("contractVersion"):
        failures.append("contract version differs from reader-contract.lock.json")
    if contract.get("schema_fingerprint") != lock.get("schemaFingerprint"):
        failures.append("schema fingerprint differs from reader-contract.lock.json")
    if contract.get("artifact_sha256") != {
        "schema.sql": lock.get("bootstrapSha256"),
        "fixtures/reader-fixture.sql": lock.get("fixtureSha256"),
        "fixtures/reader-query.sql": lock.get("artifacts", {}).get("fixtures/reader-query.sql"),
    }:
        failures.append("producer contract artifact hashes do not match the reader lock")
    for relative, expected in lock.get("artifacts", {}).items():
        path = (artifact_root / relative).resolve()
        if not path.is_relative_to(artifact_root.resolve()):
            failures.append(f"invalid artifact path: {relative}")
            continue
        try:
            actual = hashlib.sha256(path.read_bytes()).hexdigest()
        except OSError:
            failures.append(f"missing artifact: {relative}")
            continue
        if actual != expected:
            failures.append(f"artifact hash mismatch: {relative}")
    contract_sha = hashlib.sha256((artifact_root / "contract.json").read_bytes()).hexdigest()
    if contract_sha != lock.get("contractSha256"):
        failures.append("contract hash differs from reader lock")
    if lock.get("readOnly") is not True or lock.get("admissionFilter") != "usa_atlas.ingest_run.status = 'pass'":
        failures.append("reader lock does not preserve read-only passed-ingest admission")
    if lock.get("coverageClaim") != "none; contract does not assert completeness":
        failures.append("reader lock must not assert observation completeness")
    return failures


def psql(psql_bin: str, database: str, *args: str, input_text: str | None = None):
    return subprocess.run([psql_bin, "-X", "-w", "-qAt", "--dbname", database,
                           "--set", "ON_ERROR_STOP=1", *args], input=input_text,
                          capture_output=True, text=True, timeout=30)


def run_postgres_fixture() -> list[str]:
    """Create a unique disposable DB, load the exact producer SQL and query through app adapter."""
    failures = []
    psql_bin, createdb, dropdb = (shutil.which(name) for name in ("psql", "createdb", "dropdb"))
    if not all((psql_bin, createdb, dropdb)):
        return ["required PostgreSQL client tools (psql, createdb, dropdb) are unavailable"]
    database = "atlas_reader_" + uuid.uuid4().hex[:16]
    made = False
    env = {**os.environ, "PGCONNECT_TIMEOUT": "5", "PGAPPNAME": "usa_atlas_contract_check"}
    try:
        created = subprocess.run([createdb, "--template=template0", database], env=env,
                                 capture_output=True, text=True, timeout=30)
        if created.returncode:
            return ["could not create a disposable PostgreSQL database; the required PostgreSQL service or temporary database privilege is unavailable"]
        made = True
        for relative in ("schema.sql", "fixtures/reader-fixture.sql"):
            loaded = psql(psql_bin, database, "--file", str(ARTIFACT_ROOT / relative))
            if loaded.returncode:
                failures.append(f"producer bootstrap/fixture failed: {relative}")
                return failures
        query = psql(psql_bin, database, "--file", str(ARTIFACT_ROOT / "fixtures/reader-query.sql"))
        if query.returncode:
            failures.append("producer reader query failed against its tagged fixture")
        else:
            rows = [line.split("|") for line in query.stdout.splitlines() if line]
            if len(rows) != 2 or {row[0] for row in rows if len(row) == 12} != {"06", "06037"}:
                failures.append("producer query did not return only the two admitted fixture rows")
            elif not any(row[0] == "06" and row[4] == "0" for row in rows):
                failures.append("producer query did not preserve the fixture's real zero value")
            elif not any(row[0] == "06037" and row[1] == "county" and row[5] == "USD" for row in rows):
                failures.append("producer query did not preserve county FIPS geography and native unit")

        # Exercise the application's real read-only SQL wrapper and snapshot selection
        # against the same disposable producer schema, including zero and missing data.
        adapter_sql = """
          WITH chosen AS (
            SELECT o.period,o.source_release FROM usa_atlas.observation o
            JOIN usa_atlas.ingest_run i USING (ingest_id)
            WHERE o.catalog_field_id = :'catalog_id' AND o.field_id = :'field_id'
              AND o.geo_type IN ('state','county') AND i.status='pass'
            ORDER BY o.period DESC,o.source_release DESC LIMIT 1
          )
          SELECT COALESCE(json_agg(t ORDER BY geo_type,geo_id),'[]'::json)
          FROM (SELECT o.geo_id,o.geo_type,o.period,o.value,o.unit,o.source,o.source_release
                FROM usa_atlas.observation o JOIN chosen c USING(period,source_release)
                JOIN usa_atlas.ingest_run i USING(ingest_id)
                WHERE o.catalog_field_id=:'catalog_id' AND o.field_id=:'field_id'
                  AND o.geo_type IN ('state','county','nation') AND i.status='pass') t
        """
        adapter_probe = (
            "import json, atlas_data; "
            f"print(json.dumps(atlas_data.query({adapter_sql!r}, "
            "{'catalog_id': '01.01', 'field_id': '01.01'}, "
            f"database={database!r})))"
        )
        adapted = subprocess.run([sys.executable, "-c", adapter_probe], cwd=ROOT,
                                 env={**env, "PGDATABASE": "postgres",
                                      "PYTHONPATH": str(ROOT / "scripts") + os.pathsep + env.get("PYTHONPATH", "")}, capture_output=True,
                                 text=True, timeout=30)
        if adapted.returncode:
            failures.append("application adapter snapshot query failed against producer schema")
        else:
            try:
                rows = json.loads(adapted.stdout.strip())
                by_geo = {row["geo_id"]: row for row in rows}
                if set(by_geo) != {"06", "06037"}:
                    failures.append("application adapter did not exclude unadmitted/missing fixture rows")
                if by_geo.get("06", {}).get("value") != 0:
                    failures.append("application adapter did not preserve numeric zero as an observation")
                if by_geo.get("06037", {}).get("unit") != "USD":
                    failures.append("application adapter did not preserve the producer native unit")
                if by_geo.get("06037", {}).get("geo_type") != "county":
                    failures.append("application adapter did not preserve county FIPS identity")
                if "06075" in by_geo:
                    failures.append("application adapter fabricated an absent county observation")
            except (KeyError, json.JSONDecodeError):
                failures.append("application adapter returned malformed fixture observations")

        # Check the actual database columns/types used by the producer contract.
        schema = psql(psql_bin, database, "--command", """
          SELECT table_name || E'\\t' || column_name || E'\\t' || data_type || E'\\t' ||
                 COALESCE(character_maximum_length::text,'')
          FROM information_schema.columns WHERE table_schema='usa_atlas'
          ORDER BY table_name,column_name
        """)
        if schema.returncode:
            failures.append("could not inspect actual temporary database schema")
        else:
            observed = {tuple(line.split("\t")) for line in schema.stdout.splitlines()}
            failures.extend("actual temporary database schema lacks required contract columns or types"
                            for _ in incompatible_schema(observed))
    except (OSError, subprocess.TimeoutExpired):
        failures.append("required PostgreSQL fixture execution failed")
    finally:
        if made:
            dropped = subprocess.run([dropdb, "--if-exists", database], env=env,
                                     capture_output=True, text=True, timeout=30)
            if dropped.returncode:
                failures.append("could not remove disposable PostgreSQL database")
    return failures


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--require-postgres", action="store_true",
                        help="create a disposable database and run producer and adapter fixture queries")
    parser.add_argument("--producer-repo", type=Path,
                        help="optional producer checkout used to verify the pinned tag resolves to the pinned commit")
    args = parser.parse_args()
    failures = check_artifacts()
    if args.producer_repo:
        result = subprocess.run(["git", "-C", str(args.producer_repo), "rev-parse", f"{PRODUCER_TAG}^{{commit}}"],
                                capture_output=True, text=True, timeout=15)
        if result.returncode or result.stdout.strip() != PRODUCER_COMMIT:
            failures.append("producer tag does not resolve to the pinned merged commit")
    if args.require_postgres:
        failures.extend(run_postgres_fixture())
    if failures:
        print("Reader contract check failed:", file=sys.stderr)
        for failure in failures:
            print(f"- {failure}", file=sys.stderr)
        return 1
    print("Reader contract bundle and requested runtime checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
