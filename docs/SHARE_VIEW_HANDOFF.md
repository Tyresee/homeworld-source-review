# Read-only home sharing: current review contract

This is the normalized analysis copy of the 2026-11-04 implementation. It contains fictional fixtures, neutral service identifiers and English or stable display labels. It is not a deployment replacement and contains no platform credentials or original repository history.

## Current behavior

The public viewer stays outside the home. Its complete navigation state set is `ORBIT`, `SPOT`, `EXPLODED`, and `FOCUS`, using an orbit camera with a 42-degree field of view. Visitors can rotate, zoom, inspect outdoor facilities, separate real floors, and select a floor. Room names are passive labels. Clicking a room, furniture, companion or elevator on the focused floor cannot enter first person or operate an object.

The earlier room-entry, blue-ring and elevator-ride interactions have been removed from this viewer. `goRoom` remains a compatibility method that can only select a floor focus; elevator entry, ride and exit methods return false. The editable account application and its ordinary visit mode are separate modules.

The page has one home title, a small read-only badge, a short loading state and the model. The former promotional copy and jump link are removed. No lesson count or other achievement statistic is invented when no trusted source exists.

New authenticated publications freeze the selected learner's authorized roster display name in the existing `snapshot.title`. Only this display text is added to the public projection. Account IDs, financial records and other roster fields remain excluded. A caller cannot supply its own name/title field. Unicode boundaries, control characters and the existing title limit are handled on the server. Old links retain their original frozen snapshot; generate a new link to include the name. Reusing a command ID preserves the original title even if a roster name later changes.

## Reading order

| File | Responsibility |
| --- | --- |
| `public/home-share.html` | Minimal document, safe-area viewport, title and preview metadata, loading/error surfaces. |
| `public/js/home-share-page.js` | Public token parsing, credential-free snapshot GET, validation, detached visual input and resource lifetime. |
| `public/js/home-share-controller.js` | Four exterior orbit states, framing, transitions, gestures, resize and disposal. |
| `public/js/home-share-world.js` | Independent renderer, exterior-only picking and frame loop. |
| `public/js/home-share-model.js` | Real saved floors, roofs, walls, furnishings, facilities and static elevator geometry. |
| `public/js/home-share-ui.js` | Overview/floor/outdoor controls, passive room labels and read-only badge. |
| `public/js/home-share-copy.js` | Shared browser/server title and description formatting. |
| `server/student-homes/share-snapshot.mjs` | Minimal visual projection and trusted display-title construction. |
| `server/student-homes/shares.mjs` | Immutable capability snapshots, idempotency, anonymous read and owner revocation. |
| `server/student-homes/app.mjs` | Authorized roster selection for publication; anonymous snapshot and HTML routes. |
| `server/student-homes/share-document.mjs` | Escaped frozen title/description in raw HTML, without client JavaScript. |
| `public/js/home-share-wechat.js` | Optional WeChat initialization, signature boundaries, SDK readiness and result callbacks. |

The model reuses the real home builders and dimensions. It preserves independently animated floors and roof patches, world transforms, saved materials, actual owned outdoor objects and dynamic exterior wall cutaways. It does not construct the account editor, shop, command controller, furniture runtime or save outboxes. The public scene cannot persist a changed home.

The external lighting preset remains independently calibrated: ACES exposure 1.1, hemisphere 1.1, ambient 0.1, sunlight 10 at plot-relative `(14, 48, 38)`, with sRGB output. Former first-person room lighting and ceiling transitions are no longer navigation behavior. Earlier measurements are not new device performance claims.

## Publication and sharing boundaries

Authenticated creation first drains known pending editor work. Each publication round obtains a fresh authoritative home revision before POSTing. Only an explicit HTTP 409 `revision_conflict` permits another round, at most three in total. Each retry checks the original teacher/student scope and uses a new command ID for the changed revision basis. Unknown network outcomes, authentication failure and other conflict/error codes are not retried. The backend compare-and-swap check remains intact; publication does not repair-write home state.

The anonymous page validates its visual-only envelope, imposes a UTF-8 byte budget and clones accepted data before rendering. Generation checks and disposal prevent late responses/assets from reopening an old viewer. Tokens are public random capabilities rather than learner identifiers. Requests omit credentials. Revoked or invalid links show a public unavailable state without revealing an account.

Raw HTML includes title, description, canonical and social metadata before JavaScript runs. Display names are escaped, including names containing replacement-string tokens. Anonymous metadata reads require no platform session and do not update the snapshot. Revoked links receive generic metadata.

The WeChat module preserves the existing signature response contract, exact signature URL, outgoing link/image validation, timeout bounds and asynchronous callback handling. After that contract is validated, only the outgoing title/description are replaced using the frozen SSR title and the same copy helper. Arbitrary query parameters cannot override those values. Ordinary browsers do not load the SDK. A configured or mocked API is not evidence of a received WeChat card; real receiving-device acceptance remains separate.

## Reproduce locally

```sh
node scripts/qa/share-view-review.mjs
```

Open the printed loopback address. This serves a fictional snapshot and the included licensed Three.js runtime without npm or an account. It exposes no account, save, publish or other write API. Its server rejects traversal, symlink escape, hostile Host headers and non-read methods. Catalog-derived names may retain stable `DisplayText` identifiers.

After installing the locked test dependencies:

```sh
npm test
npm run test:share
npm run test:share:publisher
```

`REVIEW_TEST_LIMITS.md` and `PACKAGE_AUDIT.json` distinguish the normalized core from historical display-sensitive whole-suite failures. No old failing assertions were removed to make the entire public suite appear green.

## Evidence and review priorities

The merged original implementation passed 1,698 automated tests. The new exterior-only browser journey covered six checkpoints at 1440×1000 and 390×844. Only the four orbit states were observed; room clicks preserved the camera, old entry methods could not activate first person, and the named title, minimal copy and read-only badge matched. HTTP errors, console/page errors, HTTP writes, storage writes and external requests were zero. One GLB request abort was retained in the evidence: the actual model loaded in full and a separate read returned the expected complete glTF asset. This is not a claim of zero aborted requests.

Physical phones, embedded-browser touch feel, extended memory/thermal behavior and received WeChat cards were not certified by that desktop browser run. Earlier first-person acceptance checkpoints are superseded by the current exterior-only contract.

Useful independent reviews are geometry diversity, upper-floor/roof ownership, hidden geometry picking, zoom/framing at extreme house sizes, cancel/resize/disposal races, token/metadata boundaries, named-title escaping and repeated authenticated publication across revision or identity changes. Report a concrete trigger, consequence and reproducer against the current code.


## Coordinated copy and diagnostics follow-up

A later authorized change keeps the named title and uses the fixed description “Every small effort can be seen.”. It adds optional, sanitized WeChat diagnostics under an explicit `wxdiag=1` selector. Normal links show no diagnostic panel, and no raw URL, capability, signature, account or original SDK error is displayed. The exterior controller, world, UI, snapshot and publication runtime hashes are unchanged from the validated four-state release. The earlier 1,698-check full regression is its baseline; the current copy/diagnostics follow-up passed all 46 relevant original-source checks. The public normalized checks are recorded separately in `PACKAGE_AUDIT.json`.
