import {
  CONTAINER_CHOICE_LABEL,
  CONTAINER_CHOICE_OPTIONS,
  offersContainerChoice,
  type ContainerChoice,
} from "../format.js";
import { SegmentedControl } from "../../../components/ui/SegmentedControl.js";

export interface ContainerChoiceFieldProps {
  /** The foods the submission would save. The control shows itself only from
   * two up — see `offersContainerChoice`. */
  foodIds: readonly string[];
  value: ContainerChoice;
  onChange: (choice: ContainerChoice) => void;
}

/**
 * "Save as: One container / Separate containers" (item 348) — the one place
 * the choice is rendered, shared verbatim by `AddStorageItemForm` and the log
 * form's leftovers block so the two can never disagree about when it appears
 * or which segment starts selected.
 *
 * It owns its own visibility: one food is one container either way, so below
 * two foods this renders nothing at all rather than asking a question with a
 * single real answer. The same predicate gates the payload at both call
 * sites, so what is asked and what is sent cannot drift.
 *
 * A `radiogroup`, not a labelable control, so the heading is a plain span and
 * the group carries its own `aria-label`.
 */
export function ContainerChoiceField({ foodIds, value, onChange }: ContainerChoiceFieldProps) {
  if (!offersContainerChoice(foodIds)) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-[var(--color-text)]">{CONTAINER_CHOICE_LABEL}</span>
      <SegmentedControl
        aria-label={CONTAINER_CHOICE_LABEL}
        value={value}
        onChange={onChange}
        options={CONTAINER_CHOICE_OPTIONS}
      />
    </div>
  );
}
