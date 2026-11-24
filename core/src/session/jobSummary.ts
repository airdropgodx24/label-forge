import { buildRecords } from "../export";
import { TaskQueue } from "../queue";
import type { AgreementReport } from "../scoring";
import type { Job, Label, Pass, Task, TaskType } from "../types";
import { loadSaved } from "./savedSession";
import type { KeyValueStore } from "./storage";

/** One job the dashboard shows: the job, its tasks, and the task type that labels them. */
export interface DashboardJob {
  job: Job;
  /** Keep this array stable between renders. */
  tasks: readonly Task[];
  taskType: TaskType;
}

/** Where one pass stands, read from what the session saved. */
export interface PassSummary {
  pass: Pass;
  labelerName: string;
  total: number;
  /** Tasks with a submitted label. */
  labeled: number;
  /** Tasks skipped twice and flagged. */
  flagged: number;
  /** Tasks still to label, including the one on screen. */
  remaining: number;
  labels: Label[];
}

export interface JobSummary {
  job: Job;
  taskTypeTitle: string;
  /** Null when the pass has not been started. */
  pass1: PassSummary | null;
  pass2: PassSummary | null;
  /** Null until both passes have at least one label. */
  report: AgreementReport | null;
  /** One plain-English line about agreement (FR-A4). */
  reading: string;
  /** Saved state that could not be read or scored. Shown to the user instead of numbers. */
  problems: string[];
}

function readPass(entry: DashboardJob, store: KeyValueStore, pass: Pass, problems: string[]): PassSummary | null {
  try {
    const saved = loadSaved(store, entry.job.id, pass);
    if (!saved) return null;
    const counts = TaskQueue.restore(entry.tasks, saved.queue).counts();
    return {
      pass,
      labelerName: saved.labelerName,
      total: entry.tasks.length,
      labeled: counts.labeled + counts.done,
      flagged: counts.skipped,
      remaining: counts.pending + counts.in_progress,
      labels: saved.labels,
    };
  } catch (err) {
    problems.push(`Pass ${pass} could not be read: ${(err as Error).message}`);
    return null;
  }
}

/** Reads the saved state of both passes and scores agreement. Never throws. */
export function summarizeJob(entry: DashboardJob, store: KeyValueStore): JobSummary {
  const problems: string[] = [];
  const pass1 = readPass(entry, store, 1, problems);
  const pass2 = readPass(entry, store, 2, problems);

  let report: AgreementReport | null = null;
  if (pass1 && pass2 && pass1.labels.length > 0 && pass2.labels.length > 0) {
    try {
      report = buildRecords({
        job: entry.job,
        taskType: entry.taskType,
        pass1: pass1.labels,
        pass2: pass2.labels,
      }).report;
    } catch (err) {
      problems.push(`Agreement could not be scored: ${(err as Error).message}`);
    }
  }

  return {
    job: entry.job,
    taskTypeTitle: entry.taskType.title,
    pass1,
    pass2,
    report,
    reading: describeAgreement(pass1, pass2, report),
    problems,
  };
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/**
 * How kappa is usually read (Landis and Koch bands), applied to the value as
 * shown, so the number and the words never disagree at a band edge.
 */
export function kappaBand(kappa: number): string {
  const k = Math.round(kappa * 100) / 100 || 0; // || 0 turns -0 into 0
  if (k < 0) return "less than chance agreement";
  if (k <= 0.2) return "slight agreement";
  if (k <= 0.4) return "fair agreement";
  if (k <= 0.6) return "moderate agreement";
  if (k <= 0.8) return "substantial agreement";
  return "almost perfect agreement";
}

/** The one-line reading under the scores (FR-A4), for example "Labelers agreed on 86 of 100 tasks. Kappa 0.71, usually read as substantial agreement." */
export function describeAgreement(
  pass1: Pick<PassSummary, "labels"> | null,
  pass2: Pick<PassSummary, "labels"> | null,
  report: AgreementReport | null,
): string {
  const has1 = !!pass1 && pass1.labels.length > 0;
  const has2 = !!pass2 && pass2.labels.length > 0;
  if (!has1 && !has2) return "No labels yet, so there is no agreement score.";
  if (!has1 || !has2) {
    return `Agreement needs both passes. Pass ${has1 ? 2 : 1} has no labels yet.`;
  }
  if (!report) return "Agreement could not be scored.";
  if (report.totalDoubleLabeled === 0) return "No task has been labeled in both passes yet.";

  const agreed = `Labelers agreed on ${report.agreedCount} of ${plural(report.totalDoubleLabeled, "task")}.`;
  if (report.kappa === null) {
    return `${agreed} Kappa is not defined because every label fell in one category.`;
  }
  return `${agreed} Kappa ${report.kappa.toFixed(2)}, usually read as ${kappaBand(report.kappa)}.`;
}

/** A label value as plain text. Rankings (lists) read best to worst, "r2 > r1 > r3". */
export function formatLabel(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(formatLabel).join(" > ");
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}
