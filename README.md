# Homeworld - Account Game Source Review

Start here. This is an identity-normalized source-reading package for a browser-based AI collaborator. It contains the real account game's frontend, server, model builders, interaction logic and isolated tests, plus two local animation review tools. It is not a production deployment archive.

## Real-render look development, no package installation

A recent Node.js runtime and a browser with WebGL 2 are sufficient. You do not need npm or node_modules for this review workstation:

```sh
node scripts/qa/look-dev-review.mjs
```

Open the loopback URL printed by the script. The default is http://127.0.0.1:19534/?preset=default.json. Use ?preset=toy-v1.json for the frozen Toy v1 reference. If that local port is occupied, set LOOK_DEV_PORT to another free port.

The workstation uses the real home/room/furniture builders and the v4 robot model. It has five deterministic reference views, live lighting and finish controls, JSON import/export, and full-resolution 1440 x 900 PNG capture. All five captures download together as one ZIP containing five named PNG files. It has no accounts, wallet, save endpoint, or write API.

Three.js 0.186.1 and its actual transitive module dependencies are bundled in vendor/three with the original license. The server automatically uses this bundle when node_modules/three is absent. See [the 10 actual reference renders](docs/look-dev-captures/README.md) and LOOK_DEV_REVIEW.md for the review procedure and VENDORED_THREE.md for dependency provenance.

## Read in this order

1. `PROJECT_BRIEF.md`: product goals, owner decisions, implementation status and collaboration rules.
The separate design PDF and art references described in PROJECT_BRIEF.md are not duplicated in this source archive.

2. `MODULE_MAP.md`: architecture and the most useful source entry points.
3. `public/js/student-home-editor.js`: how selection, shopping, construction and robot commands meet.
4. `public/js/student-home-robot-controller.js` and the interaction planners: how the companion moves, uses objects and restores its state.
5. `server/student-homes/app.mjs`, `commerce.mjs` and `store.mjs`: authentication boundaries, authoritative operations and durable state.
6. The relevant tests. They use fictional identities and local temporary services, not real student accounts.

The catalogue/model modules show actual product dimensions, prices and geometry. They are more useful for design feasibility than guessing from a rendered picture.

## Scope

- Full relative module closure of the formal account entry and independent service.
- The roof candidate viewer, clearly separate from editing a real home.
- Account-product tests, the robot asset test and one later orientation diagnostic regression.
- The production robot v4 GLB and three action illustrations.
- Two account-free local animation viewers.

Historical board/demo entry pages, unrelated appearance experiments, deployment configuration, repository history, dependency folders, original research documents, logs, backups, credentials and real account data are excluded. A legacy helper is included if the formal module graph or a regression actually imports it.

## Important: aliases and display copy

Read `NORMALIZATION_NOTES.md`. Product/platform names, service identifiers, namespaces and locale settings use neutral aliases. User-facing copy has concise English translations or stable `DisplayTextNNNN` placeholders. Some display-related patterns and assertions are therefore different from the original application.

This package helps you understand implementation and propose changes. Do not assume its aliases or display strings can be deployed unchanged. Refer to relative files and functions in recommendations; the implementation agent will translate those recommendations back to the actual project.

## Local review

Node.js 20.9 or newer is required. Install the locked public dependencies:

```sh
npm ci
```

The verified core test subset does not require the real platform:

```sh
npm test
```

Read `REVIEW_TEST_LIMITS.md` before interpreting test results. All source tests are included for inspection, but text-sensitive assertions are not part of the default core subset after display-copy normalization. `npm run test:all` includes those assertions and is expected to show the documented differences. They were not weakened to manufacture a fully passing review copy.

For the actual robot and furniture without accounts, payments or saving:

```sh
npm run review:motion
npm run review:dance
```

Run one viewer at a time; the scripts print their loopback address. These pages load the supplied robot model and the included controllers/model builders. The buttons use the normalized review copy, not a complete production localization.

The account service itself requires an external platform and explicit data/origin settings. Starting it does not provide a standalone login system, real students or a points wallet. No platform credentials or live deployment addresses are included.

## External platform contracts

The application expects trusted platform session validation, student access, a points context and wallet, fixed starter grants, and signed payment/resale operations. The home service owns inventory, house state, orders, construction and robot activity. Browser requests cannot directly assign authoritative balances or ownership.

The client checks `authenticated === true`, not HTTP status alone. Payments, delivery and resale are idempotent and recoverable. Missing configuration must produce a clear unavailable state, not an invented guest account or demo balance.

## What to return to the implementation agent

Give a focused design or code review referencing file paths and function names. Explain the user-visible problem, the proposed behavior, physical dimensions/contact requirements where relevant, effects on ownership/saves, and up to five observable acceptance criteria. Keep design concepts, source observations and verified runtime behavior distinct.

The reported bed/toilet orientation issue remains unresolved: the diagnostic tests did not reproduce it. Do not describe it as fixed or globally rotate the robot by 180 degrees without a reproducible case.
