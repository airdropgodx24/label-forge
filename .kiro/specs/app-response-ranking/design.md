# App 2: Response Ranking — Design

- Registers one TaskType with the core: id "response-ranking", title "Response Ranking".
- Task payload (data/sample-tasks.json): each task has an id, a prompt, and 2 to 4 responses, each with an id and text.
- Screen: the core LabelShell with one app area: the prompt at the top, response cards below in current ranking order. Reorder by arrows or drag, or number keys pressed in ranking order. Long responses scroll inside their card (FR-R3).
- isComplete: every response has a rank position. labelsAgree: the top-ranked response ID is the same in both labels.
- Sample data: 20 to 30 prompt tasks with written responses, prepared for this project.
- Success measure for the Skeleton Crew claim: this app is built against the finished core and changes zero core files. Any core change that turns out to be needed is recorded here with its reason, honestly.

## Build record: core files changed

**Core files changed during this app's build: 0.**

Counted at task 3 (24 Nov 2026) over everything since the commit before App 2 started (`23b8844`, "Spec: tick App 1 task 3"), committed or not:

```
git diff --name-only 23b8844 -- core                 # nothing
git ls-files --others --exclude-standard -- core     # nothing
```

Every file App 2 added or changed is under `apps/response-ranking/`, apart from the spec files in `.kiro/specs/app-response-ranking/`. `package.json`, `package-lock.json` and `tsconfig.json` are also unchanged by this app. The core's own test suite, run in full after each task, still passes untouched.

No core change was needed. These are the places where the core's shape made the app work harder, recorded so the cost is visible. None of them blocked the app, and none was changed:

- **`isComplete(label)` cannot see the task.** It cannot check a ranking against the number of responses, so a partial list such as `[r2, r3]` of four responses would pass as finished. The screen therefore reports a label only once every response is placed, and an empty list at every earlier step.
- **A draft cannot be withdrawn.** The session has no way to unset a label after `onChange` has reported one. When the labeler starts over, the screen reports the same empty list, which `isComplete` rejects, so a stale ranking can never be submitted.
- **The shell lists only its own shortcuts.** It shows Enter and S. The ranking keys (1 to 4) are explained by the screen's status line instead.
- **Kappa pools the top response ids across tasks.** The core groups labels into categories using `labelsAgree`, and with the top-choice rule a category is a response id such as `r2`. Ids are positions within each task, so kappa treats "r2" in one task and "r2" in another as the same category. Percent agreement is exact; kappa for rankings is an approximation, which is part of the cost of the top-ranked-only simplification and is why the screen and README state the rule.

To check this record later, run the two `git` commands above against the current tree. Any output means a core file has changed since this was written, and this section needs updating.
