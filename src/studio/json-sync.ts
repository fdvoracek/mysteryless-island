export const COMMIT_DELAY = 300;
export const CHECKPOINT_DELAY = 500;
interface Clock { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout }

/** Batches editor keystrokes into one store edit (after a pause) and one undo checkpoint (after a longer one). */
export class DraftSync {
  /** The text last handed to the store; a store echo of it is not an external change. */
  sent: string | undefined;
  private pending: string | undefined;
  private commitTimer?: ReturnType<typeof setTimeout>;
  private checkpointTimer?: ReturnType<typeof setTimeout>;
  constructor(private commit: (text: string) => void, private checkpoint: () => void, private clock: Clock = globalThis) {}
  push(text: string) {
    this.pending = text;
    this.clock.clearTimeout(this.commitTimer); this.clock.clearTimeout(this.checkpointTimer);
    this.commitTimer = this.clock.setTimeout(() => this.flush(), COMMIT_DELAY);
    this.checkpointTimer = this.clock.setTimeout(() => this.settle(), CHECKPOINT_DELAY);
  }
  get dirty() { return this.pending !== undefined; }
  flush() {
    this.clock.clearTimeout(this.commitTimer);
    if (this.pending === undefined) return;
    const text = this.pending; this.pending = undefined; this.sent = text;
    this.commit(text);
  }
  /** Blur or 500 ms of silence: the accumulated edits become one undo step. */
  settle() { this.flush(); this.clock.clearTimeout(this.checkpointTimer); this.checkpoint(); }
  discard() { this.pending = undefined; this.clock.clearTimeout(this.commitTimer); this.clock.clearTimeout(this.checkpointTimer); }
}
