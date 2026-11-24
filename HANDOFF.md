# Prairie Prism handoff

## Active Devon reflection and skyline correction

- Work branch: `refactor/devon-sunset-20261124` in `/workspace/okc-modular`.
- Baseline: `86d755224793319cc48ae276af084267f9a8baf9`, remotely preserved on `backup/pre-devon-sunset-20261124-86d7552` and the existing v0.4 recovery branch.
- Separate unchanged baseline checkout/build: `/workspace/okc-v04-baseline`.
- User requirement: Devon must reflect the warm western sunset against the cooler sky behind it. Surface/view angle and real height-dependent horizon visibility matter. No artificial tower emission, rainbow UV strip, bloom, or reflection-only brightness boost.
- Confirmed defects: height-blind sunset cutoff; artificial facade office emission; two legacy GIS footprints both assigned BOK Park Plaza's 132 m height; repeated 14-floor occupancy textures.
- Implemented v0.5: corrected BOK to its saved OSM outline once, shared height-aware atmosphere/reflection, zero-emission Devon glass, metric BOK facade, and nonrepeating city office occupancy. Three fixed-exposure live optical studies are in Settings > Viewpoint.
- Full local build/check and 18 native production shader compilations pass. Native diagnostic images and exact preservation evidence are recorded in `docs/validation/devon-reflection-v05.md`. The shader gate is also required by CI.
- First remote checkpoint: `85989e3aaa6d4ddb33467a7858a7f6b75f688b07`. The complete source follows it on the same work branch. Inspect current branch and Actions for authoritative final source/publication status.
- Source data limitation: 1,231 of 1,301 v0.4 building records use generic estimated low-rise heights. The source GIS snapshot has no height field. See `docs/validation/city-reference-audit-v05.md`.
- Browser check November 24: unchanged v0.4 still cannot create WebGL2 in the cloud browser; one reload confirmed it. Native shader and geometry diagnostics must be labeled honestly, never as a live browser screenshot or full-scene playtest.
- Resume by inspecting Git status, main, this work branch and Actions. Keep checkpoints additive. Full-scene WebGL2 visual review is still outstanding; native diagnostic images do not replace it.

## Active city art and handling pass

Trent selected a believable, slightly worn city with strong color and lighting. See `docs/city-art-direction.md` for the accepted direction and scope.

- Working branch: `refactor/city-art-driving-20261124` in `/workspace/okc-modular`.
- Pre-art source: `0408b4b5d476912402ecb0d6eddf8ab34ec17e48`, backed up remotely on `backup/pre-city-art-20261124-0408b4b`.
- Separate baseline worktree and built output: `/workspace/okc-v03-baseline`.
- Implemented: surface/facade materials, bounded planting/street dressing, road markings beyond Reno, atmospheric color, and independent velocity/yaw with shared car/camera presentation. Release metadata is v0.4.0.
- Browser QA limit: managed preview starts, but the cloud browser cannot create WebGL2 even for the unchanged baseline. One reload confirmed the same error. Do not claim a new GPU screenshot or a measured FPS result.
- Local full build/check, independent Shapely placement validation, material swatch review, and submission profiling pass. See `docs/validation/city-art-and-driving-v04.md` for exact scope, counts and costs.
- First remote foundation checkpoint: `1c483905362f339640e3df308041f88bde3f09d1`, with successful work-branch validation at https://github.com/TrentSterling/okc/actions/runs/45458141998. The complete v0.4 source follows it on the same work branch.
- When resuming: inspect current `main`, the work branch and Actions status before changing anything. The remaining experiential review is daylight/evening rendering and driving on a WebGL2-capable browser. Use the preserved pre-art release for comparisons.

The earlier modularization record below remains useful recovery history.

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
