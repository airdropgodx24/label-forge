import type { Label, TaskType } from "../src/types";

export interface DummyPayload {
  question: string;
}
export type DummyValue = "A" | "B";

/**
 * The dummy task type from the core exit check: a trivial test screen with an
 * A button and a B button. It lives in the tests because the core must not
 * contain app code. If this runs the whole loop, the skeleton is real.
 */
export const dummyType: TaskType<DummyPayload, DummyValue> = {
  id: "dummy",
  title: "Dummy labeling",
  instruction: "Pick A or B.",
  renderTask(task, onChange) {
    return (
      <div className="dummy-screen">
        <p className="task-id">{task.id}</p>
        <p className="question">{task.payload.question}</p>
        <button type="button" className="pick-a" onClick={() => onChange("A")}>
          A
        </button>
        <button type="button" className="pick-b" onClick={() => onChange("B")}>
          B
        </button>
      </div>
    );
  },
  isComplete: (label: Label<DummyValue>) => label.value === "A" || label.value === "B",
  labelsAgree: (a, b) => a.value === b.value,
};
