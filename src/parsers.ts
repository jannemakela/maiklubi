import type {
  Event,
  EventComment,
  Invoice,
  Notification,
  EventParticipant,
  CalendarSubscription,
  Indication,
} from "./types.js";

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&euro;/g, "€");
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

function extractDataAttrJson(html: string, attr: string): unknown {
  const pattern = new RegExp(`data-${attr}="([^"]+)"`);
  const m = html.match(pattern);
  if (!m) return null;
  try {
    return JSON.parse(decodeEntities(m[1]));
  } catch {
    return null;
  }
}

// Parse data-react-props blocks from HTML
function extractReactProps(html: string): unknown[] {
  const results: unknown[] = [];
  const pattern = /data-react-props="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(html)) !== null) {
    try {
      results.push(JSON.parse(decodeEntities(m[1])));
    } catch {
      // skip invalid
    }
  }
  return results;
}

// Parse indication from an event detail page.
// The detail page contains a status indicator element with data-indication="<current_state>"
// before the action buttons. Reading the first data-indication attribute gives the current state.
export function parseDetailPageIndication(
  html: string
): Indication {
  const m = html.match(/data-indication="([^"]+)"/);
  if (!m) return "no_response";
  const val = m[1] as string;
  if (val === "yes" || val === "no" || val === "no_response" || val === "maybe") return val;
  return "no_response";
}

// Parse indication from events list page button HTML (JS DOM updates from the toggle endpoint).
// On the list page, data-indication shows the NEXT click action (not current state).
// Current state is determined by button CSS class:
//   btn-success on Osallistun + data-indication="no_response" → joined (yes), next click cancels
//   btn-danger on En osallistu + data-indication="no"         → declined (no), next click undoes
//   btn-light on both + data-indication="yes"                 → not registered (no_response)
function parseIndicationFromListButtons(html: string): Indication {
  if (/btn-success/.test(html) && /data-indication="no_response"/.test(html)) return "yes";
  if (/btn-danger/.test(html) && /data-indication="no"/.test(html)) return "no";
  if (/data-indication="yes"/.test(html)) return "no_response";
  return "no_response";
}

// Parse indication from the JS response body returned by the indication toggle endpoint.
// The response body is a JavaScript string with HTML attributes escaped as \".
// btn-success / btn-danger class names are not quoted so match directly.
export function parseIndicationFromToggleJs(
  jsText: string
): Indication | null {
  if (!jsText) return null;
  if (jsText.includes("btn-success")) return "yes";
  if (jsText.includes("btn-danger")) return "no";
  // data-indication=\"yes\" in the escaped JS string
  if (jsText.includes('data-indication=\\"yes\\"') || jsText.includes('data-indication="yes"')) {
    return "no_response";
  }
  return null;
}

// Parse indication from an events list page for a specific event.
// Uses button CSS classes to determine state (data-indication on list page = next action, not current state).
// NOTE: In live sessions the event divs are rendered client-side by React;
// this works reliably for saved/pre-rendered HTML (e.g. JS DOM update responses).
export function parseEventIndication(
  html: string,
  eventId: number
): Indication {
  const startMarker = `data-event-id="${eventId}"`;
  const startIdx = html.indexOf(startMarker);
  if (startIdx === -1) return "no_response";

  // Scope to just this event's section
  const nextEventIdx = html.indexOf('data-event-id="', startIdx + startMarker.length);
  const section = nextEventIdx === -1 ? html.slice(startIdx) : html.slice(startIdx, nextEventIdx);

  return parseIndicationFromListButtons(section);
}

// Parse start/end times from the TklCalendar react-props embedded in the events list page.
// Returns a map of eventId → { starts_at, ends_at } in local-time ISO format.
// The calendar start/end arrays use 0-indexed months (like JS Date): [year, month0, day, h, min].
function parseCalendarTimes(html: string): Map<number, { starts_at: string; ends_at?: string }> {
  const result = new Map<number, { starts_at: string; ends_at?: string }>();
  const m = html.match(/data-react-class="TklCalendar"[^>]*data-react-props="([^"]+)"/);
  if (!m) return result;
  let props: unknown;
  try {
    props = JSON.parse(decodeEntities(m[1]));
  } catch {
    return result;
  }
  const events = (props as any)?.events;
  if (!Array.isArray(events)) return result;
  for (const ev of events) {
    if (!ev.id || !Array.isArray(ev.start) || ev.start.length < 5) continue;
    const toIso = (arr: number[]): string => {
      const [y, mo, d, h, min] = arr;
      return (
        `${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}` +
        `T${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:00`
      );
    };
    result.set(ev.id as number, {
      starts_at: toIso(ev.start as number[]),
      ends_at: Array.isArray(ev.end) && ev.end.length >= 5 ? toIso(ev.end as number[]) : undefined,
    });
  }
  return result;
}

export function parseEventsList(html: string): Event[] {
  const raw = extractDataAttrJson(html, "events");
  if (!Array.isArray(raw)) return [];
  const calMap = parseCalendarTimes(html);
  return (raw as Event[]).map((e) => {
    const times = calMap.get(e.id);
    return times ? { ...e, ...times } : e;
  });
}

// Parse start/end times from the event detail page time block.
// The block looks like: <div class="event-time-details"> 7.6.2026 11:45 - 23:00 ...
// Format: D.M.YYYY HH:MM - HH:MM (Finnish locale, local time, same-day end assumed).
// Used as fallback for clubs without TklCalendar on the events list page (e.g. PPJ).
export function parseEventTimeDetails(html: string): { starts_at?: string; ends_at?: string } {
  const m = html.match(
    /event-time-details[\s\S]{0,200}?(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/
  );
  if (!m) return {};
  const [, d, mo, y, startT, endT] = m;
  const pad = (s: string) => s.padStart(2, "0");
  const date = `${y}-${pad(mo)}-${pad(d)}`;
  return { starts_at: `${date}T${startT}:00`, ends_at: `${date}T${endT}:00` };
}

// Parse comments from an event detail page (TklDiscussion react-props).
// Never posts — read-only.
export function parseEventComments(html: string): EventComment[] {
  const m = html.match(/data-react-class="TklDiscussion"[^>]*data-react-props="([^"]+)"/);
  if (!m) return [];
  let props: unknown;
  try {
    props = JSON.parse(decodeEntities(m[1]));
  } catch {
    return [];
  }
  const raw = (props as any)?.comments;
  if (!Array.isArray(raw)) return [];
  return raw.map((c: any) => ({
    id: c.id as number,
    content: stripTags(decodeEntities(c.content ?? "")),
    created_at: c.created_at as string,
    creator: { id: c.creator?.id as number, name: (c.creator?.name ?? "") as string },
  }));
}


export function parseInvoices(
  html: string,
  status: "open" | "paid"
): Invoice[] {
  const invoices: Invoice[] = [];

  // Open invoices: card layout — each card wrapped in data-invoice-id div
  // <div class="col-md-6" data-invoice-id="15576252">
  //   <div class="card-header">Lasku #33413 ... <label>Avoin</label>
  //   <div class="card-body details">
  //     <label>Eräpäivä</label><div>11.6.2026</div>
  //     <label>Maksettava</label><div>111,00 €</div>
  //     <label>Nimike</label><div>Norcup 2026, 3. erä</div>
  const cardPattern = /data-invoice-id="(\d+)">([\s\S]*?)(?=data-invoice-id="|<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*(?:<div class="push">|<footer))/gi;
  let cardMatch: RegExpExecArray | null;
  while ((cardMatch = cardPattern.exec(html)) !== null) {
    const id = cardMatch[1];
    const block = cardMatch[2];

    const numMatch = block.match(/Lasku\s+#(\d+)/i);
    const dueMatch = block.match(/<label>\s*Er[äa]p[äa]iv[äa]\s*<\/label>\s*<div>([^<]+)<\/div>/i);
    const amountMatch = block.match(/<label>\s*Maksettava\s*<\/label>\s*<div>([\s\S]*?)<\/div>/i);
    const titleMatch = block.match(/<label>\s*Nimike\s*<\/label>\s*<div>([^<]+)<\/div>/i);

    if (!dueMatch) continue;
    invoices.push({
      id: numMatch ? `#${numMatch[1]}` : `#${id}`,
      due_date: dueMatch[1].trim(),
      amount: amountMatch ? decodeEntities(amountMatch[1]).replace(/\s+/g, " ").trim() : "",
      title: titleMatch ? titleMatch[1].trim() : "",
      status,
    });
  }

  if (invoices.length > 0) return invoices;

  // Paid invoices: table layout — No. | Eräpäivä | Maksuerä
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  for (const row of rows) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) =>
      stripTags(decodeEntities(m[1])).trim()
    );
    if (cells.length < 3) continue;
    if (cells[1] && cells[1].match(/^\d{1,2}\.\d{1,2}\.\d{4}$/)) {
      invoices.push({
        id: cells[0] ?? "",
        due_date: cells[1],
        amount: cells[2] ?? "",
        title: cells[3] ?? cells[0],
        status,
      });
    }
  }

  return invoices;
}

export function parseNotifications(html: string): Notification[] {
  const notifications: Notification[] = [];

  // Each notification card has an h3.notification-subject containing the title link.
  // <h3 class="notification-subject">
  //   <a href="/flow/notifications/248615">Title text</a>
  // </h3>
  const pattern = /<h3[^>]*class="[^"]*notification-subject[^"]*"[^>]*>[\s\S]*?<a[^>]+href="(\/flow\/notifications\/(\d+))"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(html)) !== null) {
    const url = m[1];
    const id = m[2];
    const title = stripTags(decodeEntities(m[3])).trim();
    if (title) notifications.push({ id, title, url });
  }

  return notifications;
}


export function parseEventParticipants(html: string): EventParticipant[] {
  const participants: EventParticipant[] = [];
  const seen = new Set<number>(); // deduplicate — HTML has each participant block twice
  // Match each indication block: class="indication indication-<status> ..." data-member-id="<id>"
  const blockPattern =
    /class="indication\s+(indication-[a-z_-]+)[^"]*"[^>]*data-member-id="(\d+)"/g;
  let m: RegExpExecArray | null;
  while ((m = blockPattern.exec(html)) !== null) {
    const cssClass = m[1]; // e.g. "indication-yes"
    const memberId = Number(m[2]);
    if (seen.has(memberId)) continue;
    seen.add(memberId);

    // Map CSS class to indication value
    let indication: Indication;
    if (cssClass === "indication-yes") indication = "yes";
    else if (cssClass === "indication-no") indication = "no";
    else if (cssClass === "indication-maybe") indication = "maybe";
    else indication = "no_response";

    // Scan ~600 chars after the match position for name and role
    const snippet = html.slice(m.index, m.index + 600);

    const nameMatch = snippet.match(/<div[^>]*class="[^"]*member-name[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    const name = nameMatch ? stripTags(decodeEntities(nameMatch[1])).trim() : "";

    const roleMatch = snippet.match(
      /<div[^>]*class="[^"]*indication-level[^"]*"[^>]*>([\s\S]*?)<\/div>/
    );
    const role = roleMatch ? stripTags(decodeEntities(roleMatch[1])).trim() : undefined;

    participants.push({
      member_id: memberId,
      name,
      indication,
      ...(role ? { role } : {}),
    });
  }

  // Sort: yes → maybe → no → no_response
  const order: Record<string, number> = { yes: 0, maybe: 1, no: 2, no_response: 3 };
  participants.sort((a, b) => (order[a.indication] ?? 3) - (order[b.indication] ?? 3));

  return participants;
}

export function parseCalendarSubscriptions(html: string): CalendarSubscription[] {
  const subscriptions: CalendarSubscription[] = [];
  // Split on card boundaries
  const cards = html.split('<div class="card card-default">');
  // Skip the first element (content before the first card)
  for (let i = 1; i < cards.length; i++) {
    const card = cards[i];

    // Extract ID from copy_link URL
    const idMatch = card.match(/\/calendar_subscriptions\/(\d+)\/copy_link/);
    if (!idMatch) continue;
    const id = Number(idMatch[1]);

    // Extract name: first non-empty div text content before the "Päivitetty" line
    // The name appears in the first <div> before text-muted / Päivitetty
    const nameMatch = card.match(/<div[^>]*>([\s\S]*?)<\/div>/);
    let name = "";
    if (nameMatch) {
      // Walk through divs until we find a non-empty text that isn't "Päivitetty"
      const divPattern = /<div[^>]*>([\s\S]*?)<\/div>/g;
      let dm: RegExpExecArray | null;
      while ((dm = divPattern.exec(card)) !== null) {
        const text = stripTags(decodeEntities(dm[1])).trim();
        if (text && !text.includes("Päivitetty")) {
          name = text;
          break;
        }
      }
    }

    subscriptions.push({ id, name });
  }
  return subscriptions;
}

export function parseCalendarSubscriptionUrl(jsText: string): string | null {
  // The copy_link endpoint returns JS where HTML is embedded in a single-quoted string,
  // so double quotes are escaped as \". Match the webcal URL directly.
  const m = jsText.match(/(webcal:\/\/[^"\\]+\.ics[^"\\]*)/);
  return m ? m[1] : null;
}

export function parseClubsFromHome(html: string): {
  clubs: { url: string; name: string; members: { id: string; name: string }[] }[];
} {
  const clubMap = new Map<
    string,
    { url: string; name: string; members: { id: string; name: string }[] }
  >();

  // Extract all select_account links with context
  const sections = html.split(/<h[1-6][^>]*>/i);
  for (const section of sections) {
    const headingMatch = section.match(/^([^<]{2,80})<\/h[1-6]/i);
    const clubName = headingMatch?.[1]?.trim();

    const accountPattern =
      /(https:\/\/([^.]+)\.myclub\.fi)\/flow\/select_account\?id=(\d+)/g;
    let m: RegExpExecArray | null;

    while ((m = accountPattern.exec(section)) !== null) {
      const [, clubUrl, clubSlug] = m;
      if (!clubMap.has(clubSlug)) {
        clubMap.set(clubSlug, {
          url: clubUrl,
          name: clubName ?? clubSlug,
          members: [],
        });
      }
    }
  }

  // Second pass: pair members with clubs
  const fullPattern =
    /href="(https:\/\/([^.]+)\.myclub\.fi\/flow\/select_account\?id=(\d+))"[^>]*>\s*([^\n<]{2,60})/g;
  let m: RegExpExecArray | null;
  while ((m = fullPattern.exec(html)) !== null) {
    const [, , clubSlug, memberId, rawName] = m;
    const memberName = rawName.trim();
    if (!memberName) continue;

    if (!clubMap.has(clubSlug)) {
      clubMap.set(clubSlug, {
        url: `https://${clubSlug}.myclub.fi`,
        name: clubSlug,
        members: [],
      });
    }
    const club = clubMap.get(clubSlug)!;
    if (!club.members.find((x) => x.id === memberId)) {
      club.members.push({ id: memberId, name: memberName });
    }
  }

  return { clubs: Array.from(clubMap.values()) };
}
