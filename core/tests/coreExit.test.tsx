// @vitest-environment jsdom
/**
 * CORE EXIT CHECK (tasks.md, end of Phase 2).
 *
 * "The core compiles, tests pass, and a dummy task type (a trivial test
 * screen) can run a full label, score, export loop. If the dummy works, the
 * skeleton is real."
 *
 * This test runs that loop with the dummy task type only, through the real
 * pieces: tasks loaded from JSON, two passes labeled in the LabelShell with
 * keyboard input, agreement scored, results shown on the dashboard, and the
 * export files downloaded.
 *
 * Expected results, worked out by hand before the test was written:
 *
 *   task  Pass 1 (Ada)             Pass 2 (Grace)               status
 *   t1    A                        A                            agreed
 *   t2    B                        A                            disagreed
 *   t3    skipped once, then A     A                            agreed
 *   t4    A                        B                            disagreed
 *   t5    B                        skipped twice (flagged)      single_pass
 *   t6    B                        B                            agreed
 *
 *   Double-labeled: t1 t2 t3 t4 t6 = 5.   Agreed: t1 t3 t6 = 3 of 5 = 60%.
 *   Pass 1 over those five: A=3, B=2.     Pass 2: A=3, B=2.
 *   p_o = 0.6,  p_e = (3*3 + 2*2) / 25 = 0.52
 *   kappa = (0.6 - 0.52) / (1 - 0.52) = 0.08 / 0.48 = 1/6 = 0.1667
 *   Records exported: 6 (Pass 1) + 5 (Pass 2) = 11.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildExport, type ExportFile } from "../src/export";
import { loadTasks } from "../src/queue";
import { scoreAgreement } from "../src/scoring";
import {
  JobDashboard,
  LabelShell,
  checkSetup,
  loadSaved,
  memoryStore,
  type KeyValueStore,
} from "../src/session";
import type { Job, Pass, TaskType } from "../src/types";
import { dummyType } from "./dummyTaskType";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const job: Job = { id: "dummy-job", name: "Dummy Job", taskTypeId: "dummy", createdAt: "2026-11-24T09:00:00.000Z" };
const taskFile = JSON.stringify(
  ["t1", "t2", "t3", "t4", "t5", "t6"].map((id) => ({
    id,
    type: "dummy",
    payload: { question: `Question for ${id}` },
  })),
);

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

const q = (sel: string) => container.querySelector(sel) as HTMLElement;
const text = (sel: string) => q(sel)?.textContent ?? "";
const press = (key: string) =>
  act(() => void document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })));

describe("core exit check: label, score, export with the dummy task type", () => {
  it("runs the whole loop and the numbers match the hand calculation", () => {
    const store: KeyValueStore = memoryStore();
    const taskType = dummyType as TaskType;

    // 1. Load the tasks from JSON (FR-Q1).
    const tasks = loadTasks(taskFile, job.id);
    expect(tasks.map((t) => t.id)).toEqual(["t1", "t2", "t3", "t4", "t5", "t6"]);

    const mount = (pass: Pass, name: string) => {
      act(() => root.unmount());
      root = createRoot(container);
      act(() => root.render(<LabelShell job={job} tasks={tasks} taskType={taskType} pass={pass} labelerName={name} store={store} />));
    };
    /** Checks which task is on screen, picks a value on the dummy screen, and presses Enter. */
    const label = (taskId: string, value: "A" | "B") => {
      expect(text(".task-id")).toBe(taskId);
      act(() => void q(value === "A" ? ".pick-a" : ".pick-b").click());
      press("Enter");
    };
    const skip = (taskId: string) => {
      expect(text(".task-id")).toBe(taskId);
      press("s");
    };

    // 2. Pass 1 as Ada, in the shell, with the keyboard (FR-S1 to FR-S4, FR-Q3).
    expect(checkSetup({ store, jobId: job.id, pass: 1, labelerName: "Ada" })).toBeNull();
    mount(1, "Ada");
    expect(text(".lf-counter")).toBe("Task 1 of 6");
    expect(text(".lf-instruction")).toBe("Pick A or B.");
    label("t1", "A");
    label("t2", "B");
    skip("t3"); // goes to the end of the queue
    label("t4", "A");
    label("t5", "B");
    label("t6", "B");
    label("t3", "A"); // back again, labeled this time
    expect(text(".lf-finished")).toBe("6 labeled. This pass is finished.");

    // 3. Pass 2 needs a different identity (FR-Q4); Grace labels independently.
    expect(checkSetup({ store, jobId: job.id, pass: 2, labelerName: "ada" })).toMatch(/different name/);
    expect(checkSetup({ store, jobId: job.id, pass: 2, labelerName: "Grace" })).toBeNull();
    mount(2, "Grace");
    expect(text(".task-id")).toBe("t1"); // starts from the top
    expect((q(".lf-submit") as HTMLButtonElement).disabled).toBe(true); // nothing is pre-filled from Pass 1
    expect(q(".lf-shell").textContent).not.toContain("Ada"); // Pass 1's labeler and answers are not shown
    label("t1", "A");
    label("t2", "A");

    // A reload in the middle of Pass 2 resumes at the same task (FR-Q2, FR-S3).
    mount(2, "Grace");
    expect(text(".lf-counter")).toBe("Task 3 of 6");
    label("t3", "A");
    label("t4", "B");
    skip("t5"); // first skip: back at the end
    label("t6", "B");
    skip("t5"); // second skip: flagged, no label
    expect(text(".lf-finished")).toBe("5 labeled, 1 skipped and flagged. This pass is finished.");

    // 4. Score agreement from what the sessions saved (FR-A1 to FR-A3).
    const pass1 = loadSaved(store, job.id, 1)!.labels;
    const pass2 = loadSaved(store, job.id, 2)!.labels;
    expect(pass1.map((l) => [l.taskId, l.value])).toEqual([
      ["t1", "A"], ["t2", "B"], ["t4", "A"], ["t5", "B"], ["t6", "B"], ["t3", "A"],
    ]);
    expect(pass2.map((l) => [l.taskId, l.value])).toEqual([
      ["t1", "A"], ["t2", "A"], ["t3", "A"], ["t4", "B"], ["t6", "B"],
    ]);
    expect(new Set(pass1.map((l) => l.labelerName))).toEqual(new Set(["Ada"]));
    expect(new Set(pass2.map((l) => l.labelerName))).toEqual(new Set(["Grace"]));

    const report = scoreAgreement({ jobId: job.id, taskType, pass1, pass2 });
    expect(report.totalDoubleLabeled).toBe(5);
    expect(report.agreedCount).toBe(3);
    expect(report.percentAgreement).toBeCloseTo(60, 10);
    expect(report.kappa).toBeCloseTo(1 / 6, 10);
    expect(report.disagreements.map((d) => [d.taskId, d.pass1.value, d.pass2.value])).toEqual([
      ["t2", "B", "A"],
      ["t4", "A", "B"],
    ]);

    // 5. Show it on the dashboard (FR-A3, FR-A4).
    const files: ExportFile[] = [];
    const jobs = [{ job, tasks, taskType }];
    act(() => root.unmount());
    root = createRoot(container);
    act(() => root.render(<JobDashboard jobs={jobs} store={store} onDownload={(f) => files.push(f)} />));

    expect([...container.querySelectorAll(".lf-pass-text")].map((e) => e.textContent)).toEqual([
      "Pass 1 (Ada): 6 of 6 labeled.",
      "Pass 2 (Grace): 5 of 6 labeled, 1 skipped and flagged.",
    ]);
    expect(text(".lf-agreement")).toBe(
      "Labelers agreed on 3 of 5 tasks. Kappa 0.17, usually read as slight agreement.",
    );
    expect(text(".lf-percent")).toBe("60%");
    expect(text(".lf-kappa")).toBe("0.17");
    expect([...container.querySelectorAll("tbody tr")].map((tr) => [...tr.children].map((c) => c.textContent))).toEqual([
      ["t2", "B", "A"],
      ["t4", "A", "B"],
    ]);

    // 6. Export (FR-E1 to FR-E4): press each download button.
    for (const name of [
      "Download labels (JSONL)",
      "Download labels (CSV)",
      "Download agreement (JSON)",
      "Download agreement (CSV)",
    ]) {
      const b = [...container.querySelectorAll("button")].find((x) => x.textContent === name)!;
      expect(b.disabled).toBe(false);
      act(() => void b.click());
    }
    const [jsonl, csv, agreementJson, agreementCsv] = files as [ExportFile, ExportFile, ExportFile, ExportFile];
    expect(files.map((f) => f.name.replace(/\d{4}-\d{2}-\d{2}/, "DATE"))).toEqual([
      "dummy-job-DATE.jsonl",
      "dummy-job-DATE.csv",
      "dummy-job-DATE-agreement.json",
      "dummy-job-DATE-agreement.csv",
    ]);

    // Labels: 6 + 5 = 11 records, one shared shape, statuses as in the table at the top.
    const records = jsonl.content.trimEnd().split("\n").map((line) => JSON.parse(line));
    expect(records).toHaveLength(11);
    expect(records.every((r) => Object.keys(r).join() === "jobId,taskId,taskType,labeler,pass,label,labeledAt,agreementStatus,exportedAt")).toBe(true);
    expect(records.every((r) => r.jobId === job.id && r.taskType === "dummy")).toBe(true);
    const status = (pass: number, id: string) => records.find((r) => r.pass === pass && r.taskId === id)?.agreementStatus;
    expect(["t1", "t3", "t6"].map((id) => [status(1, id), status(2, id)])).toEqual([
      ["agreed", "agreed"],
      ["agreed", "agreed"],
      ["agreed", "agreed"],
    ]);
    expect(["t2", "t4"].map((id) => [status(1, id), status(2, id)])).toEqual([
      ["disagreed", "disagreed"],
      ["disagreed", "disagreed"],
    ]);
    expect(status(1, "t5")).toBe("single_pass");
    expect(records.find((r) => r.pass === 2 && r.taskId === "t5")).toBeUndefined(); // flagged skip: never exported
    expect(records.filter((r) => r.pass === 1).map((r) => r.labeler)).toEqual(Array(6).fill("Ada"));

    // The CSV holds the same records.
    const rows = csv.content.trimEnd().split("\r\n");
    expect(rows[0]).toBe("jobId,taskId,taskType,labeler,pass,label,labeledAt,agreementStatus,exportedAt");
    expect(rows).toHaveLength(12);
    expect(rows.slice(1).map((r) => r.split(",").slice(0, 6).join(","))).toEqual(
      records.map((r) => [r.jobId, r.taskId, r.taskType, r.labeler, r.pass, r.label].join(",")),
    );

    // Agreement summary, both formats.
    const summary = JSON.parse(agreementJson.content);
    expect(summary).toMatchObject({ jobId: job.id, totalDoubleLabeled: 5, agreedCount: 3 });
    expect(summary.percentAgreement).toBeCloseTo(60, 10);
    expect(summary.kappa).toBeCloseTo(1 / 6, 10);
    expect(summary.disagreements.map((d: { taskId: string }) => d.taskId)).toEqual(["t2", "t4"]);
    expect(summary.disagreements[0]).toMatchObject({
      pass1: { labeler: "Ada", label: "B" },
      pass2: { labeler: "Grace", label: "A" },
    });
    const summaryRows = agreementCsv.content.trimEnd().split("\r\n");
    expect(summaryRows).toHaveLength(1 + 4 + 2);
    expect(summaryRows[1]).toBe("summary,totalDoubleLabeled,5,,,,,");
    expect(summaryRows[2]).toBe("summary,agreedCount,3,,,,,");
    expect(summaryRows[3]).toMatch(/^summary,percentAgreement,60(\.0+\d*)?,,,,,$/);
    expect(summaryRows[4]).toMatch(/^summary,kappa,0\.1666\d+,,,,,$/);
    expect(summaryRows.slice(5)).toEqual(["disagreement,,,t2,Ada,B,Grace,A", "disagreement,,,t4,Ada,A,Grace,B"]);

    // The dashboard's files are the same ones buildExport makes directly.
    const direct = buildExport({ job, taskType, pass1, pass2 });
    expect(direct.files.agreementCsv.content).toBe(agreementCsv.content);
    expect(direct.records).toHaveLength(11);
  });
});
