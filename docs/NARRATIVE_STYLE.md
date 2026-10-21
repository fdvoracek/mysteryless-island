# Narrative style — Mysteryless Island

## Literary reference and intent

The game's voice is inspired by the **spirit of Jules Verne's *L'Île mystérieuse* (1874–75)**: geographical observation, practical ingenuity, natural history, measured danger, and the progressive conversion of a hostile place into a comprehensible home. Consult the original French text when studying Verne; English translations differ in phrasing and sometimes in substance. **Do not copy passages, fictional names, incidents, or translator-specific turns of phrase.**

The writing should resemble an expedition journal one might find in a nineteenth-century scientific adventure, but remain clear to a modern reader. It is not a parody of Victorian diction.

## Narrative voice

- **Second person:** the player observes, examines, reasons, and acts. Prefer "you" over an external omniscient narrator.
- **Present tense for immediate views and recurring activities;** past or reflective forms are appropriate to recalled experiences and completed work. Match the specific field's existing temporal semantics.
- **Calm, curious, concrete:** begin with a visible or audible fact, then offer a plausible inference, then its practical consequence when relevant.
- **Geographic specificity:** mention the relationship between coast, cliff, slope, river, trees, wind, and the player's vantage point when known. Never invent a direction, distance, species, or landmark.
- **Materials and causality:** explain why dry bark ignites, willow bends, river pools shelter fish, or raised beds help; avoid unsupported claims of scientific certainty.
- **Resourceful hope, without certainty:** a discovery suggests possibilities. An unbuilt tool, hidden location, or unearned capability must remain a possibility rather than an accomplished fact.
- **Restrained suspense:** isolation, weather, hunger, and unexplored terrain provide enough danger. Do not fill ordinary tasks with sinister foreshadowing or invented mysteries.

## Two channels: long scenes, short journal

The **modal** is where the player can stop and read; the **narrative window** is narrow and constantly updated. The two need different prose budgets even when they describe the same event.

### Modal / exploration / story text

- A major discovery or event can take **2–4 sentences** or a few compact paragraphs. Descriptive language should invite observation, deduction and adventure in Verne's spirit.
- Start with what the player can see, then explain why it matters; avoid decorative sentences with no new information.
- The full scene belongs in `content/events/*.json -> scenes.<id>.text` or `content/regions/*.json -> explore.landmarks[].text`.
- `explore.view[].text` and `explore.nothingLeft` are also modal-only. `game.newPlace.text`, shortage preparation advice, and end screens are modal text.

### Narrow narrative window / journal

- Usually **5–15 words** and **no more than 80 source characters per variant**. Prefer one direct sentence; split events into separate short updates rather than chaining clauses.
- **Action or consequence first.** Say what was found, built, lost, used, or changed before adding colour. A single vivid word can suggest atmosphere.
- Never duplicate a modal paragraph in the journal. For modal scenes author `scene.journal`; for explored landmarks author `landmark.journal`. These are short alternatives to their full `text`. For legacy content the engine falls back to `text`, but newly authored substantial modal text must always provide the summary.
- `region.description` (first visit), `firstVisit.log`, `arrive[].text`, activity/outcome logs, recipe/building/item/consumption logs, memories, quest progress, timer warnings, and sleep recovery are **journal text**. Despite its name, `region.description` is currently logged on arrival rather than opened in a modal. Put the expansive area description in `explore.view`.
- A quest completion currently shares its `doneLog` between the journal and a completion note; keep that passage short until separate note text is explicitly supported.
- A supply-shortage note shows full advice, but only the immediate shortage is written into the journal.
- UI labels, hints, timing and prerequisites are functional text: keep them succinct without dropping vital quantities or affordances.

| Situation | Modal prose | Journal entry |
|---|---|---|
| Forest discovery | A paragraph about the shadowed trees, quiet air, and possible resources | "You discover a forest beyond the dunes." |
| A freshwater spring | Describe the stones, clear water, and importance of the find | "You discover a freshwater spring among mossy stones." |
| Making a spear | Generally no modal; only the log is shown | "You sharpen a branch into a spear." |
| Shipwreck | Full dramatic scene with choice | "A storm wrecks your ship. You must decide what to save." |

**Variety:** An array is a pool of interchangeable alternatives, never sequential paragraphs. All variants of the same field must imply the same world state and outcome. Do not use a longer alternative just to make the text sound literary.

## Diction

Favour *shore, current, timber, embers, provisions, shelter, ascent, passage, examination, contrive, secure, observe, discover*. Use unusual words sparingly and only where the surrounding action gives their meaning. A measured semicolon may join an observation to its consequence. Avoid excessive exclamations, florid metaphors, modern jokes or slang, pseudo-archaic pronouns ("thee", "thou"), and constant repetitions of "indeed", "thus", or "presently".

Use a broadly consistent English register. The existing copy leans British (*labour, colour, recognise, towards*), which suits the selected tone, but prose must remain easily readable internationally.

## Preserve game data and player knowledge

- Modify narrative **strings only** in `content/**/*.json`. Do not change IDs, conditions, effects, state keys, numeric values, or structural arrays as part of a prose pass.
- Keep interpolated variables such as `{place}`, `{item}`, `{energy}`, `{time}`, and `{day}` verbatim, and retain their meaning.
- A scene may not reveal a region, landmark, usable resource, completed construction, or mechanic before the relevant discovery or requirement is satisfied.
- A successful outcome must read as successful; a failure must read as failure; a ready, idle, or active production state must not be confused.
- State exact gameplay information in hints: e.g. 12 hours, 3 fish, or 100% recovery. Elegance must not obscure a rule.
- Keep sentence-case narrative entries, lowercase button/item/action labels, and the repository's short-object JSON layout. Do not reshape arrays into sequences.
- Review tests and e2e label references; then run `npm run content:check`, `npm test`, and `npm run build` for each content revision.

## Before and after

**Exploration modal**, from the plain observation "Tall trunks, close together. The sea is only a sound now.":

> The trees rise in close formation, their branches intercepting much of the daylight. Beneath them the air is cool and motionless, while the distant sea has diminished to a murmur. This forest may hold resources of considerable importance.

**Journal**, for the same arrival:

> You enter the forest. The sea fades behind the trees.

**Crafting journal**, where the result matters more than the process:

> You finish shaping a crude stone knife.

These are newly written game examples, not quotations from Verne. **A short line can still have a period-adventure voice; length alone does not create atmosphere.**
