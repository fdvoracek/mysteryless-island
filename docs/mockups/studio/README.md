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
