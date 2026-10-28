# Studio UX redesign — plan [proposal]

Status: proposal, owner-reviewed 2026-10-28. Checked against `main` at `fc8f3b4`. Target location in repo: `docs/STUDIO_UX_PLAN.md`.
Mockup: `docs/mockups/studio/redesign-shell.html` (copy of `studio-redesign-mockup.html`).
Where mockup and plan differ, this plan wins. The Content Studio plan (PR-01..PR-10) is complete;
its §5 PR conventions and §5.1 game safety rules (“Studio-plan §5/§5.1” below) apply unchanged to every UX PR.

## 1. Problem (measured on shipped content, 2026-10-28, 1440×900)

| Screen | Source | Form today |
|---|---|---|
| Activity `catch_fish` | 45 JSON lines | 7,400 px tall, 108 buttons, 40 inputs |
| Area `forest` | — | 18,800 px tall, 304 buttons, 112 inputs |

Causes: every array entry is a bordered box with an index label and its own Remove/↑/↓ row;
every optional field renders separately with Unset/Add; labels are raw keys (`visibleWhen`, `gte`);
no grouping or help text; Diagnostics, Rename IDs and Used by sit below the form; three overlapping
navigation taxonomies; list rows show name + ID only (three “light fire”, two “catch fish”);
Create shows errors before any input, with raw Zod messages.

## 2. Decisions

| # | Decision | Source |
|---|---|---|
| D1 | Forms are the primary editor for **content**; JSON stays primary for **configuration** (game, stats, climate). Current per-kind defaults stay. No Split mode. | owner 2026-10-28 |
| D2 | Presentation hints (labels, help, groups, inline rows, summaries) live in a **Studio-only** file, not in `src/content`. | owner 2026-10-28 |
| D3 | Hints bind to **schema objects** (e.g. `Activity`, `Landmark`, `Outcome`), keyed by that object's shape keys — same rule as `widgetRegistry` (Studio-plan §5.1.5). Never by global field name. | proposal, follows Studio-plan §5.1.5 |
| D4 | Fields without a hint still render (humanized key, group “Other”). A new schema field appears in the Studio with no Studio change. | proposal, follows Studio-plan §5.1.5 |
| D5 | Accessible names stay stable: controls keep `aria-label={path}`; visible labels change. Region names (`Entity list`, `Content navigation`, `File contents`, `Diagnostics`), and button names `Save all`, `Undo`, `Redo`, `Create`, `Form`, `JSON`, `Delete` are kept or changed only with the browser tests in the same PR. | proposal |
| D6 | No change to `src/content`, `src/core`, `src/ui`, `src/persistence`, golden traces, fixtures or `SAVE_VERSION` in any UX PR. | Studio-plan §5.1 |
| D7 | Stale hints (key no longer in its schema object's shape) **fail a unit test**. At runtime a stale hint is simply unused. Studio-plan §5.1.5 is read as “the Studio keeps working without Studio changes”; deleting a stale hint line is the expected follow-up of a schema rename. | owner 2026-10-28 (G1) |
| D8 | Per-file **Discard**, simplest form: available only for a file that exists on disk and has no pending move. It stages the disk version through the normal edit path, so it is one ordinary undo step. New drafts are removed with Delete; files in a pending rename show “Undo the rename to discard”. No new store history logic. | owner 2026-10-28 (G2: least code) |
| D9 | Rename stays as implemented in PR-07 (reference-aware, one undo step, file move on save); the redesign only moves its controls (locked ID + **Rename…**, ⋯ menu, rail). ID suggestion from name exists only in Create (UX-09). | confirmed 2026-10-28 |

## 3. Open gates

None. G1 and G2 resolved as D7 and D8.

## 4. Delivery sequence (each PR independently mergeable)

| PR | Scope | Main files | Risk |
|---|---|---|---|
| UX-01 | Docs only: add this plan + mockup, link from STUDIO.md and mockups README | `docs/` | none |
| UX-02 **[implemented]** | Hint registry + inspector grid: `src/studio/hints.ts`; Field renders hinted label/help; label-left grid for scalars; related scalars in one row; unset optional fields become one always-visible chip line “Optional: + icon · + building …”. Hints for Activity, Item, ItemAction, Site, Artwork. | `form.tsx`, `hints.ts`, `studio.css`, tests | medium (form core) |
| UX-03 **[implemented]** | Collapsible root sections with generic one-line summaries and per-schema localStorage preferences; editable root author notes. Applied to Activity and Item; Site/Artwork gain notes only. | `form.tsx`, `hints.ts`, `summary.ts`, `section-prefs.ts`, `studio.css`, tests | medium |
| UX-03b | Extend hints and sections to Region/Landmark (area workspace), Recipe, Building, Quest and GameEvent properties, including workspace comments. | `form.tsx`, `area-workspace.tsx`, `event-editor.tsx`, `hints.ts` | medium |
| UX-04 **[implemented]** | Condition/effect rules as sentence rows with inline tokens and hover/focus actions; Text as compact serif variant rows with journal counters. | `form.tsx`, `widgets.tsx`, `describe.ts`, `studio.css`, tests | medium-high (tests) |
| UX-04b **[implemented]** | Compact generic arrays and records: no index boxes, hover/focus row toolbar, “+ add entry” links; Unset on hover/focus; nested object compaction. | `form.tsx`, `studio.css`, tests | medium-high (tests) |
| UX-05 | **Outcomes table**: weight + % odds, first text + variant count, effect chips; row expands to full editor. | `widgets.tsx` | low-medium |
| UX-06 | **Context rail + shell**: right rail (problems in this file, Linked from, Referenced by, Uses, Rename IDs); sticky doc header with ⋯ menu; header slimmed; status bar; **changes drawer** with per-file JSON diff and Discard (D8); global Diagnostics opens from the status chip. | `main.tsx` (split into `shell/`), `references.ts` (outgoing refs), `store.ts` (discard) | high — plan first |
| UX-07 | **Navigation tree** (World / Areas ▸ parts / Library / Settings) + list rows with a meta line (requires summary, global, hours) + “New … here” at list foot. | `main.tsx`/`shell/`, `documents.ts` | medium |
| UX-08 | **⌘K palette**: jump by name/ID/text, contextual create actions. | new `palette.tsx` | low-medium |
| UX-09 | **Create dialog**: errors after touch, humanized enum/required messages, ID suggested from name, kind defaults to current context. | `dialogs.tsx` | low |
| later | Story toolbar compaction; table view for items/recipes (CastleDB-style) | — | deferred |

Each PR updates `docs/STUDIO.md` (marks [implemented]) and the mockup README differences section.

## 5. UI specification (binding for UX-02..UX-09)

The mockup `docs/mockups/studio/redesign-shell.html` is the visual reference; this section is the
normative part. Values are targets at 1440×900; ±2 px is fine, different structure is not.
The mockup's inline CSS is reference only: implement as Studio CSS classes and tokens in
`src/studio/studio.css`, never by copying mockup markup.

### 5.1 Tokens
Existing Studio tokens stay (mockups README: ground `#F3F4F6`, panel `#FFFFFF`, border `#D9DCE1`,
input border `#C9CDD3`, ink `#16191D`, muted `#545C66`, accent `#1F5FAD`, accent soft `#E6EEF8`,
ok/warn/error text, story node fills; Inter / JetBrains Mono / Source Serif 4). Add only:

| Token | Value | Use |
|---|---|---|
| faint | `#8A929C` | section headings in nav/rail, counters, index numbers, hints |
| ok soft / warn soft | `#E5F0E8` / `#FBF0E2` | status chip, unsaved badge, changes button |
| note | bg `#FFFBEA`, border `#EFE3B0`, text `#5B4A12` | author-note banner |
| row divider | `#EEF0F2` | list rows, card body top border, table rows |

Type scale: base 13 px / 1.45; small 12 px; micro 11 px (labels in nav/rail headings uppercase,
letter-spacing .06–.08em); document title 20 px/600; list title 15 px/600. Game text (journal,
modal, outcome text) always serif 14 px. IDs and paths always mono 11–12 px.
Radii: inputs 5 px, buttons 6 px, cards 8 px, chips 999 px.

### 5.2 Shell (UX-06, UX-07)
- Rows: top bar 48 px · content · status bar 26 px. Page itself never scrolls; each column scrolls.
- Columns: sidebar 220 px · list 300 px · editor flexible · context rail 280 px.
  ≤1100 px: rail hidden (its content reachable from the ⋯ menu), sidebar 200, list 260.
  ≤760 px: single column (editor), sidebar and list behind a toggle; 16 px gutters; no horizontal
  scroll down to 390 px. Top bar keeps validation chip, “n unsaved”, Save all and ⋯ (brand, ⌘K
  trigger, Undo/Redo and Preview move into ⋯); status bar drops the shortcut hints; rule lines and
  inline rows wrap; outcome table uses fixed layout with wrapping text.
- Top bar, left to right: brand · ⌘K trigger (max 420 px, looks like a search field, shows `⌘K`) ·
  spacer · validation chip · unsaved-changes button (warn outline, hidden when 0) · Undo/Redo icon
  buttons · **Save all** (primary) · Preview · ⋯ (Refresh from disk, Open game ↗). Nothing else.
- Status bar: problems count · unsaved count · layout save state · right-aligned shortcut hints.

### 5.3 Sidebar (UX-07)
Four groups with uppercase micro headings: **World** (Map, Story, Creation trees), **Areas** (each
area expandable to Activities n / Landmarks & exploration n / Area settings; right-aligned meta =
camp or travel hours; “+ New area”), **Library** (Items, Recipes, Buildings, Tasks, Events, Sites,
Artwork & illustrations, All activities, each with count), **Settings** (Game · Stats · Climate).
Item: 4×8 px padding, radius 5, hover ground, current = accent-soft bg + accent text 500.

### 5.4 List (UX-07)
Sticky head: title (“Activities · the beach”), one muted line of context, filter input, filter
chips (pill, selected = ink bg). Row: line 1 = **name** (500) + mono ID muted + right-aligned key
number (hours); line 2 = muted meta (requires summary via `describe()`, `global` badge), ellipsis.
Selected row: accent-soft bg + 3 px accent inset bar. Unsaved = warn dot. Sticky foot:
“+ New <kind> in <area>” full-width + “link an existing one…”.

### 5.5 Editor (UX-02..UX-06)
- **Doc header** (sticky, ground bg, bottom border): breadcrumb (links) · title 20 px + Unsaved badge ·
  Form/JSON segmented control (selected = ink bg) · ⋯ (Duplicate, Rename ID…, Delete).
- **Cards** (UX-03): panel bg, 1 px border, radius 8, 12 px apart. Summary row 9×14 px, bold title,
  optional badge, right-aligned muted one-line summary shown **only when collapsed**; ▸ rotates when open.
  Body 4×14×14 px with a row-divider top border.
- **Inspector grid** (UX-02): label column 130–140 px, 8 px row gap, 14 px column gap. Label muted
  12.5 px with optional faint 11 px help line under it. Scalars in the grid; composites span the
  full width with label above. Row hints place fields inline with 8 px gaps (number fields narrow,
  ~60 px + unit).
- **Locked ID**: mono on ground bg + ghost “Rename…” button.
- **Optional chips** (UX-02): one dashed-border line per object, “Optional:” muted, then dashed
  pill buttons `+ Label` in accent; accessible name `Add <key>`.
- **Rules** (UX-04): container `#FAFBFC`, 1 px border, radius 6. Group header “All of [all|any]”.
  Each rule one line: uppercase micro operator (`DISCOVERED`, `CARRYING`, `PHASE IS`) · value tokens
  (reference token = discovery fill; item token = `#F1F2F4`; enum tokens removable `×`, absent enum
  values as dashed `+ value`) · inline number inputs. Row actions (↑ ↓ { } ⋯) appear on hover **and
  on focus-within**; never hidden from keyboard. Dashed divider between rules. Text links
  “+ add condition”, “+ add group”. “Reads as:” line under the rule box.
- **Text variants** (UX-04): grid `22 px index · serif textarea (auto-height, 1 row min) · 54 px
  counter “n/80”` (warn colour above 80 for journal channel). Channel badge in the card title.
  “+ add variant” link. No per-variant bordered boxes or button rows.
- **Outcomes** (UX-05): table columns Weight (number input + % + 70 px bar) · Text (serif first
  variant + `+n` badge) · Effects (ok-soft chips, “nothing” faint) · expand caret. Clicking a row
  (not its input) expands an inline editor row with all variants, condition, effects.
- **Author note** (UX-03): note banner above the first card, one per `_` key, editable text.

### 5.6 Context rail (UX-06)
Panel bg, 12 px padding. Sections with uppercase micro faint headings: Problems in this file
(✓ ok line or problem links) · Linked from · Referenced by · Uses · Try it (serif quote of first
log line + “▶ Play from here” only if the preview can do it without new engine API, else omit).
Each reference = bordered button: label line + mono 10.5 px path line; click opens source field.

### 5.7 Overlays (UX-06, UX-08)
- **Changes drawer**: 420 px from the right between top and status bar, slides (200 ms). Per file:
  bold path, ghost Discard (D8 rules), mono diff (removed = error colour, added = ok colour).
  Footer: primary “Save all (n files)”.
- **⌘K palette**: centred, 620 px max, 70 px from top, radius 10, large shadow, scrim
  `rgba(22,25,29,.35)`. Input 15 px, groups Content / Text / Create with micro headings; result =
  icon · name · kind/area badge · right-aligned mono ID. Arrow keys move selection, Enter opens,
  Escape closes and returns focus.

### 5.8 Accessibility and states
Every interactive element keyboard-reachable with visible focus ring (2 px accent). Colour is
never the only signal (badges carry text). Hover-only affordances must also show on focus.
Empty, loading and error states keep the existing texts unless a PR says otherwise.

## 6. Design conformance (every UX PR)

1. Read §5 and open the mockup before coding; list in the PR plan which §5 items the PR implements.
2. Implement only those items; anything not drawn or specified → ask, do not invent UI.
3. Deviations from the mockup/spec are allowed only for accessibility, test stability (D5) or
   schema facts; each one is listed in the PR body and in the mockups README differences section.
4. PR body includes screenshots at 1440×900 of the changed screens (fixture content via
   `STUDIO_ROOT` is fine) next to the matching mockup area, plus one at 390 px with
   `document.documentElement.scrollWidth` equal to the viewport width. Evidence lives in
   `docs/mockups/studio/ux-NN/` as **JPEG or WebP, max 4 images per PR, each ≤ 200 KB**.
   Comparison images use the same scale for implementation and mockup: crop at 100 %, never
   shrink one side.
5. No new UI dependency (component library, icon font, CSS framework). Icons as text glyphs as in
   the mockup until agreed otherwise.
