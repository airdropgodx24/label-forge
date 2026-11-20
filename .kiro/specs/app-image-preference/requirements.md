# App 1: Image Preference — Requirements

A thin app on the LabelForge core. It adds NO core features. It uses the core queue (FR-Q), label shell (FR-S), agreement scoring (FR-A), and export (FR-E) exactly as they are. Requirement numbers FR-I match the core spec in /.kiro/specs/label-forge/requirements.md.

- FR-I1. Shows two images side by side, labeled A and B, at a consistent size, with the job's instruction line above them (for example, "Pick the image that better matches: a calm morning scene").
- FR-I2. The labeler picks A, B, or Tie. Keys 1, 2, and 3 map to A, B, Tie. The pick is the label.
- FR-I3. Images load from local files in the repo or from URLs in the task payload. Broken image URLs show a clear placeholder instead of breaking the session.

Agreement rule for this app: labelsAgree is simple equality of the pick (A, B, or Tie).
