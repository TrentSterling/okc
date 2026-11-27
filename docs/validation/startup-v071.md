# 3D startup and driving repair: v0.7.1

## Report and root cause

On November 27, 2026, the user's real-device test showed a working atlas with
the message "The 3D scene could not start" and no usable driving mode. The
WebGL2 preflight had succeeded; scene initialization failed afterward.

The deployed streamer is `/okc/metro/streaming.js`. Its tile URL construction
used `../../geo/metro/`, producing `/geo/metro/tiles/…` outside the project
directory. Both gzip and plain JSON requests used that incorrect prefix.
Initial `metro.ensure()` rejected, which rejected the discovery bridge and
caused `sceneReady` to return false. The fallback then hid the detailed error.

The repair uses the correct `../` relative depth for both supported manifest
path conventions. Startup errors now retain their message in the visible
atlas fallback instead of disappearing behind a generic status.

## Evidence and required regression gates

The actual-streamer regression in `src/metro/runtime.test.mjs` evaluates the
production module with browser-style `import.meta.url` semantics at
`https://tront.xyz/okc/metro/streaming.js`. It exercises initial `ensure()` and
checks compressed and plain URLs for both supported manifest formats. It
failed on the original path and passed after the correction. All 12 metro
runtime cases passed after the fix.

An independent audit resolved 6,024 constructed asset paths. No second path
escape was found in atlas tiles, routing, startup assets or worker URLs. The
85-module app graph and all three worker graphs linked successfully, while
574 packed runtime geometry buffers matched their canonical source.

`npm run check:startup` executes the actual built boot/app modules, HTML import
map, packed assets, world and atmosphere construction, discovery bridge,
tile decoding, geometry compilation and mounting. Its fetch adapter maps the
deployment subpath to the build directory and rejects every escaped URL.
The original build failed through that full startup path on the exact wrong
gzip URL and its plain fallback. The corrected run must reach `sceneReady`,
mount streamed geometry, enter free drive through its actual UI control, and
move the collision-aware car under throttle with finite state and no errors.
This check is now a required part of `npm run check` and therefore publication.

The corrected full build and complete `npm run check` passed locally. The
startup gate loaded 89 application modules, consumed all six packed startup
assets, requested 11 nearby tiles, reached `sceneReady`, and entered free drive
through the real control. The car advanced 3.126 meters under throttle with
finite state and no captured errors. The original build failed the same
harness on the escaped gzip URL and its plain fallback before reaching drive.

The harness uses synthetic browser DOM/canvas, animation scheduling and GPU
renderer/PMREM adapters, plus the production worker fallback. It does not
claim actual browser layout, shader execution, pixels or measured FPS.

## Why the previous release gate missed it

The prior successful public audit verified that every published file matched
the validated artifact. It did not execute scene startup or verify dynamically
constructed tile requests. The supplied cloud browser could not create WebGL2
and therefore exercised only the atlas path. Existing streaming tests supplied
a compiler stub that did not reject URLs outside the application's subpath.

The new subpath regression and actual built-app startup gate cover that gap.
Public hash verification remains required and unchanged.

## Publication status

The corrected full offline build and complete local validation passed. The
final GitHub validation/publication/public-asset audit is still pending;
inspect `HANDOFF.md` for the final source revision and workflow result.
