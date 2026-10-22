import { buildRegistry, ContentError, formatContent, Id, type ContentProblem, type Registry } from "../content";
import { readDocuments, type FileDocument } from "./documents";
import { entitySchemas, identityFields, schemaFor, stripComments } from "./schema";
import { getAt, whereUsed } from "./references";

type Drafts = Map<string, string | null>;
export interface JsonBuffer { text: string; source: string }
interface Snapshot {
  drafts: Drafts; errors: Map<string, string>; buffers: Map<string, JsonBuffer>;
  conflicts: Map<string, Conflict>; hashes: Map<string, string>;
}
export type Transport = (input: string, init?: RequestInit) => Promise<Response>;
const signature = (problem: ContentProblem) => JSON.stringify([problem.file, problem.path, problem.message]);
export function permitsSave(baseline: ContentProblem[], current: ContentProblem[]): boolean {
  if (!current.length) return true;
  if (current.length >= baseline.length) return false;
  const counts = new Map<string, number>();
  for (const p of baseline) counts.set(signature(p), (counts.get(signature(p)) ?? 0) + 1);
  for (const p of current) {
    const key = signature(p), count = counts.get(key) ?? 0;
    if (!count) return false;
    counts.set(key, count - 1);
  }
  return true;
}
export interface Conflict { path: string; disk?: FileDocument; choice?: "mine" }
export class StudioStore {
  disk: FileDocument[] = [];
  drafts: Drafts = new Map();
  past: Snapshot[] = [];
  future: Snapshot[] = [];
  buffers = new Map<string, JsonBuffer>();
  conflicts = new Map<string, Conflict>();
  inputErrors = new Map<string, string>();
  status = "";
  busy = false;
  private listeners = new Set<() => void>();
  version = 0;
  constructor(readonly transport: Transport = (input, init) => fetch(input, init)) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  notify = () => { this.version++; for (const listener of this.listeners) listener(); };
  get files(): FileDocument[] {
    const files = new Map(this.disk.map((file) => [file.path, file]));
    for (const [path, content] of this.drafts) {
      if (content === null) files.delete(path);
      else files.set(path, { path, content, encoding: "utf8", hash: files.get(path)?.hash ?? "" });
    }
    return [...files.values()];
  }
  private cachedView?: ReturnType<typeof readDocuments>;
  private cachedVersion = -1;
  private cachedDisk?: FileDocument[];
  get view() {
    if (!this.cachedView || this.cachedVersion !== this.version || this.cachedDisk !== this.disk) {
      this.cachedView = readDocuments(this.files); this.cachedVersion = this.version; this.cachedDisk = this.disk;
    }
    return this.cachedView;
  }
  private baselineDisk?: FileDocument[];
  private baselineProblems: ContentProblem[] = [];
  get baseline() {
    if (this.baselineDisk !== this.disk) { this.baselineProblems = readDocuments(this.disk).diagnostics; this.baselineDisk = this.disk; }
    return this.baselineProblems;
  }
  get validated(): Registry | undefined {
    if (this.inputErrors.size) return undefined;
    try { return buildRegistry(Object.fromEntries(this.files.filter((file) => file.encoding === "utf8").map((file) => [file.path, JSON.parse(file.content)]))); }
    catch (error) { if (error instanceof ContentError || error instanceof SyntaxError) return undefined; throw error; }
  }
  get canSave() { return !this.busy && this.drafts.size > 0 && !this.inputErrors.size && permitsSave(this.baseline, this.view.diagnostics); }
  private snapshot(): Snapshot {
    return { drafts: new Map(this.drafts), errors: new Map(this.inputErrors), buffers: new Map(this.buffers),
      conflicts: new Map([...this.conflicts].map(([path, conflict]) => [path, { ...conflict }])),
      hashes: new Map(this.disk.map((file) => [file.path, file.hash])) };
  }
  private checkpoint() { this.past.push(this.snapshot()); this.future = []; }
  private restore(snapshot: Snapshot) {
    this.drafts = snapshot.drafts; this.inputErrors = snapshot.errors; this.buffers = snapshot.buffers;
    this.conflicts = new Map([...snapshot.conflicts].filter(([path]) => this.drafts.has(path)));
    for (const path of this.drafts.keys()) {
      const disk = this.disk.find((file) => file.path === path);
      if (snapshot.hashes.get(path) !== disk?.hash) this.conflicts.set(path, { path, disk });
    }
  }
  buffersFor(path: string): Record<string, JsonBuffer> {
    return Object.fromEntries([...this.buffers].filter(([key]) => key.startsWith(path + ":")).map(([key, value]) => [key.slice(path.length + 1), value]));
  }
  private clearInputs(path: string) {
    for (const key of this.inputErrors.keys()) if (key.startsWith(path + ":")) this.inputErrors.delete(key);
    for (const key of this.buffers.keys()) if (key.startsWith(path + ":")) this.buffers.delete(key);
  }
  edit(path: string, raw: unknown) { this.editText(path, formatContent(raw)); }
  editText(path: string, content: string) {
    if (this.drafts.get(path) === content) return;
    if (this.busy) return;
    this.checkpoint(); this.drafts.set(path, content);
    try {
      const raw = JSON.parse(content);
      for (const [key, buffer] of this.buffers) if (key.startsWith(path + ":") && JSON.stringify(getAt(raw, key.slice(path.length + 1)), null, 2) !== buffer.source) {
        this.buffers.delete(key); this.inputErrors.delete(key);
      }
    } catch { /* malformed documents keep their repair input */ }
    this.clean(path); this.notify();
  }
  private clean(path: string) {
    const original = this.disk.find((file) => file.path === path);
    let same = original?.content === this.drafts.get(path);
    try { same ||= !!original && formatContent(JSON.parse(original.content)) === this.drafts.get(path); } catch { /* malformed source stays editable */ }
    if (same && ![...this.inputErrors.keys()].some((key) => key.startsWith(path + ":"))) this.drafts.delete(path);
  }
  error(path: string, field: string, message: string, buffer?: JsonBuffer) {
    if (this.busy) return;
    const key = `${path}:${field}`;
    if ((this.inputErrors.get(key) ?? "") === message && this.buffers.get(key)?.text === buffer?.text) return;
    this.checkpoint();
    if (message) {
      this.inputErrors.set(key, message);
      if (buffer) this.buffers.set(key, buffer);
      if (!this.drafts.has(path)) {
        const document = this.disk.find((file) => file.path === path);
        if (document) this.drafts.set(path, document.content);
      }
    } else { this.inputErrors.delete(key); this.buffers.delete(key); this.clean(path); }
    this.notify();
  }
  undo() { if (this.busy) return; const previous = this.past.pop(); if (previous) { this.future.push(this.snapshot()); this.restore(previous); this.notify(); } }
  redo() { if (this.busy) return; const next = this.future.pop(); if (next) { this.past.push(this.snapshot()); this.restore(next); this.notify(); } }
  async readDisk(): Promise<FileDocument[]> {
    const response = await this.transport("/__studio/files", { cache: "no-store" });
    const hint = typeof window === "undefined" ? "Open the local Studio URL" : `Open http://127.0.0.1:${window.location.port || "80"}/studio/`;
    if (response.status === 403) throw new Error(hint);
    let data;
    try { data = await response.json(); } catch { throw new Error(hint); }
    if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status})`);
    return data.files;
  }
  reconcile(files: FileDocument[]) {
    for (const [path] of this.drafts) {
      const before = this.disk.find((file) => file.path === path);
      const after = files.find((file) => file.path === path);
      if (before?.hash !== after?.hash) this.conflicts.set(path, { path, disk: after });
    }
    this.disk = files; this.notify();
  }
  private refreshId = 0;
  async refresh() {
    if (this.busy) return;
    const id = ++this.refreshId;
    const files = await this.readDisk();
    if (id === this.refreshId && !this.busy) this.reconcile(files);
  }
  resolve(path: string, choice: "reload" | "mine") {
    if (this.busy) return;
    if (choice === "reload") {
      this.checkpoint(); this.drafts.delete(path); this.conflicts.delete(path);
      this.clearInputs(path);
    } else { const conflict = this.conflicts.get(path); if (conflict) conflict.choice = "mine"; }
    this.notify();
  }
  createProblems(kind: string, raw: unknown, duplicate?: unknown): ContentProblem[] {
    const schema = entitySchemas[kind];
    if (!schema) return [{ file: "", path: "", message: "This kind is a singleton; edit its existing file." }];
    const parsed = schema.safeParse(stripComments(raw));
    const problems: ContentProblem[] = parsed.success ? [] : parsed.error.issues.map((issue) => ({ file: "", path: issue.path.join("."), message: issue.message }));
    const fields = identityFields(schema, raw);
    const existing = new Set(this.view.documents.flatMap((d) => {
      const node = schemaFor(d.path); return node ? identityFields(node, d.raw).map((f) => f.value) : [];
    }));
    const previous = new Map(duplicate === undefined ? [] : identityFields(schema, duplicate).map((f) => [f.path, f.value]));
    const claimed = new Set<string>();
    for (const field of fields) {
      if (!Id.safeParse(field.value).success || existing.has(field.value) || claimed.has(field.value) || previous.get(field.path) === field.value) problems.push({ file: "", path: field.path, message: "Use a new, unique lowercase snake_case ID." });
      claimed.add(field.value);
    }
    // Empty required author strings are not valid creation input, even where the runtime allows them.
    const required = (value: unknown, path = "") => {
      if (typeof value === "string" && !value.trim()) problems.push({ file: "", path, message: "Required; enter a value." });
      else if (value && typeof value === "object") for (const [key, child] of Object.entries(value)) if (!key.startsWith("_")) required(child, [path, key].filter(Boolean).join("."));
    };
    required(raw);
    return problems;
  }
  create(kind: string, raw: unknown, duplicate?: unknown): string {
    if (this.busy) throw new Error("Wait for the current save.");
    if (this.createProblems(kind, raw, duplicate).length) throw new Error("Complete the required fields and use new IDs.");
    const path = `content/${kind}/${(raw as { id: string }).id}.json`;
    this.edit(path, raw); return path;
  }
  delete(path: string) {
    if (this.busy) throw new Error("Wait for the current save.");
    const documents = this.view.documents, target = documents.find((d) => d.path === path);
    if (!target || !entitySchemas[target.kind]) throw new Error("Singleton files cannot be deleted.");
    if (whereUsed(documents, target).length) throw new Error("This entity is still referenced.");
    this.checkpoint(); this.clearInputs(path);
    if (this.disk.some((file) => file.path === path)) this.drafts.set(path, null); else this.drafts.delete(path);
    this.notify();
  }
  async save(overwrite = false): Promise<{ written: string[]; notWritten: string[] }> {
    const written: string[] = [];
    if (!this.canSave) throw new Error("Saving is blocked by validation errors or incomplete input.");
    ++this.refreshId; // A refresh begun before this save must never replace its acknowledged hashes.
    this.busy = true; this.notify();
    const paths = [...this.drafts.keys()];
    try {
      this.reconcile(await this.readDisk());
      if (!permitsSave(this.baseline, this.view.diagnostics)) throw new Error("Disk changes make this save invalid.");
      if ([...this.conflicts.values()].some((c) => paths.includes(c.path) && (!overwrite || c.choice !== "mine"))) throw new Error("File changed on disk. Resolve the conflict before saving.");
      for (const path of paths) {
        const draft = this.drafts.get(path)!;
        const original = this.disk.find((file) => file.path === path);
        const content = draft === null ? null : formatContent(JSON.parse(draft));
        const response = await this.transport(`/__studio/files/${path}`, {
          method: content === null ? "DELETE" : "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedHash: original?.hash ?? null, ...(content === null ? {} : { content, encoding: "utf8" }) }),
        });
        const result = await response.json();
        if (response.status === 409) {
          const files = await this.readDisk(); this.reconcile(files);
          this.conflicts.set(path, { path, disk: files.find((f) => f.path === path) });
          throw new Error("File changed on disk.");
        }
        if (!response.ok) throw new Error(result.error ?? `Request failed (${response.status})`);
        this.disk = this.disk.filter((file) => file.path !== path);
        if (content !== null) this.disk.push({ path, content, hash: result.hash, encoding: "utf8" });
        this.drafts.delete(path); this.conflicts.delete(path); written.push(path);
      }
      this.past = []; this.future = [];
      this.status = `Written: ${written.join(", ")}. Not written: none.`;
    } catch (error) {
      this.status = `${(error as Error).message} Written: ${written.join(", ") || "none"}. Not written: ${paths.filter((path) => !written.includes(path)).join(", ") || "none"}.`;
    } finally { this.busy = false; this.notify(); }
    return { written, notWritten: paths.filter((path) => !written.includes(path)) };
  }
}
