// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadSaved, memoryStore, storageKey } from "../core/src/session";
import { App } from "./App";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo; // jsdom does not implement it
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

function mount(store = memoryStore()) {
  act(() => root.render(<App store={store} />));
  return store;
}

const all = (sel: string) => [...container.querySelectorAll(sel)] as HTMLElement[];
const q = (sel: string) => container.querySelector(sel) as HTMLElement;
const text = (sel: string) => q(sel)?.textContent ?? "";
const button = (label: string | RegExp, within: ParentNode = container) =>
  [...within.querySelectorAll("button")].find((b) => (typeof label === "string" ? b.textContent === label : label.test(b.textContent ?? ""))) as HTMLButtonElement;
const click = (el: HTMLElement) => act(() => void el.click());
const press = (key: string) =>
  act(() => void document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })));
const typeName = (value: string) =>
  act(() => {
    const input = q('input[type="text"]') as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
const startForm = () => act(() => void q("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
const job = (n: number) => all(".app-job")[n]!;

/** Opens a job from the list, picks a pass, types a name, and starts labeling. */
function begin(n: number, name: string, pass: 1 | 2 = 1) {
  click(button("Start or continue labeling", job(n)));
  if (pass === 2) click(all('input[type="radio"]')[1]!);
  typeName(name);
  startForm();
}

describe("the job list", () => {
  it("lists both sample jobs with their task type, size and instruction", () => {
    mount();
    expect(text("h1")).toBe("LabelForge");
    expect(all(".app-job h2").map((h) => h.textContent)).toEqual(["Image Preference sample", "Response Ranking sample"]);
    expect(all(".app-job-meta").map((m) => m.textContent)).toEqual(["Image Preference, 25 tasks", "Response Ranking, 25 tasks"]);
    expect(job(0).textContent).toContain("Choose the image that better matches the description");
    expect(job(1).textContent).toContain("Rank the responses from best to worst.");
  });

  it("starts with nothing started, and offers a way into each job", () => {
    mount();
    expect(all(".app-pass").map((p) => p.textContent)).toEqual([
      "Pass 1: not started.",
      "Pass 2: not started.",
      "Pass 1: not started.",
      "Pass 2: not started.",
    ]);
    expect(all(".app-label")).toHaveLength(2);
    expect(all(".app-results")).toHaveLength(2);
  });
});

describe("Image Preference through the whole flow", () => {
  it("goes from the list to setup, the shell, results, and back", () => {
    const store = mount();
    click(button("Start or continue labeling", job(0)));
    expect(button("Start labeling")).toBeTruthy(); // session setup (name and pass)
    expect(button("All jobs")).toBeTruthy();

    typeName("Ada");
    startForm();
    expect(text(".lf-job")).toBe("Image Preference sample");
    expect(text(".lf-identity")).toBe("Labeler: Ada (Pass 1)");
    expect(text(".lf-counter")).toBe("Task 1 of 25");
    expect(all(".ip-image")).toHaveLength(2); // the app's own screen inside the core's shell
    expect(button("All jobs")).toBeTruthy();
    expect(button("View results")).toBeTruthy();

    press("1");
    press("Enter");
    expect(text(".lf-counter")).toBe("Task 2 of 25");
    expect(loadSaved(store, "image-preference-sample", 1)!.labels.map((l) => l.value)).toEqual(["A"]);

    click(button("View results"));
    expect(text(".lf-dashboard h2")).toBe("Image Preference sample");
    expect(text(".lf-pass-text")).toBe("Pass 1 (Ada): 1 of 25 labeled, 24 to go.");
    expect(all(".lf-exports button").map((b) => b.textContent)).toEqual([
      "Download labels (JSONL)",
      "Download labels (CSV)",
      "Download agreement (JSON)",
      "Download agreement (CSV)",
    ]);
    expect(button("Label this job")).toBeTruthy();

    click(button("All jobs"));
    expect(text("h1")).toBe("LabelForge");
    expect(job(0).querySelector(".app-pass")!.textContent).toBe("Pass 1 (Ada): 1 of 25 labeled.");
    expect(job(1).querySelector(".app-pass")!.textContent).toBe("Pass 1: not started.");
  });

  it("resumes where the labeler left off when the job is opened again", () => {
    mount();
    begin(0, "Ada");
    press("2");
    press("Enter");
    press("3");
    press("Enter");
    click(button("All jobs"));
    begin(0, "Ada");
    expect(text(".lf-counter")).toBe("Task 3 of 25");
  });

  it("offers the saved name again when a pass is reopened", () => {
    mount();
    begin(0, "Ada");
    click(button("All jobs"));
    click(button("Start or continue labeling", job(0)));
    expect((q('input[type="text"]') as HTMLInputElement).value).toBe("Ada");
  });

  it("refuses Pass 2 under Pass 1's name, then accepts a different one and keeps the passes apart", () => {
    const store = mount();
    begin(0, "Ada");
    press("1");
    press("Enter");
    click(button("All jobs"));

    begin(0, "ada", 2);
    expect(text('[role="alert"]')).toBe("Pass 1 was labeled by Ada. Use a different name for Pass 2.");
    typeName("Grace");
    startForm();
    expect(text(".lf-identity")).toBe("Labeler: Grace (Pass 2)");
    expect(text(".lf-counter")).toBe("Task 1 of 25");
    expect(loadSaved(store, "image-preference-sample", 2)!.labels).toEqual([]);
  });
});

describe("Response Ranking through the whole flow", () => {
  it("serves its own screen in the same shell and stores the ranking", () => {
    const store = mount();
    begin(1, "Ada");
    expect(text(".lf-job")).toBe("Response Ranking sample");
    expect(text(".lf-counter")).toBe("Task 1 of 25");
    expect(all(".rr-card")).toHaveLength(3);
    expect(text(".rr-note")).toBe("Agreement between labelers is scored on the top-ranked response only.");

    press("2");
    press("3");
    press("1");
    press("Enter");
    expect(text(".lf-counter")).toBe("Task 2 of 25");
    expect(loadSaved(store, "response-ranking-sample", 1)!.labels.map((l) => l.value)).toEqual([["r2", "r3", "r1"]]);
  });

  it("keeps its progress separate from the other job's", () => {
    const store = mount();
    begin(0, "Ada");
    press("1");
    press("Enter");
    click(button("All jobs"));
    begin(1, "Ada");
    expect(text(".lf-counter")).toBe("Task 1 of 25");
    expect([...store.data.keys()].sort()).toEqual([storageKey("image-preference-sample", 1), storageKey("response-ranking-sample", 1)]);
  });

  it("shows results for one job from the list, and can go on to label it", () => {
    mount();
    click(button("View results", job(1)));
    expect(text(".lf-dashboard h2")).toBe("Response Ranking sample");
    expect(text(".lf-agreement")).toBe("No labels yet, so there is no agreement score.");
    click(button("Label this job"));
    expect(button("Start labeling")).toBeTruthy();
    click(button("All jobs"));
    expect(all(".app-job")).toHaveLength(2);
  });
});

describe("saved progress that does not match the job", () => {
  /** Labels one task, then breaks the saved queue so it no longer matches the job's tasks. */
  function corrupt() {
    const store = mount();
    begin(1, "Ada");
    press("1");
    press("2");
    press("3");
    press("Enter");
    click(button("All jobs"));
    const key = storageKey("response-ranking-sample", 1);
    const saved = JSON.parse(store.getItem(key)!);
    saved.queue.order[0] = "not-a-task";
    store.setItem(key, JSON.stringify(saved));
    return { store, key };
  }

  it("is reported on the list, and does not hide the other job", () => {
    corrupt();
    // The list reads storage when it is shown, so leave it and come back.
    click(button("View results", job(0)));
    click(button("All jobs"));
    expect(job(1).querySelector('[role="alert"]')?.textContent).toMatch(/Pass 1 could not be read/);
    expect(job(0).querySelector('[role="alert"]')).toBeNull();
  });

  it("shows a plain message instead of a blank page, and deletes nothing by itself", () => {
    const { store, key } = corrupt();
    vi.spyOn(console, "error").mockImplementation(() => {}); // React logs the error it hands to the boundary
    const before = store.getItem(key);
    begin(1, "Ada");
    expect(text(".app-error")).toContain("Response Ranking sample, Pass 1 could not be opened");
    expect(text(".app-error")).toContain("Nothing has been changed or deleted");
    expect(store.getItem(key)).toBe(before);
    expect(button("Back to jobs")).toBeTruthy();
  });

  it("asks before deleting, and 'Keep it' leaves the saved progress alone", () => {
    const { store, key } = corrupt();
    vi.spyOn(console, "error").mockImplementation(() => {});
    begin(1, "Ada");
    click(button("Delete saved progress for this pass"));
    expect(button(/^Yes, delete/)).toBeTruthy();
    expect(store.getItem(key)).not.toBeNull(); // asking is not deleting
    click(button("Keep it"));
    expect(button("Delete saved progress for this pass")).toBeTruthy();
    expect(store.getItem(key)).not.toBeNull();
  });

  it("deletes only that pass after confirmation, then starts it again from task 1", () => {
    const store = mount();
    // Real progress in both passes of Response Ranking, and in the other job.
    begin(1, "Ada");
    for (const k of ["1", "2", "3"]) press(k);
    press("Enter");
    click(button("All jobs"));
    begin(1, "Grace", 2);
    for (const k of ["3", "2", "1"]) press(k);
    press("Enter");
    click(button("All jobs"));
    begin(0, "Ada");
    press("1");
    press("Enter");
    click(button("All jobs"));

    const key1 = storageKey("response-ranking-sample", 1);
    const key2 = storageKey("response-ranking-sample", 2);
    const other = storageKey("image-preference-sample", 1);
    const pass2Before = store.getItem(key2);
    const otherBefore = store.getItem(other);
    const saved = JSON.parse(store.getItem(key1)!);
    saved.queue.order[0] = "not-a-task";
    store.setItem(key1, JSON.stringify(saved));

    vi.spyOn(console, "error").mockImplementation(() => {});
    begin(1, "Ada");
    click(button("Delete saved progress for this pass"));
    click(button(/^Yes, delete/));

    expect(text(".lf-counter")).toBe("Task 1 of 25"); // Pass 1 starts again
    expect(all(".rr-card")).toHaveLength(3);
    expect(JSON.parse(store.getItem(key1)!).labels).toEqual([]); // a fresh session, not the old one
    expect(store.getItem(key2)).toBe(pass2Before); // Pass 2 untouched
    expect(store.getItem(other)).toBe(otherBefore); // the other job untouched
    expect(JSON.parse(pass2Before!).labels).toHaveLength(1);
  });

  it("goes back to the list from the error screen", () => {
    corrupt();
    vi.spyOn(console, "error").mockImplementation(() => {});
    begin(1, "Ada");
    click(button("Back to jobs"));
    expect(text("h1")).toBe("LabelForge");
  });
});

describe("when the browser's storage is blocked", () => {
  it("says so in plain words instead of failing", () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage")!;
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("The operation is insecure.");
      },
    });
    try {
      act(() => root.render(<App />));
      expect(text(".app-problem")).toContain("not available here");
      expect(text(".app-problem")).toContain("The operation is insecure.");
      expect(all(".app-job")).toHaveLength(0);
    } finally {
      Object.defineProperty(window, "localStorage", original);
    }
  });

  it("uses the browser's storage when it is available", () => {
    window.localStorage.clear();
    act(() => root.render(<App />));
    expect(all(".app-job")).toHaveLength(2);
    window.localStorage.clear();
  });
});

describe("each screen starts at the top of the page", () => {
  it("scrolls up when the view changes", () => {
    mount();
    const scrolls = vi.mocked(window.scrollTo);
    scrolls.mockClear();
    click(button("View results", job(0)));
    expect(scrolls).toHaveBeenCalledWith(0, 0);
  });
});
