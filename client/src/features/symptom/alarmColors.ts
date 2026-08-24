/**
 * Fixed, theme-independent colours for the two alarm levels.
 *
 * Everything else in the app reads `--color-danger` / `--color-accent`, which
 * are deliberately light in dark mode so red text stays legible on a dark
 * background. That inverts here: the alarm card *is* the red surface and
 * carries white text, and white on the dark theme's pale coral fails contrast
 * badly — on the one screen that has to be readable at 2am, half asleep, with
 * the phone at arm's length.
 *
 * So these two are hardcoded. The emergency card should look identical in
 * either theme; it is not decoration.
 */
export const ALARM_COLORS = {
  emergency: { background: "#8f1d16", text: "#ffffff" },
  urgent_care: { background: "#8a4a12", text: "#ffffff" },
} as const;

export type AlarmLevel = keyof typeof ALARM_COLORS;

/** Ready-made inline style for a surface painted in an alarm level. */
export function alarmStyle(level: AlarmLevel): { backgroundColor: string; color: string } {
  return { backgroundColor: ALARM_COLORS[level].background, color: ALARM_COLORS[level].text };
}
