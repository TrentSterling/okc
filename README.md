# Prairie Prism

An Oklahoma City atlas, date planner and drivable city for Trent. Geographically grounded reconstruction and exploration prototype, **v0.7.1**.

**Live site:** https://tront.xyz/okc/

**Gallery:** https://tront.xyz/okc/gallery/ · **Repository:** https://github.com/TrentSterling/okc

Static Three.js application with a canvas map fallback. No sign-in or service credentials are required to run it. The 3D scene needs WebGL2; places, the map, the planner and local discoveries remain available without it.

## v0.7: Discover OKC

The original downtown drive and Devon reflection study now sit inside a wider, tiled city atlas spanning Yukon, Bethany, west OKC, downtown, South OKC and Quail Springs. Geographic inputs are saved snapshots, not a live business or navigation service. The generated [`geo/metro/manifest.json`](https://tront.xyz/okc/geo/metro/manifest.json) records the current coverage, source dates and build counts; [`release.json`](https://tront.xyz/okc/release.json) identifies the source revision and deployed file inventory.

The successful v0.7 build contains **272,713 building footprints, 82,114 source road records, 11,592 surfaces and 7,799 places**, including **91 curated places**, across **3,004 metro tiles**. The driving graph contains 57,907 routable ways and 218,875 nodes. These are compiled snapshot counts, not a claim that every building or business in the region has been mapped or independently verified.

- **Find a place.** Search names, addresses, categories and chains; filter mapped restaurants, Subway, sit-down Mexican food, arcades, bowling, bargain shops, aquariums, parks and seasonal outings. Curated venue details include source links and retrieval dates. Imported map records remain distinguishable from reviewed venue information.
- **Build a $200 day for two.** Reorder stops, set times, edit spending allowances and reserves, and export or import an itinerary. The supplied Christmas plan has $187 of stops plus a $13 reserve. Prices and allowances are labeled separately; taxes, tips and unlisted extras need to fit the editable budget. Schedule warnings identify conflicts with the saved 2026 event dates.
- **Explore the same geography.** Switch between the atlas and 3D, inspect linked buildings, follow connected-road routes or start a guided itinerary leg. Pause and resume a tour; changing the itinerary invalidates its old route. The map distinguishes its straight-line itinerary preview from a computed road route.
- **Keep your discoveries.** Favorites, visit status, notes, photo links and building corrections are stored in this browser. JSON backups carry them to another device. No account or cloud synchronization is implied.
- **Try a city challenge.** Pizza delivery, taxi pickup, finding a named place and photo expeditions are simple exploration prototypes. They select real mapped destinations; they are not complete jobs, a traffic simulation or a GTA-style campaign.

Loading is split by responsibility. Atlas assets can load alongside 3D startup; the routing graph loads only when needed. A bounded worker pool fetches, decompresses and compiles nearby 512 m metro tiles, while the scene keeps a limited neighborhood around the car or inspected building. The map caches its static background, clusters overview markers and requests close-up footprints only while visible. Gzip assets have a plain-file fallback, and unavailable workers have a main-thread fallback. These are implemented resource limits, not a measured FPS claim.

The interrupted November 27 workspace was recovered and checkpointed at `11885be` before integration continued. Earlier source and gallery assets were preserved. See [Discover OKC release notes](docs/discovery-v07.md) for module boundaries, data accuracy, recovery and current verification limits.

## Source and build workflow

Editable JavaScript is in `src/`, with focused modules for loading, discovery, the explorer, metro streaming, app controls/cameras/setup, city construction, traffic and landmark geometry. Original static assets and references are in `public/`. The generated `dist/` directory is ignored by Git and rebuilt from the preserved map inputs.

Install the pinned Python compiler with `python -m pip install -r requirements-build.txt`, then run `npm run build` and `npm run check` using Node 22 or newer. Set `OKC_PYTHON` to select your Python interpreter. A failed build preserves the previous `dist/` output. No live map service or npm package download is required for the build.

GitHub Actions validates work branches under `refactor/` and pull requests. Updates to `main` publish the exact validated artifact and compare every deployed runtime module and capture ZIP with that build. The pre-refactor release is retained at `backup/pre-modular-20261124-5c832b1`.

See [Architecture and release process](docs/architecture.md) for module ownership, local development, validation, and recovery. Read [AGENTS.md](AGENTS.md) before automated edits.

## Earlier release: v0.4 — a lived-in city and more physical driving

The city uses warmer masonry, cooler glazing, restrained asphalt repairs, jointed paving, and distinct facade families. Planting has varied canopy silhouettes; a bounded set of parked cars and street furniture gives the main driving area more activity. Added lane markings follow mapped lane counts and one-way flags outside Reno. Props stay within valid surfaces and have separate collision footprints; the original mapped building and ground geometry remains unchanged.

Free driving now keeps world velocity independent of body heading, with front/rear tire grip, yaw inertia and rear-grip handbraking. The car and chase camera share an interpolated simulation pose. The camera contracts immediately at obstructions and extends smoothly after they clear; chassis pitch and roll are visual, leaving the city collision hull and tires level.

Independent named random streams make later visual changes predictable. See [City art direction](docs/city-art-direction.md). The pre-art release is retained at `backup/pre-city-art-20261124-0408b4b`.

## Earlier release: v0.3 — a larger city you can drive

Choose **Drive yourself** to steer freely, or keep the original **Scenic cruise**. The car has acceleration, braking, reverse, a handbrake, building collision and recovery to a nearby road. The chase camera follows the car heading and shortens before solid walls. Touch steering and pedals are available on small/touch screens.

That release's downtown map covered **3.20 × 2.26 km (7.232 km²)**, about **28% more area** than the preceding release. It contained 1,301 source building outlines/parts, 1,710 street segments, 517 land/parking/water polygons and 719 mapped trees. These are historical downtown counts, not the v0.7 metro totals. The original 2.55 km Reno cruise and saved camera links remain available.

### Surface and building repair

The offline compiler resolves buildings as a height envelope. Shorter roofs are cut where taller volumes occupy them; shared and buried walls are removed; equal-height roof areas have one owner. Custom Devon, arena and conservatory volumes exclude duplicate generic buildings. This replaces the earlier cleanup that only handled identical edges and one duplicate footprint.

Street-facing doors and windows are actual openings cut into the wall, with inset glazing, reveals, frames and thresholds. Rooftop equipment is placed on exposed roof regions. Static ground, roofs and walls are triangulated and indexed offline, then partitioned into 1024 m spatial cells. The browser reads finished buffers rather than repeating polygon repair and triangulation.

### Devon accuracy and scale

One world unit is one meter. The city uses a local geographic projection around Devon's mapped footprint. The tower targets the Council on Vertical Urbanism / CTBUH architectural height of **257.2 m**. The model now includes an enclosed crown roof **18.288 m below the tip**, silver inner crown lining, a **36.576 m rotunda**, mapped campus framing, inset balconies and a reconstructed auditorium entrance/bridge.

References include the architect's building description, the structural engineer's dimensions, and architect-provided public auditorium drawings. These are not a full tower construction set. Published story counts differ: architect/engineer descriptions commonly say 50 stories, while CVU counts 52 floors under its methodology. Unmeasured details remain reconstructions. See `dist/geo/devon-architecture-sources.json` for the source register and the distinction between published, mapped and inferred dimensions.

### Rendering cost and depth

Static meshes and repeated trim are grouped spatially so unseen city regions can be culled. High uses 2048-pixel directional shadows, Balanced 1024, and Low disables shadows and the local city reflection probe. Moving shadows refresh at up to 30/20 Hz instead of every display frame; a stationary sun and scene reuse their maps. Main canvas resolution is capped by quality, while photographs render synchronously before download.

The renderer uses reversed depth when `EXT_clip_control` is available and logarithmic depth otherwise. Intentional road-paint and crown-screen biases respect the selected depth direction. Building overlap is addressed by geometry ownership rather than material bias. Settings shows measured FPS after startup; its tooltip reports the current draw calls and triangles. Those are runtime diagnostics, not a hardware benchmark.

## Earlier release: v0.2.1

This pass fixes coplanar geometry before the first GitHub Pages release:

- Unioned street ribbons into a single road surface. Intersections no longer draw several asphalt faces in the same place. Walkways, curbs, parking, grass, and water use explicit surface ownership.
- Rebuilt asphalt UVs from actual vertex positions. Both edges of a road now have distinct texture coordinates, removing the stretched streaks caused by collapsed width UVs.
- Clipped shared Devon podium and rotunda walls at neighboring roof heights, preserving the exposed upper walls. Removed a nearly zero-width mapped podium fragment and its frame geometry.
- Removed a redundant Oklahoma Tower volume and hidden shared walls in the surrounding city.
- Moved the crown display slightly farther off the glazing, kept its narrow decal bias, and tightened camera depth ranges. The geometry fixes remain the primary remedy.
- Kept road and parking paint in a dedicated decal pass after opaque surfaces, with depth testing enabled and depth writes disabled. Cars still occlude the markings.

The surface compiler runs offline; the shipped app needs no GIS library or map-service request. After changing map inputs, rebuild with `npm run build:map` (Python requires Shapely 2.1.2). The generated surface audit is in `dist/geo/surface-audit.json`.

## Earlier release: v0.2

The city is rebuilt around a saved geographic dataset rather than randomly placed city blocks. The local origin is the mapped Devon tower footprint at longitude **-97.5175898538**, latitude **35.4668874508**; +X is east and +Z is south, in meters. Reno is now a roughly 2.55 km at-grade corridor following mapped centerline geometry. The drivable approximation uses two through lanes each way.

The map snapshot includes 1,074 building outlines/parts, 1,305 street segments, 384 land/parking/water polygons, and 569 mapped trees, with additional illustrative planting inside Myriad Gardens. Major skyline heights use recorded tags or a skyline reference. Missing heights remain explicitly labeled estimates in the source dataset. The Devon mesh, crown, podium, and rotunda are rebuilt from the mapped campus/tower plans and architectural photographs.

Directional shadows are enabled. The facade combines the infinite HDR sky with a separate, box-projected local city cubemap. Daylight at the start of the timeline makes it easier to judge the scene without a dramatic sunset. Fixed viewpoints are available in Settings, and the gallery preserves the earlier captures for comparison. The gardens include a mapped carousel canopy and a conservatory with glazed ends and interior planting. Night offices use filtered groups of windows, the crown display has a continuous white light wash, and the photographed Reno approach has bounded local light sources with approximate distant light pools.

This is a **mapped visual reconstruction in progress**. It does not claim surveyed terrain, construction-model accuracy, a solved photographic camera, measured glazing, live weather, or a live data connection.

## Try this first

1. Open **Explore OKC**, switch to **Map**, and search for a restaurant, park or familiar street. Pan and zoom to see the relationship between neighborhoods.
2. Select a place to inspect its address, source details and map position, then add it to **Our date**.
3. Adjust the itinerary's times, costs and reserve. Check any date warnings before using the plan for a real outing.
4. On a WebGL2 device, use **Explore in 3D** or start an itinerary tour. Pause to look around, then resume the same leg.
5. Open **Layers** to change place categories, season, simulated weather and rendering quality. Use **Back up discoveries** to preserve your local journal and corrections.

For the original Devon reflection study:

1. Start with **Daylight** to inspect the rebuilt geometry, then select **Afterglow** with the crown screen switched off.
2. Choose **Drive yourself** and use W/S and A/D, or press **Start cruise** for the guided route.
3. Leave the sunset paused. Watch how the facade changes as the car moves.
4. Open **Settings** and scrub **Position along the drive** to compare angles quickly.
5. Switch to **Orbit**. Drag to circle the tower and use the wheel to move closer.
6. Move **Rendering style** from Physical toward Illustrated, then adjust roughness.
7. Try **Neutral light test**. The colored reflection disappears because its source was the environment.
8. Select **Night** and enable the **Crown screen** to see the separate emissive display.
9. Enable **Legends Tower** to compare an imagined future skyline. It is explicitly labeled proposed.

**Photo** exports the canvas without the interface. **Save setup / Load setup** round-trip camera, sunset, material, and driving settings as a small JSON file. Loading a setup leaves sound off until the user enables it.

## Capture gallery

Open **Gallery** in the scene header or visit `https://tront.xyz/okc/gallery/`. The preserved v0.2 reconstruction pass contains ten interface-free 1600 × 900 PNGs: four matching street-height Reno lighting states, a south-side daylight tower study, a campus overview, the western skyline, a crown detail, an eastbound driver view, and the opening chase view. The gallery also retains all 19 earlier captures.

All **29 preserved captures are historical**, not a new v0.7 visual validation set. Filter by reconstruction pass or earlier work, enlarge a capture, browse with the arrow keys, or compare any two images side by side. **Open this view**, where available, restores the saved camera and lighting in the current scene; changed geometry can make the result differ from the original photograph. Earlier prototype captures retain their original pixels and are not presented as replays of the changed world. The two historical capture packs have separate ZIP downloads.

### Capture provenance and reproduction

`dist/capture-presets.js` defines fixed views, complete render states, camera values, and simulation time. The app supports `?view=<preset-id>` and exports `captureView(id, width, height)` plus `finishCaptures()`. Captures pause time and traffic, preserve the requested aspect ratio, and omit the interface.

The PNGs are rendered by the actual Three.js application. Loading the public scene does not start capture jobs. The Photo control saves the current canvas. `captureView` and `finishCaptures` expose deterministic photographs for a renderer-enabled development environment. `scripts/build-downloads.py` builds the two portable capture ZIPs from the checked-in original images and manifest.

`dist/gallery/shots.json` records the source build, capture date, dimensions, and scene settings. Thumbnails are separate WebP files; enlarged views and downloads use the original PNGs.

## Controls

| Control | Action |
|---|---|
| W / S or arrow keys | Throttle / brake, then reverse in free mode |
| A / D | Steer freely; switch lanes in scenic mode |
| Space | Handbrake in free mode; start/pause scenic cruise |
| F | Switch between free driving and scenic cruise |
| C | Cycle Chase, Driver, Orbit |
| Mouse or touch drag | Look around; orbit in Orbit mode |
| Mouse wheel | Orbit distance |
| Double-click scene | Reset road-view look direction |
| T | Play or pause the sunset |
| N | Neutral environment diagnostic |
| H | Hide or restore controls |
| R | Recover to a clear mapped road in free mode; reset scenic drive |
| M | Toggle synthesized road ambience |
| Escape | Close panels and restore controls |

Driving and time of day are independent. Reversing direction does not move the sun. Scenic cruise is a bounded stretch; free driving explores the larger map and stops at its coverage boundary. In the focused map canvas, arrows pan, +/− zoom and Home fits the map; dragging, the wheel and visible zoom buttons also work. Explorer text fields and planner inputs do not trigger driving controls.

## What is implemented

- A mapped, approximately 2.55 km at-grade Reno Avenue corridor with sidewalks, intersections, and simplified lane behavior.
- Traffic in both directions with fixed lane speeds and even headways.
- A player sedan, three camera modes, optional free steering with building collision, reverse, handbrake and recovery, plus scenic cruise.
- A reconstructed Devon Tower with mapped footprint orientation, recessed corners, faceted broad faces, curtain-wall framing, crown lanterns, podium, and rotunda.
- Procedural HDR sky, sunset/cloud colors, stars, a sun disc, direct sun, sky fill, and distance haze.
- PBR reflections with a metalized-glazing approximation; an adjustable illustrated treatment.
- Daylight, golden hour, afterglow, blue hour, and night presets; continuous time scrubbing.
- Approximate Legends Tower massing as an optional, clearly labeled proposed skyline.
- Adjustable render resolution, roughness, exposure, traffic motion, sound, neutral lighting, canvas photos, and setup import/export.
- A searchable atlas, browser-local date planner and journal, building inspection/corrections, connected-road routing and guided tour controls.
- Nearby metro tile streaming with bounded worker compilation, level-of-detail choices, tile eviction and collision cleanup.
- Seasonal decoration and weather presets, plus simple destination-based exploration challenges.

## Rendering model

The sky is authored as directional **linear HDR radiance**. Its shared radiance model supplies the visible sky and the cached Three.js PMREM environment used for roughness-dependent image-based lighting. A height-dependent horizon correction lets the camera and facade sample the appropriate sky above a spherical Earth. The expensive environment capture is refreshed when the sky changes.

Facade reflections come from the surface normal and the direction to the camera. Different positions, heights, and faces sample different parts of the sky. The warm/cool pattern is not painted in facade UVs. The western cloud shelf is part of that same environment, so its reflected position responds to movement.

The facade uses a metallic-coating approximation rather than pretending uncoated window glass would have the required reflectivity. Its parameters are art-directed, not measured optical data for Devon's curtain wall. The illustrated control quantizes and shades the reflected result; it does not replace the reflection with a fixed gradient.

The crown display is separate emissive geometry. Turning it off removes the screen and spine strips. Neutral mode removes the colored environment, direct sun, facade room emission, and screen emission.

Color flow is linear HDR capture, PBR lighting, ACES tone mapping, then sRGB display output. The visible solar disc belongs to the shared sky shader and is clipped by its height-aware horizon. Its small bright disc is excluded from the PMREM capture to avoid an unstable undersampled reflection; direct sunlight supplies its shadowed specular contribution.

Earth-curvature horizon dip, partial solar-disc visibility and an explicit approximate atmospheric-refraction correction are implemented in `src/atmosphere/`. Higher surfaces can retain sunlight after lower ones. The slider still follows an authored solar-altitude sequence: it is not a location/date ephemeris, a measured atmosphere or a prediction of real sunset time.

### Local city reflections

The infinite sky remains a directional environment. A separate 256-pixel HDR cubemap captures surrounding city geometry from within the Devon volume, with the tower and screen hidden. The cube is transparent where it sees no geometry. A ray/box intersection corrects the local lookup for the facade point, and geometry coverage blends it over the infinite-sky radiance. Filtered RGB is divided by coverage before blending to avoid dark silhouette fringes.

One box approximates city depth, so this is not ray tracing and cannot reproduce every nearby occlusion exactly. The local probe updates when the environment changes, with throttling during continuous sky playback. It does not rerender for every camera movement. Balanced uses a 128-pixel cubemap; Low disables the local probe. Neutral mode disables the local probe as well as colored sky lighting.

## Geographic sources

- Building footprints: City of Oklahoma City data shared through Esri Community Maps. The snapshot's source-edit date is October 3, 2022.
- Streets, tower parts, named buildings, park/water/parking polygons, and trees: © OpenStreetMap contributors, under ODbL.
- Principal skyline heights: mapped tags and the Council on Tall Buildings and Urban Habitat city listing. Untagged context heights are estimates.
- Devon architecture and crown: supplied photographs, Pickard Chilton, Thornton Tomasetti, and the crown lighting manufacturer's project description.

See `dist/geo/provenance.json` for the downtown source register, and `dist/geo/metro/manifest.json` for the wider metro coverage, counts and provenance. Compressed map snapshots are checked in under `scripts/data/`; the build regenerates the downtown buffers and metro tiles offline. There is no runtime map service dependency. The map attribution is visible in the scene.

Metro footprints combine the preserved municipal and OpenStreetMap inputs. Buildings retain source identifiers; height, roof and facade inference remain explicit approximations. A procedural gable inferred for an unmeasured residential footprint is not evidence of its actual roof. Curated businesses carry source URLs and retrieval dates, while imported businesses have not all been reviewed with their operators. Some positions are interpolated along a street or placed at a shopping center, not a confirmed storefront or entrance. Opening hours, prices, event dates and road access can change after the saved snapshot.

## Project structure

| Source or generated output | Responsibility |
|---|---|
| `src/boot.js`, `src/loading/` | WebGL capability fallback, startup stages, compressed asset fetching, cancellation and parsing worker |
| `src/discovery.js`, `src/discovery/` | Explorer/scene composition, map footprint loading, navigation, tour and challenge state |
| `src/explorer/` | Catalog queries, canvas map, spatial index, planner, views, schedule warnings and local persistence |
| `src/metro/` | Bounded tile workers, mesh/roof compilation, scene mounting, routing, road lookup and seasonal actors |
| `src/app.js`, `src/app/` | Scene and frame loop, camera, controls, renderer, audio, setup files, photos and discovery bridge |
| `src/sky.js`, `src/atmosphere/` | Shared HDR sky, Earth-horizon/solar geometry, PMREM, reflected glass and surface-height sunlight |
| `src/tower.js`, `src/tower/` | Devon geometry, independent crown display and conceptual Legends Tower |
| `src/world.js`, `src/world/` | Downtown city, streets, landmarks, park, vehicles and traffic instancing |
| `src/capture-presets.js`, `public/gallery/` | Repeatable views and the preserved historical gallery assets |
| `public/` | HTML/CSS, vendor files, licenses and geographic reference contracts |
| `scripts/data/` | Preserved compressed source snapshots; no live import is needed for a normal build |
| `scripts/build-city-data.py`, `scripts/build-world-surfaces.py` | Downtown map compilation and surface ownership |
| `scripts/build-metro.py`, `scripts/metro_geometry.py`, `scripts/metro_output.py` | Offline metro preparation, geometry repair, road graph, tiles and provenance |
| `scripts/build.mjs`, `scripts/write-release.mjs` | Staged build, generated asset inventory and source revision |
| `dist/geo/metro/` | Generated manifest, overview, places, lazy road graph and 512 m tiles |
| `dist/`, `.github/workflows/pages.yml` | Disposable runnable output and validation/publication workflow |

There is no runtime CDN dependency, external asset API or account database. The scene ships as static files generated from checked-in geographic inputs. Downtown geometry is baked offline; metro tiles are prepared offline and turned into nearby render meshes by workers at runtime. Deployment builds the downloadable historical screenshot archives and validates the generated data. Textures and sounds are generated locally in the browser. Supplied reference photos are not included in the deployment.

GitHub Pages publishes the root of `gh-pages`. Each push to `main` rebuilds the two capture ZIPs, runs the static and geometry checks, and commits the complete `dist/` output to that publishing branch. The workflow explicitly requests GitHub's native Pages build and checks the public scene, gallery, and both downloadable archives against the source bytes. Source and map inputs stay on `main`; the publishing branch contains the runnable site.

## Run locally

Serve `dist/` with any static HTTP server. For example, from the project root:

```sh
python3 -m http.server 8080 --directory dist
```

Then open `http://localhost:8080`. ES modules require HTTP; opening `index.html` directly as a file is not supported. Use a browser with WebGL2 and working graphics acceleration for 3D. The atlas and planner provide a map-only path when WebGL2 is unavailable.

Run `python3 scripts/build-downloads.py` to generate both gallery downloads before serving locally. Three.js is pinned in `package-lock.json`; the deployed runtime uses the checked-in vendor files. No npm installation is required just to serve the site.

## Verification and limits

Build first, then run the checked-in release gate:

```sh
npm run build
npm run check
```

`package.json` is the complete command list. The gate covers source/build safety, packaging, downtown geometry, driving, sunset optics, metro compiler/runtime behavior, planner/catalog/map logic, compressed loading and navigation cancellation. `npm run check:explorer` and `npm run check:metro` run the corresponding focused subsets after a build. The loading regression suite can be run with `node src/loading/assets.test.mjs`.

The tower checker constructs the production Three.js meshes and verifies zero coplanar campus wall overlaps, no duplicate beam instances, finite vertices/normals, and three independent crown displays. The world checker constructs the production ground meshes, compares triangle coverage with the compiled polygons, checks excluded areas, and samples 5,950 lane positions against the road. These are geometry and packaging checks, not a substitute for a GPU interaction test.

Earlier development passes also executed 33 control/state checks against the production modules with real Three.js geometry and canvas textures. That development harness substituted browser services and the GPU renderer; it was not a browser-layout test and is not included as a release gate.

Earlier shader audits assembled the actual Three.js 0.180 shader prefixes/includes and compiled eight vertex/fragment stages offline. Historical hosted captures rendered the production scene and materials of their recorded revisions. Independent visual reviews identified an incorrect crown silhouette, exaggerated unknown building heights, two invalid capture views, a discontinuous reflected horizon, and noisy night lighting. Those findings drove the reconstruction and corrective passes. They do not establish the current release's browser-rendered appearance.

The managed browser used during v0.7 integration reports WebGL2 unavailable. Its atlas and planner screenshots can show browser UI behavior, but cannot validate 3D materials, shadows, scenery or GPU performance. Geometry, shader, worker and controller checks are separate evidence. All 29 gallery PNGs are older GPU captures. No v0.7 hardware FPS benchmark or complete browser 3D interaction pass is claimed. Settings reports diagnostics on the device running the game; driving, touch controls, audio, fullscreen and photo downloads still need a renderer-enabled real-device pass.

This is a **mapped city, planning and arcade-driving prototype**, not a surveyed digital twin or a complete open-world game. Static building collision and free steering are implemented. There is no suspension, wheel-ground physics, damage or traffic AI; decorative traffic is noncollidable. Terrain remains broadly flat, with simplified road bridge/layer offsets rather than surveyed elevation. Unrecorded heights, roofs, facade details, road widths, turn pockets and traffic signal behavior remain approximations. Legends is conceptual massing. Connected-road routing honors mapped one-way directions but does not claim complete turn restrictions, current closures, live traffic or exact entrance access. Use a live navigation service for actual travel.

Season and weather controls simulate a scene; they do not report current conditions. Business data is a dated snapshot. Budget allowances are editable estimates, and published prices may omit tax, tips or other costs. The planner warns against known saved-schedule conflicts, but it does not verify that every stop is open on an arbitrary date. Browser-local discoveries and corrections need exported backups if you want them to survive clearing site data or moving devices.

## Focused route to 1.0

- [ ] Benchmark the deployed version on Trent's desktop and at least one ordinary laptop; tune quality against measured frame times.
- [ ] Complete a real-browser pass for every control, mobile layout, fullscreen, audio, and photo/setup downloads.
- [ ] Calibrate one outstanding west-to-east hero view against reference photos; finish the most visible Devon crown and facade details.
- [ ] Replace the closest procedural car/tree shapes with authored low-poly assets if the visual target needs them.
- [x] Add optional arcade free driving while retaining scenic cruise.
- [ ] Evaluate traffic interaction and stronger vehicle handling through playtesting.
- [x] Add a separate local city reflection probe with box projection.
- [ ] Validate its depth/occlusion approximation against multiple real street-level photographs.
- [x] Implement a shared height-dependent Earth horizon and partial solar-disc visibility.
- [ ] Add a location/date solar ephemeris if the optics experiment becomes the main product.
- [ ] Run the final friend playtest on the public GitHub Pages deployment.

## References

- Geographic building footprints: https://services6.arcgis.com/Do88DoK2xjTUCXd1/ArcGIS/rest/services/Oklahoma_City_OK_Buildings/FeatureServer/0
- OpenStreetMap attribution and license: https://www.openstreetmap.org/copyright
- Skyline heights: https://www.skyscrapercenter.com/city/oklahoma-city
- Devon architecture: https://www.pickardchilton.com/work/devon-energy-center
- Devon height: https://www.skyscrapercenter.com/building/devon-energy-center/623/
- Devon structural dimensions: https://www.thorntontomasetti.com/project/devon-energy-center
- Architect-provided auditorium drawings: https://www.archdaily.com/892684/devon-auditorium-pickard-chilton
- Crown lighting: https://nanoltg.com/portfolio-items/devon-energy-center/
- Legends proposal: https://okcboardwalk.com/tower/
- Three.js physical material: https://threejs.org/docs/#api/en/materials/MeshPhysicalMaterial
- PMREM: https://threejs.org/docs/#api/en/extras/PMREMGenerator
- Color management: https://threejs.org/manual/en/color-management.html
- Local vs infinite environment mapping: https://seblagarde.wordpress.com/2012/09/29/image-based-lighting-approaches-and-parallax-corrected-cubemap/

Third-party runtime license: `dist/vendor/THREE-LICENSE.txt`.

## GitHub Pages deployment

Pushes to `main` run `.github/workflows/pages.yml`: validate the static assets, build the two gallery ZIPs, and publish `dist/` to GitHub Pages. The repository publishes the `gh-pages` branch; the workflow requests the native Pages build after updating that branch. It inherits `tront.xyz` from the owner website and therefore has no repository-specific `CNAME`. The intended base URL is `https://tront.xyz/okc/`. Runtime imports, gallery assets, and view links are relative so the same build also works under another subdirectory.

The gallery manifests retain the capture source revisions and dates. A live scene may have newer geometry fixes than a saved photograph. Geographic attribution and source licenses are included in `dist/geo/NOTICE.txt`; the vendored Three.js license is in `dist/vendor/`.
