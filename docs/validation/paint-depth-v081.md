# Road paint depth repair, v0.8.1

**Follow-up status: the user reports remaining visible surface artifacts after this release.** The measured native defect below was repaired, but the complete user-visible browser issue remains open. The native render gate covers selected downtown road paint, with replacement textures and no shadows; it does not render parking or streamed metro paint. See the [local GPU handoff](../local-gpu-handoff.md) before making further changes or claiming visual resolution.

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

The complete v0.8.1 rebuild uses constrained Delaunay triangulation after clipping road and parking footprints to their existing 1,024 m mesh cells. The offline compiler checks footprints, holes, winding, duplicate area and cell coverage. The baker retains the original heights, normals and UV scale. Other ground layers keep their existing bake.

The native gate then ran against the actual rebuilt packed buffers, without a diagnostic geometry substitution: **48/48 cases pass, with zero lost paint pixels, zero occluder leaks, and zero road submission-order differences**. Eight actual production material programs compile and link. The occluder overlaps 51 paint samples, so its visibility check is not vacuous. [Built native report](paint-depth-v081/native-built.json) and [pinned native environment](paint-depth-v081/native-environment.json) record the exact source, shader and geometry hashes.

The independent complete-footprint paint audit also passes against the rebuilt buffers: 14,391 paint instances, 65,129 ground triangles, the same 11.9999945–12.0000020 mm clearance, and no significant paint overlap, uncovered paint or competing ground owner. See [built geometry report](paint-depth-v081/geometry-built.json).

| Actual packed cost | Original v0.8.0 | Built v0.8.1 |
| --- | ---: | ---: |
| Road and parking triangles | 21,926 | 19,298 |
| Road and parking vertex/index bytes | 830,628 | 730,444 |
| Complete city geometry gzip bytes | 13,812,341 | 13,776,850 |
| Runtime surface gzip bytes | 703,496 | 703,496 |
| Long road needles, edge >32 m and aspect >256 | 4,237 | 20 |

The runtime surface payload is byte-identical; build-only triangulation is excluded. Exactly 27 painted-ground chunks change, while every other chunk and all instance buffers remain unchanged. The compiler's double-precision footprint difference is zero. Float32 quantization remains, and a small number of thin triangles remain; the fix does not claim to eliminate every thin face. [Packed comparison](paint-depth-v081/packed-costs.json) records the costs and hashes.

A bounded follow-up checks the remaining 20 long road needles and 18 parking needles against all 14,391 actual paint rectangles. None overlaps or touches paint; nearest distances are 0.707 m for road and 0.695 m for parking. This establishes that the residual needles do not underlie existing paint, not that every thin boundary triangle is unavoidable or universally raster-safe. [Residual triangle audit](paint-depth-v081/remaining-needles.json) binds the result to the final buffers and verified paint source hashes.

The complete local `npm run build` and `npm run check` pass. This includes the paint material and triangulation regressions, all geometry/ownership checks, 30 metro streaming cases, 54 GPU UI cases, and actual built-app startup/driving integration. Sustained throttle with 285 repeated key events travels 216.891 m in ten seconds and reaches 28 m/s; synthetic portrait and landscape phone control layouts remain reachable. The startup harness uses renderer/browser adapters and does not establish device FPS.

Independent workflow [46087176260](https://github.com/TrentSterling/okc/actions/runs/46087176260) rebuilt source `3d246e8894cda844f030c7e614df6eac3828488a` and passed the complete validation job, including all 48 native paint-depth cases. Its packed geometry, layout, slim surfaces and paint module match the locally tested SHA-256 hashes. GitHub Pages activated revision `857f594c18c433b2e955391f253aa15f7d9881aa`.

The complete public SHA-256 audit passed for **6,231 files / 444,289,399 bytes** in 626 seconds, with zero retries, rate-limit waves or hash mismatches. The workflow completed successfully at 00:35 UTC on November 28 (November 27 in Chicago). v0.8.1 is live at [tront.xyz/okc](https://tront.xyz/okc/). [Publication record](publication-v081.json) preserves the exact source, Pages revision, tested input hashes and audit result. This subsequent documentation-only checkpoint changes no deployed runtime source.

The shared `src/world/paint-material.js` also gives streamed and downtown white/yellow markings the same after-opaque, depth-tested, non-depth-writing decal contract. Streamed double-sided paint uses one transparent pass. Depth testing remains enabled for physical occluders; no runtime logarithmic-depth override is retained.

The permanent checks are `scripts/check-paint-geometry.mjs`, `src/world/paint-material.test.mjs`, `scripts/check-ground-triangulation.py`, `scripts/bake-ground-surfaces.test.mjs`, `scripts/visual/prepare-paint-depth-diagnostics.mjs`, and `scripts/visual/check-paint-depth-gles.py`. The native depth gate is required by CI before publication. Native rendering uses Mesa llvmpipe software rendering. These results are not a physical-phone test, an NVIDIA/ANGLE browser capture, or a measured FPS improvement. They reproduce a concrete paint loss; they do not establish the exact magnitude of the user's hardware-specific artifact.
