# App 2: Response Ranking — Requirements

A thin app on the finished LabelForge core. It adds NO core features; that is the point of this spec. It uses the core queue (FR-Q), label shell (FR-S), agreement scoring (FR-A), and export (FR-E) exactly as they are. Requirement numbers FR-R match the core spec in /.kiro/specs/label-forge/requirements.md.

- FR-R1. Shows one prompt and a list of responses (2 to 4). The labeler orders them best to worst by clicking arrows or dragging, or by pressing number keys in order.
- FR-R2. The label is the full ranking (ordered list of response IDs). Ties are not offered, to keep the ranking label simple and the agreement rule simple.
- FR-R3. Long responses are shown in full with scrolling inside the response card, never truncated silently.

Agreement rule for this app: labelsAgree compares the top-ranked response only. A documented simplification that keeps kappa meaningful for rankings without heavy statistics.
