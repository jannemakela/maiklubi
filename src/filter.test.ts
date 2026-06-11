import { test, expect, describe } from "vitest";
import { filterEventsByDateRange, filterEventWindow, localDateStr, selectEvents } from "./filter.js";

const EVENTS = [
  { id: 1, name: "May event",    starts_at: "2026-05-15T10:00:00", month: "2026-05-01" },
  { id: 2, name: "Jun 1",        starts_at: "2026-06-01T10:00:00", month: "2026-06-01" },
  { id: 3, name: "Jun 17",       starts_at: "2026-06-17T15:00:00", month: "2026-06-01" },
  { id: 4, name: "Jun 30",       starts_at: "2026-06-30T10:00:00", month: "2026-06-01" },
  { id: 5, name: "Jul event",    starts_at: "2026-07-01T10:00:00", month: "2026-07-01" },
  { id: 6, name: "No starts_at", month: "2026-06-01" },
];

describe("filterEventsByDateRange", () => {
  test("returns all events when no range given", () => {
    expect(filterEventsByDateRange(EVENTS)).toHaveLength(EVENTS.length);
  });

  test("filters by start date (inclusive)", () => {
    const result = filterEventsByDateRange(EVENTS, "2026-06-01");
    expect(result.map((e) => e.id)).toEqual([2, 3, 4, 5, 6]);
  });

  test("filters by end date (inclusive)", () => {
    const result = filterEventsByDateRange(EVENTS, undefined, "2026-06-30");
    expect(result.map((e) => e.id)).toEqual([1, 2, 3, 4, 6]);
  });

  test("filters by both start and end", () => {
    const result = filterEventsByDateRange(EVENTS, "2026-06-01", "2026-06-30");
    expect(result.map((e) => e.id)).toEqual([2, 3, 4, 6]);
  });

  test("returns empty when range matches nothing", () => {
    const result = filterEventsByDateRange(EVENTS, "2026-12-01", "2026-12-31");
    expect(result).toHaveLength(0);
  });

  test("single day range returns only that day", () => {
    const result = filterEventsByDateRange(EVENTS, "2026-06-17", "2026-06-17");
    expect(result.map((e) => e.id)).toEqual([3]);
  });

  test("event without starts_at uses month for filtering", () => {
    const noTime = [{ id: 99, name: "no time", month: "2026-07-01" }];
    expect(filterEventsByDateRange(noTime, "2026-07-01", "2026-07-31")).toHaveLength(1);
    expect(filterEventsByDateRange(noTime, "2026-08-01")).toHaveLength(0);
  });
});

describe("filterEventWindow", () => {
  const evs = [
    { id: 1, starts_at: "2026-06-01T10:00:00", month: "2026-06-01" }, // before window
    { id: 2, starts_at: "2026-06-09T10:00:00", month: "2026-06-01" }, // = from (today)
    { id: 3, starts_at: "2026-06-17T15:00:00", month: "2026-06-01" }, // in window
    { id: 4, starts_at: "2026-06-23T10:00:00", month: "2026-06-01" }, // = to (cutoff)
    { id: 5, starts_at: "2026-07-01T10:00:00", month: "2026-07-01" }, // after window
    { id: 6, month: "2026-06-01" },                                   // month-only, in-range month
    { id: 7, month: "2026-08-01" },                                   // month-only, out-of-range month
    { id: 8 },                                                        // no date info → kept
  ];

  test("excludes past events and respects the [from, to] window", () => {
    const r = filterEventWindow(evs, "2026-06-09", "2026-06-23");
    expect(r.map((e) => e.id).sort()).toEqual([2, 3, 4, 6, 8]);
  });

  test("month-only events match by calendar month, not exact day", () => {
    // window entirely within June → the June month-only event (id 6) is kept
    expect(filterEventWindow(evs, "2026-06-15", "2026-06-20").map((e) => e.id)).toContain(6);
    // window in July → June month-only event dropped, August still out
    const jul = filterEventWindow(evs, "2026-07-01", "2026-07-31").map((e) => e.id);
    expect(jul).toContain(5);
    expect(jul).not.toContain(6);
    expect(jul).not.toContain(7);
  });
});

describe("localDateStr", () => {
  test("formats a Date as local YYYY-MM-DD (no UTC shift)", () => {
    expect(localDateStr(new Date(2026, 5, 9))).toBe("2026-06-09"); // month is 0-indexed
    expect(localDateStr(new Date(2026, 0, 3))).toBe("2026-01-03"); // zero-padded
  });
});

describe("selectEvents", () => {
  const evs = [
    { id: 1, joinable: true,  indication: "no_response" }, // joinable, no response
    { id: 2, joinable: true,  indication: "yes" },         // joinable, joined
    { id: 3, joinable: false, indication: "yes" },         // unjoinable but joined
    { id: 4, joinable: false, indication: "no" },          // unjoinable but declined
    { id: 5, joinable: false, indication: "no_response" }, // unjoinable + no response (noise)
    { id: 6, indication: "no_response" },                  // joinable unknown
  ];

  test("'relevant' (default) hides only unjoinable + no-response events", () => {
    expect(selectEvents(evs).map((e) => e.id)).toEqual([1, 2, 3, 4, 6]);
  });

  test("'joinable' drops every unjoinable event, even joined/declined", () => {
    expect(selectEvents(evs, "joinable").map((e) => e.id)).toEqual([1, 2, 6]);
  });

  test("'all' shows everything", () => {
    expect(selectEvents(evs, "all").map((e) => e.id)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
