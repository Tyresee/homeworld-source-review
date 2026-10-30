# Warm walls: real-render delivery

This is a local, committed-source review candidate; no production deployment is requested. See [field contract and implementation handoff](../../WALL_SYSTEM_HANDOFF.md).

## Visual review

Thirty fresh 1440 x 900 captures cover every style/color combination in Living and Kitchen. They were all re-rendered after the final shared-wall face fix, and all 30 were byte-identical to the earlier isolated-room captures. The complete comparison includes independent diagnostics, region metrics, stripe phase and furniture samples in [comparison/REPORT.md](comparison/REPORT.md).

![Living: 3 styles x 5 colors](comparison/actual-matrix-living.png)

![Kitchen: 3 styles x 5 colors](comparison/actual-matrix-kitchen.png)

Original references remain under [review-walls-2026-10-30](../review-walls-2026-10-30/README.md). The user approved a true 2.8 cm world-space dot diameter instead of the original prototype's 2.8 x 6.65 cm world-space ellipses. Thin end faces use metre UVs. These intentional differences preclude a pixel-identical claim against the archived prototype. Plain/stripe hue, lightness, physical spacing and phase otherwise match the reviewed views; detailed quantitative limits are disclosed in the comparison report.

## All direct pairs

| Style / color | Living actual / reference | Kitchen actual / reference |
|---|---|---|
| plain / Warm white | [actual](renders/plain-c1--living.png) / [reference](../review-walls-2026-10-30/renders/plain-c1--living.png) | [actual](renders/plain-c1--kitchen.png) / [reference](../review-walls-2026-10-30/renders/plain-c1--kitchen.png) |
| plain / Apricot | [actual](renders/plain-c3--living.png) / [reference](../review-walls-2026-10-30/renders/plain-c3--living.png) | [actual](renders/plain-c3--kitchen.png) / [reference](../review-walls-2026-10-30/renders/plain-c3--kitchen.png) |
| plain / Mist blue | [actual](renders/plain-c7--living.png) / [reference](../review-walls-2026-10-30/renders/plain-c7--living.png) | [actual](renders/plain-c7--kitchen.png) / [reference](../review-walls-2026-10-30/renders/plain-c7--kitchen.png) |
| plain / Lavender | [actual](renders/plain-c8--living.png) / [reference](../review-walls-2026-10-30/renders/plain-c8--living.png) | [actual](renders/plain-c8--kitchen.png) / [reference](../review-walls-2026-10-30/renders/plain-c8--kitchen.png) |
| plain / Slate blue | [actual](renders/plain-c9--living.png) / [reference](../review-walls-2026-10-30/renders/plain-c9--living.png) | [actual](renders/plain-c9--kitchen.png) / [reference](../review-walls-2026-10-30/renders/plain-c9--kitchen.png) |
| stripe-fine / Warm white | [actual](renders/stripe-fine-c1--living.png) / [reference](../review-walls-2026-10-30/renders/stripe-fine-c1--living.png) | [actual](renders/stripe-fine-c1--kitchen.png) / [reference](../review-walls-2026-10-30/renders/stripe-fine-c1--kitchen.png) |
| stripe-fine / Apricot | [actual](renders/stripe-fine-c3--living.png) / [reference](../review-walls-2026-10-30/renders/stripe-fine-c3--living.png) | [actual](renders/stripe-fine-c3--kitchen.png) / [reference](../review-walls-2026-10-30/renders/stripe-fine-c3--kitchen.png) |
| stripe-fine / Mist blue | [actual](renders/stripe-fine-c7--living.png) / [reference](../review-walls-2026-10-30/renders/stripe-fine-c7--living.png) | [actual](renders/stripe-fine-c7--kitchen.png) / [reference](../review-walls-2026-10-30/renders/stripe-fine-c7--kitchen.png) |
| stripe-fine / Lavender | [actual](renders/stripe-fine-c8--living.png) / [reference](../review-walls-2026-10-30/renders/stripe-fine-c8--living.png) | [actual](renders/stripe-fine-c8--kitchen.png) / [reference](../review-walls-2026-10-30/renders/stripe-fine-c8--kitchen.png) |
| stripe-fine / Slate blue | [actual](renders/stripe-fine-c9--living.png) / [reference](../review-walls-2026-10-30/renders/stripe-fine-c9--living.png) | [actual](renders/stripe-fine-c9--kitchen.png) / [reference](../review-walls-2026-10-30/renders/stripe-fine-c9--kitchen.png) |
| dots / Warm white | [actual](renders/dots-c1--living.png) / [reference](../review-walls-2026-10-30/renders/dots-c1--living.png) | [actual](renders/dots-c1--kitchen.png) / [reference](../review-walls-2026-10-30/renders/dots-c1--kitchen.png) |
| dots / Apricot | [actual](renders/dots-c3--living.png) / [reference](../review-walls-2026-10-30/renders/dots-c3--living.png) | [actual](renders/dots-c3--kitchen.png) / [reference](../review-walls-2026-10-30/renders/dots-c3--kitchen.png) |
| dots / Mist blue | [actual](renders/dots-c7--living.png) / [reference](../review-walls-2026-10-30/renders/dots-c7--living.png) | [actual](renders/dots-c7--kitchen.png) / [reference](../review-walls-2026-10-30/renders/dots-c7--kitchen.png) |
| dots / Lavender | [actual](renders/dots-c8--living.png) / [reference](../review-walls-2026-10-30/renders/dots-c8--living.png) | [actual](renders/dots-c8--kitchen.png) / [reference](../review-walls-2026-10-30/renders/dots-c8--kitchen.png) |
| dots / Slate blue | [actual](renders/dots-c9--living.png) / [reference](../review-walls-2026-10-30/renders/dots-c9--living.png) | [actual](renders/dots-c9--kitchen.png) / [reference](../review-walls-2026-10-30/renders/dots-c9--kitchen.png) |

## Actual authenticated application

Only fictional disposable local accounts were used. The real authenticated platform and home-service handlers processed eight free wall updates, including final-version style and color rechecks. Every receipt has amount 0 and no order; points, purchase count and construction count are unchanged. Refresh retained the selected student and choices; switching A to B and back did not copy wall IDs. The building overview/interior round trip produced no console errors. The [read-back record](application/verification.json) uses aliases A/B and contains no credentials or account IDs.

- Style: [plain](application/style-plain.png) → [fine stripe](application/style-striped.png).
- Color: [lavender](application/color-lavender.png) → [mist blue](application/color-mist-blue.png).
- [After refresh](application/after-refresh.png), [A restored after student and view switches](application/student-a-restored.png), [independent student B](application/student-b-independent.png).

These are crops of real application screenshots, excluding account/navigation text. Full captures remain local. Shared partition faces have independent room surface targets; their original triangle area, bounds, window/door openings, mount IDs and collision solids are preserved. Opposite-side raycast and non-leaking material tests cover both the new account layout and preserved legacy walls.

## Baselines, preset and reproducibility

The five-view Warm default set is in [five-views/](five-views/). All ten original Default/Toy baseline PNGs remain byte-identical after final-code recapture; [hash verification](baseline-verification.json). The supplied pack's 35 files were imported byte-for-byte, with prototype files relocated under documentation; see its import provenance.

Run `node scripts/qa/look-dev-review.mjs` and use its printed loopback URL with `?preset=warm-walls.json&view=living`. No npm installation is needed for this viewer because Three is vendored. It uses the actual home builders, furniture and robot v4 GLB; no account or save requests are made. To regenerate a matrix, select a view, iterate Wall style and Wall color, and use Current PNG; filenames in the table retain the reference c1/c3/c7/c8/c9 mapping. The PNG canvas stays 1440 x 900.

Optional offline statistics (requires the declared Sharp development dependency):

`node scripts/qa/look-dev-wall-compare.mjs --actual docs/look-dev-captures/warm-walls-2026-10-30/renders --readbacks docs/look-dev-captures/warm-walls-2026-10-30/render-readbacks.json --output output/wall-comparison`

This evidence is desktop-browser fixed-camera and fictional-account validation. It is not a production deployment, classroom projector, mobile hardware or performance certification. The old data format cannot identify paint deliberately changed back to the exact original default hex. Commands intentionally update one selector at a time; null clearing is not offered. Neither limitation prevents choosing any of the fifteen combinations.
