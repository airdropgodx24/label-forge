import { useState, type FormEvent } from "react";
import type { Job, Pass } from "../types";
import { MAX_NAME_LENGTH, checkSetup, normalizeName, savedLabelerName } from "./savedSession";
import { browserStore, type KeyValueStore } from "./storage";

export interface SessionChoice {
  labelerName: string;
  pass: Pass;
}

export interface SessionSetupProps {
  job: Job;
  store?: KeyValueStore;
  onStart(choice: SessionChoice): void;
}

/**
 * The part of the job screen where a labeler picks a display name and a pass
 * (FR-S4, FR-Q4). No accounts: the name only separates Pass 1 from Pass 2 and
 * stamps exports. It is checked with `checkSetup` before the shell opens.
 */
export function SessionSetup({ job, store, onStart }: SessionSetupProps) {
  const kv = store ?? browserStore();
  const [pass, setPass] = useState<Pass>(1);
  const [name, setName] = useState(() => savedLabelerName(kv, job.id, 1) ?? "");
  const [problem, setProblem] = useState<string | null>(null);

  const choosePass = (next: Pass) => {
    setPass(next);
    setProblem(null);
    const saved = savedLabelerName(kv, job.id, next);
    if (saved) setName(saved); // resuming this pass: offer the name it was started with
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    try {
      const found = checkSetup({ store: kv, jobId: job.id, pass, labelerName: name });
      if (found) return setProblem(found);
    } catch (err) {
      return setProblem((err as Error).message);
    }
    onStart({ labelerName: normalizeName(name), pass });
  };

  return (
    <form className="lf-setup" onSubmit={onSubmit}>
      <h1 className="lf-job">{job.name}</h1>
      <fieldset>
        <legend>Pass</legend>
        {([1, 2] as const).map((p) => (
          <label key={p}>
            <input type="radio" name="pass" checked={pass === p} onChange={() => choosePass(p)} /> Pass {p}
          </label>
        ))}
      </fieldset>
      <label>
        Your name
        <input
          type="text"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          onChange={(e) => {
            setName(e.target.value);
            setProblem(null);
          }}
        />
      </label>
      <div role="alert">{problem}</div>
      <button type="submit">Start labeling</button>
    </form>
  );
}
