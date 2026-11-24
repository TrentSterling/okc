# Source layout and release process

Prairie Prism remains a static Three.js application with native ES modules. The browser entrypoint is `app.js`; the build copies authored modules without bundling or transforming them. The existing HTML import map resolves `three` to the pinned, vendored library.

## Ownership

| Location | Responsibility |
| --- | --- |
| `src/app.js` | Scene composition, simulation/frame loop, and driving orchestration |
| `src/app/renderer.js` | WebGL startup, color output, reversed/logarithmic depth selection |
| `src/app/camera.js`, `cockpit.js` | Chase/driver/orbit behavior, camera collision, dashboard geometry |
| `src/app/controls.js`, `interface.js`, `status.js` | Input bindings, HUD updates, focus handling and feedback |
| `src/app/setup.js` | Defaults and backward-compatible setup validation/import/export |
| `src/app/captures.js` | Capture lifecycle, preset restoration, photograph output |
| `src/app/audio.js` | Gesture-triggered synthesized vehicle/road audio |
| `src/world.js`, `src/world/` | Stable world/vehicle API; route, traffic, materials, generated-mesh assembly and scenery |
| `src/tower.js`, `src/tower/` | Stable landmark API; Devon, Legends, shaft, crown, campus and screen construction |
| `src/sky.js`, `src/atmosphere/` | HDR atmosphere, lighting, glass shader and local reflection integration |
| `src/driving.js` | Fixed-step driving and collision geometry queries |
| `src/driving-motion.js` | Shared angle and analytic-spring math for vehicle/camera presentation |
| `src/world/material-textures.js`, `surface-textures.js`, `facade-textures.js` | Repeatable procedural color, material-data and emission textures |
| `src/world/random.js` | Stable named random streams, isolated from unrelated scene additions |
| `src/world/placement.js`, `street-dressing.js` | Conservative prop placement and matching finite-height collision shapes |
| `src/world/road-markings.js` | Bounded side-street markings from saved lane/one-way data |
| `src/capture-presets.js` | Existing named scene/camera presets |
| `src/gallery/gallery.js` | Capture gallery interaction |
| `public/` | Authored HTML/CSS, original images, vendor files, licenses and reference contracts |
| `scripts/data/` | Compressed, checked-in geographic input snapshots |
| `scripts/` | Offline generation, validation, profiling and deployment verification |
| `scripts/street_surfaces.py`, `bake-street-details.mjs` | Owned street sections, curb caps/risers, physical ramps and contained paint |
| `scripts/mapped_massing.py` | Selected complete OSM building-part complexes and masks over legacy GIS volumes |
| `scripts/city_facades.py`, `city_roof_details.py`, `bake-facade-details.mjs` | Metric facade bays, real openings, projecting trim and constrained roof-well geometry |
| `dist/` | Ignored, generated deployment output |

Public `world.js`, `tower.js`, and `app.js` imports keep their prior exports. Setup JSON remains compatible with the original versions. New factories receive explicit dependencies; UI/input code reads the current state after setup loading and resets.

## Building locally

Use Node 22 or newer and Python 3.10 or newer. Install `requirements-build.txt` with your chosen Python environment, then run `npm run build` followed by `npm run check`. Set `OKC_PYTHON` when `python3` is not the desired interpreter. The application uses the vendored Three.js files, so the build does not require an npm package download or a live map service.

The build first checks the pinned Shapely version. It copies `public/` and `src/` to a staging directory, regenerates geographic data, resolves exposed surfaces, bakes meshes, and recreates the two capture downloads. It replaces `dist/` only after those steps succeed. A compiler failure leaves the previous local build intact.

`npm run build:map` runs the complete build. After source edits, rebuild to refresh `dist/`; edits to `dist/` are overwritten. The generated geographic modules, audit files, and ZIPs are intentionally absent from source commits. They are rebuilt from the preserved inputs in CI.

## Validation

`npm run check` runs the source guard, a real failed-build preservation test, static module/asset traversal, tower surface tests, road coverage tests, baked building-shell tests, driving tests, and deterministic mesh regeneration checks.

The v0.4 checks also exercise independent velocity/yaw, shared vehicle/camera interpolation, old/new setup restoration, and finite-height camera clearance over props. `npm run check:city-art` checks actual generated decoration against the mapped polygons with Shapely, including concavities and holes, complete rendered prop bounds, added paint coverage, collision footprints and clear Reno takeover positions. These gates do not replace GPU image review or subjective driving playtests.

The original map inputs and baked building/ground meshes are independent of the visual pass. New dressing adds its own collision polygons to the runtime world. Building solids without measured height remain conservative camera obstacles; prop solids supply an absolute `height` and `bottom` in world meters. A saved map tree remains in source even when a conflict with a building suppresses its rendering.

The v0.6 compiler reconstructs street cross-sections with asphalt at 0.14 m and sidewalks/caps at 0.29 m. Flat layers, ramps and vertical faces have separate ownership. Compiled paint is tested as complete rectangles against roads/lots and other paint. Raised curbs remain visual geometry; driving still uses the existing flat road-height model.

Supporting facades fit complete metric bays to joined exposed wall domains. The baker cuts each horizontal strip only at openings active in that strip. A sill or threshold owns each aperture's bottom, avoiding a coplanar reveal underneath. Low-rise roofs partition into inset decks and coping; pinned GEOS constrained triangulation supplies coping triangles to avoid fragile Earcut bridges on thin rings. Eight documented complete mapped complexes replace legacy prism ownership with saved part outlines. The original GIS records remain in source, with explicit masks marking where those parts own the volume.

The Node geometry tests resolve bare `three` imports through `scripts/lib/register-three.mjs`, which mirrors the browser import map while retaining normal file URLs and nested module imports. The vendored runtime library is used by both tests and the browser.

For a geometry-budget comparison against an older commit with tracked deployment output, run `node scripts/profile-world.mjs --baseline <commit>`. For a newer source-only commit, build it in a separate checkout and pass its output using `--baseline-dir /absolute/path/to/dist`. Profiling reports scene submission estimates, not measured GPU time.

For behavior-preserving refactors, compare the current build with a separate baseline using `node scripts/check-world-parity.mjs --baseline-dir /absolute/path/to/baseline/dist` and `node --experimental-vm-modules scripts/check-app-parity.mjs --baseline-dir /absolute/path/to/baseline/dist`. The first compares production world/landmark state; the second isolates app orchestration with mocked rendering dependencies. See `docs/validation/modularization-2026-11-24.md` for recorded results and their limits.

## Publishing

Push a work branch under `refactor/` or open a pull request for CI validation without publication. A validated `main` push runs two jobs:

1. Build and validate from source, then retain the exact resulting deployment artifact for 14 days.
2. Download that artifact, update the existing `gh-pages` publishing branch, request native GitHub Pages publication, and verify all deployed HTML, JavaScript modules, styles, JSON/reference files, licenses and capture ZIPs by SHA-256.

The second job cannot start until validation succeeds. The public URL remains `https://tront.xyz/okc/`. The source branch stays free of compiled city payloads and generated capture ZIPs.

## Recovery

The pre-modularization release is preserved at `backup/pre-modular-20261124-5c832b1`, commit `5c832b1f71ac71eed9a984a99aef49d726cd3829`. Original source, generated data and all capture assets remain in that history. Do not force-reset `main` or erase the backup branch. Revert the relevant source change with a new commit and let the validated publishing workflow rebuild it.

Before declaring an incident lost, inspect the local checkout, remote work branches, the source commit, CI artifacts, and the publishing branch. A stopped conversation alone does not establish loss of any of those.
