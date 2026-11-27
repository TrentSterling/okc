# Discover OKC 0.7

## Release scope

Prairie Prism keeps the downtown scene, Devon reflected-sky study, driving model, capture presets and original gallery. The wider atlas reaches from Yukon to downtown and from South OKC to Quail Springs, including Bethany, Lake Overholser, Lake Hefner, Reno, NW 23rd and Route 66. Metro geography is delivered in 512 m tiles generated from preserved source snapshots.

The November 27 recovery restored the existing project and uncommitted v0.7 work before integration continued. Commit `11885be` is the recovery checkpoint. The earlier pre-discovery source remains at `75b1502b1bdf965bac032220b07742689d3d59b2`, saved remotely as `backup/pre-discovery-20261127`; ignored `qa/baseline-dist` is only a local comparison copy. Original geographic inputs and the 29 gallery captures remain preserved.

The successful v0.7 build reports:

| Compiled data | Count |
|---|---:|
| Building footprints | 272,713 |
| Source road records | 82,114 |
| Routable ways | 57,907 |
| Road-graph nodes | 218,875 |
| Land, water and other source surfaces | 11,592 |
| Places | 7,799 |
| Curated places within that total | 91 |
| Metro tiles | 3,004 |

The catalog includes 33 Subway entries, 41 Mexican restaurant entries, 32 discount-shop entries and 23 thrift entries. These counts describe the saved inputs and classification, not exhaustive business coverage or live operating status. `dist/geo/metro/manifest.json` is the source of build counts and coverage. `dist/release.json` records the source revision and SHA-256 inventory of the complete static deployment. The full inventory includes plain and compressed geography, historical capture archives and other assets; it is not a startup download budget.

## What the explorer does

Discovery searches mapped businesses and reviewed curated places by name, address, category and chain. Category, indoor, favorites and saved-place filters work together. The default interest collection includes dining, entertainment, bargain shopping, aquariums, parks and seasonal outings. A restaurant can retain its food category while also appearing in the Christmas layer. Businesses and buildings remain separate records, linked only when the source supports that relationship.

The canvas atlas works without WebGL2. It provides pan/zoom, overview clustering, place selection, itinerary previews, computed road routes, category layers and close-up building footprints. Its map keyboard controls apply when the canvas is focused; editing search, journal or planner fields does not drive the car. Building inspection and browser-local corrections are available from the map as well as the scene.

The planner starts with a $200 budget for two. Its supplied eight-stop Christmas itinerary totals **$187 plus a $13 reserve**. Users can change the date, times, order, costs and reserve, choose different places, and import or export plans. Published two-person/shared prices are used where present; remaining amounts are labeled planning allowances. Taxes, tips, parking, travel and unlisted extras need room in the editable budget. Date warnings use the saved 2026 venue/event information and identify known date, weekday and time conflicts. They do not perform a live opening-hours check or certify arbitrary dates.

The Christmas preset uses the curated Hatch Automobile Alley and downtown Bricktown Brewery records. Loading an untouched canonical older default repairs those branch links; edited adventures and custom addresses are preserved. All presets remain selectable, and stop time/cost/reorder controls wrap on narrow phones.

Favorites, visit status, notes, photo links, itinerary and building corrections stay in browser-local storage. Backups export this state as JSON. Import validates the supported fields, and imported custom stops retain separate identifiers. Photo links are references, not uploaded image files. There is no login, cloud account or automatic cross-device synchronization.

Guided tours operate one itinerary leg at a time, with previous/next, pause and resume controls. A retained route is resumed only for the same leg and unchanged itinerary while the car remains near that path. Changing the plan cancels its old route; a completed leg is marked arrived. Asynchronous route requests and scene navigation carry request guards so an older result cannot replace a newer selection. A map itinerary line is explicitly a straight-line preview until a connected-road route is available.

Pizza delivery, taxi pickup, named-place finding and photo expeditions are **destination-based prototypes**. A challenge selects a mapped target and recognizes arrival nearby. It does not yet implement a job economy, passenger simulation, complete mission chains, interiors, a wanted system or traffic AI. Continue returns to the current challenge rather than resuming an unrelated tour.

## Module boundaries and loading

| Module | Responsibility |
|---|---|
| `src/boot.js` | Capability checks, early map availability, concurrent discovery/3D startup and map fallback after scene failure |
| `src/loading/assets.js` | Shared fetch, timeout, cancellation, progress, gzip detection and plain-file fallback |
| `src/loading/asset-client.js`, `asset-worker.js` | Asset worker lifecycle and main-thread fallback when a worker cannot run |
| `src/loading/progress.js` | Named startup stages and actual byte progress |
| `src/discovery.js` | Compose the explorer, catalog, scene bridge and navigation; apply saved correction overlays |
| `src/discovery/map-tiles.js` | Visible-map footprint requests, bounded cache and cancellation |
| `src/discovery/navigation.js` | Destination routing, tour lifecycle, stale-request guards and exploration challenges |
| `src/explorer/catalog.js`, `catalog-query.js` | Normalized source records, primary categories and cached search/filter results |
| `src/explorer/map.js`, `map-base.js`, `spatial-index.js` | Interactive overlays, cached base geography and bounded spatial queries |
| `src/explorer/planner.js`, `planner-view.js`, `planning-warnings.js` | Itinerary/budget logic, planner UI and saved-schedule checks |
| `src/explorer/persistence.js` | Validated local settings, discoveries, plans and building corrections |
| `src/metro/streaming.js` | Nearby tile selection, detail upgrades, cancellation, collision readiness and eviction |
| `src/metro/geometry-jobs.js`, `mesh-worker.js` | Bounded worker execution for tile fetch, parsing and mesh compilation |
| `src/metro/mesh-builder.js`, `roof-shapes.js`, `tile-scene.js` | Mesh buffers, procedural roof interpretation and Three.js/collision ownership |
| `src/metro/router-client.js`, `router-worker.js`, `road-router.js` | Lazy road graph and shared connected-road routing implementation |
| `src/app/discovery-bridge.js` | Scene navigation, building focus, tour movement, layers and weather integration |
| `scripts/build-metro.py`, `metro_geometry.py`, `metro_output.py` | Offline source preparation, geometry repair, tile/graph output and provenance |

The overview, place catalog and manifest can load in parallel. The road graph is deferred until routing is needed. Asset workers handle fetch/decompression/parsing where available; compressed bytes are detected so a server's automatic content decoding does not cause a second gzip decode. Timeouts and worker failures have explicit paths rather than leaving the loading screen pending forever. Workers are an optimization, not a requirement to use the atlas.

The 3D streamer uses one or two geometry workers according to reported hardware concurrency, with at most three active streamer jobs. High, Balanced and Low request neighborhoods with tile radii of three, two and one; a small outer margin prevents immediate eviction at a tile boundary. Near tiles may receive more detail, distant work is cancelled, and evicted tiles release geometry and collision registrations. Destination navigation waits for the surrounding collision tiles before placing the car. The inspected building can become the streaming focus while orbiting it.

The atlas uses a separate two-request footprint queue, at most 48 wanted close-up tiles and a 64-tile cache. Hiding the map, zooming out or disabling its buildings layer cancels unnecessary footprint requests. Cached geography is drawn separately from moving car and route overlays, and overview place markers are clustered. Long polygons remain eligible for spatial queries instead of being lost outside a single grid cell.

These limits bound concurrent work and retained data. They do not establish a frame-rate result. Startup still needs the overview/catalog, the first road request downloads the route graph, and a browser falling back from workers can perform parsing or mesh work on its main thread. The full metro is not loaded into the 3D scene at once.

## Geographic accuracy and source policy

Mapped footprints retain source IDs. The importer records source URLs, dates, licenses and counts, with the original compressed snapshots kept in `scripts/data/`. Municipal footprints, OpenStreetMap road/business data and curated venue facts have different coverage and verification levels. A reviewed venue record does not make every nearby imported record verified.

Measured/tagged heights and roof data are distinguished from inference. Supported simple roofs include mapped gabled, hipped, pyramidal and skillion forms; some unmeasured residential footprints receive an explicitly inferred gable. Complex footprints may use a simpler flat roof. Generic windows, facade color, decorative props and roof equipment are procedural approximations. Browser-local corrections change the exploration model; they do not update an upstream map or become independently verified facts.

Coordinates can also be approximate. In the current curated input, Ollie's Yukon location uses Census street-range interpolation, while its NW Expressway location uses the landlord's shopping-center location. Neither should be presented as a surveyed storefront or entrance. Inspect the source and coordinate notes before treating any place marker as a precise access point.

Routing follows connected source road nodes and mapped one-way directions. It does not claim complete turn restrictions, live closures, traffic, actual drive times or correct entrance access for every place. Disconnected or incomplete map data can prevent a route. Use a live navigation service for real trips; the game uses the geography for exploration and learning.

Terrain is broadly flat with simplified bridge/layer offsets, not a surveyed elevation model. Seasonal decorations and clear/snow/fog/wet presets are simulations, not a live weather feed or a survey of real holiday installations. Saved venue prices, hours and 2026 event dates can change.

The existing Devon optics already implement spherical-Earth horizon dip, partial solar-disc visibility, approximate refraction and shared height-dependent sky/direct-light behavior. The authored sunset slider is not a date/location solar ephemeris or a measured atmospheric model. The facade remains an optical approximation, and the separate proposed Legends Tower remains conceptual massing.

## Validation and evidence

Use the pinned Python compiler from `requirements-build.txt`, Node 22 or newer and the regular staged build:

```sh
npm run build
npm run check
```

The build preserves the previous `dist/` if a compiler fails. `npm run check` is the release gate defined in `package.json`; it includes source/build safety, packaging, downtown geometry and driving, sunset optics, metro compilation/runtime, planner and catalog behavior, map spatial/canvas behavior, compressed asset loading, and discovery navigation. Focused regression suites cover cancellation, worker fallback, failed/retained map-tile requests, changed-itinerary invalidation, pause/resume, arrival and stale route completion.

The managed browser available for v0.7 integration lacks WebGL2. Its map/planner interaction checks cannot establish the 3D scene's appearance, GPU rendering, driving feel or FPS. Native geometry or GLES shader checks are separate evidence and must be labeled that way. No measured v0.7 hardware FPS or complete browser 3D validation is claimed. Touch driving, audio, fullscreen and photo downloads still require a renderer-enabled real-device pass.

The gallery retains ten v0.2 reconstruction captures and nineteen earlier images, all historical. They are not new v0.7 captures. Saved view links may restore their camera/lighting against changed geometry; original pixels and manifest provenance remain unchanged. New matched 3D captures should be produced only in a renderer-enabled environment and record the actual revision and render settings.

## Publishing and recovery

The user authorized direct commits to `main` without PRs. Recoverable checkpoints preserve work; the final release uses the existing validation and GitHub Pages workflow. The workflow must finish successfully, and the public artifact must match the tested build, before publication is reported complete.

Source, geographic inputs and authored capture assets belong on `main`. Generated `dist/` remains ignored and is published to `gh-pages`; never use a generated deployment edit as the only copy of a fix. `release.json` supplies a revision and complete file/hash inventory for live verification. Preserve the pre-discovery and pre-modular backups and the recovered checkpoint for comparison or rollback.
