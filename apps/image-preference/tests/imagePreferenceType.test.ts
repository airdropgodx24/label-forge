import { describe, expect, it } from "vitest";
import { scoreAgreement } from "../../../core/src/scoring";
import type { Label, TaskType } from "../../../core/src/types";
import {
  DEFAULT_INSTRUCTION,
  createImagePreferenceType,
  imagePreferenceType,
  isPick,
  readPayload,
  resolveImageSrc,
  sampleJob,
  sampleJobEntry,
  loadSampleTasks,
  type ImagePreferenceValue,
} from "../src";

const label = (taskId: string, value: unknown, pass: 1 | 2 = 1): Label<ImagePreferenceValue> => ({
  taskId,
  labelerName: pass === 1 ? "Ada" : "Grace",
  pass,
  value: value as ImagePreferenceValue,
  createdAt: "2026-11-24T10:00:00.000Z",
});

describe("the image-preference task type (registration with the core)", () => {
  it("has the id and title from the app design", () => {
    expect(imagePreferenceType.id).toBe("image-preference");
    expect(imagePreferenceType.title).toBe("Image Preference");
    expect(imagePreferenceType.instruction.length).toBeGreaterThan(10);
  });

  it("fits the core's TaskType interface, so the shell and dashboard accept it", () => {
    const asCoreType: TaskType = imagePreferenceType; // compile-time check
    expect(typeof asCoreType.renderTask).toBe("function");
    expect(typeof asCoreType.isComplete).toBe("function");
    expect(typeof asCoreType.labelsAgree).toBe("function");
  });

  it("matches the task type id the sample job and every sample task use", () => {
    expect(sampleJob.taskTypeId).toBe(imagePreferenceType.id);
    expect(loadSampleTasks().every((t) => t.type === imagePreferenceType.id)).toBe(true);
  });
});

describe("isComplete: a pick exists", () => {
  it.each(["A", "B", "tie"])("%s is a finished label", (value) => {
    expect(imagePreferenceType.isComplete(label("t", value))).toBe(true);
  });

  it.each([["a"], ["Tie"], ["TIE"], [""], ["C"], [null], [undefined], [1], [["A"]], [{}]])(
    "%j is not a finished label",
    (value) => {
      expect(imagePreferenceType.isComplete(label("t", value))).toBe(false);
    },
  );

  it("isPick agrees", () => {
    expect(["A", "B", "tie", "a", null].map(isPick)).toEqual([true, true, true, false, false]);
  });
});

describe("labelsAgree: the two picks are equal", () => {
  const agree = (a: unknown, b: unknown) => imagePreferenceType.labelsAgree(label("t", a, 1), label("t", b, 2));

  it("agrees on equal picks, including two Ties", () => {
    expect(agree("A", "A")).toBe(true);
    expect(agree("B", "B")).toBe(true);
    expect(agree("tie", "tie")).toBe(true);
  });

  it("disagrees on different picks, and Tie is not the same as A or B", () => {
    expect(agree("A", "B")).toBe(false);
    expect(agree("B", "A")).toBe(false);
    expect(agree("A", "tie")).toBe(false);
    expect(agree("tie", "B")).toBe(false);
  });

  it("works with the core scorer: a hand-checked example", () => {
    // Six tasks, (Pass 1, Pass 2): AA, AA, BB, B-tie, tie-tie, A-B
    // p_o = 4/6. Pass 1: A=3, B=2, tie=1. Pass 2: A=2, B=2, tie=2.
    // p_e = (3*2 + 2*2 + 1*2) / 36 = 12/36 = 1/3. kappa = (2/3 - 1/3) / (2/3) = 0.5
    const p1 = ["A", "A", "B", "B", "tie", "A"];
    const p2 = ["A", "A", "B", "tie", "tie", "B"];
    const report = scoreAgreement({
      jobId: sampleJob.id,
      taskType: imagePreferenceType,
      pass1: p1.map((v, i) => label(`t${i}`, v, 1)),
      pass2: p2.map((v, i) => label(`t${i}`, v, 2)),
    });
    expect(report.agreedCount).toBe(4);
    expect(report.percentAgreement).toBeCloseTo(66.6667, 3);
    expect(report.kappa).toBeCloseTo(0.5, 10);
    expect(report.disagreements.map((d) => d.taskId)).toEqual(["t3", "t5"]);
  });
});

describe("readPayload", () => {
  it("reads a complete payload", () => {
    expect(readPayload({ instruction: "Pick one", imageA: "a.svg", imageB: "b.svg" })).toEqual({
      instruction: "Pick one",
      imageA: "a.svg",
      imageB: "b.svg",
    });
  });

  it("defaults a missing or blank instruction", () => {
    expect(readPayload({ imageA: "a", imageB: "b" })?.instruction).toBe(DEFAULT_INSTRUCTION);
    expect(readPayload({ instruction: "  ", imageA: "a", imageB: "b" })?.instruction).toBe(DEFAULT_INSTRUCTION);
  });

  it("returns null when an image is missing or not text", () => {
    for (const bad of [null, undefined, "x", 3, [], {}, { imageA: "a" }, { imageB: "b" }, { imageA: "", imageB: "b" }, { imageA: 1, imageB: "b" }]) {
      expect(readPayload(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe("resolveImageSrc (FR-I3)", () => {
  it("leaves full URLs, data URLs, protocol-relative and root-relative references alone", () => {
    for (const ref of ["https://example.com/a.png", "http://example.com/a.png", "data:image/png;base64,AAAA", "//cdn.example.com/a.png", "/images/a.svg"]) {
      expect(resolveImageSrc(ref, "/base/")).toBe(ref);
    }
  });

  it("keeps a local path as it is when there is no base", () => {
    expect(resolveImageSrc("images/a.svg")).toBe("images/a.svg");
    expect(resolveImageSrc("./images/a.svg")).toBe("images/a.svg");
  });

  it("puts a local path after the base, with exactly one slash between", () => {
    expect(resolveImageSrc("images/a.svg", "/label-forge/")).toBe("/label-forge/images/a.svg");
    expect(resolveImageSrc("images/a.svg", "/label-forge")).toBe("/label-forge/images/a.svg");
    expect(resolveImageSrc("./images/a.svg", "https://host.example/app//")).toBe("https://host.example/app/images/a.svg");
  });

  it("can build a task type for an app served from a sub-path", () => {
    const type = createImagePreferenceType({ imageBase: "/label-forge/" });
    expect(type.id).toBe("image-preference");
  });
});

describe("the sample job entry", () => {
  it("bundles the job, its 25 tasks and the task type for the core", () => {
    const entry = sampleJobEntry();
    expect(entry.job).toBe(sampleJob);
    expect(entry.tasks).toHaveLength(25);
    expect(entry.tasks.every((t) => t.jobId === sampleJob.id)).toBe(true);
    expect(entry.taskType.id).toBe("image-preference");
  });
});
