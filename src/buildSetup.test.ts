import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import config from "../vite.config";
import { loadSampleTasks as imageTasks } from "../apps/image-preference/src";
import { JOBS } from "./jobs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const html = readFileSync(join(root, "index.html"), "utf8");

describe("the site's build setup", () => {
  it("has the scripts for dev, build and preview, and keeps test and typecheck", () => {
    expect(pkg.scripts).toMatchObject({
      dev: "vite",
      build: "vite build",
      preview: "vite preview",
      test: "vitest --run",
      typecheck: "tsc --noEmit",
    });
  });

  it("builds with vite and the React plugin, both direct dev dependencies", () => {
    expect(Object.keys(pkg.devDependencies)).toEqual(expect.arrayContaining(["vite", "@vitejs/plugin-react"]));
    const flatten = (v: unknown): unknown[] => (Array.isArray(v) ? v.flatMap(flatten) : [v]);
    const names = flatten(config.plugins).map((p) => (p as { name?: string } | null)?.name ?? "");
    expect(names.some((n) => n.includes("react"))).toBe(true);
  });

  it("has an index.html at the root that mounts the app from src/main.tsx", () => {
    expect(html).toContain('<div id="root"></div>');
    expect(html).toMatch(/<script type="module" src="\/src\/main\.tsx"><\/script>/);
    expect(html).toContain("<title>LabelForge</title>");
    expect(existsSync(join(root, "src", "main.tsx"))).toBe(true);
  });

  it("uses relative URLs, so one build works at a domain root or under a sub-path", () => {
    expect(config.base).toBe("./");
  });

  it("serves App 1's public folder at the site root, where its task data expects the images", () => {
    expect(config.publicDir).toBe("apps/image-preference/public");
    const publicDir = join(root, config.publicDir as string);
    const refs = imageTasks().flatMap((t) => {
      const p = t.payload as { imageA: string; imageB: string };
      return [p.imageA, p.imageB];
    });
    expect(refs).toHaveLength(50);
    for (const ref of refs) {
      expect(ref, ref).toMatch(/^images\/[a-z0-9-]+\.svg$/); // relative, so it resolves against the page
      expect(existsSync(join(publicDir, ref)), ref).toBe(true);
    }
  });

  it("offers exactly the two apps' sample jobs", () => {
    expect(JOBS.map((j) => j.job.id)).toEqual(["image-preference-sample", "response-ranking-sample"]);
    expect(JOBS.map((j) => j.taskType.id)).toEqual(["image-preference", "response-ranking"]);
    expect(JOBS.every((j) => j.tasks.length === 25)).toBe(true);
  });
});
