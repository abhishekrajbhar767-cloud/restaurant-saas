// Durations across the manager surfaces are all "how long did this take",
// so they read as 45m / 1h 20m rather than 0:45:00.

export function formatMinutes(minutes: number): string {
  const safe = Math.max(Math.round(minutes), 0);
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
}

export function minutesSince(iso: string, nowMs: number): number {
  return Math.max(Math.floor((nowMs - new Date(iso).getTime()) / 60_000), 0);
}
