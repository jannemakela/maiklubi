import type { Indication } from "./types.js";

export interface CliFlags {
  member?: string;
  club?: string;
  allMembers?: boolean;
  json?: boolean;
  limit?: number;
  id?: string;
  status?: Indication;
  indication?: string;
  withParticipants?: boolean;
  days?: number;
  start?: string;
  end?: string;
}

export interface ParsedArgs {
  command?: string;
  subcommand?: string;
  flags: CliFlags;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const [command, rawSub, ...rawRest] = argv;

  const subcommand =
    rawSub === undefined || rawSub.startsWith("--") ? undefined : rawSub;
  const rest =
    rawSub?.startsWith("--") ? [rawSub, ...rawRest] : rawRest;

  const flags: CliFlags = {};
  let i = 0;
  while (i < rest.length) {
    const arg = rest[i];
    if (arg === "--json") { flags.json = true; i++; continue; }
    if (arg === "--all-members" || arg === "--all") { flags.allMembers = true; i++; continue; }
    if (arg === "--member" && rest[i + 1]) { flags.member = rest[i + 1]; i += 2; continue; }
    if (arg === "--club" && rest[i + 1]) { flags.club = rest[i + 1]; i += 2; continue; }
    if (arg === "--limit" && rest[i + 1]) {
      const v = Number(rest[i + 1]);
      if (!Number.isNaN(v)) flags.limit = v;
      i += 2; continue;
    }
    if (arg === "--id" && rest[i + 1]) { flags.id = rest[i + 1]; i += 2; continue; }
    if (arg === "--status" && rest[i + 1]) {
      const s = rest[i + 1];
      if (s === "yes" || s === "no" || s === "no_response" || s === "maybe") {
        flags.status = s;
      }
      i += 2; continue;
    }
    if (arg === "--indication" && rest[i + 1]) { flags.indication = rest[i + 1]; i += 2; continue; }
    if (arg === "--with-participants") { flags.withParticipants = true; i++; continue; }
    if (arg === "--days" && rest[i + 1]) {
      const v = Number(rest[i + 1]);
      if (!Number.isNaN(v)) flags.days = v;
      i += 2; continue;
    }
    if (arg === "--start" && rest[i + 1]) { flags.start = rest[i + 1]; i += 2; continue; }
    if (arg === "--end" && rest[i + 1]) { flags.end = rest[i + 1]; i += 2; continue; }
    i++;
  }

  return { command, subcommand, flags };
}
