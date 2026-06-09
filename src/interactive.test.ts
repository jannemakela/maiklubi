import { describe, test, expect, vi, beforeEach } from "vitest";
import { interactiveEvents, interactiveCalendar } from "./interactive.js";
import type { Pair } from "./interactive.js";

// ─── Module mocks ──────────────────────────────────────────────────────────────

vi.mock("@inquirer/prompts", () => ({ select: vi.fn(), checkbox: vi.fn() }));

// ─── Helpers ───────────────────────────────────────────────────────────────────

const MOCK_EVENTS = [
  {
    id: 10759871,
    name: "Treenit",
    group: "ToPoLa",
    venue: "Sali",
    month: "2026-06-01",
    event_category: "Treenit",
    starts_at: "2026-06-17T15:00:00",
    ends_at: "2026-06-17T16:45:00",
  },
];

function makeSession() {
  return {
    selectAccount: vi.fn().mockResolvedValue(undefined),
    getEventsList: vi.fn().mockResolvedValue(MOCK_EVENTS),
    getEventIndication: vi.fn().mockResolvedValue("no_response" as const),
    indicate: vi.fn().mockResolvedValue({ ownParticipation: 1, indication: "yes" as const }),
    getEventComments: vi.fn().mockResolvedValue([]),
  };
}

const PAIR: Pair = {
  member: { name: "Aino", clubs: [{ clubUrl: "https://topola.myclub.fi", memberId: "123" }] },
  club: { clubUrl: "https://topola.myclub.fi", memberId: "123" },
};

// ─── Tests ─────────────────────────────────────────────────────────────────────

// ─── Calendar mock helpers ─────────────────────────────────────────────────────

function makeCalSession() {
  return {
    selectAccount: vi.fn().mockResolvedValue(undefined),
    listCalendarSubscriptions: vi.fn().mockResolvedValue([
      { id: 44673, name: "Aino / topola" },
    ]),
    getCalendarSubscriptionUrl: vi.fn().mockResolvedValue("webcal://id.myclub.fi/flow/calendar_subscriptions/44673.ics?token=abc"),
    createCalendarSubscription: vi.fn().mockResolvedValue({ id: 99999, webcalUrl: "webcal://id.myclub.fi/flow/calendar_subscriptions/99999.ics?token=xyz" }),
    getLoginId: vi.fn().mockReturnValue("100002"),
  };
}

const CAL_PAIR: Pair = {
  member: { name: "Aino", clubs: [{ clubUrl: "https://topola.myclub.fi", memberId: "100001" }] },
  club: { clubUrl: "https://topola.myclub.fi", memberId: "100001" },
};

// ─── interactiveCalendar tests ─────────────────────────────────────────────────

describe("interactiveCalendar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("Back from calendar menu returns without action", async () => {
    const { select } = await import("@inquirer/prompts");
    vi.mocked(select).mockResolvedValueOnce("__back__" as any);

    const session = makeCalSession();
    await expect(interactiveCalendar(session as any, [CAL_PAIR])).resolves.toBeUndefined();
    expect(session.createCalendarSubscription).not.toHaveBeenCalled();
    expect(session.getCalendarSubscriptionUrl).not.toHaveBeenCalled();
  });

  test("View existing subscription shows webcal URL", async () => {
    const { select } = await import("@inquirer/prompts");
    // Main menu → list, then pick existing subscription
    vi.mocked(select).mockResolvedValueOnce("list" as any);
    vi.mocked(select).mockResolvedValueOnce("view:44673" as any);

    const session = makeCalSession();
    await interactiveCalendar(session as any, [CAL_PAIR]);
    expect(session.getCalendarSubscriptionUrl).toHaveBeenCalledWith(44673);
  });

  test("ExitPromptError from calendar menu exits cleanly", async () => {
    const { ExitPromptError } = await import("@inquirer/core");
    const { select } = await import("@inquirer/prompts");
    vi.mocked(select).mockRejectedValueOnce(new ExitPromptError());

    const session = makeCalSession();
    await expect(interactiveCalendar(session as any, [CAL_PAIR])).resolves.toBeUndefined();
  });

  test("Create wizard: single-club member + indication yes → createCalendarSubscription", async () => {
    const { select, checkbox } = await import("@inquirer/prompts");
    // Main menu → create
    vi.mocked(select).mockResolvedValueOnce("create" as any);
    // Step 1: member checkbox → Aino
    vi.mocked(checkbox).mockResolvedValueOnce(["Aino"] as any);
    // Step 2: skip (only 1 club)
    // Step 3: indication
    vi.mocked(select).mockResolvedValueOnce("yes" as any);

    const session = makeCalSession();
    await interactiveCalendar(session as any, [CAL_PAIR]);
    expect(session.createCalendarSubscription).toHaveBeenCalledWith(
      "Aino / topola — osallistun",
      ["100002"],
      "yes"
    );
  });

  test("Create wizard: indication all events → createCalendarSubscription with empty string", async () => {
    const { select, checkbox } = await import("@inquirer/prompts");
    vi.mocked(select).mockResolvedValueOnce("create" as any);
    vi.mocked(checkbox).mockResolvedValueOnce(["Aino"] as any);
    vi.mocked(select).mockResolvedValueOnce("" as any);

    const session = makeCalSession();
    await interactiveCalendar(session as any, [CAL_PAIR]);
    expect(session.createCalendarSubscription).toHaveBeenCalledWith(
      "Aino / topola — kaikki",
      ["100002"],
      ""
    );
  });

  test("Create wizard: no member selected → exits without creating", async () => {
    const { select, checkbox } = await import("@inquirer/prompts");
    vi.mocked(select).mockResolvedValueOnce("create" as any);
    vi.mocked(checkbox).mockResolvedValueOnce([] as any);

    const session = makeCalSession();
    await interactiveCalendar(session as any, [CAL_PAIR]);
    expect(session.createCalendarSubscription).not.toHaveBeenCalled();
  });

  test("Create wizard: multi-club member shows club checkbox", async () => {
    const PAIR_PPJ: Pair = {
      member: { name: "Aino", clubs: [] },
      club: { clubUrl: "https://ppj.myclub.fi", memberId: "456" },
    };
    const multiPairs = [CAL_PAIR, PAIR_PPJ];

    const { select, checkbox } = await import("@inquirer/prompts");
    vi.mocked(select).mockResolvedValueOnce("create" as any);
    // Step 1: select Aino
    vi.mocked(checkbox).mockResolvedValueOnce(["Aino"] as any);
    // Step 2: club selection (has 2 clubs) → pick only topola
    vi.mocked(checkbox).mockResolvedValueOnce([CAL_PAIR] as any);
    // Step 3: indication
    vi.mocked(select).mockResolvedValueOnce("yes" as any);

    const session = makeCalSession();
    await interactiveCalendar(session as any, multiPairs);
    expect(session.createCalendarSubscription).toHaveBeenCalledWith(
      "Aino / topola — osallistun",
      ["100002"],
      "yes"
    );
  });
});

// ─── interactiveEvents tests ───────────────────────────────────────────────────

describe("interactiveEvents — back navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("selecting ← Takaisin from event list exits cleanly without error", async () => {
    const { select } = await import("@inquirer/prompts");
    vi.mocked(select).mockResolvedValueOnce(-1 as any); // user picks "← Takaisin" from event list

    const session = makeSession();
    await expect(interactiveEvents(session as any, [PAIR])).resolves.toBeUndefined();
    expect(vi.mocked(select)).toHaveBeenCalledTimes(1);
  });

  test("selecting ← Takaisin from action menu returns to event list (loops)", async () => {
    const { select } = await import("@inquirer/prompts");
    vi.mocked(select)
      .mockResolvedValueOnce(0 as any)        // pick event at index 0
      .mockResolvedValueOnce("__back__" as any) // "← Takaisin" from action menu
      .mockResolvedValueOnce(-1 as any);       // "← Takaisin" from event list (exit)

    const session = makeSession();
    await expect(interactiveEvents(session as any, [PAIR])).resolves.toBeUndefined();
    expect(vi.mocked(select)).toHaveBeenCalledTimes(3);
  });

  test("Escape (ExitPromptError) at event list exits cleanly", async () => {
    const { ExitPromptError } = await import("@inquirer/core");
    const { select } = await import("@inquirer/prompts");
    vi.mocked(select).mockRejectedValueOnce(new ExitPromptError());

    const session = makeSession();
    await expect(interactiveEvents(session as any, [PAIR])).resolves.toBeUndefined();
  });

  test("Escape (ExitPromptError) at action menu exits cleanly", async () => {
    const { ExitPromptError } = await import("@inquirer/core");
    const { select } = await import("@inquirer/prompts");
    vi.mocked(select)
      .mockResolvedValueOnce(0 as any)           // pick event
      .mockRejectedValueOnce(new ExitPromptError()); // Escape at action menu

    const session = makeSession();
    await expect(interactiveEvents(session as any, [PAIR])).resolves.toBeUndefined();
    expect(vi.mocked(select)).toHaveBeenCalledTimes(2);
  });

  test("indicate action is called and indication updates in the map", async () => {
    const { select } = await import("@inquirer/prompts");
    vi.mocked(select)
      .mockResolvedValueOnce(0 as any)      // pick event
      .mockResolvedValueOnce("yes" as any)  // indicate yes
      .mockResolvedValueOnce(-1 as any);    // back from event list

    const session = makeSession();
    await interactiveEvents(session as any, [PAIR]);

    expect(session.indicate).toHaveBeenCalledWith(
      "https://topola.myclub.fi",
      10759871,
      "yes"
    );
  });

  test("no events returns without showing any select prompt", async () => {
    const { select } = await import("@inquirer/prompts");
    const session = makeSession();
    session.getEventsList = vi.fn().mockResolvedValue([]);
    await interactiveEvents(session as any, [PAIR]);

    expect(vi.mocked(select)).not.toHaveBeenCalled();
  });

  test("messages action shows comments without calling indicate", async () => {
    const { select } = await import("@inquirer/prompts");
    vi.mocked(select)
      .mockResolvedValueOnce(0 as any)             // pick event
      .mockResolvedValueOnce("__messages__" as any) // show messages
      .mockResolvedValueOnce(-1 as any);            // back

    const session = makeSession();
    session.getEventComments = vi.fn().mockResolvedValue([
      { id: 1, content: "Hei!", created_at: "2026-06-10T09:00:00.000+03:00", creator: { id: 1, name: "Aino" } },
    ]);

    await interactiveEvents(session as any, [PAIR]);

    expect(session.getEventComments).toHaveBeenCalledWith("https://topola.myclub.fi", 10759871);
    expect(session.indicate).not.toHaveBeenCalled();
  });
});
