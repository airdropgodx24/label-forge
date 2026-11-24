import { describe, expect, it } from "vitest";
import { dropCard, initialState, isComplete, moveCard, pressNumber, valueOf, type RankState } from "../src/ranking";

const ids3 = ["r1", "r2", "r3"];
const ids4 = ["r1", "r2", "r3", "r4"];

/** Presses the number keys in turn, as a labeler would. A press that changes nothing is skipped. */
function press(ids: string[], keys: number[], from: RankState = initialState(ids)): RankState {
  return keys.reduce((state, n) => pressNumber(state, ids, n) ?? state, from);
}

describe("the starting point", () => {
  it("has the cards in file order and nothing ranked, so file order is never an answer", () => {
    const s = initialState(ids3);
    expect(s).toEqual({ order: ["r1", "r2", "r3"], placed: 0 });
    expect(isComplete(s)).toBe(false);
    expect(valueOf(s)).toEqual([]);
  });

  it("does not share its list with the ids it was given", () => {
    const ids = ["r1", "r2"];
    const s = initialState(ids);
    s.order.reverse();
    expect(ids).toEqual(["r1", "r2"]);
  });
});

describe("number keys pressed in ranking order (FR-R1)", () => {
  it("place each named response at the next rank, moving the cards as they go", () => {
    let s = initialState(ids4);
    s = pressNumber(s, ids4, 3)!;
    expect(s).toEqual({ order: ["r3", "r1", "r2", "r4"], placed: 1 });
    s = pressNumber(s, ids4, 1)!;
    expect(s).toEqual({ order: ["r3", "r1", "r2", "r4"], placed: 2 });
    s = pressNumber(s, ids4, 4)!;
    expect(s).toEqual({ order: ["r3", "r1", "r4", "r2"], placed: 3 });
    s = pressNumber(s, ids4, 2)!;
    expect(s).toEqual({ order: ["r3", "r1", "r4", "r2"], placed: 4 });
    expect(isComplete(s)).toBe(true);
    expect(valueOf(s)).toEqual(["r3", "r1", "r4", "r2"]);
  });

  it("reports no ranking until every response is placed", () => {
    const partial = press(ids4, [2, 4, 1]);
    expect(partial.placed).toBe(3);
    expect(valueOf(partial)).toEqual([]); // not ["r2", "r4", "r1"], which would pass as a finished ranking
  });

  it("works with two responses", () => {
    expect(valueOf(press(["r1", "r2"], [2, 1]))).toEqual(["r2", "r1"]);
    expect(valueOf(press(["r1", "r2"], [1, 2]))).toEqual(["r1", "r2"]);
  });

  it("ignores a number with no response, and a response that is already placed", () => {
    const s = press(ids3, [2]);
    for (const n of [0, 4, 9, -1]) expect(pressNumber(s, ids3, n), String(n)).toBeNull();
    expect(pressNumber(s, ids3, 2)).toBeNull();
  });

  it("starts a new ranking when a number is pressed after the ranking is complete", () => {
    const done = press(ids3, [1, 2, 3]);
    expect(isComplete(done)).toBe(true);
    const again = pressNumber(done, ids3, 2)!;
    expect(again).toEqual({ order: ["r2", "r1", "r3"], placed: 1 });
    expect(valueOf(again)).toEqual([]);
  });

  it("starts from file order again, even if the completed ranking was arranged with arrows", () => {
    const arranged = moveCard(initialState(ids3), "r1", 1)!; // r2 r1 r3, complete
    expect(pressNumber(arranged, ids3, 3)).toEqual({ order: ["r3", "r1", "r2"], placed: 1 });
  });

  it("never changes the state it was given", () => {
    const s = press(ids3, [2]);
    const copy = structuredClone(s);
    pressNumber(s, ids3, 3);
    expect(s).toEqual(copy);
  });
});

describe("arrow buttons (FR-R1)", () => {
  it("move a card one place and make the order on screen the ranking", () => {
    const s = moveCard(initialState(ids3), "r1", 1)!;
    expect(s).toEqual({ order: ["r2", "r1", "r3"], placed: 3 });
    expect(valueOf(s)).toEqual(["r2", "r1", "r3"]);
    expect(valueOf(moveCard(s, "r3", -1)!)).toEqual(["r2", "r3", "r1"]);
  });

  it("do nothing at the ends of the list, or for an unknown card", () => {
    const s = initialState(ids3);
    expect(moveCard(s, "r1", -1)).toBeNull();
    expect(moveCard(s, "r3", 1)).toBeNull();
    expect(moveCard(s, "zzz", 1)).toBeNull();
  });

  it("finish a ranking that was started with number keys", () => {
    const partial = press(ids3, [3]); // r3 r1 r2, one placed
    const moved = moveCard(partial, "r2", -1)!;
    expect(moved).toEqual({ order: ["r3", "r2", "r1"], placed: 3 });
  });

  it("never change the state they were given", () => {
    const s = initialState(ids3);
    moveCard(s, "r1", 1);
    expect(s).toEqual({ order: ids3, placed: 0 });
  });
});

describe("dragging (FR-R1)", () => {
  it("drops a card onto another card's place and shifts the rest", () => {
    const s = initialState(ids3);
    expect(valueOf(dropCard(s, "r1", "r3")!)).toEqual(["r2", "r3", "r1"]);
    expect(valueOf(dropCard(s, "r3", "r1")!)).toEqual(["r3", "r1", "r2"]);
    expect(valueOf(dropCard(s, "r2", "r3")!)).toEqual(["r1", "r3", "r2"]);
  });

  it("moves nothing when a card is dropped on itself or an unknown card is named", () => {
    const s = initialState(ids3);
    expect(dropCard(s, "r2", "r2")).toBeNull();
    expect(dropCard(s, "r2", "zzz")).toBeNull();
    expect(dropCard(s, "zzz", "r2")).toBeNull();
  });

  it("works on four cards", () => {
    expect(valueOf(dropCard(initialState(ids4), "r4", "r2")!)).toEqual(["r1", "r4", "r2", "r3"]);
  });
});
