# App 1: Image Preference — Design

- Registers one TaskType with the core: id "image-preference", title "Image Preference".
- Task payload (data/sample-tasks.json): each task has an id, an instruction line, imageA and imageB (repo-local paths under public/images/, or URLs).
- Screen: the core LabelShell with one app area: two images side by side at a consistent size, labeled A and B, instruction line above. Pick buttons A, B, Tie, also keys 1, 2, 3 (wired through the shell's shared keyboard handling).
- isComplete: a pick exists. labelsAgree: the two picks are equal.
- Broken image: an on-error placeholder box with plain text, never a broken session.
- Sample data: 20 to 30 image pairs, images generated for this project, the generation noted in this app folder.
