# Working on Prairie Prism

## Source layout

- `src/app.js` composes the scene and frame loop. `src/app/` owns camera, controls, UI, sound, setup files, screenshots, and renderer startup.
- `src/world.js` and `src/tower.js` are stable public entrypoints. Their implementations live in `src/world/` and `src/tower/`.
- `src/sky.js` composes atmosphere; `src/atmosphere/` owns solar geometry, shared sky radiance, reflected glass and surface-height sunlight. `src/driving.js` and `src/capture-presets.js` own driving physics and saved views.
- `public/` contains HTML/CSS, original gallery assets, vendored Three.js, licenses, and geographic reference contracts.
- `scripts/data/` contains the original compressed geographic snapshots. Map generation is offline.
- `dist/` is disposable build output and is ignored by Git. Never make a source fix there or add it to a source commit. `gh-pages` is the generated deployment branch.

## Safe changes

1. Inspect Git status and the current remote head before changing source. Preserve other work.
2. Keep edits within the module that owns the behavior. Preserve public entrypoint exports and existing setup/capture formats unless a task explicitly changes them.
3. Preserve seeded random call order and scene construction order during structural refactors. Geometry and material changes require explicit verification.
4. Use an incremental work branch for recoverable checkpoints. Keep `HANDOFF.md` current with the next action and actual verification limits.
5. Run the appropriate checks before updating `main`. CI builds and validates the source before publishing. Verify the final workflow result before reporting a live deployment.
6. Devon color comes from the shared sky and surface/view angles. Keep its facade emission zero; optional crown displays stay separate. Preserve fixed-exposure reflection study views and test the height-dependent horizon.
7. Use additive commits and reviewed reversions. Do not rewrite shared history or delete recovery branches as cleanup.
8. Street sections and paint belong to the offline street compiler. Sidewalks, caps and ramps partition their footprint; do not add competing flat ribbons or center-only-checked paint.
9. Each opening bottom has one sill/threshold owner. Do not restore a bottom reveal quad over its sill top. Roof coping uses the checked constrained triangles, not a second triangulation of a thin holed ring.
10. Restore building parts only with recorded source coverage and height provenance. Keep generic unknown heights labeled as estimates and retain original geographic inputs.

## Build and validation

Use Node 22 or newer, Python 3.10 or newer, and the exact dependency in `requirements-build.txt`.

- Install the compiler with `python -m pip install -r requirements-build.txt` (use your virtual environment when appropriate).
- Run `npm run build`, then `npm run check`.
- `npm run build:map` is an alias for the complete offline build.
- `npm run check:source` checks module size, accidental encoded data, and tracked build output.
- `npm run check:build-safety` checks that a failed compiler preserves the previous build.
- Use `OKC_PYTHON` to select a Python executable for the complete build and build-safety check.
- Geometry and driving checks do not establish GPU visual correctness or an FPS improvement. State any browser verification limit plainly.
- For structural refactors, use `scripts/check-world-parity.mjs` and `scripts/check-app-parity.mjs` with an explicitly chosen, separately built baseline; see `docs/architecture.md` for commands and test scope.

## Keep large payloads out of conversations

- Do not print, paste, or repeatedly read `dist/city-data.js`, `dist/world-surfaces.js`, `dist/world-meshes.js`, vendor bundles, image bytes, capture ZIPs, or base64 payloads into tool output.
- These generated files contain very long lines. A line-limited `head`, `sed`, or `rg` can still select megabytes. Inspect byte counts, hashes, JSON metadata, or bounded byte excerpts instead.
- The source guard caps authored files at 64 KiB and rejects large encoded payloads. Split code by responsibility when needed; do not raise the limit just to commit generated data.
- Transfer files using ordinary authenticated Git when available. With a connector, read and pass small changed source files programmatically, reuse existing Git objects for unchanged/moved assets, and return only metadata to the conversation.
- Never obtain or print credentials to work around an unavailable Git transport. Use the authorized connector or report the specific limitation.

## Deployment and rollback

GitHub Actions validates pushes to `refactor/**`, pull requests, and `main`; only `main` publishes. It deploys the exact artifact produced by the successful validation job, then compares every public runtime module and capture ZIP against the tested build.

The pre-refactor v0.3 release is retained at `backup/pre-modular-20261124-5c832b1`. Original capture images, map inputs, and generated output remain recoverable from that branch and Git history. See `docs/architecture.md` for module ownership and development commands.
