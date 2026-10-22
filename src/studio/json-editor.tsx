import { useEffect, useMemo, useRef } from "react";
import { Annotation, Compartment, EditorState, StateEffect, StateField, Transaction } from "@codemirror/state";
import { EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { json } from "@codemirror/lang-json";
import { bracketMatching, defaultHighlightStyle, foldGutter, foldKeymap, indentOnInput, syntaxHighlighting } from "@codemirror/language";
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { linter, lintGutter, lintKeymap, type Diagnostic } from "@codemirror/lint";
import type { ContentProblem } from "../content";
import type { Schema } from "./schema";
import { toJsonSchema } from "./json-schema";
import { completionSource, hover, type ReferenceOptions } from "./json-complete";
import { DraftSync } from "./json-sync";
import { pathAt, positionOfPath, rangeOfPath, registryTextProblems, syntaxProblems, type TextProblem } from "./json-text";

interface Registry { problems: ContentProblem[]; text: string }
const setRegistry = StateEffect.define<Registry>();
const registryField = StateField.define<Registry>({
  create: () => ({ problems: [], text: "" }),
  update: (value, transaction) => transaction.effects.reduce((current, effect) => effect.is(setRegistry) ? effect.value : current, value),
});
const external = Annotation.define<boolean>();
const toDiagnostic = (problem: TextProblem): Diagnostic => ({ from: problem.from, to: Math.max(problem.to, problem.from), severity: "error", message: problem.message, source: "content" });

type HostWithView = HTMLDivElement & { editorView?: EditorView };
export interface JsonEditorProps {
  path: string; text: string; schema: Schema; problems: ContentProblem[]; references: ReferenceOptions; readOnly: boolean;
  /** Dotted field path to select (a diagnostic link). */
  reveal: string;
  onEdit: (text: string) => void; onSettle: () => void;
  /** A problem JSON.parse hides (duplicate key), or "" when there is none. */
  onProblem: (message: string) => void;
}

/** Whole-file JSON editor: what is typed is the draft; saving reformats it with the house formatter. */
export function JsonEditor(props: JsonEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | undefined>(undefined);
  const syncRef = useRef<DraftSync | undefined>(undefined);
  const latest = useRef(props);
  latest.current = props;
  const document = useMemo(() => toJsonSchema(props.schema), [props.schema]);
  const editable = useRef(new Compartment());
  const problemsKey = JSON.stringify(props.problems);

  useEffect(() => {
    const sync = new DraftSync((text) => latest.current.onEdit(text), () => latest.current.onSettle());
    sync.sent = latest.current.text;
    syncRef.current = sync;
    const source = (view: EditorView): Diagnostic[] => {
      const syntax = syntaxProblems(view.state);
      latest.current.onProblem(syntax.find((problem) => problem.message.startsWith("Duplicate key"))?.message ?? "");
      const found = syntax.map(toDiagnostic);
      const registry = view.state.field(registryField);
      if (!syntax.some((problem) => problem.message.startsWith("Invalid JSON")) && registry.text === view.state.doc.toString()) {
        found.push(...registryTextProblems(view.state, registry.problems).map(toDiagnostic));
      }
      return found;
    };
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: latest.current.text,
        extensions: [
          lineNumbers(), foldGutter(), lintGutter(), highlightActiveLine(), highlightActiveLineGutter(), drawSelection(),
          history(), indentOnInput(), bracketMatching(), closeBrackets(), highlightSelectionMatches(), EditorView.lineWrapping,
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }), json(), registryField,
          autocompletion({ override: [completionSource(document, (kind, path) => latest.current.references(kind, path))] }),
          hover(document),
          linter(source, { delay: 100, needsRefresh: (update) => update.transactions.some((tr) => tr.effects.some((effect) => effect.is(setRegistry))) }),
          // Tab is left to the browser so keyboard users can leave the editor.
          keymap.of([{ key: "Mod-s", run: () => { sync.flush(); return false; } }, ...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...foldKeymap, ...completionKeymap, ...lintKeymap]),
          editable.current.of([EditorView.editable.of(!latest.current.readOnly), EditorState.readOnly.of(latest.current.readOnly)]),
          EditorView.contentAttributes.of({ "aria-label": "JSON document", spellcheck: "false" }),
          EditorView.domEventHandlers({ blur: () => { sync.settle(); return false; } }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !update.transactions.some((tr) => tr.annotation(external))) sync.push(update.state.doc.toString());
          }),
          EditorView.theme({
            "&": { height: "100%", fontSize: "13px" }, ".cm-scroller": { fontFamily: "var(--studio-code, monospace)", overflow: "auto" },
            "&.cm-focused": { outline: "2px solid var(--studio-accent, #2563eb)", outlineOffset: "-2px" },
          }),
        ],
      }),
    });
    viewRef.current = view;
    (host.current as HostWithView).editorView = view; // lets browser tests drive the exact selection
    return () => { sync.settle(); view.destroy(); viewRef.current = undefined; };
  }, [document]);

  useEffect(() => {
    const view = viewRef.current, sync = syncRef.current;
    if (!view || !sync) return;
    view.dispatch({ effects: editable.current.reconfigure([EditorView.editable.of(!props.readOnly), EditorState.readOnly.of(props.readOnly)]) });
  }, [props.readOnly]);

  // A change that did not come from this editor (form edit, Studio undo, save, disk reload) replaces the text in place.
  useEffect(() => {
    const view = viewRef.current, sync = syncRef.current;
    if (!view || !sync) return;
    if (props.text === view.state.doc.toString() || props.text === sync.sent) return;
    sync.discard(); sync.sent = props.text;
    const before = pathAt(view.state, view.state.selection.main.head);
    const next = EditorState.create({ doc: props.text, extensions: [json()] });
    const target = before.length ? positionOfPath(next, before) : undefined;
    const anchor = Math.min(target ?? view.state.selection.main.head, props.text.length);
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: props.text }, selection: { anchor },
      annotations: [external.of(true), Transaction.addToHistory.of(false)], scrollIntoView: true,
    });
  }, [props.text]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: setRegistry.of({ problems: latest.current.problems, text: latest.current.text }) });
  }, [problemsKey, props.text, document]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !props.reveal) return;
    const range = rangeOfPath(view.state, props.reveal);
    view.dispatch({ selection: { anchor: range.from, head: range.to }, scrollIntoView: true });
    view.focus();
  }, [props.reveal, document]);

  return <div className="json-editor" ref={host} data-testid="json-editor" />;
}
