# Read-only WebGL + medical38 preview

The owner authorized updating the existing temporary preview on 15 October 2026.
The release combines the WebGL comparison implementation, the selected default
behavior from `d3b5668`, and the three medical38 visibility/attribution files.

Build an explicit fresh context from this integration worktree:

```sh
npm ci --ignore-scripts --omit=dev
python3 scripts/build_temporary_preview.py /tmp/atlas-webgl-UNIQUE --release 20261015-webgl-medical38
```

Build Docker only from that named context. It contains 114 public manifest routes
and six private adapter inputs. It includes the named Three.js/D3 dependencies:
preserve those already-allowlisted `node_modules` files when transporting the
build context. Do not apply a checkout-level dependency exclusion to this package.
Validate every manifest target after transport and before the Docker build.

The container uses UID/GID 10001, an immutable root filesystem, dropped
capabilities, no privilege escalation, 384 MiB RAM, one CPU and 64 PIDs. The reader
password is mounted read-only from the existing owned preview secret. The
PostgreSQL reader and read-only HTTP backend are byte-identical to medical38.
Only the explicit asset manifest and existing read APIs are public.

`/ux/build.json` records the release, base Git commit, default renderer, 38 display
flags and hashes of the application/renderer/visibility files. It identifies this
integration, whose medical changes are separate working-tree changes on that base.
The private catalog and server files are not exposed as static assets.

The tested image is `usa-atlas-paper-runtime:20261015-webgl-medical38`, digest
`sha256:ef8fea2f988f49db27d409a3a5d0f76efe4e4b8ce5d204c28036405f446b4454`.
It replaced the owned app container at private IP `172.19.0.4:4429`, preserving
the Cloudflare process and public URL. The prior container is retained as
`usa-atlas-paper-runtime-20261009-before-webgl-20261015`.

The separate staging container and SSH forwarding listener were removed after
the public checks. All agent browser contexts were closed. The existing public
preview expires on 16 October 2026 at 13:20 UTC.
