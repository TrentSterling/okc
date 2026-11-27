# Discover OKC 0.7

## Release scope

Keep the 0.6 downtown scene, Devon reflected-sky study, driving model, capture presets and original gallery. Expand with cached geographic data from Yukon to downtown and South OKC to Quail Springs, using 512 m streaming tiles. Prioritize Reno, NW 23rd, Route 66, Bethany, Lake Overholser and Lake Hefner.

Discovery includes all available mapped businesses, a verified curated collection, chain highlighting (especially Subway), sit-down Mexican restaurants, arcades, bars, bowling, Asian dining, Ollie's and bargain shops, outlets/markets/thrift, aquariums, parks and Christmas outings. Businesses are separate from buildings.

The planner uses a $200 budget for two, selectable places, editable spending allowances, explicit reserves, import/export, local journal, and guided tours. The supplied eight Christmas stops sum to $187; a $13 reserve brings the plan to $200.

## Accuracy policy

Mapped footprints retain source IDs. Heights without measured data are labeled estimates. Generic facade openings and roof details are procedural approximations, not surveyed replicas. The importer records source URLs, timestamps, licenses and counts. Business facts use primary sources when available; an unknown price is never advertised as verified. Routing must follow connected source road nodes and one-way directions. It does not claim live traffic or turn-restriction completeness.

## Capture and verification

Baseline source is commit `75b1502b1bdf965bac032220b07742689d3d59b2`, saved remotely as `backup/pre-discovery-20261127`. The local build is preserved in ignored `qa/baseline-dist`. The managed preview browser reports WebGL2 unavailable, so its UI screenshots cannot demonstrate the 3D scene. Use native scene rendering for matched geometry evidence and label it accordingly. Verify the full interactive map fallback in the browser and compile production shaders with the repository's native GLES tests.

## Publishing

User explicitly authorized direct commits to main without PRs. Use recoverable checkpoint commits with CI skipped while pieces are not yet integrated. Final validation and publication use the existing GitHub Pages workflow, with final live artifact verification. Do not push generated dist to main. All new geographic inputs, scripts and capture assets belong in the repository.
