#!/usr/bin/env node
import { createRequire } from "module";
import { loadConfig, getActiveProfile, getConfigPath, clearConfig } from "./config.js";
import { parseArgs } from "./args.js";
import { resolveMember, resolveClub, resolveAllMemberClubs } from "./resolve.js";
import { clubSlug } from "./interactive.js";
import { createSession } from "./auth.js";
import { interactive } from "./menu.js";
import { chooseOrCreateProfile } from "./setup.js";
import { printUsage } from "./usage.js";
import {
  out,
  cmdUsers,
  cmdIndicate,
  cmdAccounts,
  cmdEventParticipants,
  cmdEventComments,
  cmdNotificationShow,
  cmdCalendarList,
  cmdCalendarCreate,
  cmdSummary,
  runForPairs,
} from "./commands.js";
import type { Pair } from "./interactive.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getVersion(): string {
  const require = createRequire(import.meta.url);
  return (require("../package.json") as { version: string }).version;
}

function eventIdOrExit(idFlag: string | undefined): number {
  const eventId = Number(idFlag);
  if (!idFlag || Number.isNaN(eventId)) {
    console.error(`Invalid or missing --id (event ID): ${idFlag ?? "(none)"}`);
    process.exit(1);
  }
  return eventId;
}

// ─── Command mode ─────────────────────────────────────────────────────────────

async function handleCommand(argv: string[]) {
  const { command, subcommand, flags } = parseArgs(argv);

  if (command === "config" && subcommand === "clear") {
    await clearConfig();
    console.log(`Cleared config at ${getConfigPath()}`);
    return;
  }

  if (command === "login") {
    const profile = await chooseOrCreateProfile();
    process.exit(profile ? 0 : 1);
  }

  const config = await loadConfig();
  const profile = getActiveProfile(config);

  if (command === "users") {
    await cmdUsers(profile, flags.json ?? false);
    return;
  }

  if (command === "accounts") {
    const { session } = await createSession();
    await cmdAccounts(session, flags.json ?? false);
    return;
  }

  if (command === "calendar" && subcommand === "list") {
    const { session } = await createSession();
    await cmdCalendarList(session, flags.json ?? false);
    return;
  }

  if (command === "version") {
    const version = getVersion();
    if (flags.json) {
      out({ version }, true);
    } else {
      console.log(`maiklubi v${version}`);
    }
    return;
  }

  if (command === "update") {
    const { execSync } = await import("child_process");
    console.log(`Current version: ${getVersion()}`);
    console.log("Updating maiklubi...");
    try {
      execSync("npm install -g maiklubi", { stdio: "inherit" });
    } catch {
      console.log("Could not update via npm. Pull the latest version from source and run: npm run build && npm link");
    }
    return;
  }

  if (!profile) {
    console.error("No credentials found. Set MAIKLUBI_EMAIL and MAIKLUBI_PASSWORD.");
    process.exit(1);
  }

  // Resolve which (member, club) pairs to operate on
  let pairs: Pair[];
  if (flags.allMembers) {
    pairs = resolveAllMemberClubs(profile);
  } else if (flags.member) {
    const member = resolveMember(profile, flags.member);
    if (!member) {
      console.error(`Member "${flags.member}" not found. Run: maiklubi users list`);
      process.exit(1);
    }
    if (flags.club) {
      const club = resolveClub(member, flags.club);
      if (!club) {
        console.error(`Club "${flags.club}" not found for ${member.name}.`);
        process.exit(1);
      }
      pairs = [{ member, club }];
    } else if (member.clubs.length === 1) {
      pairs = [{ member, club: member.clubs[0] }];
    } else {
      const clubList = member.clubs.map((c) => clubSlug(c.clubUrl)).join(", ");
      console.error(`${member.name} is in multiple clubs: ${clubList}. Use --club <name>.`);
      process.exit(1);
    }
  } else {
    console.error("Specify --member <name> or --all-members.");
    process.exit(1);
  }

  const { session } = await createSession();

  if (command === "events" && subcommand === "indicate") {
    if (!flags.id || !flags.status) {
      console.error("Usage: maiklubi events indicate --member <name> --id <eventId> --status yes|no|no_response");
      process.exit(1);
    }
    const eventId = eventIdOrExit(flags.id);
    for (const { member, club } of pairs) {
      await cmdIndicate(session, member, club, eventId, flags.status, flags.json ?? false);
    }
    return;
  }

  if (command === "events" && subcommand === "participants") {
    if (!flags.member || !flags.id) {
      console.error("Usage: maiklubi events participants --member <name> --club <club> --id <eventId> [--json]");
      process.exit(1);
    }
    const eventId = eventIdOrExit(flags.id);
    for (const { club } of pairs) {
      await session.selectAccount(club.clubUrl, club.memberId);
      await cmdEventParticipants(session, club.clubUrl, eventId, flags.json ?? false);
    }
    return;
  }

  if (command === "events" && subcommand === "comments") {
    if (!flags.member || !flags.id) {
      console.error("Usage: maiklubi events comments --member <name> --club <club> --id <eventId> [--json]");
      process.exit(1);
    }
    const eventId = eventIdOrExit(flags.id);
    for (const { club } of pairs) {
      await session.selectAccount(club.clubUrl, club.memberId);
      await cmdEventComments(session, club.clubUrl, eventId, flags.json ?? false);
    }
    return;
  }

  if (command === "notifications" && subcommand === "show") {
    if (!flags.member || !flags.id) {
      console.error("Usage: maiklubi notifications show --member <name> --club <club> --id <notificationId> [--json]");
      process.exit(1);
    }
    const notificationId = eventIdOrExit(flags.id);
    for (const { club } of pairs) {
      await session.selectAccount(club.clubUrl, club.memberId);
      await cmdNotificationShow(session, club.clubUrl, notificationId, flags.json ?? false);
    }
    return;
  }

  if (command === "summary") {
    const days = flags.days ?? 14;
    for (const { member, club } of pairs) {
      await cmdSummary(session, member, club, days, flags.json ?? false);
    }
    return;
  }

  if (command === "calendar" && subcommand === "create") {
    if (!flags.member) {
      console.error("Usage: maiklubi calendar create --member <name> [--club <club>] [--indication yes] [--json]");
      process.exit(1);
    }
    await cmdCalendarCreate(
      session,
      profile,
      flags.member,
      flags.club,
      flags.indication ?? "",
      flags.json ?? false
    );
    return;
  }

  await runForPairs(pairs, session, command ?? "", {
    json: flags.json,
    limit: flags.limit,
    withParticipants: flags.withParticipants,
    start: flags.start,
    end: flags.end,
    allEvents: flags.allEvents,
    joinableOnly: flags.joinableOnly,
  });
}

// ─── Entry point ──────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);

if (argv.includes("--help") || argv.includes("-h")) {
  printUsage();
  process.exit(0);
}

if (argv.includes("--version") || argv.includes("-v")) {
  console.log(getVersion());
  process.exit(0);
}

if (argv.length === 0 && process.stdin.isTTY) {
  await interactive();
} else {
  await handleCommand(argv);
}
