import type { Label, TaskType } from "../types";

/** A task the two labelers labeled differently, with both labels side by side (FR-A3). */
export interface Disagreement<V = unknown> {
  taskId: string;
  pass1: Label<V>;
  pass2: Label<V>;
}

export interface AgreementReport<V = unknown> {
  jobId: string;
  /** Tasks with a label in both passes. Only these are scored. */
  totalDoubleLabeled: number;
  agreedCount: number;
  /** 0 to 100. Null when no task was labeled in both passes. */
  percentAgreement: number | null;
  /**
   * Cohen's kappa, from -1 to 1. Null when it is undefined: no double-labeled
   * tasks, or every label fell in one category (chance agreement is 1, so the
   * formula divides 0 by 0).
   */
  kappa: number | null;
  /** In Pass 1 submission order. */
  disagreements: Disagreement<V>[];
}

export class ScoringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScoringError";
  }
}

export interface ScoreInput<V> {
  jobId: string;
  /** Only the app's agreement rule is used. */
  taskType: Pick<TaskType<unknown, V>, "labelsAgree">;
  pass1: readonly Label<V>[];
  pass2: readonly Label<V>[];
}

function indexByTask<V>(labels: readonly Label<V>[], pass: 1 | 2): Map<string, Label<V>> {
  const byTask = new Map<string, Label<V>>();
  for (const label of labels) {
    if (label.pass !== pass) {
      throw new ScoringError(`Label for task "${label.taskId}" is from Pass ${label.pass} but was given as Pass ${pass}`);
    }
    if (byTask.has(label.taskId)) {
      throw new ScoringError(`Pass ${pass} has more than one label for task "${label.taskId}"`);
    }
    byTask.set(label.taskId, label);
  }
  return byTask;
}

/**
 * Scores agreement between two passes (FR-A1 to FR-A3).
 *
 * - Percent agreement is the share of double-labeled tasks where
 *   `taskType.labelsAgree` says the two labels agree.
 * - Cohen's kappa is (p_o - p_e) / (1 - p_e), where p_o is that same share and
 *   p_e is the agreement expected by chance from each pass's category totals.
 *
 * `labelsAgree` is a yes/no rule, so categories are not given. They are found
 * by grouping the labels: a label joins the first group whose first member it
 * agrees with. That is only meaningful if the rule behaves like equality
 * (agreement is a grouping: Image Preference compares values, Response Ranking
 * compares the top choice). The grouping is checked against every pair, and a
 * rule that contradicts it throws instead of producing a misleading kappa.
 */
export function scoreAgreement<V>(input: ScoreInput<V>): AgreementReport<V> {
  const { jobId, taskType } = input;
  const first = indexByTask(input.pass1, 1);
  const second = indexByTask(input.pass2, 2);

  // Pairs in Pass 1 order, only for tasks labeled in both passes.
  const pairs: Array<[Label<V>, Label<V>]> = [];
  for (const [taskId, a] of first) {
    const b = second.get(taskId);
    if (b) pairs.push([a, b]);
  }

  const n = pairs.length;
  const representatives: Label<V>[] = [];
  const classOf = (label: Label<V>): number => {
    const found = representatives.findIndex((rep) => taskType.labelsAgree(label, rep));
    if (found !== -1) return found;
    representatives.push(label);
    return representatives.length - 1;
  };

  const disagreements: Disagreement<V>[] = [];
  const counts1: number[] = [];
  const counts2: number[] = [];
  let agreedCount = 0;

  for (const [a, b] of pairs) {
    const classA = classOf(a);
    const classB = classOf(b);
    counts1[classA] = (counts1[classA] ?? 0) + 1;
    counts2[classB] = (counts2[classB] ?? 0) + 1;

    const agree = taskType.labelsAgree(a, b);
    if (agree !== (classA === classB)) {
      throw new ScoringError(
        `labelsAgree is not a consistent grouping for task "${a.taskId}": it says the two labels ` +
          `${agree ? "agree" : "differ"} but they fall in ${classA === classB ? "the same" : "different"} categories`,
      );
    }
    if (agree) agreedCount++;
    else disagreements.push({ taskId: a.taskId, pass1: a, pass2: b });
  }

  if (n === 0) {
    return { jobId, totalDoubleLabeled: 0, agreedCount: 0, percentAgreement: null, kappa: null, disagreements };
  }

  const observed = agreedCount / n;
  // Chance agreement = sum over categories of (share in Pass 1) * (share in Pass 2).
  // Kept as an integer ratio so "everything is one category" is detected exactly.
  let crossProducts = 0;
  for (let k = 0; k < representatives.length; k++) {
    crossProducts += (counts1[k] ?? 0) * (counts2[k] ?? 0);
  }
  const kappa =
    crossProducts === n * n ? null : (observed - crossProducts / (n * n)) / (1 - crossProducts / (n * n));

  return {
    jobId,
    totalDoubleLabeled: n,
    agreedCount,
    percentAgreement: observed * 100,
    kappa,
    disagreements,
  };
}
