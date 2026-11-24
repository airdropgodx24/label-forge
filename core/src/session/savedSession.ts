import type { QueueSnapshot } from "../queue";
import type { Label, Pass } from "../types";
import type { KeyValueStore } from "./storage";

export const MAX_NAME_LENGTH = 40;

/** What is kept in local storage for one job and one pass (design: "a key per job and pass"). */
export interface SavedSession {
  version: 1;
  labelerName: string;
  queue: QueueSnapshot;
  labels: Label[];
}

export class SavedSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SavedSessionError";
  }
}

export function storageKey(jobId: string, pass: Pass): string {
  return `labelforge:${jobId}:pass${pass}`;
}

export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

function sameName(a: string, b: string): boolean {
  return normalizeName(a).toLowerCase() === normalizeName(b).toLowerCase();
}

/** Reads and shape-checks the saved state. Returns undefined if nothing is saved; throws if it is unreadable. */
export function loadSaved(store: KeyValueStore, jobId: string, pass: Pass): SavedSession | undefined {
  const key = storageKey(jobId, pass);
  const raw = store.getItem(key);
  if (raw === null) return undefined;

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new SavedSessionError(`Saved state under "${key}" is not valid JSON`);
  }
  const s = data as Partial<SavedSession> | null;
  if (
    !s ||
    s.version !== 1 ||
    typeof s.labelerName !== "string" ||
    !s.queue ||
    !Array.isArray(s.queue.order) ||
    typeof s.queue.entries !== "object" ||
    s.queue.entries === null ||
    !Array.isArray(s.labels)
  ) {
    throw new SavedSessionError(`Saved state under "${key}" has an unexpected shape`);
  }
  return s as SavedSession;
}

export function saveSession(store: KeyValueStore, jobId: string, pass: Pass, saved: SavedSession): void {
  store.setItem(storageKey(jobId, pass), JSON.stringify(saved));
}

/** Deletes the saved state for one job and pass. The way out when saved state no longer matches the task file. */
export function clearSavedSession(store: KeyValueStore, jobId: string, pass: Pass): void {
  store.removeItem(storageKey(jobId, pass));
}

/** The name saved for a pass, if any. Lets the setup form prefill when resuming. */
export function savedLabelerName(store: KeyValueStore, jobId: string, pass: Pass): string | undefined {
  try {
    return loadSaved(store, jobId, pass)?.labelerName;
  } catch {
    return undefined;
  }
}

/**
 * Checks the labeler name and pass chosen on the job screen (FR-S4, FR-Q4).
 * Returns a plain-English problem, or null if the choice is fine.
 *
 * - The name must not be empty or longer than MAX_NAME_LENGTH.
 * - A pass that already holds labels can only be continued under the same name.
 * - Pass 2 must use a different name than Pass 1 (and the reverse), so the two
 *   passes are independent labelers.
 */
export function checkSetup(args: {
  store: KeyValueStore;
  jobId: string;
  pass: Pass;
  labelerName: string;
}): string | null {
  const { store, jobId, pass } = args;
  const name = normalizeName(args.labelerName);
  if (name === "") return "Enter a name.";
  if (name.length > MAX_NAME_LENGTH) return `Use a name of ${MAX_NAME_LENGTH} characters or fewer.`;

  const own = loadSaved(store, jobId, pass);
  if (own && own.labels.length > 0 && !sameName(own.labelerName, name)) {
    return `Pass ${pass} already has labels from ${own.labelerName}. Use that name to continue.`;
  }

  const otherPass: Pass = pass === 1 ? 2 : 1;
  const other = loadSaved(store, jobId, otherPass);
  if (other && sameName(other.labelerName, name)) {
    return `Pass ${otherPass} was labeled by ${other.labelerName}. Use a different name for Pass ${pass}.`;
  }
  return null;
}
