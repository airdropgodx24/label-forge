/** Types for build-sample-data.mjs, so the data tests can import it. */
export interface RankingResponse {
  id: string;
  text: string;
}
export interface RankingTask {
  id: string;
  type: "response-ranking";
  payload: { prompt: string; responses: RankingResponse[] };
}
export interface IntendedRanking {
  id: string;
  /** What the task is testing, such as "support reply" or "code help". */
  kind: string;
  /** Response ids from best to worst, as the author meant them. */
  ranking: string[];
  /** Why a careful labeler could reasonably put the runner-up first. Present only on close calls. */
  closeCall?: string;
}
export function buildTasks(): { tasks: RankingTask[]; intended: IntendedRanking[] };
