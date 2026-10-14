# Mysteryless Island (prototype)

A minimalist, data-driven text survival game. Design docs: `docs/GDD.md`, `docs/TDD.md`.

Play: <https://fdvoracek.github.io/mysteryless-island/> (deployed by GitHub Actions on every push to `main`).

## Run

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # engine + content tests
npm run content:check
npm run build        # static build in dist/
npm run test:e2e     # browser smoke test of dist/ (first time: npx playwright install chromium)
```

Pacing: after each action a progress bar runs (in-game hours and the amount of new text set its length; see `cosmetic` in `content/game.json`). All controls are locked meanwhile. Add `?speed=0.2` to the URL to make bars 5× faster while testing.

## Layouts and fonts

*font:* in the bottom menu sets one font for all text in every layout: *times* (Times New Roman, the original look), *old standard* (Old Standard TT), *fell* (IM Fell English), *garamond italic* (Cormorant Garamond). The choice is remembered; `?font=<id>` works too. Fonts are listed in `src/ui/fonts.ts`; web fonts load only when chosen, and get Times' x-height so layouts keep their sizes.


Six screen layouts, switchable from *layout:* in the bottom menu (the choice is remembered; `?layout=<id>` in the URL also works):

| id | Layout |
|---|---|
| `classic` | three columns like A Dark Room: story (newest on top), actions, panels |
| `journal` | a book page: story in reading order, newest paragraph large, actions as underlined words; status strip on top, notes in the margin |
| `scene` | the last result as a large paragraph with the buttons under it, earlier text in one quiet line; panels on a shelf |
| `notebook` | an open book: the diary with times and days on the left page, the camp on the right |
| `stage` | story centred in the top of the screen, the camp as a strip along the bottom |
| `bujo` | *old journal*, 19th century: a two-page spread, double rule under the title, the hour in the margin. Left page: only the log (the hour in the margin, a heading per day). Right page: places and actions, survival bars, tasks (struck through when done), stores and inventory |

Each layout is two files in `src/ui/layouts/` (`<id>.ts`: where the panels go and how the story reads; `<id>.css`: its styles, scoped to `.layout-<id>`). Panels are shared (`panels.ts`) and keep their ids in every layout. A layout may also list extra `stylesheets` that load when it is chosen. Layouts don't pick fonts: all text uses `--font`. To add one, copy a pair of files, change them, and add it to `LAYOUTS` in `index.ts`; to remove one, delete its files and its line there.

## Prototype scope

- **Exploration:** the game starts with one button, *look around* (1 h). Each look explores the region one step further and reveals new buttons; when nothing is left to find, the button disappears.
- **The beach:** 1st look: the forest, close and hard to miss → forest tab. 2nd: a ring of rocks out of the wind → *light fire* (3 firewood), *sleep* (needs the fire; creates the checkpoint). 3rd: a cliff with shells → *collect shells*; eat them raw, or cook them for more food. 4th: a school of fish → *catch fish* (needs a fishing spear) and the task *build a fishing spear*. *Stoke fire* appears while the fire burns.
- **Cooking:** while the fire burns and you are on the beach, raw food in the stores (raw fish, shells) shows a small flame icon; click it to cook one. Defined per item as an `actions` entry in `content/items/`.
- **The forest** (1 h walk): 1st look: dry wood → *collect wood*. 2nd: a spring → *drink water*.
- Survival: health, energy, fullness, hydration and comfort (freezing / cold / comfortable), shown as ink bars (fuller is better; hover for the word; red when low). Only an empty health bar kills; the others drain health. Action-based clock in 30-minute steps; day phases; the fire heats the beach.
- Death restores the last checkpoint (last sleep). Saved in `localStorage`.
- Tasks (quests): "survive the first night" (done at day 2, 06:00); "build a fishing spear" once the fish are found: collect 10 firewood (progress shown under the task), then click ⚒ next to it. Only active tasks are listed; hover for a hint.
- Inventory: tools and clothing (knife and summer clothes at the start, then the fishing spear), listed apart from stores.

## Adding content (no code changes)

| What | Where |
|---|---|
| A region with its activities | new file in `content/regions/` |
| Items and food | `content/items/*.json` |
| Quests (tasks) | `content/quests/*.json` |
| Survival rules (rates, damage, regen) | `content/stats.json` |
| Day phases, temperature bands | `content/climate.json` |
| Start state, timers (the fire) | `content/game.json` |

Keys starting with `_` are comments. Errors (unknown ids, typos in keys) are listed on screen and by `npm run content:check`.

## Debug console

Open the browser console:

```js
ti.give("firewood", 10)   ti.stat("thirst", 0)   ti.time(5)   ti.fire(6)
ti.state()                ti.felt()                            ti.reset()
ti.quests()               ti.quest("survive_first_night")      // list / force-start quests
```
