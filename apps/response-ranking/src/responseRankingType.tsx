import type { Label, TaskType } from "../../../core/src/types";
import { INSTRUCTION } from "./instruction";
import { ResponseRankingScreen } from "./ResponseRankingScreen";
import { isRanking, type ResponseRankingPayload, type ResponseRankingValue } from "./payload";

/** The top-ranked response id, or null when the label holds no ranking. */
function topChoice(label: Label<ResponseRankingValue>): string | null {
  const value = label.value;
  return Array.isArray(value) && typeof value[0] === "string" ? value[0] : null;
}

/**
 * The Response Ranking task type. An app plugs into the core with exactly
 * this: an id, a title, an instruction, a screen, and two small rules.
 *
 * - isComplete: the label is a ranking (2 to 4 distinct response ids). The
 *   screen reports a ranking only once every response is placed.
 * - labelsAgree: the top-ranked response is the same in both labels. This is a
 *   deliberate simplification that keeps kappa meaningful for rankings, and the
 *   screen says so to the labeler.
 */
export const responseRankingType: TaskType<ResponseRankingPayload, ResponseRankingValue> = {
  id: "response-ranking",
  title: "Response Ranking",
  instruction: INSTRUCTION,
  renderTask: (task, onChange) => <ResponseRankingScreen task={task} onChange={onChange} />,
  isComplete: (label) => isRanking(label.value),
  labelsAgree: (a, b) => {
    const top = topChoice(a);
    return top !== null && top === topChoice(b);
  },
};
