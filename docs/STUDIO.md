# Content Studio — [implemented, PR-10 live preview; JSON editor mode]

Redesign in progress: [Studio UX plan](STUDIO_UX_PLAN.md) [proposal].

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
Existing entity IDs are read-only in the
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

## Inspector layout — [implemented, UX-02]

Scalar fields use a label-left grid, with related set fields together in a row when at least
two row members are set. Row members have captions; duration and artwork dimensions show units.
Objects, arrays, rules, text widgets and raw JSON keep their labels above full-width controls.
At widths of 760 px or less, labels and controls stack. The read-only ID textbox uses mono text
on a ground background; reference-aware renaming remains in **Rename IDs**.

Studio-only hints bind to the exported Activity, Item, ItemAction, Site and Artwork schema
objects, providing visible labels and selected help lines. **[implemented, UX-03b]** Region,
Landmark, Recipe, RecipeWay, Building, BuildingStep, Quest and GameEvent also have hints. Other fields use humanized keys;
all controls retain their existing path-based accessible names. Fields without hints still
render, and rendering never adds values or changes content order.

Unset optional fields appear after the set fields in one **Optional:** line per object, with
dashed **+ Label** chips. Standalone optional fields in the area and event workspaces use the
same chip style. Adding a field uses the existing empty initial value; **Unset**, **Undo** and
**Redo** retain their behavior. Required-only Create forms show no optional chip line.

## Sections and author notes — [implemented, UX-03]

Activity and Item root forms group set fields into collapsible cards. Activity cards are Basics,
When can the player do this?, Journal and Results; Item cards are Basics, Use and Item actions.
Section cards, including the area workspace and event editor, sit directly on the editor background
without an outer form frame. The Content form heading stays available to assistive technology,
with a muted status line above the cards.
Empty cards are omitted. Future unlisted fields appear in Other, and the root Optional chip line
follows all cards. Display order does not reorder the JSON. Nested objects and required-only
Create forms keep their existing layout; JSON mode remains unchanged.

Condition summary parts start with the lower-case field label and a colon (for example,
“visible when: …”); array counts drop a trailing “s” for one entry (“1 tag”, “1 item action”).

Cards start open. Collapsed titles are remembered per viewer and schema under
`studio.sections:<SchemaName>` in localStorage. Closed cards show a short summary of set fields;
problem badges count exact field paths and descendants. Following a diagnostic or Used by link
opens every enclosing card before focusing the field. This reveal survives editing and does not
change the saved collapse preference.

Root string `_` comments are editable yellow notes. A comment named for a schema field, such as
`_hours`, appears above that field (or its optional chip); other comments appear above the form's
first card. Editing preserves the comment's key position; clearing it keeps an empty string.
Delete comment keys in JSON mode. Nested and non-string comments retain raw comment blocks.
Site and Artwork forms gain notes without cards.

**[implemented, UX-03b]** Recipe cards are Basics / Requirements / Ways; Building cards are
Basics / Building it / Production; Task cards are Basics / Start and finish / Journal / Rewards.
They reuse the same optional fields, summary and note rules. Recipe ways and building cycle
steps show Duration & effort rows; inline building construction/cycle objects keep humanized
field names because hints bind only to exported schemas.

**[implemented, UX-03b]** The area workspace uses the same remembered cards under
`studio.sections:Region`. Landmarks appears only when exploration exists; Add explore remains
in Text and exploration. Root string notes sit above their fields (`_explore` above the
exploration fields); unmatched notes sit at the top of Properties. Landmark entries have
dividers and hover/focus toolbars, always visible at ≤760 px or without hover. Closed Landmarks,
Linked activities and Used by summarize as `landmarks: n`, `activities: n` and `references: n`.
Landmark diagnostics count only on Landmarks, activity-link diagnostics on Linked activities;
Text and exploration excludes landmark paths, and Used by has no problem badge.

**[implemented, UX-03b]** Event properties is one remembered card under
`studio.sections:GameEvent`, with Title / Opens / Only when / Repeat labels and editable root
notes. Workspace scalar rows use the inspector's 8 px gap without additional field margins.
Each workspace card has one trailing Optional chip line for its unset fields; notes for unset
fields sit before their chips. Landmarks use × with the same Remove name and a “+ add landmark”
link. Linked activities use ↑ / ↓ / × entry toolbars on hover/focus (always visible at ≤760 px
or without hover), keeping the existing Move/Unlink names. The scene graph, selected scene/choice
panel and add dialogs retain their existing forms.

## JSON editor — [implemented]

JSON mode is a CodeMirror 6 editor (Studio-only dependency) over the whole file, including areas
and events: line numbers, folding, bracket matching, search/replace and syntax highlighting. Tab is
left to the browser so keyboard users can leave the editor. It opens on the house format
(`formatContent`); what is typed is the draft and is never reformatted while typing. Save writes
the house format, after which the editor shows the saved text with the cursor on the same JSON path.
`_` comments and key order are plain text, so they survive.

- **Errors.** JSON syntax errors and duplicate keys (which `JSON.parse` would silently collapse) are
  underlined at their line immediately. Registry diagnostics for the file are mapped from their field
  path to the line and shown inline once the draft is validated. All of them block Save as before. Malformed
  text is a buffer: the last valid draft stays in the pack, so one typo does not cascade into
  unknown-reference problems elsewhere.
- **Schema help.** `json-schema.ts` derives a JSON Schema from the Zod schemas (no change to
  `src/content`). Ctrl+Space completes keys, enum values, booleans and, for `ref()` fields, existing IDs
  including unsaved drafts; hovering a key shows its description where the schema carries one.
  Unsupported schema parts get no completion.
- **Undo.** While the editor has focus, Cmd/Ctrl+Z and redo belong to CodeMirror's history; the
  toolbar Undo/Redo use the Studio history. Edits reach the store after 300 ms of silence and become
  one Studio undo step on blur or after 500 ms without typing. Validation runs on the store edit,
  not per keystroke. A change from elsewhere (form edit, Studio undo, disk reload) replaces the text
  in place without taking focus.
- **Mode per file.** Game settings, stats and climate open in JSON; every other kind opens in Form.
  The last choice is remembered per file in `localStorage` (`studio.editorMode:<path>`).

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

Paths are normalized relative paths under `content/` ending in `.json`, `studio-layout/<name>.json`
(one level, JSON only; Studio view state, see below), or images under
`public/illustrations/` (`png`, `jpg`, `jpeg`, `webp`, `gif`, `avif`, `svg`). Traversal, absolute paths,
backslashes, hidden components, remaining encoded escapes, and symlinks are rejected. The layout directory follows the same
rules, including a rejected symlinked directory, and a rename cannot cross roots. Layout changes
never emit `studio:files-changed`, so they do not reload the game. Other file
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
Phase, warmth and effort use checkbox multi-selects styled as toggle pills; ranges and
day/reached objects use inline fields (UX-04).

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

A small channel table badges known modal and journal fields; unlisted fields carry a text badge.
Scene and discovery passages, exploration views/nothingLeft, and new-place text are modal.
Arrival/description, work and item logs, outcome text, thoughts, quest start/done logs and timer
warnings are journal. Quest doneLog also appears in the completion note and retains the journal
budget. Every journal alternative shows a source-character count and warns above 80 characters.
Different placeholder sets between alternatives also produce a warning. Both are guidance and
never block saving; schema/reference errors still do. Comments, object key order and untouched
values are preserved, and Save all retains the PR-05 whole-pack validation and sequential writes.


## Rules and texts — [implemented, UX-04]

Rules use sentence rows: the kind select is an uppercase operator without a visible kind label,
followed by reference tokens, checkbox toggle pills and inline scalar fields. Range captions are
“at least” and “at most”; unset optional fields remain add chips. Set optional inline fields
have a small × with their existing Unset accessible name. Complex fields, including roll
outcomes, stay below the sentence. Give/take item amounts use item tokens and number inputs.
All/any groups say “of these”; nested groups and not children have indented boxes. Each
independent top-level rule has one Reads as summary; nested rules do not repeat it.

Rule row actions (↑ ↓ { } ×) and text row actions (↑ ↓ ×) appear on that row's hover or keyboard
focus. They remain visible on narrow and hoverless devices. Checkbox pills show the focus
outline on the pill itself. Existing path-based accessible names and editing behavior stay intact.

Text widgets show a channel badge, variant count and compact text-form selector. Alternatives
are numbered serif rows with auto-height textareas, journal-only n/80 counters and a “+ add
variant” link. The explicit ID stays above the rows; the form selector's title explains memo-key
changes. First-variant guidance, placeholder warnings and mode-switching restrictions remain.
Generic arrays/records, their Unset controls and nested-object compaction are deferred to UX-04b.

## Lists, records and Unset — [implemented, UX-04b]

Generic scalar/reference/enum arrays use one control per line with ↑ ↓ × actions. Object
arrays use numbered blocks in a 22 px gutter, normal inspector fields and thin dividers;
there are no entry boxes or numeric field labels. “+ add entry” retains its existing
`Add <key> entry` accessible name. Condition/Effect entries keep their own rule toolbar.

Non-inline records show a key token, value and × per row. Reference keys use the shared
reference label; other keys use mono text. The new-key control and **Add key** remain.
Inline item-amount records retain the UX-04 appearance.

Union selectors sit compactly at the right of the field label line, preceded by “Value type”
or “Kind (<discriminator>)”; the selected branch does not repeat the same field label.
Selectors retain `<path> kind` (or `root kind`) and their existing switching behavior.

Row actions and faint ghost **Unset** buttons appear on their own entry/field hover or keyboard
focus. Moving to another card hides Unset. Hovering nested fields may also reveal their parent
field's Unset. At widths ≤760 px and on devices without hover, these controls stay visible.
All existing control names, editing behavior and Undo/Redo remain unchanged. Rule actions now
use explicit action data, leaf schemas are memoized, and variant textareas resize for text and
width changes without reacting to their own height changes.

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
Dagre lays it out automatically; no positions are written to content (pinned positions live in `studio-layout/`, see below). Pan, zoom, or switch to
**Accessible list view** for the same nodes, edges and source positions. Area and kind filters
apply to both views. Area membership follows connected tasks/events/flags from area and landmark
anchors; hiding a kind also hides its incident edges. Clicking a node selects it (see focus mode below); **Open** or a double-click opens its entity; landmarks
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


## Story graph focus, filters and saved layout — [implemented]

**Click selects.** Clicking a node (or a list entry) selects it and enters **focus mode**: the node and its
neighbours within **1 or 2 hops** (depth selector; incoming and outgoing edges) stay active, everything else is
dimmed and inert, in the graph and in the list. **Show all** or Escape leaves focus mode. **Open** (on the node,
in the list and in the side panel) or a double-click opens the entity, as clicking used to.

**Edge filter.** By default only story-driving edges show: trigger, completes, unlocks, effects that start
a task, unlock something or set a flag, and flag setters and readers. **Show all references** adds the rest
(for example conditions on text lines, and clearing a flag). The class comes from the reference position label,
never from field names. Layout, counts and the list follow the filter; area membership does not.

**Layout options.** Direction (left to right, top to bottom), spacing (compact, normal, wide) and **Group by area**:
areas become labelled boxes around their landmarks and connected tasks and events (the existing area-membership
rule; a node in several areas goes in the first by ID; flags and unconnected nodes stay outside). Each area is laid
out by dagre, then the boxes are. **Re-arrange** reruns dagre for unpinned nodes and refits the view. Options and
the viewport are remembered per viewer in `localStorage` (`studio.storyView`, read defensively). **Find a node**
searches names and IDs, centres and selects the hit (revealing it if a filter hid it).

**Pins.** Dragging a node pins it. Pins are saved in `studio-layout/story.json` at the repository root (outside
`content/`; the game never reads it), keyed by node identity (`quest:<id>`, `discovery:<id>`, `region:<id>`,
`event:<id>`, `flag:<id>`):

```json
{ "version": 1, "pins": { "quest:climb_cliff": { "x": 120, "y": -40 } } }
```

Pins are not content drafts. They autosave about a second after a change through the file API with expected hashes
(`null` on first create); they are outside whole-pack validation, not counted as unsaved changes, and a content
error never blocks them. On a 409 the layout is reloaded and the pending changes are reapplied. The toolbar shows
*Layout saved* or *Layout save failed – retry* (the retry button writes again). Unpinned and new nodes are placed
by dagre around the pinned ones (an unpinned node is moved along the cross axis until it no longer overlaps one).
**Unpin** (node, list, side panel) clears one pin; **Reset layout** clears all after confirmation. A layout file
that does not parse is ignored and shown as a warning; the next drag replaces it.

**Rename and delete.** A rename stages the layout key change with its content change (one undo step, pin shown
at once) and writes it when the rename's content is saved. Saving content prunes pins of nodes that no longer
exist (skipped while any content file fails to parse).

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

## Outcomes table — [implemented, UX-05]

Outcome arrays (activity, building-step and consume outcomes, plus effect rolls) show compact
rows with editable weight, rounded percentage, odds bar, first text variant and variant count,
and effects described with the existing reference labels. Zero total weight shows “—”. If any
row has a condition, every percentage is marked “≈”; the header explains that shares assume
every condition holds, and conditioned rows carry a `when` badge.

Click a row's text/effects or activate `Edit <path>.<index>` to expand its existing condition,
Text and effects editor. Text selection does not toggle the row. Weight stays in the row,
with its original accessible name and inline diagnostics; there is no second weight input.
The new “+ add outcome” row opens immediately and focuses its weight. Reorder/remove controls
appear on hover or keyboard focus, and remain visible on touch/narrow screens. Expansion is
session-only; Undo or navigation may reset it.

Interior diagnostics open the relevant row, and diagnostic links reveal hidden ancestor rows
before focusing the field. A weight diagnostic leaves its row collapsed because weight is
already visible. Collapsed card summaries show each share and its first effect (or “nothing”).
At ≤760 px each row stacks weight/actions, text, then effects. Deep recursion retains the
existing validated JSON fallback. No gameplay, content, save-format or `describe()` wording changes.

## Form internals — [implemented, UX-05.1]

`FormContext` and `useForm()` share one document's references, diagnostics, JSON buffers, error
reporting and creation/ID flags. Each `Field` receives its own `view` for presentation; nested
fields construct their view explicitly. ESLint prohibits JSX spreads in the form modules and
limits lines, including JSX, to 160 characters. Cards, rules, text variants and outcomes live in separate modules;
the original form/widget exports remain available.

The permanent markup guard snapshots normalized HTML lengths and SHA-256 hashes for every
fixture Form view and area workspace. Local HTML is written to `test-results/form-markup/` for
debugging. UI PRs that intentionally change form markup regenerate it with `vitest -u` and say
so in the PR body; refactors must not.

## Shell — [implemented, UX-06a]

The slim top bar contains the brand, **Search content**, validation chip, **Undo** / **Redo**
icons, **Save all**, **Create** and **Preview**. Existing shortcuts and actions are unchanged.
Click the validation chip to scroll to and focus **Diagnostics**. Save reports and request
errors remain directly below the top bar.

The document header shows a kind breadcrumb button, ID, title, draft-only **Unsaved** badge and
mono file path. **Form** / **JSON** retain the existing per-file mode; **More actions** (⋯)
opens **Duplicate** and **Delete**. Escape or an outside pointer press closes the disclosure and
returns focus to ⋯. Rename IDs and Used by remain below the editor until UX-06b.

The bottom status bar shows problems, **N unsaved files** (including zero), the store status,
**Refresh from disk**, **Open game ↗** and shortcut hints. Story layout status/retry remains in
the story toolbar because its rendering is internal to StoryView. At desktop width the document
header and status bar stick to their edges; document bottom padding clears the footer. At
≤760 px both are static, bars wrap, and shortcut hints disappear. Page scrolling is retained.
Create stays in the top bar until UX-07 adds contextual list creation. The changes/diagnostics
drawers follow in UX-06c; the search palette follows in UX-08.


## Context rail — [implemented, UX-06b]

Selected schema documents show Problems in this file, Linked from, Referenced by, Uses and IDs.
Problems open and focus their field; Linked from shows an activity’s position in each area.
Incoming references open the source field, while Uses opens the target definition and lists all
paths using it. Unresolved targets remain visible without a button. Areas include separate
reference groups for the area and every landmark; empty groups say “Not referenced”. The area
workspace’s former Used by card now lives here.

IDs keeps reference-aware Rename controls and reserved reasons. The document’s More actions menu
also offers **Rename ID…** for its root identity, between Duplicate and Delete.

At widths of 1100 px and above the rail is a 280 px sticky column with its own scroll. Below
1100 px it stacks after the editor, before global Diagnostics. Opening Preview always stacks
the rail, preserving editor space (at least 480 px at 1440 px). Story, Trees, Map and image views
have no document rail. There is no Try it section; use the existing Preview panel.


## Unsaved changes — [implemented, UX-06c]

The top bar's **N unsaved** button opens **Unsaved changes**, a right-hand modal drawer.
Each file has a modified/new/deleted/moved badge, a path button opening the editor, and a
numbered diff with two context lines. Both sides use canonical house formatting, so whitespace
alone does not appear as a change. Rename destinations compare against the original disk file.
Each file shows at most 200 diff lines and reports omitted lines; long lines wrap.
Opening a staged deletion shows its disk contents read-only until Discard restores it.

**Discard** restores an existing file's disk version in memory, including staged deletions,
and clears only that file's input buffers, errors and conflict. It never writes to disk.
Undo restores the discarded draft and inputs; Redo discards them again. Discard is disabled
for new files (**New file — remove it with ⋯ → Delete.**) and both paths of a pending rename
(**Part of a rename — Undo the rename to discard.**). These reasons remain visible.

**Save all (n files)** uses the existing Save all action and validation/conflict rules. When
blocked by diagnostics, the drawer says **Fix n problems first**. After saving or discarding
the last change, it stays open with **No unsaved changes**. Escape or × closes it; focus returns
to the unsaved button, or to Search content when the button disappears. At 390 px the drawer
fills the width; reduced-motion preferences disable its slide animation. The status bar keeps
its **N unsaved files** count. The validation chip still scrolls to global Diagnostics; the
context rail lists the current file's problems. There is no diagnostics drawer.

## Navigation — [implemented, UX-07]

The sidebar groups World (Map, Story, Trees), Areas, Library and Settings. Area rows show
names and travel hours (or camp); clicking one opens its workspace and a list of its area
file plus linked and global activities. Library scopes show file counts. Region Form views
always use the area workspace, including selections from All files, Areas and search.

List rows show names, IDs and distinguishing metadata: activities show hours, a global badge
when applicable and their visibility condition (or requirements, or always); items show their
category and tool tags. Unsaved and problem markers remain visible. Search behavior is unchanged.
The list footer opens the existing Create dialog for the current kind, or creates an activity
linked to the current area as one undoable draft operation. All files and Settings have no
contextual creation footer. Kind footers use `entitySchemas`, matching the Create dialog;
unsupported kinds (Illustrations and Creation trees) also have no footer. The top-bar Create
button remains until UX-08.
