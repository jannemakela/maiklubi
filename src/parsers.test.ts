import { describe, test, expect } from "vitest";
import { parseEventIndication, parseDetailPageIndication, parseEventJoinable, parseIndicationFromToggleJs, parseEventsList, parseEventComments, parseEventTimeDetails, parseEventParticipants, parseCalendarSubscriptions, parseCalendarSubscriptionUrl } from "./parsers.js";

// ─── Shared fixture helper ────────────────────────────────────────────────────
// Encode a value so it can be embedded as an HTML attribute (data-foo="...").
function encodeAttr(obj: unknown): string {
  return JSON.stringify(obj).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

// ─── parseEventsList with calendar times fixtures ─────────────────────────────

const LIST_DATA_EVENTS = [
  { id: 10759871, name: "T16 & P16 kesätreenit", group: "ToPoLa", venue: "Lauttasaaren Yhteiskoulu Uusi", month: "2026-06-01", event_category: "Treenit" },
  { id: 10697553, name: "Espoo liikkuu -turnaus", group: "ToPoLa", venue: "Espoo", month: "2026-08-01", event_category: "Turnaus" },
];

const LIST_CALENDAR_PROPS = {
  events: [
    // Only 10759871 is in the calendar; 10697553 is absent (no calendar match)
    { id: 10759871, start: [2026, 5, 17, 15, 0], end: [2026, 5, 17, 16, 45], title: "T16", own_participation: 1 },
  ],
  visibility: "week",
  filters: [],
  filterId: null,
  reserveListHeight: false,
};

// Fixture: events list page HTML with both data-events and TklCalendar react-props
const EVENTS_LIST_WITH_TIMES_HTML = `
<div data-events="${encodeAttr(LIST_DATA_EVENTS)}"></div>
<div data-react-class="TklCalendar" data-react-props="${encodeAttr(LIST_CALENDAR_PROPS)}"></div>
`;

// Fixture: events list page HTML with no TklCalendar props (fallback: times absent)
const EVENTS_LIST_NO_CALENDAR_HTML = `
<div data-events="${encodeAttr(LIST_DATA_EVENTS)}"></div>
`;

// ─── parseEventComments fixtures ─────────────────────────────────────────────

const DISCUSSION_WITH_COMMENTS = {
  id: 7032668,
  allow_comments: true,
  topic_type: "Event",
  topic_id: 10759871,
  group_id: 52828,
  comments: [
    {
      id: 12345,
      content: "<p>Nähdään harjoituksissa!</p>",
      created_at: "2026-06-10T09:00:00.000+03:00",
      creator: { id: 100002, name: "Aino Virtanen" },
    },
    {
      id: 12346,
      content: "<p>Ei pysty <strong>tulemaan</strong>.</p>",
      created_at: "2026-06-10T10:30:00.000+03:00",
      creator: { id: 100007, name: "Veikko Virtanen" },
    },
  ],
  current_member: { id: 100002, can_comment: true },
};

const DISCUSSION_EMPTY = { ...DISCUSSION_WITH_COMMENTS, comments: [] };

const EVENT_DETAIL_WITH_COMMENTS_HTML = `
<div data-react-class="TklDiscussion" data-react-props="${encodeAttr(DISCUSSION_WITH_COMMENTS)}"></div>
`;

const EVENT_DETAIL_NO_COMMENTS_HTML = `
<div data-react-class="TklDiscussion" data-react-props="${encodeAttr(DISCUSSION_EMPTY)}"></div>
`;

// ─── parseDetailPageIndication fixtures ───────────────────────────────────────
// The event detail page has a status indicator element with data-indication="<current_state>"
// that appears before the action buttons. The first data-indication attribute = current state.

// Detail page when state = "yes" (joined)
const DETAIL_YES_HTML = `
<div class="event-indication-status">
  <div class="event-detail" data-indication="yes">
    <i class="fa fa-check-circle"></i>
  </div>
</div>
<a class="btn" data-indication="no">En osallistu</a>
`;

// Detail page when state = "no_response" (not registered)
const DETAIL_NO_RESPONSE_HTML = `
<div class="event-indication-status">
  <div class="event-detail" data-indication="no_response">
  </div>
</div>
<a class="btn" data-indication="no">En osallistu</a>
`;

// Detail page when state = "no" (declined)
const DETAIL_NO_HTML = `
<div class="event-indication-status">
  <div class="event-detail" data-indication="no">
  </div>
</div>
<a class="btn" data-indication="no">En osallistu</a>
`;

// ─── parseEventIndication fixtures ────────────────────────────────────────────
// The events list page (and JS DOM update responses) use button CSS classes to indicate state.
// data-indication on list page buttons = next click action, not current state.
//   btn-success + data-indication="no_response" → current state is "yes" (joined, clicking cancels)
//   btn-light  + data-indication="yes"          → current state is "no_response" (clicking joins)
//   btn-danger + data-indication="no"           → current state is "no" (declined)

// State = "yes" (joined): Osallistun button is btn-success
const LIST_YES_HTML = `
<div class="event" data-event-id="10759871" data-week="2026-25">
  <div class="btn-group">
    <a class="btn btn-success" data-indication="no_response" data-remote="true" href="/flow/events/10759871/edit">Osallistun</a>
    <a class="btn btn-light " data-indication="no" data-remote="true" href="/flow/events/10759871/edit">En osallistu</a>
  </div>
</div>
`;

// State = "no_response" (not registered): both buttons btn-light
const LIST_NO_RESPONSE_HTML = `
<div class="event" data-event-id="10759871" data-week="2026-25">
  <div class="btn-group">
    <a class="btn btn-light " data-indication="yes" data-remote="true" href="/flow/events/10759871/edit">Osallistun</a>
    <a class="btn btn-light " data-indication="no" data-remote="true" href="/flow/events/10759871/edit">En osallistu</a>
  </div>
</div>
`;

// State = "no" (declined): En osallistu is btn-danger
const LIST_NO_HTML = `
<div class="event" data-event-id="10759871" data-week="2026-25">
  <div class="btn-group">
    <a class="btn btn-light" data-indication="no_response" data-remote="true" href="/flow/events/10759871/edit">Osallistun</a>
    <a class="btn btn-danger" data-indication="no" data-remote="true" href="/flow/events/10759871/edit">En osallistu</a>
  </div>
</div>
`;

// Adjacent events: 10759870 = yes, 10759871 = no_response
const LIST_ADJACENT_HTML = `
<div class="event" data-event-id="10759870" data-week="2026-24">
  <div class="btn-group">
    <a class="btn btn-success" data-indication="no_response" data-remote="true" href="/flow/events/10759870/edit">Osallistun</a>
    <a class="btn btn-light" data-indication="no" data-remote="true" href="/flow/events/10759870/edit">En osallistu</a>
  </div>
</div>
<div class="event" data-event-id="10759871" data-week="2026-25">
  <div class="btn-group">
    <a class="btn btn-light " data-indication="yes" data-remote="true" href="/flow/events/10759871/edit">Osallistun</a>
    <a class="btn btn-light " data-indication="no" data-remote="true" href="/flow/events/10759871/edit">En osallistu</a>
  </div>
</div>
`;

describe("parseDetailPageIndication", () => {
  test("returns yes when first data-indication is yes (user is joined)", () => {
    expect(parseDetailPageIndication(DETAIL_YES_HTML)).toBe("yes");
  });

  test("returns no_response when first data-indication is no_response", () => {
    expect(parseDetailPageIndication(DETAIL_NO_RESPONSE_HTML)).toBe("no_response");
  });

  test("returns no when first data-indication is no", () => {
    expect(parseDetailPageIndication(DETAIL_NO_HTML)).toBe("no");
  });

  test("returns no_response when no indication found", () => {
    expect(parseDetailPageIndication("<html><body></body></html>")).toBe("no_response");
  });

  test("returns yes for a single data-indication=yes element", () => {
    expect(parseDetailPageIndication(`<div data-indication="yes"></div>`)).toBe("yes");
  });
});

describe("parseEventIndication", () => {
  test("returns yes for joined event (btn-success)", () => {
    expect(parseEventIndication(LIST_YES_HTML, 10759871)).toBe("yes");
  });

  test("returns no_response for not-registered event (btn-light, data-indication=yes)", () => {
    expect(parseEventIndication(LIST_NO_RESPONSE_HTML, 10759871)).toBe("no_response");
  });

  test("returns no for declined event (btn-danger)", () => {
    expect(parseEventIndication(LIST_NO_HTML, 10759871)).toBe("no");
  });

  test("returns no_response when event not found", () => {
    expect(parseEventIndication(LIST_YES_HTML, 99999)).toBe("no_response");
  });

  test("does not leak indication from adjacent event", () => {
    expect(parseEventIndication(LIST_ADJACENT_HTML, 10759870)).toBe("yes");
    expect(parseEventIndication(LIST_ADJACENT_HTML, 10759871)).toBe("no_response");
  });

  test("returns no_response for event with no indication buttons", () => {
    const html = `<div class="event" data-event-id="10759871"></div>`;
    expect(parseEventIndication(html, 10759871)).toBe("no_response");
  });
});

describe("parseIndicationFromToggleJs", () => {
  test("returns yes when JS response contains btn-success (joined after toggle)", () => {
    // Actual JS response text has HTML attributes escaped as \"
    const js = 'class=\\"btn btn-success\\" data-indication=\\"no_response\\"';
    expect(parseIndicationFromToggleJs(js)).toBe("yes");
  });

  test("returns no_response when JS response contains escaped data-indication=yes", () => {
    const js = 'class=\\"btn btn-light \\" data-indication=\\"yes\\"';
    expect(parseIndicationFromToggleJs(js)).toBe("no_response");
  });

  test("returns no when JS response contains btn-danger (declined after toggle)", () => {
    const js = 'class=\\"btn btn-danger\\" data-indication=\\"no\\"';
    expect(parseIndicationFromToggleJs(js)).toBe("no");
  });

  test("returns null for empty string (server returned 304 with no body)", () => {
    expect(parseIndicationFromToggleJs("")).toBeNull();
  });
});

// ─── parseEventsList with calendar times ──────────────────────────────────────

describe("parseEventsList — date/time from TklCalendar", () => {
  test("events matched in calendar have starts_at as local ISO string", () => {
    const events = parseEventsList(EVENTS_LIST_WITH_TIMES_HTML);
    const e = events.find((ev) => ev.id === 10759871)!;
    // start: [2026, 5, 17, 15, 0] — month is 0-indexed, so 5 = June
    expect(e.starts_at).toBe("2026-06-17T15:00:00");
  });

  test("events matched in calendar have ends_at as local ISO string", () => {
    const events = parseEventsList(EVENTS_LIST_WITH_TIMES_HTML);
    const e = events.find((ev) => ev.id === 10759871)!;
    // end: [2026, 5, 17, 16, 45]
    expect(e.ends_at).toBe("2026-06-17T16:45:00");
  });

  test("events absent from calendar have no starts_at or ends_at", () => {
    const events = parseEventsList(EVENTS_LIST_WITH_TIMES_HTML);
    const e = events.find((ev) => ev.id === 10697553)!;
    expect(e.starts_at).toBeUndefined();
    expect(e.ends_at).toBeUndefined();
  });

  test("returns events without times when TklCalendar props are absent", () => {
    const events = parseEventsList(EVENTS_LIST_NO_CALENDAR_HTML);
    expect(events).toHaveLength(2);
    expect(events[0].starts_at).toBeUndefined();
  });

  test("still returns name, venue, group from data-events", () => {
    const events = parseEventsList(EVENTS_LIST_WITH_TIMES_HTML);
    const e = events.find((ev) => ev.id === 10759871)!;
    expect(e.name).toBe("T16 & P16 kesätreenit");
    expect(e.venue).toBe("Lauttasaaren Yhteiskoulu Uusi");
  });
});

// ─── parseEventComments ───────────────────────────────────────────────────────

describe("parseEventComments", () => {
  test("returns empty array when comments list is empty", () => {
    expect(parseEventComments(EVENT_DETAIL_NO_COMMENTS_HTML)).toEqual([]);
  });

  test("returns empty array when TklDiscussion not present", () => {
    expect(parseEventComments("<html><body></body></html>")).toEqual([]);
  });

  test("returns correct number of comments", () => {
    expect(parseEventComments(EVENT_DETAIL_WITH_COMMENTS_HTML)).toHaveLength(2);
  });

  test("comment has id, created_at, and creator name", () => {
    const comments = parseEventComments(EVENT_DETAIL_WITH_COMMENTS_HTML);
    expect(comments[0].id).toBe(12345);
    expect(comments[0].created_at).toBe("2026-06-10T09:00:00.000+03:00");
    expect(comments[0].creator.name).toBe("Aino Virtanen");
    expect(comments[0].creator.id).toBe(100002);
  });

  test("comment content has HTML tags stripped", () => {
    const comments = parseEventComments(EVENT_DETAIL_WITH_COMMENTS_HTML);
    expect(comments[0].content).toBe("Nähdään harjoituksissa!");
    expect(comments[1].content).toBe("Ei pysty tulemaan.");
  });
});

// ─── parseEventTimeDetails ────────────────────────────────────────────────────
// Parses the date/time block from an event detail page for clubs without TklCalendar
// (e.g. PPJ). The block: <div class="event-time-details"> D.M.YYYY HH:MM - HH:MM

const PPJ_EVENT_DETAIL_HTML = `
<div class="row push-bottom event-time-details">
  <div class="col-12">
    <div class="event-icon"><i class="fa fa-clock-o"></i></div>
    <div>
      7.6.2026 11:45 - 23:00
      <a title="Lataa tiedosto" href="/flow/events/10553899.ics"></a>
    </div>
  </div>
</div>
`;

const TOPOLA_EVENT_DETAIL_HTML = `
<div class="row push-bottom event-time-details">
  <div class="col-12">
    <div>
      17.6.2026 15:00 - 16:45
    </div>
  </div>
</div>
`;

describe("parseEventTimeDetails", () => {
  test("parses Finnish date D.M.YYYY and returns ISO starts_at", () => {
    const result = parseEventTimeDetails(PPJ_EVENT_DETAIL_HTML);
    expect(result.starts_at).toBe("2026-06-07T11:45:00");
  });

  test("parses end time and returns ISO ends_at", () => {
    const result = parseEventTimeDetails(PPJ_EVENT_DETAIL_HTML);
    expect(result.ends_at).toBe("2026-06-07T23:00:00");
  });

  test("works for single-digit day and month", () => {
    const result = parseEventTimeDetails(PPJ_EVENT_DETAIL_HTML);
    // 7.6.2026 → month=06, day=07
    expect(result.starts_at).toBe("2026-06-07T11:45:00");
  });

  test("works for two-digit day and month (ToPoLa format)", () => {
    const result = parseEventTimeDetails(TOPOLA_EVENT_DETAIL_HTML);
    expect(result.starts_at).toBe("2026-06-17T15:00:00");
    expect(result.ends_at).toBe("2026-06-17T16:45:00");
  });

  test("returns empty object when event-time-details is absent", () => {
    expect(parseEventTimeDetails("<html><body>Ei päivämäärää</body></html>")).toEqual({});
  });
});

// ─── parseEventParticipants ───────────────────────────────────────────────────

const PARTICIPANT_YES_HTML = `
<div class="indication indication-yes clickable" data-member-id="100008" data-url="/flow/events/10759871/indications/100008">
  <div class="indication-body">
    <div class="member-name">Liisa Korhonen</div>
    <div class="small">
      <div class="indication-level"><span class="icon"></span>Pelaaja</div>
    </div>
  </div>
</div>
`;

const PARTICIPANT_NO_HTML = `
<div class="indication indication-no clickable" data-member-id="2000001" data-url="/flow/events/10759871/indications/2000001">
  <div class="indication-body">
    <div class="member-name">Testi Kieltäytyjä</div>
    <div class="small">
      <div class="indication-level"><span class="icon"></span>Pelaaja</div>
    </div>
  </div>
</div>
`;

const PARTICIPANT_NO_ROLE_HTML = `
<div class="indication indication-yes clickable" data-member-id="3000001" data-url="/flow/events/10759871/indications/3000001">
  <div class="indication-body">
    <div class="member-name">Rooliton Henkilö</div>
    <div class="small">
    </div>
  </div>
</div>
`;

const PARTICIPANT_MULTI_HTML = `
<div class="indication indication-yes clickable" data-member-id="100008" data-url="/flow/events/10759871/indications/100008">
  <div class="indication-body">
    <div class="member-name">Liisa Korhonen</div>
    <div class="small">
      <div class="indication-level"><span class="icon"></span>Pelaaja</div>
    </div>
  </div>
</div>
<div class="indication indication-maybe clickable" data-member-id="1034381" data-url="/flow/events/10759871/indications/1034381">
  <div class="indication-body">
    <div class="member-name">Ehkä Pelaaja</div>
    <div class="small">
      <div class="indication-level"><span class="icon"></span>Pelaaja</div>
    </div>
  </div>
</div>
<div class="indication indication-no clickable" data-member-id="1034382" data-url="/flow/events/10759871/indications/1034382">
  <div class="indication-body">
    <div class="member-name">Ei Osallistu</div>
    <div class="small">
      <div class="indication-level"><span class="icon"></span>Valmentaja</div>
    </div>
  </div>
</div>
<div class="indication indication-no_response clickable" data-member-id="1034383" data-url="/flow/events/10759871/indications/1034383">
  <div class="indication-body">
    <div class="member-name">Ei Vastausta</div>
    <div class="small">
      <div class="indication-level"><span class="icon"></span>Pelaaja</div>
    </div>
  </div>
</div>
`;

describe("parseEventParticipants", () => {
  test("returns empty array for HTML with no indication blocks", () => {
    expect(parseEventParticipants("<html><body>No participants here</body></html>")).toEqual([]);
  });

  test("parses yes participant with name and role", () => {
    const result = parseEventParticipants(PARTICIPANT_YES_HTML);
    expect(result).toHaveLength(1);
    expect(result[0].member_id).toBe(100008);
    expect(result[0].name).toBe("Liisa Korhonen");
    expect(result[0].indication).toBe("yes");
    expect(result[0].role).toBe("Pelaaja");
  });

  test("parses no participant", () => {
    const result = parseEventParticipants(PARTICIPANT_NO_HTML);
    expect(result).toHaveLength(1);
    expect(result[0].member_id).toBe(2000001);
    expect(result[0].name).toBe("Testi Kieltäytyjä");
    expect(result[0].indication).toBe("no");
  });

  test("multiple participants are sorted yes, maybe, no, no_response", () => {
    const result = parseEventParticipants(PARTICIPANT_MULTI_HTML);
    expect(result).toHaveLength(4);
    expect(result[0].indication).toBe("yes");
    expect(result[1].indication).toBe("maybe");
    expect(result[2].indication).toBe("no");
    expect(result[3].indication).toBe("no_response");
  });

  test("role is undefined when indication-level is absent", () => {
    const result = parseEventParticipants(PARTICIPANT_NO_ROLE_HTML);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBeUndefined();
  });
});

// ─── parseCalendarSubscriptions ──────────────────────────────────────────────

const CALENDAR_SUB_SINGLE_HTML = `
<div class="container">
  <div class="card card-default">
    <div class="card-body">
      <div>Ainon Kalenteri</div>
      <div class="text-muted">Päivitetty 1.6.2026</div>
      <a href="/flow/calendar_subscriptions/44673/copy_link">Kopioi linkki</a>
    </div>
  </div>
</div>
`;

const CALENDAR_SUB_MULTI_HTML = `
<div class="container">
  <div class="card card-default">
    <div class="card-body">
      <div>Ainon Kalenteri</div>
      <div class="text-muted">Päivitetty 1.6.2026</div>
      <a href="/flow/calendar_subscriptions/44673/copy_link">Kopioi linkki</a>
    </div>
  </div>
  <div class="card card-default">
    <div class="card-body">
      <div>Tiituksen Kalenteri</div>
      <div class="text-muted">Päivitetty 2.6.2026</div>
      <a href="/flow/calendar_subscriptions/44674/copy_link">Kopioi linkki</a>
    </div>
  </div>
</div>
`;

describe("parseCalendarSubscriptions", () => {
  test("returns empty array when no cards present", () => {
    expect(parseCalendarSubscriptions("<html><body>Ei tilauksia</body></html>")).toEqual([]);
  });

  test("parses subscription ID and name from a card", () => {
    const result = parseCalendarSubscriptions(CALENDAR_SUB_SINGLE_HTML);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(44673);
    expect(result[0].name).toBe("Ainon Kalenteri");
  });

  test("handles multiple subscriptions", () => {
    const result = parseCalendarSubscriptions(CALENDAR_SUB_MULTI_HTML);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(44673);
    expect(result[0].name).toBe("Ainon Kalenteri");
    expect(result[1].id).toBe(44674);
    expect(result[1].name).toBe("Tiituksen Kalenteri");
  });
});

// ─── parseCalendarSubscriptionUrl ────────────────────────────────────────────

describe("parseCalendarSubscriptionUrl", () => {
  test("returns webcal URL from JS text", () => {
    const js = `$("#general-modal").html('<div><input type="text" value="webcal://id.myclub.fi/flow/calendar_subscriptions/44673.ics?token=226b0e96f" /></div>')`;
    expect(parseCalendarSubscriptionUrl(js)).toBe(
      "webcal://id.myclub.fi/flow/calendar_subscriptions/44673.ics?token=226b0e96f"
    );
  });

  test("returns webcal URL from real production JS (escaped quotes)", () => {
    // Production response: JS single-quoted string with \" escaping around HTML attributes
    const js = String.raw`$("#general-modal").html('\n<input type=\"text\" value=\"webcal://id.myclub.fi/flow/calendar_subscriptions/44673.ics?token=226b0e96f\" />')`;
    expect(parseCalendarSubscriptionUrl(js)).toBe(
      "webcal://id.myclub.fi/flow/calendar_subscriptions/44673.ics?token=226b0e96f"
    );
  });

  test("returns null for text with no URL", () => {
    expect(parseCalendarSubscriptionUrl('$("#general-modal").html("<p>Virhe</p>")')).toBeNull();
  });
});

// ─── parseEventJoinable ───────────────────────────────────────────────────────
describe("parseEventJoinable", () => {
  // Open event: detail page renders the indication buttons.
  const OPEN_HTML = `<div class="event-actions"><div class="btn-group">
    <a class="btn btn-success" data-indication="no_response" href="/flow/events/1/edit">Osallistun</a>
    <a class="btn btn-light" data-indication="no" href="/flow/events/1/edit">En osallistu</a>
  </div></div>`;

  // Registration deadline passed: buttons removed, "Ilmoittautuminen päättynyt" shown.
  const CLOSED_HTML = `<div class="event-actions"><span>Ilmoittautuminen päättynyt</span></div>
    <h3>Ilmoittautumiset</h3>`;

  // Match-type event: no join widget at all, no deadline notice.
  const NO_WIDGET_HTML = `<h3>Ilmoittautumiset</h3><div class="participants">...</div>`;

  test("open event with the indication widget is joinable", () => {
    expect(parseEventJoinable(OPEN_HTML)).toEqual({ joinable: true, registrationClosed: false });
  });

  test("registration-closed event is not joinable and flagged closed", () => {
    expect(parseEventJoinable(CLOSED_HTML)).toEqual({ joinable: false, registrationClosed: true });
  });

  test("event without a join widget is not joinable (not flagged closed)", () => {
    expect(parseEventJoinable(NO_WIDGET_HTML)).toEqual({ joinable: false, registrationClosed: false });
  });
});
