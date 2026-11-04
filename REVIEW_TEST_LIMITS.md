# Validation of the normalized copy

## Current read-only share refresh (2026-11-04)

The default core list retains all 70 prior files and adds fourteen share-view, public-snapshot, share-dialog, metadata and portable-preview test files. It passes 659/659 checks across 84 files. The dedicated source share set passes 93/93, and the portable preview safety check passes 1/1, and the ten publisher retry/scope/ambiguous-outcome regressions pass 10/10.

```sh
npm test
npm run test:share
npm run test:share:publisher
```

The publisher command selects the ten new publication regressions from the actual account controller test file. It does not claim that the broader display-sensitive UI file is fully passing. The new share assertions use the normalized runtime's English or canonical display identifiers; no behavioral checks were removed. Earlier display-sensitive assertions remain available in the full suite.

The complete public suite was not re-run for this refresh. The 55 normalization-sensitive failures reported below are historical counts, not a new whole-suite result. The original localized implementation passed 1,698 tests for the merged exterior-only sharing and WeChat copy update; that result is separate from this normalized copy.

The standalone sample preview requires Node and a WebGL 2 browser, using the licensed vendor runtime without npm. It has no account or save API. Its current browser evidence and the exterior-only navigation contract are under `docs/qa/share-view-2026-11-04/`. Physical-device acceptance is not claimed.

## Earlier delivery validation (historical)

All 845 included checks were attempted in this review copy: 790 passed and 55 did not pass. The failing assertions involve display/source-text expectations affected by normalization; they are retained unchanged in the review package rather than weakened to force a pass. The 55 failing test names are identical to the previous snapshot; there are no new failing test names. This is not a production test result.

The default core subset now includes all ten new free-visit test files and passes 436/436. The focused viewing suite passes 67/67. The new look-development preset/safety/ZIP tests pass 4/4 without installing dependencies. The real no-node_modules browser matrix is recorded separately in LOOK_DEV_REVIEW.md.

`npm test` runs the independent passing-file subset listed in CORE_TESTS.json. `npm run test:all` runs all included files and is expected to report those normalized-copy differences. Full production validation remains the implementation agent's responsibility against the original localization and namespace.

Display-sensitive files:
- `tests/student-home-entrance-clearance.test.mjs`
- `tests/student-home-floor-planner.test.mjs`
- `tests/student-home-resale-shop.test.mjs`
- `tests/student-home-robot-controller.test.mjs`
- `tests/student-home-robot-editor.test.mjs`
- `tests/student-home-robot-elevator-controller.test.mjs`
- `tests/student-home-robot-elevator.test.mjs`
- `tests/student-home-robot-quick-actions.test.mjs`
- `tests/student-home-robot-state-editor.test.mjs`
- `tests/student-home-robot-television.test.mjs`
- `tests/student-home-stage-camera-ui.test.mjs`
- `tests/student-home-wardrobe-ui.test.mjs`
- `tests/student-homes-commerce.test.mjs`
- `tests/student-homes-elevator-commerce.test.mjs`
- `tests/student-homes-payment-http.test.mjs`
- `tests/student-homes-resale-commerce.test.mjs`
- `tests/student-homes-robot-state.test.mjs`
- `tests/student-homes-ui.test.mjs`

Current Warm wall/floor/UI focused tests pass 74/74. The new UI lab safety tests are included. See docs/WARM_UI_HANDOFF.md and docs/ui-warm-2026-10-30/tests.json for the current source and public totals and no-new-failure comparison.

The current cutaway delivery adds nine geometry/compatibility tests and three House-fixture tests. See docs/wall-cutaway-2026-10-30/tests.json for current totals and unchanged failure-name evidence.

Current free-visit evidence: [ROAM_HANDOFF.md](docs/ROAM_HANDOFF.md) and [test summary](docs/roam-2026-10-30/measurements/test-summary.json). The source full suite is 931/932 with its one previously documented catalog-count assertion; both source builds pass. All 55 public normalization-sensitive failure names match the pre-visit baseline. The new viewing tests remain in the passing core list; no old failing assertions were removed or weakened.

Current multi-floor delivery: public core 495/495 across 70 files, with all four new model/transport/TV files added and all old entries retained. The no-install focused set is 123/123. Formal service static-vendor tests still expect an installed Three package; the standalone review tools and fictional UI lab load the bundled licensed vendor tree without npm. See [the latest handoff](docs/MULTIFLOOR_ROAM_HANDOFF.md) and its test evidence for current boundaries.
