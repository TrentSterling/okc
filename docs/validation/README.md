# v0.3 validation records

`renderer-budget.json` compares the actual production geometry with source
revision `064b664`, at fixed Reno and Devon cameras. It includes Three.js
frustum culling, material groups, instances and transparent two-sided passes.
It excludes sky, shadows, reflection passes, textures and driver overhead.
These are submission counts and buffer sizes, not GPU timings or FPS.

The final 1024 m batching uses 266 / 255 estimated main-pass draws at these
views, versus 234 / 226 before. Submitted triangles are 606,211 / 608,916,
versus 544,339 / 542,373. The map has 21.1% more building records and 31.0%
more roads, and now includes actual recessed facade openings.

`shader-compile-report.json` records successful compilation and linking of
eight programs / sixteen stages on Mesa OpenGL ES 3.2. Three.js r180's shader
preparation was used for sky, crown display, physical glass and instanced
glass under both reversed and logarithmic depth configurations. This is a
shader compiler check, not a rendered WebGL image comparison.

The browser available during this pass reported its WebGL driver disabled.
The game still requires a browser/device visual and interaction pass. The
gallery retains older captures and clearly labels that distinction.

Reproducible release gates:

```sh
python3 scripts/build-downloads.py
npm run check
```

The gates check static paths and archives, campus surface ownership, crown
closure, road triangulation and UVs, exposed building shells, actual facade
holes, driving/camera collision, and deterministic reconstruction of the
baked buffers. GitHub Actions runs the same gates before publishing, then
compares the public scene modules, geometry and capture downloads to the
release files byte for byte.
