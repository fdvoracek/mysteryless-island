import { buildRegistry, ContentError, formatContent, Id, type ContentProblem, type Registry } from "../content";
import { readDocuments, type FileDocument } from "./documents";
import { entitySchemas, identityFields, schemaFor, stripComments } from "./schema";
import { getAt } from "./references";
import { deletionBlockers, isTreeShape, placeNode, treeDocument, withoutNode } from "./tree";
import { renamePlan } from "./rename";
import { LAYOUT_PATH, nodeKey, parseLayout, prunePins, renamePin, serializeLayout, type Pin, type Pins } from "./layout-file";
import { deriveStory } from "./story";

type Drafts = Map<string, string | null>;
export interface JsonBuffer { text: string; source: string }
interface Snapshot {
  moves: Map<string, string>; drafts: Drafts; errors: Map<string, string>; buffers: Map<string, JsonBuffer>;
  conflicts: Map<string, Conflict>; hashes: Map<string, string>; layoutRenames: [string, string][];
}
/** A pin change not yet on disk. Replayed over the disk version after a 409. */
type LayoutOp = { t: "pin"; id: string; pos: Pin } | { t: "unpin"; ids: string[] } | { t: "reset" } | { t: "rename"; pairs: [string, string][] } | { t: "prune"; ids: ReadonlySet<string> };
function applyOp(pins: Pins, op: LayoutOp): Pins {
  switch (op.t) {
    case "pin": { const old = pins[op.id]; return old && old.x === op.pos.x && old.y === op.pos.y ? pins : { ...pins, [op.id]: op.pos }; }
    case "unpin": return op.ids.some(id => id in pins) ? Object.fromEntries(Object.entries(pins).filter(([key]) => !op.ids.includes(key))) : pins;
    case "reset": return Object.keys(pins).length ? {} : pins;
    case "rename": return op.pairs.reduce((all, [from, to]) => renamePin(all, from, to), pins);
    case "prune": return prunePins(pins, op.ids);
  }
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
  moves = new Map<string, string>();
  past: Snapshot[] = [];
  future: Snapshot[] = [];
  buffers = new Map<string, JsonBuffer>();
  conflicts = new Map<string, Conflict>();
  inputErrors = new Map<string, string>();
  status = "";
  busy = false;
  private listeners = new Set<() => void>();
  version = 0;
  // Story-graph pins are view state, not content: they never become drafts, never count as unsaved
  // changes, and a content error cannot block them. They autosave through the same expected-hash API.
  pins: Pins = {};
  layoutDisk?: FileDocument;
  layoutProblem = "";
  layoutStatus: "idle" | "pending" | "saving" | "saved" | "failed" = "idle";
  layoutDelay = 1000;
  /** Renames staged with the content drafts; pins follow them when the rename is saved. */
  layoutRenames: [string, string][] = [];
  private ops: LayoutOp[] = [];
  private layoutTimer?: ReturnType<typeof setTimeout>;
  private layoutRun: Promise<void> = Promise.resolve();
  private layoutWriting = false;
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
  canDiscard(path: string): { ok: true } | { ok: false; reason: string } {
    if (this.moves.has(path) || [...this.moves.values()].includes(path)) {
      return { ok: false, reason: "Part of a rename — Undo the rename to discard." };
    }
    if (!this.disk.some(file => file.path === path)) return { ok: false, reason: "New file — remove it with ⋯ → Delete." };
    return { ok: true };
  }
  discard(path: string): void {
    if (this.busy || !this.drafts.has(path) || !this.canDiscard(path).ok) return;
    this.checkpoint();
    this.drafts.delete(path); this.clearInputs(path); this.conflicts.delete(path); this.notify();
  }
  private snapshot(): Snapshot {
    return { moves: new Map(this.moves), drafts: new Map(this.drafts), errors: new Map(this.inputErrors), buffers: new Map(this.buffers),
      conflicts: new Map([...this.conflicts].map(([path, conflict]) => [path, { ...conflict }])),
      hashes: new Map(this.disk.map((file) => [file.path, file.hash])), layoutRenames: [...this.layoutRenames] };
  }
  /** Path whose live-typing burst already has its undo checkpoint. */
  private typing?: string;
  private checkpoint() { this.typing = undefined; this.past.push(this.snapshot()); this.future = []; }
  private joinTyping(path: string) { if (this.typing !== path) this.checkpoint(); this.typing = path; }
  /** Ends a live-typing burst so the next live edit starts a new undo step. */
  endTyping() { this.typing = undefined; }
  private restore(snapshot: Snapshot) {
    this.typing = undefined;
    this.layoutRenames = snapshot.layoutRenames;
    this.moves = snapshot.moves; this.drafts = snapshot.drafts; this.inputErrors = snapshot.errors; this.buffers = snapshot.buffers;
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
  /**
   * Text from the JSON editor. Malformed text is kept as a buffer (like a raw field) and leaves the
   * last valid draft in place, so one typo does not cascade into unknown-reference problems.
   */
  editJson(path: string, text: string) {
    if (this.busy) return;
    const key = `${path}:`;
    let failure = "";
    try { JSON.parse(text); } catch (error) { failure = (error as Error).message; }
    if (failure) {
      if (this.buffers.get(key)?.text === text) return;
      this.joinTyping(path);
      let source = "";
      try { source = JSON.stringify(JSON.parse(this.drafts.get(path) ?? this.disk.find((file) => file.path === path)?.content ?? ""), null, 2); } catch { /* unreadable source */ }
      this.inputErrors.set(key, failure); this.buffers.set(key, { text, source });
      if (!this.drafts.has(path)) { const document = this.disk.find((file) => file.path === path); if (document) this.drafts.set(path, document.content); }
      this.notify();
      return;
    }
    if (this.inputErrors.has(key)) {
      this.joinTyping(path);
      this.inputErrors.delete(key); this.buffers.delete(key);
      if (this.drafts.get(path) === text) { this.clean(path); this.notify(); return; }
    }
    this.editText(path, text, true);
  }
  /** `live` edits (the JSON editor) share one undo checkpoint until `endTyping`. */
  editText(path: string, content: string, live = false) {
    if (this.drafts.get(path) === content) return;
    if (this.busy) return;
    if (!live || this.typing !== path) this.checkpoint();
    this.typing = live ? path : undefined;
    if (!live) this.inputErrors.delete(`${path}:json`);
    this.drafts.set(path, content);
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
  /** Editor-detected problem JSON.parse would hide (a duplicate key); blocks Save without an undo step. */
  setJsonProblem(path: string, message: string) {
    const key = `${path}:json`;
    if ((this.inputErrors.get(key) ?? "") === message) return;
    if (message) {
      this.inputErrors.set(key, message);
      if (!this.drafts.has(path)) { const document = this.disk.find((file) => file.path === path); if (document) this.drafts.set(path, document.content); }
    } else { this.inputErrors.delete(key); this.clean(path); }
    this.notify();
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
    const files = data.files as FileDocument[];
    this.adoptLayout(files.find(file => file.path === LAYOUT_PATH));
    return files.filter(file => !file.path.startsWith("studio-layout/"));
  }
  /** Layout pins as shown now: saved and pending pins, with staged renames applied. */
  get pinned(): Pins { return this.layoutRenames.reduce((all, [from, to]) => renamePin(all, from, to), this.pins); }
  private adoptLayout(file: FileDocument | undefined) {
    this.layoutDisk = file;
    if (this.ops.length || this.layoutWriting) return;
    const parsed = parseLayout(file?.content);
    this.pins = parsed.pins; this.layoutProblem = parsed.problem ?? "";
  }
  private record(op: LayoutOp) {
    const next = applyOp(this.pins, op);
    if (next === this.pins) return false;
    this.pins = next; this.ops.push(op); this.layoutStatus = "pending";
    clearTimeout(this.layoutTimer);
    this.layoutTimer = setTimeout(() => { void this.flushLayout(); }, this.layoutDelay);
    this.notify(); return true;
  }
  pin(id: string, pos: Pin) { this.record({ t: "pin", id, pos: { x: Math.round(pos.x), y: Math.round(pos.y) } }); }
  /** Also drops pins under the node's earlier names while a rename is staged. */
  unpin(id: string) {
    const ids = new Set([id]);
    for (const [from, to] of [...this.layoutRenames].reverse()) if (ids.has(to)) ids.add(from);
    this.record({ t: "unpin", ids: [...ids] });
  }
  resetPins() { this.record({ t: "reset" }); }
  /** Writes pending pin changes now. Never throws: failures set `layoutStatus` and keep the changes for a retry. */
  flushLayout(): Promise<void> {
    clearTimeout(this.layoutTimer);
    this.layoutRun = this.layoutRun.then(() => this.writeLayout());
    return this.layoutRun;
  }
  private async writeLayout() {
    if (!this.ops.length) return;
    this.layoutWriting = true; this.layoutStatus = "saving"; this.notify();
    try {
      let conflicts = 0;
      while (this.ops.length) {
        const count = this.ops.length, content = serializeLayout(this.pins);
        if (!this.layoutDisk && !Object.keys(this.pins).length) { this.ops.splice(0, count); continue; }
        const response = await this.transport(`/__studio/files/${LAYOUT_PATH}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedHash: this.layoutDisk?.hash ?? null, content, encoding: "utf8" }),
        });
        const result = await response.json();
        if (response.status === 409 && conflicts++ < 3) {
          // Someone else wrote the file: take their pins and reapply ours on top.
          await this.readDisk();
          const parsed = parseLayout(this.layoutDisk?.content);
          this.pins = this.ops.reduce(applyOp, parsed.pins);
          continue;
        }
        if (!response.ok) throw new Error(result.error ?? `Request failed (${response.status})`);
        this.layoutDisk = { path: LAYOUT_PATH, content, encoding: "utf8", hash: result.hash };
        this.ops.splice(0, count); this.layoutProblem = "";
      }
      this.layoutStatus = "saved";
    } catch { this.layoutStatus = "failed"; }
    finally { this.layoutWriting = false; this.notify(); }
  }
  /** After content is saved: renamed nodes keep their pins and pins of deleted nodes go. */
  private settleLayout() {
    const pairs = this.layoutRenames; this.layoutRenames = [];
    if (pairs.length) this.record({ t: "rename", pairs });
    const documents = this.view.documents;
    // A file that does not parse hides its nodes; never prune from a partial story.
    if (documents.every(d => d.encoding !== "utf8" || d.raw !== undefined)) this.record({ t: "prune", ids: new Set(deriveStory(documents).nodes.map(n => n.id)) });
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
    if (choice === "reload" && (this.moves.has(path) || [...this.moves.values()].includes(path))) {
      this.status = "Undo the pending rename before reloading either filename, or keep the rename and explicitly overwrite.";
      this.notify(); return;
    }
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
  /** One grouped operation, including references and any pending file move. */
  rename(file: string, path: string, newId: string): string {
    if (this.busy || this.inputErrors.size) throw new Error("Finish the current save or invalid input first.");
    const plan = renamePlan(this.view.documents, file, path, newId);
    this.checkpoint();
    for (const [p, content] of plan.drafts) { this.drafts.set(p, content); this.clearInputs(p); }
    if (plan.move) {
      const previous = [...this.moves].find(([, to]) => to === file);
      if (previous) {
        if (previous[0] === plan.move.to) this.moves.delete(previous[0]);
        else this.moves.set(previous[0], plan.move.to);
        this.drafts.delete(file);
      }
      else if (this.disk.some(f => f.path === file)) this.moves.set(file, plan.move.to);
      else this.drafts.delete(file);
    }
    for (const p of plan.drafts.keys()) this.clean(p);
    // Pins follow the rename when it is saved; until then the view applies it (see `pinned`).
    const from = nodeKey(plan.target), to = nodeKey(plan.target, newId);
    if (from && to) this.layoutRenames = [...this.layoutRenames, [from, to]];
    this.notify(); return plan.move?.to ?? file;
  }
  createInArea(areaPath: string, kind: string, raw: unknown): string {
    if (kind !== "activities") throw new Error("Choose an activity for this area.");
    if (this.busy || this.createProblems(kind, raw).length) throw new Error("Complete the activity fields and use new IDs.");
    const area = this.view.documents.find(d => d.path === areaPath && d.kind === "regions");
    const links = (area?.raw as { activities?: unknown })?.activities;
    if (!area || !Array.isArray(links)) throw new Error("Area no longer exists or its links are invalid.");
    const id = (raw as { id: string }).id, path = `content/activities/${id}.json`;
    this.checkpoint(); this.drafts.set(path, formatContent(raw));
    this.drafts.set(areaPath, formatContent({ ...area.raw as object, activities: [...links, id] }));
    this.notify(); return path;
  }
  /** One grouped operation: the recipe/building draft and its new node in its creation tree. */
  createWithTreeNode(kind: string, raw: unknown, node: { branch: string; after: string[] }): string {
    const treeKind = kind === "recipes" ? "craft" : kind === "buildings" ? "build" : undefined;
    if (!treeKind) throw new Error("Choose a recipe or building for this tree.");
    if (this.busy || this.createProblems(kind, raw).length) throw new Error("Complete the required fields and use new IDs.");
    const tree = treeDocument(this.view.documents, treeKind);
    if (!tree || !isTreeShape(tree.raw)) throw new Error("The creation tree is missing or damaged; repair it first.");
    const id = (raw as { id: string }).id, path = `content/${kind}/${id}.json`;
    const placed = placeNode(tree.raw, id, node.branch, node.after);
    this.checkpoint(); this.drafts.set(path, formatContent(raw));
    this.drafts.set(tree.path, formatContent(placed)); this.clean(tree.path);
    this.notify(); return path;
  }
  orphanActivities(areaPath: string) {
    const docs = this.view.documents, area = docs.find(d => d.path === areaPath);
    const links = (area?.raw as { activities?: string[] })?.activities;
    return docs.filter(d => d.kind === "activities" && Array.isArray(links) && links.includes(d.id)
      && !(d.raw as { global?: boolean })?.global && !docs.some(other => other.kind === "regions" && other.path !== areaPath && Array.isArray((other.raw as { activities?: unknown })?.activities) && ((other.raw as { activities: string[] }).activities).includes(d.id)));
  }
  delete(path: string, deleteOrphans = false) {
    if (this.busy) throw new Error("Wait for the current save.");
    const documents = this.view.documents, target = documents.find((d) => d.path === path);
    if (!target || !entitySchemas[target.kind]) throw new Error("Singleton files cannot be deleted.");
    if (deletionBlockers(documents, target).length) throw new Error("This entity is still referenced.");
    const removing = [target, ...(deleteOrphans && target.kind === "regions" ? this.orphanActivities(path) : [])];
    const remaining = documents.filter(d => !removing.some(r => r.path === d.path));
    for (const document of removing) if (deletionBlockers([...remaining, document], document).length) throw new Error("A linked activity is still referenced.");
    this.checkpoint();
    const node = withoutNode(documents, target);
    if (node) { this.drafts.set(node.path, formatContent(node.raw)); this.clean(node.path); }
    for (const document of removing) {
      const p = document.path;
      this.clearInputs(p);
      // Deleting a renamed draft cancels its move and deletes the original file instead.
      const move = [...this.moves].find(([, to]) => to === p);
      if (move) { this.moves.delete(move[0]); this.drafts.delete(p); this.drafts.set(move[0], null); }
      else if (this.disk.some(file => file.path === p)) this.drafts.set(p, null); else this.drafts.delete(p);
    }
    this.notify();
  }
  async save(overwrite = false): Promise<{ written: string[]; notWritten: string[] }> {
    const written: string[] = [];
    const moved: string[] = [];
    if (!this.canSave) throw new Error("Saving is blocked by validation errors or incomplete input.");
    ++this.refreshId; // A refresh begun before this save must never replace its acknowledged hashes.
    this.busy = true; this.notify();
    const paths = [...this.drafts.keys()].sort();
    const moveNames = [...this.moves].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    try {
      this.reconcile(await this.readDisk());
      if (!permitsSave(this.baseline, this.view.diagnostics)) throw new Error("Disk changes make this save invalid.");
      if ([...this.conflicts.values()].some((c) => paths.includes(c.path) && (!overwrite || c.choice !== "mine"))) throw new Error("File changed on disk. Resolve the conflict before saving.");
      // Fixed order: moves by source path, then canonical writes/deletes by path.
      // A move is one atomic filesystem rename: never create/delete a pair of copies.
      for (const [from, to] of moveNames) {
        const original = this.disk.find(f => f.path === from);
        if (!original) throw new Error(`Rename source missing: ${from}`);
        const response = await this.transport(`/__studio/files/${from}/rename`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedHash: original.hash, path: to }),
        });
        const result = await response.json();
        if (response.status === 409) {
          this.reconcile(await this.readDisk());
          this.conflicts.set(from, { path: from, disk: this.disk.find(f => f.path === from) });
        }
        if (!response.ok) throw new Error(result.error ?? `Rename failed (${response.status})`);
        this.disk = this.disk.filter(f => f.path !== from);
        this.disk.push({ ...original, path: to, hash: result.hash });
        this.drafts.delete(from); this.moves.delete(from); this.conflicts.delete(from);
        written.push(from); moved.push(`${from} → ${to} (new filename exists; old filename absent)`);
        this.past = []; this.future = [];
      }
      for (const path of paths) {
        if (!this.drafts.has(path)) continue;
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
        this.drafts.delete(path); this.conflicts.delete(path); written.push(path); this.past = []; this.future = [];
      }
      this.past = []; this.future = [];
      this.status = `Written: ${written.join(", ")}. Not written: none.`;
      // Layout follows the saved content; its own failure is reported by `layoutStatus`, never as a content failure.
      this.settleLayout();
      await this.flushLayout();
    } catch (error) {
      this.status = `${(error as Error).message} Written: ${written.join(", ") || "none"}. Not written: ${paths.filter((path) => !written.includes(path)).join(", ") || "none"}.`;
    } finally {
      if (moveNames.length) this.status += ` Renames: ${moveNames.map(([from, to]) => moved.find(m => m.startsWith(from + " →")) ?? `${from} → ${to} (not moved; old filename retained)`).join("; ")}.`;
      this.busy = false; this.notify(); }
    return { written, notWritten: paths.filter((path) => !written.includes(path)) };
  }
}
