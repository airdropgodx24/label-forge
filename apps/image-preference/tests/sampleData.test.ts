import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadTasks } from "../../../core/src/queue";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(appDir, "public");
const imageDir = join(publicDir, "images");
const taskFile = readFileSync(join(appDir, "data", "sample-tasks.json"), "utf8");

const JOB_ID = "image-preference-sample";
const STEM = "Pick the image that better matches: ";

interface Payload {
  instruction: string;
  imageA: string;
  imageB: string;
}

describe("Image Preference sample job (FR-D1, FR-I1, FR-I3)", () => {
  it("loads through the core task loader without errors", () => {
    expect(() => loadTasks(taskFile, JOB_ID)).not.toThrow();
  });

  const tasks = loadTasks(taskFile, JOB_ID);

  it("has 20 to 30 tasks with unique ids, in a stable order", () => {
    expect(tasks.length).toBeGreaterThanOrEqual(20);
    expect(tasks.length).toBeLessThanOrEqual(30);
    expect(new Set(tasks.map((t) => t.id)).size).toBe(tasks.length);
    expect(tasks.map((t) => t.id)).toEqual(tasks.map((_, i) => `ip-${String(i + 1).padStart(2, "0")}`));
  });

  it("gives every task the image-preference type and a payload of exactly instruction, imageA, imageB", () => {
    for (const t of tasks) {
      expect(t.type).toBe("image-preference");
      expect(Object.keys(t.payload as object).sort()).toEqual(["imageA", "imageB", "instruction"]);
    }
  });

  it("writes every instruction line in the job's form, each about a different scene", () => {
    const lines = tasks.map((t) => (t.payload as Payload).instruction);
    for (const line of lines) {
      expect(line.startsWith(STEM)).toBe(true);
      expect(line.slice(STEM.length).trim().length).toBeGreaterThan(5);
      expect(line).not.toMatch(/\b(A|B|tie)\b\s*$/i); // the line must not give the answer away
    }
    expect(new Set(lines).size).toBe(lines.length);
  });

  it("points every image at a local file under public/images/ that exists", () => {
    for (const t of tasks) {
      const p = t.payload as Payload;
      for (const ref of [p.imageA, p.imageB]) {
        expect(ref, t.id).toMatch(/^images\/[a-z0-9-]+\.svg$/);
        expect(existsSync(join(publicDir, ref)), `${t.id}: ${ref}`).toBe(true);
      }
      expect(p.imageA).not.toBe(p.imageB);
    }
  });

  it("uses every image file, and only those (no strays)", () => {
    const referenced = new Set(tasks.flatMap((t) => [(t.payload as Payload).imageA, (t.payload as Payload).imageB]));
    const onDisk = readdirSync(imageDir)
      .filter((f) => !f.startsWith("."))
      .map((f) => `images/${f}`);
    expect(onDisk.sort()).toEqual([...referenced].sort());
    expect(referenced.size).toBe(tasks.length * 2);
  });

  it("makes every image the same size, so A and B sit side by side evenly", () => {
    for (const f of readdirSync(imageDir).filter((f) => f.endsWith(".svg"))) {
      const svg = readFileSync(join(imageDir, f), "utf8");
      expect(svg, f).toMatch(/<svg [^>]*viewBox="0 0 640 400"[^>]*width="640"[^>]*height="400"/);
    }
  });

  it("holds only original drawn artwork: no embedded bitmaps, no outside links", () => {
    for (const f of readdirSync(imageDir).filter((f) => f.endsWith(".svg"))) {
      const svg = readFileSync(join(imageDir, f), "utf8");
      expect(svg, f).not.toMatch(/<image\b|data:|<script\b|<foreignObject\b|xlink:href|href=/);
      const urls = svg.match(/https?:\/\/[^"'\s)]+/g) ?? [];
      expect(urls.filter((u) => u !== "http://www.w3.org/2000/svg"), f).toEqual([]);
      expect(svg, f).toContain("Generated for LabelForge by tools/generate-sample-data.mjs");
    }
  });
});
