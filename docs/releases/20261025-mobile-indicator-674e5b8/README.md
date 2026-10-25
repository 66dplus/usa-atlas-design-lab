# Recovered runtime evidence

This evidence records release `20261025-mobile-indicator-674e5b8` from the live container image digest `sha256:09e7604b94b8e1c9e41000d088c647abdc6d02543b8e6fffc6681bb5cbcecd54`. The public build manifest is the exact raw `public-build.json` captured for that release. Its `sourceBaseCommit` is `dd3d97d829e85e341b051538707298bd943dea31`; `appliedCommit` (`674e5b8361d3bc856d68c5c318d3273a4cd7427e`) identifies the recovery operation. Neither commit is asserted to equal the live container tree.

Recovery inverted the deterministic preview packaging edits: `ux/index.html` retained `data-runtime="preview"` in its original attribute position and regained the removed `feedback.css` link; `ux/app.js` changed the first packaged `if(false){` back to `if(reviewOn){`. The verifier checks the original 125 unique hashes from the manifest plus three live-image inputs: `Dockerfile` (source `deploy/temporary-preview/Dockerfile`), `ux/catalog.json`, and `ux/catalog-proposals.json`. Historical Mac AppleDouble files, Python `__pycache__` files, `deploy.py`, and `postdeploy-remote.py` were present in the old image but are packaging extras, not application input requirements; later packages may intentionally exclude them.

Verify a built package from the repository root:

```sh
python3 scripts/verify_recovered_runtime.py /path/to/built-package
```

The check is portable and reads only the package and the committed evidence beside the verifier. It checks required file presence and SHA-256 equality; it does not establish complete image equivalence, runtime behavior, or provenance beyond the recorded evidence.
