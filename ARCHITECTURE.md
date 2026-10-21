# Architecture and extension rules

Read this before changing gameplay, content models, saves, scheduling, or shared UI.
This document records durable decisions and their reasons. Follow explicit user instructions;
ask about unresolved gameplay behavior instead of inventing a rule or silently changing it.

## Scope and status

- **Implemented**: behavior exists in the current game or core, as qualified below.
- **Foundation implemented**: state and helpers support the direction; gameplay/UI is incomplete.
- **Future agreement**: confirmed direction, not permission to implement it in an unrelated task.

Use [AGENTS.md](AGENTS.md) for commands, authoring conventions, test helpers, and workflow.
Use [README.md](README.md) for playable behavior, [docs/TDD.md](docs/TDD.md) for technical detail,
and [docs/GDD.md](docs/GDD.md) for broader game design. Those design documents include proposals.
Inspect code and tests for actual behavior; do not present a proposal as implemented.
When code conflicts with a confirmed decision here, identify the discrepancy before changing
mechanics. Update this document when an architectural decision changes, not for routine tuning.

## Product direction

- Build a minimalist, content-driven survival game with understandable, consistent mechanics.
- Prefer new content expressed through existing systems over one-off engine branches.
- Favor small, cohesive modules and shared rules; fewer lines alone is not the goal.
- Keep JSON authoring now. Future CSV imports and editors must produce the same validated model.
- Preserve stable content/text identities for saves, translations, and future authoring tools.
- Classic is the only supported layout. Do not restore retired layouts or a layout picker
  unless the user requests them; keep font selection independent.
- Future visual changes follow [the UI style guide](docs/VISUAL_STYLE.md); artwork additionally
  follows [the art direction](docs/ART_DIRECTION.md) and its approved references. These describe
  the adopted direction, not a claim that all reference imagery is implemented. Keep detailed
  visual guidance in those task-specific documents; the loading rules live in `AGENTS.md`.
- **Implemented, shared illustrated header:** one game-wide panorama sits above the route map
  and all three centre tabs. It stays the same through travel and tab changes. Its artwork ID
  is authored in `game.json`; per-region artwork metadata is only a fallback when no global
  panorama is configured. Do not generate separate area headers for now.
  The journal heading comes from the current region view, never parsed log text; work controls
  remain outside tabpanels. Delivery sequence and acceptance evidence live in
  [the milestone record](docs/UI_REDESIGN_PROGRESS.md).
- Add abstractions to solve demonstrated duplication or an agreed extension need. Do not build
  a generic framework, plugin system, or new dependency solely for hypothetical features.

## Crafting and building trees — implemented

**Implemented:** shared creation trees replace craft/build popups and quest-gated creation.
Design rationale and content-authoring model:
[crafting and building design](docs/CRAFTING_BUILDING_DESIGN.md).

- One shared data-driven graph model and UI serves two independent trees, crafting and building.
  Explicit prerequisites determine depth; authored category names appear as item tooltip tags.
  All nodes remain on compact tree canvases that scroll horizontally and vertically inside
  the centre panel, without category headings.
- All prerequisite nodes must be personally crafted/built to completion. Found, granted, or
  equivalent items do not count. Unlocks are permanent and global; tools, materials, limits,
  and local site requirements still determine whether work can start now.
- Paused creation work requires its tool capabilities again before resuming. Missing tools
  leave it paused with its progress and reserved materials intact; resume never charges twice.
- An owned non-repeatable item does not block its first personal craft for progression.
  That craft uses the normal materials and time, completes the node, and leaves exactly one
  copy of its output item in inventory. Repeatable recipes retain their normal output quantities.
- Quests remain goals but no longer unlock recipes/buildings. Discoveries can start quests and
  provide local site capabilities. Buildings require capabilities rather than region allowlists;
  fish traps need a discovered fishing site in the current area, including beach shallows or river.
- `area`, `crafting`, and `building` tabs switch the centre panel while retaining the map,
  journal, and status. Tab changes do not pause work. Node clicks start creation using the
  existing persisted work/progress pipeline. Items enter inventory; buildings appear locally.
  Building use and production controls stay in the area tab; creation trees only create things.
- Compact 120 × 40 px nodes show their name, a small state/inspection control, and active
  progress. Reserve space for complete descendant branches and grow the canvas rather than
  wrapping siblings or shrinking the layout to the panel. Every parent stays above its children.
  A floating tooltip outside the scroll viewport contains category tags and all
  requirements; hover/focus or the inspection control exposes it without starting creation.
- Crafting and building must use the same layout and connector rules in `ui/tree-layout.ts`.
  Do not add tree-kind-specific placement or item-ID offsets. A single child stays directly
  below its predecessor; all siblings stay in one horizontal row centred on their common
  predecessor. A shared multi-parent group centres on the mean of its predecessor centres.
  Use vertical stems and shared horizontal forks, without obstacle routing or border detours.
  Viewport resizing must not rearrange branches; scrolling belongs to the tree panel and normal
  state updates retain both scroll offsets. Keep all prerequisite links for multi-parent joins.
- Both tree canvases support grab-and-drag panning with hidden scrollbars. Wheel/trackpad,
  native touch scrolling, and keyboard navigation remain usable. A drag must never activate
  creation or inspection; ordinary clicks and keyboard activation retain their behavior.
  Hide inspection hints during panning and keep all pointer handling in the shared UI.
- Initial content edges are rock knife to axe and rope independently, fire site to bed to
  shelter, and fire site to fish trap to rabbit trap. Completing construction of the fire site
  is sufficient; lighting it is not a progression requirement. Further initial links are
  confirmed in the detailed design and `content/trees/`; edges remain editable data.
- A fresh game is acceptable for this redesign. Implement an explicit incompatible-save
  boundary rather than inferring personal completion from pre-redesign possessions.

Keep permanent progression, current action requirements, and local production state separate.
Preserve existing reservation, scheduling, pause, completion, and local production invariants
except for the confirmed changes above. Dependency/category/site mappings live in validated
content; adding a node or editing an edge does not require engine or UI special cases.

## Responsibility boundaries

| Responsibility | Owner | Boundary |
|---|---|---|
| Gameplay definitions and balance | `content/` | Data uses the supported vocabulary, not executable code. |
| Loading, schemas, references, indexes | `src/content/` | Validate before play; expose a registry independent of file format. |
| Gameplay state and command orchestration | `src/core/engine.ts` | No DOM, storage, or browser scheduling. |
| Shared rules and simulation helpers | `src/core/` | Centralize costs, conditions, durations, time, RNG, and production. |
| Real-time scheduling | `src/app/action-controller.ts` | Schedule live steps and notify the application to save/render. |
| Save storage and compatibility | `src/persistence/` | Normalize and validate before constructing an engine. |
| Derived presentation | `src/core/selectors.ts` | Read state and produce a view; do not execute gameplay. |
| DOM, classic layout, visual interpolation | `src/ui/` | Send commands and render views; no second gameplay state. |
| Application wiring | `src/main.ts` | Connect engine, controller, persistence, UI, and debug tools. |

Treat registry definitions as read-only during gameplay. The engine mutates serializable state;
this is not an immutable reducer or event-sourced architecture. The journal is presentation
history, not the source from which state is reconstructed.

## Simulation invariants — implemented

- Advance live state in fixed game-time steps. Keep step size and real-time conversion in
  `content/game.json` (`stepMinutes`, `cosmetic.msPerHour`); do not scatter timing constants.
- Work previews and execution must share requirements, resolved input costs, tool factors,
  and duration rounding through `core/action-rules.ts` and the existing engine helpers.
- Reserve timed player-work materials at the start. Reserved inputs are unavailable to other
  work and automatic consumption. Item-action `uses` and extra costs must be added together.
- Persist work identity, location, required/completed work, reserved inputs, and status.
  Store data/content references, never callbacks or precomputed future game states.
- Apply rewards, arrival, discoveries, and completed construction only when work finishes.
  Remove the work record before applying results so later ticks cannot deliver it twice.
- Pausing preserves progress and reserved inputs. Resume must not charge the materials again.
- Player work requires presence in its area. Travel pauses work; returning allows resumption.
- Sleep pauses player work and jumps immediately to the next 6am in real time while simulating
  overnight production, timers, needs, and health consequences.
- An open popup blocks ordinary commands and scheduled work; its choices remain usable.
- `Engine.start` and `stepActions` drive browser play. `dispatch` drains the same pipeline for
  synchronous callers; do not maintain a second simulation implementation for tests.
- Save reservations immediately and progress at committed steps. Reload resumes that progress
  without offline advancement; partial wall-clock time within a step is not persisted.
- Restart/load must invalidate old callbacks. Use controller cancellation plus engine/state
  identity guards so stale timers cannot mutate a replacement game.
- Evaluate simultaneous stat-rate deltas from the same starting stats; JSON key order must not
  change simulation results. Keep randomness seeded and saved.

## Ownership, concurrency, and production decisions

| Decision | Status and implementation constraint |
|---|---|
| Player actions share focus in one area | **Implemented in core**: equal sharing; two actions each run at half speed. Current UI offers one active action. |
| A multitasker perk can reduce the penalty | **Future agreement**: extend the shared focus policy, not individual action durations. No skill-tree UI exists. |
| Structures work without player presence/focus | **Implemented**: production follows elapsed game time, including sleep, and requires collection. |
| Same building type in different areas is independent | **Implemented**: local state uses `building_id@region_id`. Never use a global flag for one structure's production. |
| Compatible traps in an area share a cycle and collection | **Implemented**: input-free additions join a compatible running batch immediately. |
| Partial bait applies only to supplied traps | **Foundation implemented**: local batches distinguish units/inputs/output. Future bait UI: five traps plus three baits means three baited and two unbaited; newly added traps are unbaited. |
| Required-input structures distinguish empty and supplied units | **Foundation implemented**: starting production affects only idle units; `startCycle.units` can limit the supplied count. |
| Each newly planted batch needs a full growth duration | **Foundation implemented**: independent batch start times. Richer planting/crop controls remain future work. |
| Harvested fields need seeds and replanting | **Future agreement**: preserve required-input behavior; do not make empty fields produce automatically. Crop-specific details need confirmation when implemented. |

Player work currently uses `PendingAction` with `owner: "player"`; structure production uses
separate local building batches. There is no universal owner-based job scheduler. Keep the
presence/focus distinction explicit without pretending the two models have already been unified.

Production batches record identity, unit count, start time, inputs, and optional output choice.
`core/production.ts` calculates readiness from game time; do not add per-building browser timers.
Collection claims are captured when collection starts and survive interruption/reload; later
production or newly added units must not silently change that claim. Enforce valid batch IDs
and unit totals. Named outputs belong in local batch state, as with fish/meat drying.

## Content extension rules

- First look for an existing condition, effect, outcome, recipe way, or production definition.
  Add new vocabulary when it expresses a real mechanic more clearly than composing existing rules.
- A new condition/effect needs schema support, reference validation, execution support, and a
  behavior test. Update explanations/selectors when player-facing requirements need them.
- Keep visibility, requirements, consumed costs, and results distinct. Do not make UI visibility
  the only enforcement of a gameplay restriction; direct commands must validate it too.
- Require tool capabilities such as `sharp`; specific-item conditions are appropriate when
  the method or narrative truly differs. Alternative methods need matching, exclusive text.
- Tasks define goals through `completeWhen`, logs, and effects. Keep their rows title-only.
  Do not restore duplicate quest costs, `needs`, `hint`, or `build` metadata; executable actions
  and craft/build tree nodes own requirements.
- Gameplay selects an eligible outcome and applies its effects before choosing its narrative.
  Use the separate narrative RNG for wording. Adding variants must not alter gameplay rolls.
- `Text` arrays are variants, not sequential lines. Preserve explicit text IDs when moving
  passages; ordinary inline variants use content-derived keys. Translation/import UI is future.
- Keep local mechanics local, quantities explicit, and references validated. Follow ID, JSON
  formatting, capitalization, and tool-tag conventions in `AGENTS.md`.

## Preferred patterns and shortcuts to avoid

Use schema-derived TypeScript types; discriminated unions for commands, work, and popups;
indexed registries for definitions; shared rule helpers; explicit serializable state transitions;
derived view models; and an injected scheduler for deterministic controller tests.

- Do not parse labels or prose to infer command kinds, timing, requirements, or targets.
- Do not compute an action's entire future state and replay snapshots over the live game.
- Do not duplicate engine calculations in the renderer or move gameplay behavior into layout code.
- Do not store functions, DOM references, or wall-clock deadlines as authoritative saved work.
- Do not silently discard unsupported saves or repair legacy shapes throughout normal engine code.
- Do not treat documentation comments as proof that a feature exists; verify executable paths.
- Do not replace the engine wholesale merely because it is large. Extract cohesive responsibilities
  with real consumers and tests; preserve one authoritative execution path.

## Save and presentation compatibility

- Change saved shapes through `state-schema.ts` and the loading/migration boundary. Bump the
  version when needed and test actual old saves, including paused work and collection claims.
- Preserve compatible progress and RNG streams. Reconcile removed references and return surviving
  reserved inputs when their work definition disappears. Keep unsupported/malformed saves intact
  and offer an explicit recovery choice. Major prototype resets require an announced decision.
- Keep autosave separate from the manual/pre-sleep save slot; a death remains in the autosave.
- Classic uses fixed panel IDs, selectors, and controls. Keep its CSS scoped and desktop/phone
  behavior usable; font selection stays independent of layout through `--font`.
- Keep keyed control updates so focus and progress survive rendering. Progress bars display
  simulation progress; they must not determine whether work completed.
- Optional artwork belongs to validated content and derived views, never saved state.
  The game-wide panorama, regions, items, and buildings reference the shared catalog. The
  global banner displays in a 160:33 slot with a non-stretched CSS crop; metadata records its
  actual source dimensions. Region-specific fallback artwork requires 1600 × 440 metadata.
  The shared UI image updater owns Pages-relative URLs,
  dimensions, alt/decorative treatment, and missing-image fallback. Labels and controls remain
  usable when pictures are absent. Preserve keyed image slots through normal view updates.
- Keep area/crafting/building navigation separate from travel. Local buildings stay hidden
  until present, and consumables stay hidden until qualifying carried items exist. Items with consumption/actions go in consumables;
  other items stay in inventory. Building-associated actions belong under the local building.

## Definition of done and decisions requiring questions

- Inspect the affected code, content, and tests before choosing an implementation. Preserve
  existing behavior unless the user requests a change or confirms an unresolved mechanic.
- Ask when a decision changes player expectations: interruption/cancellation, input loss,
  production grouping, eligibility after resumption, output delivery, or save compatibility.
  Routine implementation choices within confirmed rules do not need repeated approval.
- Test observable behavior and invariants, not a duplicate of the implementation. Cover affected
  reservation/completion, pause/resume, save migration, local independence, and timing paths.
  Keep game-rule scenarios in engine tests; browser cases cover interaction, rendering and
  application wiring. Avoid replaying the same rule for every content item or at both layers.
- Use deterministic seeds/variant mode and the existing helpers. Engine and browser tests use
  a frozen test-only content pack; production wording and labels must not set their expectations.
  Validate shipped content separately for schema and references. When adding a mechanic, extend
  the fixture with an intentional scenario and exercise its real commands/tree nodes, accounting
  for blocking notes. Verify the UI at desktop and phone widths.
- Run checks appropriate to the change and the required workflow in `AGENTS.md`; do not claim
  unrun checks passed. Documentation-only changes need link/diff review, not new behavior tests.
- Update relevant documentation with the change. Report behavior, validation, compatibility,
  and material limitations; distinguish implemented work from foundations and future agreements.
- Follow session authorization and `AGENTS.md` for commits/pushes; keep unrelated work untouched.

Deferred work includes multitasking controls, perks, bait/crop interaction details, translations,
CSV importing, an authoring editor, and a balance simulator. Their mention here constrains future
design; it does not expand the current task.
