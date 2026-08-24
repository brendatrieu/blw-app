import { useState } from "react";
import { symptomLabel, type SymptomCheckHistoryItem, type TriageLevel } from "@blw/shared";
import { alarmStyle } from "../alarmColors.js";
import { SymptomResultView } from "./SymptomResultView.js";

const LEVEL_LABELS: Record<TriageLevel, string> = {
  monitor_at_home: "Watch at home",
  contact_doctor_24h: "Call the doctor",
  urgent_care: "Seen today",
  emergency: "Emergency",
};

function levelStyle(level: TriageLevel): { backgroundColor: string; color: string } {
  if (level === "emergency" || level === "urgent_care") return alarmStyle(level);
  return { backgroundColor: "var(--color-bg)", color: "var(--color-text)" };
}

function whenLabel(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function HistoryRow({ item }: { item: SymptomCheckHistoryItem }) {
  const [open, setOpen] = useState(false);

  return (
    <li className="flex flex-col gap-2 rounded-lg bg-[var(--color-bg-elevated)] p-3">
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex flex-col gap-1 text-left">
        <span className="flex items-center gap-2">
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
            style={levelStyle(item.triageLevel)}
          >
            {LEVEL_LABELS[item.triageLevel]}
          </span>
          <span className="text-xs text-[var(--color-text-muted)]">{whenLabel(item.createdAt)}</span>
        </span>
        <span className="text-sm text-[var(--color-text)]">
          {item.symptoms.map((symptom) => symptomLabel(symptom)).join(", ")}
        </span>
      </button>

      {open && (
        <div className="border-t border-[var(--color-border)] pt-3">
          {/* Reopening the alarm overlay from history would ambush a parent
              reading an old entry, so the recap button is inert here. */}
          <SymptomResultView result={item.result} onReopenAlarm={() => setOpen(true)} />
        </div>
      )}
    </li>
  );
}

export function SymptomHistoryList({ items }: { items: SymptomCheckHistoryItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-[var(--color-text-muted)]">No previous checks for this baby yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <HistoryRow key={item.id} item={item} />
      ))}
    </ul>
  );
}
