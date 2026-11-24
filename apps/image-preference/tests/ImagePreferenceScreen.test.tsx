// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "../../../core/src/types";
import { ImagePreferenceScreen, type ImagePreferenceValue } from "../src";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const task = (payload: unknown, id = "ip-01"): Task => ({ id, jobId: "j", type: "image-preference", payload });
const good = task({
  instruction: "Pick the image that better matches: a calm morning scene",
  imageA: "images/ip-01-a.svg",
  imageB: "images/ip-01-b.svg",
});

let container: HTMLDivElement;
let root: Root;
let onChange: ReturnType<typeof vi.fn<(v: ImagePreferenceValue) => void>>;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  onChange = vi.fn();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function mount(t: Task = good, imageBase?: string) {
  act(() => root.render(<ImagePreferenceScreen task={t} onChange={onChange} imageBase={imageBase} />));
}
const q = (sel: string) => container.querySelector(sel) as HTMLElement;
const all = (sel: string) => [...container.querySelectorAll(sel)] as HTMLElement[];
const text = (sel: string) => q(sel)?.textContent ?? "";
const choice = (name: string) => q(`.ip-choice-${name}`) as HTMLButtonElement;
const press = (key: string, init: KeyboardEventInit = {}, target: EventTarget = document) =>
  act(() => void target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init })));
const failImage = (which: "A" | "B") =>
  act(() => void q(`.ip-option-${which} img`).dispatchEvent(new Event("error")));

describe("layout (FR-I1)", () => {
  it("shows the instruction line above the images", () => {
    mount();
    expect(text(".ip-instruction")).toBe("Pick the image that better matches: a calm morning scene");
    const screen = q(".ip-screen");
    expect(screen.firstElementChild).toBe(q(".ip-instruction"));
    expect(q(".ip-instruction").compareDocumentPosition(q(".ip-images")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows two images side by side, A on the left and B on the right, labeled A and B", () => {
    mount();
    const options = all(".ip-option");
    expect(options.map((o) => o.querySelector(".ip-label")?.textContent)).toEqual(["A", "B"]);
    expect(all(".ip-image").map((i) => i.getAttribute("src"))).toEqual(["images/ip-01-a.svg", "images/ip-01-b.svg"]);
    expect(all(".ip-image").map((i) => i.getAttribute("alt"))).toEqual(["Image A", "Image B"]);
    expect(q(".ip-images").style.gridTemplateColumns).toBe("1fr 1fr"); // two equal columns in one row
  });

  it("gives both images the same size", () => {
    mount();
    const [a, b] = all(".ip-image");
    for (const prop of ["width", "aspectRatio", "objectFit", "boxSizing"] as const) {
      expect(a!.style[prop], prop).toBe(b!.style[prop]);
      expect(a!.style[prop], prop).not.toBe("");
    }
  });

  it("falls back to a plain default when the task has no instruction line", () => {
    mount(task({ imageA: "a.svg", imageB: "b.svg" }));
    expect(text(".ip-instruction")).toBe("Pick the image you prefer.");
  });

  it("offers A, B and Tie, each showing its key", () => {
    mount();
    expect(all(".ip-choice").map((b) => b.textContent)).toEqual(["A 1", "B 2", "Tie 3"]);
    expect(q(".ip-choices").getAttribute("role")).toBe("radiogroup");
    expect(all(".ip-choice").every((b) => b.getAttribute("aria-checked") === "false")).toBe(true);
  });
});

describe("choosing (FR-I2)", () => {
  it.each([
    ["A", "A"],
    ["B", "B"],
    ["tie", "tie"],
  ] as const)("clicking %s labels the task %s", (name, value) => {
    mount();
    act(() => void choice(name).click());
    expect(onChange).toHaveBeenCalledExactlyOnceWith(value);
    expect(choice(name).getAttribute("aria-checked")).toBe("true");
  });

  it.each([
    ["1", "A"],
    ["2", "B"],
    ["3", "tie"],
  ] as const)("key %s labels the task %s", (key, value) => {
    mount();
    press(key);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(value);
    expect(all(".ip-choice").filter((b) => b.getAttribute("aria-checked") === "true")).toHaveLength(1);
  });

  it("changing the pick moves the mark and reports the new value", () => {
    mount();
    press("1");
    press("3");
    expect(onChange.mock.calls.map((c) => c[0])).toEqual(["A", "tie"]);
    expect(choice("A").getAttribute("aria-checked")).toBe("false");
    expect(choice("tie").getAttribute("aria-checked")).toBe("true");
  });

  it("ignores other keys, shortcuts with Ctrl, Alt or Meta, and typing in a text field", () => {
    mount();
    for (const key of ["0", "4", "a", "b", "t", "ArrowLeft", " "]) press(key);
    press("1", { ctrlKey: true });
    press("2", { altKey: true });
    press("3", { metaKey: true });
    const input = document.body.appendChild(document.createElement("input"));
    press("1", {}, input);
    input.remove();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("leaves Enter and S to the core shell", () => {
    mount();
    const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    const skip = new KeyboardEvent("keydown", { key: "s", bubbles: true, cancelable: true });
    act(() => void document.dispatchEvent(enter));
    act(() => void document.dispatchEvent(skip));
    expect(onChange).not.toHaveBeenCalled();
    expect(enter.defaultPrevented).toBe(false);
    expect(skip.defaultPrevented).toBe(false);
  });

  it("stops listening for keys once the screen is gone", () => {
    mount();
    act(() => root.unmount());
    root = createRoot(container);
    press("1");
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("broken images (FR-I3)", () => {
  it("replaces a failed image with a plain-text placeholder and keeps the other image", () => {
    mount();
    failImage("A");
    expect(text(".ip-option-A .ip-placeholder")).toBe("Image A could not be loaded.");
    expect(q(".ip-option-A .ip-placeholder").getAttribute("role")).toBe("img");
    expect(q(".ip-option-A img")).toBeNull();
    expect(q(".ip-option-B img")).not.toBeNull();
    expect(q(".ip-option-B .ip-placeholder")).toBeNull();
    expect(text(".ip-option-A .ip-label")).toBe("A"); // still labeled
  });

  it("handles both images failing", () => {
    mount();
    failImage("A");
    failImage("B");
    expect(all(".ip-placeholder").map((p) => p.textContent)).toEqual([
      "Image A could not be loaded.",
      "Image B could not be loaded.",
    ]);
  });

  it("gives the placeholder the same size as an image, so the layout does not jump", () => {
    mount();
    const before = q(".ip-option-A img").style;
    const [w, ratio] = [before.width, before.aspectRatio];
    failImage("A");
    const ph = q(".ip-option-A .ip-placeholder").style;
    expect([ph.width, ph.aspectRatio]).toEqual([w, ratio]);
  });

  it("still lets the labeler pick after an image fails", () => {
    mount();
    failImage("B");
    press("2");
    act(() => void choice("tie").click());
    expect(onChange.mock.calls.map((c) => c[0])).toEqual(["B", "tie"]);
  });

  it("tries again with a new image when the task changes", () => {
    mount();
    failImage("A");
    mount(task({ instruction: "x", imageA: "images/ip-02-a.svg", imageB: "images/ip-01-b.svg" }, "ip-02"));
    expect(q(".ip-option-A .ip-placeholder")).toBeNull();
    expect(q(".ip-option-A img").getAttribute("src")).toBe("images/ip-02-a.svg");
  });

  it("loads images from URLs in the payload as given, and from local paths under a base", () => {
    mount(task({ instruction: "x", imageA: "https://example.com/a.png", imageB: "images/b.svg" }), "/label-forge/");
    expect(all(".ip-image").map((i) => i.getAttribute("src"))).toEqual([
      "https://example.com/a.png",
      "/label-forge/images/b.svg",
    ]);
  });
});

describe("a task with a bad payload does not break the session", () => {
  it.each([
    ["no payload fields", {}],
    ["no imageB", { imageA: "a.svg" }],
    ["an empty imageA", { imageA: "  ", imageB: "b.svg" }],
    ["a payload that is not an object", "oops"],
    ["a null payload", null],
    ["numbers for images", { imageA: 1, imageB: 2 }],
  ])("shows a plain message for %s", (_name, payload) => {
    expect(() => mount(task(payload))).not.toThrow();
    expect(text(".ip-problem")).toBe("This task is missing its images, so it cannot be labeled. Skip it.");
    expect(q(".ip-problem").getAttribute("role")).toBe("alert");
    expect(q(".ip-choices")).toBeNull();
  });

  it("does not record a pick by key when the task has no images", () => {
    mount(task({}));
    press("1");
    expect(onChange).not.toHaveBeenCalled();
  });
});
