import { select } from "@inquirer/prompts";
import { loadConfig, getActiveProfile } from "./config.js";
import { resolveMember, resolveClub, resolveAllMemberClubs } from "./resolve.js";
import { listUsers } from "./users.js";
import { interactiveEvents, interactiveCalendar, clubSlug } from "./interactive.js";
import { createSession } from "./auth.js";
import { runForPairs } from "./commands.js";
import { setupAccount } from "./setup.js";
import { orCancel, CANCELLED } from "./prompts.js";
import type { Pair } from "./interactive.js";

export async function interactive() {
  const config = await loadConfig();
  let profile = getActiveProfile(config);

  // First run: walk the user through an interactive login + account discovery.
  if (!profile) {
    profile = await setupAccount();
    if (!profile) return;
  }

  const members = listUsers(profile);
  if (members.length === 0) {
    console.log("No members in config. Add members to ~/.config/maiklubi/config.json.");
    return;
  }

  const { session } = await createSession();

  // Outer loop: action selection — calendar is top-level; others proceed to member/club selection
  while (true) {
    const action = await orCancel(
      select({
        message: "Mitä haluat tehdä?",
        choices: [
          { value: "events", name: "Tapahtumat (ilmoittaudu)" },
          { value: "invoices", name: "Laskut" },
          { value: "notifications", name: "Tiedotteet" },
          { value: "calendar", name: "Kalenteritilaukset" },
          { value: "__quit__", name: "Lopeta" },
        ],
      })
    );

    if (action === CANCELLED || action === "__quit__") return;

    // Calendar does not require a member context
    if (action === "calendar") {
      try {
        await interactiveCalendar(session, resolveAllMemberClubs(profile));
      } catch (err) {
        console.error(`\nVirhe: ${err instanceof Error ? err.message : String(err)}\n`);
      }
      continue;
    }

    // For all other actions: select member → club → run
    const memberChoices = [
      ...members.map((m) => ({ value: m.name, name: m.name })),
      { value: "__all__", name: "Kaikki jäsenet" },
      { value: "__back__", name: "← Takaisin" },
    ];

    const selectedMember = await orCancel(select({ message: "Valitse jäsen:", choices: memberChoices }));
    if (selectedMember === CANCELLED) return;
    if (selectedMember === "__back__") continue;

    let pairs: Pair[];
    if (selectedMember === "__all__") {
      pairs = resolveAllMemberClubs(profile);
    } else {
      const member = resolveMember(profile, selectedMember)!;
      if (member.clubs.length === 1) {
        pairs = [{ member, club: member.clubs[0] }];
      } else {
        const clubChoices = [
          ...member.clubs.map((c) => ({ value: clubSlug(c.clubUrl), name: clubSlug(c.clubUrl) })),
          { value: "__all__", name: "Kaikki seurat" },
          { value: "__back__", name: "← Takaisin" },
        ];
        const selectedClub = await orCancel(select({ message: "Valitse seura:", choices: clubChoices }));
        if (selectedClub === CANCELLED) return;
        if (selectedClub === "__back__") continue;
        if (selectedClub === "__all__") {
          pairs = member.clubs.map((club) => ({ member, club }));
        } else {
          const club = resolveClub(member, selectedClub)!;
          pairs = [{ member, club }];
        }
      }
    }

    try {
      if (action === "events") {
        await interactiveEvents(session, pairs);
      } else {
        await runForPairs(pairs, session, action, { json: false, limit: 20 });
      }
    } catch (err) {
      console.error(`\nVirhe: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }
}
