/**
 * The ranking rules of the Response Ranking screen, as plain functions.
 *
 * A ranking in progress is the cards in their current order (`order`) plus how
 * many of the leading cards the labeler has actually ranked (`placed`).
 * Nothing is ranked at the start, so the cards' file order is never mistaken
 * for an answer. The ranking is complete when `placed` equals the number of
 * cards; only then does the screen report a label.
 */

export interface RankState {
  /** Every response id, in the order the cards are shown. */
  order: string[];
  /** How many cards from the top are ranked. Equal to order.length when the ranking is complete. */
  placed: number;
}

export function initialState(ids: readonly string[]): RankState {
  return { order: [...ids], placed: 0 };
}

export function isComplete(state: RankState): boolean {
  return state.placed === state.order.length;
}

/** The label to report: the full order, best first, or an empty list while the ranking is unfinished. */
export function valueOf(state: RankState): string[] {
  return isComplete(state) ? [...state.order] : [];
}

/**
 * Number key `n` names the response in file position n. Pressed in ranking
 * order, the keys place responses at rank 1, 2, 3, ...
 *
 * - A number with no response, or a response already placed, changes nothing (null).
 * - Pressing a number after the ranking is complete starts a new ranking, with
 *   that response as the best.
 */
export function pressNumber(state: RankState, ids: readonly string[], n: number): RankState | null {
  const id = ids[n - 1];
  if (id === undefined) return null;

  const base = isComplete(state) ? initialState(ids) : state;
  if (base.order.indexOf(id) < base.placed) return null;

  const order = base.order.filter((x) => x !== id);
  order.splice(base.placed, 0, id);
  return { order, placed: base.placed + 1 };
}

/**
 * Moves a card one place up (-1) or down (+1), as the arrow buttons do. The
 * order on screen becomes the labeler's ranking, so every card counts as ranked.
 * Returns null at the ends of the list.
 */
export function moveCard(state: RankState, id: string, delta: -1 | 1): RankState | null {
  const from = state.order.indexOf(id);
  const to = from + delta;
  if (from === -1 || to < 0 || to >= state.order.length) return null;
  const order = [...state.order];
  [order[from], order[to]] = [order[to]!, order[from]!];
  return { order, placed: order.length };
}

/** Drops card `fromId` onto the place of card `toId`, as dragging does. Returns null if nothing moves. */
export function dropCard(state: RankState, fromId: string, toId: string): RankState | null {
  const from = state.order.indexOf(fromId);
  const to = state.order.indexOf(toId);
  if (from === -1 || to === -1 || from === to) return null;
  const order = [...state.order];
  order.splice(from, 1);
  order.splice(to, 0, fromId);
  return { order, placed: order.length };
}
