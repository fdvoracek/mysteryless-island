/**
 * The classic layout panels. The ids are fixed: the renderer, the tests and the
 * styles in ../styles.css rely on them.
 */
export const panel = {
  /** Shared area-art slot; remains absent from view until real artwork is available. */
  panorama: () => `<div class="area-panorama" id="areaPanorama" hidden></div>`,
  /** the story */
  story: () => `<section class="journal" aria-labelledby="regionTitle">
    <h1 class="region-title" id="regionTitle"></h1>
    <section class="log" id="log" aria-live="polite" aria-label="story"></section>
  </section>`,
  /** places you can walk to (region tabs) */
  places: () => `<nav class="tabs" id="tabs" aria-label="places"></nav>`,
  /** All controls in their display order. */
  actions: () => `<div class="centre-tabs" role="tablist" aria-label="actions">
    <button id="areaTab" role="tab" aria-controls="areaPanel" aria-selected="true">area</button>
    <button id="craftTab" role="tab" aria-controls="craftPanel" aria-selected="false" tabindex="-1">crafting</button>
    <button id="buildTab" role="tab" aria-controls="buildPanel" aria-selected="false" tabindex="-1">building</button>
  </div>
  <section id="areaPanel" role="tabpanel" aria-labelledby="areaTab" class="action-sections">
    <div class="action-section" id="areaActions"><div class="buttons" id="actions"></div></div>
    <fieldset class="box action-section" id="buildingsBox" hidden><legend>buildings</legend>
      <div id="buildings"></div>
    </fieldset>
    <fieldset class="box action-section" id="consumablesBox" hidden><legend>consumables</legend>
      <div id="consumables"></div>
    </fieldset>
  </section>
  <section id="craftPanel" role="tabpanel" aria-labelledby="craftTab" hidden><div id="craftTree"></div></section>
  <section id="buildPanel" role="tabpanel" aria-labelledby="buildTab" hidden><div id="buildTree"></div></section>`,
  /** time of day and survival bars */
  status: () => `<fieldset class="box status-box"><legend id="clock"></legend><div id="status"></div></fieldset>`,
  tasks: () => `<fieldset class="box" id="questsBox"><legend>tasks</legend><div id="quests"></div></fieldset>`,
  inventory: () => `<fieldset class="box" id="inventoryBox"><legend>inventory</legend><div id="inventory"></div></fieldset>`,
};

/** ids that must exist in the classic skeleton */
export const REQUIRED_IDS = [
  "areaTab", "craftTab", "buildTab", "areaPanel", "craftPanel", "buildPanel", "craftTree", "buildTree",
  "areaPanorama", "regionTitle", "wrap", "log", "tabs", "actions", "clock", "status",
  "consumablesBox", "consumables",
  "quests", "questsBox", "buildings", "buildingsBox", "inventory", "inventoryBox",
] as const;
