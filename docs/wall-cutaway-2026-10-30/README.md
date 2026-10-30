# Selected 0.5 m cutaway: actual render evidence

The selected reviewer reference, original prototype and provenance are preserved in [the imported pack](../look-dev-captures/review-wall-cutaway-2026-10-30/CODEX_TASK.md). Read [the implementation handoff](../WALL_CUTAWAY_HANDOFF.md) for the rendering switch, gameplay boundaries and deviations.

## Rendered House

- [Final Warm walls](house-cut.png), 1440 x 900 at DPR 1.
- [Final Warm floors](warm-floors--house.png), 1440 x 900 at DPR 1.
- [Before](house-before.png), the identical four-room fixture rendered by the preceding public implementation.
- [Warm-walls six-view set](warm-walls/), including the new House fixture.
- [Native reference pairs and independent review](comparison/REPORT.md). The supplied overview is 2400 x 1500; pairs retain native pixels without resampling.
- [Actual mesh diagnostics](house-diagnostics.json): body floor y=0.06 to y=0.56, cap y=0.56 to y=0.60, cap/body thickness 0.17 m, dark cut color #4a3f37. No wall-height value is stored in an account save.

## Actual application integration

A disposable real-platform lab already held a legitimately expanded three-room fictional student home. Its real account application loaded the new renderer without adding rooms or editing its inventory in this task.

- [Three-room interior scene](application-three-room-scene.png).
- [Whole-building scene](application-building-scene.png).
- [Return to the interior](application-return-scene.png).
- [Read-back checks](application-checks.json): both fictional student records remained byte-identical at revisions 1 and 25. The interior scene crop returned to identical decoded pixels after the building view. Sampled new wall-face and dark-cap positions offered the existing wall context menu; no finish write was performed.

These application screenshots are scene-only crops to exclude local account headers and wallet metadata. The local complete app viewport was 1440 x 900 CSS pixels at emulated DPR 0.5. The crop is 1040 x 510 and has not been enlarged. This is different from the fixed-resolution DPR 1 Look Dev PNGs and does not claim physical projector or trackpad validation. No real student or production wallet was accessed. The standalone mock visual lab remains a separate tool.

## Regression results

[Render regression](render-regression.json) records ten byte-identical Default/Toy baseline PNGs and the unchanged Warm exterior PNG. New House views have no prior five-view baseline. Warm interior render changes are intentional. The six-view fixture data, ZIP count and real placement validation have automated coverage.

[Tests](tests.json) records source homes 713/713, new cutaway 9/9, source full 867/868 with the existing catalogue count assertion, public core 379/379, focused 74/74, and public full 728/783. [The public baseline comparison](public-test-baseline.json) confirms exactly the same 55 normalization-sensitive failing names as the preceding public code; none were removed or weakened.

The independent comparison record includes hashes of five unchanged logical modules. Additional tests compare mounting targets, collision volumes, doorway routes and saved layout before and after render toggles. Default and Toy ignore cutaway; disabled Warm cutaway restores exact original mesh and whole-building snapshot signatures. Texture-lease cleanup is covered.

## Reproduce

~~~sh
node scripts/qa/look-dev-review.mjs
~~~

Open the printed loopback address with ?preset=warm-walls.json&view=house, or use warm-floors.json. All 6 PNGs exports a ZIP with one named PNG per view. The script uses the vendored licensed Three.js bundle when node_modules is absent. No npm, account, wallet or saved-home write is required.

[Fresh clone verification](fresh-clone.json) tested pushed implementation 65ad7356aa8073c0ac4927ce5b571ecab9375f76: no node_modules, no npm installation, both six-view Warm ZIPs exported, all twelve PNGs byte-identical to source at 1440 x 900, zero browser errors. Later delivery commits change evidence and documentation only. No production deployment is included.
