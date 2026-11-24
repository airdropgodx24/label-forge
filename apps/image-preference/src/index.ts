import type { Job, Task, TaskType } from "../../../core/src/types";
import { loadTasks } from "../../../core/src/queue";
import sampleTasksJson from "../data/sample-tasks.json";
import { imagePreferenceType } from "./imagePreferenceType";

export { ImagePreferenceScreen } from "./ImagePreferenceScreen";
export { createImagePreferenceType, imagePreferenceType } from "./imagePreferenceType";
export type { ImagePreferenceOptions } from "./imagePreferenceType";
export { DEFAULT_INSTRUCTION, PICKS, isPick, readPayload, resolveImageSrc } from "./payload";
export type { ImagePreferencePayload, ImagePreferenceValue } from "./payload";

/** The bundled sample job (FR-D1): 25 image pairs. */
export const sampleJob: Job = {
  id: "image-preference-sample",
  name: "Image Preference sample",
  taskTypeId: imagePreferenceType.id,
  createdAt: "2026-11-24T00:00:00.000Z",
};

/** Loads the sample tasks through the core task loader. */
export function loadSampleTasks(): Task[] {
  return loadTasks(sampleTasksJson, sampleJob.id);
}

/** Everything the core needs to serve the sample job: pass it to LabelShell, or to JobDashboard as an entry. */
export function sampleJobEntry(): { job: Job; tasks: Task[]; taskType: TaskType } {
  return { job: sampleJob, tasks: loadSampleTasks(), taskType: imagePreferenceType as TaskType };
}
