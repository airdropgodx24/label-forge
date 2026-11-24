import { describe, expect, it } from "vitest";
import { InvalidTransitionError, TaskQueue } from "../src/queue";
import type { Task } from "../src/types";

function makeTasks(...ids: string[]): Task[] {
  return ids.map((id) => ({ id, jobId: "job-1", type: "test", payload: { n: id } }));
}

function servedIds(queue: TaskQueue, max = 50): string[] {
  const out: string[] = [];
  for (let i = 0; i < max; i++) {
    const t = queue.next();
    if (!t) break;
    out.push(t.id);
    queue.submit(t.id);
    queue.markDone(t.id);
  }
  return out;
}

describe("TaskQueue: serving order and the happy path", () => {
  it("starts with every task pending", () => {
    const q = new TaskQueue(makeTasks("a", "b", "c"));
    expect(q.counts()).toEqual({ pending: 3, in_progress: 0, labeled: 0, skipped: 0, done: 0 });
    expect(q.current()).toBeUndefined();
  });

  it("serves tasks in file order", () => {
    const q = new TaskQueue(makeTasks("a", "b", "c"));
    expect(servedIds(q)).toEqual(["a", "b", "c"]);
  });

  it("pending -> in_progress when served", () => {
    const q = new TaskQueue(makeTasks("a", "b"));
    const t = q.next();
    expect(t?.id).toBe("a");
    expect(q.state("a")).toBe("in_progress");
    expect(q.state("b")).toBe("pending");
    expect(q.current()?.id).toBe("a");
  });

  it("returns the same task from next() until it is resolved", () => {
    const q = new TaskQueue(makeTasks("a", "b"));
    expect(q.next()?.id).toBe("a");
    expect(q.next()?.id).toBe("a");
    expect(q.state("b")).toBe("pending");
  });

  it("in_progress -> labeled on submit", () => {
    const q = new TaskQueue(makeTasks("a"));
    q.next();
    q.submit("a");
    expect(q.state("a")).toBe("labeled");
    expect(q.current()).toBeUndefined();
  });

  it("labeled -> done on markDone", () => {
    const q = new TaskQueue(makeTasks("a"));
    q.next();
    q.submit("a");
    q.markDone("a");
    expect(q.state("a")).toBe("done");
  });

  it("returns undefined and reports finished when nothing is left", () => {
    const q = new TaskQueue(makeTasks("a"));
    expect(q.isFinished()).toBe(false);
    servedIds(q);
    expect(q.next()).toBeUndefined();
    expect(q.isFinished()).toBe(true);
  });

  it("handles an empty queue", () => {
    const q = new TaskQueue([]);
    expect(q.next()).toBeUndefined();
    expect(q.isFinished()).toBe(true);
  });

  it("rejects duplicate task ids", () => {
    expect(() => new TaskQueue(makeTasks("a", "a"))).toThrow(/Duplicate/);
  });
});

describe("TaskQueue: skip and re-queue (FR-Q3)", () => {
  it("first skip re-queues the task as pending at the end", () => {
    const q = new TaskQueue(makeTasks("a", "b", "c"));
    q.next();
    q.skip("a");
    expect(q.state("a")).toBe("pending");
    expect(q.skipCount("a")).toBe(1);
    expect(q.isFlagged("a")).toBe(false);
    expect(q.next()?.id).toBe("b");
  });

  it("serves a skipped task again after the rest of the queue", () => {
    const q = new TaskQueue(makeTasks("a", "b", "c"));
    q.next();
    q.skip("a");
    expect(servedIds(q)).toEqual(["b", "c", "a"]);
  });

  it("places several skipped tasks at the end in the order they were skipped", () => {
    const q = new TaskQueue(makeTasks("a", "b", "c", "d"));
    q.next();
    q.skip("a");
    q.next(); // b
    q.skip("b");
    expect(servedIds(q)).toEqual(["c", "d", "a", "b"]);
  });

  it("a re-queued task can still be labeled to done", () => {
    const q = new TaskQueue(makeTasks("a"));
    q.next();
    q.skip("a");
    expect(q.next()?.id).toBe("a");
    q.submit("a");
    q.markDone("a");
    expect(q.state("a")).toBe("done");
    expect(q.skipCount("a")).toBe(1);
  });

  it("second skip leaves the task skipped and flagged", () => {
    const q = new TaskQueue(makeTasks("a", "b"));
    q.next();
    q.skip("a");
    q.next(); // b
    q.submit("b");
    q.markDone("b");
    expect(q.next()?.id).toBe("a");
    q.skip("a");
    expect(q.state("a")).toBe("skipped");
    expect(q.skipCount("a")).toBe(2);
    expect(q.isFlagged("a")).toBe(true);
  });

  it("never serves a flagged task again and does not hold the queue open", () => {
    const q = new TaskQueue(makeTasks("a"));
    q.next();
    q.skip("a");
    q.next();
    q.skip("a");
    expect(q.next()).toBeUndefined();
    expect(q.isFinished()).toBe(true);
    expect(q.counts().skipped).toBe(1);
  });

  it("does not skip a task that is not in progress", () => {
    const q = new TaskQueue(makeTasks("a", "b"));
    expect(() => q.skip("a")).toThrow(InvalidTransitionError); // pending
    q.next();
    q.submit("a");
    expect(() => q.skip("a")).toThrow(InvalidTransitionError); // labeled
    q.markDone("a");
    expect(() => q.skip("a")).toThrow(InvalidTransitionError); // done
  });
});

describe("TaskQueue: illegal transitions", () => {
  it("submit needs in_progress", () => {
    const q = new TaskQueue(makeTasks("a"));
    expect(() => q.submit("a")).toThrow(InvalidTransitionError); // pending
    q.next();
    q.submit("a");
    expect(() => q.submit("a")).toThrow(InvalidTransitionError); // labeled
    q.markDone("a");
    expect(() => q.submit("a")).toThrow(InvalidTransitionError); // done
  });

  it("markDone needs labeled", () => {
    const q = new TaskQueue(makeTasks("a"));
    expect(() => q.markDone("a")).toThrow(InvalidTransitionError); // pending
    q.next();
    expect(() => q.markDone("a")).toThrow(InvalidTransitionError); // in_progress
    q.submit("a");
    q.markDone("a");
    expect(() => q.markDone("a")).toThrow(InvalidTransitionError); // done
  });

  it("markDone and submit reject a flagged skipped task", () => {
    const q = new TaskQueue(makeTasks("a"));
    q.next();
    q.skip("a");
    q.next();
    q.skip("a");
    expect(() => q.submit("a")).toThrow(InvalidTransitionError);
    expect(() => q.markDone("a")).toThrow(InvalidTransitionError);
  });

  it("leaves state unchanged when a transition is rejected", () => {
    const q = new TaskQueue(makeTasks("a"));
    expect(() => q.submit("a")).toThrow();
    expect(q.state("a")).toBe("pending");
  });

  it("names the task, state and event in the error", () => {
    const q = new TaskQueue(makeTasks("a"));
    try {
      q.submit("a");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidTransitionError);
      const e = err as InvalidTransitionError;
      expect([e.taskId, e.from, e.event]).toEqual(["a", "pending", "submit"]);
    }
  });

  it("throws on an unknown task id", () => {
    const q = new TaskQueue(makeTasks("a"));
    expect(() => q.submit("zzz")).toThrow(/Unknown task/);
    expect(() => q.skip("zzz")).toThrow(/Unknown task/);
    expect(() => q.state("zzz")).toThrow(/Unknown task/);
  });
});

describe("TaskQueue: snapshot and restore (FR-Q2 resume)", () => {
  it("resumes mid-queue with states and order intact", () => {
    const tasks = makeTasks("a", "b", "c", "d");
    const q = new TaskQueue(tasks);
    q.next();
    q.submit("a");
    q.markDone("a");
    q.next(); // b
    q.skip("b"); // b re-queued to the end
    q.next(); // c in progress

    const restored = TaskQueue.restore(tasks, JSON.parse(JSON.stringify(q.snapshot())));
    expect(restored.state("a")).toBe("done");
    expect(restored.state("c")).toBe("in_progress");
    expect(restored.skipCount("b")).toBe(1);
    expect(restored.next()?.id).toBe("c"); // resumes the task in progress
    restored.submit("c");
    restored.markDone("c");
    expect(servedIds(restored)).toEqual(["d", "b"]);
  });

  it("keeps a flagged task flagged after restore", () => {
    const tasks = makeTasks("a");
    const q = new TaskQueue(tasks);
    q.next();
    q.skip("a");
    q.next();
    q.skip("a");
    const restored = TaskQueue.restore(tasks, q.snapshot());
    expect(restored.isFlagged("a")).toBe(true);
    expect(restored.next()).toBeUndefined();
  });

  it("rejects a snapshot for a different task set", () => {
    const q = new TaskQueue(makeTasks("a", "b"));
    expect(() => TaskQueue.restore(makeTasks("a", "x"), q.snapshot())).toThrow(/does not match/);
    expect(() => TaskQueue.restore(makeTasks("a"), q.snapshot())).toThrow(/does not match/);
  });

  it("rejects a snapshot with a bad state or two tasks in progress", () => {
    const tasks = makeTasks("a", "b");
    const snap = new TaskQueue(tasks).snapshot();

    const badState = JSON.parse(JSON.stringify(snap)) as typeof snap;
    (badState.entries["a"] as { state: string }).state = "bogus";
    expect(() => TaskQueue.restore(tasks, badState)).toThrow(/invalid/);

    const twoActive = JSON.parse(JSON.stringify(snap)) as typeof snap;
    twoActive.entries["a"] = { state: "in_progress", skipCount: 0 };
    twoActive.entries["b"] = { state: "in_progress", skipCount: 0 };
    expect(() => TaskQueue.restore(tasks, twoActive)).toThrow(/more than one/);
  });
});
