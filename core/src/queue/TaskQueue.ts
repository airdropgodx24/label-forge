import type { Task, TaskEvent, TaskState } from "../types";
import { InvalidTransitionError, TASK_STATES, isTaskState, nextState } from "./taskState";

/** Plain-data form of the queue, for the session to persist (FR-Q2). */
export interface QueueSnapshot {
  /** Task ids in serving order. Re-queued tasks sit at the end. */
  order: string[];
  entries: Record<string, { state: TaskState; skipCount: number }>;
}

interface Entry {
  task: Task;
  state: TaskState;
  skipCount: number;
}

/**
 * Serves tasks one at a time in file order and tracks each task's state.
 *
 * Skip rule (FR-Q3): the first skip sends the task to the end of the queue as
 * pending again. A second skip leaves it in `skipped`, flagged, and it is not
 * served again.
 */
export class TaskQueue {
  private readonly entries = new Map<string, Entry>();
  private order: string[];

  constructor(tasks: readonly Task[]) {
    for (const task of tasks) {
      if (this.entries.has(task.id)) {
        throw new Error(`Duplicate task id "${task.id}"`);
      }
      this.entries.set(task.id, { task, state: "pending", skipCount: 0 });
    }
    this.order = tasks.map((t) => t.id);
  }

  /** Rebuilds a queue from the same tasks plus a saved snapshot, so a reload resumes in place. */
  static restore(tasks: readonly Task[], snapshot: QueueSnapshot): TaskQueue {
    const queue = new TaskQueue(tasks);
    const ids = new Set(queue.entries.keys());

    const sameIds =
      snapshot.order.length === ids.size &&
      new Set(snapshot.order).size === ids.size &&
      snapshot.order.every((id) => ids.has(id));
    if (!sameIds) {
      throw new Error("Snapshot does not match the task set");
    }

    let inProgress = 0;
    for (const id of ids) {
      const saved = snapshot.entries[id];
      if (!saved || !isTaskState(saved.state) || !Number.isInteger(saved.skipCount) || saved.skipCount < 0) {
        throw new Error(`Snapshot entry for task "${id}" is invalid`);
      }
      if (saved.state === "in_progress") inProgress++;
      const entry = queue.entries.get(id)!;
      entry.state = saved.state;
      entry.skipCount = saved.skipCount;
    }
    if (inProgress > 1) {
      throw new Error("Snapshot has more than one in-progress task");
    }

    queue.order = [...snapshot.order];
    return queue;
  }

  snapshot(): QueueSnapshot {
    const entries: QueueSnapshot["entries"] = {};
    for (const [id, e] of this.entries) {
      entries[id] = { state: e.state, skipCount: e.skipCount };
    }
    return { order: [...this.order], entries };
  }

  get size(): number {
    return this.entries.size;
  }

  /** The task currently served to the labeler, if any. */
  current(): Task | undefined {
    for (const e of this.entries.values()) {
      if (e.state === "in_progress") return e.task;
    }
    return undefined;
  }

  /**
   * Serves the next task: the current one if a task is already in progress
   * (so a reload resumes it), otherwise the first pending task in order.
   * Returns undefined when nothing is left to serve.
   */
  next(): Task | undefined {
    const current = this.current();
    if (current) return current;

    for (const id of this.order) {
      const entry = this.entries.get(id)!;
      if (entry.state === "pending") {
        this.apply(entry, "start");
        return entry.task;
      }
    }
    return undefined;
  }

  /** in_progress -> labeled. */
  submit(taskId: string): void {
    this.apply(this.entry(taskId), "submit");
  }

  /** labeled -> done. Called once the label is safely stored. */
  markDone(taskId: string): void {
    this.apply(this.entry(taskId), "complete");
  }

  /**
   * in_progress -> skipped. On the first skip the task is re-queued at the end
   * (skipped -> pending). On a second skip it stays skipped and flagged.
   */
  skip(taskId: string): void {
    const entry = this.entry(taskId);
    this.apply(entry, "skip");
    entry.skipCount++;

    if (entry.skipCount === 1) {
      this.apply(entry, "requeue");
      this.order = this.order.filter((id) => id !== taskId);
      this.order.push(taskId);
    }
  }

  state(taskId: string): TaskState {
    return this.entry(taskId).state;
  }

  skipCount(taskId: string): number {
    return this.entry(taskId).skipCount;
  }

  /** True once a task has been skipped a second time and will not come back. */
  isFlagged(taskId: string): boolean {
    const e = this.entry(taskId);
    return e.state === "skipped" && e.skipCount >= 2;
  }

  /** Task counts per state, for progress display. */
  counts(): Record<TaskState, number> {
    const counts = Object.fromEntries(TASK_STATES.map((s) => [s, 0])) as Record<TaskState, number>;
    for (const e of this.entries.values()) counts[e.state]++;
    return counts;
  }

  /** True when no task is pending or in progress. Flagged skips do not hold the queue open. */
  isFinished(): boolean {
    const c = this.counts();
    return c.pending === 0 && c.in_progress === 0;
  }

  private entry(taskId: string): Entry {
    const entry = this.entries.get(taskId);
    if (!entry) throw new Error(`Unknown task id "${taskId}"`);
    return entry;
  }

  private apply(entry: Entry, event: TaskEvent): void {
    const to = nextState(entry.state, event);
    if (to === undefined) {
      throw new InvalidTransitionError(entry.task.id, entry.state, event);
    }
    entry.state = to;
  }
}
