/** What one Image Preference task holds in its payload (see data/sample-tasks.json). */
export interface ImagePreferencePayload {
  /** The job's instruction line, shown above the images. */
  instruction: string;
  /** Image A and B: a path under public/ such as "images/ip-01-a.svg", or a full URL. */
  imageA: string;
  imageB: string;
}

/** The label: which image the labeler picked, or Tie. */
export type ImagePreferenceValue = "A" | "B" | "tie";

export const PICKS: readonly ImagePreferenceValue[] = ["A", "B", "tie"];

/** Shown when a task has no instruction line of its own. */
export const DEFAULT_INSTRUCTION = "Pick the image you prefer.";

export function isPick(value: unknown): value is ImagePreferenceValue {
  return value === "A" || value === "B" || value === "tie";
}

/**
 * Reads a task payload, which the core passes through unchecked. Returns null
 * when either image reference is missing, so the screen can say so instead of
 * breaking the session. A missing instruction falls back to a plain default.
 */
export function readPayload(payload: unknown): ImagePreferencePayload | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.imageA !== "string" || p.imageA.trim() === "") return null;
  if (typeof p.imageB !== "string" || p.imageB.trim() === "") return null;
  const instruction = typeof p.instruction === "string" && p.instruction.trim() !== "" ? p.instruction : DEFAULT_INSTRUCTION;
  return { instruction, imageA: p.imageA, imageB: p.imageB };
}

/**
 * Turns an image reference into a URL the browser can load (FR-I3).
 * Full URLs (https:, http:, data:), protocol-relative (//host/x) and
 * root-relative (/x) references are used as they are. Anything else is a path
 * under public/ and is placed after `base`, which is how an app served from a
 * sub-path (for example GitHub Pages at /label-forge/) finds its images.
 */
export function resolveImageSrc(ref: string, base = ""): string {
  if (/^([a-z][a-z0-9+.-]*:|\/)/i.test(ref)) return ref;
  const path = ref.replace(/^\.\//, "");
  if (base === "") return path;
  return `${base.replace(/\/+$/, "")}/${path}`;
}
