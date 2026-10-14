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

## Prototype scope

- **The beach:** light fire (3 firewood), stoke fire, catch fish, cook fish (needs fire), sleep (needs fire; creates the checkpoint).
- **The forest** (1 h walk): gather wood, drink from the stream.
- Survival: health, energy, fullness, hydration and comfort (freezing / cold / comfortable), shown as ink bars (fuller is better; hover for the word; red when low). Only an empty health bar kills; the others drain health. Action-based clock in 30-minute steps; day phases; the fire heats the beach.
- Death restores the last checkpoint (last sleep). Saved in `localStorage`.

## Adding content (no code changes)

| What | Where |
|---|---|
| A region with its activities | new file in `content/regions/` |
| Items and food | `content/items/*.json` |
| Survival rules (rates, damage, regen) | `content/stats.json` |
| Day phases, temperature bands | `content/climate.json` |
| Start state, timers (the fire) | `content/game.json` |

Keys starting with `_` are comments. Errors (unknown ids, typos in keys) are listed on screen and by `npm run content:check`.

## Debug console

Open the browser console:

```js
ti.give("firewood", 10)   ti.stat("thirst", 0)   ti.time(5)   ti.fire(6)
ti.state()                ti.felt()                            ti.reset()
```
