# Content Studio — [implemented, PR-07 area workspace and rename]

Run `npm run studio` and open `http://127.0.0.1:5173/studio/`. The same dev server serves the
ordinary game at `/`. Use Node 22.13 or newer. The Studio and its file API are absent from the
production build and Pages deployment. `npm run dev` remains the ordinary game workflow.
Startup prints the exact Studio URL, including custom ports.
A forbidden or non-JSON file API response prompts you to open that URL without a raw parse error.

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
tab through **Open game** and uses its ordinary save slots.

Generic forms, reference pickers, draft creation/duplication, reference-aware deletion, session
undo/redo and explicit saving are **[implemented, PR-05]**. Condition/effect builders and the text widget are **[implemented, PR-06]**. Area workspace and rename are **[implemented, PR-07]**.
Graphs and embedded game preview remain planned. The authoritative scope and delivery order live in the
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
Add these through the generic area/tree forms before saving; no links or nodes are automatic.

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
keys or action/consume tags; it cannot capture the engine action names explore/travel. Reference
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
