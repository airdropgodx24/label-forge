# Response Ranking: sample data

App 2 of LabelForge. The labeler sees one prompt and 2 to 4 responses and ranks them from best to worst. This folder holds the sample job and the ranking screen.

```
apps/response-ranking/
  data/sample-tasks.json            the sample job: 25 prompt tasks
  tools/build-sample-data.mjs       the script that holds every prompt and response and writes the task file
  tools/build-sample-data.d.mts     types for the script, so the tests can import it
  src/ResponseRankingScreen.tsx     the task screen: prompt, response cards, arrows, drag, number keys
  src/ranking.ts                    the ranking rules as plain functions (number keys, arrows, drag)
  src/responseRankingType.tsx       the TaskType the core uses: id, title, instruction, isComplete, labelsAgree
  src/payload.ts                    payload reading and the ranking check
  src/instruction.ts                the job's instruction line
  src/index.ts                      exports, plus the sample job and its tasks
  tests/                            sample data checks, ranking rules, screen tests, the shell serving the sample job, and the two-pass end-to-end run
```

## The sample job

25 tasks, `rr-01` to `rr-25`, in the core's task file format (a JSON array in serving order). Each task:

```json
{
  "id": "rr-10",
  "type": "response-ranking",
  "payload": {
    "prompt": "Using standard command-line tools, how do I list the 10 largest files under /var/log, biggest first?",
    "responses": [
      { "id": "r1", "text": "du -ah /var/log | sort -rh | head -n 10 ..." },
      { "id": "r2", "text": "sudo find /var/log -type f -exec du -h {} + | sort -rh | head -n 10 ..." }
    ]
  }
}
```

- **Prompt.** Written to stand alone. Any fact a response may rely on (an order number, a policy, a price) is stated in the prompt, so ranking is a judgment about the response and never a guess about facts the labeler cannot see.
- **Responses.** 76 in all: 3 tasks with 2 responses, 18 with 3, 4 with 4. Each id (`r1`, `r2`, ...) is its position in the file. The label the core stores is the ordered list of these ids, best first.
- **Text.** Plain text. Line breaks, lists and indented code are kept, so the screen should show them as written. Seven responses run past 120 words, so the screen's in-card scrolling (FR-R3) has real work to do.
- **Job instruction line.** One line for the whole job, in `src/instruction.ts`: "Rank the responses from best to worst. Prefer the response that is most helpful, accurate and honest, follows every instruction in the prompt, and stays safe. Do not reward length for its own sake." It is not in the payloads because it does not change from task to task. The ranking screen will hand it to the core as the task type's instruction.

## What the prompts cover

Support replies (a late parcel, a missing reset email, a double charge), summaries (a news item, meeting notes into action items, a policy change), code help (a mutable default argument, an SQL query, a stack against a queue, a command-line one-liner), tone rewrites (an angry email, a newsletter notice, jargon into plain English), plus factual questions, arithmetic reasoning, two safety cases, explaining to a child, brainstorming, drafting, instruction following, translation, advice and a strict output format.

The responses differ in the ways that matter in preference data: a complete answer against a thin one, a confident wrong answer, a response that breaks a stated limit (word count, bullet count, "output only the JSON"), one that invents facts, one that is accurate but too long, one that refuses when it should help and one that helps when it should refuse.

**Close calls.** Four tasks are marked as close calls in the build script, each with a reason, and the build script prints them with the answer key: rr-04, rr-11, rr-23 and rr-24. A task is a close call when its second-ranked response is also an acceptable answer (it follows every instruction in the prompt and states nothing false) and differs from the best one only in style, firmness, register or thoroughness, so a careful second labeler could reasonably put it first. The marks are kept out of `data/sample-tasks.json`.

## Keeping the data honest

These checks run in `tests/sampleData.test.ts`:

- **No position tell.** The best response is not always listed first. Across the 25 tasks it appears in all four positions (first in 6 tasks, second in 10, third in 8, fourth in 1), and never in more than half of them.
- **No length tell.** The best response is the longest in only 9 of the 25 tasks and the shortest in 4. A labeler who always picks the longest answer will not do well, which is the point of the instruction line's last sentence.
- **No answer key in the file.** The intended order lives only in the build script, which prints it. The task file holds no field beyond `id`, `type`, `payload`, `prompt`, `responses` and `text`.
- **No outside names.** No brand, product, programming language or operating system names, and only `.example` email addresses (the core spec's NFR-3).
- **No drift.** The file on disk must equal the builder's output, so a hand edit to the JSON is caught.

## How it was written

All prompts and responses were written for this project in Kiro sessions: drafted by the AI assistant, then checked against the rules above and adjusted (for example, the first draft let the best response be the longest in 18 of 25 tasks, which the length check now prevents). No text was copied from another dataset or website. The data is released with the rest of the repository under the MIT licence (see the root `LICENSE`).

To regenerate (this overwrites `data/sample-tasks.json`, and the output is the same on every run):

```
node apps/response-ranking/tools/build-sample-data.mjs
```

The script also prints the author's intended order for each task, best to worst. To check the data, run `npm test` from the repo root.

## The ranking screen

The app adds one screen and one task type to the core; it changes nothing in `core/`.

- **Layout.** The prompt comes first, with its line breaks and indentation kept. Below it are the responses as cards, best at the top. Each card is numbered (Response 1 to 4, the position in the file) and shows its rank once ranked.
- **Three ways to rank (FR-R1).** Press the response numbers from best to worst (`2`, `3`, `1` ranks response 2 first, then 3, then 1); or click the up and down arrows on a card; or drag a card by its Drag handle onto the place it should take. The cards move as you go. Pressing a number after the ranking is complete starts a new ranking, and Start over clears it.
- **Nothing is ranked at the start.** The cards begin in file order but unranked, with no label, so submit stays off until the labeler makes an order. The screen reports a label only when every response is placed, and an empty one (which the core treats as unfinished) at every earlier step, so an old ranking can never be submitted after the labeler starts again.
- **The label (FR-R2).** The ordered list of response ids, best first, such as `["r2", "r3", "r1"]`. Ties are not offered.
- **Long responses (FR-R3).** Each card holds the full text in a box that scrolls once it passes about 240 pixels. Nothing is cut off, line breaks and indentation are kept, and a short note appears under any response that does not fit. The box can be focused, so the keyboard can scroll it.
- **Agreement rule.** Two labels agree when the top-ranked response is the same, whatever the rest of the ranking says. This is a deliberate simplification, and the screen says so under the cards: "Agreement between labelers is scored on the top-ranked response only."
- **Instruction line.** The job's line from `src/instruction.ts` is the task type's instruction, which the core shell shows above the task.
- **Enter and S** belong to the core shell (submit and skip) and are not handled by the screen. A focused arrow button is activated with Space, because Enter submits.
- **Using it.** The core takes a task type as a plain object, so there is no registry to call. Pass `sampleJobEntry()` from `src/index.ts` to the core: `<LabelShell job tasks taskType ... />` for labeling, or as an entry in `<JobDashboard jobs={[...]} />`. The sample job id is `response-ranking-sample`.

## The end-to-end run

`tests/endToEnd.test.tsx` labels all 25 prompts through the real shell as Pass 1 (Ada) and Pass 2 (Grace), then checks the dashboard and the four export files against the rankings given. Its header comment holds the rules for both labelers and the figures worked out by hand. To print the dashboard reading and the export files for checking by eye:

```
E2E_REPORT=1 npx vitest --run apps/response-ranking/tests/endToEnd.test.tsx
```

The two labelers are scripted, not people. Ada gives the author's intended ranking. Grace gives the same ranking, except that she puts the runner-up first on the four close calls and orders the two weakest answers the other way on the four tasks with four responses. So the four top-choice disagreements come from the rules in the test, not from how real labelers would behave. The run shows the screen, scoring, dashboard and exports working on a realistic mix, including tasks where the full rankings differ but the top choice is the same, which count as agreement.

Result of the run: 21 of 25 tasks agree on the top-ranked response (84%), kappa 0.77 (substantial agreement), 4 disagreements. A rule that compared whole rankings would have reported 17 of 25.
