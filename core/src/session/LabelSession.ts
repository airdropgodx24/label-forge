import { TaskQueue } from "../queue";
import type { Job, Label, Pass, Task, TaskType } from "../types";
import {
  SavedSessionError,
  checkSetup,
  loadSaved,
  normalizeName,
  saveSession,
} from "./savedSession";
import type { KeyValueStore } from "./storage";

export interface SessionOptions {
  job: Job;
  tasks: readonly Task[];
  taskType: TaskType;
  pass: Pass;
  labelerName: string;
  store: KeyValueStore;
  /** Clock, injectable for tests. */
  now?: () => Date;
}

export interface Progress {
  total: number;
  /** Tasks with a submitted label (labeled or done). */
  labeled: number;
  /** Tasks skipped twice and flagged. They will not come back. */
  flagged: number;
  /** Tasks still to serve, including the current one. */
  remaining: number;
  /** labeled + flagged: tasks the labeler is finished with. */
  handled: number;
  /** 1-based number of the task on screen; equals total once finished. */
  position: number;
  /** handled / total, from 0 to 1. */
  fraction: number;
}

/** Immutable snapshot of what the UI needs. A new object is made after every change. */
export interface SessionView {
  task: Task | undefined;
  progress: Progress;
  canSubmit: boolean;
  finished: boolean;
  labelerName: string;
  pass: Pass;
}

export type SubmitResult = { ok: true } | { ok: false; reason: "no-task" | "incomplete" };
export type SkipResult = { ok: true; flagged: boolean } | { ok: false; reason: "no-task" };

/**
 * One labeler's run through one job and pass (FR-S3, FR-S4).
 *
 * Framework-free: it owns the TaskQueue, the labels, the unsaved draft, and
 * persistence. `useLabelSession` is a thin React wrapper around it.
 *
 * Persistence: after every change the queue snapshot and the labels are
 * written under one key per job and pass. A label is written while its task
 * is `labeled`, and the task moves to `done` only after that write succeeds.
 */
export class LabelSession {
  private queue: TaskQueue;
  private readonly labels = new Map<string, Label>();
  private draft: { value: unknown } | undefined;
  private view: SessionView;
  private readonly listeners = new Set<() => void>();
  private readonly labelerName: string;
  private readonly now: () => Date;

  private constructor(
    private readonly opts: SessionOptions,
    queue: TaskQueue,
  ) {
    this.queue = queue;
    this.labelerName = normalizeName(opts.labelerName);
    this.now = opts.now ?? (() => new Date());
    this.view = this.buildView();
  }

  /**
   * Opens the session, resuming from local storage if this job and pass were
   * started before. Throws if the name or pass is not allowed, or if the saved
   * state cannot be used with these tasks (nothing is overwritten in that case).
   */
  static open(opts: SessionOptions): LabelSession {
    const { job, tasks, pass, store } = opts;
    const problem = checkSetup({ store, jobId: job.id, pass, labelerName: opts.labelerName });
    if (problem) throw new Error(problem);

    const saved = loadSaved(store, job.id, pass);
    let queue: TaskQueue;
    const labels: Label[] = [];

    if (saved) {
      try {
        queue = TaskQueue.restore(tasks, saved.queue);
      } catch (err) {
        throw new SavedSessionError(
          `Saved progress for ${job.name}, Pass ${pass} does not match its task file: ${(err as Error).message}`,
        );
      }
      const known = new Set(tasks.map((t) => t.id));
      for (const label of saved.labels) {
        if (!known.has(label.taskId)) {
          throw new SavedSessionError(`Saved label refers to unknown task "${label.taskId}"`);
        }
        labels.push(label);
      }
    } else {
      queue = new TaskQueue(tasks);
    }

    // Continuing a pass keeps the name exactly as first saved, so labels never mix spellings.
    const labelerName = saved && saved.labels.length > 0 ? saved.labelerName : opts.labelerName;
    const session = new LabelSession({ ...opts, labelerName }, queue);
    for (const label of labels) session.labels.set(label.taskId, label);
    session.recoverLabeled();
    session.queue.next();
    session.persist();
    session.refresh();
    return session;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  getView = (): SessionView => this.view;

  /** This labeler's labels so far, in the order they were submitted. */
  getLabels(): Label[] {
    return [...this.labels.values()];
  }

  /** Called by the task screen whenever the labeler changes their answer. */
  setDraft(value: unknown): void {
    if (!this.queue.current()) return;
    this.draft = { value };
    this.refresh();
  }

  /**
   * Stores the draft as a label, marks the task done, and serves the next one.
   * Returns `incomplete` (nothing changes) if the task type says the label is not finished.
   * Throws if storage fails; the queue is rolled back so nothing is half saved.
   */
  submit(): SubmitResult {
    const task = this.queue.current();
    if (!task) return { ok: false, reason: "no-task" };
    const label = this.draftLabel(task);
    if (!label || !this.opts.taskType.isComplete(label)) return { ok: false, reason: "incomplete" };

    const before = this.queue.snapshot();
    try {
      this.queue.submit(task.id); // in_progress -> labeled
      this.labels.set(task.id, label);
      this.persist(); // the label is stored while the task is still "labeled"
    } catch (err) {
      this.queue = TaskQueue.restore(this.opts.tasks, before);
      this.labels.delete(task.id);
      throw err;
    }

    this.queue.markDone(task.id); // labeled -> done, now that the label is stored
    this.draft = undefined;
    this.queue.next();
    this.refresh();
    // If this second write fails the label is already safe and open() will
    // finish the labeled -> done step on the next load.
    this.persist();
    return { ok: true };
  }

  /**
   * Skips the current task. The first skip sends it to the end of the queue;
   * a second skip flags it for good (FR-Q3).
   */
  skip(): SkipResult {
    const task = this.queue.current();
    if (!task) return { ok: false, reason: "no-task" };

    const before = this.queue.snapshot();
    try {
      this.queue.skip(task.id);
      const flagged = this.queue.isFlagged(task.id);
      this.queue.next();
      this.persist();
      this.draft = undefined;
      this.refresh();
      return { ok: true, flagged };
    } catch (err) {
      this.queue = TaskQueue.restore(this.opts.tasks, before);
      throw err;
    }
  }

  private draftLabel(task: Task): Label | undefined {
    if (!this.draft) return undefined;
    return {
      taskId: task.id,
      labelerName: this.labelerName,
      pass: this.opts.pass,
      value: this.draft.value,
      createdAt: this.now().toISOString(),
    };
  }

  /** A task saved as "labeled" has its label stored; finish the move to "done". */
  private recoverLabeled(): void {
    for (const task of this.opts.tasks) {
      if (this.queue.state(task.id) !== "labeled") continue;
      if (!this.labels.has(task.id)) {
        throw new SavedSessionError(`Task "${task.id}" is labeled but has no stored label`);
      }
      this.queue.markDone(task.id);
    }
  }

  private persist(): void {
    saveSession(this.opts.store, this.opts.job.id, this.opts.pass, {
      version: 1,
      labelerName: this.labelerName,
      queue: this.queue.snapshot(),
      labels: this.getLabels(),
    });
  }

  private refresh(): void {
    this.view = this.buildView();
    for (const listener of this.listeners) listener();
  }

  private buildView(): SessionView {
    const task = this.queue.current();
    const counts = this.queue.counts();
    const total = this.queue.size;
    const labeled = counts.labeled + counts.done;
    const flagged = counts.skipped;
    const handled = labeled + flagged;
    const draft = task ? this.draftLabel(task) : undefined;

    return {
      task,
      progress: {
        total,
        labeled,
        flagged,
        remaining: counts.pending + counts.in_progress,
        handled,
        position: Math.min(handled + 1, total),
        fraction: total === 0 ? 1 : handled / total,
      },
      canSubmit: draft !== undefined && this.opts.taskType.isComplete(draft),
      finished: this.queue.isFinished(),
      labelerName: this.labelerName,
      pass: this.opts.pass,
    };
  }
}
