# Local GPU handoff: street depth validation

## Current status

The v0.8.2 investigation reproduced a concrete depth-state mismatch in the actual Three r180 reset path. Reflection and capture resets now restore reversed/ordinary mode and far clear depth explicitly. The shared paint material also removes a measured slope-bias occluder leak. See `HANDOFF.md` for current publication status and `docs/validation/depth-reset-v082/README.md` for controlled evidence.

A full-scene sweep on Trent's local GPU remains unverified. The source/native repair must not be represented as a local-browser visual signoff. The baseline identifiers and initial investigation notes below describe v0.8.1 and are preserved for comparison.

Repository: https://github.com/TrentSterling/okc
Live application: https://tront.xyz/okc/
v0.8.1 runtime source: `3d246e8894cda844f030c7e614df6eac3828488a`
v0.8.1 Pages revision: `857f594c18c433b2e955391f253aa15f7d9881aa`
Source/docs head before this handoff: `86785600a136a8bef167a13264d0974061590b32`
Release backup: `backup/paint-depth-v081-validated-20261127`

Read `AGENTS.md`, `HANDOFF.md`, `docs/architecture.md`, and `docs/validation/paint-depth-v081.md`. Preserve the working driving, streaming, GPU UI, phone controls, skyline and capture systems. Keep changes modular and preserve backups.

## What was actually verified

The v0.8.1 offline compiler uses cell-local constrained Delaunay triangles for road/parking surfaces. This fixed native missing-paint pixels attributable to long, thin asphalt triangles. Downtown and metro paints also share a depth-tested, non-depth-writing, after-opaque material factory.

The native paint gate passes 48 cases, but its preparation script explicitly:
- Selects paint only within x[-1500,1100], z[180,420] and y>=0.1.
- Includes only baked `ground.road` chunks, selected downtown paint and one box occluder.
- Excludes parking paint and streamed metro geometry/materials from this render test.
- Substitutes 1x1 white textures and diagnostic emission colors.
- Uses empty light lists and disables shadow maps.
- Uses eight fixed camera views in Mesa GLES, without a complete browser frame, continuous camera movement or the user's GPU/driver/backend.

The separate geometry audit covers more paint, including parking, but geometry separation alone does not validate the complete rendered image. Passing geometry/native checks must not be used to dismiss the reported flicker.

The cloud browser used for the earlier work could not create WebGL2. The prior agent did not observe the remaining artifact in Trent's actual browser. The later v0.8.2 work identifies the reset-state defect and reproduces its missing markings in native rendering; any additional local-browser artifact still requires its own evidence.

## Remaining local verification: compare the actual visible failure

1. Use the normal hardware-accelerated browser on Trent's local machine. Record the real GPU/backend; do not assume a fresh headless browser reproduces the same rendering path.
2. Confirm the loaded release once, then reproduce the exact offending spot. Save a short slow camera sweep and a stationary image at the worst angle. Use Menu > Save setup to preserve camera/car/lighting state.
3. Record browser version, viewport and DPR, camera mode/near/far/FOV, and the active depth path. The renderer writes the latter to the scene canvas's `dataset.depthMode`. It selects reversed depth when `EXT_clip_control` is present, otherwise logarithmic depth.
4. Keep the camera and scene state fixed. Compare live shadows on/off as a single-variable diagnostic. Do not use a whole quality preset for this comparison, since it changes other rendering features. Shadows are an untested possibility, not an established cause.
5. Isolate relevant draw groups one at a time: paint, baked road/parking, streamed metro ground, curbs/ramps, then other overlapping scenery. Record which switch changes the exact artifact.
6. Capture the failing browser frame with a WebGL capture tool such as the Spector.js extension. Inspect the offending draw calls, framebuffer, depth function/write mask, polygon offset, blending, culling, shader defines, vertex/instance transforms and geometry ownership. Identify the competing draws or the responsible shading pass.

Useful primary tool reference: https://github.com/BabylonJS/Spector.js/blob/master/documentation/extension.md
Spector's optional MCP server uses a separate headless Chromium session by default; verify its backend and visible reproduction before treating it as equivalent to the failing tab: https://github.com/BabylonJS/Spector.js/blob/master/mcp/README.md

## Source entry points

- `src/app/renderer.js`: context creation, reversed/logarithmic depth selection and offset signs.
- `src/world/paint-material.js`: shared marking material state.
- `src/world/materials.js`, `src/metro/materials.js`: actual surface materials.
- `src/world/streets.js`, `src/world/road-markings.js`: downtown paint generation.
- `scripts/build-world-surfaces.py`, `scripts/ground_triangulation.py`, `scripts/bake-ground-surfaces.mjs`, `scripts/bake-world-geometry.mjs`: offline footprints and baked ground.
- `src/metro/`: streamed geometry ownership, tile mounting and runtime materials.
- `src/app/setup.js`, `src/app/camera.js`, `src/app/captures.js`: reproducible view state.
- `scripts/visual/prepare-paint-depth-diagnostics.mjs`: exact limits of the native regression.

## Implementation and acceptance

Work in a recoverable branch. Build from source using the documented Node/Python requirements; generated `dist/` is ignored and must not be the only place a fix exists. Serve the application over HTTP and preserve the deployment subpath while testing.

Choose a correction after identifying the actual draw/geometry/shader cause. Depth offset sign handling already exists. A larger arbitrary paint lift or disabled depth testing is not evidence of a correct fix.

Required acceptance evidence:
- Same exact camera/state shows the defect before the change and its removal afterward in the actual browser.
- Slow camera movement and driving through the affected location remain stable.
- Cars and solid scenery still occlude markings correctly.
- Check the actual affected surface owners, including parking or streamed tiles if implicated.
- Run the appropriate existing checks and add a regression that reproduces the newly observed failure.
- Retain the before/after capture, saved setup, GPU/depth mode, source revision, cause and measured costs.

Keep live publication tied to the repository's existing validation/deployment workflow. Prior authorization remains direct to main with recoverable backups and no PR noise. Do not call the user's visual issue fixed solely because the old 48-case native gate passes.
