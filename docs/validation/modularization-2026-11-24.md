# Modularization verification, November 24, 2026

Baseline: released v0.3, `5c832b1f71ac71eed9a984a99aef49d726cd3829`. Recovery branch: `backup/pre-modular-20261124-5c832b1`.

The refactor preserves the application behavior while separating authored modules, static input assets, and generated output. The first complete source checkpoint is `43dd2eff198dbf9efd7cc3b67634f572d1e4efb8`; its clean-checkout CI validation passed at https://github.com/TrentSterling/okc/actions/runs/45447469873.

## Generated data and original assets

The full offline build reproduced these assets exactly:

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `city-data.js` | 1,033,326 | `5d04e4b81d32aa6fbcef4d4f298260bc8458d88160c00015acb931c440bff6ce` |
| `world-surfaces.js` | 4,572,663 | `bac97bb633bc627efcdce1732db1e5d78f338f2eebb509cd09f2c2d7d55e105b` |
| `world-meshes.js` | 16,035,524 | `17d447f86568f3c5eb49b93db2647a1a148cf3194959eb6cc32c1e69175284ed` |
| `gallery/prairie-prism-v02-captures.zip` | 11,891,896 | `05eb5486d77bd1997d107956fd532dfb2efd390fd03ba6188a2a57ccbd91714f` |
| `gallery/prairie-prism-captures.zip` | 20,576,444 | `a980d2658869a9aefc7e055f73147442fdffb816b73663698ba9c0fece08c598` |

Generated provenance and both audit JSON files also matched. Every preserved public asset, including all 29 PNG captures, thumbnails, HTML/CSS, vendor files and geographic reference contracts, matched the original bytes. The large generated JavaScript and audit files are rebuilt into `dist/` and no longer tracked in the source branch. Original versions remain in Git history.

## World and landmark equivalence

`scripts/check-world-parity.mjs` compares the constructed production scene against a separately built baseline. Seeds 42 and 1907 both matched across five state/update frames each:

- 407 scene objects, including graph order and transforms.
- 287 shared geometries, including all typed buffer and index contents.
- 84 shared materials, shader/uniform values, and procedural texture drawing operations.
- 121 route position/tangent samples.
- Instancing, metadata, traffic, night lighting, crown-screen changes and vehicle variants.

Run `node scripts/check-world-parity.mjs --baseline-dir /absolute/path/to/baseline/dist`. The candidate defaults to this checkout's built `dist/`; use `--candidate-dir` to override it. Mismatch details are written to a temporary file, never dumped as large buffers into terminal output.

## App orchestration equivalence

`scripts/check-app-parity.mjs` compares isolated copies of the original and modular application. Each loads its own built HTML, Three.js, capture presets and application graph. CPU-side Three.js math and cockpit geometry are real; renderer/world/sky dependencies are mocked for this comparison.

Exact comparison passed for 21 interaction/state/UI/camera snapshots, 24 named preset operations, and 534 render/environment events. Cases cover scenic/free driving, steering, direction changes, touch controls, recovery, focus pause, camera drag/zoom, quality and appearance controls, audio interactions, HUD/help, v1/v2 setup import, malformed setup rejection, capture restoration and reset.

Run `node --experimental-vm-modules scripts/check-app-parity.mjs --baseline-dir /absolute/path/to/baseline/dist`. The candidate defaults to the current built `dist/`, with optional `--candidate-dir`.

## Existing release gates and build reliability

The complete `npm run build` and `npm run check` sequence passed locally and in a clean GitHub Actions checkout. The static graph check reached all 44 JavaScript modules, resolved 184 local references, and preserved the 29 gallery captures and both downloadable packs.

Existing gates still reported 5,950 road samples without a miss, 4,437 crown rays without a miss, no hidden facade/roof triangles, 1,095 entrances, and passing driving checks at 30, 60 and 144 Hz.

The new failed-build test invokes the actual map compiler with a missing saved input inside an isolated fixture. It confirms that the build fails, every prior output byte remains, and temporary staging is removed. The source guard rejects generated output in Git, oversized authored files, and large encoded payloads.

## Geometry budget

`node scripts/profile-world.mjs --baseline 5c832b1` matched both fixed views exactly:

| View | Main-pass calls, before/after | Submitted triangles, before/after | Referenced buffer bytes, before/after |
| --- | ---: | ---: | ---: |
| Reno eye height | 266 / 266 | 606,211 / 606,211 | 11,219,370 / 11,219,370 |
| Devon campus orbit | 255 / 255 | 608,916 / 608,916 | 11,284,702 / 11,284,702 |

Allocated geometry/instance storage remained 14,438,310 bytes. These are scene submission estimates; they do not measure GPU time or FPS.

## Verification limits

The managed preview service reported an existing active preview, but its local URL was unreachable. No new rendered screenshots or live GPU interaction tests were obtained during this refactor. CPU/state equivalence, unchanged generated assets, static graph checks and deployment byte verification provide the evidence recorded here; they do not establish GPU image correctness.
