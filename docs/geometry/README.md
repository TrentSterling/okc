# Geometry inspection views

These images project the production Three.js mesh buffers using a CPU depth
buffer and flat diagnostic colors. They show geometry and scale; they are not
WebGL screenshots and do not preview the final glass, lighting, or textures.

- `devon-crown-cpu.png`: closed mechanical roof, interior crown lining and capped edges.
- `devon-campus-cpu.png`: campus cutaway, with the tower intentionally clipped at 48 m and glass roofs omitted so the rotunda and auditorium interior can be inspected.
- `devon-silhouette-cpu.png`: complete tower/campus massing at the modeled meter scale.
- `doorway-geometry.png`: an actual baked facade opening near Reno, with a 32 cm recess, frame and threshold.

The reproducible production mesh checks are in
`scripts/check-tower-surfaces.mjs`. Public architectural references and the
limits of the reconstruction are recorded in
`dist/geo/devon-architecture-sources.json`.

The v0.3 development browser's WebGL driver was disabled. These views, the
mesh checks, and the offline shader checks do not substitute for a GPU visual
and interaction pass on the deployed game.
