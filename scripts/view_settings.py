"""One bounded settings record; the shipped JSON also supplies frontend defaults."""
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import tempfile

DEFAULTS = json.loads((Path(__file__).resolve().parents[1] / 'ux/view-settings.json').read_text())
RANGES = {'tilt': (5, 55), 'sensitivity': (.05, 1), 'minZoom': (.5, 1),
          'maxZoom': (1.1, 30), 'duration': (200, 2000), 'hover': (0, 6), 'relief': (0, 2)}


def validate_settings(data):
    if not isinstance(data, dict) or set(data) != {'version', 'settings'} or type(data['version']) is not int or data['version'] != 1:
        raise ValueError('Unknown settings version or fields')
    settings = data['settings']
    if not isinstance(settings, dict) or set(settings) != set(DEFAULTS['settings']):
        raise ValueError('Invalid settings fields')
    if type(settings['rotation']) is not bool or settings['cameraSide'] not in ('north', 'south'):
        raise ValueError('Invalid camera controls')
    for key, (low, high) in RANGES.items():
        value = settings[key]
        if type(value) not in (int, float) or not math.isfinite(value) or not low <= value <= high:
            raise ValueError('Out of range: ' + key)
    if settings['minZoom'] >= settings['maxZoom']:
        raise ValueError('Minimum zoom must be below maximum zoom')
    return data


def read_settings(folder):
    path = folder / 'view-settings.json'
    if not path.exists():
        return {**DEFAULTS, 'savedAt': None}
    record = json.loads(path.read_text())
    validate_settings({key: record[key] for key in ('version', 'settings')})
    return record


def save_settings(folder, data):
    validate_settings(data)
    record = {**data, 'savedAt': datetime.now(timezone.utc).isoformat()}
    descriptor, temporary = tempfile.mkstemp(prefix='.settings-', dir=folder)
    try:
        with os.fdopen(descriptor, 'w') as handle:
            json.dump(record, handle, ensure_ascii=False, indent=2)
            handle.write('\n')
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, folder / 'view-settings.json')
        descriptor = os.open(folder, os.O_RDONLY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)  # Only this request's unpublished settings draft.
    return record
