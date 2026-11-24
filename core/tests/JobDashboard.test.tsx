// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ExportFile } from "../src/export";
import type { AgreementReport } from "../src/scoring";
import {
  JobDashboard,
  LabelSession,
  describeAgreement,
  formatLabel,
  kappaBand,
  memoryStore,
  storageKey,
  type DashboardJob,
  type KeyValueStore,
} from "../src/session";
import type { Job, Label, Pass, TaskType } from "../src/types";
import { dummyType } from "./dummyTaskType";
import { fixedClock, job, makeTasks } from "./helpers";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const tasks = makeTasks("t1", "t2", "t3", "t4");
const entry: DashboardJob = { job, tasks, taskType: dummyType as TaskType };

/** Labels through a real session, headless. "skip" skips the current task. */
function run(store: KeyValueStore, pass: Pass, name: string, steps: Array<"A" | "B" | "skip">, e = entry) {
  const s = LabelSession.open({ job: e.job, tasks: e.tasks, taskType: e.taskType, pass, labelerName: name, store, now: fixedClock });
  for (const step of steps) {
    if (step === "skip") s.skip();
    else {
      s.setDraft(step);
      s.submit();
    }
  }
}

function show(jobs: DashboardJob[], store: KeyValueStore) {
  const files: ExportFile[] = [];
  act(() => root.render(<JobDashboard jobs={jobs} store={store} onDownload={(f) => files.push(f)} />));
  return files;
}
const q = (sel: string, from: ParentNode = container) => from.querySelector(sel) as HTMLElement;
const text = (sel: string, from: ParentNode = container) => q(sel, from)?.textContent ?? "";
const button = (label: string) =>
  [...container.querySelectorAll("button")].find((b) => b.textContent === label) as HTMLButtonElement;

describe("kappaBand: how kappa is usually read", () => {
  it.each([
    [-0.3, "less than chance agreement"],
    [-0.001, "slight agreement"], // shows as 0.00
    [0, "slight agreement"],
    [0.2, "slight agreement"],
    [0.21, "fair agreement"],
    [0.4, "fair agreement"],
    [0.41, "moderate agreement"],
    [0.6, "moderate agreement"],
    [0.604, "moderate agreement"], // shows as 0.60, so it reads as 0.60 does
    [0.61, "substantial agreement"],
    [0.71, "substantial agreement"],
    [0.8, "substantial agreement"],
    [0.81, "almost perfect agreement"],
    [1, "almost perfect agreement"],
  ])("%s is %s", (kappa, words) => {
    expect(kappaBand(kappa)).toBe(words);
  });
});

describe("describeAgreement: the one-line reading (FR-A4)", () => {
  const report = (over: Partial<AgreementReport>): AgreementReport => ({
    jobId: "j",
    totalDoubleLabeled: 100,
    agreedCount: 86,
    percentAgreement: 86,
    kappa: 0.71,
    disagreements: [],
    ...over,
  });
  const has = { labels: [{} as Label] };
  const none = { labels: [] };

  it("gives the sentence from the requirements for 86 of 100 and kappa 0.71", () => {
    expect(describeAgreement(has, has, report({}))).toBe(
      "Labelers agreed on 86 of 100 tasks. Kappa 0.71, usually read as substantial agreement.",
    );
  });

  it("rounds kappa to two places and says 'task' for one", () => {
    expect(describeAgreement(has, has, report({ totalDoubleLabeled: 1, agreedCount: 1, kappa: 1 }))).toBe(
      "Labelers agreed on 1 of 1 task. Kappa 1.00, usually read as almost perfect agreement.",
    );
    expect(describeAgreement(has, has, report({ kappa: 0.3478260869 }))).toContain("Kappa 0.35, usually read as fair agreement.");
  });

  it("says so when kappa is undefined", () => {
    expect(describeAgreement(has, has, report({ kappa: null }))).toBe(
      "Labelers agreed on 86 of 100 tasks. Kappa is not defined because every label fell in one category.",
    );
  });

  it("explains why there is no score yet", () => {
    expect(describeAgreement(null, null, null)).toBe("No labels yet, so there is no agreement score.");
    expect(describeAgreement(none, none, null)).toBe("No labels yet, so there is no agreement score.");
    expect(describeAgreement(has, null, null)).toBe("Agreement needs both passes. Pass 2 has no labels yet.");
    expect(describeAgreement(null, has, null)).toBe("Agreement needs both passes. Pass 1 has no labels yet.");
    expect(describeAgreement(has, has, report({ totalDoubleLabeled: 0, agreedCount: 0, kappa: null }))).toBe(
      "No task has been labeled in both passes yet.",
    );
  });
});

describe("formatLabel", () => {
  it("shows text as is, rankings best to worst, and other values as JSON", () => {
    expect(formatLabel("A")).toBe("A");
    expect(formatLabel(["r2", "r1", "r3"])).toBe("r2 > r1 > r3");
    expect(formatLabel(3)).toBe("3");
    expect(formatLabel({ a: 1 })).toBe('{"a":1}');
    expect(formatLabel(null)).toBe("");
  });
});

describe("JobDashboard", () => {
  it("says so when there are no jobs", () => {
    show([], memoryStore());
    expect(text(".lf-dashboard-empty")).toBe("No jobs yet.");
  });

  it("shows a job that has not been started, with every download disabled", () => {
    show([entry], memoryStore());
    expect(text("h2")).toBe("Sample job");
    expect(text(".lf-tasktype")).toBe("Dummy labeling");
    expect([...container.querySelectorAll(".lf-pass-text")].map((e) => e.textContent)).toEqual([
      "Pass 1: not started.",
      "Pass 2: not started.",
    ]);
    expect(text(".lf-agreement")).toBe("No labels yet, so there is no agreement score.");
    expect(container.querySelector(".lf-scores")).toBeNull();
    for (const b of container.querySelectorAll("button")) expect((b as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows progress for Pass 1 alone and allows the label downloads only", () => {
    const store = memoryStore();
    run(store, 1, "Ada", ["A", "B"]); // t1, t2 labeled; t3 in progress
    show([entry], store);

    expect(text(".lf-pass-text")).toBe("Pass 1 (Ada): 2 of 4 labeled, 2 to go.");
    expect((q(".lf-pass .lf-progress") as HTMLProgressElement).value).toBe(2);
    expect((q(".lf-pass .lf-progress") as HTMLProgressElement).max).toBe(4);
    expect(text(".lf-agreement")).toBe("Agreement needs both passes. Pass 2 has no labels yet.");
    expect(button("Download labels (JSONL)").disabled).toBe(false);
    expect(button("Download labels (CSV)").disabled).toBe(false);
    expect(button("Download agreement (JSON)").disabled).toBe(true);
    expect(button("Download agreement (CSV)").disabled).toBe(true);
  });

  it("shows both scores, the reading and the disagreement list for two passes", () => {
    // t1 A/A agree, t2 B/A disagree, t3 A/A agree, t4 A/B disagree: 2 of 4, 50%.
    // Pass 1 A=3 B=1; Pass 2 A=3 B=1; p_e = (3*3 + 1*1)/16 = 0.625; kappa = (0.5-0.625)/0.375 = -1/3.
    const store = memoryStore();
    run(store, 1, "Ada", ["A", "B", "A", "A"]);
    run(store, 2, "Grace", ["A", "A", "A", "B"]);
    show([entry], store);

    expect([...container.querySelectorAll(".lf-pass-text")].map((e) => e.textContent)).toEqual([
      "Pass 1 (Ada): 4 of 4 labeled.",
      "Pass 2 (Grace): 4 of 4 labeled.",
    ]);
    expect(text(".lf-agreement")).toBe(
      "Labelers agreed on 2 of 4 tasks. Kappa -0.33, usually read as less than chance agreement.",
    );
    expect(text(".lf-percent")).toBe("50%");
    expect(text(".lf-kappa")).toBe("-0.33");
    expect(text("caption")).toBe("Disagreements (2)");
    expect([...container.querySelectorAll("thead th")].map((e) => e.textContent)).toEqual([
      "Task",
      "Pass 1 (Ada)",
      "Pass 2 (Grace)",
    ]);
    expect([...container.querySelectorAll("tbody tr")].map((tr) => [...tr.children].map((c) => c.textContent))).toEqual([
      ["t2", "B", "A"],
      ["t4", "A", "B"],
    ]);
    for (const b of container.querySelectorAll("button")) expect((b as HTMLButtonElement).disabled).toBe(false);
  });

  it("omits the disagreement table when the labelers agreed on everything", () => {
    const store = memoryStore();
    run(store, 1, "Ada", ["A", "B", "A", "B"]);
    run(store, 2, "Grace", ["A", "B", "A", "B"]);
    show([entry], store);
    expect(container.querySelector("table")).toBeNull();
    expect(text(".lf-percent")).toBe("100%");
    expect(text(".lf-kappa")).toBe("1.00");
  });

  it("counts flagged skips and tasks still to go", () => {
    const store = memoryStore();
    run(store, 1, "Ada", ["skip", "skip"]); // t1 skipped, comes back at the end; t2 skipped likewise
    // t3 now in progress
    show([entry], store);
    expect(text(".lf-pass-text")).toBe("Pass 1 (Ada): 0 of 4 labeled, 4 to go.");

    const store2 = memoryStore();
    run(store2, 1, "Ada", ["A", "A", "A", "skip", "skip"]); // t4 skipped twice (it is alone at the end)
    show([entry], store2);
    expect(text(".lf-pass-text")).toBe("Pass 1 (Ada): 3 of 4 labeled, 1 skipped and flagged.");
    expect((q(".lf-pass .lf-progress") as HTMLProgressElement).value).toBe(4); // handled: labeled + flagged
  });

  it("downloads the file for each button through onDownload", () => {
    const store = memoryStore();
    run(store, 1, "Ada", ["A", "B", "A", "A"]);
    run(store, 2, "Grace", ["A", "A", "A", "B"]);
    const files = show([entry], store);

    for (const label of [
      "Download labels (JSONL)",
      "Download labels (CSV)",
      "Download agreement (JSON)",
      "Download agreement (CSV)",
    ]) {
      act(() => void button(label).click());
    }
    expect(files.map((f) => f.name)).toEqual([
      expect.stringMatching(/^sample-job-\d{4}-\d{2}-\d{2}\.jsonl$/),
      expect.stringMatching(/^sample-job-\d{4}-\d{2}-\d{2}\.csv$/),
      expect.stringMatching(/^sample-job-\d{4}-\d{2}-\d{2}-agreement\.json$/),
      expect.stringMatching(/^sample-job-\d{4}-\d{2}-\d{2}-agreement\.csv$/),
    ]);
    expect(files[0]!.content.trimEnd().split("\n")).toHaveLength(8); // 4 labels per pass
    expect(JSON.parse(files[2]!.content)).toMatchObject({ agreedCount: 2, totalDoubleLabeled: 4, percentAgreement: 50 });
  });

  it("lists several jobs, each with its own progress", () => {
    const job2: Job = { id: "job-2", name: "Second job", taskTypeId: "dummy", createdAt: job.createdAt };
    const entry2: DashboardJob = { job: job2, tasks: makeTasks("u1", "u2").map((t) => ({ ...t, jobId: "job-2" })), taskType: dummyType as TaskType };
    const store = memoryStore();
    run(store, 1, "Ada", ["A"]);
    run(store, 1, "Ada", ["B", "B"], entry2);

    show([entry, entry2], store);
    const sections = [...container.querySelectorAll(".lf-dashboard-job")];
    expect(sections.map((s) => text("h2", s))).toEqual(["Sample job", "Second job"]);
    expect(sections.map((s) => text(".lf-pass-text", s))).toEqual([
      "Pass 1 (Ada): 1 of 4 labeled, 3 to go.",
      "Pass 1 (Ada): 2 of 2 labeled.",
    ]);
  });

  it("shows a problem instead of numbers when saved state is unreadable, without hiding other jobs", () => {
    const store = memoryStore({ [storageKey(job.id, 1)]: "{broken" });
    const job2: Job = { id: "job-2", name: "Second job", taskTypeId: "dummy", createdAt: job.createdAt };
    const entry2: DashboardJob = { job: job2, tasks: makeTasks("u1").map((t) => ({ ...t, jobId: "job-2" })), taskType: dummyType as TaskType };
    run(store, 1, "Ada", ["A"], entry2);

    show([entry, entry2], store);
    const [first, second] = [...container.querySelectorAll(".lf-dashboard-job")];
    expect(text('[role="alert"]', first!)).toMatch(/Pass 1 could not be read/);
    expect(([...first!.querySelectorAll("button")] as HTMLButtonElement[]).every((b) => b.disabled)).toBe(true);
    expect(text(".lf-pass-text", second!)).toBe("Pass 1 (Ada): 1 of 1 labeled.");
  });

  it("shows a problem when saved progress no longer matches the task file", () => {
    const store = memoryStore();
    run(store, 1, "Ada", ["A"]);
    const changed: DashboardJob = { ...entry, tasks: makeTasks("t1", "t2", "t3", "other") };
    show([changed], store);
    expect(text('[role="alert"]')).toMatch(/Pass 1 could not be read: Snapshot does not match/);
  });
});
