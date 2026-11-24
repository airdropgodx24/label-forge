import type { Label, TaskType } from "../../../core/src/types";
import { ImagePreferenceScreen } from "./ImagePreferenceScreen";
import { isPick, type ImagePreferencePayload, type ImagePreferenceValue } from "./payload";

export interface ImagePreferenceOptions {
  /** Where relative image paths start, for an app served from a sub-path. Defaults to the page's own folder. */
  imageBase?: string;
}

/**
 * The Image Preference task type. An app plugs into the core with exactly
 * this: an id, a title, an instruction, a screen, and two small rules.
 *
 * - isComplete: a pick exists (A, B or Tie).
 * - labelsAgree: the two picks are equal.
 */
export function createImagePreferenceType(
  options: ImagePreferenceOptions = {},
): TaskType<ImagePreferencePayload, ImagePreferenceValue> {
  return {
    id: "image-preference",
    title: "Image Preference",
    instruction: "Choose the image that better matches the description, or Tie if both match equally well.",
    renderTask: (task, onChange) => <ImagePreferenceScreen task={task} onChange={onChange} imageBase={options.imageBase} />,
    isComplete: (label: Label<ImagePreferenceValue>) => isPick(label.value),
    labelsAgree: (a, b) => a.value === b.value,
  };
}

export const imagePreferenceType = createImagePreferenceType();
