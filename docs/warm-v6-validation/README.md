# Warm-v6 integration and real-render validation

The supplied reviewer pack is preserved verbatim at [review-2026-10-29](../look-dev-captures/review-2026-10-29/README.md). All 24 files match their ZIP bytes. The approved original README and reference-sheet captions retain their original language; implementation source remains normalized.

`warm-floors.json` now uses the approved v6 lighting, wall materials, architecture and root backdrop, with the selected catalogue floor defaults. The unmodified `warm-v6.json` remains available as the original-role reference. No production deployment was performed.

## Current room-type defaults

| Living | Bedroom |
| --- | --- |
| ![Living](warm-floors--living.png) | ![Bedroom](warm-floors--bedroom.png) |

| Kitchen | Bathroom |
| --- | --- |
| ![Kitchen](warm-floors--kitchen.png) | ![Bathroom](warm-floors--bathroom.png) |

[Exterior](warm-floors--exterior.png)

## Six wood finishes: supplied reference and implementation

Both columns use the same 1440 x 900 bedroom view. Exact board phase is not required. See [independent visual review](VISUAL_REVIEW.md) for findings and tolerances.

| Finish | Supplied reference | Current implementation |
| --- | --- | --- |
| wood-light-oak | ![Reference wood-light-oak](../look-dev-captures/review-2026-10-29/woods/wood-1--bedroom.png) | ![Current wood-light-oak](wood-light-oak--bedroom.png) |
| wood-walnut | ![Reference wood-walnut](../look-dev-captures/review-2026-10-29/woods/wood-4--bedroom.png) | ![Current wood-walnut](wood-walnut--bedroom.png) |
| wood-washed-oak | ![Reference wood-washed-oak](../look-dev-captures/review-2026-10-29/woods/wood-5--bedroom.png) | ![Current wood-washed-oak](wood-washed-oak--bedroom.png) |
| wood-herringbone-oak | ![Reference wood-herringbone-oak](../look-dev-captures/review-2026-10-29/woods/wood-6--bedroom.png) | ![Current wood-herringbone-oak](wood-herringbone-oak--bedroom.png) |
| wood-cherry | ![Reference wood-cherry](../look-dev-captures/review-2026-10-29/woods/wood-7--bedroom.png) | ![Current wood-cherry](wood-cherry--bedroom.png) |
| wood-herringbone-walnut | ![Reference wood-herringbone-walnut](../look-dev-captures/review-2026-10-29/woods/wood-8--bedroom.png) | ![Current wood-herringbone-walnut](wood-herringbone-walnut--bedroom.png) |

## Eight tile finishes

| Finish | Supplied reference | Current implementation |
| --- | --- | --- |
| tile-terracotta-deep | ![Reference tile-terracotta-deep](../look-dev-captures/review-2026-10-29/tiles/tile-terracotta-deep--kitchen.png) | ![Current tile-terracotta-deep](tile-terracotta-deep--kitchen.png) |
| tile-terracotta | ![Reference tile-terracotta](../look-dev-captures/review-2026-10-29/tiles/tile-terracotta--kitchen.png) | ![Current tile-terracotta](tile-terracotta--kitchen.png) |
| tile-terracotta-light | ![Reference tile-terracotta-light](../look-dev-captures/review-2026-10-29/tiles/tile-terracotta-light--kitchen.png) | ![Current tile-terracotta-light](tile-terracotta-light--kitchen.png) |
| tile-caramel | ![Reference tile-caramel](../look-dev-captures/review-2026-10-29/tiles/tile-caramel--kitchen.png) | ![Current tile-caramel](tile-caramel--kitchen.png) |
| tile-sand | ![Reference tile-sand](../look-dev-captures/review-2026-10-29/tiles/tile-sand--kitchen.png) | ![Current tile-sand](tile-sand--kitchen.png) |
| tile-stone | ![Reference tile-stone](../look-dev-captures/review-2026-10-29/tiles/tile-stone--kitchen.png) | ![Current tile-stone](tile-stone--kitchen.png) |
| tile-blue | ![Reference tile-blue](../look-dev-captures/review-2026-10-29/tiles/tile-blue--kitchen.png) | ![Current tile-blue](tile-blue--kitchen.png) |
| tile-charcoal | ![Reference tile-charcoal](../look-dev-captures/review-2026-10-29/tiles/tile-charcoal--kitchen.png) | ![Current tile-charcoal](tile-charcoal--kitchen.png) |

## Actual application, one fictional student

These are direct room crops from actual authenticated application screenshots under the approved v6 appearance. Product/account UI was cropped out; original full screenshots remain local. The current round repeated all fourteen choices through the context menu with zero-amount receipts. Refresh and switching students retained the saved selections; balances stayed unchanged.

| Finish | Actual application |
| --- | --- |
| wood-light-oak | ![Application wood-light-oak](app/wood-light-oak.png) |
| wood-walnut | ![Application wood-walnut](app/wood-walnut.png) |
| wood-washed-oak | ![Application wood-washed-oak](app/wood-washed-oak.png) |
| wood-herringbone-oak | ![Application wood-herringbone-oak](app/wood-herringbone-oak.png) |
| wood-cherry | ![Application wood-cherry](app/wood-cherry.png) |
| wood-herringbone-walnut | ![Application wood-herringbone-walnut](app/wood-herringbone-walnut.png) |
| tile-terracotta-deep | ![Application tile-terracotta-deep](app/tile-terracotta-deep.png) |
| tile-terracotta | ![Application tile-terracotta](app/tile-terracotta.png) |
| tile-terracotta-light | ![Application tile-terracotta-light](app/tile-terracotta-light.png) |
| tile-caramel | ![Application tile-caramel](app/tile-caramel.png) |
| tile-sand | ![Application tile-sand](app/tile-sand.png) |
| tile-stone | ![Application tile-stone](app/tile-stone.png) |
| tile-blue | ![Application tile-blue](app/tile-blue.png) |
| tile-charcoal | ![Application tile-charcoal](app/tile-charcoal.png) |

## Recorded boundaries

- All ten default/Toy baseline PNGs remain byte-identical: [hashes](default-toy-baseline.json).
- The original five v6 views were reproduced; exported RGBA mean absolute differences are below 0.068 on a 0 to 255 channel scale: [diagnostics](raw-v6-reproduction-pixel-diagnostics.json). This is not a pixel-perfect acceptance claim.
- The corrected square tile period is 1.4 m, producing 4 by about 3.714 cells in a 5.6 by 5.2 m room, instead of the old stretched 4 by 4 grid. Wood joint phase differs because UVs now follow world dimensions.
- A few individual older tile references have a slight wall-tone variation (maximum sampled mean Delta E76 about 3.12). The new implementation consistently follows the approved v6 wall/light preset, rather than silently changing walls for each floor option.
- Original prototype exports sometimes changed plinth color per sample. The implementation uses the single approved v6 architectural token. The catalogue floor color and pattern remain the selected values.
- Bright exterior grass is an upstream known limitation and was not recolored. The warm floor system intentionally removes the old fixed bathroom border overlay.
- No real student, production account or wallet was modified. No physical projector or performance benchmark is claimed.

[Actual light/material/camera readback](render-readback.json) · [Application persistence/receipt verification](application-verification.json) · [Machine-readable visual results](visual-validation.json)
