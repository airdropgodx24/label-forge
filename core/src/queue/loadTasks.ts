import type { Task } from "../types";

export class TaskLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskLoadError";
  }
}

/**
 * Loads a job's tasks from JSON (FR-Q1).
 *
 * `source` is the JSON text or the already-parsed value. The file is an array
 * in serving order; each entry has `id`, `type` and `payload`. `jobId` is
 * stamped onto every task; an entry may carry its own `jobId` only if it
 * matches. The payload is not inspected: it belongs to the task type.
 */
export function loadTasks(source: unknown, jobId: string): Task[] {
  let data = source;
  if (typeof source === "string") {
    try {
      data = JSON.parse(source);
    } catch (err) {
      throw new TaskLoadError(`Task file is not valid JSON: ${(err as Error).message}`);
    }
  }
  if (!Array.isArray(data)) {
    throw new TaskLoadError("Task file must be a JSON array of tasks");
  }

  const seen = new Set<string>();
  return data.map((raw: unknown, index): Task => {
    const where = `Task at index ${index}`;
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      throw new TaskLoadError(`${where} must be an object`);
    }
    const entry = raw as Record<string, unknown>;

    const { id, type } = entry;
    if (typeof id !== "string" || id === "") {
      throw new TaskLoadError(`${where} needs a non-empty string "id"`);
    }
    if (typeof type !== "string" || type === "") {
      throw new TaskLoadError(`Task "${id}" needs a non-empty string "type"`);
    }
    if (!("payload" in entry) || entry.payload === undefined || entry.payload === null) {
      throw new TaskLoadError(`Task "${id}" needs a "payload"`);
    }
    if ("jobId" in entry && entry.jobId !== jobId) {
      throw new TaskLoadError(
        `Task "${id}" has jobId ${JSON.stringify(entry.jobId)}, expected "${jobId}"`,
      );
    }
    if (seen.has(id)) {
      throw new TaskLoadError(`Duplicate task id "${id}"`);
    }
    seen.add(id);

    return { id, jobId, type, payload: entry.payload };
  });
}
