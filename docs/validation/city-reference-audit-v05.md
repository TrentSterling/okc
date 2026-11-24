# City reference audit for the Devon sunset correction

Audit date: November 24, 2026. OKC source baseline: `86d755224793319cc48ae276af084267f9a8baf9` (v0.4). This document records source inspection and the supplied photographic target. It does not claim that the corrected release has passed browser visual review, or that donor features have all been implemented.

## Finding

The previous material pass did not address the main optical target: Devon reflecting a warm part of the western sky while the sky behind it is cooler and darker. More texture variation and handling work cannot substitute for that behavior. The user's references also expose separate city problems: repeated window patterns, weak facade identity, simplified massing, and insufficient information about most building heights.

Cityworks is a particularly relevant missed reference. It already integrates an attributed adaptation of Slop New York's facade system, including metric bays, joined wall domains, and view-dependent room interiors. Tinyrise and ASCIICITY provide additional examples of deliberate facade structure and stable variation. These are concrete existing projects, not hypothetical inspiration.

## Inspected references

| Project | Inspected source | Relevant implementation |
| --- | --- | --- |
| [Slop New York](https://github.com/mrdoob/slop-newyork/tree/7fdf054aa7a8b1c005983a855fb3b308f2d9a948) | `7fdf054aa7a8b1c005983a855fb3b308f2d9a948` | `js/buildings.js`, `building-footprints.js`, `building-details.js`, `tsl-materials.js`, `lighting.js`, `post-processing.js` |
| [Cityworks](https://github.com/TrentSterling/cityworks/tree/d79bf43c7da182028a66abcafef473f2d19c3cc9) | `d79bf43c7da182028a66abcafef473f2d19c3cc9` | `src/facade-rules.js`, `experiments/three-island-integration/adapted-nyc/`, `ADAPTER_CHANGES.md`, and `docs/PROVENANCE.md` |
| [Tinyrise](https://github.com/TrentSterling/tinyrise/tree/481a99cd116ae35cb5d9c02643fe7a8c0eebbbc4) | `481a99cd116ae35cb5d9c02643fe7a8c0eebbbc4` | `index.html`: `makeArchitecture`, `refGlazing`, `refGlass`, `refConcrete` |
| [ASCIICITY](https://github.com/TrentSterling/asciicity/tree/59dd9dabb858303fd2e4d4d784f35b12afeafcee) | `59dd9dabb858303fd2e4d4d784f35b12afeafcee` | `src/buildings.js`, `textures.js`, `facade-palette.js`, and `interiors/` |

The Cityworks district evidence image and Tinyrise's existing `og-image.png` were also inspected. Those are donor repository images, not newly captured OKC screenshots. Metroforge was located through the authorized GitHub account, and its repository tree confirmed the separate surface/urban building modules; its rendering implementation was not audited in this pass. Cityworks documentation additionally names Building 008. No claim is made that every generator in the user's collection was reviewed.

## What the source comparison shows

### 1. Facades need architectural rules, not only texture families

Slop New York's `facadeCoordinates` combines wall width, wall treatment, floor height, orientation, and stable wall seed. It fits whole bays, marks partial floors, handles roofs and solid returns separately, and carries a consistent basis into window and room calculations. `evaluateApartmentInterior` uses rooms spanning two or three window bays, with partitions behind mullions and detail filtered as rooms become small on screen. These are world-scale relationships.

Cityworks takes this further for generated buildings. Its original `src/facade-rules.js` defines full-bay eligibility, complete opening rows, solid narrow returns, and shared domains across adjacent coplanar edges. Its facade adapter adds a tangent and domain seed so doors, brick courses, room rays, and signs remain coherent. Its storefront plan aligns a primary shop with an actual entrance instead of decorating every bay independently.

OKC v0.4 chooses generic masonry families with `abs(id) % 4` in `scripts/bake-world-geometry.mjs`. Its high-rise UV tile spans 14.4 by 49 metres. `src/world/facade-textures.js` paints fourteen floors and six or eight columns into one tile per family, including the occupancy pattern. Consequently, several repetitions of the same lit-room arrangement can appear up a tall facade and across multiple buildings. The map provides geographical placement, but it does not make these generic treatments building-specific.

Useful bounded change: keep the existing geometry and batch layout where possible; derive stable room occupancy from actual floor and wall coordinates, use one glazing mask for all material outputs, and give prominent mapped buildings referenced facade proportions. Merely multiplying the existing random emission map by another noise field would retain its repeating dark/light structure.

### 2. Readable depth comes from consistent openings and material response

Tinyrise's `refGlazing` places panes behind frames and returns; `makeArchitecture` distinguishes ground floors, structural bands, glass bays, brick openings, and service cores. Its `refGlass` computes a view-dependent sky reflection plus a restrained interior contribution. These geometric and shading relationships explain more of its architectural clarity than additional surface noise would. Its dimensions belong to a stylized building toy and should not be copied as real OKC measurements.

ASCIICITY supplies stable per-building facade offsets, palette families, shoulders, roof caps, and explicit podium interiors. Its bright, largely unlit facade presentation is intentional for its ASCII output and is not an appropriate physical glass model for Devon. The transferable lesson is deliberate identity and scale, not its particular colors or lighting shortcut.

For OKC, preserve the existing real low-rise openings and their collision contracts. Improve prominent high-rise identities and materials without placing painted apertures over actual wall holes or filling openings with opaque facade detail.

### 3. Light transport and atmosphere must be evaluated separately

Slop New York uses directional time-of-day lighting, environment response, street/interior lighting, and optional post processing. Its WebGPU/TSL implementation is not a drop-in replacement for OKC's pinned Three.js r180 WebGL renderer. Cityworks explicitly documents that it does not include the full New York application's night lighting, reflections, traffic, and post processing.

For the Devon target, the shared atmosphere, surface normal, reflection direction, and height-dependent horizon are the relevant components. A warm facade emission pattern, a building-fixed gradient, arbitrary saturation, or bloom would not establish the requested phenomenon. The user's photos show a warm band on lower or middle portions of the glass as well as cooler upper reflections; a simple rule that brightens the top of the tower would also fail the reference.

## Height-data audit

The saved `scripts/data/okc-buildings-source.geojson.gz` contains **1,457 source features**. Every feature has only `OBJECTID`, `building`, and `source` properties. There is no unused height or ground-elevation attribute to activate.

The primary [Oklahoma City / Esri building layer](https://services6.arcgis.com/Do88DoK2xjTUCXd1/ArcGIS/rest/services/Oklahoma_City_OK_Buildings/FeatureServer/0) confirms those same three fields and `HasZ: false`. The layer describes preprocessed footprints shared by Oklahoma City through Esri Community Maps; its data edit date is October 3, 2022. Geographic outlines from that layer do not supply accurate roof heights, current building massing, or facade design.

The generated v0.4 `CITY_DATA.buildings` had the following recorded height provenance. Devon itself is authored separately and is not in this count.

| Recorded height source | Records |
| --- | ---: |
| Estimated low-rise context height | 1,231 |
| OSM floors multiplied by estimated floor pitch | 56 |
| Skyline height reference | 10 |
| Explicit OSM height | 2 |
| Estimated garden service structure | 1 |
| Estimated carousel canopy | 1 |
| Total | 1,301 |

Thus about **94.6%** of the building records use the generic low-rise context rule. In `scripts/build-city-data.py`, missing heights become 6.0, 5.8, or 8.0 metres according to use/location. That explains part of the flat background massing. Giving those records random taller values would produce variety but would not improve factual accuracy.

This count describes provenance labels, not independent validation of each match. The separate skyline audit found that one OSM BOK tower record had been assigned to two older GIS polygons. A reference height is only useful when it belongs to the correct geometry; source matching therefore also needs review.

### Credible next sources for measured height work

- [OK Maps lidar catalogue](https://okmaps.org/OGI/search.aspx?searchstring=LiDAR) lists first-return and bare-earth NRCS products and the D18 Oklahoma/Cleveland acquisition. It is a useful primary route to regional elevation data; exact current tile coverage, acquisition date, datum, and reuse terms still need to be checked for the selected downtown extent.
- [USGS The National Map](https://apps.nationalmap.gov/downloader/) provides elevation source lidar as LAS/LAZ. A building-height pipeline would need roof/ground separation, footprint joins, and quality checks against known landmark heights. A bare-earth DEM by itself does not supply roof heights.
- [FEMA USA Structures](https://gis-fema.hub.arcgis.com/pages/usa-structures) is a further candidate for attributed structure data. This audit did not establish non-null height coverage for downtown OKC, so it must not be treated as a ready replacement dataset.
- The regional [2025 ACOG imagery and lidar procurement](https://www.acogok.org/wp-content/uploads/2024/11/COAGA-2025-Request-for-Proposals-Due-December-30-2024.pdf) describes planned Oklahoma City planimetric/elevation products. A procurement document is not evidence that a particular finished public dataset is available.

There is a tractable path to better heights, but it is a data integration task rather than a missed material setting. A correction pass can safely fix verified landmark mismatches now while retaining the provenance and uncertainty of unmeasured context. An eventual lidar import should be a separate recoverable checkpoint with raw source preservation and an explicit join/quality report.

## Priorities for the current correction

1. Make the shared sky and Devon reflection respond correctly to direction, view, and height, with tower emission disabled for the optical study.
2. Correct identifiable skyline data/geometry mismatches using the saved mapped records and primary architecture references.
3. Replace repeated high-rise occupancy patterns with stable world-scale room/floor variation, preserving glazing masks and draw batching.
4. Give the immediately adjacent prominent towers their own referenced floor spacing, frame rhythm, and crown/lobby distinction.
5. Review matched views at fixed sky and exposure before claiming an appearance improvement. Geometry checks and source inspection cannot establish the final rendered image.
6. Treat citywide measured heights, terrain, and detailed facade reconstruction as explicit follow-up data work; preserve current source and accurately label estimates.

## Licensing and reuse boundaries

Slop New York code is MIT; its geodata has separate source terms. Cityworks retains the full MIT notices for its declared adaptations and has not selected a project-wide license for original code. Tinyrise declares MIT. ASCIICITY was inspected for patterns, not copied. This audit copies no donor shader, geographic data, or image into OKC. Any later code adaptation must preserve the actual applicable copyright/license notice and identify its source pin. A wholesale renderer migration is neither necessary nor justified by this audit.
