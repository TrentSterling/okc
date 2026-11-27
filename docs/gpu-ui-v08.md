# GPU UI and phone controls, v0.8.0

## Why the interface changed

The pre-change source at `652cf4f9b26457b289d0479e96aaff3bb60f7ea6` positioned the masthead, scene controls, explorer toolbar, fixed panel and map title independently. Phone CSS relied on fixed offsets such as `top:141px; bottom:214px`, and several secondary controls were small touch targets. Many explorer actions replaced the panel's complete `innerHTML`, then restored focus, caret and scroll. Results grew in batches rather than being limited to visible rows.

Input ownership was split among the panel, map and driving surfaces. The map tracked a single drag pointer and lacked pinch gestures. Each nearby 3D label allocated a 512 × 104 canvas, texture, sprite material and sprite; the old limit was 20 labels. The rewrite replaces those concrete costs with shared layout, visible-row lists, one pointer router and a shared glyph atlas. The old map already cached its base drawing; this release makes no claim that it previously repainted all geography every frame or that DOM rendering alone proved an FPS bottleneck.

## Rendering boundaries

The visible game interface is drawn on the scene canvas. `src/ui/gpu-surface.js` batches glyphs, panels, borders, lines and clips into one indexed instanced draw. It uses a licensed offline-baked 1024 × 1024 R8 distance-field atlas with 244 glyphs. The decoded atlas is 1 MiB; the gzip transport is 160,361 bytes. Text layout uses font advances and never asks DOM layout or Canvas2D font APIs to measure or paint the active interface.

The material has depth test/write and tone mapping disabled. UI is drawn after the world; it never enters sky probes, shadows, local reflections or the public photographic capture API. World resolution still follows the existing quality setting. This release does not claim native-device-resolution UI at every quality setting, a world-rendering benchmark, or a conversion of simulation/asset decoding to GPU compute.

The graphics-unavailable atlas fallback paints the same baked glyph masks through Canvas2D. That fallback is deliberately identified as CPU rendering, not a GPU test. Only the canvas host and nonvisual native text/file input bridges remain in the active page. The gallery is an ordinary document. Existing authored scene texture generation is separate from visible interface rendering.

A small original pixel alphabet provides a GPU-rendered Retry screen if the primary font cannot load. Retrying replaces it with the normal SDF atlas. Graphics context loss switches to a replacement 2D canvas and cancels held controls instead of leaving input attached to a lost renderer.

## Module ownership

| Module | Responsibility |
| --- | --- |
| `ui/gpu-surface.js`, `glyphs.js` | Immutable atlas, text layout, GPU buffers and clipping |
| `ui/runtime.js`, `widgets.js` | View composition, focus, menus, scrolling and safe-area layout |
| `ui/input-router.js` | One owner per pointer, hit testing, held controls and cancellation |
| `ui/platform.js` | Hidden text input, IME, file picker, downloads, clipboard and external links |
| `app/interface.js`, `hud-view.js`, `settings-view.js` | Driving HUD and scene settings |
| `app/control-actions.js`, `controls.js` | Shared commands for keyboard, touch and camera gestures |
| `explorer/controller.js` | Search, planner, journals, tours, persistence and corrections |
| `explorer/gpu-*.js` | Explorer views and geographic atlas integration |
| `explorer/map-geometry.worker.js`, `map-batches.js` | Cached map triangles and road instances |
| `metro/poi-markers.js` | Projected place labels in the shared glyph batch |

## Bounded work

The GPU atlas keeps at most seven geographic batches: generic land, parks, water, footprints, and three road classes. Buildings retain supplied correction colors and courtyard holes. Moving the map changes uniforms; it does not rebuild every road or polygon. The geometry worker runs one job at a time, with only the newest queued base and footprint job retained. Close-up tiles keep their existing bounded loader and cancellation rules.

The explorer virtualizes place cards; the focused test uses an 8,000-place catalog without generating every row. Initial/base map preparation is deferred until the atlas opens, and preprocessing yields between small indexing batches. Updated building footprints can still queue geometry while the map is hidden. The 3D place labels no longer allocate separate CanvasTextures per venue. UI buffer capacity grows within a fixed maximum and disposes replaced GPU buffers.

These are implementation/resource bounds. No phone FPS, time-to-interactive improvement percentage, or GPU timing is asserted without hardware measurements.

## Input and phone behavior

Portrait uses a bottom sheet; short landscape uses a side panel. The scene HUD reserves its own bottom region and keeps Menu available in both orientations. Main touch controls are at least 44 CSS pixels. Safe-area insets and `visualViewport` changes are honored. The active editor retains a scroll anchor while a keyboard reduces the visible area, and physical orientation is used when the browser reports it.

Each pointer keeps its owner until release or cancellation. Steering and a pedal can be held independently, while another scene finger controls the camera. Scrolling a sheet never starts a camera or map drag. Two map fingers pan and pinch around their combined midpoint without producing a tap when one lifts. Pointer-up distance checks prevent a drag from becoming a tap. Blur, lost capture, mode switches and modal opening release held controls.

The first manual driving input cancels a guided tour; keyboard repeats and a second held source do not repeatedly pause/reset the car. Tab/Shift+Tab use visible controls in the top active overlay; PageUp/PageDown scroll panels, and Home/End work in focused panels or modals. Editing uses native IME composition while all visible fields and carets are drawn by the UI surface.

## Feature continuity

Search, chains, interests, saved places, journals, source links, planner presets, allowances, stop ordering, tours, layers, learning challenges, building corrections and JSON backup paths remain. Restore now also applies exported categories and preferences. Navigation retains the navigation owner's final error/status message. Clearing a place selection also clears the map highlight, and drawer inset changes keep focused map content in the usable area.

Winter music was never connected to an audio source; the UI now states that it is unavailable instead of presenting an ineffective toggle. Existing saved preference/import formats remain compatible. Road ambience remains in the scene Menu.

## Verification and limits

See [the evidence record](validation/gpu-ui-v08/README.md). The public deployment must pass an independent complete rebuild, all source/geometry/driving checks, actual production shader compilation, and a hash comparison of every published asset. Source-backed recovery checkpoints remain on GitHub. The latest deployed revision is recorded in `release.json`.
