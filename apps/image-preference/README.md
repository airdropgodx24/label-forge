# Image Preference: sample data and image sources

App 1 of LabelForge. The labeler sees two images side by side and picks A, B, or Tie. This folder holds the sample job and the task screen.

```
apps/image-preference/
  data/sample-tasks.json            the sample job: 25 image pair tasks
  public/images/ip-NN-a.svg, -b.svg the 50 images, 640 x 400
  tools/generate-sample-data.mjs    the script that draws every image and writes the task file
  tests/                            sample data checks, screen tests, the shell serving the sample job, and the two-pass end-to-end run
  src/ImagePreferenceScreen.tsx     the task screen: two images, A / B / Tie, keys 1 2 3, broken image placeholder
  src/imagePreferenceType.tsx       the TaskType the core uses: id, title, isComplete, labelsAgree
  src/payload.ts                    payload reading and image path resolving
  src/index.ts                      exports, plus the sample job and its tasks
```

## The sample job

25 tasks, `ip-01` to `ip-25`, in the core's task file format (a JSON array in serving order). Each task:

```json
{
  "id": "ip-01",
  "type": "image-preference",
  "payload": {
    "instruction": "Pick the image that better matches: a calm morning scene",
    "imageA": "images/ip-01-a.svg",
    "imageB": "images/ip-01-b.svg"
  }
}
```

- **Instruction line.** Every task reads "Pick the image that better matches: ..." followed by a short description of a scene, such as "a stormy night at sea" or "a field of tall grass at golden hour". The core loader does not look inside the payload; the screen reads `instruction`.
- **Image paths** are relative to `public/`, so `images/ip-01-a.svg` is the file `public/images/ip-01-a.svg`. Payloads may also hold full URLs (FR-I3); the sample job uses local files only, so it runs with no network.
- **Mix of answers.** The pairs were drawn so that a careful labeler has a clear answer for 20 of them (10 where A fits better, 10 where B fits better) and a real Tie for 5 (ip-12, ip-15, ip-23, ip-24, ip-25), where the two images are close variants of the same scene. This gives a second labeler room to disagree, which the agreement score needs.

## How the images were generated

All 50 images are original artwork drawn by `tools/generate-sample-data.mjs`, a plain Node script with no dependencies. It builds each image as SVG from scene parameters (sky, sun, moon, clouds, mountains, hills, water, buildings, trees, weather) using a seeded random generator, so running it again gives byte-identical files.

- No photographs, no scraped or downloaded images, no AI image model, no stock or public-domain assets, no fonts.
- The images are released with the rest of the repository under the MIT licence (see the root `LICENSE`).
- Each file carries a comment naming the script that made it, and the test checks that no file embeds a bitmap or links outside itself.

To regenerate (this overwrites `data/sample-tasks.json` and `public/images/*.svg`):

```
node apps/image-preference/tools/generate-sample-data.mjs
```

To check the data, run `npm test` from the repo root.

## The task screen

The app adds one screen and one task type to the core; it changes nothing in `core/`.

- **Layout.** The task's instruction line sits above two images side by side, captioned A and B, in boxes of the same size. Under them are three choices: A, Tie, B, each with its key.
- **Keys.** `1` picks A, `2` picks B, `3` picks Tie. The pick is the label (`"A"`, `"B"` or `"tie"`). Enter submits and S skips, as in every app: those two belong to the core shell.
- **Broken images.** If an image fails to load, its box shows "Image A could not be loaded." (or B) at the same size, and the labeler can still pick or skip. A task with no image paths at all shows a plain message and cannot be labeled; skip it.
- **Agreement rule.** Two picks agree when they are equal. Tie is its own pick.
- **Using it.** The core takes a task type as a plain object, so there is no registry to call. Pass `sampleJobEntry()` from `src/index.ts` to the core: `<LabelShell job tasks taskType ... />` for labeling, or as an entry in `<JobDashboard jobs={[...]} />`. An app served from a sub-path can call `createImagePreferenceType({ imageBase: "/label-forge/" })` so relative image paths still resolve.

## The end-to-end run

`tests/endToEnd.test.tsx` labels all 25 pairs through the real shell as Pass 1 (Ada) and Pass 2 (Grace), with a planned mix of agreement and disagreement, then checks the dashboard and the four export files against the labels given. Its header comment holds the answer key, the planned differences, and the figures worked out by hand. To print the dashboard reading and the export files for checking by eye:

```
E2E_REPORT=1 npx vitest --run apps/image-preference/tests/endToEnd.test.tsx
```
