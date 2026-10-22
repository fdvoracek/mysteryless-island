import type { Page } from "@playwright/test";

type CodeMirrorHost = Element & { editorView?: { state: { doc: { toString(): string; length: number; line(n: number): { from: number; text: string } }; selection: { main: { head: number } } }; dispatch(spec: unknown): void; focus(): void } };
/** The CodeMirror view behind the JSON editor, for exact text and selection control. */
export const editorText = (page: Page) => page.evaluate(() => (document.querySelector("[data-testid=json-editor]") as CodeMirrorHost).editorView!.state.doc.toString());
export const setEditorText = (page: Page, text: string) => page.evaluate((value) => {
  const view = (document.querySelector("[data-testid=json-editor]") as CodeMirrorHost).editorView!;
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
}, text);
export const placeCursor = (page: Page, marker: string, offset = 0) => page.evaluate(({ marker, offset }) => {
  const view = (document.querySelector("[data-testid=json-editor]") as CodeMirrorHost).editorView!;
  const at = view.state.doc.toString().indexOf(marker);
  if (at < 0) throw new Error(`marker not found: ${marker}`);
  view.dispatch({ selection: { anchor: at + offset } }); view.focus();
}, { marker, offset });
export const cursorLine = (page: Page) => page.evaluate(() => {
  const state = (document.querySelector("[data-testid=json-editor]") as CodeMirrorHost).editorView!.state as unknown as { doc: { lineAt(n: number): { text: string } }; selection: { main: { head: number } } };
  return state.doc.lineAt(state.selection.main.head).text;
});
