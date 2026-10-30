# Warm floor candidate: implementation and review

This changes the optional `?theme=warm` candidate. The no-parameter default and `?theme=toy` keep their existing visual path. No deployment is included.

## Appearance source status

The requested `warm-v6` lighting/wall/backdrop JSON and reviewer comparison images were not present in the supplied files, current source, Downloads, or public repository main. They were requested from the user. Until supplied, `warm-floors.json` explicitly says appearance source pending and inherits the existing default lights, walls and backdrop. It must not be described as matching warm-v6 or the unavailable reference images.

## Saved fields and commands

The floor skin gains one optional string `finishId`:

- Starter/shared floor: `commerce.home.surfaces['floor.main'].finishId`.
- Functional room: `commerce.home.rooms[].floor.finishId`.
- Upper storeys: the same fields in the corresponding `commerce.upperFloors[]` home.
- Purchased room inventory: its `owned[].item.floor.finishId` is reconciled with the placed room.

The existing schema version is retained. Known IDs are accepted on floor skins only; walls, furniture and unknown IDs are rejected. The authenticated command is `{type:'setFloorFinish', surfaceId, finishId, storey}` through the existing revision/idempotency/identity checks. It costs zero, creates no SKU/order/inventory item and does not reserve or debit platform points. A repeat selection is a no-op. The internal clear operation accepts `finishId:null` and removes only the optional field; it is not an extra UI choice.

Legacy `color` and `material` fields stay unchanged. An explicit valid finish uses its catalogue color and pattern in warm, while default/toy continue to render the original fields. No old data is migrated during rendering.

## Legacy fallback

Without finishId, the original color/material pair is compared with the room kind's original defaults (or the engine's distinct floor.main defaults). An unchanged pair displays the room-type finish. A custom oak pair displays wide wood with the saved color; a custom ceramic pair displays 1.4 m tile with the saved color. Other old materials keep their original path.

Historical saves have no painted/not-painted flag. A deliberate repaint back to the exact original color/material pair cannot be distinguished from untouched data; this edge case uses the room-type default. No guessed historical metadata is written.

## Texture ownership and scale

Furniture oak maps are untouched. Neutral floor maps multiply the selected finish color. Seed 7 creates deterministic 1024 px maps, cached by pattern. Wood repeats every 2.4 m: wide/washed boards are 0.20 m, narrow boards 0.12 m; the reference herringbone uses 0.12 m strips, 0.60 m columns and approximately 0.8485 m boards. Ceramic repeats one square every 1.4 m and preserves the existing ceramic grid proportions.

Each floor owns a texture transform. Actual vertex bounds, world scale and location determine UV/repeat/offset, including rounded floors and stair cutouts. Clones share cached source images; reference-counted release covers scene rebuilds and whole-house snapshots. Warm omits the old painted floor overlays so they cannot cover the new finish; default/toy retain those overlays.

## Interaction and review

Right-click a floor, open Floor, then choose from six wood or eight tile samples. The thumbnails use the actual cached texture source. One click applies and saves with lightweight feedback. There is no new permanent panel or confirmation step. Open menus are bound to the current student, storey and view.

Look Dev adds all 14 finishes to Floor material / finish, with per-room floorFinishId JSON values. Choosing a finish explicitly enters the warm candidate. Its catalog color is shown read-only; legacy material controls remain available for color experiments.

## Validation evidence

Validation counts, rendered reference views, default/toy hashes and actual-application crops are recorded alongside the public review gallery. Full local application screenshots are kept in the local QA output; public crops remove product UI and account labels. Actual application testing uses the existing real handlers on a disposable loopback platform with fictional students, never production records.

## Recorded checks

- Account home verification: 688/688 pass; final account-only build succeeds.
- Final focused finish, texture, menu, theme and Look Dev checks: 44/44 pass.
- Final source full suite: 802/803 pass. The only failure is the pre-existing catalogue-count assertion (376 actual, 311 expected), independently reproduced at the original base; this task adds no SKU.
- All ten default/toy PNGs are byte-identical to the preceding reference gallery. Warm camera transforms match those references. All real catalogue furniture colors/materials remain defaults.
- Fourteen actual-application finish selections each produced a delivered zero-amount receipt. The same fictional student retained the selected bedroom/kitchen finishes after refresh and switching students; the second fictional student's surfaces stayed untouched.
- Pending: warm-v6 appearance source, reviewer reference images and therefore the requested visual-match sign-off. No physical projector or production verification is claimed.

Public normalized package validation: core 379/379 and focused floor/Look Dev 27/27 pass with locked dependencies installed. Full included suite: 663/718 pass; the same 55 normalized display/source-text failure names remain, with no new failure names. The browser review page separately uses checked-in vendor modules without npm.

A fresh anonymous clone of the published code was started with Node only, without node_modules or npm installation. All five warm views rendered with the bundled Three modules. The five downloaded 1440 x 900 PNGs were byte-identical to the source captures, and browser console errors were empty.
