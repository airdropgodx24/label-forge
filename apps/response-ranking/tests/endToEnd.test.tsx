// @vitest-environment jsdom
/**
 * APP 2, TASK 3: THE END-TO-END PASS.
 *
 * Labels the full 25-prompt sample job through the real shell as Pass 1 (Ada)
 * and Pass 2 (Grace), then checks that the dashboard scores agreement on the
 * top-ranked response only, and that the four export files match the rankings
 * given. Nothing in the core or the app is mocked; the only fakes are an
 * in-memory stand-in for localStorage and a capture function in place of file
 * downloads.
 *
 * THE LABELERS ARE SCRIPTED. There is no second human here. Each is a fixed
 * rule applied to the author's intended ranking (tools/build-sample-data.mjs),
 * so the disagreements below follow from the rules written down here, not from
 * how real labelers behave. What this test proves is that the app, the shell,
 * the scorer, the dashboard and the exports handle a realistic mix correctly.
 *
 *   Ada (Pass 1)    gives the intended ranking for every task.
 *   Grace (Pass 2)  gives the intended ranking, with two differences:
 *     - On a CLOSE CALL she puts the runner-up first. A close call is a task
 *       whose second-ranked response is also acceptable (it follows every
 *       instruction and states nothing false) and differs from the best only
 *       in style, firmness, register or thoroughness. The data marks these with
 *       a `closeCall` reason: rr-04, rr-11, rr-23, rr-24.
 *     - On a task with FOUR responses she orders the two weakest the other way.
 *       Both are poor, and the order of two poor answers is a coin flip: rr-03,
 *       rr-07, rr-14, rr-16. The top choice is the same, so these must count as
 *       agreement.
 *
 * Worked out by hand before the test was written. Agreement is on the top
 * response id only, and the scorer pools the top ids across tasks:
 *
 *   Differ at the top   rr-04 rr-11 rr-23 rr-24                    = 4
 *   Agree               25 - 4 = 21        p_o = 21/25 = 0.84 = 84%
 *   Ada's tops          r1 x6, r2 x10, r3 x8, r4 x1
 *   Grace's tops        r1 x6, r2 x8,  r3 x10, r4 x1   (rr-04 r1->r3, rr-11 r2->r3,
 *                                                       rr-23 r2->r3, rr-24 r3->r1)
 *   p_e = (6*6 + 10*8 + 8*10 + 1*1) / 25^2 = 197/625 = 0.3152
 *   kappa = (0.84 - 0.3152) / (1 - 0.3152) = 328/428 = 82/107 = 0.7664
 *   Reading: "Labelers agreed on 21 of 25 tasks. Kappa 0.77, usually read as substantial agreement."
 *
 * Eight tasks have a different FULL ranking (the four close calls and the four
 * with four responses) but only four have a different top, so a scorer that
 * compared whole rankings would report 17 of 25. Seeing 21 is the proof that
 * only the top response counts.
 *
 * Input: Pass 1 uses the number keys. Pass 2 uses the number keys for the
 * first 8 tasks, the arrow buttons for the next 8, and dragging for the last 9.
 * Ada skips rr-05 once and Grace skips rr-18 once; each comes back last.
 *
 * Run with E2E_REPORT=1 to print the figures and the four export files.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ExportFile } from "../../../core/src/export";
import { checkSetup, JobDashboard, LabelShell, loadSaved, memoryStore } from "../../../core/src/session";
import { sampleJob, sampleJobEntry } from "../src";
import { buildTasks } from "../tools/build-sample-data.mjs";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { intended } = buildTasks();
const entry = sampleJobEntry();
const { job, tasks, taskType } = entry;
const ids = tasks.map((t) => t.id);

const CLOSE_CALLS = ["rr-04", "rr-11", "rr-23", "rr-24"];
const FOUR_RESPONSES = ["rr-03", "rr-07", "rr-14", "rr-16"];
const TOP_DISAGREEMENTS = CLOSE_CALLS; // exactly the close calls, in file order

const KEY: Record<string, string[]> = Object.fromEntries(intended.map((k) => [k.id, k.ranking]));
const marked = intended.filter((k) => k.closeCall).map((k) => k.id);

/** Ada: the intended ranking. */
const adaRanking = (id: string) => [...KEY[id]!];
/** Grace: the intended ranking, runner-up first on a close call, bottom two reversed with four responses. */
function graceRanking(id: string): string[] {
  const r = [...KEY[id]!];
  if (marked.includes(id)) [r[0], r[1]] = [r[1]!, r[0]!];
  else if (r.length === 4) [r[2], r[3]] = [r[3]!, r[2]!];
  return r;
}

const PASS1: Record<string, string[]> = Object.fromEntries(ids.map((id) => [id, adaRanking(id)]));
const PASS2: Record<string, string[]> = Object.fromEntries(ids.map((id) => [id, graceRanking(id)]));
const SKIP1 = "rr-05";
const SKIP2 = "rr-18";

/** Plain Cohen's kappa on the top response ids, written here so the check does not depend on the core's scorer. */
function topKappa(a: string[], b: string[]) {
  const n = a.length;
  const po = a.filter((v, i) => v === b[i]).length / n;
  const cats = [...new Set([...a, ...b])];
  const pe = cats.reduce((sum, c) => sum + (a.filter((v) => v === c).length / n) * (b.filter((v) => v === c).length / n), 0);
  return { po, pe, kappa: (po - pe) / (1 - pe) };
}

/** A small RFC 4180 reader: quoted cells, doubled quotes, CRLF rows. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") (row.push(cell), (cell = ""));
    else if (c === "\r" && text[i + 1] === "\n") (row.push(cell), rows.push(row), (row = []), (cell = ""), i++);
    else cell += c;
  }
  if (cell !== "" || row.length) (row.push(cell), rows.push(row));
  return rows;
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

const q = (sel: string) => container.querySelector(sel) as HTMLElement;
const all = (sel: string) => [...container.querySelectorAll(sel)] as HTMLElement[];
const text = (sel: string) => q(sel)?.textContent ?? "";
const press = (key: string) =>
  act(() => void document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })));
const click = (el: HTMLElement) => act(() => void el.click());
const fire = (el: Element, type: string) => act(() => void el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true })));
const cardOrder = () => all(".rr-card").map((c) => c.dataset.response!);
const card = (id: string) => q(`.rr-card[data-response="${id}"]`);

const idByPrompt = new Map(tasks.map((t) => [(t.payload as { prompt: string }).prompt, t.id]));
const currentId = () => idByPrompt.get(text(".rr-prompt-text")) ?? "(none)";
const numberOf = (responseId: string) => String(Number(responseId.slice(1)));

type Method = "keys" | "arrows" | "drag";

/** Puts the cards in `target` order using the given input method, then checks the screen shows it. */
function rank(target: string[], method: Method) {
  const start = cardOrder();
  const unchanged = start.join() === target.join();
  if (method === "keys") {
    for (const id of target) press(numberOf(id));
  } else if (method === "arrows") {
    if (unchanged) {
      // An untouched list is not an answer, so confirm file order by nudging a card down and back up.
      const first = start[0]!;
      click(card(first).querySelector(".rr-down") as HTMLElement);
      click(card(first).querySelector(".rr-up") as HTMLElement);
    } else {
      target.forEach((id, i) => {
        // At most one click per card is ever needed; a bound turns a broken arrow into a failure, not a hang.
        for (let clicks = 0; cardOrder().indexOf(id) > i; clicks++) {
          if (clicks > target.length) throw new Error(`Arrow clicks did not move ${id} up to place ${i + 1}`);
          click(card(id).querySelector(".rr-up") as HTMLElement);
        }
      });
    }
  } else {
    const dragOnto = (id: string, onto: string) => {
      fire(card(id).querySelector(".rr-handle")!, "dragstart");
      fire(card(onto), "drop");
    };
    if (unchanged) {
      dragOnto(start[0]!, start[1]!);
      dragOnto(start[0]!, start[1]!);
    } else {
      target.forEach((id, i) => {
        if (cardOrder().indexOf(id) !== i) dragOnto(id, cardOrder()[i]!);
      });
    }
  }
  expect(cardOrder(), `${currentId()} by ${method}`).toEqual(target);
}

function mountShell(store: ReturnType<typeof memoryStore>, pass: 1 | 2, name: string) {
  act(() => root.unmount());
  root = createRoot(container);
  act(() => root.render(<LabelShell job={job} tasks={tasks} taskType={taskType} pass={pass} labelerName={name} store={store} />));
}

/** Labels tasks as the shell serves them. Returns the ids in served order, a skipped task appearing each time it is served. */
function labelPass(opts: {
  rankings: Record<string, string[]>;
  skipOnce: string;
  method: (id: string) => Method;
  served?: string[];
  stopAfter?: number;
}) {
  const served = opts.served ?? [];
  let skipped = served.filter((id) => id === opts.skipOnce).length > 1;
  while (container.querySelector(".rr-card") && (opts.stopAfter === undefined || served.length < opts.stopAfter)) {
    const id = currentId();
    served.push(id);
    if (id === opts.skipOnce && !skipped) {
      skipped = true;
      press("s");
      continue;
    }
    rank(opts.rankings[id]!, opts.method(id));
    press("Enter");
  }
  return served;
}

describe("App 2 end-to-end: two passes over the full 25-prompt sample job", () => {
  it("labels both passes, scores agreement on the top-ranked response, and exports exactly what was labeled", () => {
    const store = memoryStore();

    // ---- The scripted labelers are what the comment at the top says they are.
    expect(marked).toEqual(CLOSE_CALLS);
    expect(ids.filter((id) => KEY[id]!.length === 4)).toEqual(FOUR_RESPONSES);
    expect(ids.filter((id) => PASS1[id]![0] !== PASS2[id]![0])).toEqual(TOP_DISAGREEMENTS);
    const differentRanking = ids.filter((id) => PASS1[id]!.join() !== PASS2[id]!.join());
    expect(differentRanking).toEqual([...CLOSE_CALLS, ...FOUR_RESPONSES].sort());
    expect(differentRanking).toHaveLength(8); // eight full rankings differ, four tops differ
    expect(idByPrompt.size).toBe(25); // every prompt is unique, so the screen identifies the task

    // ---- Pass 1: Ada, number keys. Skips rr-05 once.
    expect(checkSetup({ store, jobId: sampleJob.id, pass: 1, labelerName: "Ada" })).toBeNull();
    mountShell(store, 1, "Ada");
    expect(text(".lf-counter")).toBe("Task 1 of 25");
    const served1 = labelPass({ rankings: PASS1, skipOnce: SKIP1, method: () => "keys" });
    expect(served1).toEqual([...ids, SKIP1]);
    expect(text(".lf-finished")).toBe("25 labeled. This pass is finished.");

    // ---- Pass 2: a different name. Grace uses keys, then arrows, then dragging; the page is reloaded mid-pass.
    expect(checkSetup({ store, jobId: sampleJob.id, pass: 2, labelerName: "ada" })).toMatch(/different name/);
    expect(checkSetup({ store, jobId: sampleJob.id, pass: 2, labelerName: "Grace" })).toBeNull();
    mountShell(store, 2, "Grace");
    expect(currentId()).toBe("rr-01"); // starts from the top
    expect(all(".rr-rank").every((r) => r.textContent === "Not ranked")).toBe(true); // Pass 1's rankings are not pre-filled
    expect(q(".lf-shell").textContent).not.toContain("Ada");
    const methodFor = (id: string): Method => (ids.indexOf(id) < 8 ? "keys" : ids.indexOf(id) < 16 ? "arrows" : "drag");
    const first10 = labelPass({ rankings: PASS2, skipOnce: SKIP2, method: methodFor, stopAfter: 10 });
    expect(first10).toEqual(ids.slice(0, 10));

    mountShell(store, 2, "Grace"); // reload mid-pass
    expect(text(".lf-counter")).toBe("Task 11 of 25");
    expect(currentId()).toBe("rr-11");
    const served2 = labelPass({ rankings: PASS2, skipOnce: SKIP2, method: methodFor, served: [...first10] });
    expect(served2).toEqual([...ids, SKIP2]);
    expect(text(".lf-finished")).toBe("25 labeled. This pass is finished.");

    // ---- What was saved is exactly what was given, one ranking per task.
    const saved1 = loadSaved(store, sampleJob.id, 1)!;
    const saved2 = loadSaved(store, sampleJob.id, 2)!;
    const order1 = [...ids.filter((id) => id !== SKIP1), SKIP1];
    const order2 = [...ids.filter((id) => id !== SKIP2), SKIP2];
    expect(saved1.labels.map((l) => l.taskId)).toEqual(order1);
    expect(saved2.labels.map((l) => l.taskId)).toEqual(order2);
    expect(Object.fromEntries(saved1.labels.map((l) => [l.taskId, l.value]))).toEqual(PASS1);
    expect(Object.fromEntries(saved2.labels.map((l) => [l.taskId, l.value]))).toEqual(PASS2);
    expect(new Set(saved1.labels.map((l) => l.labelerName))).toEqual(new Set(["Ada"]));
    expect(new Set(saved2.labels.map((l) => l.labelerName))).toEqual(new Set(["Grace"]));
    for (const l of [...saved1.labels, ...saved2.labels]) {
      const n = (tasks.find((t) => t.id === l.taskId)!.payload as { responses: unknown[] }).responses.length;
      expect((l.value as string[]).length, l.taskId).toBe(n); // every response has a place
    }

    // ---- The expected figures, computed two ways: by hand (comment above) and by an independent function.
    const tops1 = ids.map((id) => PASS1[id]![0]!);
    const tops2 = ids.map((id) => PASS2[id]![0]!);
    const count = (list: string[], v: string) => list.filter((x) => x === v).length;
    expect(["r1", "r2", "r3", "r4"].map((v) => count(tops1, v))).toEqual([6, 10, 8, 1]);
    expect(["r1", "r2", "r3", "r4"].map((v) => count(tops2, v))).toEqual([6, 8, 10, 1]);
    const { po, pe, kappa } = topKappa(tops1, tops2);
    expect(po).toBeCloseTo(0.84, 12);
    expect(pe).toBeCloseTo(197 / 625, 12);
    expect(kappa).toBeCloseTo(82 / 107, 12);
    const wholeRankingAgreed = ids.filter((id) => PASS1[id]!.join() === PASS2[id]!.join()).length;
    expect(wholeRankingAgreed).toBe(17); // what a whole-ranking rule would have reported

    // ---- Dashboard (FR-A3, FR-A4): agreement on the top-ranked response only.
    const files: ExportFile[] = [];
    act(() => root.unmount());
    root = createRoot(container);
    act(() => root.render(<JobDashboard jobs={[entry]} store={store} onDownload={(f) => files.push(f)} />));

    expect(text("h2")).toBe("Response Ranking sample");
    expect(text(".lf-tasktype")).toBe("Response Ranking");
    expect(all(".lf-pass-text").map((e) => e.textContent)).toEqual([
      "Pass 1 (Ada): 25 of 25 labeled.",
      "Pass 2 (Grace): 25 of 25 labeled.",
    ]);
    expect(text(".lf-agreement")).toBe(
      "Labelers agreed on 21 of 25 tasks. Kappa 0.77, usually read as substantial agreement.",
    );
    expect(text(".lf-percent")).toBe("84%");
    expect(text(".lf-kappa")).toBe("0.77");
    expect(text(".lf-agreement")).not.toContain("17 of 25"); // not the whole-ranking figure
    expect(text("caption")).toBe("Disagreements (4)");
    expect(all("thead th").map((e) => e.textContent)).toEqual(["Task", "Pass 1 (Ada)", "Pass 2 (Grace)"]);
    expect(all("tbody tr").map((tr) => [...tr.children].map((c) => c.textContent))).toEqual(
      TOP_DISAGREEMENTS.map((id) => [id, PASS1[id]!.join(" > "), PASS2[id]!.join(" > ")]),
    );
    // Tasks whose lower places differ but whose top is the same are not listed as disagreements.
    const listed = all("tbody tr").map((tr) => tr.children[0]!.textContent);
    for (const id of FOUR_RESPONSES) expect(listed).not.toContain(id);
    expect(all(".lf-exports button").every((b) => !(b as HTMLButtonElement).disabled)).toBe(true);

    // ---- Export: press all four buttons.
    for (const name of ["Download labels (JSONL)", "Download labels (CSV)", "Download agreement (JSON)", "Download agreement (CSV)"]) {
      click(all("button").find((b) => b.textContent === name)!);
    }
    expect(files).toHaveLength(4);
    const [jsonl, csv, agreementJson, agreementCsv] = files as [ExportFile, ExportFile, ExportFile, ExportFile];
    expect(files.map((f) => f.name.replace(/\d{4}-\d{2}-\d{2}/, "DATE"))).toEqual([
      "response-ranking-sample-DATE.jsonl",
      "response-ranking-sample-DATE.csv",
      "response-ranking-sample-DATE-agreement.json",
      "response-ranking-sample-DATE-agreement.csv",
    ]);

    // Labels as JSONL: 25 + 25 records, one per ranking given, in submission order. The label is a real list.
    const records = jsonl.content.trimEnd().split("\n").map((line) => JSON.parse(line));
    expect(jsonl.content.endsWith("\n")).toBe(true);
    expect(records).toHaveLength(50);
    expect(records.map((r) => `${r.pass}:${r.taskId}`)).toEqual([...order1.map((id) => `1:${id}`), ...order2.map((id) => `2:${id}`)]);
    for (const r of records) {
      expect(Object.keys(r)).toEqual(["jobId", "taskId", "taskType", "labeler", "pass", "label", "labeledAt", "agreementStatus", "exportedAt"]);
      expect(r.jobId).toBe(sampleJob.id);
      expect(r.taskType).toBe("response-ranking");
      expect(r.labeler).toBe(r.pass === 1 ? "Ada" : "Grace");
      expect(Array.isArray(r.label)).toBe(true);
      expect(r.label).toEqual((r.pass === 1 ? PASS1 : PASS2)[r.taskId]); // the ranking given
      expect(r.agreementStatus).toBe(TOP_DISAGREEMENTS.includes(r.taskId) ? "disagreed" : "agreed");
    }
    expect(records.filter((r) => r.agreementStatus === "agreed")).toHaveLength(42); // 21 tasks x 2 passes
    expect(records.filter((r) => r.agreementStatus === "disagreed")).toHaveLength(8); // 4 tasks x 2 passes
    expect(records.filter((r) => r.agreementStatus === "single_pass")).toHaveLength(0);
    // A task whose lower places differ is still "agreed" in both passes' records.
    for (const id of FOUR_RESPONSES) {
      expect(records.filter((r) => r.taskId === id).map((r) => r.agreementStatus)).toEqual(["agreed", "agreed"]);
    }

    // Labels as CSV: the same 50 records. The label cell holds the ranking as JSON text, so it is quoted.
    const rows = parseCsv(csv.content);
    expect(csv.content.endsWith("\r\n")).toBe(true);
    expect(rows[0]).toEqual(["jobId", "taskId", "taskType", "labeler", "pass", "label", "labeledAt", "agreementStatus", "exportedAt"]);
    expect(rows).toHaveLength(51);
    expect(csv.content).toContain('"[""r1"",""r2"",""r3""]"'); // rr-01 in Pass 1, as it appears in the raw file
    rows.slice(1).forEach((cells, i) => {
      const r = records[i];
      expect(cells.slice(0, 5)).toEqual([r.jobId, r.taskId, r.taskType, r.labeler, String(r.pass)]);
      expect(JSON.parse(cells[5]!)).toEqual(r.label); // the ranking, read back out of the quoted cell
      expect(cells.slice(6, 8)).toEqual([r.labeledAt, r.agreementStatus]);
    });
    const csvStamps = new Set(rows.slice(1).map((cells) => cells[8]));
    expect(csvStamps.size).toBe(1); // one export time for the whole file
    expect(new Date([...csvStamps][0]!).toISOString()).toBe([...csvStamps][0]);

    // Agreement summary as JSON: the figures the dashboard shows, with the full rankings of each disagreement.
    const summary = JSON.parse(agreementJson.content);
    expect(summary.jobId).toBe(sampleJob.id);
    expect(summary.totalDoubleLabeled).toBe(25);
    expect(summary.agreedCount).toBe(21);
    expect(summary.percentAgreement).toBeCloseTo(84, 10);
    expect(summary.kappa).toBeCloseTo(82 / 107, 10);
    expect(summary.disagreements.map((d: { taskId: string }) => d.taskId)).toEqual(TOP_DISAGREEMENTS);
    for (const d of summary.disagreements) {
      expect(d.pass1).toMatchObject({ labeler: "Ada", label: PASS1[d.taskId] });
      expect(d.pass2).toMatchObject({ labeler: "Grace", label: PASS2[d.taskId] });
      expect(d.pass1.label[0]).not.toBe(d.pass2.label[0]); // every listed disagreement is a difference at the top
    }

    // Agreement summary as CSV: the same figures, then one row per disagreement.
    const summaryRows = parseCsv(agreementCsv.content);
    expect(summaryRows[0]).toEqual(["row", "name", "value", "taskId", "pass1Labeler", "pass1Label", "pass2Labeler", "pass2Label"]);
    expect(summaryRows[1]).toEqual(["summary", "totalDoubleLabeled", "25", "", "", "", "", ""]);
    expect(summaryRows[2]).toEqual(["summary", "agreedCount", "21", "", "", "", "", ""]);
    expect(summaryRows[3]).toEqual(["summary", "percentAgreement", "84", "", "", "", "", ""]);
    expect(summaryRows[4]!.slice(0, 2)).toEqual(["summary", "kappa"]);
    expect(Number(summaryRows[4]![2])).toBeCloseTo(82 / 107, 10);
    expect(summaryRows.slice(5).map((c) => [c[0], c[3], c[4], JSON.parse(c[5]!), c[6], JSON.parse(c[7]!)])).toEqual(
      TOP_DISAGREEMENTS.map((id) => ["disagreement", id, "Ada", PASS1[id], "Grace", PASS2[id]]),
    );

    // ---- Optional printout for checking by eye: E2E_REPORT=1 npx vitest --run apps/response-ranking/tests/endToEnd.test.tsx
    if (process.env.E2E_REPORT) {
      const lines = [
        "",
        "=== App 2 end-to-end run ===",
        `Dashboard: ${text(".lf-agreement")}`,
        `Percent agreement: ${text(".lf-percent")}   Kappa: ${text(".lf-kappa")} (exact ${summary.kappa})   Disagreements: ${summary.disagreements.length}`,
        ...all("tbody tr").map((tr) => `  ${[...tr.children].map((c) => c.textContent).join("  |  ")}`),
        ...files.flatMap((f) => ["", `--- ${f.name} ---`, f.content.trimEnd()]),
      ];
      console.log(lines.join("\n"));
    }
  });
});
