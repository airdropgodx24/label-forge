import { describe, expect, it } from "vitest";
import { TaskLoadError, loadTasks } from "../src/queue";

const sample = [
  { id: "t1", type: "image-preference", payload: { prompt: "p", imageA: "a.png", imageB: "b.png" } },
  { id: "t2", type: "response-ranking", payload: { prompt: "q", responses: [{ id: "r1", text: "x" }] } },
];

describe("loadTasks (FR-Q1)", () => {
  it("loads tasks from JSON text in file order and stamps the job id", () => {
    const tasks = loadTasks(JSON.stringify(sample), "job-1");
    expect(tasks.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(tasks.every((t) => t.jobId === "job-1")).toBe(true);
    expect(tasks[0]).toEqual({ ...sample[0], jobId: "job-1" });
  });

  it("loads tasks from an already-parsed value", () => {
    expect(loadTasks(sample, "job-1")).toHaveLength(2);
  });

  it("accepts an entry whose own jobId matches", () => {
    expect(loadTasks([{ ...sample[0], jobId: "job-1" }], "job-1")).toHaveLength(1);
  });

  it("accepts an empty array", () => {
    expect(loadTasks("[]", "job-1")).toEqual([]);
  });

  it("does not inspect the payload", () => {
    const [t] = loadTasks([{ id: "x", type: "t", payload: "anything" }], "j");
    expect(t?.payload).toBe("anything");
  });

  it.each([
    ["invalid JSON", "{nope", /not valid JSON/],
    ["a non-array", { id: "t1" }, /array/],
    ["a non-object entry", [42], /must be an object/],
    ["a missing id", [{ type: "t", payload: {} }], /"id"/],
    ["an empty id", [{ id: "", type: "t", payload: {} }], /"id"/],
    ["a missing type", [{ id: "a", payload: {} }], /"type"/],
    ["a missing payload", [{ id: "a", type: "t" }], /"payload"/],
    ["a null payload", [{ id: "a", type: "t", payload: null }], /"payload"/],
    ["a mismatched jobId", [{ id: "a", type: "t", payload: {}, jobId: "other" }], /jobId/],
    [
      "a duplicate id",
      [
        { id: "a", type: "t", payload: {} },
        { id: "a", type: "t", payload: {} },
      ],
      /Duplicate/,
    ],
  ])("rejects %s", (_name, input, message) => {
    expect(() => loadTasks(input, "job-1")).toThrow(TaskLoadError);
    expect(() => loadTasks(input, "job-1")).toThrow(message);
  });
});
