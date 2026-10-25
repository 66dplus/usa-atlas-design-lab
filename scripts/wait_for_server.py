#!/usr/bin/env python3
"""Wait for a required local app URL, failing after one minute."""

import argparse
import time
from urllib.error import URLError
from urllib.request import urlopen


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("url")
args = parser.parse_args()
deadline = time.monotonic() + 60
last_error = None
while time.monotonic() < deadline:
    try:
        with urlopen(args.url, timeout=2) as response:
            if response.status == 200:
                print(f"Server ready: {args.url}")
                raise SystemExit(0)
    except (OSError, URLError) as error:
        last_error = error
    time.sleep(.5)
raise SystemExit(f"Required app server did not start at {args.url}: {last_error}")
