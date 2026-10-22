# Content Studio mockup — UX reference

Static, self-contained HTML screens showing the intended layout and flows of the Content
Studio. **[implemented, PR-04]** The navigation shell and visual tokens now exist in the read-only
browser. **[implemented, PR-05]** Generic forms, draft create/duplicate, undo/redo and save/conflict
handling now exist. **[implemented, PR-06]** Condition/effect/outcome builders and the text widget now exist.
**[implemented, PR-07]** The area workspace and reference-aware rename now exist.
Graphs and live preview remain proposals.
Scope, decisions and PR order live in
[CONTENT_STUDIO_IMPLEMENTATION_PLAN.md](../../CONTENT_STUDIO_IMPLEMENTATION_PLAN.md); where this
mockup and the plan differ, the plan wins. Nothing here is Studio code.

Open any file in a browser. Links move between screens; the activity editor's Form/JSON switch and
the create dialog (ID and required-field validation, pre-fill, file preview) work. Fonts load from Google
Fonts; offline the system fallbacks are used.

## Screens and the PRs that build them

| File | Screen | Built in |
|---|---|---|
| [area-workspace.html](area-workspace.html) | Area workspace for `forest`: properties, map and unlock, landmarks, linked activities, "used by", live preview panel | Shell PR-04 · workspace PR-07 **[implemented]** · live preview panel PR-10 (until then, play in a second window) |
| [activity-editor.html](activity-editor.html) | Activity `strip_bark`: generic form, nested condition builder, yields, journal variants with the 80-character counter, pending diff, Form/JSON switch | Form PR-05 **[implemented]** · condition builder and text widget PR-06 **[implemented]** |
| [story-view.html](story-view.html) | Story graph: discoveries → tasks → areas/events, with the node inspector and "continue the story" actions | PR-08 |
| [event-editor.html](event-editor.html) | Event `shipwreck`: scene graph, modal vs journal text, choices with effects, graph checks | PR-08 |
| [create-dialog.html](create-dialog.html) | Generic create dialog, shown for an area: ID plus the schema's required fields, a pre-filled unlock rule from the story view, file preview; Create stays disabled until the entity is valid | PR-05 **[implemented]** (pre-fill used by PR-08) |

Not drawn yet: crafting/building tree editor and map editor (PR-09), the diagnostics panel in
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

Inline styles in these files are for the mockup only; implement them as Studio components and
tokens, not by copying markup.

## Data and maintenance

Screens use real content as of 2026-10-21 (forest, `strip_bark`, `shipwreck`, landmark journal
lines, entity counts); later content edits may make those details stale without making the layout
wrong. When a UX decision changes, update the affected file here in the same PR. The Claude design
artifact "Content Studio mockup" was the working copy these files were exported from; this folder
is the reference agents use.

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
