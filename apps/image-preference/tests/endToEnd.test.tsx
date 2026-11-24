// @vitest-environment jsdom
/**
 * APP 1, TASK 3: THE END-TO-END PASS.
 *
 * Labels the full 25-pair sample job through the real shell as Pass 1 (Ada)
 * and Pass 2 (Grace), with a deliberate mix of agreement and disagreement,
 * then checks the dashboard and the four export files against the labels given.
 * Nothing in the core or the app is mocked; the only fake is an in-memory
 * stand-in for localStorage and a capture function in place of file downloads.
 *
 * The answer key is what each pair was drawn for (see README and
 * tools/generate-sample-data.mjs): 10 pairs where A fits better, 10 where B
 * fits better, 5 where the two images fit equally well (Tie).
 *
 *   KEY    01 A  02 B  03 A  04 B  05 A  06 B  07 B  08 A  09 B  10 A
 *          11 B  12 T  13 B  14 A  15 T  16 A  17 B  18 A  19 B  20 A
 *          21 B  22 A  23 T  24 T  25 T
 *
 * Ada (Pass 1) follows the key except two Tie pairs: 12 -> A, 23 -> B.
 * Grace (Pass 2) follows the key except one subtle pair and three Tie pairs:
 * 09 -> A, 15 -> A, 24 -> B, 25 -> A.
 *
 * They differ on 09, 12, 15, 23, 24, 25. That is 6 disagreements.
 *
 * Worked out by hand before the test was written:
 *
 *   agreed            25 - 6 = 19       p_o = 19/25 = 0.76 = 76%
 *   Pass 1 totals     A = 10 + 1 (12)                 = 11
 *                     B = 10 + 1 (23)                 = 11
 *                     Tie = 5 - 2 (12, 23)            = 3
 *   Pass 2 totals     A = 10 + 3 (09, 15, 25)         = 13
 *                     B = 10 - 1 (09) + 1 (24)        = 10
 *                     Tie = 5 - 3 (15, 24, 25)        = 2
 *   p_e = (11*13 + 11*10 + 3*2) / 25^2 = 259/625 = 0.4144
 *   kappa = (0.76 - 0.4144) / (1 - 0.4144) = 216/366 = 36/61 = 0.5902
 *   Reading: "Labelers agreed on 19 of 25 tasks. Kappa 0.59, usually read as moderate agreement."
 *
 * Skips: Ada skips ip-05 once and Grace skips ip-18 once, so each comes back
 * as the last task of that pass and is labeled then. Pass 1 is entered with the
 * keys 1, 2, 3 and Enter; Pass 2 with the choice buttons and the Submit button.
 *
 * Run with E2E_REPORT=1 to print the figures and the four export files.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ExportFile } from "../../../core/src/export";
import { checkSetup, JobDashboard, LabelShell, loadSaved, memoryStore } from "../../../core/src/session";
import { sampleJob, sampleJobEntry, type ImagePreferenceValue } from "../src";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Pick = ImagePreferenceValue;
const ids = Array.from({ length: 25 }, (_, i) => `ip-${String(i + 1).padStart(2, "0")}`);

const KEY: Pick[] = [
  ..."ABABABBABA", // 01-10
  ..."BTBATABABA".split("").map((c) => c), // 11-20
  ..."BATTT", // 21-25
].map((c) => (c === "T" ? "tie" : c)) as Pick[];

const withChanges = (changes: Record<string, Pick>): Record<string, Pick> =>
  Object.fromEntries(ids.map((id, i) => [id, changes[id] ?? KEY[i]!]));

const PASS1 = withChanges({ "ip-12": "A", "ip-23": "B" });
const PASS2 = withChanges({ "ip-09": "A", "ip-15": "A", "ip-24": "B", "ip-25": "A" });
const DISAGREE = ["ip-09", "ip-12", "ip-15", "ip-23", "ip-24", "ip-25"];

/** Pass 1 serves the tasks in file order with ip-05 moved to the end; Pass 2 does the same with ip-18. */
const orderWithSkipped = (skipped: string) => [...ids.filter((id) => id !== skipped), skipped];
const ORDER1 = orderWithSkipped("ip-05");
const ORDER2 = orderWithSkipped("ip-18");

/** Plain Cohen's kappa, written here on purpose so the check does not depend on the core's scorer. */
function cohenKappa(a: string[], b: string[]) {
  const n = a.length;
  const po = a.filter((v, i) => v === b[i]).length / n;
  const cats = [...new Set([...a, ...b])];
  const pe = cats.reduce((sum, c) => sum + (a.filter((v) => v === c).length / n) * (b.filter((v) => v === c).length / n), 0);
  return { po, pe, kappa: (po - pe) / (1 - pe) };
}

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

const entry = sampleJobEntry();
const { job, tasks, taskType } = entry;

const q = (sel: string) => container.querySelector(sel) as HTMLElement;
const all = (sel: string) => [...container.querySelectorAll(sel)] as HTMLElement[];
const text = (sel: string) => q(sel)?.textContent ?? "";
const press = (key: string) =>
  act(() => void document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })));
const click = (el: HTMLElement) => act(() => void el.click());
const currentId = () => q(".ip-image")?.getAttribute("src")?.match(/(ip-\d+)-a\.svg$/)?.[1] ?? "(none)";
const KEY_FOR: Record<Pick, string> = { A: "1", B: "2", tie: "3" };

function mountShell(store: ReturnType<typeof memoryStore>, pass: 1 | 2, name: string) {
  act(() => root.unmount());
  root = createRoot(container);
  act(() =>
    root.render(<LabelShell job={job} tasks={tasks} taskType={taskType} pass={pass} labelerName={name} store={store} />),
  );
}

/**
 * Labels tasks as the shell serves them, until `until` tasks have been handled (or the pass ends).
 * Returns the ids in the order they were served, including a skipped task each time it appears.
 */
function labelPass(opts: {
  picks: Record<string, Pick>;
  skipOnce: string;
  how: "keys" | "buttons";
  servedSoFar?: string[];
  stopAfter?: number;
}) {
  const served = opts.servedSoFar ?? [];
  let skipped = served.includes(opts.skipOnce) && served.indexOf(opts.skipOnce) !== served.lastIndexOf(opts.skipOnce);
  while (container.querySelector(".ip-image") && (opts.stopAfter === undefined || served.length < opts.stopAfter)) {
    const id = currentId();
    served.push(id);
    if (id === opts.skipOnce && !skipped) {
      skipped = true;
      press("s");
      continue;
    }
    const pick = opts.picks[id]!;
    if (opts.how === "keys") {
      press(KEY_FOR[pick]);
      press("Enter");
    } else {
      click(q(`.ip-choice-${pick}`));
      click(q(".lf-submit"));
    }
  }
  return served;
}

describe("App 1 end-to-end: two passes over the full 25-pair sample job", () => {
  it("labels both passes, shows the agreement on the dashboard, and exports exactly what was labeled", () => {
    const store = memoryStore();

    // ---- The answer key and the passes are what the comment at the top says they are.
    expect([..."AB"].map((v) => KEY.filter((k) => k === v).length).concat(KEY.filter((k) => k === "tie").length)).toEqual([10, 10, 5]);
    expect(ids.filter((id) => PASS1[id] !== PASS2[id])).toEqual(DISAGREE);
    expect(tasks.map((t) => t.id)).toEqual(ids);

    // ---- Pass 1: Ada, keys 1/2/3 and Enter. Skips ip-05 once.
    expect(checkSetup({ store, jobId: sampleJob.id, pass: 1, labelerName: "Ada" })).toBeNull();
    mountShell(store, 1, "Ada");
    expect(text(".lf-counter")).toBe("Task 1 of 25");
    const served1 = labelPass({ picks: PASS1, skipOnce: "ip-05", how: "keys" });
    expect(served1).toEqual([...ids, "ip-05"]); // every task in file order, ip-05 skipped, then served again last
    expect(text(".lf-finished")).toBe("25 labeled. This pass is finished.");

    // ---- Pass 2 needs a different name. Grace labels 10 tasks, then the page is reloaded and she carries on.
    expect(checkSetup({ store, jobId: sampleJob.id, pass: 2, labelerName: "ada" })).toMatch(/different name/);
    expect(checkSetup({ store, jobId: sampleJob.id, pass: 2, labelerName: "Grace" })).toBeNull();
    mountShell(store, 2, "Grace");
    expect(currentId()).toBe("ip-01"); // starts from the top
    expect(all('.ip-choice[aria-checked="true"]')).toHaveLength(0); // Pass 1's answers are not shown or pre-filled
    expect(q(".lf-shell").textContent).not.toContain("Ada");
    const first10 = labelPass({ picks: PASS2, skipOnce: "ip-18", how: "buttons", stopAfter: 10 });
    expect(first10).toEqual(ids.slice(0, 10));

    mountShell(store, 2, "Grace"); // reload mid-pass
    expect(text(".lf-counter")).toBe("Task 11 of 25");
    expect(currentId()).toBe("ip-11");
    const served2 = labelPass({ picks: PASS2, skipOnce: "ip-18", how: "buttons", servedSoFar: [...first10] });
    expect(served2).toEqual([...ids, "ip-18"]); // likewise for ip-18
    expect(text(".lf-finished")).toBe("25 labeled. This pass is finished.");

    // ---- What was saved is exactly what was given.
    const saved1 = loadSaved(store, sampleJob.id, 1)!;
    const saved2 = loadSaved(store, sampleJob.id, 2)!;
    expect(saved1.labels.map((l) => l.taskId)).toEqual(ORDER1);
    expect(saved2.labels.map((l) => l.taskId)).toEqual(ORDER2);
    expect(Object.fromEntries(saved1.labels.map((l) => [l.taskId, l.value]))).toEqual(PASS1);
    expect(Object.fromEntries(saved2.labels.map((l) => [l.taskId, l.value]))).toEqual(PASS2);
    expect(new Set(saved1.labels.map((l) => l.labelerName))).toEqual(new Set(["Ada"]));
    expect(new Set(saved2.labels.map((l) => l.labelerName))).toEqual(new Set(["Grace"]));

    // ---- The expected figures, computed two ways: by hand (comment above) and by an independent function.
    const { po, pe, kappa } = cohenKappa(ids.map((id) => PASS1[id]!), ids.map((id) => PASS2[id]!));
    expect(po).toBeCloseTo(0.76, 12);
    expect(pe).toBeCloseTo(259 / 625, 12);
    expect(kappa).toBeCloseTo(36 / 61, 12);

    // ---- Dashboard (FR-A3, FR-A4).
    const files: ExportFile[] = [];
    act(() => root.unmount());
    root = createRoot(container);
    act(() => root.render(<JobDashboard jobs={[entry]} store={store} onDownload={(f) => files.push(f)} />));

    expect(text("h2")).toBe("Image Preference sample");
    expect(all(".lf-pass-text").map((e) => e.textContent)).toEqual([
      "Pass 1 (Ada): 25 of 25 labeled.",
      "Pass 2 (Grace): 25 of 25 labeled.",
    ]);
    expect(text(".lf-agreement")).toBe(
      "Labelers agreed on 19 of 25 tasks. Kappa 0.59, usually read as moderate agreement.",
    );
    expect(text(".lf-percent")).toBe("76%");
    expect(text(".lf-kappa")).toBe("0.59");
    expect(text("caption")).toBe("Disagreements (6)");
    expect(all("thead th").map((e) => e.textContent)).toEqual(["Task", "Pass 1 (Ada)", "Pass 2 (Grace)"]);
    expect(all("tbody tr").map((tr) => [...tr.children].map((c) => c.textContent))).toEqual(
      DISAGREE.map((id) => [id, PASS1[id], PASS2[id]]),
    );
    expect(all(".lf-exports button").every((b) => !(b as HTMLButtonElement).disabled)).toBe(true);

    // ---- Export: press all four buttons.
    for (const name of [
      "Download labels (JSONL)",
      "Download labels (CSV)",
      "Download agreement (JSON)",
      "Download agreement (CSV)",
    ]) {
      click(all("button").find((b) => b.textContent === name)!);
    }
    expect(files).toHaveLength(4);
    const [jsonl, csv, agreementJson, agreementCsv] = files as [ExportFile, ExportFile, ExportFile, ExportFile];
    expect(files.map((f) => f.name.replace(/\d{4}-\d{2}-\d{2}/, "DATE"))).toEqual([
      "image-preference-sample-DATE.jsonl",
      "image-preference-sample-DATE.csv",
      "image-preference-sample-DATE-agreement.json",
      "image-preference-sample-DATE-agreement.csv",
    ]);

    // Labels as JSONL: 25 + 25 records, one per label given, in the order they were submitted.
    const records = jsonl.content.trimEnd().split("\n").map((line) => JSON.parse(line));
    expect(jsonl.content.endsWith("\n")).toBe(true);
    expect(records).toHaveLength(50);
    expect(records.map((r) => `${r.pass}:${r.taskId}`)).toEqual([
      ...ORDER1.map((id) => `1:${id}`),
      ...ORDER2.map((id) => `2:${id}`),
    ]);
    for (const r of records) {
      expect(Object.keys(r)).toEqual(["jobId", "taskId", "taskType", "labeler", "pass", "label", "labeledAt", "agreementStatus", "exportedAt"]);
      expect(r.jobId).toBe(sampleJob.id);
      expect(r.taskType).toBe("image-preference");
      expect(r.labeler).toBe(r.pass === 1 ? "Ada" : "Grace");
      expect(r.label).toBe((r.pass === 1 ? PASS1 : PASS2)[r.taskId]); // the label given
      expect(r.agreementStatus).toBe(DISAGREE.includes(r.taskId) ? "disagreed" : "agreed"); // both passes covered every task
    }
    expect(records.filter((r) => r.agreementStatus === "agreed")).toHaveLength(38); // 19 tasks x 2 passes
    expect(records.filter((r) => r.agreementStatus === "disagreed")).toHaveLength(12); // 6 tasks x 2 passes
    expect(records.filter((r) => r.agreementStatus === "single_pass")).toHaveLength(0);
    expect(new Set(records.map((r) => r.exportedAt)).size).toBe(1);

    // Labels as CSV: the same 50 records, field for field. Each download button is its own export, so
    // `exportedAt` is stamped per file and can differ from the JSONL's by a moment; everything else must match.
    expect(csv.content).not.toContain('"'); // nothing in this job needs quoting, so a plain split is safe
    const rows = csv.content.split("\r\n");
    expect(rows.pop()).toBe(""); // file ends with a line break
    expect(rows[0]).toBe("jobId,taskId,taskType,labeler,pass,label,labeledAt,agreementStatus,exportedAt");
    expect(rows).toHaveLength(51);
    const csvRows = rows.slice(1).map((row) => row.split(","));
    csvRows.forEach((cells, i) => {
      const r = records[i];
      expect(cells.slice(0, 8)).toEqual([r.jobId, r.taskId, r.taskType, r.labeler, String(r.pass), r.label, r.labeledAt, r.agreementStatus]);
    });
    const csvStamps = new Set(csvRows.map((cells) => cells[8]));
    expect(csvStamps.size).toBe(1); // one export time for the whole file
    expect(new Date([...csvStamps][0]!).toISOString()).toBe([...csvStamps][0]); // a valid ISO timestamp

    // Agreement summary as JSON: the figures the dashboard shows.
    const summary = JSON.parse(agreementJson.content);
    expect(summary.jobId).toBe(sampleJob.id);
    expect(summary.totalDoubleLabeled).toBe(25);
    expect(summary.agreedCount).toBe(19);
    expect(summary.percentAgreement).toBeCloseTo(76, 10);
    expect(summary.kappa).toBeCloseTo(36 / 61, 10);
    expect(summary.disagreements.map((d: { taskId: string }) => d.taskId)).toEqual(DISAGREE);
    for (const d of summary.disagreements) {
      expect(d.pass1).toMatchObject({ labeler: "Ada", label: PASS1[d.taskId] });
      expect(d.pass2).toMatchObject({ labeler: "Grace", label: PASS2[d.taskId] });
    }

    // Agreement summary as CSV: the same figures, then one row per disagreement.
    const summaryRows = agreementCsv.content.trimEnd().split("\r\n");
    expect(summaryRows[0]).toBe("row,name,value,taskId,pass1Labeler,pass1Label,pass2Labeler,pass2Label");
    expect(summaryRows[1]).toBe("summary,totalDoubleLabeled,25,,,,,");
    expect(summaryRows[2]).toBe("summary,agreedCount,19,,,,,");
    expect(summaryRows[3]).toBe("summary,percentAgreement,76,,,,,");
    expect(summaryRows[4]).toMatch(/^summary,kappa,0\.59016\d*,,,,,$/);
    expect(summaryRows.slice(5)).toEqual(
      DISAGREE.map((id) => `disagreement,,,${id},Ada,${PASS1[id]},Grace,${PASS2[id]}`),
    );

    // ---- Optional printout for checking by eye: E2E_REPORT=1 npx vitest --run apps/image-preference/tests/endToEnd.test.tsx
    if (process.env.E2E_REPORT) {
      const lines = [
        "",
        "=== App 1 end-to-end run ===",
        `Dashboard: ${text(".lf-agreement")}`,
        `Percent agreement: ${text(".lf-percent")}   Kappa: ${text(".lf-kappa")} (exact ${summary.kappa})   Disagreements: ${summary.disagreements.length}`,
        ...all("tbody tr").map((tr) => `  ${[...tr.children].map((c) => c.textContent).join("  |  ")}`),
        ...files.flatMap((f) => ["", `--- ${f.name} ---`, f.content.trimEnd()]),
      ];
      console.log(lines.join("\n"));
    }
  });
});
