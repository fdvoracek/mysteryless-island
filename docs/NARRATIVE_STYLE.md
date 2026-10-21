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

## Pacing by text category

| Text type | Target | Principle |
|---|---|---|
| Major events and consequential discoveries | 1–3 compact paragraphs | Description, physical action, and a reason to decide |
| Region introduction | 2–3 sentences per variant | Location, atmosphere, and something observable |
| Landmark discovery | 2–3 sentences per variant | Evidence → inference → attainable opportunity |
| Recurring arrival, action, item, production, or sleep line | Generally 1 sentence | Fresh concrete detail without repeated lectures |
| Quest completion or special progression | 1–2 sentences | Mark the practical achievement, not a triumphal speech |
| UI hint, requirement, state, warning, or button | Concise and literal | Mechanics, counts, times, affordances, and urgency outrank literary colour |

**Variety:** Each array is a pool of interchangeable alternatives, not consecutive paragraphs. All variants must convey the same outcome, state, location, and conditions. Make their diction and observations distinct without contradictory details.

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

A plain observation such as "Tall trunks, close together. The sea is only a sound now." becomes a clearer survey:

> The forest begins in a close assembly of high trunks, whose crowns admit only a diminished light. The roar of the sea is already remote.

A terse technical action such as "Stone on stone, until it had an edge." becomes a statement of work and consequence:

> After three hours of laborious work the stone has acquired an irregular but effective edge.

These are new game examples, not quotations from Verne. The point is **reasoned exploration with disciplined economy**, not length for its own sake.
