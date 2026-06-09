import { test, expect } from "vitest";
import { resolveMember, resolveClub, resolveAllMemberClubs } from "./resolve.js";
import type { StoredProfile } from "./types.js";

const profile: StoredProfile = {
  id: "test@example.com",
  email: "test@example.com",
  passwordObfuscated: "",
  lastUsedAt: "2026-06-05T00:00:00.000Z",
  members: [
    {
      name: "Aino",
      clubs: [{ clubUrl: "https://topola.myclub.fi", memberId: "100001" }],
    },
    {
      name: "Veikko",
      clubs: [
        { clubUrl: "https://ppj.myclub.fi", memberId: "100003" },
        { clubUrl: "https://topola.myclub.fi", memberId: "100004" },
      ],
    },
    {
      name: "Onni",
      clubs: [
        { clubUrl: "https://ppj.myclub.fi", memberId: "100005" },
        { clubUrl: "https://topola.myclub.fi", memberId: "100006" },
      ],
    },
  ],
};

test("resolveMember finds by exact name", () => {
  const m = resolveMember(profile, "Aino");
  expect(m?.name).toBe("Aino");
});

test("resolveMember is case-insensitive", () => {
  const m = resolveMember(profile, "aino");
  expect(m?.name).toBe("Aino");
});

test("resolveMember returns null when not found", () => {
  expect(resolveMember(profile, "Noone")).toBeNull();
});

test("resolveMember returns null for empty profile", () => {
  const empty: StoredProfile = { ...profile, members: [] };
  expect(resolveMember(empty, "Aino")).toBeNull();
});

test("resolveClub finds by slug", () => {
  const member = profile.members![1]; // Veikko with ppj + topola
  const club = resolveClub(member, "ppj");
  expect(club?.memberId).toBe("100003");
});

test("resolveClub finds by full URL", () => {
  const member = profile.members![1];
  const club = resolveClub(member, "https://ppj.myclub.fi");
  expect(club?.memberId).toBe("100003");
});

test("resolveClub finds case-insensitively", () => {
  const member = profile.members![1];
  const club = resolveClub(member, "PPJ");
  expect(club?.memberId).toBe("100003");
});

test("resolveClub returns null when not found", () => {
  const member = profile.members![0]; // Aino, only topola
  expect(resolveClub(member, "ppj")).toBeNull();
});

test("resolveClub returns first club when no hint and single club", () => {
  const member = profile.members![0]; // Aino, only topola
  const club = resolveClub(member, "");
  expect(club?.memberId).toBe("100001");
});

test("resolveAllMemberClubs returns all (member, club) pairs", () => {
  const pairs = resolveAllMemberClubs(profile);
  expect(pairs).toHaveLength(5); // 1+2+2
  expect(pairs.map((p) => p.member.name)).toEqual([
    "Aino",
    "Veikko",
    "Veikko",
    "Onni",
    "Onni",
  ]);
});

test("resolveAllMemberClubs returns empty for no members", () => {
  const empty: StoredProfile = { ...profile, members: [] };
  expect(resolveAllMemberClubs(empty)).toHaveLength(0);
});
