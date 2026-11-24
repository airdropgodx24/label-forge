import { describe, expect, it } from "vitest";
import { scoreAgreement } from "../../../core/src/scoring";
import type { Label, TaskType } from "../../../core/src/types";
import {
  INSTRUCTION,
  isRanking,
  loadSampleTasks,
  readPayload,
  responseRankingType,
  sampleJob,
  sampleJobEntry,
} from "../src";

const label = (taskId: string, value: unknown, pass: 1 | 2 = 1): Label<string[]> => ({
  taskId,
  labelerName: pass === 1 ? "Ada" : "Grace",
  pass,
  value: value as string[],
  createdAt: "2026-11-24T10:00:00.000Z",
});

describe("the response-ranking task type (registration with the core)", () => {
  it("has the id and title from the app design", () => {
    expect(responseRankingType.id).toBe("response-ranking");
    expect(responseRankingType.title).toBe("Response Ranking");
  });

  it("carries the job's instruction line from src/instruction.ts", () => {
    expect(responseRankingType.instruction).toBe(INSTRUCTION);
    expect(INSTRUCTION).toMatch(/^Rank the responses from best to worst/);
  });

  it("fits the core's TaskType interface, so the shell and dashboard accept it", () => {
    const asCoreType: TaskType = responseRankingType; // compile-time check
    expect(typeof asCoreType.renderTask).toBe("function");
    expect(typeof asCoreType.isComplete).toBe("function");
    expect(typeof asCoreType.labelsAgree).toBe("function");
  });

  it("uses the sample job id response-ranking-sample, and the task type id the sample tasks use", () => {
    expect(sampleJob.id).toBe("response-ranking-sample");
    expect(sampleJob.name).toBe("Response Ranking sample");
    expect(sampleJob.taskTypeId).toBe(responseRankingType.id);
    expect(loadSampleTasks().every((t) => t.type === responseRankingType.id)).toBe(true);
  });

  it("bundles the job, its 25 tasks and the task type for the core", () => {
    const entry = sampleJobEntry();
    expect(entry.job).toBe(sampleJob);
    expect(entry.tasks).toHaveLength(25);
    expect(entry.tasks.every((t) => t.jobId === "response-ranking-sample")).toBe(true);
    expect(entry.taskType.id).toBe("response-ranking");
  });

  it("reads every sample task's payload", () => {
    for (const t of loadSampleTasks()) expect(readPayload(t.payload), t.id).not.toBeNull();
  });
});

describe("isComplete: a ranking of 2 to 4 distinct response ids", () => {
  it.each([
    [["r1", "r2"]],
    [["r2", "r1", "r3"]],
    [["r4", "r3", "r2", "r1"]],
  ])("%j is a finished label", (value) => {
    expect(responseRankingType.isComplete(label("t", value))).toBe(true);
    expect(isRanking(value)).toBe(true);
  });

  it.each([
    [[]], // what the screen reports while a ranking is unfinished
    [["r1"]],
    [["r1", "r1"]],
    [["r1", "r2", "r3", "r4", "r5"]],
    [["r1", ""]],
    [["r1", 2]],
    ["r1"],
    [null],
    [undefined],
    [{}],
  ])("%j is not a finished label", (value) => {
    expect(responseRankingType.isComplete(label("t", value))).toBe(false);
  });
});

describe("labelsAgree: the top-ranked response is the same (FR-A2)", () => {
  const agree = (a: unknown, b: unknown) => responseRankingType.labelsAgree(label("t", a, 1), label("t", b, 2));

  it("agrees when the top choice matches, whatever the rest of the ranking says", () => {
    expect(agree(["r1", "r2", "r3"], ["r1", "r2", "r3"])).toBe(true);
    expect(agree(["r1", "r2", "r3"], ["r1", "r3", "r2"])).toBe(true); // lower places swapped
    expect(agree(["r2", "r1", "r3", "r4"], ["r2", "r4", "r3", "r1"])).toBe(true);
  });

  it("disagrees when the top choice differs, even if the rankings are otherwise alike", () => {
    expect(agree(["r1", "r2", "r3"], ["r2", "r1", "r3"])).toBe(false); // only the top two swapped
    expect(agree(["r1", "r2"], ["r2", "r1"])).toBe(false);
    expect(agree(["r3", "r1", "r2"], ["r1", "r3", "r2"])).toBe(false);
  });

  it("does not treat two labels with no top choice as agreeing", () => {
    expect(agree([], [])).toBe(false);
    expect(agree([], ["r1", "r2"])).toBe(false);
    expect(agree(null, ["r1", "r2"])).toBe(false);
  });

  it("works with the core scorer: a hand-checked example", () => {
    // Six tasks, top choice (Pass 1, Pass 2): r1/r1, r2/r2, r3/r1, r1/r1, r2/r3, r3/r2
    // Lower places are different in every pair, which must not matter.
    // Agreed on tasks 0, 1 and 3 only: p_o = 3/6 = 0.5.
    // Pass 1 tops: r1=2, r2=2, r3=2. Pass 2 tops: r1=3, r2=2, r3=1.
    // p_e = (2*3 + 2*2 + 2*1) / 36 = 12/36 = 1/3. kappa = (0.5 - 1/3) / (2/3) = 0.25
    const p1 = [
      ["r1", "r2", "r3"], ["r2", "r1", "r3"], ["r3", "r1", "r2"],
      ["r1", "r3", "r2"], ["r2", "r3", "r1"], ["r3", "r2", "r1"],
    ];
    const p2 = [
      ["r1", "r3", "r2"], ["r2", "r3", "r1"], ["r1", "r2", "r3"],
      ["r1", "r2", "r3"], ["r3", "r1", "r2"], ["r2", "r1", "r3"],
    ];
    const report = scoreAgreement({
      jobId: sampleJob.id,
      taskType: responseRankingType,
      pass1: p1.map((v, i) => label(`t${i}`, v, 1)),
      pass2: p2.map((v, i) => label(`t${i}`, v, 2)),
    });
    expect(report.totalDoubleLabeled).toBe(6);
    expect(report.agreedCount).toBe(3);
    expect(report.percentAgreement).toBeCloseTo(50, 10);
    expect(report.kappa).toBeCloseTo(0.25, 10);
    expect(report.disagreements.map((d) => d.taskId)).toEqual(["t2", "t4", "t5"]);
  });
});

describe("readPayload", () => {
  const good = { prompt: "Rank these.", responses: [{ id: "r1", text: "a" }, { id: "r2", text: "b" }] };

  it("reads a complete payload", () => {
    expect(readPayload(good)).toEqual(good);
  });

  it("copies what it reads, so the task's own payload is never changed", () => {
    const read = readPayload(good)!;
    read.responses.reverse();
    expect(good.responses.map((r) => r.id)).toEqual(["r1", "r2"]);
  });

  it("returns null for a missing or blank prompt, a bad response list, or bad responses", () => {
    const bad: unknown[] = [
      null, undefined, "x", 3, [], {},
      { ...good, prompt: "" },
      { ...good, prompt: 4 },
      { prompt: "p" },
      { prompt: "p", responses: [] },
      { prompt: "p", responses: [good.responses[0]] },
      { prompt: "p", responses: [1, 2] },
      { prompt: "p", responses: [{ id: "r1", text: "a" }, { id: "r1", text: "b" }] },
      { prompt: "p", responses: [{ id: "", text: "a" }, { id: "r2", text: "b" }] },
      { prompt: "p", responses: [{ id: "r1", text: 5 }, { id: "r2", text: "b" }] },
    ];
    for (const b of bad) expect(readPayload(b), JSON.stringify(b)).toBeNull();
  });
});
