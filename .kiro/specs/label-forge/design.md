# LabelForge: Design

## Design principles

1. **The core must not know what it is labeling.** The queue, session, scoring, and export code never mention images or responses. Task types plug in through one small interface.
2. **Boring technology, chosen once.** One framework, one language, no backend, no build-time services to pay for. The interesting part of this project is the skeleton idea, not the stack.
3. **Everything a judge needs runs with zero setup.** Bundled sample data, no keys, no accounts, no environment variables.

## Stack

- **Language and framework:** TypeScript with React and Vite. One single-page web app. This is the fastest path to a polished labeling UI, and Kiro handles it well.
- **Styling:** Plain CSS modules or a single shared stylesheet in the core. No UI component library; the shell is small and a hand-rolled stylesheet keeps both apps visually consistent and the repo lean.
- **Storage:** Browser local storage for label state and progress. Task definitions are static JSON files shipped with each app. No database.
- **Testing:** Vitest for the core logic (queue state machine, agreement scoring, export shape). These are the units where a bug would embarrass the demo, and they are pure functions, so they are cheap to test. Kiro property-based testing can be used for the scoring module if time allows (see `kiro-usage.md`).
- **Hosting:** Any free static host (GitHub Pages is the default choice, since the repo is on GitHub anyway). The built site is plain static files.
- **Licence:** MIT, in a `LICENSE` file at the repo root so GitHub detects and displays it.

## Repo layout

The category requires two separate folders for the two applications, plus the `/.kiro` directory at the root.

```
label-forge/
  .kiro/
    specs/label-forge/        (requirements.md, design.md, tasks.md as used in Kiro)
    steering/                 (product, tech, and structure steering docs)
    hooks/                    (hook definitions used during the build)
  LICENSE
  README.md
  package.json
  core/
    src/
      queue/                  (task loading, queue state machine)
      session/                (label session, shared shell components)
      scoring/                (percent agreement, Cohen's kappa, disagreement list)
      export/                 (JSONL and CSV writers, record types)
      types.ts                (Task, Label, Job, TaskType plugin interface)
    tests/
  apps/
    image-preference/
      src/                    (ImagePreferenceScreen component, task type registration)
      data/sample-tasks.json
      public/images/          (sample images, generated for this project)
    response-ranking/
      src/                    (ResponseRankingScreen component, task type registration)
      data/sample-tasks.json
  site/ (build output config only, if the host needs it)
```

Notes on the layout:

- One app, two app folders, one core. The router in the single-page app switches between the two apps; both import from `core/`. This keeps one deployable URL for judges while the repo structure shows the two applications and the shared skeleton plainly.
- `.gitignore` must not exclude `/.kiro`. This is a hard rule risk: the prep notes flag that gitignoring `/.kiro` could disqualify the entry. Check it twice, once at repo creation and once before submitting.

## The task type plugin interface

This interface is the whole Skeleton Crew argument, so it stays tiny:

```ts
interface TaskType {
  id: string;                          // "image-preference" or "response-ranking"
  title: string;                       // shown in the shell header
  instruction: string;                 // the labeling instruction line
  renderTask(task, onChange): Screen;  // the app-specific labeling area
  isComplete(label): boolean;          // has the labeler finished this task
  labelsAgree(a, b): boolean;          // app-specific agreement rule for kappa input
}
```

- The core owns: loading tasks, queue order and state, the shell, keyboard handling for shared actions, storing labels, scoring, export.
- The app owns: how a task looks, what a finished label is, and when two labels count as agreeing.
- Image Preference: `labelsAgree` is simple equality (A, B, or Tie).
- Response Ranking: `labelsAgree` compares the top-ranked response only, a documented simplification that keeps kappa meaningful for rankings without heavy statistics.

## Data model

Plain TypeScript types, stored as JSON.

```
Job {
  id, name, taskTypeId, createdAt
}

Task {
  id, jobId, type, payload
}
  Image payload:  { prompt: string, imageA: string, imageB: string }
  Ranking payload: { prompt: string, responses: [{ id, text }] }

Label {
  taskId, labelerName, pass (1 or 2), value, createdAt
}
  Image value:   "A" | "B" | "tie"
  Ranking value: ordered array of response IDs, best first

AgreementReport {
  jobId, totalDoubleLabeled, agreedCount,
  percentAgreement, kappa, disagreements: [{ taskId, pass1, pass2 }]
}

ExportRecord {
  taskId, taskType, labeler, pass, label, agreementStatus, exportedAt
}
```

State persistence: labels and queue positions are saved to local storage under a key per job and pass, so a refresh mid-demo is survivable.

### Task states (FR-Q2, FR-Q3)

The queue tracks one state per task. Transitions are a fixed table in `core/src/queue/taskState.ts`; anything not listed is rejected.

```
pending --start--> in_progress --submit--> labeled --complete--> done
   ^                    |
   |                  skip
   |                    v
   +-----requeue----- skipped   (no requeue on the second skip: stays flagged)
```

- `pending`: waiting to be served.
- `in_progress`: served to the labeler, no answer yet. At most one task is in progress at a time.
- `labeled`: a label has been submitted.
- `done`: the label has been committed by the session, meaning it is stored. `done` is final. The session calls `markDone` after storing the label; the queue does not store anything itself.
- `skipped`: the first skip re-queues the task at the end of the queue as `pending`. A second skip leaves it `skipped` and flagged. It is not served again and does not hold the queue open.

`labeled` and `done` are separate so the queue can show a submitted label before the session has finished storing it, and so a failed store leaves the task visibly short of `done`.

## Shared components (the skeleton, listed for the README)

1. `TaskQueue`: loads tasks, tracks state, serves the next task, handles skip and re-queue.
2. `LabelShell`: the screen frame every app uses (header, instruction, progress bar, action bar).
3. `useLabelSession`: hook that wires the queue, the current task, keyboard shortcuts, and label saving together.
4. `AgreementScorer`: percent agreement, Cohen's kappa, disagreement extraction.
5. `Exporter`: JSONL and CSV writers producing the one shared record format.
6. `JobDashboard`: progress counts, agreement summary, disagreement list, export buttons. Shared by both apps.

Each app contributes exactly two things: a task screen component and a sample data file. If an app needs a third thing, that is a design smell worth questioning in a spec session.

## Key flows

**Labeling flow:** pick a job, pick a pass and a display name, label tasks in the shell until the queue is done. Progress persists locally.

**Quality flow:** a second labeler runs Pass 2 on the same job. The dashboard then shows percent agreement, kappa, and the disagreement list.

**Export flow:** from the dashboard, download JSONL or CSV. Records include agreement status per task so disagreements travel with the data instead of being hidden.

## Risks and mitigations at design level

- **Kappa for rankings is a simplification.** Mitigation: state the top-choice rule in the UI, the README, and this design. Honesty here reads as craft, not weakness.
- **Local storage limits.** Sample jobs are small (20 to 30 tasks), labels are tiny. No risk at demo scale.
- **Image licensing.** Only sample images generated for this project (decision locked 18 Nov 2026), with a sources note in the app folder. No public-domain or scraped images.
- **One URL, two apps.** If a judge expects two separate sites, the README explains the single app with two application folders, which matches the category wording (two applications from one foundation, in two repo folders).
