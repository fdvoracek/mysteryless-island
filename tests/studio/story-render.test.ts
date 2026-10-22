import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterAll, expect, it } from "vitest";
import { StudioStore } from "../../src/studio/store";
import { StoryView } from "../../src/studio/story-view";
import { temporaryPack } from "./pack";
const pack = temporaryPack();
afterAll(pack.cleanup);

// No DOM here: this only proves the workspace renders with every control from the fixture story, without
// throwing. Interaction (focus, drag, reload) is covered by tests/studio-browser/story-graph.spec.ts.
it("renders the story workspace with focus, filter, layout and search controls", () => {
  const store = new StudioStore(); store.disk = structuredClone(pack.files);
  const html = renderToString(createElement(StoryView, { store, documents: store.view.documents, open: () => undefined, create: () => undefined }));
  for (const label of ["Show all references", "Group by area", "Re-arrange", "Reset layout", "Find a node", "Story direction", "Story spacing", "Focus depth", "Accessible list view", "Select a node to focus it."]) expect(html, label).toContain(label);
  expect(html).not.toContain("Layout saved");
  expect(html).toMatch(/<button[^>]*disabled[^>]*>Reset layout<\/button>/);
});
