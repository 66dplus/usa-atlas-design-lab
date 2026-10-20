"""Small Umami v3 HTTP adapter, shared by local setup and readback."""
import json
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


def read_env(path):
    return dict(line.split('=', 1) for line in Path(path).read_text().splitlines() if line and not line.startswith('#'))


class UmamiAPI:
    def __init__(self, origin, token=None):
        self.origin = origin.rstrip('/')
        self.token = token

    def request(self, path, body=None, params=None):
        if params:
            path += '?' + urlencode(params)
        headers = {'Content-Type': 'application/json'}
        if self.token:
            headers['Authorization'] = 'Bearer ' + self.token
        request = Request(self.origin + path, data=json.dumps(body).encode() if body is not None else None, headers=headers)
        try:
            with urlopen(request, timeout=20) as response:
                return json.load(response)
        except HTTPError as error:
            raise RuntimeError(f'Umami returned HTTP {error.code} for {path.split("?")[0]}') from None

    def login(self, password):
        result = self.request('/api/auth/login', {'username': 'admin', 'password': password})
        self.token = result['token']
        return result['user']

    def event_rows(self, website_id, event, start, end):
        page, seen = 1, set()
        while True:
            result = self.request(f'/api/websites/{website_id}/event-data-pivot', params={
                'startAt': start, 'endAt': end, 'eventName': event, 'page': page, 'pageSize': 100, 'timezone': 'UTC'})
            rows = result['data']
            for row in rows:
                if row['eventId'] not in seen:
                    seen.add(row['eventId'])
                    yield dict(zip(row['propertyKeys'], row['propertyValues']))
            if len(rows) < 100 or page * 100 >= result['count']:
                return
            page += 1
