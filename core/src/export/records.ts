import { scoreAgreement, type AgreementReport } from "../scoring";
import type { Job, Label, Pass, TaskType } from "../types";

/** How a label compares with the other pass's label for the same task (FR-E1). */
export type AgreementStatus = "agreed" | "disagreed" | "single_pass";

/**
 * One exported label. The shape is the same for every app; only the content of
 * `label` follows the task type (FR-E3). `jobId` + `taskId` point back at the
 * task in the job's task file.
 */
export interface ExportRecord<V = unknown> {
  jobId: string;
  taskId: string;
  taskType: string;
  labeler: string;
  pass: Pass;
  label: V;
  /** When the labeler submitted it (ISO 8601). */
  labeledAt: string;
  agreementStatus: AgreementStatus;
  /** When the export was made (ISO 8601). */
  exportedAt: string;
}

export interface ExportInput<V> {
  job: Job;
  /** Only the task type's id and its two rules are used. */
  taskType: Pick<TaskType<unknown, V>, "id" | "isComplete" | "labelsAgree">;
  pass1: readonly Label<V>[];
  pass2: readonly Label<V>[];
  /** Defaults to now. Injectable for tests. */
  exportedAt?: Date;
}

export interface BuiltRecords<V> {
  records: ExportRecord<V>[];
  report: AgreementReport<V>;
  exportedAt: string;
}

/**
 * Builds the export records and the agreement report they are based on.
 *
 * Only finished labels are exported (FR-E4): anything the task type does not
 * call complete is left out, and so is any task nobody labeled. Pass 1 records
 * come first, then Pass 2, each in submission order.
 */
export function buildRecords<V>(input: ExportInput<V>): BuiltRecords<V> {
  const { job, taskType } = input;
  const exportedAt = (input.exportedAt ?? new Date()).toISOString();

  const pass1 = input.pass1.filter((l) => taskType.isComplete(l));
  const pass2 = input.pass2.filter((l) => taskType.isComplete(l));
  const report = scoreAgreement({ jobId: job.id, taskType, pass1, pass2 });

  const inBoth = new Set(pass2.map((l) => l.taskId));
  const inFirst = new Set(pass1.map((l) => l.taskId));
  const disagreed = new Set(report.disagreements.map((d) => d.taskId));

  const statusOf = (taskId: string): AgreementStatus => {
    if (!inFirst.has(taskId) || !inBoth.has(taskId)) return "single_pass";
    return disagreed.has(taskId) ? "disagreed" : "agreed";
  };

  const toRecord = (l: Label<V>): ExportRecord<V> => ({
    jobId: job.id,
    taskId: l.taskId,
    taskType: taskType.id,
    labeler: l.labelerName,
    pass: l.pass,
    label: l.value,
    labeledAt: l.createdAt,
    agreementStatus: statusOf(l.taskId),
    exportedAt,
  });

  return { records: [...pass1, ...pass2].map(toRecord), report, exportedAt };
}
