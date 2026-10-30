# Warm classroom UI: actual browser evidence

This gallery covers the final opt-in application UI. Original reviewer screenshots and prototypes are preserved separately in [the reference pack](../ui-review-2026-10-30/CODEX_TASK.md). Read [the combined delivery handoff](../WARM_UI_HANDOFF.md) for behavior, wall-save fields, deviations and validation limits.

## Final normalized application screenshots

All eight frames use the same fictional Robin home in the public review edition. Main controls have semantic English labels; inherited copy uses stable DisplayText aliases. Empty starter-room contents are intentional lab data, not missing models. The remote is opened by left-clicking the actual robot. Building screenshots use the real whole-house renderer and its active view dock state.

| State | 1440 x 900 | 1920 x 1080 |
| --- | --- | --- |
| Normal | [PNG](screenshots/normal-1440.png) | [PNG](screenshots/normal-1920.png) |
| Presentation | [PNG](screenshots/present-1440.png) | [PNG](screenshots/present-1920.png) |
| Robot remote | [PNG](screenshots/remote-1440.png) | [PNG](screenshots/remote-1920.png) |
| Whole building | [PNG](screenshots/building-1440.png) | [PNG](screenshots/building-1920.png) |

The desktop browser reported the requested CSS viewport dimensions. Its viewport emulation reported DPR 0.5. Native captures include unused backing-frame margins; PNGs were cropped to the CSS viewport at the original origin without scaling the UI. This affects 3D sampling quality and is not a physical projector, display-density or GPU performance claim. The separate Look Dev exports remain 1440 x 900 at their fixed renderer resolution.

## Reproduce without npm

Use a current Node.js runtime (the loader requires Node module-register support) and a WebGL 2 browser:

~~~sh
node scripts/qa/student-ui-review.mjs
~~~

Open the printed loopback URL, select Sam or Robin, and use the presentation toggle, icon dock and camera controls. The default port is 19542; UI_REVIEW_PORT selects another free port. To inspect wall combinations independently, run node scripts/qa/look-dev-review.mjs with preset warm-walls.json. Each tool falls back to the licensed vendor/three bundle.

The UI lab uses an explicit local fictional platform adapter with the real home service and real render/model modules. Its 150,000-point wallets are mock values. Paid orders and construction are disabled before recording pending commands. Only permitted free appearance/robot state changes write disposable temporary data, which is removed on graceful exit. It makes no real platform account or wallet verification claim. A separate disposable real-platform integration fixture was used locally to verify the presentation student picker and matching balances; its private setup and images are not published.

## Verification records

- [Tests and known baseline failures](tests.json): source homes 713/713; public core 379/379 and focused 58/58. Full suites retain their disclosed pre-existing differences.
- [Default/Toy application comparison](default-toy-ui-regression.json): four source-language pre/post screenshots have identical decoded pixels at matching dimensions and DPR. Their original local images are excluded from this normalized public package.
- [Look Dev comparison](look-dev-regression.json): all 15 Default, Toy and Warm-wall PNGs are byte-identical to their preceding committed reference captures.
- [Browser action checks](source-ui-checks.json): bounded zoom/reset, guarded input hotkeys and student selection.
- [Computed public layout](public-ui-readback.json): title 30px, balance 34px, charcoal screen, no overflow and no corner-control overlap.
- [Visual comparison report](comparison/REPORT.md), matching pair images and image hashes.
- [Fresh-clone record](fresh-clone.json) and [four-view contact](fresh-clone-contact.png): tested GitHub code 4431be6e4ce25c4185bf8a988a96d7f5508cdd28 with no node_modules and no npm installation. All three app views and the dressing submenu worked; zoom changed the scene and reset restored identical sampled pixels. Five Look Dev PNGs matched the source baseline byte-for-byte, with zero browser console errors. The contact alone reduces four originals to half-size tiles.

Reference 05/06 show an intermediate top toolbar. The final implementation follows the later written dock requirements and references 07/08. The remote is inset far enough to clear the real camera dock. Wallets display authoritative fictional lab balances instead of reproducing a prototype unavailable-wallet dash. Caption text follows the specified 14px minimum. Wall height/cutaway remains deferred by explicit user instruction.
