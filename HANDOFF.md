# Prairie Prism handoff

## Active recovered Discover OKC release (v0.7)

- User authorized finishing and publishing directly to `main` at https://tront.xyz/okc/, with incremental recoverable checkpoints and no PRs.
- Recovered the full interrupted workspace at `/workspace/scratch/bc993b0a4273/okc`, including post-checkpoint data and planner edits. Those recovered edits are remotely preserved as `9c856d12538428fe2a2b66003c20d7a7b024c26d`.
- Pre-discovery production remains recoverable at `backup/pre-discovery-20261127` / `75b1502b1bdf965bac032220b07742689d3d59b2`. Original built baseline remains in ignored `qa/baseline-dist/`.
- Runtime work separates startup asset decode, geometry worker jobs, bounded tile residency, route calculation, atlas drawing, catalog search, planner state and persistent corrections. Worker geometry is never baked on every render frame.
- Full build now runs independent metro and downtown compiler pipelines concurrently, joins before replacing output, and writes `release.json` with exact hashes for every deployed asset, including compressed tile and geometry files.
- The data audit found rounded road/sidewalk overlaps and duplicate multipart building identities in the interrupted build. Fixes retain strict validation; a fresh atlas bake and all release gates are required.
- Use `OKC_PYTHON=/workspace/scratch/bc993b0a4273/okc-build-env/bin/python` and put that virtual environment's `bin` on `PATH` for the local Python checks. System Python lacks Shapely. CI installs the pinned requirement normally.
- Direct shell Git can fetch public source but cannot authenticate pushes here. Use the authorized GitHub connector for content-addressed blobs, trees and fast-forward commits; do not extract credentials. Keep local HEAD/tree synchronized after each connector checkpoint.
- Browser preview is managed through `sites-preview`; WebGL2 remains unavailable in the provided browser. Atlas/planner UI is browser-tested separately from actual geometry and native production-shader tests. Do not claim a browser 3D capture or measured FPS.
- Current next action: finish integration, rebuild from preserved inputs, validate, push final release, wait for Actions publish and full live hash verification. Inspect the actual remote head and workflow before declaring completion.

## Active street geometry and building massing correction (v0.6)

- Work branch: `refactor/street-massing-20261124`, checkout `/workspace/okc-modular`.
- Preserved production baseline: `0aa810f316e7f808f6d75355d07c10aa045afba5`, remote `backup/pre-street-massing-20261124-0aa810f`, separate checkout/build `/workspace/okc-v05-baseline`.
- User's actual v0.5 screenshot exposed flat below-road curb strips, blank building frontages, generic block massing, and remaining surface flicker.
- Confirmed coplanarity defect: bottom window/door reveal quads shared a plane with the top of the sill/threshold box and different UVs. Baker now gives that surface one owner. The old app already corrected reversed-depth offset signs; do NOT claim that was a missing v0.5 fix. The same behavior is now an idempotent tested helper.
- Implemented: raised sidewalks and180mm curb caps, actual risers and59 ramps, compiled contained/nonoverlapping crossing/lot paint, complete metric facade bays, upper rows and parapet roof wells, and eight complete saved OSM part groups restoring23 omitted parts. Generic unknown heights remain unchanged. BOK receives referenced vertical fins with explicitly reconstructed dimensions.
- Full coordinated build/check and 18 native production shader compilations pass. Finished buffers have 650,877 triangles and 18,726 physical openings. Final independent Reno/Devon audit inspected 293,404 flat triangles and found zero appearance-conflicting coplanarity (baseline 135.0929 m²). Thin roof coping uses checked constrained triangles after an actual Earcut area failure was found and corrected. See `docs/validation/street-massing-v06.md` for scope and costs.
- First remote checkpoint: `376099ada4362f30865ff8db46a143a7912a7721`, branch `backup/street-massing-wip-20261124-376099a`. The final source follows it; inspect the work branch, main and Actions for authoritative publication status.
- The required citywide sill regression passes 37,452 probes (one surface); the v0.5 negative comparison fails all 6,932 probes (two surfaces). Before/after native comparison images and exact reports are in `docs/validation/`.
- The geometry/detail pass increases buffers and triangle submission; budget and limits are recorded. No measured frame-rate claim is made.
- Native diagnostic graphics use actual production mesh transforms and texture pixels with simple depth-tested shading. They are not browser/PBR screenshots and do not measure FPS. Browser WebGL2 was unavailable in the preceding baseline checks.
- Source snapshots, existing29 images/capture ZIPs, sunset shader and zero-emission Devon contracts remain preserved. Do not overwrite `main` or delete any backup to resolve a failure.

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
