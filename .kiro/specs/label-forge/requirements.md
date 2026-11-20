# LabelForge: Requirements

Scope rule for everything below: this is a solo build in about a week of Kiro sessions. If a requirement does not help the demo or the Skeleton Crew story, it is a non-goal (see the end of this file).

## User stories

**As an annotation lead setting up a small job,**
- I want to load a set of tasks from a simple file so I can start labeling without a database or a server setup.
- I want to choose which app (image preference or response ranking) a job uses, while everything else about the tool stays the same.
- I want to see how many tasks are done, how many are left, and how far a second quality pass has got, so I know where the job stands.

**As a labeler,**
- I want one task at a time, presented the same way in every app, so I can build speed and rhythm.
- I want keyboard shortcuts for every labeling action so I never have to reach for the mouse mid-flow.
- I want to skip a task I cannot judge and have it come back later, instead of being forced into a bad label.
- I want to see my progress (tasks done, position in queue) at all times.

**As a quality checker (second labeler),**
- I want to label the same tasks independently, without seeing the first labeler's answers, so the comparison is honest.
- I want an agreement score per job that tells me plainly how often the two labelers agreed, and a stricter score (Cohen's kappa) that corrects for chance agreement.
- I want to see the specific tasks where labelers disagreed, so I can fix guidelines or re-label just those.

**As a dataset consumer,**
- I want one export button that gives me the finished labels in a documented format (JSONL, with a CSV option) that is identical in shape across both apps.
- I want each exported record to carry the task ID, the task type, the label, the labeler, and the agreement status, so the data is auditable.

## Functional requirements: shared core

### Queue
- FR-Q1. The core loads tasks from a JSON file per job. Each task has an ID, a task type, and a payload (image pair or prompt plus responses).
- FR-Q2. The queue serves tasks in file order, tracks states per task (pending, in progress, labeled, skipped, done), and resumes where a labeler left off after a page reload (state kept in browser local storage).
- FR-Q3. Skipped tasks return to the end of the queue once, then stay flagged if skipped again.
- FR-Q4. The core supports a second pass: a different labeler identity labels the same task set for agreement scoring. Passes are selected on the job screen (Pass 1 or Pass 2).

### Label session and shared screen shell
- FR-S1. Every app renders inside the same shell: job title, task counter, progress bar, labeler identity, the app-specific labeling area, and the shared action bar (submit, skip).
- FR-S2. Keyboard shortcuts work in both apps: number keys or arrow keys for the app-specific choice, Enter to submit, S to skip. Shortcuts are shown on screen.
- FR-S3. Submitting a label stores it immediately, advances the queue, and shows brief confirmation feedback. No label is lost on refresh.
- FR-S4. A labeler picks a display name on the job screen. No accounts, no passwords. The name is only used to separate Pass 1 from Pass 2 and to stamp exports.

### Agreement scoring
- FR-A1. For tasks labeled in both passes, the core computes percent agreement.
- FR-A2. The core also computes Cohen's kappa for the job. For rankings, two rankings count as agreeing if the top choice matches (documented simplification, stated in the UI and README).
- FR-A3. A results view lists every disagreement with both labels side by side.
- FR-A4. The dashboard shows both scores with a one-line plain-English reading (for example, "Labelers agreed on 86 of 100 tasks. Kappa 0.71, usually read as substantial agreement.").

### Export
- FR-E1. One export action per job produces a JSONL file: one record per labeled task with task ID, task type, payload reference, label, labeler, pass, timestamp, and agreement status (agreed, disagreed, single pass).
- FR-E2. A CSV export with the same fields is available from the same screen.
- FR-E3. The export format is identical across both apps except for the label field's content, which follows the task type. The format is documented in the README with one example record per app.
- FR-E4. Export includes only finished labels, and the file name carries the job name and date.

### Sample data
- FR-D1. Each app ships with a small bundled sample job (20 to 30 tasks) so the whole loop, including a second pass and an export, can be run in the demo and by judges with zero setup.
- FR-D2. Sample images are generated for this project (decision locked 18 Nov 2026), with the generation noted in the repo. No public-domain, scraped, or copyrighted images.

## Functional requirements: App 1, Image Preference

- FR-I1. Shows two images side by side, labeled A and B, at a consistent size, with the job's instruction line above them (for example, "Pick the image that better matches: a calm morning scene").
- FR-I2. The labeler picks A, B, or Tie. Keys 1, 2, and 3 map to A, B, Tie. The pick is the label.
- FR-I3. Images load from local files in the repo or from URLs in the task payload. Broken image URLs show a clear placeholder instead of breaking the session.

## Functional requirements: App 2, Response Ranking

- FR-R1. Shows one prompt and a list of responses (2 to 4). The labeler orders them best to worst by clicking arrows or dragging, or by pressing number keys in order.
- FR-R2. The label is the full ranking (ordered list of response IDs). Ties are not offered, to keep the ranking label simple and the agreement rule simple.
- FR-R3. Long responses are shown in full with scrolling inside the response card, never truncated silently.

## Non functional requirements

- NFR-1. Runs fully in the browser with no backend and no paid services. Hosting is a free static host.
- NFR-2. Works on a mid-range laptop over an average connection. Sample jobs stay small.
- NFR-3. All UI text is plain English. No third-party trademarks, no copyrighted music or assets anywhere in the app or video.
- NFR-4. The app must stay live and free to access until 29 Jan 2027 (end of judging).

## Non-goals (explicitly out of scope)

- No user accounts, login, or authentication of any kind.
- No server, database, cloud sync, or multi-device support. Local storage only.
- No payments, no admin panel, no team management, no roles beyond a labeler display name.
- No image upload pipeline, no image editing, no annotation drawing (no bounding boxes or segmentation). Preference picks only.
- No model training, no API integrations with AI providers, no live data feeds.
- No adjudication workflow beyond listing disagreements. A third tie-breaker pass is a stretch goal only if everything else is done by the feature freeze.
- No mobile app. The tool targets desktop browsers, where labeling work happens.
- Only two task types. A third app is welcome after the hackathon, not during it.
