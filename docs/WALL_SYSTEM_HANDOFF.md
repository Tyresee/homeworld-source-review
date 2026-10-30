# Warm wall system handoff

This candidate is enabled only by `?theme=warm`. The shipped default and `?theme=toy` retain their original wall rendering and menus. No production deployment is part of this delivery.

## Delivered behavior

Each room has independent wall style and color choices: three styles and five colors, giving fifteen combinations. Right-click a real wall, open the wall submenu, and select a style or color. The choice is applied and automatically saved without confirmation. Styles do not consume paint or points and do not create a product, order, or payment. The menu captures the original wall target and rejects stale student, floor or view actions.

The Look Dev workstation exposes independent `Wall style` and `Wall color` controls for each room kind. `warm-walls.json` preserves the approved warm-floors lighting, backdrop, floors, furniture defaults and shell appearance, while changing every room's default wall to plain warm white, including the bathroom. The former generic wall material control remains explicitly available only for baseline experiments; Warm uses the dedicated wall textures.

## Storage contract

No schema version bump or migration rewrite was introduced. Current wall skins retain their existing required `color` and `material` fields and gain two optional whitelist fields:

```json
{"color":"#123456","material":"ceramic","styleId":"wall-dots","colorId":"wall-apricot"}
```

The raw legacy color/material remain intact. An explicit `colorId` controls the Warm appearance; removing the URL theme parameter restores the original rendering from the legacy fields.

- Starter room: `commerce.home.surfaces["wall.inner"|"wall.outer"|"wall.side"]`. Selecting any starter wall updates the selected field across all three starter skins.
- Added rooms: `commerce.home.rooms[].wall`. The corresponding placed owned-room item's `wall` metadata is synchronized.
- Upper storeys: the equivalent fields in `commerce.upperFloors[]`. A command changes only its selected storey.
- `styleId`: `wall-plain`, `wall-stripe-fine`, or `wall-dots`.
- `colorId`: `wall-warm-white`, `wall-apricot`, `wall-mist-blue`, `wall-lavender`, or `wall-slate-blue`.

The server command is `setWallFinish`, with a real wall `surfaceId`, a zero-based `storey`, and exactly one of `styleId` or `colorId`. Example:

```json
{"type":"setWallFinish","surfaceId":"room:example-bedroom.wall","storey":0,"styleId":"wall-stripe-fine"}
```

The normal authenticated command envelope still requires actor/student access, expected revision and idempotent command ID. Unknown IDs, non-wall targets, two selectors at once, nulls, extra pricing fields, and invalid storeys are rejected. Repeating the same choice is a no-op. A zero-value receipt is recorded for a changed selection; no wallet reservation or payment is made.

Without new IDs, Warm displays plain warm white when the raw saved color matches the original room/surface default, and plain wall with the original saved custom color otherwise. A style-only change preserves an earlier custom color rather than forcing a color ID. This is display resolution only; opening a legacy save does not insert IDs. Historical v1/v2 validation remains strict and follows its existing migration rules. As before, the old format cannot distinguish an untouched color from one deliberately painted back to the exact same default hex value.

## Real rendering

`home-wall-textures.js` owns the wall-only neutral source canvases, preview samples and reference-counted textures. It does not replace furniture linen, oak or other shared maps. The source is 1024 pixels with deterministic seed 11; each pattern canvas is generated once and reused, with independent per-mesh transforms. Physical UVs use a 1.2 m horizontal tile and 2.85 m vertical tile. Geometry dimensions and object scale determine metre UVs rather than stretching one bitmap over a whole room.

Fine stripes have a 10 cm cycle and 5 cm dark band. Dots have 12 cm staggered spacing and a true 2.8 cm diameter. The supplied prototype drew circular bitmap pixels on a non-square world tile, producing dots about 6.65 cm tall in world space. The user explicitly approved correcting these to true 2.8 cm world circles; the original reference images remain unchanged. Exposed end faces use physical UVs rather than reproducing the prototype's distorted side UVs.

Public outer wall spans are split at room boundaries by clipping the original triangles. Original window openings, wall IDs, mounted-item targets and collision solids are retained. Multi-floor overview copies retain and release texture leases. Shared partitions must resolve their two room-facing surfaces independently; the final acceptance record describes the additional shared-face check.

## Reference and evidence locations

- Original reviewer pack, unchanged bytes except prototype relocation: `docs/look-dev-captures/review-walls-2026-10-30/`.
- Prototype is documentation only under that folder's `prototype/`; it is never imported by runtime code.
- Import provenance lists original and repository paths, byte counts, SHA-256 hashes and archive hash.
- Candidate screenshots, diagnostics, comparisons and application checks: `docs/look-dev-captures/warm-walls-2026-10-30/`.
- Actual implementation: `home-wall-finishes.js`, `home-wall-textures.js`, `home-wall-geometry.js`, `home-wall-menu.js`, scene/room integration, editor, engine, commerce validation and server command handling.

Run the offline viewer with `node scripts/qa/look-dev-review.mjs`, then open `http://127.0.0.1:19534/?preset=warm-walls.json&view=living` using its printed port. The viewer falls back to vendored Three when node_modules is absent. It has no account, wallet or save writes. PNGs stay at 1440 x 900. The optional comparison script needs the existing Sharp development dependency; the viewer itself does not require it.

Reference captions and README are preserved as explicitly authorized. The public implementation continues to use the normalized source-review naming and contains no production account data, private deployment information or credentials. Full application captures with local test labels remain local; public application evidence is cropped to the fictional scene.
