# v0.4 city art and driving validation

Validated locally on November 24, 2026 against the pre-art source at `0408b4b5d476912402ecb0d6eddf8ab34ec17e48` and its separately preserved build in `/workspace/okc-v03-baseline/dist`.

## Scope and preservation

The accepted direction is believable and slightly worn, with strong color and lighting. The pass changes procedural materials, atmosphere colors, tree presentation, bounded street dressing, side-street markings, free-driving handling and vehicle/camera presentation.

The three generated geographic/mesh modules, three provenance/audit files, and both original capture ZIPs are byte-identical to the baseline. The mapped geometry, 1,301 building records, 1,710 road records, 3,466 facade openings and 1,095 entrances are retained. Full hashes are in [the preservation record](city-art-preservation-v04.json). All 29 archived captures remain intact and correctly labelled as older releases.

## Completed checks

- `npm run build` and the complete `npm run check` suite pass.
- The failed-build regression preserves every previous output byte.
- Static traversal resolves 51 JavaScript contexts and 210 local references.
- Existing road coverage checks pass all 5,950 samples. Crown checks pass all 4,437 rays. Building-shell checks find no hidden exterior walls/roofs or blocked opening centers.
- Driving remains deterministic at 30, 60 and 144 Hz with a 120 Hz simulation. Checks cover world momentum, finite lateral grip, yaw recovery, handbrake recovery, braking/reverse, interpolation, angle wrapping, teleport/reset behavior, bounded saved motion and existing collision regressions.
- Real Three.js camera/vehicle transform checks confirm shared presentation poses, chassis motion, immediate boom contraction, smooth extension, low-prop camera clearance and old/new setup compatibility.
- The Reno to Hudson to Sheridan route completes 92 simulated seconds without contacts against the mapped solids.
- Independent Shapely/GEOS checks pass every new marking rectangle, complete prop footprints and rendered bounds, polygon holes/concavities, tree/building clearance, and matching prop collision geometry.

The geometry-only world test's Canvas mock was extended to support the standard linear gradients used by the new materials; its geometry assertions were retained.

## Scene detail

At application seed 1907: 36 parked cars, 10 benches and eight bins, all with collision footprints and finite camera-clearance heights. The input retains 719 mapped tree positions: 706 render, while 13 conflicted positions are explicitly suppressed without moving or deleting input data. There are 84 additional garden trees. Seed 42 also passes with 73 garden trees.

Both seeds preserve 1,360 clear Reno lane takeover poses with the new props included. All 108 tested prop-center poses reject a car. All 6,470 additional street-marking rectangles fit the baked road union. Stable placement, three traffic-marking fixtures and four independent containment/overlap fixtures pass.

## Rendering workload

The profiler uses actual geometry, material groups, instance counts and frustum tests at fixed cameras. It does not measure GPU time, occlusion, shadow passes or reflection captures.

| View | Main draw submissions before / after | Submitted triangles before / after |
| --- | ---: | ---: |
| Reno eye height | 266 / 286 | 606,211 / 736,229 |
| Devon campus | 255 / 273 | 608,916 / 718,396 |

Geometry and instance allocation rises from 14,438,310 to 14,956,534 bytes, an increase of 518,224 bytes. Material-factory texture allocation including mipmaps rises from approximately 13.63 to 17.48 MB; this excludes unrelated foliage/scene textures, render targets and driver overhead. Detail and emission maps use reduced dimensions. No additional real lights are added.

The full submission report is [city-art-renderer-budget-v04.json](city-art-renderer-budget-v04.json). Reproduce with `node scripts/profile-world.mjs --baseline-dir /absolute/path/to/pre-art/dist --output report.json`.

## Visual verification limit

The managed preview server served the unchanged baseline successfully, but the cloud browser could not create WebGL2. A single reload returned the same explicit error. Material color/emission sheets and CPU-projected canopy geometry were inspected; these are not rendered game screenshots. GPU image correctness, shader sampling cost, subjective driving feel and measured FPS remain unverified in this environment.

The pre-art source is recoverable from `backup/pre-city-art-20261124-0408b4b`. The existing CI workflow validates the source before publishing its exact artifact and checking the deployed runtime files/downloads. Check the current commit's workflow status before claiming that production matches it.
