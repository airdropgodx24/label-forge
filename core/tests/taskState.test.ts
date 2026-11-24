import { describe, expect, it } from "vitest";
import { TASK_STATES, nextState } from "../src/queue/taskState";
import type { TaskEvent, TaskState } from "../src/types";

const EVENTS: TaskEvent[] = ["start", "submit", "skip", "requeue", "complete"];

/** Every legal transition. Anything not listed here must be rejected. */
const LEGAL: Array<[TaskState, TaskEvent, TaskState]> = [
  ["pending", "start", "in_progress"],
  ["in_progress", "submit", "labeled"],
  ["in_progress", "skip", "skipped"],
  ["skipped", "requeue", "pending"],
  ["labeled", "complete", "done"],
];

describe("task state machine table", () => {
  it.each(LEGAL)("%s --%s--> %s", (from, event, to) => {
    expect(nextState(from, event)).toBe(to);
  });

  it("rejects every transition not in the legal list", () => {
    for (const from of TASK_STATES) {
      for (const event of EVENTS) {
        const legal = LEGAL.some(([f, e]) => f === from && e === event);
        if (!legal) {
          expect(nextState(from, event), `${from} --${event}-->`).toBeUndefined();
        }
      }
    }
  });

  it("treats done as terminal", () => {
    for (const event of EVENTS) {
      expect(nextState("done", event)).toBeUndefined();
    }
  });
});
