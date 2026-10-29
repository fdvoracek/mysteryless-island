# Content Studio mockup — UX reference

Static, self-contained HTML screens showing the intended layout and flows of the Content
Studio. **[implemented, PR-04]** The navigation shell and visual tokens now exist in the read-only
browser. **[implemented, PR-05]** Generic forms, draft create/duplicate, undo/redo and save/conflict
handling now exist. **[implemented, PR-06]** Condition/effect/outcome builders and the text widget now exist.
**[implemented, PR-07]** The area workspace and reference-aware rename now exist.
**[implemented, PR-08]** Story and event graphs now exist. **[implemented, PR-09]** Creation-tree and map editors now exist (no mockup was drawn). **[implemented, PR-10]** The live preview panel now exists.
Scope, decisions and PR order live in
[CONTENT_STUDIO_IMPLEMENTATION_PLAN.md](../../CONTENT_STUDIO_IMPLEMENTATION_PLAN.md); where this
mockup and the plan differ, the plan wins. Nothing here is Studio code.

Open any file in a browser. Links move between screens; the activity editor's Form/JSON switch and
the create dialog (ID and required-field validation, pre-fill, file preview) work. Fonts load from Google
Fonts; offline the system fallbacks are used.

## Screens and the PRs that build them

| File | Screen | Built in |
|---|---|---|
| [area-workspace.html](area-workspace.html) | Area workspace for `forest`: properties, map and unlock, landmarks, linked activities, "used by", live preview panel | Shell PR-04 · workspace PR-07 **[implemented]** · live preview panel PR-10 **[implemented]** |
| [activity-editor.html](activity-editor.html) | Activity `strip_bark`: generic form, nested condition builder, yields, journal variants with the 80-character counter, pending diff, Form/JSON switch | Form PR-05 **[implemented]** · condition builder and text widget PR-06 **[implemented]** |
| [story-view.html](story-view.html) | Story graph: discoveries → tasks → areas/events, with the node inspector and "continue the story" actions | PR-08 **[implemented]** |
| [event-editor.html](event-editor.html) | Event `shipwreck`: scene graph, modal vs journal text, choices with effects, graph checks | PR-08 **[implemented]** |
| [create-dialog.html](create-dialog.html) | Generic create dialog, shown for an area: ID plus the schema's required fields, a pre-filled unlock rule from the story view, file preview; Create stays disabled until the entity is valid | PR-05 **[implemented]** (pre-fill used by PR-08) |
| [redesign-shell.html](redesign-shell.html) | Redesigned shell: tree navigation, activity inspector, rules as sentences, outcomes table, context rail, ⌘K palette, changes drawer, optional-field chips | UX-02..UX-09 [proposal] |

Not drawn: the PR-09 tree and map editors (described below), the diagnostics panel in
detail, and forms for items, recipes, buildings and tasks (these use the same generic form as the
activity editor).

## Visual language for PR-04

PR-04 turns these into Studio-wide tokens; later PRs reuse them instead of inventing new styles.
The Studio's look is a neutral tool UI, separate from the game's book style
([VISUAL_STYLE.md](../../VISUAL_STYLE.md) does not apply to it); game text previews use a serif.

| Token | Value | Use |
|---|---|---|
| Ground / panel | `#F3F4F6` / `#FFFFFF` | page background / cards and side panels |
| Border / input border | `#D9DCE1` / `#C9CDD3` | panel and input outlines |
| Ink / muted | `#16191D` / `#545C66` | text / labels and secondary text |
| Accent / accent soft | `#1F5FAD` / `#E6EEF8` | primary buttons, links, selection |
| OK / warning / error text | `#245733` / `#8A4608` / `#9A2A1F` | validation states |
| Story node fills | discovery `#F6EEDF`, task `#E6EEF8`, area `#E5F0E8`, event `#EFE9F6` | story and event graphs (each also labelled, not colour-only) |
| UI font | Inter, system-ui fallback | everything except IDs and game text |
| ID / code font | JetBrains Mono, ui-monospace fallback | IDs, file paths, JSON |
| Game text font | Source Serif 4, Georgia fallback | journal and modal text previews |

For the redesign, the tokens and component rules in [STUDIO_UX_PLAN.md](../../STUDIO_UX_PLAN.md) §5 extend this table; where older screens differ, the redesign plan wins.

Inline styles in these files are for the mockup only; implement them as Studio components and
tokens, not by copying markup.

## Data and maintenance

Screens use real content as of 2026-10-21 (forest, `strip_bark`, `shipwreck`, landmark journal
lines, entity counts); later content edits may make those details stale without making the layout
wrong. When a UX decision changes, update the affected file here in the same PR. The Claude design
artifact "Content Studio mockup" was the working copy these files were exported from; this folder
is the reference agents use.

## UX-02 implementation differences — [implemented]

Specified by the UX-02 prompt: composite labels sit above their controls, row members have
captions, the locked ID remains a read-only textbox without a Rename button, and optional chips
follow the set fields within each object. Help text follows the prompt's exact schema-bound
table; rows require at least two set members, otherwise the field keeps its own label.
Differences: none within the UX-02 scope. The mockup's cards,
compact rules/text/outcomes, navigation and context rail remain later UX work.

Evidence in [ux-02/](ux-02/): [activity beside mockup](ux-02/activity-comparison.jpg),
[item beside mockup](ux-02/item-comparison.jpg), [390px activity](ux-02/activity-phone.jpg).

## PR-05 implementation differences — [implemented]

The owner decision of 2026-10-22 in plan §4.3 supersedes the mockup's immediate-create wording:
Create opens an unsaved draft, then Save validates all drafts and writes all dirty files
sequentially. The implementation opens the generic form; the area workspace remains PR-07.
The activity screen's condition builder, text widget, pending diff and preview shortcut remain
outside PR-05. Conditions and texts use generic forms or JSON. The conflict dialog retains a
changed draft and requires explicit overwrite after a fresh disk-hash check.

## PR-06 implementation differences — [implemented]

The activity mockup's nested rules and alternative-text controls are implemented through widgets
registered by schema identity, including effects and recursive roll outcomes. The selector uses
schema terms all/any/not; not has exactly one child, so converting multiple children wraps them
in all. Each rule has an editable JSON toggle and a state-independent Studio “Reads as” phrase.
Reference choices and summaries show ID plus label. Recursion falls back to JSON at depth six;
current shipped and fixture content never reaches it.

All journal alternatives have counters with warnings above 80 characters (not at 80), and
placeholder-set differences warn too. A first-alternative hint explains `?variants=first`.
Switching to single requires one alternative; explicit objects with comment keys retain that
form. Text representation changes may change memo keys. Modal/journal labels follow the narrative
guide through a small classification table; unlisted fields remain Text.

The implementation retains the PR-05 generic form layout rather than the mockup's activity-only
Basics/Requires/Yields cards. Pending diff, area-link shortcuts and embedded preview remain
outside PR-06; play in the ordinary game in a second window. No mockup control expands PR-06 scope.


## PR-07 implementation differences — [implemented]

By area opens the workspace within the existing navigation/entity-list shell. Cards are stacked
and retain schema-generated fields plus PR-06 widgets rather than copying the static summary
rows. The map is an editable, pannable grid with travel-hour/camp labels and occupied-cell
warnings. The full map/creation-tree graph editors remain PR-09; embedded live preview remains
PR-10 and Open game still opens a second window.

New area uses the existing PR-05 dialog and opens an unsaved workspace. New activity in this area
explicitly stages both its independent definition and ordered area link; it does not save from
the dialog. Linked activities expose reorder/unlink/link-existing controls; global offerings are
read-only. Used by is split between the area and each individual landmark, linking to exact
source file/field locations.

Rename controls enumerate root and nested IDs, scene/product/tool keys and singleton identities.
The preview lists field changes and file moves, warns about existing-save progress, and stages
one undo step. Owner-approved protocol IDs have disabled controls with visible reasons from one
Studio constant. Save uses ordered atomic file moves followed by content writes, with partial
failure reporting. Delete remains clickable for inspection even when referenced, so its dialog
can show the blocking references and orphan-activity Keep/Delete them too choices. Referenced
landmark removal similarly shows its blocking references. These controls replace the mockup's
inert rename and disabled-delete examples.


## PR-08 implementation differences — [implemented]

Story and events reuse the navigation shell. React Flow supplies pan/zoom and dagre supplies
layout; the fixed mockup columns are not authored positions. Every reference position gets an
edge, including conditional text and nested conditions, so the real fixture graph is denser than
the hand-picked mockup. Edge labels describe positions; effect references follow referenced-node
to owner direction, while flags bridge setter → flag → reader. Engine flags show “set by the
game”; reads without setters warn. Area membership follows connected story nodes from area and
landmark anchors. All five node kinds have filters. Both graphs offer equivalent accessible lists.

Node clicks open editors immediately. Each landmark/task has a Continue the story action; the
Story node selector also supplies the continuation inspector without requiring a mouse; it offers both discovery and completed-task shortcuts. All creation
stays in memory until Save all, superseding the mockup's immediate-write wording. Flags offer
source links rather than an independent entity file or rename operation.

The event screen retains schema-generated event properties and PR-06 widgets. The selected scene
or choice panel sits alongside the graph on wide screens and below it on narrower screens.
Start has a visible border/label; terminal choices share a close marker, and missing targets
have explicit dashed markers. Scene deletion requires explicit retargeting of external incoming
choices. Start is reserved. Missing-start and dangling-next messages come from the registry;
unreachable scenes warn without blocking Save. The static preview shortcut remains PR-10;
play through Open game in a second window.


## PR-09 screens (no mockup existed) — [implemented]

**Trees** (Browse): a crafting/building switch, the layout note and progression warning, then the
React Flow graph (or its accessible list) with nodes `recipe|building: id · branch · order` and
prerequisite edges. Below it three cards: *Selection* (branch, order, prerequisites with Remove,
add-prerequisite picker, unlocks, Open, **New recipe/building here**), *Branches* (name, order,
Rename, Delete — disabled with a reason while used — and Add branch) and *Not placed yet*
(**Place in tree** dialog with branch and prerequisite checkboxes). Cycle and cross-tree refusals
appear as an alert above the graph.

**Map** (Browse): a pannable grid with an area button per cell (camp outlined, "default cell"
when `map` is unset), dashed camp-centred paths labelled with travel hours, a dashed ghost marker
for keyboard moves, and an *Areas* card with a `travelHours` input and workspace link per area,
the registry's inline diagnostic and a text list of paths from the camp. Occupied-cell refusals and
overlap warnings appear above the grid.


## PR-10 implementation differences — [implemented]

The preview is a collapsible column to the right of the content on every screen (below it on
narrow screens), opened by **Preview** in the header, not a card inside the area workspace. It is
closed by default and the iframe exists only while it is open. Controls: seed and **New game**,
**First variants**, item picker + amount + **Give item**, hours + **Advance time**, area picker +
**Unlock area**, task picker + **Start task**, **Open in a new tab**. A fixed label states that the
preview uses saved content and its own save slots. With unsaved drafts the panel shows *Preview
shows saved content – N unsaved changes* with **Save and reload preview**; with registry errors it
shows **Show diagnostics** next to the game's content error screen. Reload follows the saved files
automatically; there is no reload button.

## UX-03 implementation differences — [implemented]

Specified by the UX-03 prompt: cards apply only to Activity and Item document roots; empty cards
are omitted, with unknown/unlisted set fields in Other. Titles are Basics, When can the player do
this?, Journal and Results for activities; Basics, Use and Item actions for items. The prompt's
Journal/Results titles replace the mockup's Journal while working/Outcomes. Generic summaries use
shared reference labels and `describe()` wording, first Text alternatives and array counts;
condition parts begin with their lower-case field label and a colon, and one-entry array counts
drop the label’s trailing “s”. There are no journal/roll badges or bespoke outcome summaries.
Existing nested widgets, scalar row captions, optional chips, shell and Rename IDs stay as
implemented in UX-02 and earlier PRs.
Region/Landmark and the other entity sections are deferred to UX-03b.

Root string comments become editable Note banners with mono keys. Field-specific comments sit
above their field or optional chip; other notes sit above the first card. No example note is
invented for `catch_fish`, which has none. Site/Artwork gain notes only. Collapsed titles are
remembered per schema; diagnostic/Used by reveal opens enclosing details without persisting a
choice and stays open through subsequent edits. Clearing a note preserves its key and empty
string. Native summary keyboard activation is retained.

The UX-03 review removes the outer white form frame for sectioned roots: cards sit directly on
the editor ground. The File contents region and Content form heading remain available to
assistive technology, while its status is a small muted line above the cards. Non-sectioned forms,
JSON, Rename IDs and Used by retain their existing presentation. OptionalChip and RootSections
are small local components; the chip markup and card behavior are unchanged.

Real deviations: none. Water can has no set consume/tool fields, so its empty Use card is omitted
as specified, while its nested item action keeps its existing form.

Evidence in [ux-03/](ux-03/): [open cards beside mockup](ux-03/cards-open-comparison.jpg),
[collapsed cards beside mockup](ux-03/cards-collapsed-comparison.jpg),
[author note](ux-03/strike-fire-note.jpg), [390px open](ux-03/catch-fish-390.jpg).
Desktop captures use a 1440×900 viewport and disposable fixture content. Both comparison panels
are at 100% scale: the implementation editor column is cropped rather than resized; the mockup
card column keeps its native width. The 390px captures have
`document.documentElement.scrollWidth === 390`.

Read-only shipped `content/activities/catch_fish.json` measurement at 1440×900, using
`.editor-fields.scrollHeight`: UX-02 baseline at `4241ac3` **5,831 px**; reviewed UX-03 all open **6,016 px**;
all four cards collapsed **249 px**. Open cards add their headers/body spacing; nested widget
compaction remains UX-04/UX-05.

## UX-04 implementation differences — [implemented]

Specified by the UX-04 prompt and approved refinements: Condition/Effect operators remain native
kind selects with unchanged options and accessible names, styled uppercase without visible kind
labels. All/any headers read “[all/any] of these”; leaf reference tokens, phase/warmth/effort
checkbox pills and inline scalar fields share the existing schema forms. Absent range fields
show “+ at least” / “+ at most” chips; set optional inline fields use a ghost × with their existing
Unset name. Simple own-key objects keep inner captions, and own-key booleans have no caption.
Complex fields and roll outcomes stay below the sentence; give/take amounts reuse the record
editor inline. Only depth-zero rules have Reads as summaries; nested groups/not children are boxed.

Text has a widget-header channel badge and variant count, the existing form select, numbered
serif auto-height rows, journal-only n/80 counters and “+ add variant”. Explicit IDs remain above
the rows. Actions belong to their own row, show on hover/focus and remain visible on narrow or
hoverless devices. Hidden checkboxes expose their focus ring on the pill. A small minimum text
row height keeps actions below the counter without covering either text or counter.

Specified differences from the static mockup: root composites retain UX-02 labels above controls;
UX-03's “Journal” card title stays, with the channel badge inside the widget rather than the card
header. The operators use schema names ITEM/PHASE rather than CARRYING/PHASE IS; groups use the
prompt's header order. Fixture requires.item has no gte, so no default value is written or shown.
Every top-level rule gets its own summary using unchanged describe() wording. Existing reference
labels retain their em-dash separator, and native reference selects retain every option. Only
groups expose add-condition/group links. Text form controls and the first-variant hint remain.
The fixture's prose differs from the mockup; neither pack was edited for screenshots.

Real deviations from the approved UX-04 scope: none. Generic array/record entry boxes, outer
Unset controls, shell, outcome tables and card-title badges remain deferred; UX-04b owns generic
row compaction and Unset hover/focus behavior.

Evidence in [ux-04/](ux-04/): [rules beside mockup](ux-04/rules-comparison.jpg),
[text beside mockup](ux-04/text-comparison.jpg), [390px rules and text](ux-04/catch-fish-390.jpg).
Both comparison sides were captured at 1440×900 with device scale 1, cropped at native size and
placed beside each other without resizing. The implementation uses a disposable fixture pack;
all three JPEGs are below 200 KB. The phone capture has document.documentElement.scrollWidth = 390.

Read-only shipped catch_fish measurement at 1440×900 with all four cards open:
.editor-fields.scrollHeight **6,016 px** at baseline **654f06a**, **2,810 px** after UX-04
(3,206 px / 53.3% reduction). The shipped measurement and fixture screenshot sources are separate.

## UX-04b implementation differences — [implemented]

Specified by the UX-04b prompt and approved plan: generic arrays lose entry boxes and left
borders. Scalar/reference/enum entries have no index label; object entries have a faint 11 px,
1-based index in a 22 px gutter, normal inspector fields and #EEF0F2 dividers. Entry toolbars
show ↑ ↓ × at the line end or block's top right, with “+ add entry” below. After review,
object entries use one grid row with three columns (`22px | minmax(0, 1fr) | auto`): the
index aligns beside the first field label and actions occupy the right column, including at
≤760 px. Scalar number inputs are capped at 120 px; row members retain 64 px and inline rule
numbers retain 56 px. Rule array children
retain their UX-04 toolbar with no duplicate actions. Non-inline records show a reference-label
or mono key token, value and ×, with a “+ add key” link retaining the accessible name
`Add key`; inline item-amount records retain their appearance and “Add key” text.

Union selectors move into the field label line with a faint caption; same-path branch fields
omit their own label line, so a quest's Trigger label appears once. Array element Fields also
omit their label lines, leaving only the object's gutter number. Control accessible names stay
unchanged. Unset becomes faint ghost text on field hover/focus, including row-member captions;
hovering nested fields may reveal their parent's Unset, as approved. Toolbars and Unset stay
visible at ≤760 px and without hover. Widgets reset label suppression for Fields at different
paths, so an explicit Text ID retains its label inside an array element. Same-path object
wrappers retain label suppression. Rendering does not edit content.

Specified differences from the static mockup: outcomes remain fully editable numbered blocks,
not the UX-05 weight/odds table. Results and Item actions keep UX-03 card titles and UX-02
inspector fields; the mockup has no item-action card, so both comparisons use its outcome card
as requested. The shell, native kind choices, rule/text visuals and optional chips remain at
their current UX stage. No new placeholder controls or content were introduced.

Real deviations from the approved UX-04b scope: none. Action data replaces cloneElement,
inline/block leaf schemas have stable memoized identities, and the textarea observer compares
widths before resizing to avoid reacting to its own height changes.

Evidence in [ux-04b/](ux-04b/): [Results beside mockup](ux-04b/catch_fish-comparison.jpg),
[Item actions beside mockup](ux-04b/water_can-comparison.jpg),
[390 px Results](ux-04b/catch_fish-390.jpg), [390 px Item actions](ux-04b/water_can-390.jpg).
The implementation uses shipped content read-only; browser tests use the isolated frozen pack.
The comparison images were refreshed for the review fixes. Both desktop sides were captured
at 1440×900, device scale 1, cropped at native size and placed
beside each other without resizing. Both phone captures have
`document.documentElement.scrollWidth === 390`. The revised three-column phone layout was
rechecked at 390 px with visible actions and no horizontal overflow; the two original phone
images show the pre-review layout. All four JPEGs are ≤200 KB.

Shipped-content measurements at 1440×900 with every card open, using
`.editor-fields.scrollHeight`:

| Document | UX-04 baseline (`15d8c23`) | UX-04b before review | UX-04b reviewed | Reduction from UX-04 |
| --- | ---: | ---: | ---: | ---: |
| `activities/catch_fish.json` | 2,810 px | 2,324 px | 2,219 px | 591 px / 21.0% |
| `items/water_can.json` | 2,644 px | 2,370 px | 2,332 px | 312 px / 11.8% |

## UX-05 implementation differences — [implemented]

Specified versus the static annotation 10: rows use div grids with the approved
`100px | minmax(0,1fr) | minmax(0,180px) | auto` columns and the current Results card/Outcomes
field label. Weight is a 56 px existing Field with its diagnostic wrapper; chips use the
unchanged `describe()` phrases and reference labels rather than the mockup's shortened “+2 raw
fish”. The row toolbar adds the existing reorder/remove actions and the accessible Edit toggle.
Actions appear on hover/focus and stay visible at ≤760 px or without hover. The expanded editor
reuses all existing fields except weight, including optional chips and comments, and stays
mounted while hidden. The existing shell and card titles remain at their prior UX stage.

The owner's approved refinements apply: only conditioned arrays have the assumption title and
“≈” shares; text/effects cells are plain divs with mouse-only toggling and ignore active text
selection. Weight diagnostics stay in collapsed rows; interior diagnostics reveal their editor.
Actual deviations from the approved UX-05 specification: none.

Evidence: [collapsed table beside annotation 10](ux-05/outcomes-comparison.jpg),
[1440×900 desktop](ux-05/outcomes-desktop.jpg),
[one expanded row](ux-05/outcomes-expanded.jpg),
[390 px stacked rows](ux-05/outcomes-phone.jpg).
Desktop and mockup were captured at 1440×900, device scale 1; the comparison places native-size
crops side by side at 100%, without resizing either side. The comparison canvas is 1554×354.
All four JPEGs are ≤200 KB. Shipped content was opened read-only for these captures; browser
tests use the disposable frozen pack. Phone `document.documentElement.scrollWidth` is 390.

Shipped `catch_fish`, 1440×900, every card open and outcome rows collapsed:
`.editor-fields.scrollHeight` is **1,223 px**, versus the reviewed UX-04b baseline **2,219 px**
recorded above (996 px / 44.9% reduction).
