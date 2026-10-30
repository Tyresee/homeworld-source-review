# Free-visit corrections — 2026-10-30

Implementation and evidence for the correction pack based on public commit `3e9c6166668a096bfe5335914a73f75792f173c9`.

Status: implemented and tested locally; see the delivery commit on GitHub for committed/pushed status. **Not deployed.** No account data, wallet, prices, persistence schema or business validation changed.

## Evidence

- [All fourteen scene captures](renders/): original twelve cases, retaken with the corrected House arrangement, plus paired `11a`/`11b`. PNGs are actual 1440 × 900 renderer exports, without UI or image adjustment. Matching JSON records the actual controller, camera, lighting, scene ownership and unchanged fixture state.
- [Contact sheet](contact-sheet.png): reduced previews only; use original PNGs for review and measurement.
- [Six classroom-language UI proofs](ui/): exterior, entrance hover, newly entered living room, a real faucet hover and both help cards. These are browser screenshots cropped to the stage, not re-created UI.
- [Photometry](measurements/photometry.json), [ROI masks/coordinates](measurements/), [approved acceptance adjustment](measurements/acceptance-adjustment.json).
- [Tests](measurements/tests.json), [existing public failure-set comparison](measurements/test-baseline-comparison.json), [five-view Default/Toy image comparison](measurements/baseline-regression.json).

## Entrance and fixture

`getManorFacadeLayout(home, {theme, structure})` uses the new room-priority rule only when the explicit theme is `warm`. Other themes and unscoped business callers retain the previous selector. Candidates must fit the authored door width; type ranks before front/right orientation and the old order resolves remaining ties. Warm slab facade bays are split at actual adjacent room boundaries before ranking, so a narrow room cannot borrow a neighbour’s width to fit a larger door. House model fingerprints before/after this extra boundary fix are identical.

The review-only House swaps the living/bedroom rows and moves their furniture by ±5.2 m; kitchen/bathroom remain unchanged. The door is now in the living room. Production saves require a canonical living-room cell, so this rearranged QA House is deliberately marked `accountSaveCompatible: false`. The QA validator applies the exact inverse transform and then calls the unchanged real validator. The displayed House still fails production save validation; it is never written or offered as a student account layout. The original five reference fixtures remain unchanged; the sixth House view intentionally changes.

Warm visual door/steps and free-visit entry use the Warm selector. Existing account placement reservations use their previous unscoped selector to preserve the instruction against changing business validation. This is a known boundary: the correction does not migrate old saved entrance-clearance reservations.

## Daylight through doors/windows

An isolated view-only outdoor group supplies an unlit sky gradient, ground, paving and clones of the actual modeled entrance steps. Its output is independent of indoor exposure. It adds **zero lights**, casts no extra shadows, touches no saved surfaces and is visible only during interior free view. Leaving restores the original exterior presentation. Indoor light intensities/exposure remain unchanged.

The paired legacy image disables only this new presentation group using the QA-only `?outdoor=legacy` parameter. It uses the same revised House and camera, isolating compensation from the separate layout change. It is not a new account preference or shipped theme option.

## Floor lamp and the accepted measurement change

The main point is intensity 16, distance 5, decay 2; the shade emits `#ffc477` at 1.6. One fixed, non-shadow-casting downward spot produces a 1.4 m floor pool. On/off only changes light intensities, with no dynamic light allocation. Ceiling lights are unchanged. The on-state privately clones the shade material and warms its diffuse base to `#fff4df`; switching off/disposal restores the borrowed original material and color.

Measurements use encoded sRGB luma `(0.2126 R + 0.7152 G + 0.0722 B) / 255`, without linearization, resizing or color correction. Geometry-derived masks exclude occluders. The nearest-wall ROI is the real intersection of a 1 m sphere about the lamp with the nearest wall, not a hand-picked bright patch. Identical masks and camera are verified for each pair.

| Measurement | Result |
| --- | --- |
| Door aperture mean | 0.760084 |
| Door aperture population standard deviation | 0.055728 |
| Aperture pixels with luma ≥ 0.97 | 0% |
| Indoor walls/door change against legacy presentation | −0.000803% |
| Lamp nearest-wall off/on mean | 0.849731 / 0.923420 |
| Lamp nearest-wall mean increase | 8.672% |
| Shade on mean / same-image visible wall mean | 0.885310 / 0.874937 |
| Floor-pool mean increase | 25.271% |

The original encoded-sRGB wall +25% requirement is **not passed**: an off mean of 0.849731 permits at most +17.684% even if every on pixel becomes white. The user explicitly selected preserving ceiling lights and evaluating the visible on/off contrast and local floor pool instead. The raw report retains the original `false` flags; the separate adjustment record describes the accepted replacement. No metric has been silently redefined.

## Copy/build policy

Classroom-language strings live in the centralized `home-roam-copy.js` table. The source application and local QA default to `zh-CN`; `?locale=en` selects English. Source application verification used the disposable students Sam/Robin, no real records or purchases.

The public review export retains natural English defaults and removes the classroom-language table data under the established anonymization policy. `?locale=zh-CN` in that export consequently uses the English alias; it cannot reproduce the classroom-language screenshots. Those screenshots document the source product build. All interaction logic uses table keys. Reviewer-supplied reference material is preserved byte-for-byte under its separately approved publication policy.

## Run without npm

```sh
node scripts/qa/roam-review.mjs
```

Open the printed loopback URL. Use the fourteen case buttons. `Hover selected` sends a QA-only pointer move projected from the actual selected mesh, through the real hover/raycast path; it does not fabricate tooltips. The photometry button exports actual visibility masks and world/projected ROI metadata.

To recompute the committed measurement with no packages:

```sh
node scripts/qa/roam-photometry.mjs docs/roam-2026-10-30-fixes/measurements \
  --masks docs/roam-2026-10-30-fixes/measurements \
  --output result.json
```

The JSON report deliberately retains the failed original +25% wall criterion. QA routes are loopback-only, read-only and have no accounts or wallets. Vendored Three 0.186.1 and licensed model dependencies are included.

## Verification limits

Core tests pass. Source full-suite baseline retains one unrelated catalogue-count failure (expected 311, actual 376). The public full suite retains its exact prior 55 normalization-sensitive failures; no failure names were added. The unchanged source production builds pass. This review repository intentionally excludes production deployment configuration. Physical classroom hardware, actual production student homes and live deployment were not tested or changed.
