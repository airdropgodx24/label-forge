export interface RankingResponse {
  id: string;
  text: string;
}

/** What one Response Ranking task holds in its payload (see data/sample-tasks.json). */
export interface ResponseRankingPayload {
  prompt: string;
  /** 2 to 4 responses. */
  responses: RankingResponse[];
}

/** The label: response ids from best to worst (FR-R2). Ties are not offered. */
export type ResponseRankingValue = string[];

export const MIN_RESPONSES = 2;
export const MAX_RESPONSES = 4;

/**
 * Reads a task payload, which the core passes through unchecked. Returns null
 * unless there is a prompt and 2 to 4 responses with distinct ids, so the
 * screen can say so instead of breaking the session.
 */
export function readPayload(payload: unknown): ResponseRankingPayload | null {
  if (typeof payload !== "object" || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.prompt !== "string" || p.prompt.trim() === "") return null;
  if (!Array.isArray(p.responses)) return null;
  if (p.responses.length < MIN_RESPONSES || p.responses.length > MAX_RESPONSES) return null;

  const responses: RankingResponse[] = [];
  const seen = new Set<string>();
  for (const raw of p.responses as unknown[]) {
    if (typeof raw !== "object" || raw === null) return null;
    const r = raw as Record<string, unknown>;
    if (typeof r.id !== "string" || r.id === "" || seen.has(r.id)) return null;
    if (typeof r.text !== "string") return null;
    seen.add(r.id);
    responses.push({ id: r.id, text: r.text });
  }
  return { prompt: p.prompt, responses };
}

/**
 * True for a ranking the core may accept: 2 to 4 distinct, non-empty response
 * ids. The task is not available here, so this cannot check the ids against
 * the task's responses; the screen only ever reports a full ranking (or an
 * empty list while unfinished), and that is what keeps labels complete.
 */
export function isRanking(value: unknown): value is ResponseRankingValue {
  return (
    Array.isArray(value) &&
    value.length >= MIN_RESPONSES &&
    value.length <= MAX_RESPONSES &&
    value.every((id) => typeof id === "string" && id !== "") &&
    new Set(value).size === value.length
  );
}
