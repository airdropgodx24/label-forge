/**
 * The instruction line for the Response Ranking job, as a real RLHF preference
 * job would give it to labelers. It is the same for every task in the job, so
 * it lives here and not in each task's payload. The ranking screen (next app
 * task) uses it as the task type's instruction, which the core shell shows
 * above the task.
 */
export const INSTRUCTION =
  "Rank the responses from best to worst. Prefer the response that is most helpful, accurate and honest, follows every instruction in the prompt, and stays safe. Do not reward length for its own sake.";
