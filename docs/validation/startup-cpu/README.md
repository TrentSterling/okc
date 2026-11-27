# Startup CPU and allocation validation

This investigation used the v0.7.1 source at
`6ae1e0e2d7a9e3d13e1b83bc8d3f37eaeb746bbb` as its baseline. The optimized
working-tree files are identified by SHA-256 in [results.json](results.json),
including the packer, runtime adapters and three texture modules.

These are **isolated CPU/container observations**, not browser FPS, GPU timing,
physical-device results or an end-to-end startup benchmark. Timings are single
observations, not statistical averages. The city geometry and authored texture
appearance were preserved.

## Observed costs

| Isolated operation | Before | After |
|---|---:|---:|
| Unpack the skyline's geometry ranges | 11.4 ms | 0.8 ms |
| Mount 315 baked meshes and their bounds | 64.9 ms | 4.1 ms |
| Generate/audit city textures, seed 42 | 719.0 ms | 501.2 ms |
| Generate/audit city textures, seed 1907 | 546.9 ms | 378.1 ms |
| Normalize the place catalog | 178.9 ms | 123.8 ms |

The texture runs use the same command recorder and include its hashing cost.
Seed 42 runs before seed 1907 in each process. Canvas drawing and GPU texture
upload are excluded. The approximately 30% texture CPU reduction does not imply
the same improvement in overall loading time.

## Texture preservation

Each seed produced 42 ImageData buffers containing 5,373,952 pixels and 81
canvases. Every `putImageData` buffer was hashed. Canvas property changes and
drawing operations were recorded in order, including later facade details,
emission masks and resizing. The before/after comparison passed for every
canvas; no pixel sample order or random call order was changed.

| Seed | SHA-256 of ordered canvas dimensions and pixel/drawing hashes |
|---|---|
| 42 | `a40485d46047679c00c3196899471fa256004d262b5e510ac1bbbdcd60db915f` |
| 1907 | `41e093ea615d1e03c60a7bfc18bba2a62488fd2ef6f6cdb10fdcbd97f59a4cb2` |

The original compact after-audit output is preserved as
[texture-after.json](texture-after.json). The parity check can be repeated from
the repository root without a build or full application startup:

```sh
node docs/validation/startup-cpu/check-textures.mjs
```

This check hashes actual generated ImageData bytes and records drawing commands;
it does not rasterize those commands into a browser screenshot. The optimization
replaces 5,177,344 source-level per-pixel array constructions with 21 reusable
scratch arrays per texture set. That count describes removed code operations,
not a sampled JavaScript heap profile.

## Packed skyline storage and bounds

The existing packed binary contains **45,807,044 bytes**, including 188 bytes of
alignment padding. Previously the runtime copied **45,806,856 bytes** into
individual chunk buffers. The new adapter creates 574 views over the same
buffer: two per each of 259 mesh chunks, plus 56 instance chunks. No vertex,
index or instance value is changed. The legacy base64 adapter remains available
for canonical geometry and historical checks.

The 69,397 instance matrices already occupy 4,441,408 bytes in that shared
buffer. Instanced meshes now install those matrices directly instead of first
allocating and filling an equally sized identity-matrix array. These are avoided
allocation byte counts, not a measured browser heap reduction.

For all 259 production mesh chunks, proposed offline bounding boxes and spheres
were computed from the packed Float32 positions and compared exactly against
Three's `computeBoundingBox()` and `computeBoundingSphere()`. Every minimum,
maximum, center component and radius matched. That offline computation took
39.4 ms in the isolated run and was outside the optimized mount timing.

At the time this evidence was recorded, the existing `dist/` layout had no
offline bounds. The updated `scripts/pack-runtime.mjs` emits them on the next
build; the proof above computed them in memory from the recorded production
payload. Input hashes are included in `results.json`. The subsequent complete v0.7.2 build and release check passed, including the
actual packed-data mount and sustained-input application gate. The measurements
above retain their original isolated-run scope.

```sh
node src/world/packed-data.test.mjs
```

That regression checks shared storage, nonzero byte offsets, range validation,
exact bounds, legacy decoding and mounted geometry/instance equivalence.

## Atlas work kept out of 3D startup

The overview contains 31,613 roads, 9,118 surfaces and 232,576 points. Its former
synchronous normalization cost 154.7 ms, followed by 55.6 ms of spatial-index
construction. A hidden map now retains the source and prepares it on its first
visible draw. This work is deferred, not removed from the map path. Valid point
arrays are reused, and moving-car redraws retain the existing base-map cache.

Missing URL values no longer create exceptions during catalog normalization.
The explorer also avoids its duplicate initial render, and exact venue matches
skip the unnecessary prefix search. Planner and atlas regressions, changed-file
syntax checks and `git diff --check` passed. Full integration and capable-device
rendering remain separate validation steps.
