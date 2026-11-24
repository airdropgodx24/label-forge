import type { TaskEvent, TaskState } from "../types";

/**
 * The task state machine as a plain transition table.
 *
 *   pending ──start──▶ in_progress ──submit──▶ labeled ──complete──▶ done
 *      ▲                    │
 *      │                  skip
 *      │                    ▼
 *      └────requeue──── skipped   (no requeue the second time: stays flagged)
 *
 * `requeue` being allowed here is not enough on its own: the queue only
 * requeues a task whose skip count is 1 (FR-Q3).
 */
const TRANSITIONS: Record<TaskState, Partial<Record<TaskEvent, TaskState>>> = {
  pending: { start: "in_progress" },
  in_progress: { submit: "labeled", skip: "skipped" },
  labeled: { complete: "done" },
  skipped: { requeue: "pending" },
  done: {},
};

export const TASK_STATES: readonly TaskState[] = [
  "pending",
  "in_progress",
  "labeled",
  "skipped",
  "done",
];

export class InvalidTransitionError extends Error {
  constructor(
    readonly taskId: string,
    readonly from: TaskState,
    readonly event: TaskEvent,
  ) {
    super(`Task "${taskId}": cannot "${event}" from state "${from}"`);
    this.name = "InvalidTransitionError";
  }
}

/** Returns the next state, or undefined if the event is not allowed from `from`. */
export function nextState(from: TaskState, event: TaskEvent): TaskState | undefined {
  return TRANSITIONS[from][event];
}

export function isTaskState(value: unknown): value is TaskState {
  return typeof value === "string" && (TASK_STATES as readonly string[]).includes(value);
}
