import { describe, expect, it } from "vitest";
import { keyToAction, type KeyLike } from "../src/session";

const press = (key: string, extra: Partial<KeyLike> = {}): KeyLike => ({
  key,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  repeat: false,
  target: null,
  ...extra,
});

const el = (tagName: string, extra: Record<string, unknown> = {}) =>
  ({ tagName, isContentEditable: false, ...extra }) as unknown as EventTarget;

describe("keyToAction (FR-S2)", () => {
  it("maps Enter to submit and S (either case) to skip", () => {
    expect(keyToAction(press("Enter"))).toBe("submit");
    expect(keyToAction(press("s"))).toBe("skip");
    expect(keyToAction(press("S"))).toBe("skip");
  });

  it("leaves other keys to the app's screen", () => {
    for (const key of ["1", "2", "3", "a", "ArrowLeft", "ArrowRight", " ", "Escape"]) {
      expect(keyToAction(press(key)), key).toBeNull();
    }
  });

  it("ignores shortcuts with Ctrl, Alt or Meta held", () => {
    expect(keyToAction(press("s", { ctrlKey: true }))).toBeNull(); // Ctrl+S is the browser's save
    expect(keyToAction(press("s", { metaKey: true }))).toBeNull();
    expect(keyToAction(press("Enter", { altKey: true }))).toBeNull();
  });

  it("ignores auto-repeat so holding Enter cannot run through tasks", () => {
    expect(keyToAction(press("Enter", { repeat: true }))).toBeNull();
  });

  it("ignores keys typed into text fields", () => {
    expect(keyToAction(press("s", { target: el("INPUT", { type: "text" }) }))).toBeNull();
    expect(keyToAction(press("s", { target: el("INPUT") }))).toBeNull(); // no type given means text
    expect(keyToAction(press("Enter", { target: el("TEXTAREA") }))).toBeNull();
    expect(keyToAction(press("s", { target: el("SELECT") }))).toBeNull();
    expect(keyToAction(press("s", { target: el("DIV", { isContentEditable: true }) }))).toBeNull();
  });

  it("still works when a button, radio or checkbox has focus", () => {
    expect(keyToAction(press("Enter", { target: el("BUTTON") }))).toBe("submit");
    expect(keyToAction(press("s", { target: el("INPUT", { type: "radio" }) }))).toBe("skip");
    expect(keyToAction(press("Enter", { target: el("INPUT", { type: "checkbox" }) }))).toBe("submit");
    expect(keyToAction(press("s", { target: el("BODY") }))).toBe("skip");
  });
});
