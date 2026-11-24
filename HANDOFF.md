# OKC Prairie Prism release handoff

## Modular source checkpoint, November 24, 2026

The worktree for this pass is `/workspace/okc-modular`, branch `refactor/modular-source-20261124`. The untouched `/workspace/okc` checkout and remote branch `backup/pre-modular-20261124-5c832b1` preserve the released v0.3 baseline at `5c832b1f71ac71eed9a984a99aef49d726cd3829`.

Authored code now lives in `src/`; static assets, captures, vendor files and references live in `public/`. App, world, and tower entrypoints retain their public APIs and delegate to focused modules. `dist/` is ignored and is rebuilt offline from those inputs and the original compressed map snapshots. Read `AGENTS.md` and `docs/architecture.md` before continuing.

The new build stages all output before replacing an existing `dist/`, with an automated failed-build preservation test. Source guards reject large encoded payloads and tracked build output. Build and syntax failure logs are bounded. Node validation now supports the complete ES module graph using the same vendored Three.js version as the browser.

Verified during implementation: generated city data, compiled surfaces, baked meshes, provenance/audits, original capture assets and both capture ZIPs match v0.3 byte for byte. World/tower comparisons matched geometry, materials, transforms, canvas drawing operations, route outputs and animation for seeds 42 and 1907. A separate app comparison matched 21 interaction/state snapshots, 24 named preset operations and 534 render/environment events. These are CPU/state comparisons, not GPU screenshot verification.

Next integration step: complete the combined build/check gates, push the source checkpoint to the refactor branch, verify its CI result, then fast-forward `main` and verify the Pages workflow. The current preview service reports an existing active preview but its local URL could not be reached; browser QA is not yet established for this refactor.

The new workflow validates refactor branches and PRs without publishing. On `main`, it publishes the exact validated artifact and verifies every deployed runtime module and capture ZIP with SHA-256.

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
