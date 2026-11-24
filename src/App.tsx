import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  JobDashboard,
  LabelShell,
  SessionSetup,
  browserStore,
  clearSavedSession,
  type DashboardJob,
  type KeyValueStore,
} from "../core/src/session";
import type { Pass } from "../core/src/types";
import { JOBS } from "./jobs";
import { JobList } from "./JobList";
import { LabelErrorBoundary } from "./LabelErrorBoundary";

type View =
  | { kind: "list" }
  | { kind: "setup"; entry: DashboardJob }
  | { kind: "label"; entry: DashboardJob; pass: Pass; labelerName: string }
  | { kind: "results"; entry: DashboardJob };

interface Props {
  /** The jobs on offer. Defaults to both apps' sample jobs. */
  jobs?: readonly DashboardJob[];
  /** Where progress is saved. Defaults to the browser's localStorage. */
  store?: KeyValueStore;
}

/** The browser's storage, or the reason it cannot be used (blocked storage makes the lookup throw). */
function openStore(): { store: KeyValueStore } | { problem: string } {
  try {
    return { store: browserStore() };
  } catch (err) {
    return { problem: (err as Error).message };
  }
}

function Bar({ children }: { children?: ReactNode }) {
  return (
    <nav aria-label="Site" className="app-bar" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 16 }}>
      <strong>LabelForge</strong>
      {children}
    </nav>
  );
}

/**
 * LabelForge, as one page: the job list, and for each job the core's own flow
 * of session setup, the labeling shell, and the dashboard with scores and
 * exports. This only puts the core's components and the apps' sample jobs
 * together; it holds no labeling logic of its own.
 */
export function App({ jobs = JOBS, store: given }: Props) {
  const opened = useMemo(() => (given ? { store: given } : openStore()), [given]);
  const [view, setView] = useState<View>({ kind: "list" });

  // A new screen starts at the top of the page.
  useEffect(() => {
    window.scrollTo?.(0, 0);
  }, [view.kind]);

  const content = (() => {
    if ("problem" in opened) {
      return (
        <p role="alert" className="app-problem">
          LabelForge saves your work in this browser's local storage, and that is not available here ({opened.problem}).
          Allow site data for this page, or try another browser, and reload.
        </p>
      );
    }
    const { store } = opened;
    const toList = () => setView({ kind: "list" });

    switch (view.kind) {
      case "list":
        return (
          <JobList
            jobs={jobs}
            store={store}
            onLabel={(entry) => setView({ kind: "setup", entry })}
            onResults={(entry) => setView({ kind: "results", entry })}
          />
        );

      case "setup":
        return (
          <>
            <Bar>
              <button type="button" onClick={toList}>
                All jobs
              </button>
            </Bar>
            <SessionSetup
              job={view.entry.job}
              store={store}
              onStart={({ labelerName, pass }) => setView({ kind: "label", entry: view.entry, pass, labelerName })}
            />
          </>
        );

      case "label": {
        const { entry, pass, labelerName } = view;
        return (
          <>
            <Bar>
              <button type="button" onClick={toList}>
                All jobs
              </button>
              <button type="button" onClick={() => setView({ kind: "results", entry })}>
                View results
              </button>
            </Bar>
            <LabelErrorBoundary
              what={`${entry.job.name}, Pass ${pass}`}
              onBack={toList}
              onDeleteSaved={() => clearSavedSession(store, entry.job.id, pass)}
            >
              <LabelShell
                job={entry.job}
                tasks={entry.tasks}
                taskType={entry.taskType}
                pass={pass}
                labelerName={labelerName}
                store={store}
              />
            </LabelErrorBoundary>
          </>
        );
      }

      case "results":
        return (
          <>
            <Bar>
              <button type="button" onClick={toList}>
                All jobs
              </button>
              <button type="button" onClick={() => setView({ kind: "setup", entry: view.entry })}>
                Label this job
              </button>
            </Bar>
            <JobDashboard jobs={[view.entry]} store={store} />
          </>
        );
    }
  })();

  return (
    <main className="app" style={{ maxWidth: 960, margin: "0 auto", padding: 16, fontFamily: "system-ui, sans-serif", lineHeight: 1.45 }}>
      {content}
    </main>
  );
}
