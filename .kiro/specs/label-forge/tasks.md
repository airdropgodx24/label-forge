# LabelForge: Build Plan

How to read this plan: each task is sized for one Kiro session (roughly one sitting). Tasks are ordered so the skeleton exists before any app, App 1 proves the skeleton, and App 2 is built as a thin layer on top to prove reuse. Requirement references point at `requirements.md`. Dates follow the prep pack timeline: spec phase 18 to 20 Nov, core build 21 to 26 Nov, feature freeze 27 Nov, polish 28 to 30 Nov, video 1 to 2 Dec, submit 3 Dec. Hard deadline 4 Dec 2026, 11:00 PM WAT.

## Phase 0: Setup (before or at the start of the spec phase)

- [ ] **T0.1 Repo and skeleton folders.** Create the public GitHub repo with the layout from `design.md`: `core/`, `apps/image-preference/`, `apps/response-ranking/`, `/.kiro/`. Add the MIT `LICENSE` file. Write `.gitignore` for a Vite project and confirm `/.kiro` is NOT in it. (Rule risk if wrong.)
- [ ] **T0.2 Kiro project open and model check.** Open the repo in Kiro, confirm the AI models actually respond from Nigeria before depending on them (regional availability is the entrant's responsibility under the rules). Toggle the Kiro setting that opts out of content being used to improve services, before pasting anything sensitive.
- [ ] **T0.3 Steering docs.** Create the steering files listed in `kiro-usage.md` (product, tech, structure). Keep them short and real.

## Phase 1: Specs in Kiro (18 to 20 Nov)

- [ ] **T1.1 Core spec.** Create the Kiro spec for the core from `requirements.md` and `design.md`: requirements, design, tasks, covering FR-Q, FR-S, FR-A, FR-E. This spec is the main Technological Implementation evidence.
- [ ] **T1.2 App specs.** Create one short spec per app (image preference: FR-I; response ranking: FR-R), each written as "core plus one screen plus sample data". App 2's spec should explicitly state it adds no core features.

## Phase 2: Skeleton core (21 to 23 Nov)

- [x] **T2.1 Types and queue.** Implement `core/types.ts` and `TaskQueue` (FR-Q1 to FR-Q3): load tasks from JSON, state machine, skip and re-queue. Unit tests for the state machine.
- [x] **T2.2 Label shell and session.** Implement `LabelShell` and `useLabelSession` (FR-S1 to FR-S4): header, progress, action bar, keyboard shortcuts, local storage persistence, labeler name and pass selection.
- [ ] **T2.3 Agreement scoring.** Implement `AgreementScorer` (FR-A1 to FR-A3): percent agreement, Cohen's kappa using each task type's `labelsAgree` rule, disagreement extraction. Unit tests with hand-computed examples, including a kappa case worked out by hand first so the test is a real check.
- [ ] **T2.4 Export.** Implement `Exporter` (FR-E1 to FR-E4): JSONL and CSV, shared record shape, file naming. Unit test the record shape.
- [ ] **T2.5 Dashboard.** Implement `JobDashboard` (FR-A4, FR-E1): progress counts, agreement summary in plain English, disagreement list, export buttons.

Core exit check: the core compiles, tests pass, and a dummy task type (a trivial test screen) can run a full label, score, export loop. If the dummy works, the skeleton is real.

## Phase 3: App 1, Image Preference (24 to 25 Nov)

- [ ] **T3.1 Sample data.** Prepare 20 to 30 image pair tasks (FR-D1, FR-D2). Images generated for this project, generation noted in the app folder. Write the instruction line a real job would use.
- [ ] **T3.2 Preference screen.** Implement the task screen (FR-I1 to FR-I3): side by side images, A, B, Tie, keys 1, 2, 3, broken image placeholder. Register the task type with the core. No core changes allowed in this task; if the core needs a change, note it and do it as a separate small spec task so the reuse story stays honest.
- [ ] **T3.3 End-to-end pass.** Label the full sample job as Pass 1 and Pass 2 with deliberately mixed agreement, check the dashboard scores and the export file by eye.

## Phase 4: App 2, Response Ranking (26 Nov)

- [ ] **T4.1 Sample data.** Write 20 to 30 prompt tasks with 2 to 4 responses each (FR-D1). Write the responses by hand or generate and edit them; quality matters because judges will read them. Keep prompts varied (support reply, summary, code help, tone rewrite).
- [ ] **T4.2 Ranking screen.** Implement the ranking screen (FR-R1 to FR-R3): reorder by arrows and number keys, full text visible, label is the ordered list. Register with the core. Same rule as App 1: no core changes without a separate noted task.
- [ ] **T4.3 The reuse proof.** Label the ranking sample job in both passes, confirm scoring and export work unchanged, and write down what App 2 actually cost: files added, core files touched (target: zero). This note goes into the README and the "How Kiro was used" write-up. It is the strongest single paragraph in the submission.

**Feature freeze: end of 26 Nov / 27 Nov.** Nothing new after this. Bugs and polish only.

## Phase 5: Polish and submission assets (28 to 30 Nov)

- [ ] **T5.1 UI pass.** One design pass on the shell: spacing, contrast, readable type, clear focus states. Both apps inherit it through the shell, which is the point.
- [ ] **T5.2 Deploy.** Build and deploy to the free static host. Confirm the live URL works from a fresh browser with no local state, and run both sample jobs end to end on the live site.
- [ ] **T5.3 README.** Write the README: what LabelForge is, the skeleton story, how to run it locally, the shared components list, the export format with one example record per app, the App 2 reuse note, image sources, and the open-source licence note.
- [ ] **T5.4 `/.kiro` audit.** Confirm the specs, steering, and hooks in `/.kiro` are committed, complete, and honest (they show the real process, including spec changes). Confirm again that `/.kiro` is not gitignored and is visible in the public repo.
- [ ] **T5.5 Devpost draft.** Create the submission draft on 30 Nov and fill every field: category Skeleton Crew, app URL, text description, repo URL, licence visible, "How Kiro was used" write-up (draft from `kiro-usage.md`).
- [ ] **T5.6 Bonuses.** Publish the blog post about building with Kiro (mention Kiroween 2026) and add its URL to the form. Make the Social Blitz post starting with `#KiroweenHackathon26`, written by the entrant personally, and add its URL.

## Phase 6: Video and submit (1 to 3 Dec)

- [ ] **T6.1 Shoot the demo** following `demo-script.md`. Record at a calm pace, real app, no mock-ups.
- [ ] **T6.2 Edit and upload.** Cut to under 3 minutes (target 2:40). No copyrighted music. Upload to YouTube as public, paste the link into the Devpost draft.
- [ ] **T6.3 Final checklist run.** Walk the full checklist below against the live form and repo.
- [ ] **T6.4 Submit on 3 Dec.** Keep 4 Dec as buffer only.
- [ ] **T6.5 After submitting.** Leave the app live and free until 29 Jan 2027. Do not push breaking changes to the deployed site during judging.

## Submission checklist (from the prep pack)

- [ ] Devpost account and registration done; Kiro account in place.
- [ ] Working app URL in the form; app free and unrestricted until 29 Jan 2027.
- [ ] Text description explains features and functionality.
- [ ] Demo video under 3 minutes, public on YouTube, shows the app functioning, link in the form.
- [ ] Public GitHub repo with all source, assets, and run instructions.
- [ ] Open-source licence file at repo root, detected by GitHub.
- [ ] `/.kiro` directory at repo root, committed, NOT in `.gitignore`.
- [ ] "How Kiro was used" write-up in the form (specs, steering, hooks, surfaces used).
- [ ] Skeleton Crew specific: two separate folders for the two applications in the repo.
- [ ] Category selected: Skeleton Crew (exactly one category).
- [ ] Project is new (built 30 Oct to 4 Dec 2026); any pre-existing code beyond libraries or templates disclosed in the submission.
- [ ] All materials in English.
- [ ] Bonus Blog URL added (optional, cheap). Social Blitz post URL added (optional, cheap, hashtag first).
- [ ] Credit housekeeping: credit request was due 1 Dec 9:00 PM WAT (already submitted 15 Nov); any credit code redeemed by 4 Dec.
