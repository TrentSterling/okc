# Street geometry and building massing, v0.6

## Target and baseline

The user's actual v0.5 street screenshot showed blank supporting-building walls, flat oversized paving strips, repetitive asphalt patches and remaining surface flicker. This pass corrects those geometric and material causes while retaining Devon's sunset model. It does not claim photographic reconstruction of every OKC building.

Baseline source: `0aa810f316e7f808f6d75355d07c10aa045afba5`, preserved on `backup/pre-street-massing-20261124-0aa810f`. An intermediate source checkpoint is `376099ada4362f30865ff8db46a143a7912a7721`, preserved on `backup/street-massing-wip-20261124-376099a`. All changes are additive. The separate local baseline build is `/workspace/okc-v05-baseline/dist`.

## Confirmed defects and changes

### Surface ownership and depth

The original bottom reveal quad of every physical window/door shared its exact height with the top of a separate sill/threshold box. Their texture coordinate systems differed even when the material was the same. An independent audit of actual transformed Float32 triangles found approximately 135.08 m² of those appearance conflicts in the Reno/Devon review district. The baker now omits the redundant bottom reveal; one sill top covers the entire recess. Signal housings and the remaining fallback cornice corners also receive distinct geometry instead of coincident visible planes.

The citywide regression measures actual triangles and transformed box tops with small area probes, avoiding false duplicates at shared triangle edges. All 6,932 baseline probes reported two covers. All 37,452 current probes across 18,726 openings report exactly one cover. `scripts/check-opening-sills.mjs` is now a required check; `opening-sill-ownership-v06.json` records the finished result.

An early investigation suspected reversed-depth offset signs. That was not a v0.5 defect: startup already inverted the signs. The existing behavior now lives in an idempotent `configureDepthOffsets` helper and has both material-state and native pixel regression checks. Reports must not present that refactor as a newly discovered sign fix.

The final independent audit inspected 293,404 actual submitted flat triangles in the review district and found 0 m² of appearance-conflicting coplanarity, down from 135.0929 m². It retains approximately 3.042 m² of identical-appearance frame/edge contacts as a separate category. The independent audit distinguishes co-facing surfaces from opposite-facing solid contacts and compares material, vertex color and texture coordinates. Its spatial extent and tolerances are recorded in the accompanying report; a clean district audit is not proof about every possible transparent surface or view in the application.

### Street sections

The old road was at 0.14 m while its broad flat "curb" strip was at 0.06 m. The new section keeps the same roadway polygon and elevation, raises the walk to 0.29 m, and separates a 180 mm curb cap from 1.8–2.5 m sidewalk widths. Real vertical faces close the 150 mm road-side reveal. Service/link roads do not receive the same generic pedestrian ribbons.

There are 59 sloped curb cuts: 52 at Reno crossings and 7 at saved footway connections. Their center slopes and flares replace flat surface area rather than covering it. Road, sidewalk, curb, ramp, building and water ownership are checked independently. Crossings follow actual saved route tangents instead of the former hardcoded z=292 line.

Reno, crossing, stop-bar, shoulder and parking paint is planned offline. Complete rectangles are tested against the exposed road/parking polygon, including holes and concavities. Additional side-street paint is checked against the same contract. The gate checks 14,391 rectangles with zero positive-area overlap or escape.

The repeated dark repair rectangles were removed from the asphalt color map. A 4 m tile now carries restrained aggregate and wear, with 3 mm rather than 12 mm bump amplitude. This gives surface texture without large repeated shapes masquerading as broken geometry.

These are modeled street dimensions, not surveyed civil elevations. Preserving the roadway union also retains its existing corner outlines. The vehicle simulation continues to use its flat road-height model; curbs are visual geometry, not new collision obstacles or a wheel/terrain simulation.

### Supporting building architecture

The old layout generated ground-floor openings on only one frontage for most low-rises, with a maximum of eight bays. Other long exposed street walls and upper floors remained blank by policy. The new layout joins coplanar domains, fits complete bays with solid corner margins, considers exposed street frontages, and adds appropriate upper rows or clerestories. Openings are actual wall cuts with recessed glazing and reveals. Projecting plinths, fascia, belts and piers are split around apertures, with no coplanar back faces.

The finished build has 18,726 physical openings, 1,154 entrances, 2,868 detailed frontages, 4,955 upper openings and 3,470 clerestories. These are reconstructed architectural rules, not a claim to surveyed window inventories. Detail generation is bounded by proximity; far context retains a simpler frontage treatment.

There are 1,198 roof wells. Each preserves the original outer wall height and footprint while partitioning its exposed roof into a deck 42 cm below the top and a 28 cm parapet/coping ring. Roof plant sits on the deck. Original envelope polygons remain available to independent validation.

A valid but thin, irregular coping ring exposed an Earcut hole-bridge failure: one 151.91 m² cap produced 254.81 m² of submitted triangles. Coping now uses pinned Shapely/GEOS constrained triangulation offline. Independent checks compare the triangle union and actual baked area against the original coping polygons. This fixes the triangulation instead of relaxing area tolerance.

The facade bake also replaces its global Cartesian opening grid with horizontal bands split only by openings active in that band. This preserves exact openings and UVs while reducing the integrated candidate from 846,311 to 650,877 baked triangles together with the final geometry corrections.

BOK's physical vertical fins follow the architect's documented vertical articulation. Their 1.2 m pitch follows the existing pane module; 80 mm width and 120 mm projection are explicit visual reconstructions. The 35 ft lobby and 27 occupied stories remain unchanged. See `public/geo/skyline-facade-sources.json` for the source anchors and limits.

### Mapped massing

The importer previously read `building:part` records only when their floor count was at least ten, dropping lower wings and even explicitly tagged heights without a floor count. Eight selected, complete complexes now use 25 saved parts, 23 of them newly restored:

- Corporate Tower's lower stepped parts.
- Omni Hotel's tower and lower wings.
- Oklahoma City Convention Center's separate height volumes.
- Hampton Inn & Suites, Hilton Garden Inn and Power Alley Garage in Bricktown.
- The mapped 32 m building east of the arena.
- A mapped one/two-floor Reno commercial building.

Every selected group must cover its parent outline completely and have explicit height or floor-count tags for every included part. Roof-only, unresolved suspended or uncertain parts are rejected by this bounded pipeline. The original GIS records survive; three explicit mask assignments let mapped parts own the corresponding area rather than extruding a legacy outline through them. No random global height variation was added.

The build emits `geo/mapped-massing-sources.json` with each source way, height provenance, coverage and legacy mask. [OSM's building-part schema](https://wiki.openstreetmap.org/wiki/Simple_3D_Buildings) distinguishes a complete outline from the separate three-dimensional parts. Floor-count-only heights retain the declared 3.65 m pitch estimate. Most unrelated supporting heights still lack measurements.

## Verification and limits

The full build/check suite passes. It covers static assets and capture links, actual failed-build preservation, the Devon crown, ground and building triangle ownership, road coverage, complete paint containment, ramp joins, full bays and roof partitions, mapped-source massing, driving and camera checks at 30/60/144 Hz, independent prop clearance, skyline facade assignment, solar-height math and deterministic rebaking. Eighteen actual production shader variants compile/link through native GLES. A native ordinary/reversed-depth test preserves visible paint in both modes and includes deliberate wrong-sign controls.

`street-massing-preservation-v06.json` records that all 1,300 prior building records retain their original id, OSM match, footprint, height, material kind and height source. All other geographic collections, saved input archives, 29 source PNGs and both capture ZIPs are unchanged. Atmosphere, Devon/tower geometry and driving physics modules are byte-identical to v0.5. Ownership masks, new parts, street geometry and facade details intentionally change the rendered city.

The native comparison images export the actual production scene, instance transforms, UVs, vertex colors and Canvas texture pixels, then use a depth-tested Lambert diagnostic renderer. They expose mesh, mapping and ownership problems. They omit Three's PBR/environment response, real shadow maps, atmospheric sky, transparency and gameplay, and are labeled accordingly. They are not browser screenshots. The previously tested cloud browser could not create WebGL2 even for the unchanged baseline; no browser image-quality or FPS claim is made here.

- `street-corner-comparison-v06.webp`: identical street-level framing before/after.
- `street-massing-comparison-v06.webp`: identical elevated block framing before/after.
- `street-massing-native-views-v06.json`: renderer method, exact exported geometry hash and camera/render evidence.
- `street-massing-coplanarity-v06.json`: the final independent triangle audit.
- `street-shader-validation-v06.json`: actual shader compilation and native depth-state evidence.

The geometry/detail pass has a real cost: allocated geometry/instance buffers increased from 14.95 MB to 48.90 MB, and the fixed Reno view submits approximately 1.60 million triangles in 327 estimated main-pass calls, compared with 0.736 million in 287 calls. The three generated city modules total 78.14 MB raw; deterministic gzip estimates 22.18 MB versus 7.02 MB previously. That estimate is not a measurement of HTTP transfer or load time. See `street-massing-budget-v06.json`; those measurements exclude renderer/driver overhead and shadow/reflection passes and do not measure frame time. The exact runtime bundle is rebuilt in CI and must pass the existing publication hash verification before a live-release claim.

## Live review views

- `?view=v06-reno-street`
- `?view=v06-walker-corner`
- `?view=v06-block-massing`

These are paused live daylight views with fixed exposure. They are separate from the historical ten-view gallery and do not relabel old capture images. All three v0.5 sunset studies remain available.
