import type { AgreementReport } from "../scoring";
import { recordsToCsv, recordsToJsonl, summaryToCsv, summaryToJson } from "./formats";
import { buildRecords, type ExportInput, type ExportRecord } from "./records";

export interface ExportFile {
  name: string;
  mimeType: string;
  content: string;
}

export interface ExportBundle {
  records: ExportRecord[];
  report: AgreementReport;
  /** labels.jsonl, labels.csv, agreement.json, agreement.csv, in that order. */
  files: { labelsJsonl: ExportFile; labelsCsv: ExportFile; agreementJson: ExportFile; agreementCsv: ExportFile };
}

/** "Street Scenes: Round 2" becomes "street-scenes-round-2". Never empty. */
export function slugify(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? "job" : slug;
}

/** File name carrying the job name and the export date, UTC (FR-E4), e.g. `street-scenes-2026-11-24.csv`. */
export function exportFileName(jobName: string, exportedAt: Date | string, suffix: string, ext: string): string {
  const date = new Date(exportedAt).toISOString().slice(0, 10);
  return `${slugify(jobName)}-${date}${suffix}.${ext}`;
}

/**
 * Builds every file of one job export: the labels as JSONL and CSV (FR-E1,
 * FR-E2), and the agreement summary as JSON and CSV. All content is generated
 * here; nothing is written or downloaded until `downloadFile` is called.
 */
export function buildExport<V>(input: ExportInput<V>): ExportBundle {
  const { records, report, exportedAt } = buildRecords(input);
  const name = (suffix: string, ext: string) => exportFileName(input.job.name, exportedAt, suffix, ext);
  // Records and report are generic over the label type; the writers only read them.
  const r = records as ExportRecord[];
  const rep = report as AgreementReport;

  return {
    records: r,
    report: rep,
    files: {
      labelsJsonl: { name: name("", "jsonl"), mimeType: "application/x-ndjson", content: recordsToJsonl(r) },
      labelsCsv: { name: name("", "csv"), mimeType: "text/csv", content: recordsToCsv(r) },
      agreementJson: {
        name: name("-agreement", "json"),
        mimeType: "application/json",
        content: summaryToJson(rep, exportedAt),
      },
      agreementCsv: { name: name("-agreement", "csv"), mimeType: "text/csv", content: summaryToCsv(rep) },
    },
  };
}

/** Starts a browser download of one file. Browser only. */
export function downloadFile(file: ExportFile, doc: Document = document): void {
  const url = URL.createObjectURL(new Blob([file.content], { type: `${file.mimeType};charset=utf-8` }));
  const link = doc.createElement("a");
  link.href = url;
  link.download = file.name;
  link.style.display = "none";
  doc.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}
