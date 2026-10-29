# Homeworld: Project Handoff and Design Collaboration Brief

Edition: 2026-10-29. Audience: a browser-based AI design collaborator.
Homeworld is the working label used in this brief. This document contains the product context needed to collaborate without accessing the repository or a signed-in application.

## 1. The project in one page

Homeworld is a persistent, personal home-building game connected to an existing educational game platform. Each student starts with a small home and a friendly robot companion. Activities in connected classroom games can award platform points under approved rules. Students spend those points on furniture, outfits, outdoor facilities, rooms and building area, gradually creating their own living world.

The main setting is a teacher's computer projected onto a classroom screen. The teacher selects a student and helps them build, decorate and interact with their robot, especially near the end of a lesson. Independent student access after class is not the currently confirmed primary flow.

An account-based version is already deployed for testing. It has a separate application, shared sign-in, student-specific saves, a working shop and purchase flow, construction, and several robot interactions. This is not a request to start from a blank concept or replace the existing application.

The immediate collaboration arrangement:

- The browser-based AI proposes product, visual, interaction and asset designs.
- Codex checks the code and constraints, builds models and runnable features, tests them and handles deployment.
- The project owner coordinates the exchange, selects directions and judges the result.
- Neither AI automatically receives the other AI's conversation. Design packages and implementation reports are the shared interface.

Three non-negotiable standards:

1. Upgrades must be visibly different at normal gameplay scale and classroom viewing distance.
2. Editing and interaction must be direct, predictable and responsive.
3. Designs must work as actual models, collision volumes, contact animations and browser-rendered scenes.

## 2. Product direction and how it evolved

### 2.1 The original classroom board prototype

The initial concept was a single-player isometric board adventure: choose a character, roll dice, hop through a large board, collect playful items, encounter creatures and hazards, and use shields or other items to avoid setbacks. Teachers could configure language prompts, including words, phrases and sentences.

That prototype still exists in the project history. Its task-completion and speech-scoring steps were primarily simulated. Do not describe it as a verified live speech-assessment system or a classroom-tested full lesson.

### 2.2 The current long-term goal

The direction changed toward lasting ownership and visible progress: a small home grows into a larger residence, then potentially a garden estate and a personal world. The robot represents the student and makes the home feel lived in.

Other independent classroom games are intended point sources. The home game is a spending, creativity and presentation destination. A separate property-board game already has registration, settlement and deduplication integration work and isolated tests. Its current production reward policy was not re-audited for this brief. Do not assume that every game is already issuing rewards or that a historical disabled policy is still current.

Earlier requirements such as no saves, unlimited demo funds and entirely separate game rewards have been superseded for the account product. The current system saves each student's progress and uses the platform's shared points wallet. Per-round coins, stars, temporary scores and unrelated progression currencies are not automatically converted at a one-to-one rate.

### 2.3 The progression system still needs design

The application has construction and shopping, but the complete long-term journey remains open: meaningful milestones, optional home goals, coherent collections, functional room completion and sustained classroom pacing.

Build progression around visible outcomes: a sleeping corner becomes a bedroom; a cooker becomes a usable kitchen; an empty yard becomes a garden with a pool. Do not substitute a generic experience bar for actual world development. Proposed reward amounts must remain proposals until approved.

## 3. Established visual and interaction principles

### 3.1 Art direction and proportions

The target is a charming, dimensional, coherent miniature world that reads clearly on a large screen. The owner referenced Clash of Clans for strong silhouettes, appealing forms and immediately readable building upgrades. Use those principles rather than copying its characters, models or branding.

- Objects should feel sculpted and spatial, not like rigid flat vector pieces assembled together.
- Sofas should be broad, grounded and comfortably proportioned. All tiers need normal sofa proportions; premium tiers may be wider. A tall, narrow backrest is not an acceptable shortcut to luxury.
- Luxury comes from silhouette, scale, construction and material quality. Do not pile unrelated objects on cushions, fill the backrest with dense bumps, or cover weak proportions with ornament.
- The same proportional discipline applies to beds, tables, cabinets, bathroom fixtures and outdoor facilities.
- A luxurious estate needs genuinely expanded spaces and functions, not tiny furniture scattered across an oversized empty floor.
- A roof direction was selected, followed by simplified exterior walls. Dense horizontal and vertical decorative lines were explicitly rejected.
- A proposed global saturation change was subsequently stopped. Any future color-system revision must be a separate reviewable candidate, not silently applied to the shipped default.

### 3.2 Upgrades must be visible without effects

An accepted reference principle is that successive building bases can have clearly different structural designs while remaining recognizable as the same family. A tiny trim, fringe or hidden detail does not meet the requirement.

For each upgrade, specify the before and after, the silhouette or structural change, its physical dimensions and the gameplay views where the difference is visible. A material upgrade needs visible surface organization, such as a plain rug becoming a patterned woven rug, rather than an imperceptible roughness adjustment.

Color, material, structure and decoration can be separate choices. Color is personalization, not inherently higher quality. Avoid multiplying options whose differences cannot be perceived. The owner's ambition that every object can improve does not mean every existing SKU already has a complete upgrade tree.

Suggested review method: compare before and after under the same camera, scale and lighting. Disable particles. The object itself must still look meaningfully different. This is a design acceptance method, not an existing automated scoring feature.

### 3.3 Physical space and object relationships

- Thickened wall finishes, padding, bed frames, armrests and table edges occupy space. Their upgraded collision volumes must reflect their actual geometry.
- Independent visible furniture and decorations should be movable or have an explicit mounting relationship. Do not bake apparently editable props permanently into room geometry.
- Tabletop items attach to real supporting surfaces and follow the parent furniture when it moves or rotates.
- Wall items attach to complete wall segments and avoid doors, windows and other objects. Wall-thickness changes must update their position and collision checks.
- Pools and sports facilities need valid outdoor placement and separation from the house. Court lines, nets and goals must read as the actual sport.
- Legal placement is not sufficient: the robot must be able to approach, align, use and leave the item. Blocked routes need understandable feedback.

### 3.4 Feedback and believable motion

Purchases, placement, recoloring and upgrades need an obvious response tied to the affected object. Generic floating particles were rejected. Effects should relate to its outline, surface and actual changed region.

The robot must not simply translate into a seated or lying pose. Getting into bed needs approach, alignment, sitting on the edge, lifting the legs, turning onto the bed and reclining. Leaving reverses the physical process. Stair motion must involve individual treads and corresponding leg and foot movement. Elevators need door, entry, travel and exit phases.

## 4. Current control contract

| Input or action | Required behavior |
| --- | --- |
| Left-click an object | Open object-specific robot actions at the far right of the page. The selected visual direction is a playful toy-robot remote, referred to internally as option D. |
| Right-click or two-finger trackpad click | Open a contextual menu for editing, shopping, inventory and construction at the clicked location. Ordinary left-click must not open this menu. |
| Drag furniture | Move it directly and submit on release, subject to actual boundaries and collision checks. Do not replace this with a distant position slider. |
| Space plus drag | Pan the scene without editing furniture or triggering an action menu. |
| Pinch or scroll | Continuously zoom within sensible limits. Two fixed view buttons are not a substitute for free zoom. |
| Top view controls | Explicitly switch between interior, exterior and whole-building overview. Clicking the roof must not unexpectedly enter the interior. |
| Place owned items | A hover submenu in the context menu shows eligible inventory for the floor, wall or tabletop. Place at the already selected anchor instead of asking for the same position again. |
| Change appearance | Apply an eligible color, material or configuration immediately, with saving and feedback. Avoid a second Apply or Save step. |
| Close the action remote | Close the interface only. Stopping an activity or getting up is a separate command. |

An earlier request used double-click to edit furniture or focus an area. The established primary controls are now left-click for robot actions and right-click for editing. Any future double-click behavior must be reconciled with selection, dragging and focusing.

The previous permanent bottom surface-selector bar and large right-hand luxury-decoration panel were rejected. The selected action remote must not become the old decoration panel under a new skin.

## 5. Implementation status

The following deployed capabilities have historical release and verification evidence. This brief is not a fresh end-to-end retest of every production interaction.

| System | Current implementation and limits |
| --- | --- |
| Sign-in and students | Uses the existing platform session and student identities. Refresh retains the selected student. No separate account database. |
| Student homes | Independent house layout, inventory, robot and server-side progress for each student. The starter home is approximately 29.12 square metres on one storey. |
| Shared points | The platform is the authoritative ledger. The cumulative starter grant is 150,000 per student. Spending remains deducted and game income remains credited. Never refill the remaining balance to 150,000. |
| Shopping | Cart, server-priced payment, inventory, placement, storage, rotation and eligible appearance changes exist. Floor, wall, tabletop, outdoor and clothing products have different installation rules. |
| Catalogue | The account catalogue currently contains 475 saleable SKUs: 376 furniture/decor items, 24 room kits, 57 outdoor items and 18 fitted robot clothing products. Custom floor area and elevator installation are separate priced services. |
| Categories and tiers | Products are organized by room and purpose, with distinct price tiers. A catalogue count is not proof of unique high-quality models or bespoke interactions for every item. |
| Construction | Purchased floor area, room subdivision, multiple storeys, straight stairs, overview and corresponding exterior forms are implemented. |
| Elevators | A stair connection between adjacent floors can be replaced for 12,000 platform points per connection. Installation and robot travel have dedicated checks and animation. |
| Resale | Eligible purchased furniture and outdoor items can be sold back for 50 percent of their historical paid unit price, rounded down. Rooms, slabs, elevators, clothes and gifts are currently excluded. |
| Robot appearance | The current companion is robot v4, not the old human-avatar demo. Fitted outfits, hats and shoes can be purchased and combined. |
| Object interactions | Eligible items support sitting, sleeping, reading, cooking, handwashing, dishwashing, television/remote use, cushion tidying and table wiping. Outdoor activities include swimming and football. |
| Active objects | Selected lights, televisions and clocks have their own state and animation. Not every decorative appliance is a working simulation. |
| Activity persistence | Student-specific position, heading, floor, activity and object target persist, including several entry and exit phases. This is broader than remembering whether the robot was asleep. |
| Dance stage | A softened dark-room spotlight, optional camera choreography and a 16-second classic-slide-inspired routine exist. Exiting the camera does not stop the dance. The routine is a robot adaptation, not captured original choreography. |
| Outstanding scope | The complete long-term progression journey, consistently strong asset quality, all-SKU interaction coverage and unrestricted whole-house 3D roaming are not completed features. |

The catalogue numbers came from the actual account service catalogue, not the older demo README. Color variants should not be counted as new object designs. Historical screenshots and demo balances do not define current point policy.

The account product has a working commerce flow, but older free material or structural configuration options have not all become purchased entitlements. The intention that new items and construction are bought in the shop must not be confused with complete monetization of every legacy editor option.

## 6. Construction and economic rules

### 6.1 Floor ownership versus functional rooms

Expanding a floor purchases usable slab area and changes its outside boundary. Adding a functional room subdivides already purchased area into a bedroom, kitchen, bathroom or another use. A room kit must not silently enlarge the slab, and buying an upper floor must not copy all downstairs rooms and furniture.

An upper floor may begin empty. Its footprint must remain fully inside the supporting floor immediately below. Expanding the lower floor unlocks a larger potential construction range above; it does not grant the upper area for free.

### 6.2 Selection and overlap pricing

Construction uses a spreadsheet-like drag grid, supporting multiple selections and shapes such as rectangles or an L. The panel must show the supporting-floor outline, current purchased boundary, existing rooms and stair occupancy, and the current selection.

Charge only for legal selected area not already owned. Dragging a larger rectangle over previously purchased cells must not charge for those cells again. This requires a geometric set difference, not the total area of the new rectangle.

### 6.3 Local gap compensation

Fixed-size room kits may leave a narrow strip when placed side by side. An adjacent room may absorb that local gap, with a price difference based on actual added finished area. This is not an equal expansion of every room and does not permit crossing the slab boundary.

Show which room and edge change, the added area and the additional cost. Reject illegal geometry or furniture conflicts instead of forcing the room through obstacles.

### 6.4 Interior and exterior correspondence

The exterior must derive from the actual floor and room data. A visible second storey needs usable second-floor space and a real connection. Stairs should be simple straight runs with believable space underneath. Elevator upgrades require a shaft, cabin, both exits and real clearance.

Current implementation parameters include 300 points per square metre of slab, 6,000 for the new stair connection and 12,000 to upgrade an adjacent-floor connection to an elevator. These are current values, not immutable design truths. Proposed changes must consider existing purchases and save compatibility.

### 6.5 Transactions

Only the platform can confirm changes to the real wallet. The home service controls prices, ownership, construction validation and delivery. Clients cannot award arbitrary points, alter authoritative balances or mark unpurchased assets as owned.

Retries, unknown outcomes, payment, delivery and resale need recoverable, idempotent operations. A refresh must not double-charge, double-deliver or double-refund. Existing purchases and progress must survive code updates and compatible rollbacks.

## 7. Assets, animation and technical boundaries

### 7.1 Current stack

The application uses native JavaScript ES modules, Three.js 0.186.1 and an independent Node.js service. It renders real 3D geometry with isometric/orthographic presentation. It is not a flat house illustration with clickable overlays, nor a Unity or Unreal project.

Many furniture items are generated procedurally. The robot is an owned GLB asset with rigid articulated parts, procedural poses and contact handling. The project does not need an engine migration or a new frontend framework before design work can continue.

### 7.2 Asset workflow

Available tools include ImageGen, Lux3D and Blender. A useful workflow is reference art, generated candidate, Blender cleanup and separation, scale/contact calibration, GLB export, browser integration and multi-view inspection.

Complex hero furniture, plush toys and character assets can justify dedicated modeling. Regular cabinets, worktops, courts and simple utensils may be better served by parameterized geometry. Both approaches must share scale, materials, collision conventions and visual language.

New paid-generation tasks require an actual quote and a separately approved budget. Approval for an earlier asset batch is not unlimited permission for later spending.

### 7.3 What an asset specification must contain

- Front, side, back or useful isometric views that explain the whole volume.
- Width, height and depth in metres; bottom origin; facing direction; mounting method.
- Separate parts, movable parts and color/material regions.
- Actual collision bounds and use clearance, including hand, foot, seat, mattress and tabletop contact anchors.
- Approach, alignment, contact, activity and exit behavior, plus a blocked-route response.
- Reusable assets and proposed triangle, material, texture and download budgets. Codex must measure the existing scene before freezing budgets; do not promise universal 60 fps without evidence.

The current robot uses +Y up and +Z forward. Clothing must fit its proportions and joints. A correct standing preview does not prove compatibility with sitting, reclining, stair walking or swimming. A concept image is not a runtime model, and a GLB containing joint nodes is not automatically a verified animation.

### 7.4 Platform ownership

| Layer | Owns |
| --- | --- |
| Learning platform | Game directory, sign-in, student identity, authoritative points ledger and approved cross-game settlement contracts. |
| Homeworld application | Building, rooms, furniture, inventory, clothing, orders, robot, editor, service and home saves. |
| Other independent games | Their own gameplay, round-specific assets and approved reward events. |

Games remain separate repositories, dependencies, build outputs and release processes. Do not merge them into a platform branch or copy the whole platform to build a new game.

The integration checks the platform's `/api/auth/me` response for `authenticated === true`; HTTP 200 alone is insufficient. Expired sessions return to platform sign-in and then back to the game. Resources and APIs stay under the game's own namespace. Credentials and long-lived tokens must not be passed in URLs.

Deployment access, repository locations, account details and operational identifiers are handled by the implementation team. They are not needed for browser-based design collaboration.

## 8. Unresolved issues and proposed work packages

### 8.1 Unresolved orientation report

The owner reported that a robot remained reversed after completing sleep or toilet use: head toward the foot of the bed, or face toward the cistern. The reported models were a canopy bed and a compact toilet.

Re-entering the affected home showed correct orientation. The same-layout isolated scene, four furniture rotations, repeated hydration and student switching also behaved correctly. Eight new direction checks and related state/HTTP sleep checks passed, 41 tests in total.

Status: **not reproduced, root cause not located, no behavior fix shipped**. Passing tests do not invalidate the report. A global 180-degree change would reverse currently correct cases. The next useful evidence is the live faulty state and its action/acknowledgement sequence before refreshing or switching accounts.

### 8.2 Recurring quality problems

- A large catalogue still feels sparse in useful, well-designed everyday items and matching sets, particularly kitchens, bathrooms, beds and tables.
- Several detail or material upgrades remain too subtle. Some should be merged or fully redesigned.
- Room geometry, exterior appearance, collision and robot usability must be reviewed together, not only as shop thumbnails.
- Larger homes have drawn complaints about loading and dragging performance. A smooth small fixture does not validate a large estate.
- Cushion tidying now includes contact and rebound, but the owner previously questioned it. Existing implementation is not the same as accepted visual quality.
- The revised dance routine needs aesthetic review; precise numeric contact tests do not prove expressive performance.

### 8.3 Suggested collaborative packages

1. **A small, visible upgrade collection.** Choose a few families such as sofa, bed, table, bathroom fixture and kitchen module. Design visibly distinct tiers, matching dimensions and functional compatibility. Prototype one real collection before expanding the entire catalogue.
2. **Robot interaction storyboards.** Define approach, alignment, contact, activity and exit for key objects. Resolve orientation and contact defects before adding many new gestures.
3. **A long-term building journey.** Offer optional goals from starter room to multi-storey home and garden estate, tied to visible outcomes and existing shopping. Keep proposed reward amounts configurable and unapproved.
4. **Shop organization and coordinated sets.** Improve room/purpose discovery, dimensions, mounting requirements, ownership and supported interactions. Solve finding the right item, not just increasing counts.
5. **One coherent home-and-garden slice.** Demonstrate matched interior, exterior, floors and yard, including pool, courts, paths, robot navigation and camera framing.

These are proposed priorities. The owner selects the next package; this brief does not authorize rebuilding every system at once.

## 9. How the two AIs should collaborate

### 9.1 The exchange

1. Identify one concrete experience to improve and offer a small number of genuinely different directions. Preserve decisions already made.
2. After the owner chooses, produce an implementable design package with both visual and written specifications.
3. The owner passes it to Codex. Codex checks feasibility and impact, then builds a runnable version.
4. Codex returns real screenshots, model views or short clips, isolated test results and known differences from the design.
5. The design AI produces a prioritized discrepancy list about proportion, silhouette, space, states and interaction. Avoid feedback limited to "make it more polished."
6. Iterate with the owner's judgment. Label each result accurately: concept, local model, runnable page, committed, pushed, deployed, public-resource verified or classroom/device tested.

If a file or image is unavailable, say precisely what is missing. Do not claim to have opened local files, a private repository or a signed-in application. Continue with the material available rather than requesting private account access.

### 9.2 Required design package

- Identifier, version, date, problem and established rules being preserved.
- Visuals and same-scale comparisons, object/part list, dimensions and footprint.
- Interaction sequence and default, selected, hover, unavailable, loading, error and cancellation states.
- Facing, physical contacts, collisions, approach clearance and camera requirements.
- Asset reuse versus new work, with a reason for procedural geometry, generated assets or Blender work.
- Rendering-only changes versus new SKUs, entitlements or save fields; compatibility with existing purchases.
- Up to five observable acceptance criteria, plus unresolved questions and engineering assumptions.

For a sofa, "more luxurious" is not enough. Specify a broader seating arrangement, a lower back, substantive armrests, clear cushion organization and a usable robot contact area. Establish actual dimensions from scene and robot measurements rather than inventing them here.

### 9.3 Implementation handoff template

```text
Package ID and version:
Target experience:
Selected direction:
Controls to preserve:
New or replacement assets:
Dimensions, origin, facing and contact anchors:
Interaction states and failure handling:
Payment, ownership and save impact:
Reusable assets and performance assumptions:
Acceptance criteria:
Open questions:
```

## 10. Opening instruction for the browser-based AI

```text
You are collaborating with an existing Codex implementation agent on Homeworld.
I will pass design packages and implementation reports between you.

Read this brief and the supplied visual references first. This is an existing
deployed test product, not a blank-slate exercise. Do not treat old demos or
historical documentation as the current account product.

Briefly restate the goal, existing foundations, controls to preserve and most
important quality gaps. Recommend one practical next package from visible
upgrades, robot interactions, long-term progression, shop organization or an
integrated home-and-garden slice. Explain the visible improvement it would make.
Do not respond with dozens of questions or only a high-level vision.

After I select a package, provide an implementation-ready specification with
structure and proportions, same-scale comparisons, interaction/error states,
contacts and collision requirements, asset workflow, purchase/save impact and
observable acceptance criteria. Clearly label concepts, prototypes and actual
implementation evidence. Do not request credentials or private student data.
```

## 11. Notes for implementation coordination

The main components are an account entry page, a student-home editor, a Three.js world adapter, scene/layout/commerce modules, a robot controller and interaction planners, and an independent account service. Relative module names include `student-home-editor.js`, `student-home-world.js`, `home-scene.js`, `home-engine.js`, `home-commerce.js`, `robot-avatar.js` and the `student-home-robot-*.js` family.

Pricing, geometry, activity timing and state validation may be shared across client and server. Changing only a UI label is insufficient. Preserve old saves, purchases, idempotency records and student isolation.

The deployed version and repository head are different: the latest repository change adds orientation regression tests and an investigation record, while the live version contains the revised dance routine. Do not call an un-deployed test commit a shipped bug fix.

Older overview documents contain obsolete claims that shopping is not integrated, the wallet is read-only, the starter amount is 50,000 or the human-avatar demo clothing count applies to robots. Use the current account catalogue and later release evidence. Some stopped appearance experiments remain uncommitted; preserve them and exclude them from unrelated releases.

All implementation and commerce tests use fictional students and isolated data. Resource hashes, health checks, actual browser interaction, physical-device behavior and real classroom speech validation are separate levels of evidence.

## 12. Visual references in this edition

The accompanying PDF and `references` folder contain only standalone art and an object-action sequence, without full application chrome:

1. `robot-concept.png`: existing robot concept art, useful for proportion and material direction; not a screenshot of the production GLB.
2. `action-sit.png`, `action-watch.png`, `action-tidy.png`: existing action illustrations used in the selected remote direction. Illustrations do not prove the corresponding animation meets the owner's quality expectations.
3. `cushion-tidy-sequence.png`: existing isolated implementation frames showing contact and rebound. This is evidence of an implemented sequence, not proof of aesthetic acceptance.

The selected D remote remains a toy-like object-specific action panel with substantial colored buttons, a robot display/header and a distinct leave/get-up command. Full interface screenshots are not included in this edition. The control contract and implementation status above remain the source for behavior.
