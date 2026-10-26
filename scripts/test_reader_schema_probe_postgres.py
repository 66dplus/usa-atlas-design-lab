import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from scripts import check_reader_v2_contract, release_workflow


ROOT = Path(__file__).resolve().parents[1]


class StageReaderSchemaProbePostgresTests(unittest.TestCase):
    def test_generated_stage_probe_accepts_the_frozen_retained_observation_view(self):
        initdb, pg_ctl, psql_bin = (shutil.which(name) for name in ('initdb', 'pg_ctl', 'psql'))
        if not all((initdb, pg_ctl, psql_bin)):
            self.fail('PostgreSQL initdb, pg_ctl, and psql are required for the stage schema proof regression')

        with tempfile.TemporaryDirectory(prefix='pg-') as temp:
            root = Path(temp).resolve()
            self.assertTrue(root.is_relative_to(Path(tempfile.gettempdir()).resolve()))
            data, sock = root / 'd', root / 's'
            sock.mkdir()
            with socket.socket() as listener:
                listener.bind(('127.0.0.1', 0))
                port = listener.getsockname()[1]
            user = os.environ.get('USER') or os.environ.get('LOGNAME')
            init = subprocess.run([initdb, '-D', str(data), '--no-locale', '--encoding=UTF8', '-A', 'trust'],
                                  text=True, capture_output=True, timeout=30)
            self.assertEqual(init.returncode, 0, init.stderr or init.stdout)
            start = subprocess.run([pg_ctl, '-D', str(data), '-l', str(root / 'postgres.log'), '-o',
                                    f'-h 127.0.0.1 -k {sock} -p {port}', '-w', 'start'],
                                   text=True, capture_output=True, timeout=30)
            start_log = root / 'postgres.log'
            detail = start.stderr or start.stdout or (start_log.read_text() if start_log.exists() else '')
            self.assertEqual(start.returncode, 0, detail)
            env = {**os.environ, 'PGHOST': str(sock), 'PGPORT': str(port), 'PGUSER': user or '', 'PGDATABASE': 'postgres'}

            def psql(sql, database='postgres', run_env=None):
                result = subprocess.run([psql_bin, '-X', '-w', '-q', '-v', 'ON_ERROR_STOP=1', '-A', '-t', '-F', '\t',
                                         '-d', database], input=sql, text=True, capture_output=True,
                                        env=run_env or env, timeout=30)
                if result.returncode:
                    raise AssertionError(result.stderr or result.stdout)
                return result

            v2_lock = ROOT / 'contracts/reader-v2-contract.lock.json'
            v2_contract = ROOT / 'contracts/reader/v2/contract.json'
            contract = json.loads(v2_contract.read_text())
            view_columns = list(contract['objects']['observation'])
            def observation_view(*, cast_value=False, extra=False, omit=()):
                selected = []
                for column in view_columns:
                    if column in omit:
                        continue
                    expression = f'"{column}"'
                    if cast_value and column == 'value':
                        expression += '::text'
                    selected.append(f'{expression} AS "{column}"')
                if extra:
                    selected.append("'extra'::text AS unexpected_extra")
                psql('DROP VIEW IF EXISTS usa_atlas.observation; CREATE VIEW usa_atlas.observation AS SELECT ' +
                     ', '.join(selected) + ' FROM usa_atlas.observation_storage;', database='usa_atlas')

            backend = release_workflow.DockerBackend({})
            build = json.dumps({'release': 'stage-schema-proof-test'}) + '\n'
            reader_env = {**env, 'PGUSER': 'atlas_reader', 'PGDATABASE': 'usa_atlas',
                          'PGOPTIONS': '-c default_transaction_read_only=on'}

            def stage_run(command, *, input_text=None, **kwargs):
                if input_text is not None:
                    self.assertEqual(input_text, release_workflow.reader_schema_probe_sql('2.0.0'))
                    return psql(input_text, database='usa_atlas', run_env=reader_env)
                if command[-1:] == ['/app/ux/build.json']:
                    return subprocess.CompletedProcess(command, 0, build, '')
                raise AssertionError(f'unexpected stage proof command: {command}')

            identity = {'Id': 'temporary-stage', 'Image': 'sha256:test', 'State': {'Status': 'running'}}

            def stage_proof():
                with patch('scripts.release_workflow.run', side_effect=stage_run), \
                        patch.object(backend, 'inspect', return_value=identity):
                    return backend.reader_schema_proof('temporary-stage', v2_lock, v2_contract)

            def assert_both_fail(message):
                with self.assertRaisesRegex(release_workflow.ReleaseError, message):
                    stage_proof()
                with patch.dict(os.environ, {**env, 'PGDATABASE': 'usa_atlas'}):
                    with self.assertRaisesRegex(ValueError, 'missing the exact v2 schema objects'):
                        check_reader_v2_contract.check_postgres(contract)

            try:
                psql('CREATE DATABASE usa_atlas;')
                # Build from the frozen v1 and v2 DDL, then represent only the
                # retained observation relation as production's exact-column view.
                psql((ROOT / 'contracts/reader/v1/schema.sql').read_text() + '\n' +
                     (ROOT / 'contracts/reader/v2/schema.sql').read_text(), database='usa_atlas')
                psql('ALTER TABLE usa_atlas.observation RENAME TO observation_storage;', database='usa_atlas')
                observation_view()
                psql("CREATE ROLE atlas_reader LOGIN; GRANT USAGE ON SCHEMA usa_atlas TO atlas_reader; "
                     "GRANT SELECT ON ALL TABLES IN SCHEMA usa_atlas TO atlas_reader; "
                     "ALTER ROLE atlas_reader SET default_transaction_read_only=on;", database='usa_atlas')
                self.assertEqual(psql('SELECT current_setting(\'transaction_read_only\');', 'usa_atlas', reader_env).stdout.strip(), 'on')
                self.assertEqual(psql("SELECT has_table_privilege('atlas_reader','usa_atlas.observation','INSERT');",
                                      'usa_atlas').stdout.strip(), 'f')

                proof = stage_proof()
                self.assertTrue(proof['queryReadOnly'])
                with patch.dict(os.environ, {**env, 'PGDATABASE': 'usa_atlas'}):
                    check_reader_v2_contract.check_postgres(contract)

                # Retained view: exact type and exact column set stay mandatory.
                observation_view(cast_value=True)
                assert_both_fail('observation.value')
                observation_view(extra=True)
                assert_both_fail('observation columns')
                observation_view(omit=('unit',))
                assert_both_fail('observation columns')
                psql('DROP VIEW usa_atlas.observation;', database='usa_atlas')
                assert_both_fail('observation columns')
                observation_view()

                # Additive v2 relations remain ordinary tables with the same
                # strict type and no-unknown-column checks.
                psql('ALTER TABLE usa_atlas.reader_batch ALTER COLUMN collector_version TYPE integer USING NULL;',
                     database='usa_atlas')
                assert_both_fail('reader_batch.collector_version')
                psql('ALTER TABLE usa_atlas.reader_batch ALTER COLUMN collector_version TYPE text USING NULL;',
                     database='usa_atlas')
                psql('ALTER TABLE usa_atlas.reader_batch ADD COLUMN unexpected_extra text;', database='usa_atlas')
                assert_both_fail('reader_batch columns')
                psql('ALTER TABLE usa_atlas.reader_batch DROP COLUMN unexpected_extra;', database='usa_atlas')
                psql('ALTER TABLE usa_atlas.reader_batch DROP COLUMN contract_version;', database='usa_atlas')
                assert_both_fail('reader_batch columns')
            finally:
                subprocess.run([pg_ctl, '-D', str(data), '-m', 'immediate', '-w', 'stop'],
                               text=True, capture_output=True, timeout=30)


if __name__ == '__main__':
    unittest.main()
