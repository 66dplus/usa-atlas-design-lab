# Temporary mobile preview

This deployment serves `/ux/` with live, read-only PostgreSQL observations over
an isolated Cloudflare Quick Tunnel. It creates its own Docker network and
containers, with no host port binding. The app joins the existing
`usa-atlas-private` network to reach `usa-atlas-postgres` as
`usa_atlas_reader`. The browser never receives database credentials.

From the repository root, on a host with the production database network:

```sh
export ATLAS_READER_PASSWORD_FILE=/opt/usa-atlas-production/secrets/usa_atlas_reader_password
export ATLAS_PREVIEW_UID="$(stat -c %u "$ATLAS_READER_PASSWORD_FILE")"
export ATLAS_PREVIEW_GID="$(stat -c %g "$ATLAS_READER_PASSWORD_FILE")"
docker compose -f deploy/mobile-preview/compose.yaml -p usa-atlas-mobile-preview up -d --build
docker compose -f deploy/mobile-preview/compose.yaml -p usa-atlas-mobile-preview logs tunnel
```

The tunnel log prints a `https://…trycloudflare.com` URL. Open its `/ux/` path;
add `?place=06` to start with California selected. A Quick Tunnel URL may change
if the tunnel container restarts. Both services have Docker restart policies.
The site is read-only: feedback and saved view settings are unavailable.

The prototype map displays state and county measurements. The bounded catalog
query used for this preview selects representative published series and samples
geography coverage so a large observation table does not block page load. It
caches the catalog for five minutes, serving the last successful catalog if a
refresh times out. It does not list every stored ACS variable or display tract
and block-group measurements. The underlying observation endpoint still reads
the selected series from the live database.

`docker compose -f deploy/mobile-preview/compose.yaml -p usa-atlas-mobile-preview down`
stops only this Compose project. Existing unrelated tunnels are outside it.
