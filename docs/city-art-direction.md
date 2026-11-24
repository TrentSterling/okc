# City art and driving direction

Trent selected **believable and slightly worn, with strong color and lighting** on November 24, 2026.

## Visual priorities

- Preserve mapped building footprints, street geometry, landmark scale and the repaired surface ownership.
- Use warm masonry, cooler glass, readable greenery and restrained pavement wear. Broad material variation comes before fine texture noise.
- Improve the streets, lower building floors and planted areas visible at driving height.
- Extend appropriate lane markings beyond Reno using the stored lane and one-way metadata. These markings are illustrative, not a surveyed traffic-control plan.
- Give planting a small set of coherent silhouettes. Place street furniture and parked cars within valid surfaces, with clearance from roads, paths, water and buildings.
- Keep new scene detail bounded and batched. Do not create a unique material or frame update for every prop.
- Evaluate both daylight and evening. Retain the neutral material view.

## Driving direction

The reference audit favored Jet Game's independent velocity/yaw and tire-grip behavior, Crumplecar's shared vehicle/camera presentation, and VibeCar as a physical-feel reference. Adapt those principles to OKC's existing flat-city controller. Preserve the polygon collisions, holes, reverse/brake behavior, recovery, camera obstruction checks, scenic cruise and saved views.

## Stable updates

Use `rngFor(seed, stableKey)` from `src/world/random.js` for independent named random streams. Stable map IDs or authored feature names should determine local variation. A texture addition must not consume the random sequence used to place unrelated trees or props.

Source remains in `src/` and `public/`. Build output is generated and ignored. Make source checkpoints on the work branch, validate them, and publish through the existing CI workflow.

## Baseline and verification limits

The pre-art source is `0408b4b5d476912402ecb0d6eddf8ab34ec17e48`, retained on GitHub at `backup/pre-city-art-20261124-0408b4b`. The separate local build is `/workspace/okc-v03-baseline/dist`.

The managed preview server opened successfully for this pass, but the cloud browser reported WebGL2 unavailable on the unchanged baseline. Reloading once did not resolve that capability limitation. Numerical driving checks, geometry validation, 2D material swatches and scene-submission profiling do not establish rendered scene quality, browser driving feel or measured GPU performance. Do not relabel the old gallery photographs as captures of this pass.
