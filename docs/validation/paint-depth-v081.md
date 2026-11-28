# Road paint depth repair, v0.8.1

## Reproduced defect

The v0.8.0 road bake contains badly conditioned triangles along nearly collinear road boundaries. One failing triangle is approximately 242 m long and only 0.03 m wide at its end; other failing road triangles span a 1,024 m mesh cell with widths of only 0.047–0.07 m. They came from the surface polygon's Earcut triangulation and subsequent cell clipping.

The actual Float32 geometry does not put downtown paint on the asphalt plane: 14,391 paint instances retain 11.9999945–12.0000020 mm clearance over their complete owned road or parking surface. A separate packed-buffer audit found no duplicate ground beneath paint, no paint escaping its owner, and no significant inter-paint overlap. Tiny shared yellow-line endpoint contacts remain below the existing 0.0001 m² tolerance.

Native rendering nevertheless rejected paint fragments over the long, thin road triangles. Exact ray/triangle calculations put the road 0.016–0.069 view-metres behind the affected paint samples. The incorrect rejection is a rasterized-depth error, not an elevated road surface legitimately covering paint.

The earlier native offset-sign test used a simple color shader and a float depth attachment. It never exercised Three's production logarithmic-depth fragment write. OpenGL's [fragment shader specification, issue 10](https://registry.khronos.org/OpenGL/extensions/ARB/ARB_fragment_shader.txt) explains that replacing fragment depth also replaces the rasterizer's polygon offset. A diagnostic bias sweep did not reliably solve this case: four logarithmic depth units changed nothing, and even 256 units left missing paint. Those shader experiments are not part of the production repair.

## Controlled geometry comparison

The diagnostic retains actual Three.js 0.180 MeshStandard programs, original road vertex buffers and chunk origins, Float32 paint instance matrices, and the game camera projection conventions. It changes emissive uniforms to identify road, paint and occluder coverage. Authored texture appearance, lighting/shadow appearance, browser presentation and performance are outside its scope.

It compares normal road-plus-paint rendering with paint-only coverage, checks reversed road submission order, and places a ground-touching vehicle-sized occluder over paint. The 48 cases cover eight camera views, single-sample and verified four-sample attachments, and logarithmic 24-bit, reversed 24-bit and reversed 32-bit depth.

| Controlled result | Original road triangulation | Cell-local constrained Delaunay candidate |
| --- | ---: | ---: |
| Cases with missing paint | 6 / 48 | 0 / 48 |
| Missing paint pixels summed across cases | 22 | 0 |
| Occluder leaks | 0 | 0 |
| Draw-order changed pixels | 0 | 0 |

This A/B comparison replaced only one affected road buffer. It kept the original material programs, paint matrices, all other geometry, and every camera unchanged. The affected chunk changed from 2,514 to 2,516 triangles; its Float32 footprint symmetric difference was 0.00000272 m². This establishes that correcting the triangulation fixes the measured failure without a stronger paint depth bias.

Reports: [original native failure](paint-depth-v081/native-baseline.json), [controlled geometry-only repair](paint-depth-v081/native-geometry-only.json), [actual core geometry](paint-depth-v081/geometry-baseline.json), and [bounded metro geometry sample](paint-depth-v081/metro-geometry-sample.json).

## Production integration and verification

Production integration uses the same cell-local constrained triangulation for painted ground surfaces. The complete rebuilt release and public publication remain pending at this documentation checkpoint. Final source, buffer costs, exact built-app/native results, and the public audit will be recorded after they pass.

The shared `src/world/paint-material.js` also gives streamed and downtown white/yellow markings the same after-opaque, depth-tested, non-depth-writing decal contract. Streamed double-sided paint uses one transparent pass. Depth testing remains enabled for physical occluders; no runtime logarithmic-depth override is retained.

The permanent checks are `scripts/check-paint-geometry.mjs`, `src/world/paint-material.test.mjs`, `scripts/visual/prepare-paint-depth-diagnostics.mjs`, and `scripts/visual/check-paint-depth-gles.py`. Native rendering uses Mesa llvmpipe software rendering. These results are not a physical-phone test, an NVIDIA/ANGLE browser capture, or a measured FPS improvement. They reproduce a concrete paint loss; they do not establish the exact magnitude of the user's hardware-specific artifact.
