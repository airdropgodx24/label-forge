/** Actions the shell owns (FR-S2). Choice keys (1, 2, 3, arrows) belong to each app's screen. */
export type ShellAction = "submit" | "skip";

/** The fields of a KeyboardEvent the shell looks at. */
export interface KeyLike {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  repeat: boolean;
  target: EventTarget | null;
}

/** Input types where typing is not text entry, so Enter and S still reach the shell. */
const NON_TEXT_INPUTS = new Set(["button", "checkbox", "radio", "range", "submit", "reset", "image"]);

function isTextEntry(target: EventTarget | null): boolean {
  const el = target as Partial<HTMLElement> | null;
  if (!el || typeof el.tagName !== "string") return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName.toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") return !NON_TEXT_INPUTS.has(((el as HTMLInputElement).type ?? "text").toLowerCase());
  return false;
}

/**
 * Maps a key press to a shell action: Enter submits, S skips.
 * Returns null for anything else, for modified keys, for auto-repeat (holding
 * Enter must not submit a run of tasks), and while the labeler is typing in a field.
 */
export function keyToAction(e: KeyLike): ShellAction | null {
  if (e.altKey || e.ctrlKey || e.metaKey || e.repeat) return null;
  if (isTextEntry(e.target)) return null;
  if (e.key === "Enter") return "submit";
  if (e.key === "s" || e.key === "S") return "skip";
  return null;
}
