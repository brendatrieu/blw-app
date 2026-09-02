/**
 * Time-of-day helpers shared by the header greeting and its sun/moon icon.
 * Kept as pure, exported functions (rather than inline in a component) so
 * the hour boundaries are unit-testable without rendering anything.
 */

/** "Good morning" before noon, "Good afternoon" until 6pm, else "Good evening". */
export function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * Whether `hour` falls in the sun (daytime) half of the greeting icon, using
 * the SAME boundary as the evening cutoff above — anything from midnight up
 * to (but not including) 6pm is "day", the rest is "night" (moon).
 */
export function isDaytimeHour(hour: number): boolean {
  return hour < 18;
}

/** Convenience wrapper reading the hour off a `Date` (defaults to now). */
export function timeOfDayGreeting(now: Date = new Date()): string {
  return greetingForHour(now.getHours());
}
