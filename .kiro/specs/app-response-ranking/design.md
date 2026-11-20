# App 2: Response Ranking — Design

- Registers one TaskType with the core: id "response-ranking", title "Response Ranking".
- Task payload (data/sample-tasks.json): each task has an id, a prompt, and 2 to 4 responses, each with an id and text.
- Screen: the core LabelShell with one app area: the prompt at the top, response cards below in current ranking order. Reorder by arrows or drag, or number keys pressed in ranking order. Long responses scroll inside their card (FR-R3).
- isComplete: every response has a rank position. labelsAgree: the top-ranked response ID is the same in both labels.
- Sample data: 20 to 30 prompt tasks with written responses, prepared for this project.
- Success measure for the Skeleton Crew claim: this app is built against the finished core and changes zero core files. Any core change that turns out to be needed is recorded here with its reason, honestly.
