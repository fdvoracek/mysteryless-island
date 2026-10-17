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
npm run check        # everything CI runs: unit tests, build, browser test
```

`git push` to `main` runs `npm run check` first (a pre-push hook in `.githooks/`, set up by `npm install`) and stops the push if anything fails; `git push --no-verify` skips it once.

Pacing: actions take 15 minutes to 1.5 hours of game time (sleep: 8 hours; 15 minutes is the shortest). After each action a progress bar runs (in-game hours and the amount of new text set its length; see `cosmetic` in `content/game.json`). All controls are locked meanwhile. Walking to another place, exploring a landmark and choosing in a pop-up take their game time but show no bar, so they never feel like loading. Add `?speed=0.2` to the URL to make bars 5× faster while testing.

## Phones

Every layout works on a phone browser: below 600px wide the story, the places and the buttons come first, the panels below; buttons are at least 44px tall; the bottom menu wraps and its lists open as a sheet. On touch screens a button's tooltip shows only when the button is disabled (to say why). The e2e test checks each layout at 375×667.

## Layouts and fonts

*font:* in the bottom menu sets one font for all text in every layout: *times* (Times New Roman, the original look), *old standard* (Old Standard TT), *fell* (IM Fell English), *garamond italic* (Cormorant Garamond). The choice is remembered; `?font=<id>` works too. Fonts are listed in `src/ui/fonts.ts`; web fonts load only when chosen, and get Times' x-height so layouts keep their sizes.


Six screen layouts, switchable from *layout:* in the bottom menu (the choice is remembered; `?layout=<id>` in the URL also works):

| id | Layout |
|---|---|
| `classic` | like A Dark Room: the places on their own row on top, then three columns: story (newest on top), actions, panels |
| `journal` | a book page: story in reading order, newest paragraph large, actions as underlined words; status strip on top, notes in the margin |
| `scene` | the last result as a large paragraph, the few before it above it fading upwards; under the text the places as signposts (*go to the forest →*), then the buttons; panels on a shelf, with the stores' and tasks' buttons (*eat*, *cook*, *build*) beside the boxes |
| `notebook` | an open book: the diary with times and days on the left page, the camp on the right |
| `stage` | story centred in the top of the screen, the camp as a strip along the bottom |
| `bujo` | *old journal*, 19th century: a two-page spread, double rule under the title, the hour in the margin. Left page: only the log (the hour in the margin, a heading per day). Right page: places and actions, survival bars, tasks (struck through when done), stores and inventory |

Each layout is two files in `src/ui/layouts/` (`<id>.ts`: where the panels go and how the story reads; `<id>.css`: its styles, scoped to `.layout-<id>`). Panels are shared (`panels.ts`) and keep their ids in every layout. A layout may also list extra `stylesheets` that load when it is chosen. Layouts don't pick fonts: all text uses `--font`. To add one, copy a pair of files, change them, and add it to `LAYOUTS` in `index.ts`; to remove one, delete its files and its line there.

## Prototype scope

- **The shipwreck:** a new game opens with an event before the beach: the storm, the ship hits a rock, and you grab one thing before you jump: the knife, the matches (a box of 10), the water can (4 drinks; the can stays, and *fill* next to it tops it up to 4 at the spring, once you have explored it) or the rations (6 meals). Then the swim to the shore, and the journal starts. You keep your summer clothes.
- **Tools are what they are good for:** requirements name a use, not an item: *something to make a fire with*, *something sharp*. Items show their uses next to them (*knife · sharp*, *stones · fire starter*).
  - **Fire:** *light fire* needs something to make it with: **matches** (15 min, always works, one match each time), **2 stones** (an hour of sparks, catches 2 times in 3; the stones stay) or **2 dry sticks** (2 firewood: an hour of friction, catches 2 times in 3). Matches are used first, then stones, then sticks; the wood is used only when it catches. Stones lie under the low cliff (*pick up stones*).
  - **Sharp:** the spear needs something sharp: the knife from the ship (30 min), or a **rock knife** you grind from 2 stones (3 h, in the *craft* menu). The rock knife is sharp, but everything takes twice as long with it.
  - Each way has its own texts, in the journal and in the memories at bedtime. Tool tags are in `game.json` → `tools`; an item gets them as `tool: { tags, amount?, hoursFactor? }`.
- **Exploration:** *look around* takes no time: it opens a pop-up that says what you see, with the landmarks you have not explored yet (each with its time, e.g. *the dunes 30m*) and *close*. Exploring one takes its time, shows what you found (also written to the journal) and its result: a new place, action, item or task. An explored landmark is not offered again. *look around* stands on its own line above the other buttons, with a heavier frame; it has a * while something is left to explore; landmarks can appear later (a condition), which brings the * back. With nothing left, look around still says what you see.
- **The beach:** *the dunes*: the forest, close and hard to miss → forest tab. *The ring of rocks*: out of the wind → *light fire* (3 firewood), *sleep* (needs the fire; saves the game just before). *The low cliff* (offered once the rocks are explored): shells → *collect shells*; eat them raw, or cook them for more food. *The shallows*: a school of fish → *catch fish* (needs a fishing spear, made in the *craft* menu) and the task *catch a fish*. *Climb the cliff* (offered once the low cliff is explored): from the top, the meadows to the west → meadows tab. *Stoke fire* appears while the fire burns.
- **Cooking:** while the fire burns and you are on the beach, raw food in the stores (raw fish, shells) shows a *cook* button next to it; click it to cook one. Defined per item as an `actions` entry in `content/items/`.
- **Going to sleep:** you say how tired you are (from your energy, the same bands as the bar), then remember up to three things from the day, most memorable first (the first morning, the fish, the first fire, the spring…). The night itself is quiet (no thirst or fire messages); on waking, a short summary: the time, the worst thing about your body (or that you feel rested), and whether the fire survived. The day's memories start over each time you sleep. Defined as `thoughts` on the sleep activity, using `{ "today": … }` conditions.
- **Arriving:** the first visit to a place describes it in full; every later arrival says briefly what you see now: the time of day, what you have found there, whether the fire burns. Defined per region as `arrive` lines with conditions.
- **The route map:** the places panel is a small map: the place you are in (filled dot), the places you know (rings; click to walk there), a path from the camp to each with its walking time, and a dashed path to a "?" where a place is still to be found. The map is centred on the place you are in: when you walk, the whole map slides so the new place is in the middle. Its edges fade like the journal, a fog: the places next to you are clear, the ones after them fade out, and further ones are hidden (on a phone, the screen's edges fade). Hovering a place shows icons for what you have found there (fire, water, wood, fish, berries, shells, sleep; `icon` on an activity). A place new on the map pulses. The finding that opened it ends with "A new place is on your map: the forest. You can walk there now, or later from the map." and has *go to the forest 30m* next to *close* (texts in `game.json` → `newPlace`; a place opened some other way gets its own note with the same button). Each region has a `map` position (`{ "x": 1, "y": 0 }`, grid cells) in its content file.
- **The forest** (30 min walk): *collect wood* from the start. *The sound of water*: a spring → *drink water*.
- **The meadows** (1 h walk, west of the beach on the map): a "?" from the start; climbing the low cliff opens the way. *The bushes*: *pick berries* (food, eaten raw). *The willows*: a river → *drink water*, *fill* the water can, *catch fish* (needs the spear; finding the river also starts the spear task).
- Survival: health, energy, fullness, hydration and comfort (freezing / cold / comfortable), shown as ink bars (fuller is better; hover for the word; red when low). Only an empty health bar kills; the others drain health. Action-based clock in 15-minute steps (`stepMinutes` in `game.json`; every action time must be a whole number of steps, checked by `npm run content:check`); day phases; the fire heats the beach.
- **Death is permanent.** The screen fades, then the end screen: how long you lasted, the cause (the damage rule hurting most: thirst, hunger, exhaustion, cold; or the event or food) (texts in `game.json` → `ending`). Then *load the saved game* (if there is one) or *start again*.
- **Saving:** *save.* in the bottom menu stores the game in the browser; going to sleep saves it too, just before you fall asleep, so after a death you can load the evening and do it differently. Separately, the game autosaves after every action, so a reload continues where you were (a death stays a death).
- Tasks (quests) are goals, not recipes: "survive the first night" (done at day 2, 06:00); "catch a fish" once the fish are found; "cut logs" once a building needs them; "build a shelter" and the other buildings. A task's tooltip has a hint and what it **needs**, marked ✓ once you have it ("needs: fishing spear or fish trap", "needs: axe", "needs: hoe"); a building's task shows its cost as progress (*logs 2/4*). Tasks have no buttons: the tools come from the *craft* menu, buildings from the *build* menu. Only active tasks are listed.
- **Craft and build menus:** *craft* and *build* are hidden at the start; each appears, on the first line next to *look around*, once there is something to craft (or something to build somewhere), and then stays everywhere (a * when something in them can be made now; where there is nothing, the pop-up says so). Each opens a pop-up with a button per thing you can make (build: here), with its time; the tooltip says what it needs, and what can't be made yet is greyed out with the reason. Choosing one closes the pop-up and does the work (with its progress bar). A thing leaves the menu once you have it, unless you can have more: up to 3 fish traps and 3 corn fields in a place (they work together: setting 3 traps takes 3 times as long, and each batch is a fish per trap). Recipes are in `content/recipes/`, buildings in `content/buildings/`.
- **When a task is done** a note pops up: "Task done: build a fish trap", the task's ending, and what changed (items added or used, buildings built, places opened, actions now possible: "20 willow twigs used.", "Fish trap built."). The sentences are templates in `game.json` → `tasks`; the changes are worked out by the engine.
- **Buildings:** each place can have buildings that produce over time; you start each cycle yourself (sow, set the trap), and collect when it is ready. A task opens the chance (finding the flat ground → *dig a corn field*) and shows its cost as progress; you build it from the *build* menu where it belongs; built ones are listed in the *buildings* panel of their place with their state (*growing · 2d 4h*, *ripe*, *2 fish*) and their button. Logs need an **axe** (firewood and stones); the corn field needs a **hoe** and wild corn to sow. Ten so far: shelter (warmer, sleep without a fire), bed (better sleep), drying rack, rain barrel (beach); fish trap (beach or river: 20 willow twigs, 1 fish every 2 hours up to 3); snares, mushroom logs (forest); corn field, bee hive, fish weir (meadows). Defined in `content/buildings/` (see `docs/TDD.md` 6.8).
- Inventory: tools and clothing (summer clothes, the knife or the water can if you grabbed them, the fishing spear), listed apart from stores.
- **Pop-ups:** no close button: *← back* in the title line, on the right, level with the title, in the same place in every pop-up. A pop-up with it also closes on a click next to it, or on Escape. The shipwreck (the story before the island) has no back: it ends with *wash ashore* under the text. Pop-up buttons work even while the last action's progress bar runs.
- **Events:** a modal over the game (as in A Dark Room) with a title, text and buttons; each choice applies effects (stats, items, open a place) and may lead to another page; a page without choices ends with *close*. Every page is also written into the journal when it opens (a blank line in the text starts a new paragraph), before whatever follows, so the events read as part of the story. Triggers: the start of the game, a time (`{ "at": { "day": 3, "hour": 11 } }`), a condition, or a chance after given actions (`{ "after": ["explore"], "chance": 0.25 }`). Defined in `content/events/`.

## Adding content (no code changes)

| What | Where |
|---|---|
| A region with its activities | new file in `content/regions/` |
| Items and food | `content/items/*.json` |
| Quests (tasks) | `content/quests/*.json` |
| Events (pop-ups with choices) | `content/events/*.json` |
| Buildings (the build menu, cycles over time) | `content/buildings/*.json` |
| Recipes (the craft menu: tools you make) | `content/recipes/*.json` |
| Survival rules (rates, damage, regen) | `content/stats.json` |
| Day phases, temperature bands | `content/climate.json` |
| Start state, timers (the fire) | `content/game.json` |

Sentences (story, hints, reasons) start with a capital letter; labels (buttons, places, items, tasks) stay lowercase. **Text variants:** every text shown in the journal is a string or a list of variants: `"log": ["You wade into the shallows, spear raised.", "You stand knee-deep in the cold water and wait.", …]`. One is picked each time, never the same twice in a row. Lines the engine writes itself (walking, a new way opening, nothing found) are in `game.json` → `journal`, with `{place}`. Add `?variants=first` to the URL to always see the first wording (the browser tests use it). Keys starting with `_` are comments. Errors (unknown ids, typos in keys) are listed on screen and by `npm run content:check`.

## Debug console

Open the browser console:

```js
ti.give("firewood", 10)   ti.stat("thirst", 0)   ti.time(5)   ti.fire(6)
ti.state()                ti.felt()                            ti.reset()
ti.quests()               ti.quest("survive_first_night")      // list / force-start quests
```
