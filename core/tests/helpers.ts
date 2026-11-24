import type { Job, Label, Task, TaskType } from "../src/types";

export const job: Job = { id: "job-1", name: "Sample job", taskTypeId: "test", createdAt: "2026-11-24T09:00:00.000Z" };

export function makeTasks(...ids: string[]): Task[] {
  return ids.map((id) => ({ id, jobId: job.id, type: "test", payload: { n: id } }));
}

/** A trivial task type: the label is "A" or "B"; anything else is unfinished. No UI. */
export const abType: TaskType<{ n: string }, string> = {
  id: "test",
  title: "Test labeling",
  instruction: "Pick A or B.",
  renderTask: () => null,
  isComplete: (label: Label<string>) => label.value === "A" || label.value === "B",
  labelsAgree: (a, b) => a.value === b.value,
};

export const fixedClock = () => new Date("2026-11-24T10:00:00.000Z");
