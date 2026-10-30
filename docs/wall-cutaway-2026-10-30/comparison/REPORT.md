# Warm 0.5 m wall-cutaway review

Reviewed 2026-10-30. This is a local source audit. No account, browser state, publication or deployment was changed by this audit.

**Status: visual PASS for the two final source house PNGs.** The parent recaptured both images after the renderer fixes; each final file is byte-identical to the earlier image independently inspected here. The partial-edge repair changes the irregular starter-edge case covered by the new test, while the four-room review fixture stays visually unchanged. Final input hashes, native dimensions and unchanged logical-module hashes are recorded in [evidence.json](evidence.json).

## Visual comparison

Both actual 1440 x 900 images were independently opened. The chosen 2400 x 1500 overview and 1200 x 750 closeup were also inspected. The following visible features agree with the chosen reference:

- The interior partitions are low, with a continuous dark cut face instead of white column caps. No obsolete white partition-end post is visible.
- The near front and right exterior edges now have real wall bodies and dark cut faces. The house no longer has bare thin lips on these two sides.
- Door openings remain in the same room-to-room locations, including the living/bedroom and kitchen/bathroom transitions. The openings have not been filled by a full-length cut cap.
- The two far window walls remain tall, with the same window locations. Furniture and the robot remain visible over the short partitions.
- The warm-walls and warm-floors presets both produce the selected cutaway structure. Previously accepted finish differences are retained: this review does not ask to restore the older wall texture shown in the reference.

The source actuals and reference have the same aspect ratio but different pixel counts. These are native-pixel side-by-side contacts; the reference is intentionally larger, and the shorter actual image has neutral space below it. No image resampling, registration, brightness normalization or color correction is applied:

- [Warm-walls native comparison](pair-warm-walls-native.png)
- [Warm-floors native comparison](pair-warm-floors-native.png)

This is not a pixel-identical match claim. Screenshots demonstrate the chosen silhouette and visible openings; numerical height, thickness and logical invariants are checked separately.

## Independent geometry and compatibility tests

`tests/home-wall-cutaway.test.mjs` uses real Three meshes, real finish managers and a minimal canvas drawing sink. It creates no renderer, user, wallet or save. All **9 new tests pass**. Together with existing room-expansion, wall-texture and wall-finish tests, the targeted run passes **33/33**.

- Cut-wall solid union: floor datum y=0.06, body top y=0.56, giving a 0.5 m body. Separate cut caps span y=0.56 to y=0.60, giving 4 cm thickness.
- Cap footprint matches the 0.17 m wall thickness and retains `#4a3f37`. Caps have no texture or paint surface ID and stay dark after changing a room finish. The written same-width requirement takes precedence over the temporary prototype's 0.19 m cap.
- Full-height window-wall vertices, UVs, IDs and window geometry retain exact mesh signatures.
- Shared-partition doorway intervals are unchanged. Raycasts pass through the same centred 1.45 m opening and still hit the solid portions below the cut height.
- Room-facing surface IDs and independently editable style/color remain intact. Wall textures still repeat at world scale; editing one room does not repaint another room or the cut caps.
- Starter homes, legacy suite/atrium/mansion layouts, upper floors with their own room plan and empty purchased upper slabs are covered.
- Default and Toy ignore the requested cutaway flag and retain exact mesh signatures. Switching Warm cutaway off restores the original complete shell and equivalent whole-building capture geometry. The independent exterior model is unchanged.
- Collision volumes, wall-mount targets, point walkability, a doorway route and the input saved-home JSON remain unchanged when render cutaway is toggled.

The audit caught a real partial-edge regression: adding a half-width room in front of a legacy starter room initially hid the entire starter front edge. The renderer now derives exposed intervals, and the dedicated boundary raycast test passes for every exposed front/right segment.

## Scope and remaining evidence

The working-tree bytes of `home-engine.js`, `home-building-collision.js`, `home-avatar-navigation.js`, `home-item-placement.js` and `home-layout.js` match their HEAD Git blobs. See the hashes in [evidence.json](evidence.json). This establishes that no logical collision, navigation or mounting module was edited in this task; the geometry tests additionally check relevant runtime results.

This audit did not perform browser picking, physical-device testing or a full production regression. Direct clicks on the dark cap deserve a browser check: the cap is intentionally not a paint target, while the room-facing wall retains its existing target. Application expansion screenshots, whole-building/exterior browser checks and Default/Toy image regressions are separate parent evidence. No commit, push or deployment status is asserted here.
