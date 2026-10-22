# Content Studio — [implemented, PR-10 live preview]

Run `npm run studio` and open `http://127.0.0.1:5173/studio/`. The same dev server serves the
ordinary game at `/`. Use Node 22.13 or newer. The Studio and its file API are absent from the
production build and Pages deployment. `npm run dev` remains the ordinary game workflow.
Startup prints the exact Studio URL, including custom ports.
A forbidden or non-JSON file API response prompts you to open that URL without a raw parse error.
The game plays inside the Studio through the **Preview** panel (below).

Navigate by kind or area, search IDs/names/text, and edit content through generic schema-generated
forms or JSON. Both views preserve author comments (`_` keys), key order and untouched values. Area navigation includes the area definition, its
linked activities and global activities. Other kinds and singleton settings remain available
through kind navigation. Illustrations are listed with their encoding and hash.

Diagnostics use the shared content registry. Selecting a problem opens its file and shows the
field location above the JSON. Invalid JSON stays visible as raw text. Changes made on disk
refresh through Vite's watcher; returning to the window or choosing **Refresh from disk** also
reloads the inventory. Dirty drafts survive refresh. If their disk file changes or disappears,
a conflict dialog offers **Reload disk version** or **Keep mine**. Keeping a draft does not grant
overwrite permission: the next Save opens the dialog again for explicit overwrite with a freshly
checked hash. A further disk change requires another confirmation. File API failures appear with a retry action. The game opens in a second
tab through **Open game** and uses its ordinary save slots (unlike the preview).

Generic forms, reference pickers, draft creation/duplication, reference-aware deletion, session
undo/redo and explicit saving are **[implemented, PR-05]**. Condition/effect builders and the text widget are **[implemented, PR-06]**. Area workspace and rename are **[implemented, PR-07]**.
Story and event graphs are **[implemented, PR-08]**. Creation-tree and map editors are **[implemented, PR-09]**. The embedded game preview is **[implemented, PR-10]**. The authoritative scope and delivery order live in the
[implementation plan](CONTENT_STUDIO_IMPLEMENTATION_PLAN.md).


## Editing and saving — [implemented, PR-05]

Form diagnostics validate a comment-stripped copy through the shared registry after a short
debounce; Save rechecks synchronously before writing. Forms walk the shared Zod schemas, including optional fields, arrays, records and unions. Add or
unset optional fields, add/remove/reorder array entries, and add/remove record keys. Reference
fields and reference record keys offer IDs from the current pack, including unsaved drafts.
Unions offer a value-type selector; discriminated unions use their discriminator. Unsupported
schema nodes, unknown fields and deeply nested structures use validated JSON input. Conditions, effects, outcomes and Text use specialized schema-bound widgets (below).
The JSON view also shows the canonical save preview. Existing entity IDs are read-only in the
form; use Rename IDs for reference-aware file moves. Changing the root ID in JSON fails filename validation.

**Create** supports the nine independent entity kinds, including artwork. The dialog is generated
from ID plus required fields and accepts pre-filled optional values. Settings and the two creation
trees are existing singletons, edited in place. **Duplicate** pre-fills the same dialog and lists
all nested IDs to replace, including landmarks, cycle steps, item actions, choice IDs and explicit
text IDs. New IDs must be valid and unique; duplication never silently changes references.
Creation opens an **unsaved draft**, with registry diagnostics. No placeholder author text is
inserted. A non-global activity needs an area link; a recipe/building needs its creation-tree node.
Add these through the area workspace and tree editor before saving; ordinary Create adds no links or nodes
(the explicit “New activity in this area” and “New recipe/building here” shortcuts do).

**Delete** lists “used by” file and field locations and blocks referenced entities. For an area or
building this includes references to its owned discoveries or cycle steps, including incoming
references from other parts of the same file for individual landmark removal. Unreferenced deletion
is staged until Save; singleton deletion is unavailable. Dirty files are marked in the list.
**Undo/Redo** and Cmd/Ctrl+Z / Cmd/Ctrl+Shift+Z operate on session drafts. Drafts and history are
memory-only; malformed JSON buffers also survive view changes and participate in undo/redo.
Leaving the page warns about unsaved work. Successful saves clear the history.

**Save all** / Cmd/Ctrl+S validates the complete pack, including all drafts, through the shared
registry and writes every dirty file through `formatContent` and the expected-hash file API.
Invalid values show inline errors and block saving. If disk content already has diagnostics,
a save may strictly reduce their count while retaining only existing diagnostics; it cannot
introduce a new one. The Studio refreshes disk hashes and rechecks the pack before writing.

Writes are sequential, **not a transaction**. If a request fails, the report lists exactly which
paths were written and which were not. Written files become clean; all unwritten drafts remain
for correction/retry. An interrupted group can leave an incomplete pack on disk; finish the
remaining save or use Git to recover. The existing file API guards each write, not the entire
pack against another editor changing an unrelated file after validation. A `409` retains the
draft and opens the conflict dialog. A keep-mine choice always needs explicit overwrite.

## Local file transport

The dev-only `tools/vite-content-api.ts` plugin binds to `127.0.0.1`. Every API request must have
`Host: 127.0.0.1:<actual-port>` or `Host: localhost:<actual-port>` and, when supplied,
exactly `Origin: http://<that-same-Host>`. Mixing the two local names is rejected.
Forwarded headers do not establish trust. Responses are
JSON with `Cache-Control: no-store`; cross-origin access is disabled.

| Request | Input | Successful response |
| --- | --- | --- |
| `GET /__studio/files` | none | `{ files: [{ path, content, encoding, hash }] }` |
| `PUT /__studio/files/<path>` | `{ expectedHash, content, encoding }` | `{ changed: [path], hash }` |
| `DELETE /__studio/files/<path>` | `{ expectedHash }` | `{ changed: [path] }` |
| `POST /__studio/files/<path>/rename` | `{ expectedHash, path: destination }` | `{ changed: [oldPath, destination], hash }` |

Mutation bodies use `Content-Type: application/json` and are limited to 32 MiB. `content` is raw
UTF-8 text with `encoding: "utf8"` for JSON; images use canonical base64 with `encoding: "base64"`.
`hash` is SHA-256 of the actual file bytes. Creation requires `expectedHash: null`; all other
mutations require the hash returned by the latest read. A mismatch or existing rename destination
returns `409`. Invalid input returns `400`, forbidden paths/origins `403`, unsupported media types
`415`, and unknown routes/missing deletion targets `404`.

Paths are normalized relative paths under `content/` ending in `.json`, or images under
`public/illustrations/` (`png`, `jpg`, `jpeg`, `webp`, `gif`, `avif`, `svg`). Traversal, absolute paths,
backslashes, hidden components, remaining encoded escapes, and symlinks are rejected. Other file
types are omitted from listings. Symlinks are conservatively unsupported even within these roots.

PUT writes a temporary sibling and renames it atomically. Requests are serialized around hash
checks and mutations. Rename moves one file without overwriting another; it does not change IDs
or rewrite references. The API transports raw bytes, including invalid JSON; registry validation
belongs to the Studio. The PR-05 editor sequences whole-pack saves and reports per-file results. Git remains the recovery mechanism. Do not expose this dev server through a public proxy.

## Validation and build boundaries

`ContentError.problems` and its error message preserve their existing string output;
`ContentError.diagnostics` contains `{ file, path, message }` entries recorded at each validation
site **[implemented, PR-04.1]**. Paths point into the raw JSON using dotted fields and numeric
array indices, including nested conditions, effects and ID-addressed definitions. Error strings
are built from these entries; no message parsing is used. Missing files show their expected path.
Duplicate activity links are rejected at the repeated array element. The public shared
content surface is `src/content/index.ts`; it re-exports definitions without loading a pack.

Vite is pinned to `~5.4` in `package.json`: the Studio dev-server plugin (`tools/vite-content-api.ts`)
relies on Vite 5 behaviour, so a minor upgrade needs a deliberate re-check.

`npm run typecheck` runs the import-boundary lint. `npm run build` checks the produced game bundle
for Studio/React code. Unit tests exercise the actual production build in a temporary output
folder and inspect its module list as well. See [testing](TESTING.md) for commands and coverage.

## Isolated Studio test data — [implemented, PR-04.1]

The serve-only API reads `STUDIO_ROOT` when supplied; otherwise its root is the checkout. This
option changes the content/image file roots, not the Studio source. The same allowlist, Host/Origin,
hash and symlink rules apply, including rejection of a symlinked root. With an override, Vite also
blocks direct access to the checkout's `content/`; Studio dependency scanning uses only its entry.
Do not use the isolated test server for game playtesting.

`playwright.studio.config.ts` creates a fresh temporary root from `tests/fixtures/content/` for
each run, adds an isolated-root comment to that copy, and supplies it through `STUDIO_ROOT`.
Workers share that run's copy; teardown removes it. A guard checks the marker and frozen prose,
and rejects the checkout's direct content route. Browser tests never read or edit shipped content.
Run `npm run test:studio`, then `git status --short -- content/` to confirm the shipped pack is clean.

## Conditions, effects and text — [implemented, PR-06]

Every Condition field offers a kind selector, nested all/any/not groups and schema-generated
leaf forms. Reference pickers and “Reads as” summaries share ID/name labels; unknown references
show their raw ID. Summaries use Studio-only `describe()`, without evaluating game state.
All/any groups support adding conditions or groups, removing and reordering. They require at
least one child: an empty group shows an inline error and blocks Save. Switching multiple
children to not wraps them in all, preserving the children under not's single child.
Phase, warmth and effort use checkbox multi-selects; ranges and day/reached objects use fields.

Effect lists support every schema kind, item amounts, stat deltas, timer changes, flags, journal
logs, quest starts, unlocks, buildings and cycles. Roll effects contain weighted outcomes with
optional conditions, text and further effects. Conditions/effects offer editable JSON toggles;
malformed JSON remains a repairable buffer and blocks Save. Unsupported rules use raw JSON.
Recursive builders stop at depth six and expose validated JSON there; neither current content
pack reaches this limit. Ordinary object nesting does not consume this recursive rule budget.
Controls work with keyboard focus, native selects/checkboxes and labelled reorder/remove buttons.

Text supports a single string, alternative list, or explicit ID with alternatives. Each alternative
has a multiline plain-text input, with add/remove/reorder controls. The first is what
`?variants=first` and tests display. Switching to single requires exactly one alternative: remove
extra alternatives explicitly first. Text objects with author comments retain their explicit
form so comments cannot be discarded by conversion. Changing representation may change the
text memo key. No text is rewritten automatically.

A small channel table labels known modal and journal fields; unlisted fields are simply Text.
Scene and discovery passages, exploration views/nothingLeft, and new-place text are modal.
Arrival/description, work and item logs, outcome text, thoughts, quest start/done logs and timer
warnings are journal. Quest doneLog also appears in the completion note and retains the journal
budget. Every journal alternative shows a source-character count and warns above 80 characters.
Different placeholder sets between alternatives also produce a warning. Both are guidance and
never block saving; schema/reference errors still do. Comments, object key order and untouched
values are preserved, and Save all retains the PR-05 whole-pack validation and sequential writes.


## Area workspace and rename — [implemented, PR-07]

Choose an area under **By area** to open Properties, Map and unlock, Text and exploration,
Landmarks, Linked activities and Used by in one screen. Properties use the generic schema form;
text and conditions reuse the PR-06 builders, including conditions on arrival and view lines.
Landmarks support add/edit/remove/reorder. Unknown author fields and comments are preserved.
The map picker shows explicitly authored cells, area names, travel hours and camp (travelHours 0).
Choose any cell or pan the grid; occupied cells warn without blocking Save. Numeric map fields
remain available. An area without a map keeps the game's default placement until a cell is chosen.

Reorder or unlink activities, or choose one with the **Existing activity** reference picker and
**Link existing**. The read-only global list distinguishes linked positions from globals appended
at the end. **New activity in this area** opens the PR-05 activity dialog, then stages its
independent file and the area's ID link together as one undo step. This is an explicit linking
choice. Ordinary Create still needs links authored separately. **+ new area** uses the same
schema-generated create dialog and opens the new area's workspace; there is no extra wizard.

**Used by** lists the area and every landmark separately, with buttons opening the source file
and field. Discovery references point to the landmark rather than the whole area. Removing a
referenced landmark is blocked and lists its references. Deleting an area is blocked by incoming
references to it or its landmarks. The delete dialog lists linked non-global activities that
would become orphaned: **Delete them too** includes their deletions in the same draft operation,
subject to external-reference checks; **Keep** leaves them as drafts that must be linked elsewhere
before Save. Shared and global activities are retained.

Every schema-backed file has **Rename IDs** controls for root/nested identities and local scene,
production and tool keys. The preview lists every changed file and field, record-key changes,
and any filename change. The new ID must be valid and unused by declared IDs, local definition
keys or action/consume tags; it cannot capture the engine action names explore/travel. A rename is refused only if it adds a registry diagnostic beyond those already in the pack (so an unplaced recipe does not block an unrelated rename). Reference
updates follow schema metadata and owner context, never text replacement. Local scene, production
and tree-branch references cannot capture equal names belonging to another owner. Text, comments,
key order and unrelated values remain untouched. Explicit text IDs can be renamed; existing game
saves lose progress tied to old IDs when unknown references are dropped on load.

Engine protocol identities have disabled rename controls with reasons from the single
[reserved list](../src/studio/reserved.ts): event scene start; activity sleep; stats health,
energy, hunger and thirst. The same list drives rejection and a guard scanning engine/registry
string literals against shipped and fixture identities/record keys. Only narrowly documented
harmless vocabulary matches are exempt. Newly detected hardcoded identities require owner review.

A rename stages all reference changes and its file move as **one undo step**. Save first validates
the final complete pack and refreshes disk hashes. It then performs file moves in ascending source
path order, followed by content writes/deletes in ascending path order. Moves use the atomic,
expected-hash rename endpoint; the content write to the destination uses the returned hash.
Singleton files retain their fixed filenames. If a pending move conflicts with disk changes,
Keep mine requires explicit overwrite; to reload either filename, close the conflict dialog and
Undo the rename first so its references and file move are undone together. A newly created unsaved entity only changes draft
paths; there is no disk file to move. Partial failure retains unsaved drafts and reports both
written/pending paths and whether the old or new filename remains. A failure between move and
write leaves only the new filename, temporarily containing the old content; Retry Save completes
its content and reference writes. A failure before the move leaves only the old filename.
These are sequential operations, not a whole-pack filesystem transaction; use Git to recover if
needed. Any acknowledged disk mutation clears undo history because session Undo does not revert
filesystem operations. No save-version or game behavior change is included.


## Story and event editors — [implemented, PR-08]

Choose **Story** in Browse for a read-only graph of landmarks, tasks, events, areas and flags.
Dagre lays it out automatically; no positions are written to content. Pan, zoom, or switch to
**Accessible list view** for the same nodes, edges and source positions. Area and kind filters
apply to both views. Area membership follows connected tasks/events/flags from area and landmark
anchors; hiding a kind also hides its incident edges. Clicking a node opens its entity; landmarks
open their area workspace scrolled to that landmark. Flags open their Used by inspector.

Each reference position remains a separate edge. Conditions point from the referenced node to
the owning landmark/entity, labelled trigger, completes, unlocks or when. Effect references use
the same direction with effect: starts/unlocks labels. Flag edges show setter → flag → reader;
clearing a flag has its own label. Edges describe references, not guaranteed gameplay order:
all/any/not and conditional effects retain their semantics in the source forms. Flags supplied
by the engine say **set by the game**; unknown setters produce nonblocking typo warnings.
Flag inputs offer existing names and accept a new snake_case name. Flags are not rename targets.

Use **Continue the story** on a landmark/task node (also available in the list), or choose
one in **Story node** below the graph. **New task when this
happens**, **New event when this happens**, and **New area unlocked by this** open the existing
create dialog with discovered or quest-is-done conditions pre-filled. Fill the required fields,
create a draft, complete its links, then Save all. The dialog never writes files.

Event files open the scene editor in Form mode. Event properties include reachable triggers;
scenes use modal text and separate journal summaries with the existing guidance. Click a scene,
a choice edge, or the corresponding accessible list entry to edit it. **Add scene** requests
an ID and author text. **Add choice** targets an existing scene, closes the event when next is
omitted, or explicitly creates a new target scene in the same undoable edit. Remove the last
choice to return a scene to its close behavior. Choice effects use the PR-06 effect builder.

**Rename scene** uses the PR-07 preview and reference rewrite. Start cannot be renamed or deleted
by these controls. **Delete scene** lists incoming choices and requires another scene as the
retarget before staging their rewrite and deletion together. Scene-internal references disappear
with that scene. Undo/redo and Save all retain the existing whole-pack rules.

Graph checks display shared registry errors for missing start/dangling next and Studio-only
warnings for unreachable scenes. Only registry/input errors block Save. JSON mode remains
available for inspection and repairs; missing targets stay visible as graph markers. A close
marker makes choices without next visible in both views. Playtest in the **Preview** panel or through **Open game**.


## Creation tree and map editors — [implemented, PR-09]

**Trees** in Browse opens the crafting or building tree. Dagre arranges the React Flow graph
automatically and nothing about it is saved; the game draws the tree with its own layout and only
the prerequisites are authoritative. **Accessible list view** shows the same nodes and prerequisite
edges. Nodes show the target, branch and order. Select a node (graph or list) to change its branch
and order, add or remove prerequisites with the picker, open the recipe/building, or start **New
recipe/building here**. Select an edge to remove that prerequisite. You can also drag from a node's
right handle to another node's left handle. Parents must be nodes of the same tree. A change that
would create a cycle (including a node as its own parent) is refused before it is staged, with the
cycle path. A warning reminds you that changed prerequisites change progression for new games,
while existing saves keep their earned unlocks.

**Branches** can be added, renamed (PR-07 preview; you stay in the tree view) and have their name/order edited. Deleting a
branch is disabled while nodes use it. **Not placed yet** lists recipes/buildings without a node,
each with **Place in tree** (branch and prerequisites; order = max + 1). Saving stays blocked by
the registry until all are placed. There is no stand-alone node deletion: deleting a recipe or
building (Delete, with Used by) also removes its node in the same staged change, unless another
node lists it as a prerequisite; those nodes are shown and nothing is detached automatically.

**New recipe here / New building here** opens the create dialog for the selected node (branch from
it, prerequisite = it; without a selection a starting node in the first branch) and stages the
entity and its node as one undo step. Save all writes both files after whole-pack validation.

**Map** in Browse shows every area at its `map` cell (areas without one at their order index on row
0, labelled default), the camp (`travelHours` 0) and a path from the camp to each area labelled
with its travel time. Locked and hinted states are not shown. Drag an area onto a cell, or focus
it, use the arrow keys to move a dashed ghost marker, press Enter to move it and Escape to cancel.
Click an area to open its workspace. Moving writes only `map` (explicitly, also for default-placed
areas). A cell that already holds an area is refused; cells with several areas show an overlap
warning. The side panel edits each `travelHours`; its step comes from `game.stepMinutes` and the
registry diagnostic (whole clock steps) is the authority. There are no arbitrary routes.


## Live preview — [implemented, PR-10]

**Preview** in the header opens a collapsible side panel on every screen with the real game in an
iframe (`/?preview`). It is dev-server only. The label reads: *Preview uses saved content and its
own save slots; your game save is untouched.*

- **Own saves.** `?preview` switches the autosave and saved game to `textisland.preview.save` and
  `textisland.preview.saved`; the player's `textisland.save`/`textisland.saved` are never read or
  written in preview mode, and the preview keys are never used without `?preview`.
- **New game.** The optional **Seed** (whole digits) reloads the iframe with `&seed=<n>`; the game
  clears the preview autosave, starts that seed and removes `seed` from its URL, so later reloads
  continue the game (a bookmarked URL that still has `seed` restarts it). Without a seed, New game calls `ti.reset()`. The same seed gives the same game.
  The seed is ignored outside preview mode.
- **First variants** reloads with `&variants=first` and continues from the preview autosave.
- **Controls** call the iframe's same-origin `window.ti` directly (no messaging): **Give item**
  (picker + amount), **Advance time** (hours), **Unlock area** (`ti.unlock`), **Start task**
  (`ti.quest`). Pickers list saved content. **Open in a new tab** opens `/?preview` (with the
  variants toggle) in a separate window using the same preview slots.
- **Reload.** The plugin reports content/illustration changes (Studio saves and external edits)
  as `studio:files-changed`. The game page reloads once after the changes settle (about 400 ms) and
  continues from its autosave, in the preview and in an **Open game** tab alike. Vite's own full
  reload is suppressed for content paths, so the Studio page never reloads and keeps its drafts and
  undo history. The save keeps progress that refers to items and places that still exist; ones
  removed from content are dropped on load as for any save.
- **Unsaved drafts.** The preview never shows drafts. With N unsaved files the panel says *Preview
  shows saved content – N unsaved changes* and offers **Save and reload preview**, the normal
  whole-pack Save (disabled when saving is blocked); the reload follows from the file change.
- **Content errors.** If the saved content has registry errors, the iframe shows the game's
  content error screen, the controls are disabled and **Show diagnostics** scrolls to the list.

Under `STUDIO_ROOT` (the Studio browser tests) the game loads that root's `content/` as a whole
instead of the checkout's; the checkout's `content/` stays blocked. Without it nothing changes.
