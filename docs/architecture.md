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
| `src/sky.js` | HDR atmosphere, lighting, glass shader and local reflection integration |
| `src/driving.js` | Fixed-step driving and collision geometry queries |
| `src/capture-presets.js` | Existing named scene/camera presets |
| `src/gallery/gallery.js` | Capture gallery interaction |
| `public/` | Authored HTML/CSS, original images, vendor files, licenses and reference contracts |
| `scripts/data/` | Compressed, checked-in geographic input snapshots |
| `scripts/` | Offline generation, validation, profiling and deployment verification |
| `dist/` | Ignored, generated deployment output |

Public `world.js`, `tower.js`, and `app.js` imports keep their prior exports. Setup JSON remains compatible with the original versions. New factories receive explicit dependencies; UI/input code reads the current state after setup loading and resets.

## Building locally

Use Node 22 or newer and Python 3.10 or newer. Install `requirements-build.txt` with your chosen Python environment, then run `npm run build` followed by `npm run check`. Set `OKC_PYTHON` when `python3` is not the desired interpreter. The application uses the vendored Three.js files, so the build does not require an npm package download or a live map service.

The build first checks the pinned Shapely version. It copies `public/` and `src/` to a staging directory, regenerates geographic data, resolves exposed surfaces, bakes meshes, and recreates the two capture downloads. It replaces `dist/` only after those steps succeed. A compiler failure leaves the previous local build intact.

`npm run build:map` runs the complete build. After source edits, rebuild to refresh `dist/`; edits to `dist/` are overwritten. The generated geographic modules, audit files, and ZIPs are intentionally absent from source commits. They are rebuilt from the preserved inputs in CI.

## Validation

`npm run check` runs the source guard, a real failed-build preservation test, static module/asset traversal, tower surface tests, road coverage tests, baked building-shell tests, driving tests, and deterministic mesh regeneration checks.

The Node geometry tests resolve bare `three` imports through `scripts/lib/register-three.mjs`, which mirrors the browser import map while retaining normal file URLs and nested module imports. The vendored runtime library is used by both tests and the browser.

For a geometry-budget comparison against an older commit with tracked deployment output, run `node scripts/profile-world.mjs --baseline <commit>`. For a newer source-only commit, build it in a separate checkout and pass its output using `--baseline-dir /absolute/path/to/dist`. Profiling reports scene submission estimates, not measured GPU time.

## Publishing

Push a work branch under `refactor/` or open a pull request for CI validation without publication. A validated `main` push runs two jobs:

1. Build and validate from source, then retain the exact resulting deployment artifact for 14 days.
2. Download that artifact, update the existing `gh-pages` publishing branch, request native GitHub Pages publication, and verify all deployed HTML, JavaScript modules, styles, JSON/reference files, licenses and capture ZIPs by SHA-256.

The second job cannot start until validation succeeds. The public URL remains `https://tront.xyz/okc/`. The source branch stays free of compiled city payloads and generated capture ZIPs.

## Recovery

The pre-modularization release is preserved at `backup/pre-modular-20261124-5c832b1`, commit `5c832b1f71ac71eed9a984a99aef49d726cd3829`. Original source, generated data and all capture assets remain in that history. Do not force-reset `main` or erase the backup branch. Revert the relevant source change with a new commit and let the validated publishing workflow rebuild it.

Before declaring an incident lost, inspect the local checkout, remote work branches, the source commit, CI artifacts, and the publishing branch. A stopped conversation alone does not establish loss of any of those.
