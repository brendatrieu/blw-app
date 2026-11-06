import { useState } from "react";
import { HOUR_ITEMS, MERIDIEM_ITEMS, PickerSheetFooter, WheelColumn, WheelFrame, type WheelItem } from "../../components/ui/DateTimeField.js";
import { Sheet } from "../../components/ui/Sheet.js";
import { clockParts, clockTime, localClock, type ClockParts } from "./plan.js";

const MINUTE_ITEMS: WheelItem[] = Array.from({ length: 12 }, (_, i) => ({ key: String(i * 5), label: String(i * 5).padStart(2, "0") }));

/**
 * A meal's time on the app's own wheel (ledger 926; Daily meals only for
 * now): Hour, Minute in 5-minute steps, AM or PM. Mounted open; opens on the
 * meal's time (an odd one on its nearest step) or, with none, on the clock
 * now. Laid out like Log meal's time picker (ledger 941): title "Time" with
 * the X, one full-width Done that hands back the wheel's time, and a small
 * "Clear time" in the header (only when there is one) that removes it. The
 * X, Escape and an outside tap change nothing.
 */
export function TimeSheet({
  time,
  onSave,
  onClear,
  onClose,
}: {
  time: string | null;
  onSave: (time: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<ClockParts>(() => clockParts(time ?? localClock()));
  const meridiemIndex = draft.meridiem === "AM" ? 0 : 1;
  return (
    <Sheet
      open
      onClose={onClose}
      title="Time"
      showClose
      headerAction={
        time ? (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex min-h-11 items-center px-2 text-sm font-medium text-[var(--color-accent)]"
          >
            Clear time
          </button>
        ) : undefined
      }
    >
      <WheelFrame>
        <WheelColumn
          ariaLabel="Hour"
          items={HOUR_ITEMS}
          index={draft.hour12 - 1}
          onIndexChange={(i) => setDraft((current) => ({ ...current, hour12: i + 1 }))}
          valueNow={draft.hour12}
          valueMin={1}
          valueMax={12}
          className="flex-1"
          loop
        />
        <WheelColumn
          ariaLabel="Minute"
          items={MINUTE_ITEMS}
          index={draft.minute / 5}
          onIndexChange={(i) => setDraft((current) => ({ ...current, minute: i * 5 }))}
          valueNow={draft.minute}
          valueMin={0}
          valueMax={55}
          className="flex-1"
          loop
        />
        <WheelColumn
          ariaLabel="AM or PM"
          items={MERIDIEM_ITEMS}
          index={meridiemIndex}
          onIndexChange={(i) => setDraft((current) => ({ ...current, meridiem: i === 0 ? "AM" : "PM" }))}
          valueNow={meridiemIndex}
          valueMin={0}
          valueMax={1}
          valueText={draft.meridiem}
          className="flex-1"
        />
      </WheelFrame>
      <PickerSheetFooter onSave={() => onSave(clockTime(draft))} />
    </Sheet>
  );
}
