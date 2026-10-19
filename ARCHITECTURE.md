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
- Keep all six layouts until the user explicitly chooses which to retire.
- Add abstractions to solve demonstrated duplication or an agreed extension need. Do not build
  a generic framework, plugin system, or new dependency solely for hypothetical features.

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
| DOM, layouts, visual interpolation | `src/ui/` | Send commands and render views; no second gameplay state. |
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
  and craft/build menus own requirements.
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
- Do not duplicate engine calculations in the renderer or create per-layout gameplay behavior.
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
- Layouts share fixed panel IDs, selectors, and controls. Keep CSS scoped and mobile behavior
  usable; font selection stays independent of layout through `--font`.
- Keep keyed control updates so focus and progress survive rendering. Progress bars display
  simulation progress; they must not determine whether work completed.
- Keep build/craft next to look around, local buildings hidden until present, and consumables
  hidden until qualifying carried items exist. Items with consumption/actions go in consumables;
  other items stay in inventory. Building-associated actions belong under the local building.

## Definition of done and decisions requiring questions

- Inspect the affected code, content, and tests before choosing an implementation. Preserve
  existing behavior unless the user requests a change or confirms an unresolved mechanic.
- Ask when a decision changes player expectations: interruption/cancellation, input loss,
  production grouping, eligibility after resumption, output delivery, or save compatibility.
  Routine implementation choices within confirmed rules do not need repeated approval.
- Test observable behavior and invariants, not a duplicate of the implementation. Cover affected
  reservation/completion, pause/resume, save migration, local independence, and timing paths.
- Use deterministic seeds/variant mode and the existing helpers. Exercise new content through
  its real menus and account for blocking notes. Verify shared UI across supported layouts.
- Run checks appropriate to the change and the required workflow in `AGENTS.md`; do not claim
  unrun checks passed. Documentation-only changes need link/diff review, not new behavior tests.
- Update relevant documentation with the change. Report behavior, validation, compatibility,
  and material limitations; distinguish implemented work from foundations and future agreements.
- Follow session authorization and `AGENTS.md` for commits/pushes; keep unrelated work untouched.

Deferred work includes multitasking controls, perks, bait/crop interaction details, translations,
CSV importing, an authoring editor, and a balance simulator. Their mention here constrains future
design; it does not expand the current task.
