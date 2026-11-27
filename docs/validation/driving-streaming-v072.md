# v0.7.2 driving and camera streaming repair

## Reproduced driving defect

A canvas key handler interrupted tours on each driving key event, including
keyboard repeat. The tour stop function called the scene pause hook even when
there was no active tour; that hook cleared the car velocity. The previous
startup smoke dispatched a short key sequence on `window`, missing the focused
canvas handler and sustained repeat behavior.

The corrected stop function only pauses a playing tour. The canvas handler
ignores repeated keydown events. Stopping an absent or already paused tour no
longer changes manual driving velocity. The vehicle solver and collision hull
are unchanged.

Using the actual built app, packed downtown geometry and metro collision data,
a ten-second held-W sequence with 285 repeat events reproduced **2.015 m** of
travel and **0.207 m/s** final speed. An isolated overlay of the two corrected
handlers produced **216.891 m** and **28 m/s**. This is a negative-control
comparison of application behavior, not a frame-rate benchmark. The release
startup gate now dispatches through the focused canvas and requires more than
150 m of sustained travel. The complete rebuilt v0.7.2 application reproduced
**216.891 m** and **28 m/s**, with 93 actual modules, six packed assets and 16
completed metro tile requests. See [the exact result](startup-v072-result.json).

## Camera and loading changes

`src/metro/view-coverage.js` selects actual frustum coverage from the camera
projection and world transform. It also keeps the car's 3×3 collision
neighborhood. Center-ray ground targets are bounded to the quality range;
fully static downtown cells need no duplicate metro load. Rotation, translation,
zoom, aspect and view-offset changes invalidate the streamed view.

| Quality | Requested tile cap | Resident tile cap | View range |
|---|---:|---:|---:|
| Low | 16 | 24 | 1,400 m |
| Balanced | 40 | 48 | 2,400 m |
| High | 64 | 80 | 3,600 m |

Camera coverage is sampled at most every 120 ms and quantized by pose. The
streamer cancels stale requests, retains recent useful tiles within the cap,
and mounts at most one completed worker result per display frame. Three active
jobs and two geometry workers bound parallel work and queued mesh storage.
A teleport waits for its local collision neighborhood; distant scenery loads
in the background. Initial downtown startup does not wait for metro tiles that
the baked city already covers. Night/layer material updates run only when their
inputs change rather than walking every tile on every frame.

Packed base-city buffers are shared by typed-array views; offline bounds replace
repeated main-thread scans. Streamed meshes carry worker-computed conservative
bounds. Shader warmup uses Three's asynchronous compilation API when available,
and startup no longer repeats local cubemap captures during settings sync.
See [startup CPU evidence](startup-cpu/README.md) for exact-pixel and memory
preservation evidence, and [surface ownership](metro-surface-ownership/README.md)
for the separate geometry/depth repair.

## Verification status

The complete `npm run build` and `npm run check` passed on November 27, 2026.
This includes all 30 metro runtime/coverage/streaming regressions, packed-data
and discovery checks, compiler/atlas ownership validation, preserved downtown
geometry/optics checks, and the rebuilt sustained-input startup gate. The build
keeps all 272,713 building records, 7,799 places, 3,004 metro tiles and original
capture downloads. CI native shader compilation and the public artifact audit
are pending at this pre-publication checkpoint.

Browser DOM/canvas, animation scheduling and GPU renderer/PMREM are adapters in
the built-app harness. It executes actual application modules, decompression,
geometry compilation, mount/collision and driving logic using worker fallback.
It does not establish browser layout, final rendered appearance or device FPS.
Native surface diagnostics and shader compilation have separate scopes. The
managed browser lacks WebGL2; a real-device driving/visual review remains useful.
