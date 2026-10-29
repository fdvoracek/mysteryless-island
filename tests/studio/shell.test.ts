import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { TopBar } from "../../src/studio/shell/TopBar";
import { StatusBar } from "../../src/studio/shell/StatusBar";
import { DocumentHeader } from "../../src/studio/shell/DocumentHeader";

const noop = () => {};
it("renders top bar controls in the approved order with one validation status", () => {
  const html = renderToStaticMarkup(createElement(TopBar, {
    query: "", validation: "Valid · 0 problems", problemCount: 0, canUndo: false, canRedo: false,
    canSave: false, busy: false, previewOpen: false, search: noop, showDiagnostics: noop,
    undo: noop, redo: noop, save: noop, create: noop, togglePreview: noop,
  }));
  const markers = ['class="brand"', 'type="search"', 'role="status"', 'aria-label="Undo"',
    'aria-label="Redo"', '>Save all<', '>Create<', '>Preview<'];
  const positions = markers.map(marker => html.indexOf(marker));
  expect(positions.every(position => position >= 0)).toBe(true);
  expect(positions).toEqual([...positions].sort((a, b) => a - b));
  expect(html.match(/role="status"/g)).toHaveLength(1);
  expect(html).toContain('Valid · 0 problems');
  expect(html).toContain('Search content');
  expect(html).not.toMatch(/unsaved files|Refresh from disk|Open game/);
});

it("keeps zero unsaved files, disk status, refresh and game link in the status bar", () => {
  const html = renderToStaticMarkup(createElement(StatusBar, {
    problemCount: 0, unsaved: 0, status: "Read from disk", busy: false, refresh: noop,
  }));
  for (const text of ["✓ 0 problems", "0 unsaved files", "Read from disk", "Refresh from disk", "Open game ↗", "⌘S save · ⌘Z undo"])
    expect(html).toContain(text);
  expect(html).not.toContain('role="status"');
});

it("renders breadcrumb button, draft-only badge, selected modes and a closed disclosure", () => {
  const header = (unsaved: boolean, mode: "form" | "json") => renderToStaticMarkup(createElement(DocumentHeader, {
    kind: "Activities", id: "catch_fish", title: "catch fish", path: "content/activities/catch_fish.json",
    unsaved, hasSchema: true, mode, entity: true, busy: false, browseKind: noop,
    setMode: noop, duplicate: noop, remove: noop,
  }));
  const clean = header(false, "form"), draft = header(true, "json");
  expect(clean).toContain('<button type="button" class="link">Activities</button>');
  expect(clean).toContain('content/activities/catch_fish.json');
  expect(clean).not.toContain('Unsaved');
  expect(draft).toContain('Unsaved');
  expect(clean).toContain('aria-pressed="true">Form</button>');
  expect(clean).toContain('aria-pressed="false">JSON</button>');
  expect(draft).toContain('aria-pressed="true">JSON</button>');
  expect(clean).toContain('aria-label="More actions" aria-haspopup="true" aria-expanded="false"');
  expect(clean).not.toMatch(/>Duplicate<|>Delete</);
});
