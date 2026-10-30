# Warm interface public-review comparison

Reviewed 2026-10-30. This report covers the normalized public review copy, using eight actual application PNGs: ordinary, presentation, remote-open and building views, each at 1440 x 900 and 1920 x 1080. These are the final-code captures recaptured by the parent with the clean fictional Robin student. All eight final actual images were opened and independently inspected. No source, account or browser state was changed by this audit.

## Result

**PASS for the supplied public Warm UI capture set, with the disclosed differences and limits below.** No blocking control overlap, visible text truncation, interface overflow or off-screen required control was found. This is not a pixel-identical reproduction claim.

- Ordinary mode retains the roster and header with the warm paper palette. The selected student, page title, real 150,000-point wallet, coin icon, presentation entry and help control are readable.
- Presentation mode hides the top header and roster, expands the scene and shows the student selector beside the title. Exit presentation and help remain available.
- The final illustrated view dock, separate Showtime control and camera group match the intended hierarchy and corner placement. Short normalized labels Interior, Outdoors and House fit the 64 px icon targets. The earlier risk of a long generated placeholder expanding the House button is not present in these actual captures.
- The remote's charcoal screen and warm neutral housing are visible, while green, blue and coral action buttons retain their distinct established colors. Dress up is visible. The remote remains inside the viewport and does not cover the camera buttons.
- In building mode, the House icon is selected and the indoor-only Showtime action is disabled. The house is visible with the camera tools still accessible.
- Remaining DisplayText placeholders are intentional source-review normalization. They change line wrapping and panel height, especially in the wallet note and remote action descriptions, but the visible strings stay inside their containers in this set. These placeholders are not the source product's final copy.

## Runtime readback

The parent supplied a live DOM measurement record. This audit independently checked its bounds and gap arithmetic; it did not perform those browser reads itself. See [layout-checks.json](layout-checks.json).

| Measurement | Recorded value | Result |
| --- | --- | --- |
| Page title font, sampled at 1440 | 30 px | Matches requirement |
| Main balance font, sampled at 1440 | 34 px | Exceeds 32 px minimum |
| Remote screen gradient | rgb(74,68,64) to rgb(43,38,34) | Equals #4a4440 to #2b2622 |
| Document at 1440 x 900 | scrollWidth 1440, scrollHeight 900 | No document overflow |
| Document at 1920 x 1080 | scrollWidth 1920, scrollHeight 1080 | No document overflow |
| View dock to Showtime control | 52 px gap at both measured sizes | No control-box overlap |
| Remote to camera group, measured at 1440 | 16 px gap | No control-box overlap |
| Supplied control rectangles | All within their stated viewport | Pass |

The provided numeric measurements describe presentation control geometry, not a fresh measurement for every one of the eight screenshots. In ordinary mode the left roster shifts the dock and Showtime control to the right; this is visible and remains clear of the scene controls. The 1440 record contains the wallet, view dock, Showtime, camera group and open remote. The 1920 record contains the wallet and the three dock/control groups; its open remote was checked visually in the supplied 1920 image rather than inferred from an absent numeric rectangle. Supporting font sizes are visually legible and defined by the Warm stylesheet; this record directly measures only the page title and main balance fonts.

## Reference mapping and native-pixel pairs

References are 1600 x 900; actual captures use the two explicitly requested viewport sizes. Each pair places the original reference on the left and actual public PNG on the right, with no image rescaling, registration or color correction. Only an external label band and neutral gutter are added. A 900 px reference beside a 1080 px actual leaves neutral space below the shorter image. The individual source images retain their supplied viewport pixels.

| Actual state | Reference intent | 1440 x 900 actual | 1920 x 1080 actual |
| --- | --- | --- | --- |
| Ordinary | 05-proposed-skin.png: paper shell, roster, header, wallet | [Native pair](pair-normal-1440.png) | [Native pair](pair-normal-1920.png) |
| Presentation | 07-proposed-icon-dock.png: full scene and final corner tools | [Native pair](pair-present-1440.png) | [Native pair](pair-present-1920.png) |
| Remote open | 06-proposed-presentation-mode.png: presentation plus remote | [Native pair](pair-remote-1440.png) | [Native pair](pair-remote-1920.png) |
| Building | 08-proposed-dock-building-view.png: house view and selected dock state | [Native pair](pair-building-1440.png) | [Native pair](pair-building-1920.png) |

Exact dimensions, capture paths and SHA-256 hashes are in [pairs.json](pairs.json). The contacts use only normalized public actual screenshots and the already approved reviewer reference images. Local source-language application captures are not included.

## Intended differences from temporary screenshots 05–08

1. The written final specification replaces the old top text-button row. References 05 and 06 still show that older row, while 07 and 08 show the intended dock. The implementation combines the final dock with the paper styling and remote, rather than copying obsolete controls from the earlier snapshots.
2. The explicit local visual adapter supplies a valid fictional 150,000-point balance. The temporary reviewer harness displayed an unavailable dash; that dash is not target behavior.
3. A real student selector is implemented beside the presentation title. The prototype does not show this required interaction.
4. The requested charcoal remote screen supersedes the earlier green prototype screen. The remote housing/antenna/face use warm neutral accents; colored action buttons remain colored. Its 76 px left shift from the old right-edge position leaves the camera group usable.
5. The interface applies the requested larger typography even where prototype descriptions used 13 px. Public placeholder text can require more lines than the source language or short prototype captions, so wallet/remote panel heights are not expected to be identical.
6. The scene retains the already accepted wall/floor finish implementation; the UI references were made against an earlier scene snapshot. Wall-height and cutaway changes remain explicitly deferred and are not part of this delivery.
7. The final captures use a clean starter home for fictional Robin. The inspected remote and building references also show starter-home content. This set verifies the interface shell and control placement; it does not establish coverage of a densely furnished or expanded multistorey home.
8. Some frames show a short-lived status toast over the lower scene after a view or account action. The old permanent instruction line is absent. The screenshots alone do not prove the timeout or error-retry persistence; timer tests and parent interaction evidence cover those behaviors separately.

## Boundaries

- The parent capture record reports browser-emulation DPR 0.5. The 3D models appear softer than in the supplied references. The captured viewport PNGs have not been rescaled here, but equivalent 3D sampling quality, projector readability at room distance and production device performance are outside this review.
- No whole-frame pixel error is used as a pass criterion. Viewport aspect ratio, fixture name, valid wallet content, placeholder copy, accepted wall appearance and capture sampling differ. Such a statistic would conflate known content differences with UI fidelity.
- The pair images and SHA-256 records were regenerated from the final eight Robin PNGs supplied after the parent's final-code recapture. Hashes identify those exact PNG bytes, rather than an earlier Sam fixture or pre-refinement capture. The parent owns final export, commit and publication metadata; this audit does not invent a commit hash.
- Default/Toy regression images, keyboard and zoom behavior, account isolation, free wall saving, security boundaries and complete test-suite status are separate parent QA evidence. Visible controls do not by themselves prove their actions work.
- No code change is recommended from this final public set. The short semantic dock/action labels fit, long metadata placeholders remain bounded, and the measured rectangles support the visual no-overflow conclusion.
