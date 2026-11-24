# Response Ranking: sample data

App 2 of LabelForge. The labeler sees one prompt and 2 to 4 responses and ranks them from best to worst. This folder holds the sample job. The ranking screen comes in a later task.

```
apps/response-ranking/
  data/sample-tasks.json            the sample job: 25 prompt tasks
  tools/build-sample-data.mjs       the script that holds every prompt and response and writes the task file
  tools/build-sample-data.d.mts     types for the script, so the tests can import it
  src/instruction.ts                the job's instruction line
  tests/sampleData.test.ts          checks the job loads through the core loader and the data is sound
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

The responses differ in the ways that matter in preference data: a complete answer against a thin one, a confident wrong answer, a response that breaks a stated limit (word count, bullet count, "output only the JSON"), one that invents facts, one that is accurate but too long, one that refuses when it should help and one that helps when it should refuse. Some pairs are close calls.

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
