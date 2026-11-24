/**
 * Shared types for the LabelForge core.
 *
 * The core never knows what it is labeling: `payload` and label `value` are
 * generic and only the task type (supplied by an app) gives them a shape.
 */

/** A labeling job: one set of tasks, run with one task type. */
export interface Job {
  id: string;
  name: string;
  taskTypeId: string;
  createdAt: string; // ISO 8601
}

/** One unit of work. `type` is the id of the TaskType that renders it. */
export interface Task<P = unknown> {
  id: string;
  jobId: string;
  type: string;
  payload: P;
}

/** The labeling pass: Pass 1 is the first labeler, Pass 2 the quality checker. */
export type Pass = 1 | 2;

/** One labeler's answer for one task. */
export interface Label<V = unknown> {
  taskId: string;
  labelerName: string;
  pass: Pass;
  value: V;
  createdAt: string; // ISO 8601
}

/**
 * Where a task is in the queue (FR-Q2).
 *
 * - pending:     waiting to be served
 * - in_progress: served to the labeler, no answer yet
 * - labeled:     a label was submitted
 * - skipped:     skipped; only stays here once flagged (skipped a second time)
 * - done:        the label is committed; final
 */
export type TaskState = "pending" | "in_progress" | "labeled" | "skipped" | "done";

/** Events that move a task between states. */
export type TaskEvent = "start" | "submit" | "skip" | "requeue" | "complete";

/**
 * The app-specific labeling area. The core only passes it through, so it is
 * opaque here. T2.2 (LabelShell) narrows it to the UI framework's element type.
 */
export type Screen = unknown;

/**
 * The plugin interface an app registers with the core. Kept tiny on purpose:
 * the core owns loading, queue, shell, storage, scoring and export; the app
 * owns how a task looks, what a finished label is, and when two labels agree.
 */
export interface TaskType<P = unknown, V = unknown> {
  id: string; // "image-preference" or "response-ranking"
  title: string; // shown in the shell header
  instruction: string; // the labeling instruction line
  renderTask(task: Task<P>, onChange: (value: V) => void): Screen;
  isComplete(label: Label<V>): boolean;
  labelsAgree(a: Label<V>, b: Label<V>): boolean;
}
