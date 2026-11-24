import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadTasks } from "../../../core/src/queue";
import { INSTRUCTION } from "../src/instruction";
import { buildTasks } from "../tools/build-sample-data.mjs";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const taskFile = readFileSync(join(appDir, "data", "sample-tasks.json"), "utf8");

const JOB_ID = "response-ranking-sample";
const words = (s: string) => s.trim().split(/\s+/).length;

interface Payload {
  prompt: string;
  responses: Array<{ id: string; text: string }>;
}

describe("Response Ranking sample job (FR-D1, FR-R1)", () => {
  it("loads through the core task loader without errors", () => {
    expect(() => loadTasks(taskFile, JOB_ID)).not.toThrow();
  });

  const tasks = loadTasks(taskFile, JOB_ID);
  const payloads = tasks.map((t) => t.payload as Payload);
  const { tasks: built, intended } = buildTasks();

  it("has 20 to 30 tasks with unique ids, in a stable order", () => {
    expect(tasks.length).toBeGreaterThanOrEqual(20);
    expect(tasks.length).toBeLessThanOrEqual(30);
    expect(new Set(tasks.map((t) => t.id)).size).toBe(tasks.length);
    expect(tasks.map((t) => t.id)).toEqual(tasks.map((_, i) => `rr-${String(i + 1).padStart(2, "0")}`));
  });

  it("gives every task the response-ranking type and a payload of exactly prompt and responses", () => {
    for (const t of tasks) {
      expect(t.type).toBe("response-ranking");
      expect(Object.keys(t.payload as object).sort()).toEqual(["prompt", "responses"]);
    }
  });

  it("gives every task a prompt and 2 to 4 responses, each with an id and text (FR-R1)", () => {
    for (const [i, p] of payloads.entries()) {
      const where = tasks[i]!.id;
      expect(typeof p.prompt, where).toBe("string");
      expect(p.prompt.trim().length, where).toBeGreaterThan(20);
      expect(p.responses.length, where).toBeGreaterThanOrEqual(2);
      expect(p.responses.length, where).toBeLessThanOrEqual(4);
      for (const r of p.responses) {
        expect(Object.keys(r).sort(), where).toEqual(["id", "text"]);
        expect(r.text.trim().length, `${where} ${r.id}`).toBeGreaterThan(0);
      }
    }
  });

  it("numbers response ids r1, r2, ... in file order, unique within the task", () => {
    for (const [i, p] of payloads.entries()) {
      expect(p.responses.map((r) => r.id), tasks[i]!.id).toEqual(p.responses.map((_, k) => `r${k + 1}`));
    }
  });

  it("never repeats a response within a task", () => {
    for (const [i, p] of payloads.entries()) {
      expect(new Set(p.responses.map((r) => r.text.trim())).size, tasks[i]!.id).toBe(p.responses.length);
    }
  });

  it("uses every response count from 2 to 4", () => {
    const counts = new Set(payloads.map((p) => p.responses.length));
    expect([...counts].sort()).toEqual([2, 3, 4]);
  });

  it("keeps the file in step with the builder script, so edits cannot drift", () => {
    expect(JSON.parse(taskFile)).toEqual(built);
  });

  it("covers the prompt types the build plan asks for", () => {
    const kinds = new Set(intended.map((k) => k.kind));
    for (const kind of ["support reply", "summary", "code help", "tone rewrite"]) {
      expect(kinds.has(kind), kind).toBe(true);
    }
    expect(kinds.size).toBeGreaterThanOrEqual(8);
  });

  it("includes long responses, so in-card scrolling gets exercised (FR-R3)", () => {
    const long = payloads.flatMap((p) => p.responses).filter((r) => words(r.text) >= 120);
    expect(long.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps line breaks and indentation as plain text, with no markup or control characters", () => {
    for (const [i, p] of payloads.entries()) {
      for (const text of [p.prompt, ...p.responses.map((r) => r.text)]) {
        expect(text, tasks[i]!.id).not.toMatch(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/);
        expect(text, tasks[i]!.id).not.toMatch(/<\/?[a-z][^>]*>/i);
        expect(text, tasks[i]!.id).toBe(text.trim());
      }
    }
  });

  it("holds no brand, product, language or operating system names, and only .example addresses (NFR-3)", () => {
    const all = JSON.stringify(tasks);
    for (const name of ["JavaScript", "Python", "Unix", "Linux", "Windows", "macOS", "Google", "OpenAI", "ChatGPT", "Amazon", "Microsoft", "Apple"]) {
      expect(all.toLowerCase(), name).not.toContain(name.toLowerCase());
    }
    const addresses = all.match(/[\w.+-]+@[\w.-]+\.\w+/g) ?? [];
    for (const a of addresses) expect(a, a).toMatch(/\.example$/);
    expect(all).not.toMatch(/https?:\/\//);
  });
});

describe("the sample data does not give the answer away", () => {
  const { tasks, intended } = buildTasks();

  it("has a full ranking for every task: each response id exactly once", () => {
    expect(intended.map((k) => k.id)).toEqual(tasks.map((t) => t.id));
    for (const [i, k] of intended.entries()) {
      expect([...k.ranking].sort(), k.id).toEqual(tasks[i]!.payload.responses.map((r) => r.id).sort());
    }
  });

  it("does not list the best response in one fixed place", () => {
    const positions = intended.map((k, i) => tasks[i]!.payload.responses.findIndex((r) => r.id === k.ranking[0]));
    const counts = [0, 1, 2, 3].map((p) => positions.filter((x) => x === p).length);
    expect(counts.filter((c) => c > 0).length).toBeGreaterThanOrEqual(3); // at least three different positions
    expect(Math.max(...counts)).toBeLessThanOrEqual(Math.ceil(tasks.length * 0.5)); // no position holds more than half
  });

  it("does not make the longest response the best one by default", () => {
    const strictlyLongest = intended.filter((k, i) => {
      const lens = tasks[i]!.payload.responses.map((r) => ({ id: r.id, w: words(r.text) }));
      const max = Math.max(...lens.map((l) => l.w));
      return lens.filter((l) => l.w === max).length === 1 && lens.find((l) => l.w === max)!.id === k.ranking[0];
    }).length;
    expect(strictlyLongest / tasks.length).toBeLessThanOrEqual(0.5);
    // and the best is sometimes the shortest
    const strictlyShortest = intended.filter((k, i) => {
      const lens = tasks[i]!.payload.responses.map((r) => ({ id: r.id, w: words(r.text) }));
      const min = Math.min(...lens.map((l) => l.w));
      return lens.filter((l) => l.w === min).length === 1 && lens.find((l) => l.w === min)!.id === k.ranking[0];
    }).length;
    expect(strictlyShortest).toBeGreaterThanOrEqual(2);
  });

  it("keeps the answer key out of the task file: no field beyond the expected ones, anywhere", () => {
    const keys = new Set<string>();
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") {
        for (const [k, child] of Object.entries(v)) {
          keys.add(k);
          walk(child);
        }
      }
    };
    walk(JSON.parse(readFileSync(join(appDir, "data", "sample-tasks.json"), "utf8")));
    expect([...keys].sort()).toEqual(["id", "payload", "prompt", "responses", "text", "type"]);
  });
});

describe("close calls", () => {
  const { intended } = buildTasks();

  it("marks exactly four tasks, each with a reason, in the builder only", () => {
    const marked = intended.filter((k) => k.closeCall);
    expect(marked.map((k) => k.id)).toEqual(["rr-04", "rr-11", "rr-23", "rr-24"]);
    for (const k of marked) {
      expect(k.closeCall!.length, k.id).toBeGreaterThan(40);
      expect(k.ranking.length, k.id).toBeGreaterThanOrEqual(2);
    }
    expect(taskFile).not.toMatch(/closeCall/); // the marks never reach the task file
  });
});

describe("the job's instruction line", () => {
  it("is one plain line a real RLHF job would use", () => {
    expect(INSTRUCTION).not.toMatch(/\n/);
    expect(INSTRUCTION.length).toBeGreaterThan(40);
    expect(INSTRUCTION.length).toBeLessThan(300);
    expect(INSTRUCTION).toMatch(/^Rank the responses from best to worst/);
    for (const criterion of ["helpful", "accurate", "honest", "instruction", "safe"]) {
      expect(INSTRUCTION.toLowerCase(), criterion).toContain(criterion);
    }
  });
});
