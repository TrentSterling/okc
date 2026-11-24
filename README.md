# Prairie Prism

An Oklahoma City sunset drive for Trent. Geographically grounded reconstruction, v0.2.1.

**Live site:** https://tront.xyz/okc/

**Gallery:** https://tront.xyz/okc/gallery/ · **Repository:** https://github.com/TrentSterling/okc

Static Three.js application. No sign-in or service credentials are required to run it.

## What changed in v0.2.1

This pass fixes coplanar geometry before the first GitHub Pages release:

- Unioned street ribbons into a single road surface. Intersections no longer draw several asphalt faces in the same place. Walkways, curbs, parking, grass, and water use explicit surface ownership.
- Rebuilt asphalt UVs from actual vertex positions. Both edges of a road now have distinct texture coordinates, removing the stretched streaks caused by collapsed width UVs.
- Clipped shared Devon podium and rotunda walls at neighboring roof heights, preserving the exposed upper walls. Removed a nearly zero-width mapped podium fragment and its frame geometry.
- Removed a redundant Oklahoma Tower volume and hidden shared walls in the surrounding city.
- Moved the crown display slightly farther off the glazing, kept its narrow decal bias, and tightened camera depth ranges. The geometry fixes remain the primary remedy.
- Kept road and parking paint in a dedicated decal pass after opaque surfaces, with depth testing enabled and depth writes disabled. Cars still occlude the markings.

The surface compiler runs offline; the shipped app needs no GIS library or map-service request. Rebuild it with `python3 scripts/build-world-surfaces.py` after changing `dist/city-data.js` (requires Shapely 2.1.2). The generated surface audit is in `dist/geo/surface-audit.json`.

## What changed in v0.2

The city is rebuilt around a saved geographic dataset rather than randomly placed city blocks. The local origin is the mapped Devon tower footprint at longitude **-97.5175898538**, latitude **35.4668874508**; +X is east and +Z is south, in meters. Reno is now a roughly 2.55 km at-grade corridor following mapped centerline geometry. The drivable approximation uses two through lanes each way.

The map snapshot includes 1,074 building outlines/parts, 1,305 street segments, 384 land/parking/water polygons, and 569 mapped trees, with additional illustrative planting inside Myriad Gardens. Major skyline heights use recorded tags or a skyline reference. Missing heights remain explicitly labeled estimates in the source dataset. The Devon mesh, crown, podium, and rotunda are rebuilt from the mapped campus/tower plans and architectural photographs.

Directional shadows are enabled. The facade combines the infinite HDR sky with a separate, box-projected local city cubemap. Daylight at the start of the timeline makes it easier to judge the scene without a dramatic sunset. Fixed viewpoints are available in Settings, and the gallery preserves the earlier captures for comparison. The gardens include a mapped carousel canopy and a conservatory with glazed ends and interior planting. Night offices use filtered groups of windows, the crown display has a continuous white light wash, and the photographed Reno approach has bounded local light sources with approximate distant light pools.

This is a **mapped visual reconstruction in progress**. It does not claim surveyed terrain, construction-model accuracy, a solved photographic camera, measured glazing, live weather, or a live data connection.

## Try this first

1. Start with **Daylight** to inspect the rebuilt geometry, then select **Afterglow** with the crown screen switched off.
2. Press **Start driving** or Space to cruise toward Devon.
3. Leave the sunset paused. Watch how the facade changes as the car moves.
4. Open **Settings** and scrub **Position along the drive** to compare angles quickly.
5. Switch to **Orbit**. Drag to circle the tower and use the wheel to move closer.
6. Move **Rendering style** from Physical toward Illustrated, then adjust roughness.
7. Try **Neutral light test**. The colored reflection disappears because its source was the environment.
8. Select **Night** and enable the **Crown screen** to see the separate emissive display.
9. Enable **Legends Tower** to compare an imagined future skyline. It is explicitly labeled proposed.

**Photo** exports the canvas without the interface. **Save setup / Load setup** round-trip camera, sunset, material, and driving settings as a small JSON file. Loading a setup leaves sound off until the user enables it.

## Capture gallery

Open **Gallery** in the scene header or visit `https://tront.xyz/okc/gallery/`. The new reconstruction pass adds ten interface-free 1600 × 900 PNGs: four matching street-height Reno lighting states, a south-side daylight tower study, a campus overview, the western skyline, a crown detail, an eastbound driver view, and the opening chase view. The gallery also retains all 19 earlier captures.

Filter by reconstruction pass or earlier work, enlarge a capture, browse with the arrow keys, or compare any two images side by side. **Open this view** restores a current capture's camera and lighting. Earlier prototype captures retain their original pixels and are no longer presented as replays of the changed world. Current and earlier capture packs have separate ZIP downloads so both remain manageable.

### Capture provenance and reproduction

`dist/capture-presets.js` defines fixed views, complete render states, camera values, and simulation time. The app supports `?view=<preset-id>` and exports `captureView(id, width, height)` plus `finishCaptures()`. Captures pause time and traffic, preserve the requested aspect ratio, and omit the interface.

The PNGs are rendered by the actual Three.js application. Loading the public scene does not start capture jobs. The Photo control saves the current canvas. `captureView` and `finishCaptures` expose deterministic photographs for a renderer-enabled development environment. `scripts/build-downloads.py` builds the two portable capture ZIPs from the checked-in original images and manifest.

`dist/gallery/shots.json` records the source build, capture date, dimensions, and scene settings. Thumbnails are separate WebP files; enlarged views and downloads use the original PNGs.

## Controls

| Control | Action |
|---|---|
| W / S | Throttle / brake |
| A / D | Move between lanes |
| Space | Start or pause cruise, unless a focused control owns Space |
| C | Cycle Chase, Driver, Orbit |
| Mouse or touch drag | Look around; orbit in Orbit mode |
| Mouse wheel | Orbit distance |
| Double-click scene | Reset road-view look direction |
| T | Play or pause the sunset |
| N | Neutral environment diagnostic |
| H | Hide or restore controls |
| R | Reset the drive |
| M | Toggle synthesized road ambience |
| Escape | Close panels and restore controls |

Driving and time of day are independent. Reversing direction does not move the sun. The road is a bounded stretch; the car stops at either end so the user can turn around.

## What is implemented

- A mapped, approximately 2.55 km at-grade Reno Avenue corridor with sidewalks, intersections, and simplified lane behavior.
- Traffic in both directions with fixed lane speeds and even headways.
- A player sedan, three camera modes, cruise, manual throttle/brake, and lane changes.
- A reconstructed Devon Tower with mapped footprint orientation, recessed corners, faceted broad faces, curtain-wall framing, crown lanterns, podium, and rotunda.
- Procedural HDR sky, sunset/cloud colors, stars, a sun disc, direct sun, sky fill, and distance haze.
- PBR reflections with a metalized-glazing approximation; an adjustable illustrated treatment.
- Daylight, golden hour, afterglow, blue hour, and night presets; continuous time scrubbing.
- Approximate Legends Tower massing as an optional, clearly labeled proposed skyline.
- Adjustable render resolution, roughness, exposure, traffic motion, sound, neutral lighting, canvas photos, and setup import/export.

## Rendering model

The sky is authored as directional **linear HDR radiance**. It is captured into a Three.js PMREM texture, which provides roughness-dependent filtered image-based lighting. The visible background uses the same cached environment, so the source sky and facade reflections agree. The expensive procedural cloud calculation runs when the sky changes, rather than across the screen every frame.

Facade reflections come from the surface normal and the direction to the camera. Different positions, heights, and faces sample different parts of the sky. The warm/cool pattern is not painted in facade UVs. The western cloud shelf is part of that same environment, so its reflected position responds to movement.

The facade uses a metallic-coating approximation rather than pretending uncoated window glass would have the required reflectivity. Its parameters are art-directed, not measured optical data for Devon's curtain wall. The illustrated control quantizes and shades the reflected result; it does not replace the reflection with a fixed gradient.

The crown display is separate emissive geometry. Turning it off removes the screen and spine strips. Neutral mode removes the colored environment, direct sun, facade room emission, and screen emission.

Color flow is linear HDR capture, PBR lighting, ACES tone mapping, then sRGB display output. The sun disc is displayed separately; the small solar disc is excluded from the PMREM capture to avoid an unstable undersampled reflection.

### Local city reflections

The infinite sky remains a directional environment. A separate 256-pixel HDR cubemap captures surrounding city geometry from within the Devon volume, with the tower and screen hidden. The cube is transparent where it sees no geometry. A ray/box intersection corrects the local lookup for the facade point, and geometry coverage blends it over the infinite-sky radiance. Filtered RGB is divided by coverage before blending to avoid dark silhouette fringes.

One box approximates city depth, so this is not ray tracing and cannot reproduce every nearby occlusion exactly. The local probe updates when the environment changes, with throttling during continuous sky playback. It does not rerender for every camera movement. Lower quality uses a 128-pixel cubemap. Neutral mode disables the local probe as well as colored sky lighting.

## Geographic sources

- Building footprints: City of Oklahoma City data shared through Esri Community Maps. The snapshot's source-edit date is October 3, 2022.
- Streets, tower parts, named buildings, park/water/parking polygons, and trees: © OpenStreetMap contributors, under ODbL.
- Principal skyline heights: mapped tags and the Council on Tall Buildings and Urban Habitat city listing. Untagged context heights are estimates.
- Devon architecture and crown: supplied photographs, Pickard Chilton, Thornton Tomasetti, and the crown lighting manufacturer's project description.

See `dist/geo/provenance.json` for URLs, bounds, dates, coordinate system, and limitations. Compressed map snapshots are checked in under `scripts/data/`; `scripts/build-city-data.py` regenerates `dist/city-data.js`. There is no runtime map service dependency. The map attribution is visible in the scene.

## Project structure

| File | Responsibility |
|---|---|
| `dist/app.js` | Scene assembly, state, camera, input, frame loop, import/export, audio |
| `dist/sky.js` | HDR sky, cached PMREM environment, lighting, facade material |
| `dist/tower.js` | Devon geometry, independent display, conceptual Legends Tower |
| `dist/world.js` | Mapped streets, city footprints, landmarks, park, vehicles, traffic instancing |
| `dist/city-data.js` | Compiled geographic snapshot with height provenance |
| `dist/world-surfaces.js` | Generated, non-overlapping ground surface polygons |
| `scripts/build-world-surfaces.py` | Rebuilds surface ownership from the map snapshot |
| `dist/geo/provenance.json` | Geographic sources, attribution, coordinate origin, and limitations |
| `dist/index.html` | Accessible controls and panels |
| `dist/style.css` | Responsive interface and presentation |
| `dist/capture-presets.js` | Repeatable camera and lighting presets for the gallery |
| `dist/gallery/` | Static capture gallery, original PNGs, thumbnails, and bulk download |
| `dist/vendor/` | Vendored Three.js 0.180.0 ES modules and MIT license |
| `.github/workflows/pages.yml` | GitHub Pages deployment from `dist/` |
| `scripts/build-downloads.py` | Builds both downloadable capture archives |

There is no runtime CDN dependency, asset API, or account database. The scene ships as static files; deployment builds only the downloadable screenshot archives. Textures and sounds are generated locally in the browser. Supplied reference photos are not included in the deployment.

## Run locally

Serve `dist/` with any static HTTP server. For example, from the project root:

```sh
python3 -m http.server 8080 --directory dist
```

Then open `http://localhost:8080`. ES modules require HTTP; opening `index.html` directly as a file is not supported. Use a browser with WebGL2 and working graphics acceleration.

Run `python3 scripts/build-downloads.py` to generate both gallery downloads before serving locally. Three.js is pinned in `package-lock.json`; the deployed runtime uses the checked-in vendor files. No npm installation is required just to serve the site.

## Verification and limits

The checked-in validation commands are:

```sh
python3 scripts/build-downloads.py
node scripts/check-static.mjs
node scripts/check-tower-surfaces.mjs
node scripts/check-world-surfaces.mjs
```

The tower checker constructs the production Three.js meshes and verifies zero coplanar campus wall overlaps, no duplicate beam instances, finite vertices/normals, and three independent crown displays. The world checker constructs the production ground meshes, compares triangle coverage with the compiled polygons, checks excluded areas, and samples 5,950 lane positions against the road. These are geometry and packaging checks, not a substitute for a GPU interaction test.

Earlier development passes also executed 33 control/state checks against the production modules with real Three.js geometry and canvas textures. That development harness substituted browser services and the GPU renderer; it was not a browser-layout test and is not included as a release gate.

The shader audit assembles the actual Three.js 0.180 shader prefixes/includes and compiles eight vertex/fragment stages offline. Hosted Site captures render the actual production scene and materials. Independent visual reviews identified an incorrect crown silhouette, exaggerated unknown building heights, two invalid capture views, a discontinuous reflected horizon, and noisy night lighting. These findings drove the reconstruction and corrective passes. The reviewers still distinguish landmark recognition from full architectural and streetscape fidelity.

The interactive preview browser available during development could not create a WebGL context; actual GPU rendering is verified through hosted captures. Consequently, there is no honest hardware FPS benchmark or complete end-to-end GPU interaction claim. FPS is measured after initial scene/shader setup and is available in Settings; quality controls reduce render resolution. Audio, fullscreen, download transport, and touch behavior need a real-device pass.

This is a **scenic driving and reflection prototype**. Steering follows lanes; there are no collisions, suspension, wheel-ground physics, damage, or traffic AI. Building footprints and street placement now use map data. Terrain is flattened; unrecorded heights, facade details, road widths, turn pockets, and traffic signal behavior remain approximations. Legends is conceptual massing. The sky is authored, not calculated from a date, geographic solar ephemeris, measured atmosphere, or spectral glass simulation. The higher-tower/later-sunset effect from Earth curvature is not modeled yet.

## Focused route to 1.0

- [ ] Benchmark the deployed version on Trent's desktop and at least one ordinary laptop; tune quality against measured frame times.
- [ ] Complete a real-browser pass for every control, mobile layout, fullscreen, audio, and photo/setup downloads.
- [ ] Calibrate one outstanding west-to-east hero view against reference photos; finish the most visible Devon crown and facade details.
- [ ] Replace the closest procedural car/tree shapes with authored low-poly assets if the visual target needs them.
- [ ] Decide whether 1.0 is a relaxing guided drive or a vehicle game. Add driving physics only if it serves that decision.
- [x] Add a separate local city reflection probe with box projection.
- [ ] Validate its depth/occlusion approximation against multiple real street-level photographs.
- [ ] Add a location/date sun path and horizon-height demonstration if the optics experiment becomes the main product.
- [ ] Run the final friend playtest on the public GitHub Pages deployment.

## References

- Geographic building footprints: https://services6.arcgis.com/Do88DoK2xjTUCXd1/ArcGIS/rest/services/Oklahoma_City_OK_Buildings/FeatureServer/0
- OpenStreetMap attribution and license: https://www.openstreetmap.org/copyright
- Skyline heights: https://www.skyscrapercenter.com/city/oklahoma-city
- Devon architecture: https://www.pickardchilton.com/work/devon-energy-center
- Devon height: https://www.skyscrapercenter.com/building/devon-energy-center/623/
- Crown lighting: https://nanoltg.com/portfolio-items/devon-energy-center/
- Legends proposal: https://okcboardwalk.com/tower/
- Three.js physical material: https://threejs.org/docs/#api/en/materials/MeshPhysicalMaterial
- PMREM: https://threejs.org/docs/#api/en/extras/PMREMGenerator
- Color management: https://threejs.org/manual/en/color-management.html
- Local vs infinite environment mapping: https://seblagarde.wordpress.com/2012/09/29/image-based-lighting-approaches-and-parallax-corrected-cubemap/

Third-party runtime license: `dist/vendor/THREE-LICENSE.txt`.

## GitHub Pages deployment

Pushes to `main` run `.github/workflows/pages.yml`: validate the static assets, build the two gallery ZIPs, and publish `dist/` to GitHub Pages. The repository uses Pages with GitHub Actions as its source. It inherits `tront.xyz` from the owner website and therefore has no repository-specific `CNAME`. The intended base URL is `https://tront.xyz/okc/`. Runtime imports, gallery assets, and view links are relative so the same build also works under another subdirectory.

The gallery manifests retain the capture source revisions and dates. A live scene may have newer geometry fixes than a saved photograph. Geographic attribution and source licenses are included in `dist/geo/NOTICE.txt`; the vendored Three.js license is in `dist/vendor/`.
