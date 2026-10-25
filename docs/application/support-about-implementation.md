# About and Support implementation

About and Support follow the approved Paper frames: About `4W6O-0` / `4WA0-0`, Support `4X9P-0` / `4XIA-0`, and milestone dialog `4X14-0` / `4X3Y-0`. The dormant after-support layout references are `4XR6-0` / `4XZU-0`; its fixture stays out of the public package and has no payment or reporting behavior. The existing Paper masters and shared application shell remain the visual authority. The implementation adds scoped vanilla JavaScript and CSS inside the existing reading-page surface.

Bug reports use the write-only `POST /api/bug-reports` endpoint. The request is validated, URL state is minimized to a public route and recognized query keys, and a successful response is sent only after a private atomic write. Reports are never listed or served. Until the runtime has a durable writable reports directory outside the public tree, submissions return `503` and keep the form available for retry.

For a packaged runtime, configure `--reports-dir` to that private volume. If the app is behind a reverse proxy, pass `--trusted-proxy IP_OR_CIDR` only for proxy networks that provide a validated `X-Forwarded-For` chain. The limiter falls back to the socket peer when the peer is untrusted or forwarding is invalid; caller addresses are used only in the bounded in-memory rate window and are not logged or written to reports. No release configuration or infrastructure is changed here.

Scoped checks: `python3 scripts/test_bug_reports.py` and `node ux/check-support-about.mjs`. Browser review uses installed headless Chrome (`channel: chrome`) across mobile, tablet, desktop, short desktop and both themes. Temporary screenshots and results belong under `/tmp`, not in release artifacts.
