import type { ReactNode } from "react";
import type { Job, Pass, Task, TaskType } from "../types";
import type { KeyValueStore } from "./storage";
import { useLabelSession } from "./useLabelSession";

export interface LabelShellProps {
  job: Job;
  /** Keep this array stable between renders. */
  tasks: readonly Task[];
  taskType: TaskType;
  pass: Pass;
  labelerName: string;
  store?: KeyValueStore;
}

/**
 * Renders the task screen from inside its own component, so any state the app
 * keeps in `renderTask` (hooks included) is reset when the task changes.
 */
function TaskArea({ render }: { render: () => ReactNode }) {
  return <>{render()}</>;
}

/**
 * The frame every app renders inside (FR-S1): job title, task counter,
 * progress bar, labeler identity, the app's labeling area, and the shared
 * action bar (submit, skip). Enter and S work anywhere on the page (FR-S2);
 * each app's own choice keys are handled by its screen.
 */
export function LabelShell(props: LabelShellProps) {
  const { job, taskType } = props;
  const s = useLabelSession(props);
  const { progress, task } = s;

  return (
    <section className="lf-shell" aria-label={`${job.name}, ${taskType.title}`}>
      <header className="lf-header">
        <h1 className="lf-job">{job.name}</h1>
        <p className="lf-tasktype">{taskType.title}</p>
        <p className="lf-identity">
          Labeler: {s.labelerName} (Pass {s.pass})
        </p>
        <p className="lf-counter">
          {s.finished ? `All ${progress.total} tasks handled` : `Task ${progress.position} of ${progress.total}`}
        </p>
        <progress
          className="lf-progress"
          aria-label="Labeling progress"
          max={progress.total}
          value={progress.handled}
        />
      </header>

      <p className="lf-instruction">{taskType.instruction}</p>

      <div className="lf-task">
        {task ? (
          <TaskArea key={task.id} render={() => taskType.renderTask(task, s.setDraft)} />
        ) : (
          <p className="lf-finished">
            {progress.labeled} labeled
            {progress.flagged > 0 ? `, ${progress.flagged} skipped and flagged` : ""}. This pass is finished.
          </p>
        )}
      </div>

      <div className="lf-message" role="status" aria-live="polite">
        {s.message ? <span className={`lf-message-${s.message.kind}`}>{s.message.text}</span> : null}
      </div>

      <footer className="lf-actions">
        <button type="button" className="lf-submit" onClick={s.submit} disabled={!task || !s.canSubmit}>
          Submit <kbd>Enter</kbd>
        </button>
        <button type="button" className="lf-skip" onClick={s.skip} disabled={!task}>
          Skip <kbd>S</kbd>
        </button>
      </footer>
      <p className="lf-shortcuts">Shortcuts: Enter submits, S skips.</p>
    </section>
  );
}
