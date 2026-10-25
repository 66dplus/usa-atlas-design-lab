# Production Umami collection

This is a separate collection service for the existing browser integration. It
does not rebuild, replace, or configure the Atlas application container. The
public Nginx configuration returns the tracker settings, so the packaged Atlas
server remains disabled by default and replacing an Atlas container does not
reset collection.
Run repository commands below from the application worktree root.

The change must be committed and reviewed on a separate branch first. Do not
advance `main` while application A/B or rollback release tests are in progress.
The analytics stack is independent of the unified application release workflow;
this setup does not deploy the application.

## Private files and first start

Keep the private credentials in a dedicated file outside the repository, for
example `/etc/usa-xray/production-analytics.env`, owned by the service operator
with mode `0600` in a directory with mode `0700`. The file holds only the four
Umami secrets and the two website IDs plus the private setup origin. Do not use
the full server environment as the Compose env file.

```sh
sudo install -d -m 0700 /etc/usa-xray
sudo python3 scripts/setup_production_analytics.py \
  --secrets-file /etc/usa-xray/production-analytics.env --init-secrets
sudo docker compose \
  --project-name usa-xray-analytics \
  --env-file /etc/usa-xray/production-analytics.env \
  -f deploy/analytics/compose.production.yaml up -d
```

The initializer creates independent random values and preserves an existing
file. It does not print them. Compose passes only the database password,
application secret, and two-factor key to the required services. The generated
admin password is not passed to either runtime container. On a new database,
setup uses Umami's initial `admin` / `umami` login only to replace that default
with the generated password before any public collector route is enabled.

Wait for both Compose health checks and confirm the private heartbeat from the
host before setup:

```sh
sudo docker compose \
  --project-name usa-xray-analytics \
  --env-file /etc/usa-xray/production-analytics.env \
  -f deploy/analytics/compose.production.yaml ps
curl -fsS http://127.0.0.1:4300/api/heartbeat
```

Create or verify the two separate Umami websites and render the candidate
Nginx snippet. The generated public config file contains only website IDs and
public URLs; both output files contain no credentials.

```sh
sudo python3 scripts/setup_production_analytics.py \
  --secrets-file /etc/usa-xray/production-analytics.env \
  --nginx-output /tmp/usa-xray-analytics.conf \
  --public-config-output /tmp/usa-xray-analytics-public.json
```

The websites are exactly `USA X-Ray Production` and `USA X-Ray Production QA`,
both with domain `usa-xray.online`. Reruns reuse and validate those exact
records. A saved website ID paired with a rejected admin password causes setup
to fail closed; it will not retry the default password or overwrite the private
file. Website IDs are public tracker identifiers, but the private dashboard
credentials and database password remain private.

## Nginx configuration

Add this include inside the existing public TLS `server` block:

```nginx
include /etc/nginx/snippets/usa-xray-analytics.conf;
```

The generated snippet exposes exactly `/api/analytics/config`,
`/analytics/script.js`, and `/analytics/api/send`. The config response is
uncached JSON with `nosniff`. The tracker has a five-minute cache; tracker and
collector routes are marked `noindex`. Request bodies and upstream timeouts are
bounded. No dashboard, login, general Umami API, or broad `/api/` or
`/analytics/` proxy is exposed. The collector access log is disabled.

The config response uses the root-relative script URL `/analytics/script.js`.
Both `usa-xray.online` and `www.usa-xray.online` therefore load the tracker from
the page's current host, keeping the script and collector same-origin. Umami
3.4.1 derives its send URL from the directory of the loaded script and appends
`/api/send`, so it posts to `/analytics/api/send` on that same host. That exact
Nginx location forwards to the private Umami `/api/send`; it must remain paired
with the script path. Same-origin POSTs do not require an OPTIONS preflight.
Nginx overwrites both `X-Real-IP` and `X-Forwarded-For` with `$remote_addr`.
The Umami service reads `x-real-ip`, so a client-supplied forwarding header is
not trusted.

Review and compare the candidate before touching the live include. Record the
candidate hash and inspect the diff against the current snippet; do not replace
the live file if the candidate hash or current file differs from the reviewed
values. Perform the include change, syntax check, and reload while holding the
same deployment lock used by the application release workflow. If the lock is
busy, leave Nginx untouched and retry after the A/B or rollback operation ends.

```sh
candidate=/tmp/usa-xray-analytics.conf
live=/etc/nginx/snippets/usa-xray-analytics.conf
sha256sum "$candidate"
if [ -e "$live" ]; then sha256sum "$live"; else echo MISSING; fi
if [ -e "$live" ]; then diff -u "$live" "$candidate"; fi
server_config=/path/to/the/existing-tls-server.conf
sudo sha256sum "$server_config"
```

After recording the reviewed candidate SHA-256 and the current live-file hash
(or `MISSING`), hold the deployment lock in a root shell. Make the include-line
edit in the existing TLS server block in this same locked operation. Save that
server configuration before editing and record its hash too, so it can be
restored if the syntax check fails:

```sh
sudo flock -n /opt/usa-atlas-releases/deployment.lock /bin/bash
```

In that shell, verify the candidate hash against the recorded value, install it
atomically, verify the installed bytes, make and save the include-line edit,
then test and reload Nginx. If a live snippet exists, save its reviewed copy
before replacing it:

```sh
expected='REPLACE_WITH_REVIEWED_CANDIDATE_SHA256'
expected_live='REPLACE_WITH_REVIEWED_LIVE_SHA256_OR_MISSING'
server_config='/path/to/the/existing-tls-server.conf'
server_backup=/tmp/usa-xray-tls-server.conf.rollback
expected_server='REPLACE_WITH_REVIEWED_TLS_SERVER_SHA256'
candidate=/tmp/usa-xray-analytics.conf
live=/etc/nginx/snippets/usa-xray-analytics.conf
set -euo pipefail
test "$(sha256sum "$candidate" | awk '{print $1}')" = "$expected"
actual_live=$(if [ -e "$live" ]; then sha256sum "$live" | awk '{print $1}'; else printf MISSING; fi)
test "$actual_live" = "$expected_live"
test "$(sha256sum "$server_config" | awk '{print $1}')" = "$expected_server"
cp -p "$server_config" "$server_backup"
if [ -e "$live" ]; then cp -p "$live" "$live.rollback"; fi
install -o root -g root -m 0644 "$candidate" "$live.new"
cmp -s "$candidate" "$live.new"
mv "$live.new" "$live"
# Add the include line shown above to the existing TLS server block here.
if ! nginx -t; then
  cp -p "$server_backup" "$server_config"
  if [ "$expected_live" = MISSING ]; then rm -f "$live"; else cp -p "$live.rollback" "$live"; fi
  # Do not reload unless the restored configuration validates.
  nginx -t
  exit 1
fi
systemctl reload nginx
```

The shell must exit after this operation so the lock is released. If Nginx
validation fails, restore the previous reviewed snippet while still holding the
lock, validate again, and do not reload an invalid configuration. Confirm the
public config returns only the enabled flag, production Website ID, and the
relative tracker URL `/analytics/script.js`, and confirm the script route has
the short cache and `X-Robots-Tag`
headers. Do not send a production test event merely to verify routing.

## Dashboard, readback, and storage

Keep the dashboard private. From an authorized workstation, forward the
loopback-only service over SSH and open the local end of the tunnel:

```sh
ssh -N -L 14300:127.0.0.1:4300 operator@production-host
```

Open `http://127.0.0.1:14300` and use the admin password from the dedicated
private credentials file. Do not add the dashboard or admin API to public
Nginx.

Production and QA readbacks use separate website IDs; write reports under
`/tmp` so telemetry output stays out of Git:

```sh
sudo sh -c 'umask 077; python3 scripts/analytics_report.py \
  --secrets-file /etc/usa-xray/production-analytics.env \
  --days 7 --output /tmp/usa-xray-production-analytics.json'
sudo sh -c 'umask 077; python3 scripts/analytics_report.py \
  --secrets-file /etc/usa-xray/production-analytics.env \
  --test --days 7 --output /tmp/usa-xray-qa-analytics.json'
```

The Compose project owns a dedicated bridge used only by Umami and its database,
plus the persistent named volume `usa-xray-analytics_analytics-db`. This is a
normal bridge so Docker can publish Umami on the host loopback; PostgreSQL has
no published host port, and the stack joins no Atlas networks. `restart`,
`stop`, and `down` preserve the volume. Never use `down -v`; it deletes the
collection. Back up and restore the volume using the operator's PostgreSQL
backup procedure before any storage migration or host replacement.

There is no previous Umami traffic to backfill. Public `/stats` integration is
outside this work: the analytics service and private dashboard collect data,
while public site statistics remain disconnected until a separate feature is
implemented.

## Rollback

Under the same deployment lock, remove the snippet include from the TLS server
block (or restore its prior reviewed version), run `nginx -t`, and reload Nginx.
This returns `/api/analytics/config` to the packaged server's disabled default
and stops new public collection. Then stop only this Compose project:

```sh
sudo docker compose \
  --project-name usa-xray-analytics \
  --env-file /etc/usa-xray/production-analytics.env \
  -f deploy/analytics/compose.production.yaml stop
```

The database volume and private credential file remain in place for a later
restart. Do not run `down -v` or touch the Atlas data service, its volumes, or
networks.
