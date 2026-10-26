import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from scripts import release_workflow


ROOT = Path(__file__).resolve().parents[1]


class StageReaderSchemaProbePostgresTests(unittest.TestCase):
    def test_generated_stage_probe_executes_against_frozen_v2_schema(self):
        initdb, pg_ctl, psql_bin = (shutil.which(name) for name in ('initdb', 'pg_ctl', 'psql'))
        if not all((initdb, pg_ctl, psql_bin)):
            self.fail('PostgreSQL initdb, pg_ctl, and psql are required for the stage schema proof regression')

        with tempfile.TemporaryDirectory(prefix='usa-atlas-stage-schema-') as temp:
            root = Path(temp)
            data, sock = root / 'data', root / 'socket'
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
            self.assertEqual(start.returncode, 0, start.stderr or start.stdout)
            env = {**os.environ, 'PGHOST': str(sock), 'PGPORT': str(port), 'PGUSER': user or '', 'PGDATABASE': 'postgres'}

            def psql(sql, database='postgres'):
                result = subprocess.run([psql_bin, '-X', '-w', '-q', '-v', 'ON_ERROR_STOP=1', '-A', '-t', '-F', '\t',
                                         '-d', database], input=sql, text=True, capture_output=True, env=env, timeout=30)
                if result.returncode:
                    raise AssertionError(result.stderr or result.stdout)
                return result

            try:
                psql('CREATE DATABASE usa_atlas;')
                psql((ROOT / 'contracts/reader/v1/schema.sql').read_text() + '\n' +
                     (ROOT / 'contracts/reader/v2/schema.sql').read_text(), database='usa_atlas')

                lock_path = ROOT / 'contracts/reader-v2-contract.lock.json'
                contract_path = ROOT / 'contracts/reader/v2/contract.json'
                backend = release_workflow.DockerBackend({})
                build = json.dumps({'release': 'stage-schema-proof-test'}) + '\n'

                def stage_run(command, *, input_text=None, **kwargs):
                    if input_text is not None:
                        self.assertIn(release_workflow.reader_schema_probe_sql('2.0.0'), input_text)
                        return psql(input_text, database='usa_atlas')
                    if command[-1:] == ['/app/ux/build.json']:
                        return subprocess.CompletedProcess(command, 0, build, '')
                    raise AssertionError(f'unexpected stage proof command: {command}')

                identity = {'Id': 'temporary-stage', 'Image': 'sha256:test', 'State': {'Status': 'running'}}
                with patch('scripts.release_workflow.run', side_effect=stage_run), patch.object(backend, 'inspect', return_value=identity):
                    proof = backend.reader_schema_proof('temporary-stage', lock_path, contract_path)
                self.assertTrue(proof['queryReadOnly'])

                # The one producer DDL-only field is accepted only with its pinned type.
                psql('ALTER TABLE usa_atlas.election_contest ALTER COLUMN source_mode_raw TYPE integer USING NULL;', database='usa_atlas')
                with patch('scripts.release_workflow.run', side_effect=stage_run), patch.object(backend, 'inspect', return_value=identity):
                    with self.assertRaisesRegex(release_workflow.ReleaseError, 'election_contest.source_mode_raw'):
                        backend.reader_schema_proof('temporary-stage', lock_path, contract_path)

                psql('ALTER TABLE usa_atlas.election_contest ALTER COLUMN source_mode_raw TYPE text;', database='usa_atlas')
                psql('ALTER TABLE usa_atlas.election_contest ADD COLUMN unexpected_extra text;', database='usa_atlas')
                with patch('scripts.release_workflow.run', side_effect=stage_run), patch.object(backend, 'inspect', return_value=identity):
                    with self.assertRaisesRegex(release_workflow.ReleaseError, 'election_contest columns'):
                        backend.reader_schema_proof('temporary-stage', lock_path, contract_path)
            finally:
                subprocess.run([pg_ctl, '-D', str(data), '-m', 'immediate', '-w', 'stop'],
                               text=True, capture_output=True, timeout=30)


if __name__ == '__main__':
    unittest.main()
