// @vitest-environment jsdom
/**
 * The core shell serving the Response Ranking sample job, with the real task
 * type and the real sample tasks (nothing mocked). This is task 2's proof that
 * registration works with zero core changes; the two-pass run with scores and
 * export is task 3.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LabelShell, loadSaved, memoryStore } from "../../../core/src/session";
import { AGREEMENT_NOTE, INSTRUCTION, sampleJob, sampleJobEntry } from "../src";

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

const { job, tasks, taskType } = sampleJobEntry();

function mount(store = memoryStore(), name = "Ada") {
  act(() => root.unmount());
  root = createRoot(container);
  act(() => root.render(<LabelShell job={job} tasks={tasks} taskType={taskType} pass={1} labelerName={name} store={store} />));
  return store;
}
const q = (sel: string) => container.querySelector(sel) as HTMLElement;
const all = (sel: string) => [...container.querySelectorAll(sel)] as HTMLElement[];
const text = (sel: string) => q(sel)?.textContent ?? "";
const press = (key: string) =>
  act(() => void document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })));
const click = (el: HTMLElement) => act(() => void el.click());
const order = () => all(".rr-card").map((c) => c.dataset.response);
const saved = (store: ReturnType<typeof memoryStore>) => loadSaved(store, sampleJob.id, 1)!.labels;
const submitDisabled = () => (q(".lf-submit") as HTMLButtonElement).disabled;

describe("the shell serves the sample job through the registered task type", () => {
  it("shows the shell frame, the job's instruction line, the prompt, the cards and the agreement note", () => {
    mount();
    expect(text(".lf-job")).toBe("Response Ranking sample");
    expect(text(".lf-tasktype")).toBe("Response Ranking");
    expect(text(".lf-counter")).toBe("Task 1 of 25");
    expect(text(".lf-instruction")).toBe(INSTRUCTION);
    expect(text(".rr-prompt-text")).toBe((tasks[0]!.payload as { prompt: string }).prompt);
    expect(order()).toEqual(["r1", "r2", "r3"]);
    expect(text(".rr-note")).toBe(AGREEMENT_NOTE);
  });

  it("will not submit until the ranking is complete, then stores the order as the label", () => {
    const store = mount();
    expect(submitDisabled()).toBe(true);
    press("Enter");
    expect(text(".lf-message")).toBe("Finish this task before submitting.");

    press("2");
    press("3");
    expect(submitDisabled()).toBe(true); // two of three placed
    press("Enter");
    expect(text(".lf-message")).toBe("Finish this task before submitting.");
    expect(text(".lf-counter")).toBe("Task 1 of 25");

    press("1");
    expect(submitDisabled()).toBe(false);
    press("Enter");
    expect(text(".lf-message")).toBe("Label saved.");
    expect(text(".lf-counter")).toBe("Task 2 of 25");
    expect(saved(store).map((l) => [l.taskId, l.value])).toEqual([["rr-01", ["r2", "r3", "r1"]]]);
  });

  it("takes an arrangement made with the arrows", () => {
    const store = mount();
    click(q('.rr-card[data-response="r1"] .rr-down')); // r2 r1 r3
    click(q('.rr-card[data-response="r3"] .rr-up')); // r2 r3 r1
    press("Enter");
    expect(saved(store)[0]?.value).toEqual(["r2", "r3", "r1"]);
  });

  it("takes an arrangement made by dragging", () => {
    const store = mount();
    act(() => void q('.rr-card[data-response="r3"] .rr-handle').dispatchEvent(new Event("dragstart", { bubbles: true })));
    act(() => void q('.rr-card[data-response="r1"]').dispatchEvent(new Event("drop", { bubbles: true, cancelable: true })));
    press("Enter");
    expect(saved(store)[0]?.value).toEqual(["r3", "r1", "r2"]);
  });

  it("withdraws an earlier ranking when the labeler starts again, so a stale one cannot be submitted", () => {
    const store = mount();
    press("1");
    press("2");
    press("3");
    expect(submitDisabled()).toBe(false);
    press("2"); // starts a new ranking
    expect(submitDisabled()).toBe(true);
    press("Enter");
    expect(text(".lf-message")).toBe("Finish this task before submitting.");
    expect(saved(store)).toEqual([]);

    press("3");
    press("1");
    press("Enter");
    expect(saved(store)[0]?.value).toEqual(["r2", "r3", "r1"]);
  });

  it("withdraws the ranking on Start over too", () => {
    mount();
    press("1");
    press("2");
    press("3");
    click(q(".rr-reset"));
    expect(submitDisabled()).toBe(true);
    expect(order()).toEqual(["r1", "r2", "r3"]);
  });

  it("submits once when Enter is pressed with an arrow button focused", () => {
    const store = mount();
    const down = q('.rr-card[data-response="r1"] .rr-down') as HTMLButtonElement;
    click(down);
    down.focus();
    act(() => void down.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
    expect(text(".lf-counter")).toBe("Task 2 of 25");
    expect(saved(store)).toHaveLength(1);
    expect(saved(store)[0]?.value).toEqual(["r2", "r1", "r3"]);
  });

  it("starts each task with nothing ranked", () => {
    mount();
    press("1");
    press("2");
    press("3");
    press("Enter");
    expect(all(".rr-rank").map((r) => r.textContent)).toEqual(["Not ranked", "Not ranked", "Not ranked"]);
    expect(submitDisabled()).toBe(true);
  });

  it("skips with S without needing a ranking, and the task comes back at the end", () => {
    mount();
    press("s");
    expect(text(".lf-message")).toBe("Skipped. This task will come back at the end.");
    expect(text(".rr-prompt-text")).toBe((tasks[1]!.payload as { prompt: string }).prompt); // rr-02
    expect(text(".lf-counter")).toBe("Task 1 of 25");
  });

  it("resumes at the same task after a reload", () => {
    const store = mount();
    for (let t = 0; t < 2; t++) {
      all(".rr-card").forEach((_, i) => press(String(i + 1)));
      press("Enter");
    }
    mount(store);
    expect(text(".lf-counter")).toBe("Task 3 of 25");
    expect(text(".rr-prompt-text")).toBe((tasks[2]!.payload as { prompt: string }).prompt);
    expect(order()).toEqual(["r1", "r2", "r3", "r4"]); // rr-03 has four responses
  });

  it("serves all 25 sample tasks, with 2, 3 and 4 responses, ranks each by number keys, and finishes", () => {
    const store = mount();
    const counts: number[] = [];
    for (let i = 0; i < tasks.length; i++) {
      const n = all(".rr-card").length;
      counts.push(n);
      for (let k = n; k >= 1; k--) press(String(k)); // worst-numbered first: r<n> best ... r1 worst
      press("Enter");
    }
    expect(counts).toEqual(tasks.map((t) => (t.payload as { responses: unknown[] }).responses.length));
    expect(new Set(counts)).toEqual(new Set([2, 3, 4]));
    expect(text(".lf-finished")).toBe("25 labeled. This pass is finished.");
    const labels = saved(store);
    expect(labels).toHaveLength(25);
    labels.forEach((l, i) => {
      expect(l.taskId).toBe(tasks[i]!.id);
      expect(l.value).toEqual(Array.from({ length: counts[i]! }, (_, k) => `r${counts[i]! - k}`));
    });
  });
});
