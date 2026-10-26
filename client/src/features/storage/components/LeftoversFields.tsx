import type { StorageLocation } from "@blw/shared";
import { LOCATIONS, type ContainerChoice } from "../format.js";
import type { LeftoverSourceKind } from "../leftovers.js";
import { ContainerChoiceField } from "./ContainerChoiceField.js";
import { Field } from "../../../components/ui/Field.js";
import { Input } from "../../../components/ui/Input.js";
import { SegmentedControl } from "../../../components/ui/SegmentedControl.js";
import { DateField } from "../../../components/ui/DateField.js";

const LEFTOVER_LOCATION_OPTIONS = LOCATIONS.map((loc) => ({ value: loc.value, label: loc.label, icon: null }));

export interface LeftoversFieldsProps {
  source: LeftoverSourceKind;
  /** "One container" or "Separate containers" — only ever asked, and only
   * ever read, when the source is two or more foods or recipes. */
  containerChoice: ContainerChoice;
  onContainerChoiceChange: (choice: ContainerChoice) => void;
  location: StorageLocation;
  onLocationChange: (location: StorageLocation) => void;
  servingsTotal: string;
  onServingsTotalChange: (value: string) => void;
  bestBy: string;
  onBestByChange: (value: string) => void;
  /** The "Best by can't be before the prepared date" message, once a failed
   * submit has earned it — see `validatePlate`. */
  bestByError?: string;
}

/**
 * The expanded controls behind Log meal's "Save leftovers to storage": the
 * "Save as" choice (only with two or more foods or recipes — see
 * `offersContainerChoice`), the location segments, and the same optional
 * servings/best-by fields `AddStorageItemForm` uses. Its own component so it
 * can be render-tested directly (item 154) without expanding the switch.
 */
export function LeftoversFields({
  source,
  containerChoice,
  onContainerChoiceChange,
  location,
  onLocationChange,
  servingsTotal,
  onServingsTotalChange,
  bestBy,
  onBestByChange,
  bestByError,
}: LeftoversFieldsProps) {
  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
      <ContainerChoiceField
        ids={source.kind === "foods" ? source.foodIds : source.recipeIds}
        value={containerChoice}
        onChange={onContainerChoiceChange}
      />

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-[var(--color-text)]">Location</span>
        <SegmentedControl
          aria-label="Location"
          value={location}
          onChange={onLocationChange}
          options={LEFTOVER_LOCATION_OPTIONS}
        />
      </div>

      <Field label="Total servings (optional)" htmlFor="log-food-leftover-servings">
        <Input
          id="log-food-leftover-servings"
          type="number"
          inputMode="numeric"
          min={1}
          max={999}
          value={servingsTotal}
          onChange={(e) => onServingsTotalChange(e.target.value)}
          placeholder="e.g. 6"
        />
      </Field>

      <Field label="Best by (optional)" htmlFor="log-food-leftover-best-by" error={bestByError}>
        <DateField id="log-food-leftover-best-by" value={bestBy} onChange={onBestByChange} allowFuture title="Best by" />
      </Field>
    </div>
  );
}
