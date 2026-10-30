# Real-render look-development workflow

This is an isolated review tool, not a release of new game colors. The shipped default remains the default. Toy v1 is frozen as a reference; its known warm/dirty wall appearance, blue oak bathroom floor, and dark plinth are deliberately retained for comparison.

## Start without npm

```sh
node scripts/qa/look-dev-review.mjs
```

Open the printed loopback address in a WebGL 2 browser. The script prefers an installed Three.js package when present and otherwise reads the bundled vendor/three directory. It needs no platform, credentials, database, wallet, npm installation, CDN, or external model download. The HTTP service is bound to 127.0.0.1 and accepts GET/HEAD only.

## Fixed references

Every source render and PNG is 1440 x 900 pixels at DPR 1. The on-page preview scales a copy of that render; it never resizes the source camera/canvas. The renderer uses the actual classroom isometric camera/framing functions. Interior room footprints are fixed; the two-storey exterior uses the same house-building module. Each view contains the real v4 robot.

- Living: sofa, coffee table, television, floor lamp, rug and plant.
- Bedroom: timber bed, bedside cabinet, lamp, clothes rack and rug.
- Kitchen: cooker, sink, base cabinet, dining table and two chairs.
- Bathroom: toilet, vanity and towel rack.
- House: one storey with living room, kitchen, bedroom and bathroom, for the selected Warm wall cutaway.
- Exterior: two storeys and the existing roof.

Furniture starts with each actual catalogue product's current default color/material. The fixtures use the real placement validator. They are disposable reference data, never student records.

## Review in rendered space

1. Load default.json and inspect all six views.
2. Load toy-v1.json in the same window. Keep the camera and source resolution fixed.
3. Change tone mapping, exposure and real lights first. The diagnostics show actual resolved renderer/light values.
4. Change room wall/floor colors and floor texture using existing material maps. Check the actual roomSurfaces diagnostics, not just the input value.
5. Adjust shared architecture or the separate exterior facade roles. Specific room trim values take precedence over shared fallback trim.
6. Inspect the grayscale preview as well as color. Export a new JSON candidate for discussion. Do not silently promote a candidate to the product default.

ACES Filmic, Neutral and AgX use the real Three.js tone mapping implementations. Main-light azimuth/altitude are degrees around its actual target, using the existing fitted light radius. Sun direction can remain inherited. Geometry, object dimensions, collision, SKUs, prices and service validation are not editable here.

Default finish fields use null to inherit each original part's value. Several architectural roles have multiple original colors, so forcing a single guessed default would change the reference. Uncheck Inherit before assigning a color. A null material inherits the existing material, including the current oak bathroom finish. Toy v1 does not invent a tile material or recolor the robot.

Furniture examples starts as an empty object and has no effect while Product defaults is selected. Explicit examples may target an item ID or kind. They affect only the new local fixture, not a catalogue entry or an owned object.

## Exchange presets and captures

Export JSON downloads the complete in-memory candidate. Import JSON applies a local file only to this page; it does not upload it or write it to the server. Imported files are limited to 1 MiB, and unsafe prototype keys are rejected. The preset URL accepts simple file names from scripts/qa/look-dev-presets only.

Current PNG downloads one actual source render. All 6 PNGs captures every reference and downloads one ZIP, avoiding browser restrictions on consecutive automatic downloads. Each file includes the preset ID and view name. The grayscale checkbox is a preview aid; the reference PNG export remains the actual color render.

Only browser/desktop rendering is validated by this tool. It does not establish physical projector appearance, real touchpad feel, or a change to the shipped default. Source-copy normalization still applies; this repository is not a production deployment archive.

## Recorded validation

A fresh anonymous GitHub clone was started with only `node scripts/qa/look-dev-review.mjs`, without a node_modules directory. Both presets rendered all five views. Ten actual PNGs were downloaded through the workstation, each 1440 x 900. Camera transforms and triangle counts match within every preset pair; every furniture color matches its catalogue default. Browser console errors were empty.

AgX, exposure, actual main-light angles and JSON import/export were read back in the clean clone. A ceramic floor edit was also checked against the actual mesh material map in the source workstation. The screenshot gallery and machine-readable render readbacks are in [docs/look-dev-captures](docs/look-dev-captures/README.md).

Validation limits: null finish values intentionally inherit the existing per-part defaults; batch PNGs are packaged into one ZIP. The normalized full source suite has the same 55 display/source-text assertion differences as the earlier snapshot (728 of 783 pass). The verified core subset passes 379/379, and the new preset/safety/ZIP tests pass 4/4 without package installation. No assertions were weakened. No production deployment was performed.

The current sixth House view and six-image ZIP were added after the original five-view validation above. Current screenshots, exact unchanged baseline checks and fresh-clone delivery status are recorded in docs/WALL_CUTAWAY_HANDOFF.md and docs/wall-cutaway-2026-10-30/.
