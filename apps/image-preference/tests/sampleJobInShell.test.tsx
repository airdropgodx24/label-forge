// @vitest-environment jsdom
/**
 * The core shell serving the Image Preference sample job, with the real task
 * type and the real sample tasks (nothing mocked). This is task 2's proof that
 * registration works; the two-pass run with mixed agreement is task 3.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LabelShell, loadSaved, memoryStore } from "../../../core/src/session";
import { sampleJob, sampleJobEntry } from "../src";

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
  act(() =>
    root.render(<LabelShell job={job} tasks={tasks} taskType={taskType} pass={1} labelerName={name} store={store} />),
  );
  return store;
}
const q = (sel: string) => container.querySelector(sel) as HTMLElement;
const text = (sel: string) => q(sel)?.textContent ?? "";
const press = (key: string) =>
  act(() => void document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })));
const currentTaskImages = () => [...container.querySelectorAll(".ip-image")].map((i) => i.getAttribute("src"));

describe("the shell serves the sample job through the registered task type", () => {
  it("shows the shell frame and the first task's screen", () => {
    mount();
    expect(text(".lf-job")).toBe("Image Preference sample");
    expect(text(".lf-tasktype")).toBe("Image Preference");
    expect(text(".lf-counter")).toBe("Task 1 of 25");
    expect(text(".lf-instruction")).toBe(taskType.instruction);
    expect(text(".ip-instruction")).toBe("Pick the image that better matches: a calm morning scene");
    expect(currentTaskImages()).toEqual(["images/ip-01-a.svg", "images/ip-01-b.svg"]);
    expect(container.querySelectorAll(".ip-label")).toHaveLength(2);
  });

  it("will not submit until a pick is made, then stores the pick as the label", () => {
    const store = mount();
    expect((q(".lf-submit") as HTMLButtonElement).disabled).toBe(true);
    press("Enter");
    expect(text(".lf-message")).toBe("Finish this task before submitting.");
    expect(text(".lf-counter")).toBe("Task 1 of 25");

    press("2");
    expect((q(".lf-submit") as HTMLButtonElement).disabled).toBe(false);
    press("Enter");
    expect(text(".lf-message")).toBe("Label saved.");
    expect(text(".lf-counter")).toBe("Task 2 of 25");
    expect(loadSaved(store, sampleJob.id, 1)!.labels.map((l) => [l.taskId, l.value])).toEqual([["ip-01", "B"]]);
  });

  it("maps keys 1, 2 and 3 to A, B and tie in the stored labels", () => {
    const store = mount();
    for (const key of ["1", "2", "3"]) {
      press(key);
      press("Enter");
    }
    expect(loadSaved(store, sampleJob.id, 1)!.labels.map((l) => [l.taskId, l.value])).toEqual([
      ["ip-01", "A"],
      ["ip-02", "B"],
      ["ip-03", "tie"],
    ]);
  });

  it("starts each task with no pick, and a pick can be changed before submitting", () => {
    const store = mount();
    press("1");
    press("3"); // changed mind
    press("Enter");
    expect(container.querySelectorAll('.ip-choice[aria-checked="true"]')).toHaveLength(0); // the next task starts clear
    press("Enter");
    expect(text(".lf-message")).toBe("Finish this task before submitting.");
    expect(loadSaved(store, sampleJob.id, 1)!.labels.map((l) => l.value)).toEqual(["tie"]);
  });

  it("submits once when Enter is pressed with a choice button focused", () => {
    const store = mount();
    const b = q(".ip-choice-B") as HTMLButtonElement;
    act(() => void b.click());
    b.focus();
    act(() => void b.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
    expect(text(".lf-counter")).toBe("Task 2 of 25");
    expect(loadSaved(store, sampleJob.id, 1)!.labels).toHaveLength(1);
  });

  it("skips with S without needing a pick, and the task comes back at the end", () => {
    mount();
    press("s");
    expect(text(".lf-message")).toBe("Skipped. This task will come back at the end.");
    expect(text(".ip-instruction")).toContain("a stormy night at sea"); // ip-02
    expect(text(".lf-counter")).toBe("Task 1 of 25");
  });

  it("shows a placeholder for a broken image and the session carries on", () => {
    const store = mount();
    act(() => void q(".ip-option-A img").dispatchEvent(new Event("error")));
    expect(text(".ip-option-A .ip-placeholder")).toBe("Image A could not be loaded.");
    press("1");
    press("Enter");
    expect(text(".lf-counter")).toBe("Task 2 of 25");
    expect(loadSaved(store, sampleJob.id, 1)!.labels[0]?.value).toBe("A");
    expect(q(".ip-option-A .ip-placeholder")).toBeNull(); // the next task loads its own images
  });

  it("resumes at the same task after a reload", () => {
    const store = mount();
    press("1");
    press("Enter");
    press("2");
    press("Enter");
    mount(store);
    expect(text(".lf-counter")).toBe("Task 3 of 25");
    expect(currentTaskImages()).toEqual(["images/ip-03-a.svg", "images/ip-03-b.svg"]);
  });

  it("serves all 25 sample tasks in order, one pass, and finishes", () => {
    const store = mount();
    const served: string[] = [];
    const keys = ["1", "2", "3"];
    for (let i = 0; i < tasks.length; i++) {
      served.push(currentTaskImages()[0]!.replace(/^images\/(ip-\d+)-a\.svg$/, "$1"));
      press(keys[i % 3]!);
      press("Enter");
    }
    expect(served).toEqual(tasks.map((t) => t.id));
    expect(text(".lf-finished")).toBe("25 labeled. This pass is finished.");
    const labels = loadSaved(store, sampleJob.id, 1)!.labels;
    expect(labels).toHaveLength(25);
    expect(labels.slice(0, 6).map((l) => l.value)).toEqual(["A", "B", "tie", "A", "B", "tie"]);
  });
});
