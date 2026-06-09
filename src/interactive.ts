import { select, checkbox } from "@inquirer/prompts";
import { orCancel, CANCELLED } from "./prompts.js";
import type { MyClubSession } from "./session.js";
import type { Event, MemberConfig, MemberClub, Indication } from "./types.js";

export type Pair = { member: MemberConfig; club: MemberClub };

export function clubSlug(url: string): string {
  try { return new URL(url).hostname.split(".")[0]; }
  catch { return url; }
}

function indicationLabel(status: Indication): string {
  const labels: Record<string, string> = {
    yes: "Ilmoittautunut",
    no: "Ei osallistu",
    no_response: "Ilmoittautumatta",
    maybe: "Ehkä",
  };
  return labels[status] ?? status;
}

export function indicationSymbol(status: Indication): string {
  return status === "yes" ? "✓" : status === "no" ? "✗" : "—";
}

export function formatMonth(month?: string): string {
  if (!month) return "";
  const parts = month.split("-");
  return parts.length >= 2 ? `${Number(parts[1])}.${parts[0]}` : month;
}

export function formatEventTime(starts_at?: string, ends_at?: string): string {
  if (!starts_at) return "";
  const [datePart, timePart] = starts_at.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const startTime = timePart.slice(0, 5);
  const days = ["su", "ma", "ti", "ke", "to", "pe", "la"];
  const dayName = days[new Date(y, m - 1, d).getDay()];
  const base = `${dayName} ${d}.${m}. ${startTime}`;
  if (ends_at) {
    const endTime = ends_at.split("T")[1].slice(0, 5);
    return `${base}–${endTime}`;
  }
  return base;
}

function formatCommentDate(created_at: string): string {
  const d = new Date(created_at);
  return `${d.getDate()}.${d.getMonth() + 1}. ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export async function interactiveCalendar(session: MyClubSession, allPairs: Pair[]): Promise<void> {
  const mainChoice = await orCancel(
    select({
      message: "Kalenteritilaukset:",
      choices: [
        { value: "list", name: "Listaa kalenteritilaukset" },
        { value: "create", name: "Luo uusi tilaus..." },
        { value: "__back__", name: "← Takaisin" },
      ],
    })
  );

  if (mainChoice === CANCELLED || mainChoice === "__back__") return;

  if (mainChoice === "list") {
    await interactiveCalendarList(session);
    return;
  }

  if (mainChoice === "create") {
    await interactiveCalendarCreate(session, allPairs);
  }
}

async function interactiveCalendarList(session: MyClubSession): Promise<void> {
  console.log("\nHaetaan kalenteritilaukset...");
  const subs = await session.listCalendarSubscriptions();

  if (subs.length === 0) {
    console.log("  Ei kalenteritilauksia.");
    return;
  }

  const choices = [
    ...subs.map((s) => ({ value: `view:${s.id}`, name: `${s.name}  [${s.id}]` })),
    { value: "__back__", name: "← Takaisin" },
  ];

  const choice = await orCancel(select({ message: "Valitse tilaus:", choices }));

  if (choice === CANCELLED || choice === "__back__") return;

  if (choice.startsWith("view:")) {
    const id = Number(choice.slice(5));
    console.log("\nHaetaan webcal-linkki...");
    const webcalUrl = await session.getCalendarSubscriptionUrl(id);
    console.log(`  webcal URL: ${webcalUrl ?? "Linkin haku epäonnistui"}`);
  }
}

async function interactiveCalendarCreate(session: MyClubSession, allPairs: Pair[]): Promise<void> {
  // Group pairs by member name
  const memberGroups = new Map<string, Pair[]>();
  for (const pair of allPairs) {
    const key = pair.member.name;
    if (!memberGroups.has(key)) memberGroups.set(key, []);
    memberGroups.get(key)!.push(pair);
  }

  // Step 1: who
  const selectedMembers = await orCancel(
    checkbox({
      message: "Kenelle? (välilyönti = valitse, enter = valmis):",
      choices: [...memberGroups.keys()].map((name) => ({ value: name, name })),
    })
  );
  if (selectedMembers === CANCELLED) return;
  if (selectedMembers.length === 0) {
    console.log("  Ei valittuja jäseniä.");
    return;
  }

  // Step 2: which hobbies/clubs for each selected member
  const selectedPairs: Pair[] = [];
  for (const memberName of selectedMembers) {
    const memberPairs = memberGroups.get(memberName)!;
    if (memberPairs.length === 1) {
      selectedPairs.push(memberPairs[0]);
    } else {
      const pickedClubs = await orCancel(
        checkbox({
          message: `${memberName} — mitkä harrastukset?`,
          choices: memberPairs.map((p) => ({
            value: p,
            name: clubSlug(p.club.clubUrl),
            checked: true,
          })),
        })
      );
      if (pickedClubs === CANCELLED) return;
      selectedPairs.push(...pickedClubs);
    }
  }
  if (selectedPairs.length === 0) {
    console.log("  Ei valittuja harrastuksia.");
    return;
  }

  // Step 3: indication — all events or only joining
  const indication = await orCancel(
    select({
      message: "Mitkä tapahtumat?",
      choices: [
        { value: "yes", name: "Vain tapahtumat joihin osallistun (✓)" },
        { value: "", name: "Kaikki tapahtumat" },
      ],
    })
  );
  if (indication === CANCELLED) return;

  // Step 4: collect internal login IDs (unique per person)
  console.log("\nHaetaan jäsen-ID:t...");
  const loginIds: string[] = [];
  for (const { member, club } of selectedPairs) {
    await session.selectAccount(club.clubUrl, club.memberId);
    const id = session.getLoginId();
    if (id && !loginIds.includes(id)) {
      loginIds.push(id);
    } else if (!id) {
      console.error(`  ${member.name}/${clubSlug(club.clubUrl)}: ei voitu hakea jäsen-ID:tä`);
    }
  }
  if (loginIds.length === 0) {
    console.error("  Virhe: ei saatu yhtään jäsen-ID:tä.");
    return;
  }

  // Step 5: build name and create
  const uniqueMembers = [...new Set(selectedPairs.map((p) => p.member.name))];
  const clubNames = selectedPairs.map((p) => clubSlug(p.club.clubUrl)).join(", ");
  const indicationSuffix = indication === "yes" ? " — osallistun" : " — kaikki";
  const subName = `${uniqueMembers.join(", ")} / ${clubNames}${indicationSuffix}`;

  console.log(`\nLuodaan tilaus: ${subName}...`);
  try {
    const { webcalUrl } = await session.createCalendarSubscription(subName, loginIds, indication);
    console.log(`✓ Luotu!`);
    console.log(`  webcal URL: ${webcalUrl}`);
  } catch (err) {
    console.error(`  Virhe: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function interactiveEvents(session: MyClubSession, pairs: Pair[]): Promise<void> {
  type EventItem = { event: Event; member: MemberConfig; club: MemberClub };
  const items: EventItem[] = [];

  for (const { member, club } of pairs) {
    await session.selectAccount(club.clubUrl, club.memberId);
    const events = await session.getEventsList(club.clubUrl);
    for (const event of events) {
      items.push({ event, member, club });
    }
  }

  if (items.length === 0) {
    console.log("\nEi tulevia tapahtumia.");
    return;
  }

  const showMember = pairs.length > 1;

  // Fetch all indication statuses upfront (parallel per club)
  const indicationMap = new Map<number, Indication>();
  process.stdout.write("Haetaan ilmoittautumistiedot...");
  const byClub = new Map<string, Array<{ event: Event; club: MemberClub }>>();
  for (const { event, club } of items) {
    const key = `${club.clubUrl}:${club.memberId}`;
    if (!byClub.has(key)) byClub.set(key, []);
    byClub.get(key)!.push({ event, club });
  }
  for (const [, clubItems] of byClub) {
    const { club } = clubItems[0]!;
    await session.selectAccount(club.clubUrl, club.memberId);
    await Promise.all(
      clubItems.map(async ({ event }) => {
        const ind = await session.getEventIndication(club.clubUrl, event.id);
        indicationMap.set(event.id, ind);
      })
    );
  }
  console.log(" valmis.");

  while (true) {
    // Rebuild choices each loop so statuses stay current after changes
    const eventChoices: Array<{ value: number; name: string }> = [
      ...items.map(({ event, member, club }, idx) => {
        const status = indicationMap.get(event.id) ?? "no_response";
        const sym = indicationSymbol(status);
        const time = formatEventTime(event.starts_at, event.ends_at) || formatMonth(event.month);
        const label = showMember
          ? `${sym}  [${member.name}/${clubSlug(club.clubUrl)}] ${event.name}  (${time})  ${event.venue}`
          : `${sym}  ${event.name}  (${time})  ${event.venue}`;
        return { value: idx, name: label };
      }),
      { value: -1, name: "← Takaisin" },
    ];

    const chosenIdx = await orCancel(select({ message: "Valitse tapahtuma:", choices: eventChoices }));
    if (chosenIdx === CANCELLED || chosenIdx === -1) return;

    const { event, club } = items[chosenIdx]!;
    const current = indicationMap.get(event.id) ?? "no_response";
    const currentLabel = indicationLabel(current);

    const indicationChoices: Array<{ value: string; name: string }> = [];
    if (current !== "yes") indicationChoices.push({ value: "yes", name: "Ilmoittaudu — osallistun" });
    if (current !== "no") indicationChoices.push({ value: "no", name: "En osallistu" });
    if (current === "yes" || current === "no") indicationChoices.push({ value: "no_response", name: "Peruuta ilmoittautuminen" });
    indicationChoices.push({ value: "__messages__", name: "Näytä viestit" });
    indicationChoices.push({ value: "__back__", name: "← Takaisin" });

    const actionChoice = await orCancel(
      select({
        message: `Ilmoittaudu — ${event.name}  (nyt: ${currentLabel})`,
        choices: indicationChoices,
      })
    );
    if (actionChoice === CANCELLED) return;
    if (actionChoice === "__back__") continue;

    if (actionChoice === "__messages__") {
      process.stdout.write("Haetaan viestit...");
      const comments = await session.getEventComments(club.clubUrl, event.id);
      console.log(` ${comments.length} viestiä.`);
      if (comments.length === 0) {
        console.log("  Ei viestejä.\n");
      } else {
        for (const c of comments) {
          console.log(`  ${c.creator.name}  ${formatCommentDate(c.created_at)}`);
          console.log(`  ${c.content}\n`);
        }
      }
      continue;
    }

    await session.selectAccount(club.clubUrl, club.memberId);
    process.stdout.write("Lähetetään...");
    try {
      const result = await session.indicate(
        club.clubUrl,
        event.id,
        actionChoice as "yes" | "no" | "no_response"
      );
      const newLabel = indicationLabel(result.indication);
      indicationMap.set(event.id, result.indication);
      console.log(` valmis.`);
      if (result.indication === (actionChoice as string)) {
        console.log(`  ${event.name}: ${currentLabel} → ${newLabel}\n`);
      } else {
        console.log(`  ${event.name}: ilmoittautuminen ei muuttunut (${newLabel})`);
        console.log(`  Huom: tämä tapahtuma ei välttämättä tue ilmoittautumisen muutosta tätä kautta.\n`);
      }
    } catch (err) {
      console.log(` virhe.`);
      console.error(`  Virhe: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }
}
