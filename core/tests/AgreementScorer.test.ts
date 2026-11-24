import { describe, expect, it } from "vitest";
import { scoreAgreement, ScoringError } from "../src/scoring";
import type { Label, TaskType } from "../src/types";
import { abType } from "./helpers";

/** Builds labels for one pass from [taskId, value] pairs. */
function pass<V>(n: 1 | 2, who: string, pairs: Array<[string, V]>): Label<V>[] {
  return pairs.map(([taskId, value]) => ({
    taskId,
    labelerName: who,
    pass: n,
    value,
    createdAt: "2026-11-24T10:00:00.000Z",
  }));
}

/** Expands "AA AA AB ..." into two passes: first letter is Pass 1, second is Pass 2. */
function fromPairs(codes: string[]) {
  const p1: Array<[string, string]> = [];
  const p2: Array<[string, string]> = [];
  codes.forEach((code, i) => {
    p1.push([`t${i + 1}`, code[0]!]);
    p2.push([`t${i + 1}`, code[1]!]);
  });
  return { pass1: pass(1, "Ada", p1), pass2: pass(2, "Grace", p2) };
}

const score = (codes: string[]) =>
  scoreAgreement({ jobId: "job-1", taskType: abType, ...fromPairs(codes) });

describe("kappa worked by hand (written before the scorer)", () => {
  /**
   * Two categories, 10 tasks. Pairs are (Pass 1, Pass 2):
   *
   *   AA x5, AB x1, BA x2, BB x2
   *
   *              Pass 2 = A   Pass 2 = B   total
   *   Pass 1 = A      5            1          6
   *   Pass 1 = B      2            2          4
   *   total           7            3         10
   *
   *   observed agreement  p_o = (5 + 2) / 10                = 0.70
   *   chance agreement    p_e = 0.6*0.7 + 0.4*0.3 = 0.42+0.12 = 0.54
   *   kappa = (p_o - p_e) / (1 - p_e) = 0.16 / 0.46 = 8/23   = 0.347826...
   *
   * Both passes' marginals differ, so using only one pass's marginals gives a
   * different number (3/16 with Pass 1 only, 2/7 with Pass 2 only).
   */
  const codes = [...Array(5).fill("AA"), "AB", "BA", "BA", "BB", "BB"];

  it("gives kappa = 8/23 for the two-category example", () => {
    const r = score(codes);
    expect(r.totalDoubleLabeled).toBe(10);
    expect(r.agreedCount).toBe(7);
    expect(r.percentAgreement).toBeCloseTo(70, 10);
    expect(r.kappa).toBeCloseTo(8 / 23, 10);
    expect(r.kappa).toBeCloseTo(0.3478260869, 9);
  });

  /**
   * Three categories (A, B, T for tie), 8 tasks:
   *
   *   AA x2, AB, BB x2, BT, TT, TA
   *
   *   Pass 1 marginals: A=3, B=3, T=2      Pass 2 marginals: A=3, B=3, T=2
   *   p_o = 5/8 = 0.625   (AA, AA, BB, BB, TT)
   *   p_e = (3*3 + 3*3 + 2*2) / 64 = 22/64 = 0.34375
   *   kappa = (40/64 - 22/64) / (1 - 22/64) = 18/42 = 3/7 = 0.428571...
   */
  it("gives kappa = 3/7 for the three-category example", () => {
    const r = score(["AA", "AA", "AB", "BB", "BB", "BT", "TT", "TA"]);
    expect(r.totalDoubleLabeled).toBe(8);
    expect(r.agreedCount).toBe(5);
    expect(r.percentAgreement).toBeCloseTo(62.5, 10);
    expect(r.kappa).toBeCloseTo(3 / 7, 10);
  });
});

describe("full agreement", () => {
  it("is 100% with kappa 1 when the labelers agree on everything and used both categories", () => {
    const r = score(["AA", "BB", "AA", "BB"]);
    expect(r).toMatchObject({ totalDoubleLabeled: 4, agreedCount: 4, percentAgreement: 100 });
    expect(r.kappa).toBeCloseTo(1, 10);
    expect(r.disagreements).toEqual([]);
  });
});

describe("full disagreement", () => {
  it("is 0% with kappa -1 for a perfect swap of two balanced categories", () => {
    // p_o = 0; marginals are 0.5/0.5 on both sides so p_e = 0.5; kappa = (0 - 0.5) / 0.5 = -1
    const r = score(["AB", "BA", "AB", "BA"]);
    expect(r).toMatchObject({ totalDoubleLabeled: 4, agreedCount: 0, percentAgreement: 0 });
    expect(r.kappa).toBeCloseTo(-1, 10);
    expect(r.disagreements).toHaveLength(4);
  });
});

describe("partial agreement (FR-A1)", () => {
  it("counts agreed tasks and reports percent agreement", () => {
    const r = score(["AA", "AB", "BB", "BA"]);
    expect(r.totalDoubleLabeled).toBe(4);
    expect(r.agreedCount).toBe(2);
    expect(r.percentAgreement).toBe(50);
    expect(r.jobId).toBe("job-1");
  });
});

describe("disagreement list (FR-A3)", () => {
  it("lists each disagreeing task with both labels, in Pass 1 order", () => {
    const { pass1, pass2 } = fromPairs(["AA", "AB", "BB", "BA"]);
    const r = scoreAgreement({ jobId: "job-1", taskType: abType, pass1, pass2 });
    expect(r.disagreements.map((d) => d.taskId)).toEqual(["t2", "t4"]);
    expect(r.disagreements[0]).toEqual({ taskId: "t2", pass1: pass1[1], pass2: pass2[1] });
    expect(r.disagreements[1]?.pass1.value).toBe("B");
    expect(r.disagreements[1]?.pass2.value).toBe("A");
    expect(r.disagreements[0]?.pass1.labelerName).toBe("Ada");
    expect(r.disagreements[0]?.pass2.labelerName).toBe("Grace");
  });
});

describe("only tasks labeled in both passes count", () => {
  it("ignores tasks labeled in one pass only (for example a flagged skip)", () => {
    const pass1 = pass(1, "Ada", [["t1", "A"], ["t2", "B"], ["t3", "A"]]);
    const pass2 = pass(2, "Grace", [["t1", "A"], ["t3", "B"], ["t9", "A"]]);
    const r = scoreAgreement({ jobId: "job-1", taskType: abType, pass1, pass2 });
    expect(r.totalDoubleLabeled).toBe(2); // t1 and t3
    expect(r.agreedCount).toBe(1);
    expect(r.percentAgreement).toBe(50);
    expect(r.disagreements.map((d) => d.taskId)).toEqual(["t3"]);
  });

  it("reports nulls when nothing was labeled in both passes", () => {
    const r = scoreAgreement({
      jobId: "job-1",
      taskType: abType,
      pass1: pass(1, "Ada", [["t1", "A"]]),
      pass2: pass(2, "Grace", [["t2", "A"]]),
    });
    expect(r).toEqual({
      jobId: "job-1",
      totalDoubleLabeled: 0,
      agreedCount: 0,
      percentAgreement: null,
      kappa: null,
      disagreements: [],
    });
  });

  it("handles empty passes", () => {
    const r = scoreAgreement({ jobId: "job-1", taskType: abType, pass1: [], pass2: [] });
    expect(r.totalDoubleLabeled).toBe(0);
    expect(r.kappa).toBeNull();
  });
});

describe("kappa is undefined when only one category was used", () => {
  it("reports 100% agreement with kappa null, not a made-up number", () => {
    // Everyone said A everywhere: chance agreement is 1, so (p_o - p_e)/(1 - p_e) is 0/0.
    const r = score(["AA", "AA", "AA"]);
    expect(r.percentAgreement).toBe(100);
    expect(r.kappa).toBeNull();
  });

  it("is 0, not null, when each labeler used a single but different category", () => {
    // Pass 1 all A, Pass 2 all B: p_e = 1*0 + 0*1 = 0, p_o = 0, kappa = (0 - 0) / (1 - 0) = 0
    const r = score(["AB", "AB"]);
    expect(r.percentAgreement).toBe(0);
    expect(r.kappa).toBeCloseTo(0, 10);
  });
});

describe("agreement goes through the task type's labelsAgree (FR-A2)", () => {
  /** Ranking-like labels: agree when the top-ranked response matches. */
  const rankingType: Pick<TaskType<unknown, string[]>, "labelsAgree"> = {
    labelsAgree: (a, b) => a.value[0] === b.value[0],
  };

  it("treats rankings with the same top choice as agreeing, whatever the rest says", () => {
    const pass1 = pass<string[]>(1, "Ada", [
      ["t1", ["r1", "r2", "r3"]],
      ["t2", ["r2", "r1", "r3"]],
      ["t3", ["r3", "r1", "r2"]],
      ["t4", ["r1", "r3", "r2"]],
    ]);
    const pass2 = pass<string[]>(2, "Grace", [
      ["t1", ["r1", "r3", "r2"]], // same top, rest differs: agrees
      ["t2", ["r1", "r2", "r3"]], // different top: disagrees
      ["t3", ["r3", "r2", "r1"]], // same top: agrees
      ["t4", ["r2", "r1", "r3"]], // different top: disagrees
    ]);
    const r = scoreAgreement({ jobId: "job-1", taskType: rankingType, pass1, pass2 });
    expect(r.agreedCount).toBe(2);
    expect(r.percentAgreement).toBe(50);
    expect(r.disagreements.map((d) => d.taskId)).toEqual(["t2", "t4"]);

    // Categories are the top choices. Pass 1 tops: r1,r2,r3,r1 -> r1=2, r2=1, r3=1.
    // Pass 2 tops: r1,r1,r3,r2 -> r1=2, r2=1, r3=1. p_e = (4+1+1)/16 = 0.375, p_o = 0.5
    // kappa = (0.5 - 0.375) / 0.625 = 0.2
    expect(r.kappa).toBeCloseTo(0.2, 10);
  });

  it("uses the rule's equality, not strict equality of values", () => {
    // Case-insensitive rule: "a" and "A" are the same category.
    const caseInsensitive: Pick<TaskType<unknown, string>, "labelsAgree"> = {
      labelsAgree: (a, b) => a.value.toLowerCase() === b.value.toLowerCase(),
    };
    const r = scoreAgreement({
      jobId: "job-1",
      taskType: caseInsensitive,
      pass1: pass(1, "Ada", [["t1", "A"], ["t2", "b"]]),
      pass2: pass(2, "Grace", [["t1", "a"], ["t2", "B"]]),
    });
    expect(r.agreedCount).toBe(2);
    expect(r.kappa).toBeCloseTo(1, 10);
  });
});

describe("bad input is rejected, not scored", () => {
  it("rejects two labels for the same task in one pass", () => {
    const pass1 = pass(1, "Ada", [["t1", "A"], ["t1", "B"]]);
    expect(() => scoreAgreement({ jobId: "j", taskType: abType, pass1, pass2: [] })).toThrow(ScoringError);
    expect(() => scoreAgreement({ jobId: "j", taskType: abType, pass1, pass2: [] })).toThrow(/more than one label.*t1/);
  });

  it("rejects labels filed under the wrong pass", () => {
    const wrong = pass(2, "Ada", [["t1", "A"]]);
    expect(() => scoreAgreement({ jobId: "j", taskType: abType, pass1: wrong, pass2: [] })).toThrow(/Pass 1/);
  });

  it("rejects a labelsAgree that is not a consistent grouping", () => {
    // "Agrees" if values differ by at most 1, so 1~2 and 2~3 but not 1~3: not transitive,
    // so the labels cannot be sorted into categories. The pair (2, 3) agrees by the rule
    // but 3 lands in a different category from 2, which the scorer must catch.
    const lenient: Pick<TaskType<unknown, number>, "labelsAgree"> = {
      labelsAgree: (a, b) => Math.abs(a.value - b.value) <= 1,
    };
    const pass1 = pass(1, "Ada", [["t1", 1], ["t2", 2]]);
    const pass2 = pass(2, "Grace", [["t1", 1], ["t2", 3]]);
    expect(() => scoreAgreement({ jobId: "j", taskType: lenient, pass1, pass2 })).toThrow(/labelsAgree/);
  });
});
