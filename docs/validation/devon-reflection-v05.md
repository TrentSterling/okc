# Devon reflection and skyline correction, v0.5

## What this pass corrects

The intended effect is a warm Devon facade reflecting the western twilight
while the sky seen behind it is cooler and darker. The previous material pass
did not implement the height-dependent sunset requirement. It also left an
additive office-light term in Devon's shader and repeated office patterns on
neighboring buildings. Those were concrete omissions, not missing source data.

The new implementation separates three contributions:

1. Surface normals and the camera determine the reflected sky direction. The
   tower's broad facets and inclined crown therefore sample different colors.
2. The geometric horizon falls with observer height. A surface high on Devon
   can retain direct sunlight after the street loses the sun.
3. Western twilight remains after direct sunlight has left the tower. Its
   reflection can remain warm against the cooler opposite sky.

Visible sky and reflection originate in the same radiance function. Devon has
zero facade emission, zero iridescence, environment intensity one, and no
extra outgoing-light multiplier. Optional crown displays remain a separate,
explicit feature and are disabled in all new comparison views.

## Model and source limits

`src/atmosphere/` owns solar geometry, radiance, glass and height-dependent
sunlight. `src/sky.js` composes them. At height h, the horizon dip is equivalent
to `acos(R / (R + h))` for a spherical Earth of radius 6,371,000 m. At Devon's
257.2 m architectural height this is 0.514827817 degrees; at a 2 m eye height it
is 0.045399259 degrees. It is a modest direct-sun extension. The longer visual
contrast comes from the reflection directions and twilight radiance.

The time slider remains an authored solar-altitude sequence, not a dated
ephemeris. Near-horizon refraction uses an explicit, smoothly varying
34-arcminute approximation. Terrain and weather are not measured. The sky
palette and effective glass coating are visual reconstructions. These limits
are consistent with the distinction between sunset and twilight described by
the [US Naval Observatory](https://aa.usno.navy.mil/faq/RST_defs); no specific
sunset time is claimed.

The filtered environment is retained. A narrow signed radiance correction
accounts for the extra horizon strip exposed at each glass fragment's height.
The existing local city cubemap remains separate. Moving the camera changes a
height uniform and reflected rays; it does not rebuild PMREM every frame.
Direct sunlight uses the same horizon model on Standard/Physical materials,
including instances, while preserving their existing shader hooks and shadows.

## Corrected neighboring architecture

Both legacy GIS objects 165140 and 165141 had matched BOK Park Plaza's OSM way
752099946 and inherited its 132 m height. That produced two incorrect tall
volumes. The compiler now substitutes the saved OSM tower outline once. The
original compressed GIS and OSM snapshots remain unchanged.

The [architect of record](https://www.kendall-heaton.com/projects/499-sheridan/)
describes the rotated parallelogram, 27 stories, vertical facade rods and
35-foot lobby glazing. The
[contractor](https://jedunn.com/projects/bok-park-plaza/) documents a 40-foot
crown. BOK now has a dedicated full-height facade with those anchors. Equal
spacing of the 26 office floors above the lobby remains a reconstruction,
not surveyed floor elevations. Its crown does not repeat office emission.

Generic glass uses a neutral coating with fine continuous panes; reflected
color comes from the shared environment. Window maps describe apertures, while
world-space room/floor coordinates supply stable occupancy. The old 14-floor
sequence of lit offices no longer repeats up every building of one family.
The new BOK material is additive; all 24 earlier baked material keys remain.

The donor audit covers Slop New York, Cityworks, Tinyrise and ASCIICITY, with
exact source commits and practical facade lessons in
[`city-reference-audit-v05.md`](city-reference-audit-v05.md). No donor shader,
image or geographic dataset was copied into this release.

## Preservation and checks

`npm run build` and the complete `npm run check` pass. The new gates cover
BOK identity, actual baked material area and UVs, 27 occupied floors, fixed
exposure in the new study views, and independent solar-disk ray/sphere tests.

- 1,299 unrelated building records are exactly unchanged.
- Roads, paths, surfaces, trees, route, features, map bounds and origin are
  unchanged. Both original map snapshots are byte-identical.
- Driving, its camera, planting and street-dressing source files are unchanged.
- All 29 original capture PNGs and both generated download ZIPs are preserved.
- Existing road, tower, building-shell, driving and independent placement
  checks pass. There are no new hidden roofs/walls or blocked openings.
- 35 independent disk-visibility cases agree with the analytic model within
  0.002805, or 0.28 percentage points. At progression 0.63 the model gives 0%
  disk visibility at 2 m and 73.335% at 257.2 m; the roof loses direct sun later.
- 18 complete production shader programs compile and link in native Mesa GLES,
  with active environment, shadow, texture, instancing and custom-hook paths.
  The same shader gate is now required by CI before publication.

Machine-readable preservation evidence is in
[`devon-sunset-preservation-v05.json`](devon-sunset-preservation-v05.json).
Shader methods, images and limitations are in
[`sunset-shader-validation-v05.md`](sunset-shader-validation-v05.md).

## Cost and visual verification

The two representative world submissions add one call each and lose 210
triangles. Geometry/instance buffers decline from 14,956,534 to 14,952,370
bytes. These world profiles exclude atmosphere, shadow and reflection passes.
The new camera-following sky replaces Three's background draw; native profiles
do not measure its runtime shader cost.

The unique BOK atlas adds approximately 2 MiB of texture allocation including
mipmaps. Glass shading and height-dependent sunlight add fragment work. There
are no added real lights. No FPS or device-performance claim is made.

The cloud browser could not create WebGL2 even for unchanged v0.4, confirmed by
one reload. Native images show the exact shared sky and ideal reflected rays
on real Devon glass geometry at fixed exposure. They omit PBR filtering,
nearby city reflection, facade frames and fog; they are explicitly labeled as
diagnostics, not browser screenshots. Final full-scene appearance and driving
still require review in a working WebGL2 browser.

Three live views are available in Settings > Viewpoint:

- `v05-devon-last-sun`: aerial southwest, progress 0.63.
- `v05-devon-afterglow`: identical camera, progress 0.70.
- `v05-reno-reflection`: driver-eye Reno view, progress 0.63.

All hold exposure at 1.08 and disable the crown display. Earlier gallery
photographs remain labeled as archived; no old image is relabeled as v0.5.

Citywide height accuracy remains unfinished: 1,231 v0.4 records used generic
low-rise estimates, and the original GIS layer contains no height attribute.
A later height-extraction or verified-data join must establish real coverage,
dates, ground/roof separation and landmark agreement. Increasing those
buildings randomly would change their appearance without improving accuracy.
