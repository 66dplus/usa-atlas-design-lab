#!/bin/sh
set -eu
export PGHOST=usa-atlas-postgres
export PGPORT=5432
export PGUSER=usa_atlas_reader
export PGPASSWORD="$(cat /run/secrets/usa_atlas_reader_password)"
export PYTHONDONTWRITEBYTECODE=1
exec python3 /app/preview_server.py
