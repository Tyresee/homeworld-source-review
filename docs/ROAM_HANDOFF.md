# Warm free viewing delivery — 2026-10-30

This is a Warm-only source review candidate for `Tyresee/homeworld-source-review`. It is not deployed. Production defaults, Toy, accounts, wallets, prices, inventory, construction, placement and robot activities remain owned by their existing systems.

## Run without npm

```sh
node scripts/qa/roam-review.mjs
# http://127.0.0.1:19550/
```

To choose another loopback port:

```sh
ROAM_REVIEW_PORT=19551 node scripts/qa/roam-review.mjs
```

The tool loads the real `createHomeScene`, room/manor builders, furniture builders, approved Warm finishes and robot v4 GLB. It uses `vendor/three` when `node_modules/three` is absent. It has no account, wallet, command endpoint or persistence. The 12 case buttons reset disposable viewing state; the QA pose field only repositions this review camera. Use “Play clock” for continuous interactive movement in this QA page; paused time is for fixed captures. “Play clock” uses real elapsed time; PNG capture uses deterministic controller/interaction time. The two measurement buttons collect foreground animation-frame intervals and actual render-call CPU durations, not GPU timer results.

The ordinary application enables this feature only with `?theme=warm`. Its fourth view icon is Visit, with shortcut `4`. Other views or orbit-mode Escape return to the original editor. Indoor Escape/Leave plays the exit sequence first.

## Implementation and ownership

- `home-roam-controller.js`: an independent PerspectiveCamera and OrbitControls, temporary input and door/free-camera state machine. No editor camera mutation or save capability.
- `home-roam-world.js`: disposable rendering of the actual first-floor data. It freezes/copies the live rigid robot pose, builds the real models, owns viewing lights, surface picking and the single on-demand render chain, and releases temporary resources on exit or setup failure.
- `home-roam-geometry.js`, `home-estate-manor.js`, `home-room-expansion.js`: Warm/roam-only modeled architecture. Ordinary model output is pinned by regression tests.
- `home-roam-interactions.js`, `home-roam-audio.js`: generic real-part recognition, reversible local animations, and gesture-unlocked synthesized audio. No robot commands or account writes.
- `home-roam-ui.js`, `home-roam.css`: temporary viewing controls, help and hover feedback. The application dock and editor guards are wired through the existing account editor/world wrapper.

The original orthographic renderer pauses while viewing. Its complete camera snapshot is restored on exit; the live robot controller pauses presentation without checkpointing, resetting a pose or advancing an activity. Pending entry is invalidated on identity changes. Editing/commerce/robot command entry points are blocked during the handoff. A robot whose live presentation is upstairs is not transplanted into the first-floor viewing copy.

## Modeled doorway

The optional Warm/roam manor is a hollow shell made from approximately 0.2 m boundary walls, with an arched opening in the authoritative `getManorFacadeLayout(...).entrance` face. The arch frame is an extruded ring with an empty center. A thick, double-sided leaf and its handles are children of a real modeled hinge. The room expansion builder creates the matching interior opening from the same doorway dimensions and coordinate mapping.

The hinge rests at the inside edge of the modeled wall reveal, with half the 6 cm leaf thickness allowed for. Front and right entrances, all three door sizes, and the complete 0–1.8 rad swing are checked against the solid wall and arch.

The same modeled hinge and arch have a separate visibility layer in the viewing scene: hiding the exterior shell from indoors must not hide the opened door. This moves no saved furniture and does not rebuild a prototype-exported scene. No 180-degree house rotation, lamp relocation, `house.b64` loading or runtime wall surgery is used.

Orbit cutaway uses wall-plane separation, a 0.5 m remaining wall and a 0.045 m dark cap. Supporting wall identifiers hide their own windows and wall-mounted furniture. Entered free view restores full walls and downward ceilings.

## Lights and rendering

The indoor light setup follows the package values: sun/fill zero, hemisphere 1.05, exposure 1.22, ceiling emissive strength 0.32, one current-room shadow master at intensity 24 and other enabled room lights at 18. Doorway peek uses 70 percent. Light counts remain fixed. The master shadow uses 1024 resolution, bias -0.002 and normalBias 0.025; ordinary directional shadows use PCF, bias -0.0006 and normalBias 0.035.

A shadow-casting but initially switched-off master must allocate its shadow map once. Skipping that bootstrap produced a real empty-canvas failure during browser testing; initialization now occurs once even outside, then outside shadow updates stop. Dedicated regression tests cover bootstrap, room changes and outside restoration. Idle OrbitControls settles and stops requesting frames; continuous water/fire or camera motion keeps the one render chain alive.

## Acceptance evidence

The [12-view contact sheet](roam-2026-10-30/contact-sheet.png) provides a quick overview. Final 1440 × 900 scene PNGs are in [roam-2026-10-30/renders](roam-2026-10-30/renders). Matching controller, target, lighting and fixture-immutability diagnostics are in [measurements](roam-2026-10-30/measurements). Separate browser captures in `ui/` show real DOM controls; downloaded scene PNGs intentionally contain no synthetic UI overlay.

| Requirement | Evidence and result |
| --- | --- |
| Door click, not an orbit drag | Real browser click entered the authoritative room. Controller tests enforce the strict 6 px click threshold; the scene uses that result before entering. |
| Door visibly opens onto an opening | Real modeled leaf/hinge and interior aperture, geometry ray tests, cases 04 and 07. |
| Physical keyboard codes | Real Three/OrbitControls tests and the foreground movement measurement use `key: Process`, `code: KeyW/KeyS`; Shift/E/Q and arrow semantics are covered by controller tests. A physical non-Latin input-method session was not separately certified. |
| Free movement, flying and click glide | Controller tests cover no-collision movement, height/pitch/time bounds and glide; the isolated account UI was exercised with keyboard movement and door transitions. |
| Indoor light and room handoff | Cases 05–12 and lighting-state tests verify directional lights zero, room master/other lights, peek/restoration and ceilings. |
| Exact House interactions | 18 targets: four ceiling lights, one floor lamp, two hobs, six drawers, two faucets, two cabinet doors and one toilet. Real-builder recognition tests, rotation tests, reversible animation tests and cases 08–12. |
| First visible surface, 6 m range | The experience checks the complete visible scene before accepting the interior registry hit; registry ray/range tests cover occlusion and reach. |
| Exit/camera restoration | Actual game camera snapshot is strictly equal before/after QA entry. The isolated account application stage is identical at decoded-pixel level after a complete entry/movement/exit cycle. |
| No save changes | Two fictional account homes retained byte-identical backing files and revisions through viewing and student switching. Interaction state resets on teardown/re-entry. No real student records were used. |
| Default/Toy unchanged | Ten committed baseline PNGs (five per theme) are byte-identical and decoded-pixel-identical to public commit `0b353a0f61f7d1ddaa7b4c66ef8d395c5a18961a`. Two additional House views match the previous local delivery output. |

## Measured performance

See `measurements/performance-entry-final.json` and `performance-kitchen-final.json` for the exact runs. These are foreground browser measurements at 1440 × 900 and DPR 1 on an Apple M4 Metal renderer, 10 logical processors and reported 16 GiB device memory, Chrome 156. The final entry run measured 59.50 FPS (frame p95 18.5 ms); the final kitchen run measured 60.01 FPS (frame p95 18.1 ms, render-call CPU p95 2.9 ms). The kitchen run retains active water, two fires and open furniture while alternating physical KeyW/KeyS for ten seconds. Classroom PCs, mobile GPUs, hardware touchpads and physical input-method behavior have not been independently measured.

## Tests and limits

The source full suite currently has one pre-existing catalog-count assertion failure (expected 311 versus current 376), while both builds pass. The public anonymized repository retains 55 pre-existing normalization-sensitive failures; their failure-name set was compared with the preceding public baseline and has no new members. The public core suite passes 436/436, and the focused viewing suite passes 67/67. The source full suite is 931/932; the public full suite is 790/845. Exact counts and failure names are recorded in `measurements/test-summary.json`. These are explicit limitations; the complete suite is not reported as green.

The account release builder now follows actual HTML stylesheet dependencies, including Warm and viewing CSS, with compression/manifest checks. The public repository intentionally has no deployment/build pipeline; it provides runnable source and the vendored review tools instead.

## Differences from the reference prototype

1. The real House entrance leads into the bathroom. The prototype rotated the interior to make it lead into the living room; this implementation follows the task's explicit prohibition on that workaround. Cases 04/05/07 therefore show the real entrance room.
2. Furniture keeps its saved pose. The prototype's relocated lamp and rotated house are not reproduced. Room-relative close-ups document the same effects from the authoritative layout; the 12 compositions are not claimed to be pixel-identical or universally identical to the prototype.
3. The approved plain Warm walls remain in place; some prototype reference images used older horizontal stripes.
4. Scene PNGs and DOM UI proof are separate. The PNG downloader does not paint pretend controls into WebGL screenshots.
5. Viewing is first-floor-only. Upper floors/stairs, robot walking/new actions, wall switches, drawer contents and X-ray outlines were not added.
6. This is a temporary view: open/closed furniture, lights, water and fire do not persist. Existing robot and account state resume through their original owners.
7. The 45 FPS classroom-GPU target is only measured on the stated M4 environment; it is not a certification for every integrated GPU.

## Reference provenance and review status

Raw reviewer materials remain under `docs/look-dev-captures/review-roam-2026-10-30/`, with prototypes confined to documentation. The raw import is a separate public commit, `99c61a3`. The new archive has 23 original members, all verified byte-for-byte. Across the imported review packages, 101 unique archive paths retain matching SHA-256 values. Runtime source continues the existing anonymization policy; approved raw reviewer material is unchanged.

Status: implemented and pushed; not deployed. Code commit `bcbfd4c2ddf3439328a853bc011dc03303494833` was cloned from GitHub into a new directory with no node_modules and no npm installation. All 12 views rendered with 18 targets and unchanged fixture data, all 12 PNGs matched this delivery byte-for-byte, the 103-module import closure and GLB returned successfully, and browser errors were zero. See `measurements/fresh-clone.json` and `fresh-clone-resources.json`. The final delivery commit adds documentation/evidence only after that verified code commit. Continue from the final public delivery commit rather than the raw prototype directory.

## Package checklist

- [x] Door-only application entry; strict click/drag threshold.
- [x] Hinged leaf, real matching opening, no wall or frame intersection across the tested swing.
- [x] Physical-code keyboard behavior, including automated Process + KeyW.
- [x] Collision-free movement, flying, click glide and room transition logic.
- [x] Indoor ceiling light setup, master-room changes and outside restoration.
- [x] Exact 18-target recognition, reversible actions and visibility/reach checks.
- [x] Door exit and exact original-camera restoration.
- [x] Disposable interaction state and unchanged fictional home files.
- [x] Default/Toy committed visual baseline equality.
- [x] Fresh GitHub clone renders all 12 views without npm or node_modules.
- [ ] Complete source/public full suites entirely green: blocked by the explicitly preserved pre-existing failures, with no new failures.
- [ ] Physical classroom PC / input-method certification: not performed; desktop browser evidence is scoped above.
