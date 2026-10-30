# Direct entrance from the ordinary Warm exterior

The previous application required selecting Visit before its door could be used. The ordinary Exterior view now recognizes a completed primary click on its actual ground-floor entrance and starts the same real approach, opening and entry sequence automatically. The existing Visit control still starts an exterior orbit for browsing.

Only the door panel, arch trim and handles carry picking metadata. Walls, roofs, windows, steps and upper floors do not. Default and Toy retain their prior behavior and geometry. The gesture must start and finish on the visible door, without a drag, pinch, secondary/Control-click or Space hand-pan. Pointer capture is released before the guarded account adapter starts loading. Pending saves, student transitions, stale asynchronous work and disposed scenes remain blocked. Entry is a viewing action and adds no purchase or save command.

The isolated source application was exercised with the fictional student Sam: click Exterior, click the visible door without selecting Visit, observe the real transition to free movement, return to Exterior, and verify that a roof click does not enter. Selecting Visit separately still begins an exterior orbit. Browser errors: none. See browser-proof.json and the paired screenshots. No production student records were used for this browser verification.

Regression coverage executes the real scene pointer callbacks and adapter paths, and uses real first-hit model rays. Model fingerprints verify that picking metadata does not alter geometry, materials or world transforms.

Validation before commit: 12/12 precise picking and gesture tests; 77/77 adapter/robot presentation tests. Full source suite: 977/978, retaining only the existing catalogue-count assertion (expected 311, actual 376). No new failure was introduced. The mandatory account release gate is rerun by the deployment script.

Public review export: core 470/470, focused rendering/gesture checks 43/43, and editor entry-guard subset 5/5. The broader editor subset retains 16 existing normalization-sensitive failures, all within the previous documented 55. The product account release gate passed 748/748; live static-resource/version verification was performed separately without real student writes. This review export includes no production credentials or deployment configuration.
