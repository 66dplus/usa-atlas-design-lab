"""Run Atlas with public tracker settings; keep Umami credentials out of its process."""
import argparse
import os
from pathlib import Path
import sys
from analytics_api import read_env

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--secrets-file', type=Path, default=Path.home() / '.config/usa-atlas/analytics.env')
parser.add_argument('--test', action='store_true', help='Use the isolated Browser QA website')
args, server_args = parser.parse_known_args()
values = read_env(args.secrets_file)
for key in ('ATLAS_ANALYTICS_ENABLED', 'ATLAS_ANALYTICS_URL'):
    os.environ[key] = values[key]
os.environ['ATLAS_ANALYTICS_WEBSITE_ID'] = values['ATLAS_ANALYTICS_TEST_WEBSITE_ID' if args.test else 'ATLAS_ANALYTICS_WEBSITE_ID']
os.execv(sys.executable, [sys.executable, str(Path(__file__).with_name('serve.py')), *server_args])
