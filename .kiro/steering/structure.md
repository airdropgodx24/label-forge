# Structure steering: LabelForge

## Layout

```
core/                 the shared skeleton (queue, session, scoring, export)
apps/image-preference/  App 1: task definition, one screen, sample data
apps/response-ranking/  App 2: task definition, one screen, sample data
.kiro/                specs, steering, hooks (must stay committed, never gitignored)
```

## The plugin rule (the whole architecture)

- The core NEVER imports from an app. Apps register a TaskType with the core: id, title, instruction, renderTask, isComplete, labelsAgree.
- The core owns: task loading, queue order and state, the label shell (header, progress, action bar, keyboard shortcuts), label storage, agreement scoring, export.
- An app owns only: how its task looks, what a finished label is, and when two labels count as agreeing.
- Agreement rules: Image Preference uses simple equality (A, B, or Tie). Response Ranking compares the top-ranked response only.
- Agreement scoring and export logic live only in the core. Export is one shared record shape, written as JSONL or CSV, identical for both apps.
- If an app seems to need a core change, stop: note it, and make the core change as its own small spec task so the reuse story stays honest.
