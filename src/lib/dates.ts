/** Small date-presentation helpers shared by the pending-tasks and task-form screens.
 *  Ported from v1's apps/web/src/lib/dates.ts. */

export function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

/** "closes in 4 days" / "closes today" / "closed" */
export function closeLabel(iso: string | null): string {
  const days = daysUntil(iso);
  if (days == null) return "";
  if (days < 0) return "closed";
  if (days === 0) return "closes today";
  if (days === 1) return "closes tomorrow";
  return `closes in ${days} days`;
}

/** "21 Sep 2026" */
export function shortDate(iso: string | null): string {
  if (!iso) return "";
  // Server-rendered task rows hydrate in a browser that may use a different OS locale.
  // Pin both locale and zone so "02 Oct" cannot become "Oct 02" during hydration.
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Warn inside the last 5 days, matching the urgency threshold used elsewhere. */
export function urgencyColor(iso: string | null): string {
  const days = daysUntil(iso);
  if (days == null) return "var(--dim)";
  return days <= 5 ? "var(--warn)" : "var(--dim)";
}
