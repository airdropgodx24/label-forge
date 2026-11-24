import { useMemo } from "react";
import { summarizeJob, type DashboardJob, type KeyValueStore, type PassSummary } from "../core/src/session";

interface Props {
  jobs: readonly DashboardJob[];
  store: KeyValueStore;
  onLabel(entry: DashboardJob): void;
  onResults(entry: DashboardJob): void;
}

function passLine(pass: 1 | 2, p: PassSummary | null): string {
  if (!p) return `Pass ${pass}: not started.`;
  const parts = [`${p.labeled} of ${p.total} labeled`];
  if (p.flagged > 0) parts.push(`${p.flagged} skipped and flagged`);
  return `Pass ${pass} (${p.labelerName}): ${parts.join(", ")}.`;
}

/** The landing view: every job the site offers, with where each pass stands, and a way in. */
export function JobList({ jobs, store, onLabel, onResults }: Props) {
  // Read from storage when the list is shown, so coming back from labeling is up to date.
  const summaries = useMemo(() => jobs.map((entry) => summarizeJob(entry, store)), [jobs, store]);

  return (
    <div className="app-jobs" style={{ display: "grid", gap: 20 }}>
      <header>
        <h1 style={{ margin: "0 0 8px" }}>LabelForge</h1>
        <p style={{ margin: 0 }}>
          One labeling skeleton, two apps. Pick a job and label it as Pass 1. Then have a second labeler do Pass 2 under
          a different name, and see how well you agreed and download the results. Everything stays in this browser: no
          accounts, no server.
        </p>
      </header>

      {jobs.map((entry, i) => {
        const summary = summaries[i]!;
        return (
          <section
            key={entry.job.id}
            className="app-job"
            aria-label={entry.job.name}
            style={{ display: "grid", gap: 8, padding: 16, border: "2px solid #374151", borderRadius: 8 }}
          >
            <h2 style={{ margin: 0 }}>{entry.job.name}</h2>
            <p className="app-job-meta" style={{ margin: 0, fontWeight: 600 }}>
              {entry.taskType.title}, {entry.tasks.length} tasks
            </p>
            <p style={{ margin: 0 }}>{entry.taskType.instruction}</p>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              <li className="app-pass">{passLine(1, summary.pass1)}</li>
              <li className="app-pass">{passLine(2, summary.pass2)}</li>
            </ul>
            {summary.problems.map((problem) => (
              <p key={problem} role="alert" style={{ margin: 0 }}>
                {problem}
              </p>
            ))}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button type="button" className="app-label" onClick={() => onLabel(entry)}>
                Start or continue labeling
              </button>
              <button type="button" className="app-results" onClick={() => onResults(entry)}>
                View results
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
