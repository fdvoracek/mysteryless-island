# Mysteryless Island — editable text CSV preview

This folder is an **authoring and localization prototype**, not a new runtime text system. The files were extracted from the existing game as of 21 October 2026. Nothing under `content/` or `src/` was altered.

## What's here

| File | Purpose | Entries |
| --- | --- | ---: |
| [en.csv](en.csv) | English text extracted from all 15 `content/**/*.json` files: story, exploration, journal, messages, variant passages, items, buildings, quests, labels, tooltips, categories and alt text. | **919** rows |
| [ui-code-review.csv](ui-code-review.csv) | Potential hardcoded UI messages or snippets extracted from 12 TypeScript files. These are **candidates requiring human review**. | **112** rows |

The source CSV can be opened in Excel, Google Sheets, or a CSV editor. Please import it as UTF-8; some quoted cells contain **real line breaks** to preserve the story's original paragraph spacing.

## How to read a row

| Column | Description |
| --- | --- |
| `text_id` | Proposed semantic translation key. IDs are generated, **not yet used by the game**. |
| `variant` | Alternative wording number, starting at 1. Multiple variants with one text_id are interchangeable alternatives. |
| `group` | JSON folder or UI code. |
| `surface` | Expected presentation surface, e.g. `journal`, `modal`, `ui label`, `heading`, `tooltip / guidance`. Heuristically assigned; review before adoption. |
| `context` | Human-readable origin of the string. |
| `text_en` | English text to edit. |
| `source_file` | Path to the original game source. |
| `json_path` | Exact original JSON location; for TypeScript candidates, source line number. |
| `review_needed` | `yes` for uncertain text fields or hardcoded-code candidates. |

For example, `region.forest.explore.landmarks.spring.text` contains the longer spring-discovery modal; `region.forest.explore.landmarks.spring.journal` contains its shorter journal summary. One row per alternative is intentional.

## Important rules when editing

1. Change `text_en` without changing `text_id` or `variant`.
2. Preserve placeholders such as `{place}`, `{item}`, `{day}` and `{energy}` verbatim.
3. Keep modal descriptions and short journal lines distinct. `docs/NARRATIVE_STYLE.md` recommends no more than 80 source characters per journal variant.
4. Multiple rows of one text_id mean **randomized alternatives**, not sequential paragraphs.
5. Large event-scene text is stored in single multiline CSV cells; use proper CSV-aware editing.
6. A few generated IDs contain array positions (e.g. `arrive.1`). These should become explicitly stable author IDs during production integration if entries may move.
7. In `ui-code-review.csv`, literals with `${...}` are still TypeScript fragments and must be redesigned into translatable placeholders before they can be consumed.
8. Some user-visible words (such as item categories) also double as mechanics/data enums. Their use must be audited; **do not** translate actual IDs, tags, conditions or references.

## What's not implemented

- The game does **not** load these CSVs and editing the CSV won't change the live game.
- JSON text values have **not** been replaced with text references.
- Translation fallback, a language picker, localization-aware journal saves, and build-time validation have **not** been implemented.
- The TypeScript candidate list is a best-effort review list, not a certified inventory of every possible computed phrase.

This preview answers the authoring-workflow question first. Once its layout is agreed, a separate integration PR could build/validate localized bundles and refactor data+UI to use them.
