/**
 * Time-of-day helpers for the header greeting.
 * Kept as pure, exported functions (rather than inline in a component) so
 * the hour boundaries are unit-testable without rendering anything.
 */

/** "Good morning" before noon, "Good afternoon" until 6pm, else "Good evening". */
export function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** Convenience wrapper reading the hour off a `Date` (defaults to now). */
export function timeOfDayGreeting(now: Date = new Date()): string {
  return greetingForHour(now.getHours());
}
