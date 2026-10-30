# Warm candidate: combined wall and classroom UI handoff

The work continues the existing opt-in Warm candidate. Task 1 (wall styles and colors) is already implemented and verified; Task 2 adds classroom page controls and a warm paper interface. Only `?theme=warm` enables the new interface. Default and Toy retain their original page appearance and behavior. This delivery is for source review and local use; no production deployment is included.

## Review material and precedence

The combined reviewer package was imported in a separate reference-only commit: source `f17ee40`, public review copy `7ac2d01`. Its existing 35 wall files were verified byte-for-byte against the previously imported wall pack. New UI screenshots, the original specification and temporary prototypes are preserved under [ui-review-2026-10-30](ui-review-2026-10-30/CODEX_TASK.md). The prototypes remain documentation and are not imported by the application.

The current implementation builds on the completed wall candidate rather than reverting to the older reference base. Two later user decisions remain authoritative:

1. Dots are true **2.8 cm world-space circles**, correcting the prototype's vertically stretched dots.
2. **Wall-height and cutaway changes are deferred.** The UI work does not raise partitions, change doorway/window geometry, add structural collision volumes, or claim that the separate wall-height issue is fixed.

## Completed wall system

Each room independently selects one of three styles and one of five colors. Styles and colors are separate optional whitelist fields, `wall.styleId` and `wall.colorId`, alongside unchanged legacy raw color/material values. Starter choices synchronize the selected field across the three starter wall skins; added rooms and upper storeys retain independent wall skins and matching owned-room metadata.

The free `setWallFinish` command changes one selector at a time. Existing authentication, student access, revision and idempotency checks remain in force. Old unpainted walls resolve to plain warm white; custom legacy paint is preserved with plain styling. Loading an old save does not insert new fields. Dedicated cached textures use physical metre UVs and do not replace furniture linen/oak maps. Shared room-facing wall surfaces retain independent appearance and hit targets.

See the complete [wall field contract](WALL_SYSTEM_HANDOFF.md), [30 actual-render combinations and comparison](look-dev-captures/warm-walls-2026-10-30/README.md), and the unchanged archived reviewer references. The known legacy limitation remains: a color deliberately painted back to the exact original default hex cannot be distinguished from an untouched color without historical metadata.

## Completed Warm interface

The application chrome uses the supplied warm paper palette: page `#f6f2eb`, panels `#ffffff` / `#fbf9f5`, border `#e8e0d4`, main text `#2b2622`, muted text `#8a7f72`, accent `#b9755a`, selected surface `#f4e4d9`, and gold coin `#e0a64a`. The application scene backdrop blends `#fbf9f5` to `#e7dfd2`. This backdrop is scoped to the application host; it does not overwrite the approved Look Dev lighting or scene presets.

The robot remote uses a charcoal screen and `--remote-ink: #33302c`. Its colored action buttons remain colored. Typography uses a minimum 16 px for normal interface text, 14 px for descriptions, 30 px for titles, and 34 px for the points value. Points animate toward the authoritative received value over approximately 600 ms; reduced-motion mode updates immediately. Changing student or teacher identity cancels the previous balance animation.

- The lower-left icon dock offers Interior, Outdoors and Building views, using 64 px illustration tiles and short captions. A dark performance button sits beside it.
- The lower-right camera group offers Zoom in, Zoom out and Reset, using 52 px buttons. They call the existing bounded zoom and reset paths rather than maintaining another camera state.
- The remote's Dress entry opens a transient choice of wardrobe or robot palette. The old toolbar's wardrobe, palette and wave buttons are hidden in Warm; their original IDs/handlers remain available for compatibility. The robot's existing wave action remains in the remote.
- Automatic dance-camera controls remain reachable independently of the performance toggle. Visible labels, accessible labels and titles update together for following, exiting and restoring the camera.
- A compact help button replaces the permanent operation-hint strip. Routine status toasts expire after a few seconds. Login failures, errors and retry actions remain visible.

The existing interaction rules are preserved: left-click object actions, right-click local menus, furniture dragging, space-drag panning and continuous wheel/trackpad zoom. No permanent bottom instruction bar, general-purpose right panel, or context-menu regrouping was introduced.

## Presentation mode and selection safety

Enter presentation mode with `?theme=warm&view=present`, the page toggle, or **P**. The top header and left roster disappear, and the scene uses the full window. A native student selector beside the title calls the same authenticated `selectStudent` flow as the original roster, including identity guards, pending checkpoint handling and stale-response protection. It does not create an alternative account or save path.

Teacher shortcuts are **1 / 2 / 3** for the three views, **0** for camera reset, and **P** for presentation mode. They are disabled while typing in inputs, textareas, selectors or editable content, and while a blocking menu/dialog is active. Busy saves disable scene changes and student selection. Resize and presentation changes refit the existing scene through its explicit API while preserving the current zoom, pan and dance-camera state.

`student-home-warm-ui.js` owns the optional DOM controls, shortcuts, transient help/toasts and number animation. `student-home-warm.css` owns the scoped tokens and layout. The original page and scene controllers continue to own authentication, saves, actions and camera logic. Default/Toy do not create the Warm controller or its extra controls.

## Evidence and test status

UI evidence is collected under [ui-warm-2026-10-30](ui-warm-2026-10-30/), including `screenshots/`, `comparison/` and verification records. The review covers normal mode, presentation mode, the robot remote and the whole-building view at actual **1440 x 900** and **1920 x 1080 CSS-pixel** viewport dimensions. Browser capture emulation used **DPR 0.5**; capture dimensions and normalization are disclosed in the evidence. This is desktop-browser/emulated viewport validation, not a physical projector, trackpad or mobile hardware claim.

Current recorded checks:

| Check | Result |
| --- | --- |
| Source home/account suite | 713 passed |
| Source complete suite | 855 / 856 passed; the pre-existing catalogue-count assertion expects 311 while the catalogue contains 376 |
| Public review core suite | 379 passed |
| Public focused suite | 58 passed |
| Public complete suite | 716 / 771 passed; the same 55 existing normalized display/source-text expectation failures, with no new failing names |

Assertions were not removed to make these totals appear green. Detailed records distinguish those known baseline failures from the completed Warm functionality.

Two different local test environments are deliberately distinguished:

- A disposable lab running the real platform handlers verifies account/selection/wallet integration with fictional data. It is separate from production.
- `scripts/qa/student-ui-review.mjs` is a standalone **fictional visual lab** using an explicit in-memory platform adapter and the real home service/builders. Its mock points are 150,000, purchases and construction are rejected before a pending operation is recorded, and its saves are temporary and removed on graceful exit. This lab does not prove real platform login or production wallet behavior. Its listeners and requests are loopback-only.

The visual lab can be started with `node scripts/qa/student-ui-review.mjs`. The review copy vendors Three and its actual imported addons. The Node loader and browser vendor paths fall back to that bundle without requiring npm installation. Canonical path checks reject encoded traversal and symlink escapes. The optional offline image-comparison script requires the declared Sharp development dependency; the viewer does not.

**Fresh-clone verification completed:** public implementation code 4431be6e4ce25c4185bf8a988a96d7f5508cdd28 was pushed to GitHub main and cloned back into a new directory. No node_modules directory or npm installation was present. Both the UI lab and Look Dev viewer started with vendored Three. The UI rendered all three views and the v4 robot, presentation mode and Dress up submenu worked, and zoom changed the scene while Reset restored identical sampled pixels. All five exported Warm-wall PNGs were byte-identical to the committed source baseline. Both pages reported zero browser console errors. See [the clone-back record](ui-warm-2026-10-30/fresh-clone.json). Later delivery changes contain documentation/evidence metadata only. Status: locally tested, committed, pushed; not deployed.

## Public source normalization

No real students, credentials, private filesystem paths, deployment details or production data are part of this handoff. Original reference materials remain intact as explicitly approved. The public interface uses six short semantic English labels for the main classroom controls; other inherited interface strings may intentionally remain `DisplayText` placeholders in the sanitized source-review edition. Those placeholders do not change the stable action IDs, prices, SKUs or saved wall IDs, and they should not be mistaken for the private application's localized copy.

## Copyable web-AI summary

> The Homeworld Warm candidate now combines the completed independent wall-style/color system with warm paper classroom chrome, an icon view dock, real bounded zoom/reset controls, presentation mode with an identity-safe student selector, a charcoal robot remote with dressing actions, guarded keyboard shortcuts, transient help/status messages and identity-safe points animation. Default/Toy, prices, SKUs, wallet rules and server security remain unchanged. Wall height/cutaway work is explicitly deferred. Read `docs/WARM_UI_HANDOFF.md`, `docs/WALL_SYSTEM_HANDOFF.md`, and the evidence under `docs/ui-warm-2026-10-30/`. Distinguish the fictional standalone visual adapter from the separate disposable real-platform integration lab. Existing baseline test failures are documented rather than suppressed. The tested code commit is 4431be6e4ce25c4185bf8a988a96d7f5508cdd28 in Tyresee/homeworld-source-review; a fresh GitHub clone without npm rendered the UI and all five Look Dev views, with zero browser errors. Later commits only finalize delivery evidence. Status: committed and pushed, not deployed.
