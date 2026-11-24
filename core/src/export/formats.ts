import type { AgreementReport } from "../scoring";
import type { ExportRecord } from "./records";

/** Column order of the label CSV. Matches the key order of the JSONL records. */
export const RECORD_COLUMNS = [
  "jobId",
  "taskId",
  "taskType",
  "labeler",
  "pass",
  "label",
  "labeledAt",
  "agreementStatus",
  "exportedAt",
] as const satisfies readonly (keyof ExportRecord)[];

/** Row types and columns of the agreement CSV. */
export const SUMMARY_COLUMNS = [
  "row",
  "name",
  "value",
  "taskId",
  "pass1Labeler",
  "pass1Label",
  "pass2Labeler",
  "pass2Label",
] as const;

/**
 * One CSV cell. Text is quoted when it holds a comma, quote or line break.
 * Labels that are lists or objects (a ranking) are written as JSON text.
 *
 * Text starting with = + - @ or a tab/CR gets a leading apostrophe, because
 * spreadsheets would run it as a formula and labeler names are free text.
 * This only affects the CSV; JSONL and JSON keep values exactly as stored.
 */
export function csvCell(value: unknown): string {
  let text: string;
  if (value === null || value === undefined) text = "";
  else if (typeof value === "string") text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  else if (typeof value === "number" || typeof value === "boolean") text = String(value);
  else text = JSON.stringify(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csv(header: readonly string[], rows: unknown[][]): string {
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** JSONL: one JSON object per line, ending with a newline. Empty input gives an empty file (FR-E1). */
export function recordsToJsonl(records: readonly ExportRecord[]): string {
  return records.map((r) => JSON.stringify(r) + "\n").join("");
}

/** CSV with a header row and the same fields as the JSONL (FR-E2). */
export function recordsToCsv(records: readonly ExportRecord[]): string {
  return csv(
    RECORD_COLUMNS,
    records.map((r) => RECORD_COLUMNS.map((c) => r[c])),
  );
}

/** Agreement summary as one JSON document: scores, counts and the disagreement list. */
export function summaryToJson(report: AgreementReport, exportedAt: string): string {
  const side = (l: AgreementReport["disagreements"][number]["pass1"]) => ({
    labeler: l.labelerName,
    label: l.value,
    labeledAt: l.createdAt,
  });
  return (
    JSON.stringify(
      {
        jobId: report.jobId,
        exportedAt,
        totalDoubleLabeled: report.totalDoubleLabeled,
        agreedCount: report.agreedCount,
        percentAgreement: report.percentAgreement,
        kappa: report.kappa,
        disagreements: report.disagreements.map((d) => ({
          taskId: d.taskId,
          pass1: side(d.pass1),
          pass2: side(d.pass2),
        })),
      },
      null,
      2,
    ) + "\n"
  );
}

/**
 * Agreement summary as one CSV. `summary` rows carry the four job-level
 * numbers in `name` and `value` (empty when undefined, such as kappa with no
 * double-labeled tasks); `disagreement` rows carry one task each. The summary
 * rows are always present, even when there are no disagreements.
 */
export function summaryToCsv(report: AgreementReport): string {
  const summary: unknown[][] = [
    ["summary", "totalDoubleLabeled", report.totalDoubleLabeled],
    ["summary", "agreedCount", report.agreedCount],
    ["summary", "percentAgreement", report.percentAgreement],
    ["summary", "kappa", report.kappa],
  ].map(([row, name, value]) => [row, name, value, "", "", "", "", ""]);

  const disagreements = report.disagreements.map((d) => [
    "disagreement",
    "",
    "",
    d.taskId,
    d.pass1.labelerName,
    d.pass1.value,
    d.pass2.labelerName,
    d.pass2.value,
  ]);
  return csv(SUMMARY_COLUMNS, [...summary, ...disagreements]);
}
