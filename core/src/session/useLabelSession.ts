import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Job, Pass, Task, TaskType } from "../types";
import { keyToAction } from "./keyboard";
import { LabelSession, type SessionView } from "./LabelSession";
import { browserStore, type KeyValueStore } from "./storage";

export interface UseLabelSessionOptions {
  job: Job;
  /** Keep this array stable between renders (load it once). A new array reopens the session. */
  tasks: readonly Task[];
  taskType: TaskType;
  pass: Pass;
  labelerName: string;
  /** Defaults to the browser's localStorage. */
  store?: KeyValueStore;
}

export interface Message {
  /** Changes on every message so repeating the same text still re-shows it. */
  id: number;
  kind: "saved" | "skipped" | "warning" | "error";
  text: string;
}

export interface LabelSessionApi extends SessionView {
  /** Pass this to `taskType.renderTask` as `onChange`. */
  setDraft(value: unknown): void;
  submit(): void;
  skip(): void;
  /** Brief confirmation or problem text; clears itself after a moment. */
  message: Message | null;
  /** The labels stored so far in this pass. */
  getLabels: LabelSession["getLabels"];
}

const MESSAGE_MS = 1800;

/**
 * Wires the queue, the current task, keyboard shortcuts (Enter, S), and label
 * saving together for one labeler, job, and pass.
 *
 * Opening can throw (name not allowed, saved state does not match the tasks).
 * Check the name with `checkSetup` first, as SessionSetup does.
 */
export function useLabelSession(options: UseLabelSessionOptions): LabelSessionApi {
  const { job, tasks, taskType, pass, labelerName } = options;
  const store = useMemo(() => options.store ?? browserStore(), [options.store]);

  const session = useMemo(
    () => LabelSession.open({ job, tasks, taskType, pass, labelerName, store }),
    [job.id, tasks, taskType, pass, labelerName, store],
  );
  const view = useSyncExternalStore(session.subscribe, session.getView);

  const setDraft = useCallback((value: unknown) => session.setDraft(value), [session]);
  const getLabels = useCallback(() => session.getLabels(), [session]);

  const [message, setMessage] = useState<Message | null>(null);
  const nextId = useRef(0);
  const show = useCallback((kind: Message["kind"], text: string) => {
    setMessage({ id: ++nextId.current, kind, text });
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), MESSAGE_MS);
    return () => clearTimeout(timer);
  }, [message]);

  const submit = useCallback(() => {
    try {
      const result = session.submit();
      if (result.ok) show("saved", "Label saved.");
      else if (result.reason === "incomplete") show("warning", "Finish this task before submitting.");
    } catch (err) {
      show("error", `Could not save the label: ${(err as Error).message}`);
    }
  }, [session, show]);

  const skip = useCallback(() => {
    try {
      const result = session.skip();
      if (!result.ok) return;
      show(
        "skipped",
        result.flagged
          ? "Skipped again. This task is flagged and will not come back."
          : "Skipped. This task will come back at the end.",
      );
    } catch (err) {
      show("error", `Could not skip the task: ${(err as Error).message}`);
    }
  }, [session, show]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const action = keyToAction(e);
      if (!action) return;
      e.preventDefault(); // stops Enter from also clicking a focused button
      if (action === "submit") submit();
      else skip();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [submit, skip]);

  return {
    ...view,
    setDraft,
    submit,
    skip,
    message,
    getLabels,
  };
}
