export function filterEventsByDateRange<T extends { starts_at?: string; month?: string }>(
  events: T[],
  start?: string,
  end?: string
): T[] {
  if (!start && !end) return events;
  return events.filter((e) => {
    const date = e.starts_at ? e.starts_at.slice(0, 10) : e.month?.slice(0, 10) ?? "";
    if (start && date < start) return false;
    if (end && date > end) return false;
    return true;
  });
}

/** Local YYYY-MM-DD for a Date (avoids the UTC shift of toISOString). */
export function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Events occurring within [fromStr, toStr] inclusive (both YYYY-MM-DD).
 * Events with a `starts_at` are matched by their day; month-only events are
 * matched by calendar month so an in-range event isn't dropped just because
 * its day is unknown. Events with neither field are kept.
 */
export function filterEventWindow<T extends { starts_at?: string; month?: string }>(
  events: T[],
  fromStr: string,
  toStr: string
): T[] {
  const fromMonth = fromStr.slice(0, 7);
  const toMonth = toStr.slice(0, 7);
  return events.filter((e) => {
    if (e.starts_at) {
      const d = e.starts_at.slice(0, 10);
      return d >= fromStr && d <= toStr;
    }
    if (e.month) {
      const m = e.month.slice(0, 7);
      return m >= fromMonth && m <= toMonth;
    }
    return true;
  });
}
