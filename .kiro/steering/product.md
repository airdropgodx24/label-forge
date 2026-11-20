# Product steering: LabelForge

LabelForge is a small, free, local-first web tool for AI data labeling, built for the Kiroween 2026 hackathon, Skeleton Crew category.

## The idea

Almost every labeling tool needs the same four things: a task queue, a labeling screen, an agreement check between two labelers, and a dataset export. LabelForge builds those four once, as one shared core (the skeleton), and proves the skeleton by running two different labeling apps on top of it:

- **App 1, Image Preference:** two images side by side, the labeler picks A, B, or Tie.
- **App 2, Response Ranking:** one prompt and 2 to 4 model responses, the labeler ranks them best to worst.

Each app is only a task definition, one labeling screen, and sample data. Everything else is the shared core.

## Who it is for

AI data contributors and annotation leads running small labeling jobs, small ML teams and solo builders who need preference or ranking data, and students learning how RLHF data gets made.

## Non-goals (do not add these)

- No accounts, sign-in, or user management.
- No backend, no database, no server sync. Browser local storage only.
- No file uploads from labelers.
- No features outside the requirements in /.kiro/specs/label-forge/requirements.md without updating the spec first.
