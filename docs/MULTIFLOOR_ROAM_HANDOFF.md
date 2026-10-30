# Multi-floor free-visit delivery

The Warm free-visit scene now renders every purchased floor, each floor's own room plan and furnishings, and its real stair/elevator connections. The previous implementation received only the ground floor, which explained the missing upstairs and elevator.

The new `home-roam-model.js` owns the complete disposable building and real slab/ceiling openings. `home-roam-transport.js` plans viewer travel through the existing straight stair flight or an opening/boarding/closing/riding/exiting elevator. Both floor buttons and clicking the connection use that route. Escape/Leave from upstairs first returns through the actual connection before the ground-floor door sequence. Arrival uses continuous yaw rather than flipping through a zero-length look vector.

Televisions now have power and remote/channel targets in free visit. The existing four program frames render into private canvas textures at 8 fps. Cross-floor target IDs, tap/effect heights and ceiling shadow positions are isolated correctly. The Warm application is constrained to the viewport; its roster scrolls internally and its bottom controls wrap with a safe margin.

This is a temporary viewing feature. It does not write account, home, robot-activity or wallet state and changes no products, prices, schema, authentication or default/Toy rendering. The original live editor remains paused and is restored on exit. Free flight still permits passing through walls, as before.

## Verified boundaries

- Source relevant tests: 100/100.
- Source full-suite snapshot: 1005/1006. The known unrelated catalog-count assertion still expects 311 instead of the existing 376; it was not changed.
- Public no-install focused tests: 123/123; final interaction/controller repeat: 25/25.
- Public core uses the standard dependency environment; the complete result is in PACKAGE_AUDIT.json. Four new passing model/transport/TV test files were added without removing old tests.
- The loopback UI lab runs the actual home service with explicit fictional platform data. Sam has two different floors, a purchased elevator and a TV/sofa on each floor; Robin remains a starter home. Purchases are disabled and the temporary store is removed on shutdown.
- Source browser checks physically entered the door, reached floor 2, powered its TV, changed Forest to Weather through the real remote, and left through the elevator/door route. The anonymized browser copy separately repeated actual door entry, elevator travel to 2F, television power and remote switching to Weather with an immediately refreshed action label.
- Dock geometry was checked at real unscaled 1440×900, 1280×720 and 1024×600 child browsing viewports, including projection and visit modes. The QA iframe contains the real application, not a simplified mock. See [viewport evidence](qa/multifloor-roam-2026-10-30/viewport-proof.json).
- Browser/synthetic-account checks are not physical classroom performance certification or real-student transaction tests.

## Reproduce without npm

```sh
UI_REVIEW_FIXTURE=multi-floor UI_REVIEW_PORT=19564 node scripts/qa/student-ui-review.mjs
```

Open the printed entry, or `/qa/viewport?width=1280&height=720` on that loopback server. Select Sam, choose Visit, click the actual exterior door, then choose 2F or click the elevator. The 1440×900 and 1024×600 viewport pairs are also supported. The service uses the included licensed Three bundle when node_modules is absent. Stop it with SIGINT after review.

The surrounding account UI intentionally retains normalized DisplayText placeholders; this public copy is for source review, not a full product translation. Free-visit controls use real English labels. No real students, credentials or deployment settings are included.

## Copyable reviewer summary

The multi-floor visitor is now implemented against the real saved floor list, with distinct per-floor layouts and furnishings, a single physical stairs/elevator connection, real openings, continuous floor travel and a proper upstairs exit route. TV power and remote channel interactions work in the temporary view. Bottom controls remain inside the viewport. Review the new model/transport modules and their tests; preserve the temporary no-save boundary and the original editor/account behavior. See PACKAGE_AUDIT.json for the exact test status and this document's linked browser evidence. Deployment receipts are maintained by the implementation owner, outside this source-only copy.
