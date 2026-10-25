#!/usr/bin/env python3
"""Create deterministic application-adapter rows in the isolated CI database."""

import json
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]


def sql_text(value):
    return "'" + str(value).replace("'", "''") + "'"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database-config", type=Path,
                        help="explicit disposable PostgreSQL config; required outside GitHub Actions")
    args = parser.parse_args()
    env = os.environ.copy()
    if os.environ.get("GITHUB_ACTIONS") != "true":
        if not args.database_config or not args.database_config.is_file():
            raise SystemExit("Refusing PostgreSQL writes without an explicit disposable --database-config.")
        config = json.loads(args.database_config.read_text())
        expected = config.get("environment", {})
        root = Path(config.get("root", "")).resolve()
        host = expected.get("PGHOST", "")
        if (not root.is_relative_to(Path(tempfile.gettempdir()).resolve()) or
                not Path(host).resolve().is_relative_to(root) or
                str(expected.get("PGDATABASE")) != "usa_atlas" or
                str(expected.get("PGUSER")) != "atlas"):
            raise SystemExit("Disposable database config must target a temporary socket cluster and usa_atlas/atlas only.")
        env.update({key: str(value) for key, value in expected.items()})
    elif (env.get("PGHOST") not in {"127.0.0.1", "localhost", "::1"} or
          env.get("PGUSER") != "atlas"):
        raise SystemExit("GitHub CI PostgreSQL writes must target the local atlas service only.")
    if env.get("PGDATABASE") != "usa_atlas":
        raise SystemExit("Refusing to seed a database other than usa_atlas.")
    psql = shutil.which("psql")
    if not psql:
        raise SystemExit("Required PostgreSQL client unavailable.")
    metrics = json.loads((ROOT / "ux/catalog.json").read_text())["metrics"]
    v2 = json.loads((ROOT / "ux/catalog-v2.json").read_text())
    extra_ids = {item["catalogId"] for item in v2["metrics"]}
    parent = {item["catalogId"]: item["catalogLabel"] for item in v2["parentFields"]
              if item["catalogId"] not in extra_ids}
    expected = {item["name"] for item in metrics}
    if len(parent) != 81 or {label for label in parent.values()} != expected:
        raise SystemExit("Application catalog fixture no longer matches the reviewed 81-field baseline.")

    reader_password = os.environ.get("ATLAS_CI_READER_PASSWORD")
    if not reader_password or "'" in reader_password or "\\" in reader_password:
        raise SystemExit("ATLAS_CI_READER_PASSWORD must be set to the temporary CI-only reader password.")
    statements = ["DROP SCHEMA IF EXISTS usa_atlas CASCADE;",
                  (ROOT / "contracts/reader/v1/schema.sql").read_text()]
    statements.extend(
        "INSERT INTO usa_atlas.catalog_field "
        "(catalog_field_id,catalog_label,planned_state,rate_limit_profile,source_release,contract,contract_sha256) "
        "VALUES ({},{},'run_now','ci-fixture','CI-fixture',jsonb_build_object('catalog_field_id',{},'fixture',true),{});".format(
            sql_text(catalog_id), sql_text(label), sql_text(catalog_id), sql_text("0" * 64))
        for catalog_id, label in sorted(parent.items())
    )
    statements.extend([
        "DO $$ BEGIN CREATE ROLE atlas_reader LOGIN PASSWORD {}; EXCEPTION WHEN duplicate_object THEN ALTER ROLE atlas_reader LOGIN PASSWORD {}; END $$;".format(sql_text(reader_password), sql_text(reader_password)),
        "GRANT USAGE ON SCHEMA usa_atlas TO atlas_reader;",
        "GRANT SELECT ON ALL TABLES IN SCHEMA usa_atlas TO atlas_reader;",
        "ALTER ROLE atlas_reader SET default_transaction_read_only = on;",
    ])
    samples = [
        ("06", "state", "2024-M12", "03.06:unemployment_rate", "03.06", 5.4, "%", "bls_laus", "BLS-LAUS-latest-final-annual"),
        ("06037", "county", "2024-M12", "03.06:unemployment_rate", "03.06", 5.5, "%", "bls_laus", "BLS-LAUS-latest-final-annual"),
        ("48", "state", "2024-M12", "03.06:unemployment_rate", "03.06", 4.1, "%", "bls_laus", "BLS-LAUS-latest-final-annual"),
        ("06000", "state", "2024", "02.10", "02.10", 110.72, "index_us_100", "bea_rpp", "BEA-SARPP-2024"),
        ("CA", "state", "2024", "04.01", "04.01", 1915, "incidents", "fbi_cde", "FBI-CDE-latest-complete-year"),
        ("PR", "state", "2024", "04.01", "04.01", 20, "incidents", "fbi_cde", "FBI-CDE-latest-complete-year"),
        ("06037", "county", "2024", "05.14", "05.14", 26.4, "%", "cdc_places", "CDC-PLACES-swc5-untb-current"),
        ("CA", "state", "2024", "08.05:sector_ALL", "08.05", 27.04, "cents/kWh", "eia", "EIA-electricity-retail-sales-latest-annual"),
        ("06037", "county", "2024", "09.01", "09.01", 0.879006267, "source_defined", "usda_fea", "USDA-FEA-2025"),
        ("06037", "county", "2024", "09.02:percent", "09.02", 6.531888485, "source_defined", "usda_fea", "USDA-FEA-2025"),
        ("90001", "zip", "2024", "07.01:agi", "07.01", 75000, "USD", "irs_soi", "IRS-SOI-2024"),
        ("060370001", "monitor", "2024", "09.06", "09.06", 8.1, "ug/m3", "epa_airdata", "EPA-AirData-2024"),
        ("US", "nation", "2024", "02.10", "02.10", 100, "index_us_100", "bea_rpp", "BEA-SARPP-2024"),
    ]
    statements.append(
        "INSERT INTO usa_atlas.ingest_run "
        "(ingest_id,source,artifact_path,artifact_sha256,contract_sha256,row_count,started_at,completed_at,status,error_code) "
        "VALUES ('00000000-0000-4000-8000-000000000001','application-ci','fixtures/reader-fixture.sql',{}, {},{},"
        "'2026-01-02T00:00:00Z','2026-01-02T00:00:01Z','pass',NULL);".format(
            sql_text("0" * 64), sql_text("0" * 64), len(samples)))
    for geo_id, geo_type, period, field, catalog_id, value, unit, source, release in samples:
        cells = [geo_id, geo_type, period, field, catalog_id, value, unit, source, release,
                 "https://example.test/source", "Isolated deterministic CI fixture.",
                 "2026-01-02T00:00:00Z", "00000000-0000-4000-8000-000000000001"]
        values = ",".join(str(cell) if isinstance(cell, (int, float)) else sql_text(cell) for cell in cells)
        statements.append("INSERT INTO usa_atlas.observation "
                          "(geo_id,geo_type,period,field_id,catalog_field_id,value,unit,source,source_release,"
                          "source_url,methodology_note,retrieved_at,ingest_id) VALUES (" + values + ");")

    result = subprocess.run([psql, "-X", "-w", "-q", "--dbname", "usa_atlas",
                             "--set", "ON_ERROR_STOP=1"], env=env, input="\n".join(statements),
                            text=True, capture_output=True, timeout=30)
    if result.returncode:
        print("Could not initialize isolated application CI database.", file=sys.stderr)
        raise SystemExit(1)
    print("Initialized deterministic 81-field adapter fixture in isolated CI PostgreSQL.")


if __name__ == "__main__":
    main()
