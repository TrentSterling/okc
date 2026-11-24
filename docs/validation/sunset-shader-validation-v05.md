# Native sunset shader validation — v0.5

## Result and scope

All **18 actual Three.js r180 shader variants compiled and linked** in a native
Mesa EGL/OpenGL ES context. Two additional diagnostic programs rendered the
project's exact shared sky GLSL and ideal reflection rays on the actual Devon
glass triangles. These are native diagnostic images, **not browser captures or
complete PBR scene renders**.

The machine-readable evidence is
[`sunset-shader-report-v05.json`](sunset-shader-report-v05.json). It records the
driver, source and generated-shader hashes, geometry hash, program feature
flags, custom uniforms, compiler/linker logs, camera positions and panel pixel
summaries. The recorded renderer is Mesa llvmpipe, LLVM 19.1.7, OpenGL ES 3.2,
Mesa 25.0.7. The render is software based; no frame-rate conclusion follows.

## What was compiled

`scripts/visual/prepare-sunset-diagnostics.mjs` imports the pinned
`three@0.180.0` source package and calls its real `WebGLPrograms` and
`WebGLProgram` preparation code. It creates the application's actual materials,
applies their `onBeforeCompile` hooks, chains the surface-height sunlight hook,
resolves Three's shader chunks and captures the resulting vertex/fragment
sources. A native GLES driver then compiles and links those complete programs.

| Program family | Variants per depth mode | Active paths |
| --- | ---: | --- |
| Visible sky | 1 | Actual shared sky shader |
| Devon physical glass | 2 | Regular/instanced, CubeUV environment, height correction, local cubemap, directional sun and shadow, fog |
| Generic glass facade | 2 | Regular/instanced, physical material, all facade maps, room occupancy and height-dependent sunlight |
| BOK facade | 2 | Regular/instanced, physical material, all facade maps, occupied-floor layout and height-dependent sunlight |
| Limestone facade | 2 | Regular/instanced, standard material, all facade maps, room occupancy and height-dependent sunlight |

Each family runs with reversed depth and again with logarithmic depth: nine
programs per mode. Facade maps include color, bump, roughness, metalness and
emissive textures. A CubeUV environment, one directional light with shadow and
one hemisphere light activate the relevant lighting paths. Preparation fails
if a required reflection, occupancy, sunlight or texture path becomes inactive.
Devon's local-cubemap uniforms receive a clearly identified fixture; the
compiler checks that branch, but the fixture supplies no city pixels to the
diagnostic images.

The preparation step mocks canvas drawing only to construct material texture
objects and feature flags. It does not validate painted texture pixels or
browser uniform uploads. Compilation checks GLSL compatibility and hook
composition; it cannot prove that a complete rendered scene looks right.

## Image observations

[`sunset-shader-reflections-v05.webp`](sunset-shader-reflections-v05.webp) uses
465 vertices from the actual Devon glass surfaces. Its two camera positions,
targets and fields of view are reconstructed directly from
`REFLECTION_SHOT_PRESETS`, using the runtime orbit-position formula. Columns
hold those views at sky progress 0.50, 0.63, 0.70 and 0.78, with exposure fixed at
1.08. The same `skyRadiance(direction, height)` function supplies the visible sky
and the ideal reflected ray at each glass fragment.

The panels show warmer western-sky radiance against the cooler visible sky.
The Reno view changes the vertical reflection gradient, with cooler upper
glazing and a warmer lower band; the elevated view reflects the ground below
the observer's height. No facade emission, painted color band or additional
reflection multiplier enters these diagnostic shaders. The bright reflected
band is pale after tone mapping because this diagnostic displays unattenuated
ideal radiance. It does not establish the final PBR material's saturation,
Fresnel response, roughness filtering or full-city contrast.

[`sunset-shader-height-v05.webp`](sunset-shader-height-v05.webp) points toward
the modeled sun at 2 m and 257.2 m above the same level spherical horizon.
The rendered disk is clipped by each observer's horizon. At progress 0.63 the
street disk is fully hidden while approximately 73.3% remains visible at crown
height; at 0.64 the crown retains approximately 33.1%, and at 0.66 both are
hidden. These are model values for an authored altitude sequence, including an
explicit refraction approximation, not a dated/weather-specific prediction.
They establish the implemented height delay separately from the longer-lived
warm twilight reflection.

The images omit the full city, local reflected geometry, facade frames,
PMREM/PBR filtering and fog. The height model assumes a level spherical
horizon; real terrain, intervening buildings and weather require additional
data. Browser execution and the final visual result still require a working
WebGL2 browser.

## Reproduce the compile gate

Requirements: Node 22+, Python 3.10+ standard library, and Ubuntu Mesa/EGL/GLES
runtime packages. No Python image package or browser is needed for this gate.

```bash
npm ci --ignore-scripts
sudo apt-get install --no-install-recommends -y libegl1 libgles2 libegl-mesa0 libgl1-mesa-dri
node scripts/visual/prepare-sunset-diagnostics.mjs --output /tmp/okc-sunset-shaders
LIBGL_ALWAYS_SOFTWARE=1 python3 scripts/visual/check-sunset-gles.py --input /tmp/okc-sunset-shaders --output /tmp/okc-sunset-validation --compile-only
```

The same compile-only command was also run successfully with `python3 -S`,
which excludes site-packages and verifies that NumPy and Pillow are not
required. A missing native runtime produces an explicit dependency error.
Generated shader payloads stay in the temporary output directory; only the
compact report is intended as durable evidence.

For optional diagnostic images, install NumPy and Pillow in a Python virtual
environment and omit `--compile-only`. Image labeling uses DejaVu Sans at
`/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf` (`fonts-dejavu-core` on Ubuntu).
Use `--output docs/validation` to regenerate the checked-in evidence. The
`--three-root` option can select another installed copy of the exact pinned
Three source package; mismatched versions are rejected.
