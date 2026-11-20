# LabelForge

One lean labeling skeleton, two working apps.

LabelForge is a local-first web tool for AI data labeling. It builds the four things every labeling tool needs, once, as a shared core:

1. A **queue** that hands out tasks one at a time.
2. A **labeling shell**: header, progress, keyboard shortcuts, skip and submit.
3. **Agreement scoring** between two labelers (percent agreement and Cohen's kappa), with a disagreement list.
4. A **dataset export** in one record shape, as JSONL or CSV.

Two apps run on that core, each as only a task definition, one screen, and sample data:

- **Image Preference** (`apps/image-preference/`): two images side by side, pick A, B, or Tie.
- **Response Ranking** (`apps/response-ranking/`): one prompt, 2 to 4 responses, rank them best to worst.

Built with Kiro for the Kiroween 2026 hackathon, Skeleton Crew category. The `/.kiro` folder holds the working specs and steering docs used to build it.

## Status

Spec phase. The core spec lives in `/.kiro/specs/label-forge/`. The build runs 21 to 26 Nov 2026; run instructions land with the scaffold.

## Licence

MIT. See `LICENSE`.
