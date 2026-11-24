// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "../../../core/src/types";
import { AGREEMENT_NOTE, ResponseRankingScreen } from "../src";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LONG = Array.from({ length: 40 }, (_, i) => `Sentence number ${i + 1} of a long response.`).join(" ");
const CODE = "Use None as the default:\n\n    def add_item(item, items=None):\n        if items is None:\n            items = []\n        return items";

const payload = {
  prompt: "Why does this function behave strangely?\n\nCode:\n\n    def f(x=[]):\n        return x",
  responses: [
    { id: "r1", text: "Short answer." },
    { id: "r2", text: CODE },
    { id: "r3", text: LONG },
  ],
};
const task = (p: unknown = payload, id = "rr-01"): Task => ({ id, jobId: "j", type: "response-ranking", payload: p });

let container: HTMLDivElement;
let root: Root;
let onChange: ReturnType<typeof vi.fn<(v: string[]) => void>>;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  onChange = vi.fn();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollHeight;
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientHeight;
});

function mount(t: Task = task()) {
  act(() => root.render(<ResponseRankingScreen task={t} onChange={onChange} />));
}
const q = (sel: string) => container.querySelector(sel) as HTMLElement;
const all = (sel: string) => [...container.querySelectorAll(sel)] as HTMLElement[];
const text = (sel: string) => q(sel)?.textContent ?? "";
const order = () => all(".rr-card").map((c) => c.dataset.response);
const card = (id: string) => q(`.rr-card[data-response="${id}"]`);
const press = (key: string, init: KeyboardEventInit = {}, target: EventTarget = document) =>
  act(() => void target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init })));
const click = (el: HTMLElement) => act(() => void el.click());
const last = () => onChange.mock.calls.at(-1)?.[0];
const fire = (el: Element, type: string) => {
  const e = new Event(type, { bubbles: true, cancelable: true });
  act(() => void el.dispatchEvent(e));
  return e;
};

describe("layout (FR-R1)", () => {
  it("shows the prompt first, in full, with its line breaks and indentation", () => {
    mount();
    const screen = q(".rr-screen");
    expect(screen.firstElementChild).toBe(q(".rr-prompt"));
    expect(text(".rr-prompt-text")).toBe(payload.prompt);
    expect(q(".rr-prompt-text").style.whiteSpace).toBe("pre-wrap");
    expect(q(".rr-prompt").compareDocumentPosition(q(".rr-list")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows one card per response, in file order to start, each numbered with its key", () => {
    mount();
    expect(order()).toEqual(["r1", "r2", "r3"]);
    expect(all(".rr-number").map((n) => n.textContent)).toEqual(["Response 1 1", "Response 2 2", "Response 3 3"]);
  });

  it("starts with nothing ranked and reports no label", () => {
    mount();
    expect(all(".rr-rank").map((r) => r.textContent)).toEqual(["Not ranked", "Not ranked", "Not ranked"]);
    expect(onChange).not.toHaveBeenCalled();
    expect(q(".rr-reset")).toBeNull();
    expect(text(".rr-status")).toBe("Not ranked yet. Press the numbers from best to worst, or use the arrows or drag the cards.");
  });

  it("works with two responses and with four", () => {
    mount(task({ prompt: "p", responses: payload.responses.slice(0, 2) }));
    expect(order()).toEqual(["r1", "r2"]);
    mount(task({ prompt: "p", responses: [...payload.responses, { id: "r4", text: "Fourth." }] }, "rr-02"));
    expect(order()).toEqual(["r1", "r2", "r3", "r4"]);
  });

  it("says that agreement is scored on the top-ranked response only", () => {
    mount();
    expect(text(".rr-note")).toBe("Agreement between labelers is scored on the top-ranked response only.");
    expect(AGREEMENT_NOTE).toBe(text(".rr-note"));
  });
});

describe("long responses scroll inside their card (FR-R3)", () => {
  it("holds every response's full text, unchanged, in a box with a maximum height and its own scrolling", () => {
    mount();
    for (const r of payload.responses) {
      const box = card(r.id)!.querySelector(".rr-text") as HTMLElement;
      expect(box.textContent, r.id).toBe(r.text); // all of it, none cut
      expect(box.style.maxHeight, r.id).toBe("240px");
      expect(box.style.overflowY, r.id).toBe("auto");
      expect(box.style.whiteSpace, r.id).toBe("pre-wrap");
    }
  });

  it("lets the keyboard reach the scrolling box", () => {
    mount();
    for (const box of all(".rr-text")) {
      expect(box.getAttribute("tabindex")).toBe("0");
      expect(box.getAttribute("role")).toBe("region");
    }
    expect(all(".rr-text").map((b) => b.getAttribute("aria-label"))).toEqual(["Response 1 text", "Response 2 text", "Response 3 text"]);
  });

  it("tells the labeler when a response is longer than its box, and only then", () => {
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get(this: HTMLElement) {
        return this.className === "rr-text" ? (this.textContent!.length > 200 ? 600 : 80) : 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get(this: HTMLElement) {
        return this.className === "rr-text" ? 240 : 0;
      },
    });
    mount();
    expect(all(".rr-scroll-hint")).toHaveLength(1);
    expect(card("r3").querySelector(".rr-scroll-hint")?.textContent).toBe("Scroll inside the box to read the rest of this response.");
    expect(card("r1").querySelector(".rr-scroll-hint")).toBeNull();
  });

  it("keeps the whole text in the box when a card moves", () => {
    mount();
    click(card("r3").querySelector(".rr-up") as HTMLElement);
    expect((card("r3").querySelector(".rr-text") as HTMLElement).textContent).toBe(LONG);
  });

  it("shows a response with no text as such, not as a blank box", () => {
    mount(task({ prompt: "p", responses: [{ id: "r1", text: "" }, { id: "r2", text: "x" }] }));
    expect((card("r1").querySelector(".rr-text") as HTMLElement).textContent).toBe("(empty response)");
  });
});

describe("number keys in ranking order (FR-R1)", () => {
  it("rank the responses as they are pressed, moving the cards and numbering the ranks", () => {
    mount();
    press("3");
    expect(order()).toEqual(["r3", "r1", "r2"]);
    expect(all(".rr-rank").map((r) => r.textContent)).toEqual(["Rank 1", "Not ranked", "Not ranked"]);
    expect(text(".rr-status")).toBe("Ranked 1 of 3. Press the number of the next best response.");
    press("1");
    press("2");
    expect(order()).toEqual(["r3", "r1", "r2"]);
    expect(all(".rr-rank").map((r) => r.textContent)).toEqual(["Rank 1", "Rank 2", "Rank 3"]);
    expect(text(".rr-status")).toBe("Ranking complete, best at the top. Press Enter to submit, or change the order.");
  });

  it("report an empty label until every response is placed, then the full order", () => {
    mount();
    press("2");
    press("3");
    expect(onChange.mock.calls.map((c) => c[0])).toEqual([[], []]); // two of three placed: still unfinished
    press("1");
    expect(last()).toEqual(["r2", "r3", "r1"]);
  });

  it("work with two responses", () => {
    mount(task({ prompt: "p", responses: payload.responses.slice(0, 2) }));
    press("2");
    press("1");
    expect(last()).toEqual(["r2", "r1"]);
  });

  it("ignore a repeated number and a number with no response", () => {
    mount();
    press("2");
    press("2");
    press("4");
    press("9");
    press("0");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(order()).toEqual(["r2", "r1", "r3"]);
  });

  it("start a new ranking when pressed after the ranking is complete, and clear the old label", () => {
    mount();
    press("1");
    press("2");
    press("3");
    expect(last()).toEqual(["r1", "r2", "r3"]);
    press("3");
    expect(last()).toEqual([]); // the earlier full ranking is no longer reported
    expect(order()).toEqual(["r3", "r1", "r2"]);
    expect(all(".rr-rank").map((r) => r.textContent)).toEqual(["Rank 1", "Not ranked", "Not ranked"]);
  });

  it("ignore other keys, shortcuts with Ctrl, Alt or Meta, and typing in a text field", () => {
    mount();
    for (const key of ["a", "s", "Enter", "ArrowUp", " ", "Escape"]) press(key);
    press("1", { ctrlKey: true });
    press("2", { altKey: true });
    press("3", { metaKey: true });
    const input = document.body.appendChild(document.createElement("input"));
    press("1", {}, input);
    input.remove();
    expect(onChange).not.toHaveBeenCalled();
    expect(order()).toEqual(["r1", "r2", "r3"]);
  });

  it("still work while a response's scrolling box has focus", () => {
    mount();
    const box = card("r3").querySelector(".rr-text") as HTMLElement;
    box.focus();
    press("2", {}, box);
    expect(order()).toEqual(["r2", "r1", "r3"]);
  });

  it("leave Enter and S to the core shell", () => {
    mount();
    const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    act(() => void document.dispatchEvent(enter));
    expect(enter.defaultPrevented).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("stop listening once the screen is gone", () => {
    mount();
    act(() => root.unmount());
    root = createRoot(container);
    press("1");
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("arrows (FR-R1)", () => {
  it("move a card one place, and the order on screen becomes the ranking", () => {
    mount();
    click(card("r1").querySelector(".rr-down") as HTMLElement);
    expect(order()).toEqual(["r2", "r1", "r3"]);
    expect(last()).toEqual(["r2", "r1", "r3"]);
    expect(all(".rr-rank").map((r) => r.textContent)).toEqual(["Rank 1", "Rank 2", "Rank 3"]);
    click(card("r3").querySelector(".rr-up") as HTMLElement);
    expect(last()).toEqual(["r2", "r3", "r1"]);
  });

  it("are disabled where a card cannot move, and named for screen readers", () => {
    mount();
    expect((card("r1").querySelector(".rr-up") as HTMLButtonElement).disabled).toBe(true);
    expect((card("r3").querySelector(".rr-down") as HTMLButtonElement).disabled).toBe(true);
    expect((card("r2").querySelector(".rr-up") as HTMLButtonElement).disabled).toBe(false);
    expect(card("r2").querySelector(".rr-up")!.getAttribute("aria-label")).toBe("Move response 2 up");
    expect(card("r2").querySelector(".rr-down")!.getAttribute("aria-label")).toBe("Move response 2 down");
  });

  it("finish a ranking begun with number keys", () => {
    mount();
    press("3");
    click(card("r2").querySelector(".rr-up") as HTMLElement);
    expect(order()).toEqual(["r3", "r2", "r1"]);
    expect(last()).toEqual(["r3", "r2", "r1"]);
  });
});

describe("dragging (FR-R1)", () => {
  const handle = (id: string) => card(id).querySelector(".rr-handle") as HTMLElement;

  it("moves a dragged card to the place of the card it is dropped on", () => {
    mount();
    fire(handle("r1"), "dragstart");
    expect(fire(card("r3"), "dragover").defaultPrevented).toBe(true); // dropping here is allowed
    fire(card("r3"), "drop");
    expect(order()).toEqual(["r2", "r3", "r1"]);
    expect(last()).toEqual(["r2", "r3", "r1"]);
  });

  it("can drag a card upward", () => {
    mount();
    fire(handle("r3"), "dragstart");
    fire(card("r1"), "drop");
    expect(order()).toEqual(["r3", "r1", "r2"]);
  });

  it("changes nothing when dropped on itself, and clears the drag when it ends", () => {
    mount();
    fire(handle("r2"), "dragstart");
    fire(card("r2"), "drop");
    expect(onChange).not.toHaveBeenCalled();
    fire(handle("r2"), "dragstart");
    fire(handle("r2"), "dragend");
    expect(card("r2").style.opacity).toBe("1");
    expect(fire(card("r3"), "dragover").defaultPrevented).toBe(false); // nothing is being dragged now
    fire(card("r3"), "drop");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ignores a drop when nothing was dragged", () => {
    mount();
    fire(card("r1"), "drop");
    expect(onChange).not.toHaveBeenCalled();
    expect(order()).toEqual(["r1", "r2", "r3"]);
  });

  it("dims the card being dragged", () => {
    mount();
    fire(handle("r2"), "dragstart");
    expect(card("r2").style.opacity).toBe("0.5");
    expect(card("r1").style.opacity).toBe("1");
  });
});

describe("start over", () => {
  it("appears once something is ranked, restores file order, and clears the reported label", () => {
    mount();
    press("3");
    press("1");
    press("2");
    expect(last()).toEqual(["r3", "r1", "r2"]);
    click(q(".rr-reset"));
    expect(order()).toEqual(["r1", "r2", "r3"]);
    expect(all(".rr-rank").map((r) => r.textContent)).toEqual(["Not ranked", "Not ranked", "Not ranked"]);
    expect(last()).toEqual([]);
    expect(q(".rr-reset")).toBeNull();
  });
});

describe("a new task starts fresh", () => {
  it("drops the ranking when the task changes", () => {
    mount();
    press("2");
    mount(task(payload, "rr-02"));
    expect(order()).toEqual(["r1", "r2", "r3"]);
    expect(all(".rr-rank").map((r) => r.textContent)).toEqual(["Not ranked", "Not ranked", "Not ranked"]);
  });
});

describe("a task with a bad payload does not break the session", () => {
  it.each([
    ["no payload fields", {}],
    ["no prompt", { responses: payload.responses }],
    ["a blank prompt", { prompt: "  ", responses: payload.responses }],
    ["one response", { prompt: "p", responses: [{ id: "r1", text: "a" }] }],
    ["five responses", { prompt: "p", responses: ["a", "b", "c", "d", "e"].map((t, i) => ({ id: `r${i}`, text: t })) }],
    ["a repeated response id", { prompt: "p", responses: [{ id: "r1", text: "a" }, { id: "r1", text: "b" }] }],
    ["a response with no id", { prompt: "p", responses: [{ text: "a" }, { id: "r2", text: "b" }] }],
    ["a response with no text", { prompt: "p", responses: [{ id: "r1" }, { id: "r2", text: "b" }] }],
    ["responses that are not a list", { prompt: "p", responses: "oops" }],
    ["a payload that is not an object", "oops"],
    ["a null payload", null],
  ])("shows a plain message for %s", (_name, bad) => {
    expect(() => mount(task(bad))).not.toThrow();
    expect(text(".rr-problem")).toBe("This task needs a prompt and 2 to 4 responses, so it cannot be ranked. Skip it.");
    expect(q(".rr-problem").getAttribute("role")).toBe("alert");
    expect(q(".rr-list")).toBeNull();
  });

  it("does not record a ranking by key when the task is unusable", () => {
    mount(task({}));
    press("1");
    press("2");
    expect(onChange).not.toHaveBeenCalled();
  });
});
