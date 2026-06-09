import type { StoredProfile, MemberConfig, MemberClub } from "./types.js";

export function resolveMember(
  profile: StoredProfile,
  nameOrId: string
): MemberConfig | null {
  const members = profile.members ?? [];
  const needle = nameOrId.toLowerCase();
  return members.find((m) => m.name.toLowerCase() === needle) ?? null;
}

export function resolveClub(
  member: MemberConfig,
  hint: string
): MemberClub | null {
  if (!hint) return member.clubs[0] ?? null;
  const needle = hint.toLowerCase();
  return (
    member.clubs.find(
      (c) =>
        c.clubUrl.toLowerCase() === needle ||
        new URL(c.clubUrl).hostname.split(".")[0].toLowerCase() === needle
    ) ?? null
  );
}

export function resolveAllMemberClubs(
  profile: StoredProfile
): Array<{ member: MemberConfig; club: MemberClub }> {
  return (profile.members ?? []).flatMap((member) =>
    member.clubs.map((club) => ({ member, club }))
  );
}
