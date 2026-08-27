import { useMemo, useState } from "react";
import { useFoods } from "../../catalog/hooks.js";
import { getFoodEmoji } from "../../catalog/foodEmoji.js";
import { useCreateServeLog } from "../hooks.js";
import { Field } from "../../../components/ui/Field.js";
import { Textarea } from "../../../components/ui/Input.js";
import { DateTimeField, nowAtMinute } from "../../../components/ui/DateTimeField.js";
import { MultiCombobox, type MultiComboboxOption } from "../../../components/ui/MultiCombobox.js";
import { Button } from "../../../components/ui/Button.js";

export interface LogFoodFormProps {
  babyId: string;
  onDone: () => void;
}

/**
 * The quick-log form itself, byte-compatible with the one that used to live
 * inline on LogPage (and later in the bottom-sheet-presented LogFoodSheet):
 * same fields, same disabled-at-zero-foods gating, same success behavior
 * (the create mutation's own onSuccess drives the first-log/allergen
 * celebration — see features/tracking/hooks.ts). Now rendered full-screen by
 * LogFoodPage, which passes the page's own back-navigation as `onDone` for
 * both success and Cancel.
 */
export function LogFoodForm({ babyId, onDone }: LogFoodFormProps) {
  const { data: foodsData, isLoading: foodsLoading } = useFoods();
  const createServeLog = useCreateServeLog(babyId);
  const [foodIds, setFoodIds] = useState<string[]>([]);
  const [servedAt, setServedAt] = useState(() => nowAtMinute());
  const [reactionNote, setReactionNote] = useState("");

  const foods = foodsData?.foods ?? [];
  const foodOptions: MultiComboboxOption[] = useMemo(
    () => foods.map((food) => ({ value: food.id, label: food.name, emoji: getFoodEmoji(food.slug, food.category) })),
    [foods],
  );

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (foodIds.length === 0) return;
    createServeLog.mutate(
      {
        foodIds,
        servedAt: servedAt.toISOString(),
        reactionNote: reactionNote.trim() || undefined,
      },
      { onSuccess: onDone },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <Field label="Food" htmlFor="log-food-food">
        <MultiCombobox
          id="log-food-food"
          options={foodOptions}
          value={foodIds}
          onChange={setFoodIds}
          disabled={foodsLoading}
          placeholder={foodsLoading ? "Loading foods…" : "Search foods…"}
        />
      </Field>

      <Field label="When" htmlFor="log-food-when">
        <DateTimeField id="log-food-when" value={servedAt} onChange={setServedAt} />
      </Field>

      <Field label="Reaction note (optional)" htmlFor="log-food-note">
        <Textarea
          id="log-food-note"
          value={reactionNote}
          onChange={(e) => setReactionNote(e.target.value)}
          rows={2}
          placeholder="e.g. mild rash around mouth"
        />
      </Field>

      {createServeLog.isError && (
        <p role="alert" className="text-xs text-[var(--color-danger)]">
          Couldn't save that — try again.
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={foodIds.length === 0 || createServeLog.isPending} className="flex-1">
          {createServeLog.isPending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
