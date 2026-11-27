# Discover OKC v0.7 verification

Validated and published on November 27, 2026. Workflow
[46058902219](https://github.com/TrentSterling/okc/actions/runs/46058902219)
completed validation, publication and the full public asset audit for source
`619aa1d`. See `HANDOFF.md` for the published revision and recovery history.

## Preservation and release gates

The full offline build and `npm run check` passed. This includes failed-build
preservation, source/module and asset contracts, original capture ZIP integrity,
street/building/roof ownership, driving behavior, facade and sunset contracts,
deterministic geometry regeneration, atlas integrity, planner persistence,
worker cancellation and guided-tour lifecycle checks.

The original downtown production world matches the separately preserved v0.6
baseline for seeds 42 and 1907: five frames and 121 route samples per seed,
360 geometries and 90 materials. This is a scene-state/geometry comparison,
not a browser screenshot or timing measurement. The older app-parity VM is not
used as a v0.7 gate because its stubs predate the asynchronous discovery UI and
worker interfaces; those boundaries have focused runtime and browser checks.

All 18 actual production shader programs compile on native Mesa EGL/GLES.
Ordinary and reversed depth checks both retain the intended road-paint offset.
The height-aware horizon and zero-emission Devon facade contracts still pass.

## Metro integrity and geometry

The atlas contains 272,713 unique mapped footprints, 82,114 source roads,
218,875 routing nodes, 7,799 POIs and 3,004 tiles. All 91 curated destinations
have mapped coordinates. Geographic checks verify source inventory, raw/gzip
hashes, decoded identity, polygon validity, unique IDs, POI associations and
selected cross-city routes.

Raw tile payloads total 197,918,437 bytes; gzip payloads total 40,896,774 bytes,
a 79.34% reduction. This is a payload comparison, not measured startup time.
Only nearby tiles are requested. The road graph is downloaded on first route
request and processed in a dedicated worker.

Both metro road/sidewalk overlap and metro road overlap with the preserved
downtown core are 0.0 m². The strict geometry gates were retained.

[Native metro evidence](metro-geometry-v07/README.md) inspects 36 tiles across
Yukon, Bethany, West Reno and Lake Hefner. Its five source-hashed views have no
reversed-order appearance differences above the recorded pixel threshold.
The images use actual production meshes and color maps with simplified native
lighting; they do not claim browser/PBR rendering or complete metro coverage.

## Browser interaction

The managed preview was exercised in the supplied cloud browser:

- Capability-aware startup opens the full atlas and planner when WebGL2 is
  unavailable, without importing the 3D application graph.
- Subway filtering shows 33 records; address search for `8022` narrows it to
  the mapped Bethany location.
- The west-side preset selects the curated Yukon Ollie's and Cactus Jack's.
- A 21.7 km road route to Yukon is prepared successfully by the routing worker.
  Tour pause and resume update the controls and continue the route.
- The planner changes presets and recalculates allowances plus reserve.
- The repaired Christmas preset was selected in the rebuilt browser UI: it
  shows December 12, 2026, the correct downtown Brewery and Automobile Alley
  Hatch addresses, $187 of stop allowances and $13 reserve within the $200
  budget. Export produces an itinerary download, and editing the budget updates
  the remaining amount immediately.
- Browser inspection exposed a malformed Christmas preset option. It was
  repaired, covered by a rendering assertion, and its fresh preset now prefers
  the curated downtown Brewery and Automobile Alley Hatch records. A narrow
  migration repairs untouched old defaults without rewriting edited adventures.

The browser emitted extension-metadata errors unrelated to the app. Its driver
cannot create WebGL2; 3D driving appearance, hardware frame times, touch control,
audio and full-screen/photo behavior still require a capable physical device.
The browser file-chooser import attempt stalled and lost its tab, so a complete
browser export/import round trip is not claimed. Automated import validation
and persistence regressions passed.

## Limits that remain explicit

The geography is a preserved snapshot. Business operation, prices, closures
and entrances are not live. Planner prices are editable allowances. Most
building heights, facade details and untagged residential roof pitches are
estimates. Only 50 metro buildings have explicit OSM height tags; another 2,160
use mapped floor counts with an estimated floor pitch. The challenge modes are
navigation prototypes, and decorative traffic is not a traffic simulation.

The 29 original gallery captures remain byte-preserved historical images. New
native diagnostics are labeled separately and never presented as current
browser captures or evidence of an FPS improvement.

## Publication audit

The first remote run, `46057155818`, passed its complete validation job and
published source `2c307446` through native Pages. Its final public audit then
received HTTP 429 after a burst of roughly 3,100 files in 11 seconds. It did not
report a hash mismatch, but it did not finish the complete inventory either.

The paced verifier correction shipped in source
`619aa1d95062862f8e276bd2edc0d5bfac35a039`. Workflow `46058902219` completed
successfully at 20:01 UTC and published `gh-pages` revision
`d911f474b404a18d95e42dbf7de96b952db21029`. Its final SHA-256 audit matched all
6,200 files and 441,999,795 bytes against the validated artifact in 624 seconds.
One HTTP 503 retried successfully after one second; there were no HTTP 429
rate-limit waves or hash mismatches. Shared request-start spacing remained
100 milliseconds. All seven deterministic pacing regressions passed in CI.

The complete audit includes the finalized release inventory, runtime assets,
compressed geography, validation report and historical captures. It does not
sample or omit binary files. The live destination is https://tront.xyz/okc/.

This confirms publication and public asset identity. The cloud browser received
a generic 403 at the public custom domain, while the managed preview worked.
Neither the HTTP audit nor the native diagnostics changes the recorded WebGL2,
physical-device or browser import-round-trip limitations.
