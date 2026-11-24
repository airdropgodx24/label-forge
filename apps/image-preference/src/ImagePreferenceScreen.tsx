import { useEffect, useState, type CSSProperties } from "react";
import type { Task } from "../../../core/src/types";
import { DEFAULT_INSTRUCTION, readPayload, resolveImageSrc, type ImagePreferenceValue } from "./payload";

/** Both image boxes use these, so A and B always have the same size (FR-I1). */
const IMAGE_BOX: CSSProperties = {
  width: "100%",
  aspectRatio: "8 / 5",
  display: "block",
  boxSizing: "border-box",
  border: "2px solid #c9ced6",
  borderRadius: 6,
  background: "#f3f4f6",
  objectFit: "contain",
};

const CHOICES: ReadonlyArray<{ value: ImagePreferenceValue; label: string; key: string }> = [
  { value: "A", label: "A", key: "1" },
  { value: "B", label: "B", key: "2" },
  { value: "tie", label: "Tie", key: "3" },
];

/** True when the key press came from a field where the labeler is typing. */
function isTyping(target: EventTarget | null): boolean {
  const el = target as Partial<HTMLElement> | null;
  if (!el || typeof el.tagName !== "string") return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName.toUpperCase();
  return tag === "TEXTAREA" || tag === "SELECT" || (tag === "INPUT" && !["button", "checkbox", "radio"].includes((el as HTMLInputElement).type));
}

/**
 * One image, or a plain-text placeholder if it cannot be loaded (FR-I3).
 * A failed image never breaks the session: the labeler can still pick, or skip.
 */
function ImageBox({ which, src }: { which: "A" | "B"; src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        className="ip-placeholder"
        role="img"
        aria-label={`Image ${which} could not be loaded`}
        style={{ ...IMAGE_BOX, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 12, color: "#4b5563", borderStyle: "dashed" }}
      >
        Image {which} could not be loaded.
      </div>
    );
  }
  return <img className="ip-image" src={src} alt={`Image ${which}`} style={IMAGE_BOX} onError={() => setFailed(true)} />;
}

/**
 * The Image Preference task screen (FR-I1 to FR-I3): the job's instruction
 * line above two images side by side, labeled A and B, and the choices A, B
 * and Tie. Keys 1, 2 and 3 pick A, B and Tie. The pick is the label.
 *
 * Enter (submit) and S (skip) belong to the core shell and are not handled here.
 */
export function ImagePreferenceScreen({
  task,
  onChange,
  imageBase = "",
}: {
  task: Task;
  onChange: (value: ImagePreferenceValue) => void;
  /** Where relative image paths start, for an app served from a sub-path. */
  imageBase?: string;
}) {
  const [picked, setPicked] = useState<ImagePreferenceValue | null>(null);
  const payload = readPayload(task.payload);
  const labelable = payload !== null;

  const pick = (value: ImagePreferenceValue) => {
    setPicked(value);
    onChange(value);
  };

  useEffect(() => {
    if (!labelable) return; // a task with no images cannot be labeled, by key or by click
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target)) return;
      const choice = CHOICES.find((c) => c.key === e.key);
      if (!choice) return;
      e.preventDefault();
      setPicked(choice.value);
      onChange(choice.value);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onChange, labelable]);

  if (!payload) {
    return (
      <p className="ip-problem" role="alert">
        This task is missing its images, so it cannot be labeled. Skip it.
      </p>
    );
  }

  return (
    <div className="ip-screen" style={{ display: "grid", gap: 16 }}>
      <p className="ip-instruction" style={{ margin: 0, fontWeight: 600 }}>
        {payload.instruction || DEFAULT_INSTRUCTION}
      </p>

      <div className="ip-images" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {(["A", "B"] as const).map((which) => {
          const ref = which === "A" ? payload.imageA : payload.imageB;
          const src = resolveImageSrc(ref, imageBase);
          return (
            <figure key={`${which}:${src}`} className={`ip-option ip-option-${which}`} style={{ margin: 0, display: "grid", gap: 6 }}>
              <figcaption className="ip-label" style={{ fontWeight: 700, textAlign: "center" }}>
                {which}
              </figcaption>
              <ImageBox which={which} src={src} />
            </figure>
          );
        })}
      </div>

      <div className="ip-choices" role="radiogroup" aria-label="Your pick" style={{ display: "flex", gap: 12, justifyContent: "center" }}>
        {CHOICES.map((c) => (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={picked === c.value}
            className={`ip-choice ip-choice-${c.value}${picked === c.value ? " ip-choice-picked" : ""}`}
            style={{
              minWidth: 96,
              padding: "8px 16px",
              fontWeight: 600,
              border: "2px solid #374151",
              borderRadius: 6,
              cursor: "pointer",
              background: picked === c.value ? "#374151" : "#fff",
              color: picked === c.value ? "#fff" : "#111827",
            }}
            onClick={() => pick(c.value)}
          >
            {c.label} <kbd>{c.key}</kbd>
          </button>
        ))}
      </div>
    </div>
  );
}
