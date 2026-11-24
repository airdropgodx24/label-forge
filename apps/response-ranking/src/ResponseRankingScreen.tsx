import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Task } from "../../../core/src/types";
import { readPayload, type RankingResponse, type ResponseRankingValue } from "./payload";
import { dropCard, initialState, isComplete, moveCard, pressNumber, valueOf, type RankState } from "./ranking";

/** Shown on every task: how the core scores agreement for this app (the top-ranked response only). */
export const AGREEMENT_NOTE = "Agreement between labelers is scored on the top-ranked response only.";

/** A response card shows this much text before it scrolls. The text is never cut. */
const CARD_TEXT_MAX_HEIGHT = 240;

const BUTTON: CSSProperties = {
  minWidth: 36,
  padding: "4px 10px",
  fontWeight: 600,
  border: "2px solid #374151",
  borderRadius: 6,
  background: "#fff",
  color: "#111827",
  cursor: "pointer",
};

/** True when the key press came from a field where the labeler is typing. */
function isTyping(target: EventTarget | null): boolean {
  const el = target as Partial<HTMLElement> | null;
  if (!el || typeof el.tagName !== "string") return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName.toUpperCase();
  return tag === "TEXTAREA" || tag === "SELECT" || (tag === "INPUT" && !["button", "checkbox", "radio"].includes((el as HTMLInputElement).type));
}

/**
 * A response's full text in a box of fixed maximum height. Long text scrolls
 * inside the box (FR-R3); it is never cut off. Line breaks and indentation are
 * kept. The box can be focused, so the keyboard can scroll it.
 */
function ResponseText({ text, number }: { text: string; number: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    check();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text]);

  return (
    <>
      <div
        ref={ref}
        className="rr-text"
        role="region"
        aria-label={`Response ${number} text`}
        tabIndex={0}
        style={{
          maxHeight: CARD_TEXT_MAX_HEIGHT,
          overflowY: "auto",
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
          lineHeight: 1.5,
          padding: 10,
          border: "1px solid #d1d5db",
          borderRadius: 6,
          background: "#fff",
        }}
      >
        {text === "" ? "(empty response)" : text}
      </div>
      {overflows ? (
        <p className="rr-scroll-hint" style={{ margin: "4px 0 0", fontSize: "0.85em", color: "#4b5563" }}>
          Scroll inside the box to read the rest of this response.
        </p>
      ) : null}
    </>
  );
}

function statusText(state: RankState): string {
  const total = state.order.length;
  if (state.placed === 0) {
    return "Not ranked yet. Press the numbers from best to worst, or use the arrows or drag the cards.";
  }
  if (isComplete(state)) {
    return "Ranking complete, best at the top. Press Enter to submit, or change the order.";
  }
  return `Ranked ${state.placed} of ${total}. Press the number of the next best response.`;
}

function Ranker({ responses, onChange }: { responses: RankingResponse[]; onChange: (value: ResponseRankingValue) => void }) {
  const ids = useMemo(() => responses.map((r) => r.id), [responses]);
  const byId = useMemo(() => new Map(responses.map((r, i) => [r.id, { ...r, number: i + 1 }])), [responses]);

  const [state, setState] = useState<RankState>(() => initialState(ids));
  const stateRef = useRef(state); // the key listener reads this, so it never sees an old state
  const [dragId, setDragId] = useState<string | null>(null);

  /** Every change goes through here: show it, and report the label (empty until the ranking is complete). */
  const commit = useCallback(
    (next: RankState) => {
      stateRef.current = next;
      setState(next);
      onChange(valueOf(next));
    },
    [onChange],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target)) return;
      if (!/^[1-9]$/.test(e.key)) return;
      const n = Number(e.key);
      if (n > ids.length) return;
      e.preventDefault();
      const next = pressNumber(stateRef.current, ids, n);
      if (next) commit(next);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [ids, commit]);

  const move = (id: string, delta: -1 | 1) => {
    const next = moveCard(stateRef.current, id, delta);
    if (next) commit(next);
  };

  const drop = (toId: string) => {
    if (dragId === null) return;
    const next = dropCard(stateRef.current, dragId, toId);
    setDragId(null);
    if (next) commit(next);
  };

  return (
    <>
      <p className="rr-status" role="status" style={{ margin: 0 }}>
        {statusText(state)}
      </p>

      <ol className="rr-list" aria-label="Responses, in your ranking order" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 12 }}>
        {state.order.map((id, index) => {
          const response = byId.get(id)!;
          const ranked = index < state.placed;
          return (
            <li
              key={id}
              className={`rr-card${ranked ? " rr-card-ranked" : ""}`}
              data-response={id}
              onDragOver={(e) => {
                if (dragId !== null) e.preventDefault(); // allow dropping here
              }}
              onDrop={(e) => {
                e.preventDefault();
                drop(id);
              }}
              style={{
                display: "grid",
                gap: 8,
                padding: 12,
                border: `2px solid ${ranked ? "#374151" : "#c9ced6"}`,
                borderRadius: 8,
                background: "#f9fafb",
                opacity: dragId === id ? 0.5 : 1,
              }}
            >
              <div className="rr-card-head" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                <span className="rr-number" style={{ fontWeight: 700 }}>
                  Response {response.number} <kbd>{response.number}</kbd>
                </span>
                <span className="rr-rank" style={{ fontWeight: 600, color: ranked ? "#111827" : "#6b7280" }}>
                  {ranked ? `Rank ${index + 1}` : "Not ranked"}
                </span>
                <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                  <button type="button" className="rr-up" style={BUTTON} aria-label={`Move response ${response.number} up`} disabled={index === 0} onClick={() => move(id, -1)}>
                    ↑
                  </button>
                  <button type="button" className="rr-down" style={BUTTON} aria-label={`Move response ${response.number} down`} disabled={index === state.order.length - 1} onClick={() => move(id, 1)}>
                    ↓
                  </button>
                  <span
                    className="rr-handle"
                    draggable
                    aria-hidden="true"
                    title="Drag to reorder"
                    style={{ ...BUTTON, cursor: "grab", userSelect: "none" }}
                    onDragStart={(e) => {
                      setDragId(id);
                      if (e.dataTransfer) {
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", id); // Firefox only starts a drag with data set
                        const card = (e.currentTarget as HTMLElement).closest("li");
                        if (card && e.dataTransfer.setDragImage) e.dataTransfer.setDragImage(card, 16, 16);
                      }
                    }}
                    onDragEnd={() => setDragId(null)}
                  >
                    Drag
                  </span>
                </span>
              </div>
              <ResponseText text={response.text} number={response.number} />
            </li>
          );
        })}
      </ol>

      {state.placed > 0 ? (
        <div className="rr-actions">
          <button type="button" className="rr-reset" style={BUTTON} onClick={() => commit(initialState(ids))}>
            Start over
          </button>
        </div>
      ) : null}
    </>
  );
}

/**
 * The Response Ranking task screen (FR-R1 to FR-R3): the prompt, then the
 * responses as cards that the labeler puts in order, best at the top. Reorder
 * with the arrow buttons, by dragging, or by pressing the response numbers
 * (1 to 4) in ranking order. The label is the ordered list of response ids.
 *
 * Enter (submit) and S (skip) belong to the core shell and are not handled here.
 */
export function ResponseRankingScreen({ task, onChange }: { task: Task; onChange: (value: ResponseRankingValue) => void }) {
  const payload = useMemo(() => readPayload(task.payload), [task.payload]);

  if (!payload) {
    return (
      <p className="rr-problem" role="alert">
        This task needs a prompt and 2 to 4 responses, so it cannot be ranked. Skip it.
      </p>
    );
  }

  return (
    <div className="rr-screen" style={{ display: "grid", gap: 16 }}>
      <section className="rr-prompt" aria-label="Prompt">
        <p className="rr-label" style={{ margin: "0 0 4px", fontWeight: 700 }}>
          Prompt
        </p>
        <div className="rr-prompt-text" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", lineHeight: 1.5, padding: 12, border: "2px solid #374151", borderRadius: 8, background: "#fff" }}>
          {payload.prompt}
        </div>
      </section>

      <Ranker key={task.id} responses={payload.responses} onChange={onChange} />

      <p className="rr-note" style={{ margin: 0, fontSize: "0.9em", color: "#4b5563" }}>
        {AGREEMENT_NOTE}
      </p>
    </div>
  );
}
