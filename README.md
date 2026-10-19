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

Pacing: every game hour takes 10 real seconds (`content/game.json` → `cosmetic.msPerHour`). During crafting, building, travel, exploration, and other timed actions, the clock advances in 15-minute steps, every 2.5 real seconds. Survival stats and timers advance with each step; items, buildings, arrival, and completion notes appear when the work finishes. Sleep jumps immediately to the next 6am. Opening menus or choosing ordinary event text takes no time. Controls stay locked during work. Add `?speed=0.2` to make bars 5× faster while testing.

## Phones

Every layout works on a phone browser: below 600px wide the story, the places and the buttons come first, the panels below; buttons are at least 44px tall; the bottom menu wraps and its lists open as a sheet. On touch screens a button's tooltip shows only when the button is disabled (to say why). The e2e test checks each layout at 375×667.

## Layouts and fonts

*font:* in the bottom menu sets one font for all text in every layout: *times* (Times New Roman, the original look), *old standard* (Old Standard TT), *fell* (IM Fell English), *garamond italic* (Cormorant Garamond). The choice is remembered; `?font=<id>` works too. Fonts are listed in `src/ui/fonts.ts`; web fonts load only when chosen, and get Times' x-height so layouts keep their sizes.


Six screen layouts, switchable from *layout:* in the bottom menu (the choice is remembered; `?layout=<id>` in the URL also works):

| id | Layout |
|---|---|
| `classic` | like A Dark Room: the places on their own row on top, then three columns: story (newest on top), actions, panels |
| `journal` | a book page: story in reading order, newest paragraph large, actions as underlined words; status strip on top, notes in the margin |
| `scene` | the last result as a large paragraph, the few before it above it fading upwards; under the text the places as signposts (*go to the forest →*), then the buttons; inventory and task panels on a shelf |
| `notebook` | an open book: the diary with times and days on the left page, the camp on the right |
| `stage` | story centred in the top of the screen, the camp as a strip along the bottom |
| `bujo` | *old journal*, 19th century: a two-page spread, double rule under the title, the hour in the margin. Left page: only the log (the hour in the margin, a heading per day). Right page: places and actions, survival bars, tasks (struck through when done), inventory |

Each layout is two files in `src/ui/layouts/` (`<id>.ts`: where the panels go and how the story reads; `<id>.css`: its styles, scoped to `.layout-<id>`). Panels are shared (`panels.ts`) and keep their ids in every layout. A layout may also list extra `stylesheets` that load when it is chosen. Layouts don't pick fonts: all text uses `--font`. To add one, copy a pair of files, change them, and add it to `LAYOUTS` in `index.ts`; to remove one, delete its files and its line there.

## Prototype scope

Timed actions take **10 real seconds per game hour** (15 minutes = 2.5 seconds), configured once in `content/game.json` → `cosmetic.msPerHour`. This includes walking, exploration, crafting, building, and item actions. Sleep jumps immediately to the next 6am without a progress delay; opening menus and look around also take no time.

Look around, craft, and build share the main action row in every area, with gathering and other local activities below. **Buildings** lists only those built in the current area and stays hidden until one is built there. Light and stoke a fire or cook food under the campfire, sleep under the bed, and start or collect production under its building. **Consumables** holds food, water in the can, and other items with actions, such as filling the water can; it stays hidden when empty. All other possessions, including tools, clothing, and materials, stay in **inventory** with their counts.

- **The shipwreck:** a new game opens with an event before the beach: the storm, the ship hits a rock, and you grab one thing before you jump: the knife, the matches (a box of 10), the water can (4 drinks; the can stays, and *fill* under consumables tops it up to 4 at the spring, once you have explored it) or the rations (6 meals). Then the swim to the shore, and the journal starts. You keep your summer clothes.
- **Tools are what they are good for:** requirements name a use, not an item: *something to make a fire with*, *something sharp*. Items show their uses next to them (*knife · sharp*, *stones · fire starter*).
  - **Fire:** first build a campfire in the current area (2 stones, 15 minutes); it starts unlit. *Light fire* needs something to make it with: **matches** (15 min, always works, one match each time), **2 stones** (an hour of sparks, catches 2 times in 3; the stones stay) or **2 dry sticks** (2 firewood: an hour of friction, catches 2 times in 3). Matches are used first, then stones, then sticks; the wood is used only when it catches. Stones lie under the low cliff (*pick up stones*). A lit fire lasts 6 hours; stoking with 2 firewood adds 4 hours, up to 12. Each area has its own fire for warmth, cooking, and sleep.
  - **Sharp:** the spear needs something sharp: the knife from the ship (30 min), or a **rock knife** you grind from 2 stones (3 h, in the *craft* menu). The rock knife is sharp, but everything takes twice as long with it.
  - Each way has its own texts, in the journal and in the memories at bedtime. Tool tags are in `game.json` → `tools`; an item gets them as `tool: { tags, amount?, hoursFactor? }`.
- **Exploration:** *look around* takes no time: it opens a pop-up that says what you see, with the landmarks you have not explored yet (each with its time, e.g. *the dunes 30m*) and *close*. Exploring one takes its time, shows what you found (also written to the journal) and its result: a new place, action, item or task. An explored landmark is not offered again. *look around* shares the main action row with *craft* and *build*, above other local activities; it has a * while something is left to explore; landmarks can appear later (a condition), which brings the * back. With nothing left, look around still says what you see.
- **The beach:** *the dunes*: the forest, close and hard to miss → forest tab. *The ring of rocks*: natural shelter, so a bed can be built immediately without a separate shelter. You can also build a campfire here and light it with 3 firewood. *Sleep* appears once the bed is built (saves the game just before). *The low cliff* (offered once the rocks are explored): shells → *collect shells*; eat them raw, or cook them for more food. *The shallows*: a school of fish → *catch fish* (needs a fishing spear, made in the *craft* menu) and the task *catch a fish*. *Climb the cliff* (offered once the low cliff is explored, and a task): too steep without a **rope**; from the top, the meadows to the west → meadows tab. The rope: *strip bark* in the forest (needs something sharp, 1 h, 4 bark strips), then twist the strips into a rope in the *craft* menu (3 h). The rope is kept after the climb; the snares need one too. *Stoke fire* appears while the fire burns.
- **Cooking:** while a fire burns in your current area, raw food (raw fish, meat, shells) gets a labelled *cook* button under that campfire; click it to cook one. Defined per item as an `actions` entry in `content/items/`.
- **Going to sleep:** the sleep button appears only where a bed is built, and sleep always ends at 6am, where you lay down. Full recovery (100%) requires a sheltered bed and a fire burning in the same area when you go to sleep before midnight. A sheltered bed without fire, or bedtime from midnight onwards, restores 80%; an exposed bed or no bed gives 50%. The beach rocks count as shelter once discovered; in the forest and meadows, build a shelter before a bed. Recovery uses conditions at bedtime, even if the fire expires overnight. At midnight or zero energy you collapse and sleep where you are. On waking, a pop-up explains that you did not reach bed in time and had to sleep there, with the new day and sleep summary. Unfinished actions pause without their rewards; completed work and reserved materials are kept for resuming later. The journal announces “New day X is starting” and describes where and how you slept. Timers and production continue overnight. Voluntary sleep also recalls up to three memories and clears the previous day's memories. Sleep settings and morning texts live in `content/game.json` → `sleep`.
- **Arriving:** the first visit to a place describes it in full; every later arrival says briefly what you see now: the time of day, what you have found there, whether the fire burns. Defined per region as `arrive` lines with conditions.
- **The route map:** the places panel is a small map: the place you are in (filled dot), the places you know (rings; click to walk there), a path from the camp to each with its walking time, and a dashed path to a "?" where a place is still to be found. The map is centred on the place you are in: when you walk, the whole map slides so the new place is in the middle. Its edges fade like the journal, a fog: the places next to you are clear, the ones after them fade out, and further ones are hidden (on a phone, the screen's edges fade). Hovering a place shows icons for what you have found there (fire, water, wood, fish, berries, shells, sleep; `icon` on an activity). A place new on the map pulses. The finding that opened it ends with "A new place is on your map: the forest. You can walk there now, or later from the map." and has *go to the forest 30m* next to *close* (texts in `game.json` → `newPlace`; a place opened some other way gets its own note with the same button). Each region has a `map` position (`{ "x": 1, "y": 0 }`, grid cells) in its content file.
- **The forest** (30 min walk): *collect wood* from the start; collecting it three times opens the mushroom logs task directly. *The sound of water*: a spring → *drink water*.
- **The meadows** (1 h walk, west of the beach on the map): a "?" from the start; climbing the low cliff opens the way. *The bushes*: *pick berries* (food, eaten raw). *The willows*: a river → *drink water*, *fill* the water can from consumables, *catch fish* (needs the spear; finding the river also starts the spear task).
- Survival: health, energy, fullness, hydration and comfort (freezing / cold / comfortable), shown as ink bars (fuller is better; hover for the word; red when low). Energy is the main work budget. Hunger or thirst at 41 or above makes energy costs 50% higher (once, even when both are high); with both at 20 or below, energy costs are 50% lower. Eating and drinking restore energy. Hunger, thirst, and exhaustion do not damage health; cold and other health hazards still can kill. Action-based clock in 15-minute steps (`stepMinutes` in `game.json`; every action time must be a whole number of steps, checked by `npm run content:check`); day phases; each fire heats only its own area.
- **Automatic eating and drinking:** at 60 hunger or thirst, you use carried edible food or water automatically, including during long actions and sleep. The most filling food or strongest drink goes first; more portions are used only while still at 60 or above. This adds no extra game time. Manual eating and drinking remain available. With nothing suitable left, a pop-up warns you to eat, drink, or both before you collapse; it repeats only after relief or new preparation advice. Raw meat and raw fish cannot be eaten. If automatic eating fails while you carry either, the *build a drying rack* task appears and the pop-up explains drying or cooking over a fire. One rack dries two fish or two meat portions in 12 hours: *hang fish* or *dry raw meat* under the drying rack (meat needs something sharp). Collect from the rack when ready. Only one batch fits at a time.
- **Death is permanent.** The screen fades, then the end screen: how long you lasted, the cause (the damage rule hurting most, such as cold; or the event or food) (texts in `game.json` → `ending`). Then *load the saved game* (if there is one) or *start again*.
- **Saving:** *save.* in the bottom menu stores the game in the browser; going to sleep saves it too, just before you fall asleep, so after a death you can load the evening and do it differently. Separately, the game autosaves after every completed action, so a reload continues where you were (a death stays a death). Unfinished work is saved every 15 game minutes and resumes on reload; no game time passes while the game is closed. Materials remain reserved when work is paused.
- Tasks (quests) are goals, not recipes: "survive the first night" (done at day 2, 06:00); "catch a fish" once the fish are found; "cut logs" once a building needs them; "better sleep" after the first night (make a bed and light a fire in the same sheltered area); "build a shelter" and the other buildings. The task list shows goal titles only; costs and requirements are in the craft/build menus. Tasks have no buttons: the tools come from the *craft* menu, buildings from the *build* menu. Only active tasks are listed.
- **Craft and build menus:** *craft* and *build* are hidden at the start; each appears beside *look around* once there is something to craft (or something to build somewhere), and then stays everywhere (a * when something in them can be made now; where there is nothing, the pop-up says so). Each opens a pop-up with a button per thing you can make (build: here), with its time; the tooltip says what it needs, and what can't be made yet is greyed out with the reason. Choosing one closes the pop-up and does the work (with its progress bar). A thing leaves the menu once you have it, unless you can have more: up to 3 fish traps and 3 corn fields in a place (they work together: setting 3 traps takes 3 times as long, and each batch is a fish per trap). Recipes are in `content/recipes/`, buildings in `content/buildings/`.
- **When a task is done** a note pops up: "Task done: build a fish trap", the task's ending, and what changed (items added or used, buildings built, places opened, actions now possible: "20 willow twigs used.", "Fish trap built."). The sentences are templates in `game.json` → `tasks`; the changes are worked out by the engine.
- **Buildings:** production belongs to the building in its own area, runs while you are away or asleep, and waits for collection. Reload preserves its progress; closing the game advances no time. Unbaited traps added to a running group join its cycle immediately; each newly sown field starts its own full growing period. Each place can have buildings that produce over time; you start each cycle yourself (sow, set the trap), and collect when it is ready. A task opens the chance (finding the flat ground → *dig a corn field*); costs and requirements are shown in the craft/build menus, while the task list shows titles only; you build it from the *build* menu where it belongs; built ones are listed in the central *buildings* section of their place with their state (*growing · 2d 4h*, *ripe*, *2 fish*) and their button. Logs need an **axe** (firewood and stones); the corn field needs a **hoe** and wild corn to sow. Eleven so far: campfire (local warmth and cooking), shelter (forest or meadows), bed (better sleep), drying rack (fish or meat), rain barrel (beach); fish trap (beach or river: 20 willow twigs, 1 fish every 2 hours up to 3); snares, mushroom logs (forest); corn field, bee hive, fish weir (meadows). Defined in `content/buildings/` (see `docs/TDD.md` 6.8).
- Inventory: tools, clothing, and materials; items with their own actions or food and water uses appear under consumables.
- **Pop-ups:** no close button: *← back* in the title line, on the right, level with the title, in the same place in every pop-up. A pop-up with it also closes on a click next to it, or on Escape. The shipwreck (the story before the island) has no back: it ends with *wash ashore* under the text. Pop-up choices remain usable whenever a pop-up is open; active work waits until it closes.
- **Events:** a modal over the game (as in A Dark Room) with a title, text and buttons; each choice applies effects (stats, items, open a place) and may lead to another page; a page without choices ends with *close*. Every page is also written into the journal when it opens (a blank line in the text starts a new paragraph), before whatever follows, so the events read as part of the story. Triggers: the start of the game, a time (`{ "at": { "day": 3, "hour": 11 } }`), a condition, or a chance after given actions (`{ "after": ["explore"], "chance": 0.25 }`). Defined in `content/events/`.

## Architecture

JSON files pass through the Vite loader, Zod schemas and reference-checked registry. The engine
interprets that validated model; shared modules own action requirements, conditions, timers
and local production. Player work and production are serializable state. The application
controller schedules live steps and saves progress; selectors supply a view to the shared
renderer and all six layouts. Loading validates and migrates saves before play resumes.
Gameplay and narrative randomness use separate saved streams. Stable text IDs allow future
translation tables or a CSV importer; JSON remains the current authoring format.

See [the technical design](docs/TDD.md) for module boundaries and future extensions.

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
