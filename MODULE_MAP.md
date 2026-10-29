# Code map

## Architecture

```text
Browser account page
  -> student selection / session / wallet client
  -> account editor coordinator
     -> contextual editing + shop + inventory + construction panels
     -> Three.js world and scene
        -> layout + collision + procedural furniture models
        -> articulated robot + wardrobe + interaction controller
        -> object runtime (lights, clocks, television)
  -> independent account service
     -> trusted external platform client
     -> validated commands + pricing + ownership
     -> atomic home store + recovery + robot activity

External learning platform (not supplied)
  -> session + student access + authoritative points ledger
```

## Frontend and editor

| Module | Purpose |
| --- | --- |
| `public/student-homes.html` | Formal account product entry. |
| `public/js/student-homes.js` | Session, roster, selected account, wallet and page coordination. |
| `public/js/student-homes.js` | Also owns account-service requests and top-level error handling. |
| `public/js/student-home-editor.js` | Routes object selection, menus, commands, commerce and robot checkpoints. |
| `public/js/student-home-quick-actions.js` and `student-home-quick-action-menu.js` | Object action definitions and the selected right-side toy-remote UI. |
| `public/js/student-home-context-menu.js` | Contextual edits, shopping and construction actions. |
| `public/js/home-shop-ui.js`, `home-shop-browse.js` and `home-shop-rooms.js` | Shop, cart, inventory and room-product presentation. |
| `public/js/home-floor-planner.js` and `home-room-planner.js` | Purchased slab range versus functional room planning. |

## Rendering and models

| Module | Purpose |
| --- | --- |
| `public/js/student-home-world.js` | Adapts server-owned account state to the scene and robot. |
| `public/js/home-scene.js` | Rendering, camera, selection, dragging, placement and views. |
| `public/js/home-engine.js` | Object poses, state changes, bounds and placement rules. |
| `public/js/home-commerce.js` | Shared catalogue and commerce/placement rules; not an independent real wallet. |
| `public/js/home-*-collection.js` | Product families, sizes, price tiers and descriptions. |
| `public/js/home-*-models.js` | Procedural product geometry by category. |
| `public/js/home-building-collision.js` | Building volumes, wall thickness and spatial constraints. |
| `public/js/home-staircase*.js` | Straight stairs, elevator-related connection geometry and floor openings. |
| `public/js/home-estate-manor.js` and related layout modules | House exterior and corresponding building shape. |
| `public/js/student-home-object-runtime.js` | Stateful lights, clocks, screens and related effects. |

## Robot

| Module | Purpose |
| --- | --- |
| `public/js/robot-avatar.js` | Actual GLB instance, rigid articulated poses, contact measurements and pose blending. |
| `public/js/robot-wardrobe*.js` | Fitted garments and outfit catalogue. |
| `public/js/student-home-robot-controller.js` | Routes, activity state machine, entry/exit, restoration and frame scheduling. |
| `public/js/student-home-robot-interactions.js` | Furniture-specific approach and physical contact descriptors. |
| `public/js/student-home-robot-motion.js` | Contact-aware entry/exit key phases. |
| `public/js/student-home-robot-stairs.js` and `*-elevator.js` | Tread-level stepping and cabin travel. |
| `public/js/student-home-robot-swimming.js` | Pool descriptors, swimming and entry/exit. |
| `public/js/student-home-robot-football.js` | Field interaction and ball motion. |
| `public/js/student-home-robot-dance.js` | Deterministic 16-second dance sampling. |
| `public/js/student-home-robot-state.js` | Semantic checkpoint validation, normalization and comparison. |
| `public/js/student-home-stage-*.js` | Spotlight, stage framing and optional camera choreography. |

## Service

| Module | Purpose |
| --- | --- |
| `server/student-homes/cli.mjs` | Explicit local service configuration and startup. |
| `server/student-homes/app.mjs` | HTTP routes and authenticated account boundaries. |
| `server/student-homes/platform-client.mjs` | Fixed trusted upstream contracts and signed transactions. |
| `server/student-homes/profile.mjs` | Home schema, validation and migrations. |
| `server/student-homes/commerce.mjs` | Authoritative catalogue, pricing, commands and entitlement transitions. |
| `server/student-homes/store.mjs` | Atomic persistence, revisions, transaction recovery and receipt history. |
| `server/student-homes/robot-activity.mjs` | Account-specific activity eligibility, checkpoints and reconciliation. |
| `server/student-homes/static-assets.mjs` | Static delivery, compression variants and caching. |

## Tests and useful inspection paths

- Purchase and recovery: `student-homes-payment*`, `student-homes-resale*`, `student-home-account-commerce*`.
- Construction and pricing: floor, room, expansion and elevator tests.
- Robot contacts and restoration: `student-home-robot-controller`, `student-home-robot-state-controller`, `student-homes-robot-sleep-integration`.
- Orientation investigation: `student-home-robot-orientation.test.mjs` is a later diagnostic regression, not evidence of a shipped fix.
- Local model viewers: `scripts/qa/robot-motion-review.mjs` and `robot-dance-review.mjs`.

`FILE_INDEX.json` lists the actual packaged files. It is the authority if a descriptive family pattern above spans multiple modules or a filename differs.
