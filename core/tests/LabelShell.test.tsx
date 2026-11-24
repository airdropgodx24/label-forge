// @vitest-environment jsdom
import { StrictMode, act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LabelShell, SessionSetup, loadSaved, memoryStore, type SessionChoice } from "../src/session";
import type { Label, Pass, TaskType } from "../src/types";
import { job, makeTasks } from "./helpers";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Task type with a real screen: two buttons, plus a hook-based counter to prove per-task state resets. */
const screenType: TaskType<{ n: string }, string> = {
  id: "test",
  title: "Test labeling",
  instruction: "Pick A or B.",
  renderTask(task, onChange): ReactNode {
    // A hook inside renderTask: it must reset when the task changes.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [clicks, setClicks] = useState(0);
    return (
      <div className="screen">
        <p className="task-id">{task.id}</p>
        <p className="clicks">{clicks}</p>
        <button
          className="pick-a"
          onClick={() => {
            setClicks(clicks + 1);
            onChange("A");
          }}
        >
          A
        </button>
        <button className="pick-b" onClick={() => onChange("B")}>
          B
        </button>
      </div>
    );
  },
  isComplete: (label: Label<string>) => label.value === "A" || label.value === "B",
  labelsAgree: (a, b) => a.value === b.value,
};

let container: HTMLDivElement;
let root: Root;
const tasks = makeTasks("a", "b", "c");

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

function mount(store = memoryStore(), opts: { pass?: Pass; name?: string; strict?: boolean } = {}) {
  const ui = (
    <LabelShell
      job={job}
      tasks={tasks}
      taskType={screenType}
      pass={opts.pass ?? 1}
      labelerName={opts.name ?? "Ada"}
      store={store}
    />
  );
  act(() => root.render(opts.strict ? <StrictMode>{ui}</StrictMode> : ui));
  return store;
}

const q = (sel: string) => container.querySelector(sel) as HTMLElement;
const text = (sel: string) => q(sel)?.textContent ?? "";
const click = (sel: string) => act(() => void q(sel).click());
const press = (key: string, init: KeyboardEventInit = {}) =>
  act(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
  });

describe("LabelShell: frame (FR-S1)", () => {
  it("shows job title, counter, progress, identity, instruction, task area, actions and shortcuts", () => {
    mount();
    expect(text(".lf-job")).toBe("Sample job");
    expect(text(".lf-tasktype")).toBe("Test labeling");
    expect(text(".lf-identity")).toBe("Labeler: Ada (Pass 1)");
    expect(text(".lf-counter")).toBe("Task 1 of 3");
    expect((q("progress") as HTMLProgressElement).value).toBe(0);
    expect((q("progress") as HTMLProgressElement).max).toBe(3);
    expect(text(".lf-instruction")).toBe("Pick A or B.");
    expect(text(".task-id")).toBe("a");
    expect(text(".lf-submit")).toContain("Enter");
    expect(text(".lf-skip")).toContain("S");
    expect(text(".lf-shortcuts")).toBe("Shortcuts: Enter submits, S skips.");
  });

  it("disables Submit until the app reports an answer", () => {
    mount();
    expect((q(".lf-submit") as HTMLButtonElement).disabled).toBe(true);
    click(".pick-a");
    expect((q(".lf-submit") as HTMLButtonElement).disabled).toBe(false);
  });

  it("works under StrictMode without double-advancing", () => {
    mount(memoryStore(), { strict: true });
    click(".pick-a");
    click(".lf-submit");
    expect(text(".lf-counter")).toBe("Task 2 of 3");
  });
});

describe("LabelShell: submit and skip (FR-S2, FR-S3)", () => {
  it("Enter submits the picked answer, stores it, shows confirmation and advances", () => {
    const store = mount();
    click(".pick-b");
    press("Enter");
    expect(text(".lf-message")).toBe("Label saved.");
    expect(text(".lf-counter")).toBe("Task 2 of 3");
    expect(text(".task-id")).toBe("b");
    expect((q("progress") as HTMLProgressElement).value).toBe(1);
    const saved = loadSaved(store, job.id, 1)!;
    expect(saved.labels.map((l) => [l.taskId, l.value, l.labelerName, l.pass])).toEqual([["a", "B", "Ada", 1]]);
  });

  it("Enter with nothing picked warns and does not advance", () => {
    mount();
    press("Enter");
    expect(text(".lf-message")).toBe("Finish this task before submitting.");
    expect(text(".task-id")).toBe("a");
  });

  it("S skips; the task comes back at the end", () => {
    mount();
    press("s");
    expect(text(".lf-message")).toBe("Skipped. This task will come back at the end.");
    expect(text(".task-id")).toBe("b");
    click(".pick-a");
    press("Enter");
    click(".pick-a");
    press("Enter");
    expect(text(".task-id")).toBe("a");
  });

  it("a second skip says the task is flagged", () => {
    mount();
    press("s"); // a -> end
    click(".pick-a");
    press("Enter"); // b
    click(".pick-a");
    press("Enter"); // c
    press("S"); // a again, skipped for the second time
    expect(text(".lf-message")).toBe("Skipped again. This task is flagged and will not come back.");
    expect(text(".lf-finished")).toBe("2 labeled, 1 skipped and flagged. This pass is finished.");
    expect(text(".lf-counter")).toBe("All 3 tasks handled");
    expect((q(".lf-submit") as HTMLButtonElement).disabled).toBe(true);
    expect((q(".lf-skip") as HTMLButtonElement).disabled).toBe(true);
  });

  it("the buttons do the same as the keys", () => {
    mount();
    click(".lf-skip");
    expect(text(".task-id")).toBe("b");
    click(".pick-a");
    click(".lf-submit");
    expect(text(".task-id")).toBe("c");
  });

  it("Enter with a button focused submits once and cancels the browser's own button click", () => {
    mount();
    click(".pick-a");
    (q(".pick-a") as HTMLButtonElement).focus();
    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    act(() => void q(".pick-a").dispatchEvent(event));
    expect(text(".task-id")).toBe("b");
    expect(event.defaultPrevented).toBe(true);
  });

  it("ignores Enter and S while typing in a text field", () => {
    mount();
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "s", bubbles: true, cancelable: true }));
    });
    input.remove();
    expect(text(".task-id")).toBe("a");
    expect(text(".lf-message")).toBe("");
  });

  it("ignores held-down keys and shortcuts with Ctrl", () => {
    mount();
    press("s", { repeat: true });
    press("s", { ctrlKey: true });
    expect(text(".task-id")).toBe("a");
  });

  it("clears the confirmation after a moment", () => {
    vi.useFakeTimers();
    mount();
    press("s");
    expect(text(".lf-message")).not.toBe("");
    act(() => void vi.advanceTimersByTime(2000));
    expect(text(".lf-message")).toBe("");
  });

  it("shows an error and stays put if storage fails", () => {
    const store = memoryStore();
    mount(store);
    store.setItem = () => {
      throw new Error("storage full");
    };
    click(".pick-a");
    press("Enter");
    expect(text(".lf-message")).toBe("Could not save the label: storage full");
    expect(text(".task-id")).toBe("a");
  });

  it("resets the app's per-task state (hooks in renderTask) when the task changes", () => {
    mount();
    click(".pick-a");
    click(".pick-a");
    expect(text(".clicks")).toBe("2");
    press("Enter");
    expect(text(".task-id")).toBe("b");
    expect(text(".clicks")).toBe("0");
  });
});

describe("LabelShell: reload (FR-S3)", () => {
  it("resumes at the same task after a reload", () => {
    const store = mount();
    click(".pick-a");
    press("Enter"); // a done, now on b
    press("s"); // b re-queued, now on c

    act(() => root.unmount());
    root = createRoot(container);
    mount(store);

    expect(text(".lf-counter")).toBe("Task 2 of 3");
    expect(text(".task-id")).toBe("c");
    expect((q("progress") as HTMLProgressElement).value).toBe(1);
  });

  it("keeps Pass 2 separate from Pass 1", () => {
    const store = mount(memoryStore(), { pass: 1, name: "Ada" });
    click(".pick-a");
    press("Enter");

    act(() => root.unmount());
    root = createRoot(container);
    mount(store, { pass: 2, name: "Grace" });

    expect(text(".lf-identity")).toBe("Labeler: Grace (Pass 2)");
    expect(text(".task-id")).toBe("a");
    expect(text(".lf-counter")).toBe("Task 1 of 3");
  });
});

describe("SessionSetup: name and pass (FR-S4)", () => {
  function setup(store = memoryStore()) {
    const started: SessionChoice[] = [];
    act(() => root.render(<SessionSetup job={job} store={store} onStart={(c) => started.push(c)} />));
    return started;
  }
  const type = (value: string) =>
    act(() => {
      const input = q('input[type="text"]') as HTMLInputElement;
      // React tracks the value setter, so set it through the prototype.
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  const submit = () =>
    act(() => void q("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));

  it("starts Pass 1 with the trimmed name", () => {
    const started = setup();
    type("  Ada  ");
    submit();
    expect(started).toEqual([{ labelerName: "Ada", pass: 1 }]);
  });

  it("asks for a name", () => {
    const started = setup();
    submit();
    expect(text('[role="alert"]')).toBe("Enter a name.");
    expect(started).toEqual([]);
  });

  it("starts Pass 2 under a different name and refuses the Pass 1 name", () => {
    const store = memoryStore();
    mount(store, { pass: 1, name: "Ada" });
    act(() => root.unmount());
    root = createRoot(container);

    const started = setup(store);
    act(() => void (container.querySelectorAll('input[type="radio"]')[1] as HTMLInputElement).click());
    type("ada");
    submit();
    expect(text('[role="alert"]')).toMatch(/Use a different name for Pass 2/);
    expect(started).toEqual([]);

    type("Grace");
    submit();
    expect(started).toEqual([{ labelerName: "Grace", pass: 2 }]);
  });

  it("offers the saved name when resuming a pass", () => {
    const store = memoryStore();
    mount(store, { pass: 1, name: "Ada" });
    act(() => root.unmount());
    root = createRoot(container);
    setup(store);
    expect((q('input[type="text"]') as HTMLInputElement).value).toBe("Ada");
  });
});
