# Warm interior wall cutaway handoff

This is the selected **0.5 m display-cutaway** task, implemented on top of the completed Warm wall finishes and classroom interface. It replaces the earlier pending discussion about wall presentation with the reviewer package's explicit selected design. It does not implement a new full-height physical-wall system.

Only the Warm interior view enables the cutaway. Default, Toy, the outdoor estate and the whole-building view retain their existing rendering. No production deployment is included.

## Reference import

Reference materials were imported separately from implementation:

- Source reference import: `88a8a39`.
- Public review reference import: `d9bd9a5`.
- Archive: `homeworld-codex-walls-cut-2026-10-30.zip`.
- Archive SHA-256: `627f188f4faabd2946271a294e6ed609301f8cc624242a39da9b221737ca6622`.
- All seven archive members remain byte-identical, with their repository destinations and hashes listed in [IMPORT_PROVENANCE.json](look-dev-captures/review-wall-cutaway-2026-10-30/IMPORT_PROVENANCE.json).

The selected reference is [house-cut-0.5m.png](look-dev-captures/review-wall-cutaway-2026-10-30/reference/house-cut-0.5m.png), accompanied by its close-up. The 1.05 m image is an unselected comparison. The prototype patch remains documentation under `prototype/`; none of its global switches, focus mode or X-ray logic is imported into production code.

## Display behavior

`createRoomExpansion` accepts an explicit `cutaway` argument that defaults to **false**. The scene controller enables it only for the Warm interior view and disables it for outdoor or whole-building rendering and captures. A URL theme alone does not change the physical model consumed by collision or navigation code.

When that display option is active:

1. Existing full-height back and left window walls stay full height, including their original windows and explicitly full-height architectural posts.
2. Interior `partition` / `lowWall` walls are displayed 0.5 m above their original floor offset, with their original thickness and doorway span/position.
3. Front and right perimeter lips receive the same cutaway-wall display, making the room perimeter readable on all four sides.
4. The cut surface is **4 cm thick**, colored **`#4a3f37`**, and the same width as the wall body. The implementation uses **0.17 m body and cap width**, following the written equal-width requirement. The temporary prototype's cap was 0.19 m wide; that overhang is intentionally not reproduced.
5. The former short partition posts and white post caps are omitted. Explicit full-height architectural posts are preserved.
6. Each room-facing wall still uses its existing style and color. The dark cut surface remains a neutral architectural cut, rather than another editable wall finish.

The same policy is applied to the active interior storey. View changes restore the existing display policy without writing a preference into the home save. No focus mode, room spotlighting, wall-behind-object outline or X-ray system was added.

## Gameplay and persistence boundary

This is a presentation change. The existing collision geometry, robot walkable areas, furniture-placement legality and wall-mounted item targets remain authoritative and unchanged. The display meshes do not create a new mounting surface or relax placement checks. Raising or lowering the visible cut does not change where a robot or item can legally move.

No save schema, room prices, product IDs, point values, payment rules, engine validation or server access checks change. The previous optional wall `styleId` and `colorId` fields, their whitelist validation and their legacy-color fallback remain as already delivered. Opening the cutaway view does not insert a new wall-height field or rewrite legacy homes.

For the previous wall contract and source normalization policy, see [WALL_SYSTEM_HANDOFF.md](WALL_SYSTEM_HANDOFF.md). For the preceding classroom UI, see [WARM_UI_HANDOFF.md](WARM_UI_HANDOFF.md).

## Sixth Look Dev view

The Look Dev page adds **House** as a sixth view. Its single-storey floor matches the reviewed fixture:

- Slab: 8.4 m x 10.4 m, beginning at x = -2.8 m, z = -2.6 m.
- Living room: 5.6 m x 5.2 m.
- Compact kitchen: 2.8 m x 5.2 m, to the right of the living room.
- Bedroom: 5.6 m x 5.2 m, in front of the living room.
- Bathroom: 2.8 m x 5.2 m, in front of the kitchen.
- Twelve real catalogue items retain the prototype's positions and their current default colors/materials: sofa, coffee table, living rug, tripod lamp, cooker, sink, dining table, bed, bedside cabinet, bedroom rug, toilet and vanity.
- Robot point: **x = -1.4 m, z = 6.4 m**.

The fixture uses the actual home-state constructor and placement command for every item. Its state validates, every item passes the unchanged real collision checks, and the robot point is walkable. It contains no account identity, real student, wallet, purchased inventory or saved-home record. Each request creates fresh fixture data.

`warm-walls.json` and `warm-floors.json` can render this view through the real scene, furniture models and robot v4 GLB. The review capture stays **1440 x 900, DPR 1**. No global resolution, cut height, focus rectangle or X-ray override is introduced.

The view definitions are now the single source for the switcher, the **All 6 PNGs** button and the six-image ZIP filename/count. The original five fixture payloads retain their recorded hashes. Actual rendered Default/Toy image preservation is verified separately, rather than inferred from fixture-data hashes alone.

The resolved diagnostics expose `wallGeometry`: actual wall/cap/column colors, flags, world-space bounds and heights. These are read from rendered meshes; they do not assume a height from the room save or from the reference image. They allow the reviewer to check 0.5 m wall bodies and 0.04 m caps alongside the unchanged full-height window walls.

## Evidence and validation status

Evidence is collected under `docs/wall-cutaway-2026-10-30/`. The final index will link the actual House cutaway, the prior appearance, same-view reference comparisons, the application scene, baseline regressions and test summaries.

The supplied reference image is **2400 x 1500**, while the actual review capture is **1440 x 900**. Both have the same aspect ratio. Comparisons may resize the reference for inspection and must disclose that step; a pixel-identical claim is not made. The reference was created from an older prototype, whereas the current renderer preserves the later approved wall-finishing system and actual models.

Final House images were independently inspected against the selected design. The separate real-platform lab loaded a three-room fictional student home; both stored student records remained byte-identical. Sampled new wall-face and cap positions opened the existing wall menu. Returning from building to interior restored identical decoded scene-crop pixels. The standalone visual adapter remains a different mock environment and is not evidence of real platform authentication or production wallet behavior.

**Verified delivery:**

Source tests: homes 713/713; cutaway 9/9; full 867/868 with the pre-existing catalogue-count assertion (376 versus 311). Public tests: core 379/379; focused 74/74; full 728/783, with exactly the same 55 normalization-sensitive failing names as the prior public snapshot. Ten Default/Toy PNGs and the Warm exterior PNG remain byte-identical. The application and all public evidence are linked in [the gallery](wall-cutaway-2026-10-30/README.md).

Public implementation code 65ad7356aa8073c0ac4927ce5b571ecab9375f76 was pushed to GitHub main and cloned into a new directory. No node_modules directory or npm installation was present. Vendored Three 0.186.1 passed its license/import/hash check. The Warm-walls and Warm-floors six-view ZIPs both exported successfully; all twelve PNGs were 1440 x 900 and byte-identical to the final source renders. Browser console errors were empty. See [the fresh-clone record](wall-cutaway-2026-10-30/fresh-clone.json). Subsequent commits only finalize delivery documentation and metadata. Status: local verification completed, committed and pushed; not deployed.

No successful local screenshot is being presented as pushed, deployed, or tested on physical classroom projection hardware. No real student data or production service configuration is modified.

## Copyable web-AI summary

> Homeworld's selected Warm interior wall display uses 0.5 m cutaway bodies with 4 cm dark brown cut surfaces. Full-height back/left window walls and explicit full-height architectural posts are preserved; old short partition posts are removed, doorway positions stay unchanged, and front/right edges receive matching cutaway display walls. The explicit renderer option defaults to false and is enabled only for Warm interior views. Collision, navigation, mounting rules, saves, prices, points and server validation remain unchanged. No focus or X-ray mode is included. The real Look Dev workstation now has a validated four-room House fixture and exports all six views. Read `docs/WALL_CUTAWAY_HANDOFF.md` and the final evidence under `docs/wall-cutaway-2026-10-30/`. Reference import commits are source `88a8a39` and public `d9bd9a5`. Verified implementation commit: 65ad7356aa8073c0ac4927ce5b571ecab9375f76 in Tyresee/homeworld-source-review. A fresh GitHub clone without npm exported both six-view Warm presets; all twelve PNGs matched the source bytes with no browser errors. Core 379/379, focused 74/74 and source home 713/713 checks passed; documented pre-existing full-suite failures remain. Status: committed and pushed, not deployed.
