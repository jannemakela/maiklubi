import { MyClubSession } from "./session.js";
import { resolveMember, resolveClub } from "./resolve.js";
import { listUsers } from "./users.js";
import { parseInvoices, parseNotifications, parseClubsFromHome } from "./parsers.js";
import { clubSlug, formatMonth, formatEventTime, indicationSymbol } from "./interactive.js";
import { filterEventsByDateRange, filterEventWindow, localDateStr, selectEvents } from "./filter.js";
import type { EventView } from "./filter.js";
import type { Pair } from "./interactive.js";
import type { MemberConfig, MemberClub, StoredProfile, EventParticipant, Indication } from "./types.js";

// ─── Output helper ────────────────────────────────────────────────────────────

export function out(data: unknown, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(data);
  }
}

// ─── Command handlers ─────────────────────────────────────────────────────────

export async function cmdUsers(profile: StoredProfile | null, json: boolean) {
  const members = profile ? listUsers(profile) : [];
  if (json) {
    out({ members }, true);
    return;
  }
  if (members.length === 0) {
    console.log("No members configured.");
    return;
  }
  console.log("\nMembers:");
  for (const m of members) {
    const clubs = m.clubs.map((c) => clubSlug(c.clubUrl)).join(", ");
    console.log(`  ${m.name}  (${clubs})`);
  }
}

export async function cmdEvents(
  session: MyClubSession,
  member: MemberConfig,
  club: MemberClub,
  json: boolean,
  withParticipants = false,
  start?: string,
  end?: string,
  view: EventView = "relevant"
) {
  await session.selectAccount(club.clubUrl, club.memberId);
  const listed = await session.getEventsList(club.clubUrl, { joinable: true });
  const inRange = filterEventsByDateRange(listed, start, end);
  const label = `${member.name} / ${clubSlug(club.clubUrl)}`;

  // Attach indication status (parallel), then apply the chosen view
  // (relevant default / joinable-only / all).
  const indications = await Promise.all(
    inRange.map((e) => session.getEventIndication(club.clubUrl, e.id).catch(() => "no_response" as const))
  );
  const withStatus = inRange.map((e, i) => ({ ...e, indication: indications[i] }));
  const events = selectEvents(withStatus, view);

  if (json) {
    out({ member: member.name, club: club.clubUrl, memberId: club.memberId, events }, true);
    return;
  }

  console.log(`\nEvents — ${label} (${events.length}):`);
  for (const e of events) {
    const ind = e.indication;
    const sym = indicationSymbol(ind);
    const time = formatEventTime(e.starts_at, e.ends_at);
    const closed = e.joinable === false
      ? (e.registrationClosed ? "  🔒 registration closed" : "  🔒 not joinable")
      : "";
    console.log(`  ${sym} [${e.id}] ${e.name}  ${time || formatMonth(e.month)}  ${e.venue}${closed}`);

    if (withParticipants && ind === "yes") {
      try {
        const participants = await session.getEventParticipants(club.clubUrl, e.id);
        const yes = participants.filter((p) => p.indication === "yes");
        if (yes.length > 0) {
          console.log(`       Attending: ${yes.map((p) => `${p.name}${p.role ? ` (${p.role})` : ""}`).join(", ")}`);
        }
      } catch {
        // skip participant fetch errors
      }
    }
  }
}

export async function cmdIndicate(
  session: MyClubSession,
  member: MemberConfig,
  club: MemberClub,
  eventId: number,
  status: Indication,
  json: boolean
) {
  await session.selectAccount(club.clubUrl, club.memberId);
  const before = await session.getEventIndication(club.clubUrl, eventId);

  const result = await session.indicate(club.clubUrl, eventId, status);

  if (json) {
    out({ member: member.name, club: club.clubUrl, eventId, before, after: status, ownParticipation: result.ownParticipation }, true);
    return;
  }
  console.log(`${member.name} / ${clubSlug(club.clubUrl)} — event ${eventId}: ${before} → ${status}`);
}

export async function cmdInvoices(
  session: MyClubSession,
  member: MemberConfig,
  club: MemberClub,
  json: boolean
) {
  await session.selectAccount(club.clubUrl, club.memberId);
  const [openHtml, paidHtml] = await Promise.all([
    session.fetchPage(`${club.clubUrl}/flow/invoices`),
    session.fetchPage(`${club.clubUrl}/flow/invoices/paid`),
  ]);
  const openInvoices = parseInvoices(openHtml, "open");
  const paidInvoices = parseInvoices(paidHtml, "paid");
  const label = `${member.name} / ${clubSlug(club.clubUrl)}`;
  if (json) {
    out({ member: member.name, club: club.clubUrl, memberId: club.memberId, openInvoices, paidInvoices }, true);
    return;
  }
  const total = openInvoices.length + paidInvoices.length;
  console.log(`\nInvoices — ${label} (${total}):`);
  for (const inv of openInvoices) {
    console.log(`  !  ${inv.title}  due ${inv.due_date}  ${inv.amount}`);
  }
  for (const inv of paidInvoices) {
    console.log(`  ✓  ${inv.title}  paid ${inv.due_date}  ${inv.amount}`);
  }
}

export async function cmdNotifications(
  session: MyClubSession,
  member: MemberConfig,
  club: MemberClub,
  limit: number,
  json: boolean
) {
  await session.selectAccount(club.clubUrl, club.memberId);
  const html = await session.fetchPage(`${club.clubUrl}/flow/notifications`);
  const notifications = parseNotifications(html).slice(0, limit);
  const label = `${member.name} / ${clubSlug(club.clubUrl)}`;
  if (json) {
    out({ member: member.name, club: club.clubUrl, memberId: club.memberId, notifications }, true);
    return;
  }
  console.log(`\nNotifications — ${label} (${notifications.length}):`);
  for (const n of notifications) {
    console.log(`  [${n.id ?? "?"}] ${n.title}  ${n.url ?? ""}`);
  }
}

export async function cmdNotificationShow(
  session: MyClubSession,
  clubUrl: string,
  notificationId: number,
  json: boolean
) {
  const n = await session.getNotification(clubUrl, notificationId);
  if (json) {
    out({ id: notificationId, clubUrl, notification: n }, true);
    return;
  }
  if (!n) {
    console.log("\nNotification not found.");
    return;
  }
  console.log(`\n${n.title}`);
  const meta = [n.sender, n.timestamp].filter(Boolean).join("  ·  ");
  if (meta) console.log(`  ${meta}`);
  if (n.content) console.log(`\n${n.content}\n`);
}

export async function cmdAccounts(session: MyClubSession, json: boolean) {
  const html = await session.fetchPage("https://id.myclub.fi/flow/home");
  const { clubs } = parseClubsFromHome(html);
  if (json) {
    out({ clubs }, true);
    return;
  }
  console.log("\nClubs and members on myclub.fi:");
  for (const club of clubs) {
    console.log(`  ${club.name} (${club.url})`);
    for (const m of club.members) {
      console.log(`    - ${m.name}  id=${m.id}`);
    }
  }
}

export async function cmdEventParticipants(
  session: MyClubSession,
  clubUrl: string,
  eventId: number,
  json: boolean
) {
  const participants = await session.getEventParticipants(clubUrl, eventId);
  if (json) {
    out({ eventId, clubUrl, participants }, true);
    return;
  }
  const groups: Record<string, EventParticipant[]> = {
    yes: [],
    maybe: [],
    no: [],
    no_response: [],
  };
  for (const p of participants) {
    groups[p.indication].push(p);
  }
  const labels: Record<string, string> = {
    yes: "Attending",
    maybe: "Maybe",
    no: "Not attending",
    no_response: "No response",
  };
  for (const key of ["yes", "maybe", "no", "no_response"]) {
    const group = groups[key];
    if (group.length === 0) continue;
    console.log(`\n${labels[key]} (${group.length}):`);
    for (const p of group) {
      const roleStr = p.role ? `  [${p.role}]` : "";
      console.log(`  ${p.name}${roleStr}`);
    }
  }
}

export async function cmdEventComments(
  session: MyClubSession,
  clubUrl: string,
  eventId: number,
  json: boolean
) {
  const comments = await session.getEventComments(clubUrl, eventId);
  if (json) {
    out({ eventId, clubUrl, comments }, true);
    return;
  }
  if (comments.length === 0) {
    console.log("\nNo discussion messages.");
    return;
  }
  console.log(`\nDiscussion (${comments.length}):`);
  for (const c of comments) {
    console.log(`  ${c.creator.name}  ${c.created_at}`);
    console.log(`  ${c.content}\n`);
  }
}

export async function cmdCalendarList(session: MyClubSession, json: boolean) {
  const subscriptions = await session.listCalendarSubscriptions();
  if (json) {
    out({ subscriptions }, true);
    return;
  }
  if (subscriptions.length === 0) {
    console.log("No calendar subscriptions found.");
    return;
  }
  console.log(`\nCalendar subscriptions (${subscriptions.length}):`);
  for (const sub of subscriptions) {
    console.log(`  [${sub.id}] ${sub.name}`);
  }
}

export async function cmdCalendarCreate(
  session: MyClubSession,
  profile: StoredProfile,
  memberName: string,
  clubFilter: string | undefined,
  indication: string,
  json: boolean
) {
  const member = resolveMember(profile, memberName);
  if (!member) {
    console.error(`Member "${memberName}" not found. Run: maiklubi users list`);
    process.exit(1);
  }

  // Collect internal login IDs for each club pair
  let targetClubs = member.clubs;
  if (clubFilter) {
    const c = resolveClub(member, clubFilter);
    if (!c) {
      console.error(`Club "${clubFilter}" not found for ${member.name}.`);
      process.exit(1);
    }
    targetClubs = [c];
  }

  const internalIds: string[] = [];
  for (const club of targetClubs) {
    await session.selectAccount(club.clubUrl, club.memberId);
    const loginId = session.getLoginId();
    if (loginId && !internalIds.includes(loginId)) {
      internalIds.push(loginId);
    }
  }

  if (internalIds.length === 0) {
    console.error("Could not determine internal member IDs. Try selectAccount first.");
    process.exit(1);
  }

  const subName = `${memberName} — ${indication || "kaikki"}`;
  const { webcalUrl } = await session.createCalendarSubscription(subName, internalIds, indication);

  if (json) {
    out({ name: subName, webcalUrl }, true);
    return;
  }
  console.log(`\nCalendar subscription created: ${subName}`);
  console.log(`  webcal URL: ${webcalUrl}`);
}

export async function cmdSummary(
  session: MyClubSession,
  member: MemberConfig,
  club: MemberClub,
  days: number,
  json: boolean
) {
  await session.selectAccount(club.clubUrl, club.memberId);

  const now = new Date();
  const todayStr = localDateStr(now);
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() + days);
  const cutoffStr = localDateStr(cutoff);

  // Fetch events (with joinability), invoices, and notifications in parallel
  const [allEvents, invoiceHtml, notifHtml] = await Promise.all([
    session.getEventsList(club.clubUrl, { joinable: true }),
    session.fetchPage(`${club.clubUrl}/flow/invoices`),
    session.fetchPage(`${club.clubUrl}/flow/notifications`),
  ]);

  // Events from today through the next N days (excludes past events).
  const upcomingEvents = filterEventWindow(allEvents, todayStr, cutoffStr);

  // Fetch indications in parallel for filtered events
  const indications = await Promise.all(
    upcomingEvents.map((e) =>
      session.getEventIndication(club.clubUrl, e.id).catch(() => "no_response" as const)
    )
  );

  // Drop unjoinable + no-response noise from the digest.
  const eventsWithStatus = selectEvents(
    upcomingEvents.map((e, i) => ({ ...e, indication: indications[i] })),
    "relevant"
  );

  const invoices = parseInvoices(invoiceHtml, "open");
  const notifications = parseNotifications(notifHtml).slice(0, 5);
  const label = `${member.name} / ${clubSlug(club.clubUrl)}`;

  if (json) {
    out({ member: member.name, club: club.clubUrl, events: eventsWithStatus, invoices, notifications }, true);
    return;
  }

  console.log(`\nSummary — ${label} (next ${days} days)`);

  console.log(`\n  Events (${eventsWithStatus.length}):`);
  for (const e of eventsWithStatus) {
    const sym = indicationSymbol(e.indication as Indication);
    const time = formatEventTime(e.starts_at, e.ends_at);
    const closed = e.joinable === false
      ? (e.registrationClosed ? "  🔒 registration closed" : "  🔒 not joinable")
      : "";
    console.log(`    ${sym} ${e.name}  ${time || formatMonth(e.month)}  ${e.venue}${closed}`);
  }

  console.log(`\n  Open invoices: ${invoices.length}`);
  for (const inv of invoices) {
    console.log(`    ${inv.due_date}  ${inv.amount}  ${inv.title}`);
  }

  console.log(`\n  Recent notifications (${notifications.length}):`);
  for (const n of notifications) {
    console.log(`    ${n.title}`);
  }
}

// ─── Per-pair runner (single or all members) ──────────────────────────────────

export async function runForPairs(
  pairs: Pair[],
  session: MyClubSession,
  cmd: string,
  flags: { json?: boolean; limit?: number; withParticipants?: boolean; start?: string; end?: string; allEvents?: boolean; joinableOnly?: boolean }
) {
  const view: EventView = flags.allEvents ? "all" : flags.joinableOnly ? "joinable" : "relevant";
  for (const { member, club } of pairs) {
    if (cmd === "events") {
      await cmdEvents(session, member, club, flags.json ?? false, flags.withParticipants ?? false, flags.start, flags.end, view);
    } else if (cmd === "invoices") {
      await cmdInvoices(session, member, club, flags.json ?? false);
    } else if (cmd === "notifications") {
      await cmdNotifications(session, member, club, flags.limit ?? 20, flags.json ?? false);
    }
  }
}
