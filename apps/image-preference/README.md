# Image Preference: sample data and image sources

App 1 of LabelForge. The labeler sees two images side by side and picks A, B, or Tie. This folder holds the sample job; the task screen comes in a later task.

```
apps/image-preference/
  data/sample-tasks.json            the sample job: 25 image pair tasks
  public/images/ip-NN-a.svg, -b.svg the 50 images, 640 x 400
  tools/generate-sample-data.mjs    the script that draws every image and writes the task file
  tests/sampleData.test.ts          checks the job loads through the core loader and its images exist
  src/                              (the screen, added in the next app task)
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
