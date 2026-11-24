import type { Job, Task, TaskType } from "../../../core/src/types";
import { loadTasks } from "../../../core/src/queue";
import sampleTasksJson from "../data/sample-tasks.json";
import { responseRankingType } from "./responseRankingType";

export { AGREEMENT_NOTE, ResponseRankingScreen } from "./ResponseRankingScreen";
export { INSTRUCTION } from "./instruction";
export { MAX_RESPONSES, MIN_RESPONSES, isRanking, readPayload } from "./payload";
export type { RankingResponse, ResponseRankingPayload, ResponseRankingValue } from "./payload";
export { dropCard, initialState, isComplete, moveCard, pressNumber, valueOf } from "./ranking";
export type { RankState } from "./ranking";
export { responseRankingType } from "./responseRankingType";

/** The bundled sample job (FR-D1): 25 prompts with 2 to 4 responses each. */
export const sampleJob: Job = {
  id: "response-ranking-sample",
  name: "Response Ranking sample",
  taskTypeId: responseRankingType.id,
  createdAt: "2026-11-24T00:00:00.000Z",
};

/** Loads the sample tasks through the core task loader. */
export function loadSampleTasks(): Task[] {
  return loadTasks(sampleTasksJson, sampleJob.id);
}

/** Everything the core needs to serve the sample job: pass it to LabelShell, or to JobDashboard as an entry. */
export function sampleJobEntry(): { job: Job; tasks: Task[]; taskType: TaskType } {
  return { job: sampleJob, tasks: loadSampleTasks(), taskType: responseRankingType as TaskType };
}
