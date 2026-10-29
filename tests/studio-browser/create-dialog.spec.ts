import { expect, test } from "@playwright/test";

test("top-bar Create defaults to its scope, including selected All files documents", async ({ page }) => {
  await page.goto("/studio/");
  await expect(page.getByRole("status")).toHaveText("Valid · 0 problems");
  const nav = page.getByRole("navigation", { name: "Content navigation" });
  for (const [name, kind] of [[/^the forest/, "activities"], [/^Items/, "items"], ["Story", "items"]] as const) {
    await nav.getByRole("button", { name }).click();
    await page.getByRole("button", { name: "Create", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Create entity" });
    await expect(dialog.getByLabel("Create kind")).toHaveValue(kind);
    await dialog.getByRole("button", { name: "Close dialog" }).click();
  }
  await nav.getByRole("button", { name: /^All files/ }).click();
  await page.getByRole("region", { name: "Entity list" }).getByRole("button", { name: /first_catch/ }).click();
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Create entity" }).getByLabel("Create kind")).toHaveValue("quests");
});

test("Still needed follows rendered fields, labels nested problems, and explains taken IDs", async ({ page }) => {
  await page.goto("/studio/");
  await expect(page.getByRole("status")).toHaveText("Valid · 0 problems");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Create entity" });
  await dialog.getByLabel("Create kind").selectOption("activities");
  const renderedLabels = await dialog.locator("[data-field]").evaluateAll(fields => fields
    .filter(field => ["id", "name", "hours", "effort"].includes(field.getAttribute("data-field") ?? ""))
    .map(field => field.querySelector(":scope > .field-label label")!.textContent!.trim()));
  await expect(dialog.locator(".create-needed")).toHaveText(`Still needed: ${renderedLabels.join(", ")}`);
  expect(renderedLabels).toHaveLength(4);
  expect(renderedLabels).toEqual(expect.arrayContaining(["ID", "Name", "Hours", "Effort"]));
  await expect(dialog.locator(".field-error")).toHaveCount(0);
  await dialog.getByLabel("Create kind").selectOption("regions");
  await expect(dialog.locator(".create-needed")).toContainText("Climate › Base C");
  await dialog.getByLabel("Create kind").selectOption("quests");
  await expect(dialog.locator(".create-needed")).toHaveText("Still needed: ID, Title, Done when"); // Existing Complete when hint.
  await dialog.getByLabel("Create kind").selectOption("items");
  const id = dialog.getByRole("textbox", { name: "id", exact: true });
  await id.fill("raw_fish");
  await id.blur();
  await expect(dialog.locator('[data-field="id"] .field-error')).toHaveText("Already used by item raw fish — choose a new ID.");
  await id.fill("Bad ID");
  await expect(dialog.locator('[data-field="id"] .field-error')).toHaveText("Use lowercase letters, digits and _ — and a new ID.");
});

test("Create guides untouched fields, suggests IDs, stops on manual ID, and resets on kind change", async ({ page }) => {
  await page.goto("/studio/");
  await expect(page.getByRole("status")).toHaveText("Valid · 0 problems");
  await page.getByRole("navigation", { name: "Content navigation" }).getByRole("button", { name: /^Items/ }).click();
  await page.getByRole("button", { name: "Create", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Create entity" });
  const name = dialog.getByRole("textbox", { name: "name", exact: true });
  const id = dialog.getByRole("textbox", { name: "id", exact: true });
  const create = dialog.getByRole("button", { name: "Create draft", exact: true });
  await expect(dialog.locator(".field-error")).toHaveCount(0);
  await expect(dialog.locator(".create-needed")).toHaveText("Still needed: ID, Name, Category");
  await name.press("Enter");
  await expect(create).toBeDisabled();
  await expect(dialog).toBeVisible();
  await name.fill("Fishing net");
  await expect(id).toHaveValue("fishing_net");
  await expect(dialog.getByText("Suggested from Name — edit to change.")).toBeVisible();
  await expect(dialog).toContainText("content/items/fishing_net.json");
  await expect(dialog.getByLabel("Create file preview")).toContainText('"id": "fishing_net"');
  await name.fill("raw fish");
  await expect(id).toHaveValue("raw_fish_2");
  await name.fill("42 nets");
  await expect(id).toHaveValue("42_nets");
  await expect(dialog.locator('[data-field="id"] .field-error')).toHaveCount(0);
  await expect(create).toBeDisabled(); // Suggestion never bypasses the existing ID rule.
  await id.fill("manual_net");
  await name.fill("A different name");
  await expect(id).toHaveValue("manual_net");
  await expect(dialog.locator(".create-id-hint")).toHaveCount(0);
  await dialog.getByLabel("Create kind").selectOption("activities");
  await expect(dialog.locator(".field-error")).toHaveCount(0);
  await expect(id).toHaveValue("");
  await name.fill("Fishing work");
  await expect(id).toHaveValue("fishing_work");
  await expect(dialog.locator(".field-error")).toHaveCount(0);
  await expect(dialog.getByText("Suggested from Name — edit to change.")).toBeVisible();
  await dialog.getByLabel("Create kind").selectOption("items");
  await expect(dialog.locator(".field-error")).toHaveCount(0);
  await name.focus(); await name.blur();
  await expect(dialog.locator('[data-field="name"] .field-error')).toHaveText("Required.");
  const category = dialog.getByRole("combobox", { name: "category", exact: true });
  await category.focus(); await category.blur();
  await expect(dialog.locator('[data-field="category"] .field-error')).toHaveText("Choose one: material, food, water, tool, clothing, container, component, special");
  await expect(create).toBeDisabled();
  await name.fill("Fishing net");
  await category.selectOption("material");
  await expect(create).toBeEnabled();
  await expect(dialog.locator(".create-needed")).toHaveCount(0);
  await create.click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText("1 unsaved files", { exact: true })).toBeVisible();
  const files = (await (await page.request.get("/__studio/files")).json()).files;
  expect(files.some((file: { path: string }) => file.path === "content/items/fishing_net.json")).toBe(false);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await name.fill("Fishing net");
  await expect(id).toHaveValue("fishing_net_2"); // Existing unsaved draft participates in collisions.
});

test("Duplicate waits for a changed name before suggesting an ID, for items and activities", async ({ page }) => {
  await page.goto("/studio/");
  await expect(page.getByRole("status")).toHaveText("Valid · 0 problems");
  for (const kind of ["Items", "Activities"]) {
    await page.getByRole("navigation", { name: "Content navigation" }).getByRole("button", { name: new RegExp(`^${kind}`) }).click();
    await page.getByRole("region", { name: "Entity list" }).getByRole("button").first().click();
    await page.getByRole("button", { name: "More actions", exact: true }).click();
    await page.getByRole("button", { name: "Duplicate", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Duplicate entity" });
    const id = dialog.getByRole("textbox", { name: "id", exact: true });
    await expect(id).toHaveValue("");
    await expect(dialog.locator(".create-id-hint")).toHaveCount(0);
    await expect(dialog.locator(".field-error")).toHaveCount(0);
    await dialog.getByRole("textbox", { name: "name", exact: true }).fill("Duplicate fishing net");
    await expect(id).toHaveValue("duplicate_fishing_net");
    await expect(dialog.locator(".create-id-hint")).toBeVisible();
    await expect(dialog.locator('[data-field="id"] .field-error')).toHaveCount(0);
    await dialog.getByRole("button", { name: "Close dialog" }).click();
  }
});
