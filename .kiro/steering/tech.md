# Tech steering: LabelForge

- **Stack:** TypeScript, React, Vite. One single-page web app, one deployable URL; the router switches between the two apps.
- **Styling:** Plain CSS (CSS modules or one shared stylesheet in the core). No UI component library.
- **Storage:** Browser local storage for label state and progress, keyed per job and pass. Task definitions are static JSON files shipped with each app.
- **Testing:** Vitest for core logic only (queue state machine, agreement scoring, export record shape).
- **Dependencies:** Do not add a new dependency without stating the reason in the session first. Boring technology, chosen once.
- **UI text:** Plain English, no emojis in the UI. Keyboard shortcuts are a first-class part of the labeling flow, not an extra.
