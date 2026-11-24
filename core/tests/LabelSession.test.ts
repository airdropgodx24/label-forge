import { describe, expect, it } from "vitest";
import {
  LabelSession,
  SavedSessionError,
  checkSetup,
  clearSavedSession,
  loadSaved,
  memoryStore,
  storageKey,
  type KeyValueStore,
} from "../src/session";
import type { Pass } from "../src/types";
import { abType, fixedClock, job, makeTasks } from "./helpers";

function open(
  store: KeyValueStore,
  opts: { ids?: string[]; pass?: Pass; name?: string } = {},
) {
  return LabelSession.open({
    job,
    tasks: makeTasks(...(opts.ids ?? ["a", "b", "c"])),
    taskType: abType,
    pass: opts.pass ?? 1,
    labelerName: opts.name ?? "Ada",
    store,
    now: fixedClock,
  });
}

function label(session: LabelSession, value: string) {
  session.setDraft(value);
  return session.submit();
}

/** A store whose setItem throws on the given call numbers (1-based). */
function flakyStore(failOn: number[]) {
  const inner = memoryStore();
  let calls = 0;
  return {
    ...inner,
    setItem(key: string, value: string) {
      calls++;
      if (failOn.includes(calls)) throw new Error("storage full");
      inner.setItem(key, value);
    },
  };
}

describe("LabelSession: opening and progress (FR-S1)", () => {
  it("serves the first task and saves that it is in progress", () => {
    const store = memoryStore();
    const s = open(store);
    const v = s.getView();
    expect(v.task?.id).toBe("a");
    expect(v.labelerName).toBe("Ada");
    expect(v.pass).toBe(1);
    expect(v.progress).toEqual({
      total: 3, labeled: 0, flagged: 0, remaining: 3, handled: 0, position: 1, fraction: 0,
    });
    expect(loadSaved(store, job.id, 1)?.queue.entries["a"]?.state).toBe("in_progress");
  });

  it("trims and collapses whitespace in the name", () => {
    expect(open(memoryStore(), { name: "  Ada   Lovelace " }).getView().labelerName).toBe("Ada Lovelace");
  });

  it("handles a job with no tasks", () => {
    const v = open(memoryStore(), { ids: [] }).getView();
    expect(v.task).toBeUndefined();
    expect(v.finished).toBe(true);
    expect(v.progress.fraction).toBe(1);
  });
});

describe("LabelSession: submit (FR-S3)", () => {
  it("does not submit without an answer", () => {
    const s = open(memoryStore());
    expect(s.getView().canSubmit).toBe(false);
    expect(s.submit()).toEqual({ ok: false, reason: "incomplete" });
    expect(s.getView().task?.id).toBe("a");
  });

  it("does not submit an answer the task type calls unfinished", () => {
    const s = open(memoryStore());
    s.setDraft("nonsense");
    expect(s.getView().canSubmit).toBe(false);
    expect(s.submit()).toEqual({ ok: false, reason: "incomplete" });
    expect(s.getLabels()).toEqual([]);
  });

  it("stores the label immediately, stamped with name, pass and time, and advances", () => {
    const store = memoryStore();
    const s = open(store);
    s.setDraft("B");
    expect(s.getView().canSubmit).toBe(true);
    expect(s.submit()).toEqual({ ok: true });

    expect(s.getLabels()).toEqual([
      { taskId: "a", labelerName: "Ada", pass: 1, value: "B", createdAt: "2026-11-24T10:00:00.000Z" },
    ]);
    const v = s.getView();
    expect(v.task?.id).toBe("b");
    expect(v.canSubmit).toBe(false); // the draft does not carry over to the next task
    expect(v.progress).toMatchObject({ labeled: 1, handled: 1, position: 2, remaining: 2 });

    const saved = loadSaved(store, job.id, 1)!;
    expect(saved.queue.entries["a"]?.state).toBe("done");
    expect(saved.queue.entries["b"]?.state).toBe("in_progress");
    expect(saved.labels).toHaveLength(1);
  });

  it("finishes after the last task", () => {
    const s = open(memoryStore(), { ids: ["a"] });
    label(s, "A");
    const v = s.getView();
    expect(v.finished).toBe(true);
    expect(v.task).toBeUndefined();
    expect(v.progress).toMatchObject({ fraction: 1, position: 1 });
    expect(s.submit()).toEqual({ ok: false, reason: "no-task" });
    expect(s.skip()).toEqual({ ok: false, reason: "no-task" });
  });

  it("ignores setDraft when there is no current task", () => {
    const s = open(memoryStore(), { ids: [] });
    s.setDraft("A");
    expect(s.getView().canSubmit).toBe(false);
  });
});

describe("LabelSession: skip and re-queue (FR-Q3)", () => {
  it("first skip sends the task to the end; second skip flags it", () => {
    const s = open(memoryStore(), { ids: ["a", "b"] });
    expect(s.skip()).toEqual({ ok: true, flagged: false });
    expect(s.getView().task?.id).toBe("b");
    label(s, "A"); // b
    expect(s.getView().task?.id).toBe("a"); // a is back
    expect(s.skip()).toEqual({ ok: true, flagged: true });

    const v = s.getView();
    expect(v.task).toBeUndefined();
    expect(v.finished).toBe(true);
    expect(v.progress).toMatchObject({ labeled: 1, flagged: 1, handled: 2, fraction: 1 });
  });

  it("clears the draft when skipping", () => {
    const s = open(memoryStore());
    s.setDraft("A");
    s.skip();
    expect(s.getView().canSubmit).toBe(false);
  });

  it("serves a lone task again after a first skip", () => {
    const s = open(memoryStore(), { ids: ["a"] });
    s.skip();
    expect(s.getView().task?.id).toBe("a");
  });
});

describe("LabelSession: persistence and resume (FR-S3, FR-Q2)", () => {
  it("resumes at the same task with labels, skips and order intact", () => {
    const store = memoryStore();
    const first = open(store, { ids: ["a", "b", "c", "d"] });
    label(first, "A"); // a done
    first.skip(); // b re-queued at the end
    first.setDraft("B"); // unsaved draft on c is not persisted

    const again = open(store, { ids: ["a", "b", "c", "d"] });
    expect(again.getView().task?.id).toBe("c");
    expect(again.getView().canSubmit).toBe(false);
    expect(again.getLabels()).toEqual(first.getLabels());
    label(again, "A"); // c
    label(again, "B"); // d
    expect(again.getView().task?.id).toBe("b"); // the skipped task comes last
  });

  it("keeps a flagged task flagged after a reload", () => {
    const store = memoryStore();
    const first = open(store, { ids: ["a"] });
    first.skip();
    first.skip();
    const again = open(store, { ids: ["a"] });
    expect(again.getView().finished).toBe(true);
    expect(again.getView().progress.flagged).toBe(1);
  });

  it("keeps the name as first saved when continuing with different capitalisation", () => {
    const store = memoryStore();
    label(open(store, { name: "Ada" }), "A");
    const again = open(store, { name: "ada" });
    expect(again.getView().labelerName).toBe("Ada");
  });

  it("keeps Pass 1 and Pass 2 apart, and Pass 2 does not see Pass 1 labels", () => {
    const store = memoryStore();
    label(open(store, { pass: 1, name: "Ada" }), "A");
    const p2 = open(store, { pass: 2, name: "Grace" });
    expect(p2.getLabels()).toEqual([]);
    expect(p2.getView().task?.id).toBe("a");
    expect([...store.data.keys()].sort()).toEqual([storageKey(job.id, 1), storageKey(job.id, 2)]);
  });

  it("rolls back if the label cannot be stored", () => {
    // call 1 is the write in open(); call 2 is the write of the label
    const s = open(flakyStore([2]));
    s.setDraft("A");
    expect(() => s.submit()).toThrow("storage full");
    expect(s.getLabels()).toEqual([]);
    expect(s.getView().task?.id).toBe("a");
    expect(s.getView().canSubmit).toBe(true); // the draft survives so the labeler can retry
    expect(s.submit()).toEqual({ ok: true });
    expect(s.getView().task?.id).toBe("b");
  });

  it("rolls back a skip if it cannot be stored", () => {
    const s = open(flakyStore([2]));
    expect(() => s.skip()).toThrow("storage full");
    expect(s.getView().task?.id).toBe("a");
    expect(s.getView().progress.flagged).toBe(0);
    expect(s.skip()).toEqual({ ok: true, flagged: false });
  });

  it("finishes labeled -> done on reload if the second write was lost", () => {
    // call 1: open; call 2: label stored as "labeled"; call 3: the "done" write fails
    const store = flakyStore([3]);
    const s = open(store);
    s.setDraft("A");
    expect(() => s.submit()).toThrow("storage full");
    expect(loadSaved(store, job.id, 1)?.queue.entries["a"]?.state).toBe("labeled");

    const again = open(store);
    expect(again.getLabels()).toHaveLength(1);
    expect(again.getView().task?.id).toBe("b");
    expect(loadSaved(store, job.id, 1)?.queue.entries["a"]?.state).toBe("done");
  });

  it("refuses saved state that does not match the task file, and leaves it untouched", () => {
    const store = memoryStore();
    label(open(store, { ids: ["a", "b"] }), "A");
    const before = store.getItem(storageKey(job.id, 1));
    expect(() => open(store, { ids: ["a", "x"] })).toThrow(SavedSessionError);
    expect(store.getItem(storageKey(job.id, 1))).toBe(before);
  });

  it("refuses unreadable saved state", () => {
    const bad = memoryStore({ [storageKey(job.id, 1)]: "{not json" });
    expect(() => open(bad)).toThrow(SavedSessionError);
    const wrongShape = memoryStore({ [storageKey(job.id, 1)]: JSON.stringify({ version: 2 }) });
    expect(() => open(wrongShape)).toThrow(SavedSessionError);
  });

  it("clearSavedSession lets a labeler start over", () => {
    const store = memoryStore();
    label(open(store, { ids: ["a", "b"] }), "A");
    clearSavedSession(store, job.id, 1);
    const fresh = open(store, { ids: ["a", "x"] });
    expect(fresh.getView().task?.id).toBe("a");
    expect(fresh.getLabels()).toEqual([]);
  });
});

describe("LabelSession: subscription", () => {
  it("notifies on change, keeps the same view object otherwise, and can unsubscribe", () => {
    const s = open(memoryStore());
    let calls = 0;
    const off = s.subscribe(() => calls++);
    const v1 = s.getView();
    expect(s.getView()).toBe(v1);

    s.setDraft("A");
    expect(calls).toBe(1);
    expect(s.getView()).not.toBe(v1);

    s.submit();
    expect(calls).toBe(2);

    off();
    s.skip();
    expect(calls).toBe(2);
  });
});

describe("checkSetup: name and pass (FR-S4, FR-Q4)", () => {
  const args = (store: KeyValueStore, pass: Pass, labelerName: string) => ({
    store, jobId: job.id, pass, labelerName,
  });

  it("accepts a fresh name", () => {
    expect(checkSetup(args(memoryStore(), 1, "Ada"))).toBeNull();
  });

  it("rejects an empty or too long name", () => {
    expect(checkSetup(args(memoryStore(), 1, "   "))).toMatch(/Enter a name/);
    expect(checkSetup(args(memoryStore(), 1, "x".repeat(41)))).toMatch(/40 characters/);
  });

  it("requires the same name to continue a pass that already has labels", () => {
    const store = memoryStore();
    label(open(store, { name: "Ada" }), "A");
    expect(checkSetup(args(store, 1, "Ada"))).toBeNull();
    expect(checkSetup(args(store, 1, " ada "))).toBeNull();
    expect(checkSetup(args(store, 1, "Grace"))).toMatch(/already has labels from Ada/);
  });

  it("lets a name be changed on a pass that has no labels yet", () => {
    const store = memoryStore();
    open(store, { name: "Ada" });
    expect(checkSetup(args(store, 1, "Grace"))).toBeNull();
  });

  it("requires a different name for the other pass, in both directions", () => {
    const store = memoryStore();
    open(store, { pass: 1, name: "Ada" });
    expect(checkSetup(args(store, 2, "ADA"))).toMatch(/Pass 1 was labeled by Ada/);
    expect(checkSetup(args(store, 2, "Grace"))).toBeNull();

    const store2 = memoryStore();
    open(store2, { pass: 2, name: "Grace" });
    expect(checkSetup(args(store2, 1, "Grace"))).toMatch(/Pass 2 was labeled by Grace/);
  });

  it("is enforced when opening a session", () => {
    const store = memoryStore();
    open(store, { pass: 1, name: "Ada" });
    expect(() => open(store, { pass: 2, name: "Ada" })).toThrow(/different name/);
    expect(() => open(store, { name: "" })).toThrow(/Enter a name/);
  });
});
