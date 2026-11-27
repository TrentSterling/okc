# v0.8 GPU UI verification

## Tests performed

- The actual built boot/app/import map consumed the compressed glyph atlas, packed city geometry and metro tiles, reached sceneReady, opened/scrolled the GPU Settings interface, exported a setup through its real control, entered free driving through the GPU Drive button, and drove for ten seconds with 285 key-repeat events. Result: **216.891 m**, **28 m/s final speed**, no application errors. The host uses DOM/canvas/RAF and GPU renderer adapters, so this verifies integration and simulation, not browser GPU rendering or FPS.
- Focused tests cover surface layout/Unicode/ellipsis/clips/buffer lifecycle, map holes/colors/worker transfers, virtualized explorer actions, persistence, independent touch ownership, camera pinch, gesture cancellation, phone control bounds, native editor switching and IME composition.
- Native Mesa GLES compiled and linked **eight actual Three-prepared programs**: UI, map polygons, roads and colored footprints under both depth modes. Seven fixture captures include production phone HUD/Settings functions, clipping/glyph samples and the emergency bootstrap font. Glyph contribution and clip/empty-cell assertions pass; logarithmic/reversed UI output has zero differing pixels. See [native report](native-report.json).
- The actual built host's UI buffers were separately rendered at **390 × 844** and **844 × 390**, with synthetic safe areas. They use one UI draw each. These images omit the rendered 3D world and are not photographs from a phone.
- A desktop cloud browser loaded the actual application in 390 × 844 and 844 × 390 iframes. Search for Subway, place details, planner scrolling, zoom and map panning worked; the landscape drawer retained usable height. Browser WebGL2 was unavailable, so these interactions exercised the Canvas2D fallback using baked glyph masks.

## Captures

[Portrait UI](ui-390x844.png) · [Landscape UI](ui-844x390.png) · [Font recovery UI](bootstrap-font.png)

## Reproduction

```sh
npm run build
npm run check
node scripts/check-app-startup.mjs --ui-snapshots qa/ui-host-snapshots
node scripts/visual/prepare-ui-diagnostics.mjs --output qa/ui-native
python3 scripts/visual/render-ui-diagnostics.py --input qa/ui-native --output qa/ui-native/captures
```

Native raster diagnostics require `requirements-visual.txt` plus Mesa EGL/GLES. Font rebaking is optional and has its own documented font/Pillow/NumPy/SciPy requirements; the atlas is checked in, so CI does not generate fonts.

Do not run the full build and full-app startup harness concurrently in a memory-constrained executor. These checks are distinct from physical Android/iPhone testing. No real-phone 3D driving, browser GPU rendering, FPS or thermal/power benchmark is claimed.

## Publication

The complete local build and check chain passed, including 54 focused GPU UI/input/explorer/map tests and the final actual built-app startup/driving check ([report](startup-report.json)). The release candidate is awaiting the independent GitHub Actions rebuild/publication. Record the completed workflow, source revision, Pages revision and full public asset audit here after they succeed.
