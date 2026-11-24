import { useMemo } from "react";
import { buildExport, downloadFile, type ExportFile } from "../export";
import {
  formatLabel,
  summarizeJob,
  type DashboardJob,
  type JobSummary,
  type PassSummary,
} from "./jobSummary";
import { browserStore, type KeyValueStore } from "./storage";

export interface JobDashboardProps {
  jobs: readonly DashboardJob[];
  /** Defaults to the browser's localStorage. */
  store?: KeyValueStore;
  /** Defaults to a browser download. Replace it to capture files in tests. */
  onDownload?: (file: ExportFile) => void;
}

function passLine(pass: 1 | 2, p: PassSummary | null): string {
  if (!p) return `Pass ${pass}: not started.`;
  const parts = [`${p.labeled} of ${p.total} labeled`];
  if (p.flagged > 0) parts.push(`${p.flagged} skipped and flagged`);
  if (p.remaining > 0) parts.push(`${p.remaining} to go`);
  return `Pass ${pass} (${p.labelerName}): ${parts.join(", ")}.`;
}

function percent(n: number): string {
  return `${Number(n.toFixed(1))}%`;
}

function PassProgress({ pass, summary }: { pass: 1 | 2; summary: PassSummary | null }) {
  return (
    <li className="lf-pass">
      <span className="lf-pass-text">{passLine(pass, summary)}</span>
      {summary ? (
        <progress
          className="lf-progress"
          aria-label={`Pass ${pass} progress`}
          max={summary.total}
          value={summary.labeled + summary.flagged}
        />
      ) : null}
    </li>
  );
}

function JobCard({ entry, summary, onDownload }: { entry: DashboardJob; summary: JobSummary; onDownload: (f: ExportFile) => void }) {
  const { job, pass1, pass2, report, problems } = summary;
  const hasLabels = (pass1?.labels.length ?? 0) + (pass2?.labels.length ?? 0) > 0;
  const canExportLabels = hasLabels && problems.length === 0;
  const canExportAgreement = !!report && report.totalDoubleLabeled > 0;

  const download = (pick: (b: ReturnType<typeof buildExport>["files"]) => ExportFile) => () =>
    onDownload(
      pick(
        buildExport({
          job,
          taskType: entry.taskType,
          pass1: pass1?.labels ?? [],
          pass2: pass2?.labels ?? [],
        }).files,
      ),
    );

  return (
    <section className="lf-dashboard-job" aria-label={job.name}>
      <h2 className="lf-job">{job.name}</h2>
      <p className="lf-tasktype">{summary.taskTypeTitle}</p>

      <ul className="lf-passes">
        <PassProgress pass={1} summary={pass1} />
        <PassProgress pass={2} summary={pass2} />
      </ul>

      {problems.map((p) => (
        <p key={p} className="lf-problem" role="alert">
          {p}
        </p>
      ))}

      <p className="lf-agreement">{summary.reading}</p>
      {report && report.totalDoubleLabeled > 0 ? (
        <dl className="lf-scores">
          <dt>Percent agreement</dt>
          <dd className="lf-percent">{report.percentAgreement === null ? "n/a" : percent(report.percentAgreement)}</dd>
          <dt>Cohen&apos;s kappa</dt>
          <dd className="lf-kappa">{report.kappa === null ? "n/a" : report.kappa.toFixed(2)}</dd>
        </dl>
      ) : null}

      {report && report.disagreements.length > 0 ? (
        <table className="lf-disagreements">
          <caption>Disagreements ({report.disagreements.length})</caption>
          <thead>
            <tr>
              <th scope="col">Task</th>
              <th scope="col">Pass 1 ({pass1?.labelerName})</th>
              <th scope="col">Pass 2 ({pass2?.labelerName})</th>
            </tr>
          </thead>
          <tbody>
            {report.disagreements.map((d) => (
              <tr key={d.taskId}>
                <td>{d.taskId}</td>
                <td>{formatLabel(d.pass1.value)}</td>
                <td>{formatLabel(d.pass2.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      <div className="lf-exports">
        <button type="button" disabled={!canExportLabels} onClick={download((f) => f.labelsJsonl)}>
          Download labels (JSONL)
        </button>
        <button type="button" disabled={!canExportLabels} onClick={download((f) => f.labelsCsv)}>
          Download labels (CSV)
        </button>
        <button type="button" disabled={!canExportAgreement} onClick={download((f) => f.agreementJson)}>
          Download agreement (JSON)
        </button>
        <button type="button" disabled={!canExportAgreement} onClick={download((f) => f.agreementCsv)}>
          Download agreement (CSV)
        </button>
      </div>
    </section>
  );
}

/**
 * Lists jobs with their progress per pass, the agreement summary in plain
 * English, the disagreement list, and the export buttons (FR-A3, FR-A4,
 * FR-E1). It reads what the sessions saved in local storage when it renders,
 * so show it fresh after labeling. Shared by every app: it only uses the
 * task type's title and rules.
 */
export function JobDashboard({ jobs, store, onDownload = downloadFile }: JobDashboardProps) {
  const kv = useMemo(() => store ?? browserStore(), [store]);
  const summaries = useMemo(() => jobs.map((entry) => summarizeJob(entry, kv)), [jobs, kv]);

  if (jobs.length === 0) return <p className="lf-dashboard-empty">No jobs yet.</p>;

  return (
    <div className="lf-dashboard">
      <h1>Jobs</h1>
      {jobs.map((entry, i) => (
        <JobCard key={entry.job.id} entry={entry} summary={summaries[i]!} onDownload={onDownload} />
      ))}
    </div>
  );
}
