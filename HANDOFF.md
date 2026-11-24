# Prairie Prism handoff

## Project and recovery

- Source: https://github.com/TrentSterling/okc
- Production: https://tront.xyz/okc/
- Working checkout for the November 24, 2026 modularization: `/workspace/okc-modular`.
- Work branch: `refactor/modular-source-20261124`.
- Preserved v0.3 baseline: `backup/pre-modular-20261124-5c832b1`, commit `5c832b1f71ac71eed9a984a99aef49d726cd3829`.
- The untouched local baseline is `/workspace/okc`. Its generated files and original captures were used for byte comparisons.

The first complete modular source checkpoint is `43dd2eff198dbf9efd7cc3b67634f572d1e4efb8`. Its clean-checkout GitHub validation succeeded: https://github.com/TrentSterling/okc/actions/runs/45447469873. Final documentation and reusable comparison scripts follow that checkpoint. Check the current remote head and its workflow status before making claims about the latest deployment.

## Current layout

Read `AGENTS.md` and `docs/architecture.md` before editing. Authored JavaScript is in `src/`; original static assets, captures, vendor files and references are in `public/`. Focused modules implement app controls/cameras/setup, world construction/traffic, and landmark geometry. The public app/world/tower exports and saved setup format remain compatible.

`dist/` is generated, ignored output. The offline build uses the preserved compressed geographic snapshots in `scripts/data/`. Do not edit or commit generated city modules. The build stages all output and keeps the previous local build if a compiler fails. Diagnostics are bounded, and source guards reject large encoded payloads and tracked build output.

## Verification recorded for this pass

The full local build and check suite passed. Generated geographic data, compiled surfaces, baked meshes, provenance/audits, original capture assets and both ZIPs match v0.3 byte for byte. World/tower comparisons matched geometry, materials, textures' drawing operations, scene order, transforms, route results and animation for seeds 42 and 1907. App comparisons matched 21 interaction/state snapshots, 24 preset operations and 534 render/environment events.

The release still contains the 7.232 km² map, 1,301 building records, 1,710 road segments, free driving and collision, 1,095 recessed entrances, the improved Devon model, and all 29 original captures. The existing road, crown, building-shell and 30/60/144 Hz driving gates pass. Detailed evidence and repeatable commands are in `docs/validation/modularization-2026-11-24.md`.

GPU visual/interaction QA is unverified in this pass: the managed preview service reported another active preview, while its local URL was unreachable. State/geometry equivalence and static module checks do not establish rendered image correctness or measured FPS. The gallery continues to identify its older captures; do not relabel them as new screenshots.

## Build and publish

1. Use Node 22+ and Python 3.10+. Install `requirements-build.txt`; set `OKC_PYTHON` if needed.
2. Run `npm run build`, then `npm run check`.
3. Push recoverable source checkpoints to a work branch. `refactor/**` branches and PRs validate without publishing.
4. Update `main` after validation. CI publishes the exact tested artifact through the existing `gh-pages` branch, then compares every deployed runtime module and capture ZIP by SHA-256.
5. Verify the workflow's final result. A source commit alone does not prove that production updated.

Never print the compiled mesh, complete geographic arrays, base64, vendor bundles or image bytes into conversation output. Use ordinary authenticated Git when available. If only the connector is authorized, pass small source changes programmatically and reuse existing Git object hashes for moved assets. Never expose credentials to work around a transport limitation.
