# OKC Prairie Prism release handoff

## Project

- Source: https://github.com/TrentSterling/okc
- Production: https://tront.xyz/okc/
- Working checkout used for the November 24, 2026 recovery: `/workspace/okc`.
- Release: v0.3.0, recovered intact after the previous conversation stopped during upload preparation.

## Recovered release

Free driving includes steering, reverse, handbrake, recovery, touch controls, and building/map-boundary collision. The modeled area is 3.20 by 2.26 km, with 1,301 building records and 1,710 road segments. City geometry is baked into material batches; building shells retain exposed surfaces and include recessed facade openings. Devon's reconstruction uses the references recorded in `dist/geo/devon-architecture-sources.json`.

`npm run check` passed on November 24, 2026. It covers static asset references, Devon surface ownership and crown closure, road surfaces, exposed building shells, driving, and reproducibility of the baked geometry. The recovered checks reported 5,950 road samples with no misses; 4,437 crown rays with no misses; no buried facade or roof triangles; 1,095 entrances; and driving checks at 30, 60, and 144 Hz.

The validation documents distinguish geometry budgets and shader compilation from measured GPU frame rate. v0.3 has not completed a GPU visual/interaction review in the recovery environment, whose previous preview browser reported WebGL disabled. The gallery labels its older captures; do not describe them as v0.3 screenshots.

## Build and publication

1. Run `npm run build:downloads` if capture ZIPs are absent.
2. Run `npm run check`.
3. Commit and push source to GitHub. Push an incremental recovery branch before lengthy additional work.
4. Push validated releases to `main`. `.github/workflows/pages.yml` validates, publishes `dist/` to `gh-pages`, requests native Pages deployment, and compares the public release bytes.
5. Check the source workflow and native Pages deployment. A source commit alone is not proof that production was updated.

The generated `dist/world-meshes.js` is about 16 MB. Use a direct Git push when available. If transferring through the GitHub connector, pass file contents programmatically and verify blob hashes; never print large assets into the conversation.

Future work should preserve recoverable source checkpoints on GitHub throughout the task. Keep source, geographic snapshots, reference provenance, validation scripts, and the original 29 captures together.
