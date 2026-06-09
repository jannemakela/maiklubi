import { test, expect } from "vitest";
import { listUsers } from "./users.js";
import type { StoredProfile } from "./types.js";

const emptyProfile: StoredProfile = {
  id: "test@example.com",
  email: "test@example.com",
  passwordObfuscated: "",
  lastUsedAt: "2026-06-05T00:00:00.000Z",
};

test("listUsers returns empty array when no members configured", () => {
  expect(listUsers(emptyProfile)).toEqual([]);
});

test("listUsers returns members with their clubs", () => {
  const profile: StoredProfile = {
    ...emptyProfile,
    members: [
      {
        name: "Aino",
        clubs: [{ clubUrl: "https://topola.myclub.fi", memberId: "100001" }],
      },
      {
        name: "Onni",
        clubs: [
          { clubUrl: "https://topola.myclub.fi", memberId: "100006" },
          { clubUrl: "https://ppj.myclub.fi", memberId: "100005" },
        ],
      },
    ],
  };
  const users = listUsers(profile);
  expect(users).toHaveLength(2);
  expect(users[0].name).toBe("Aino");
  expect(users[0].clubs).toHaveLength(1);
  expect(users[1].name).toBe("Onni");
  expect(users[1].clubs).toHaveLength(2);
});

test("listUsers includes Aino, Veikko, Onni across ToPoLa and PPJ", () => {
  const profile: StoredProfile = {
    ...emptyProfile,
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
  const users = listUsers(profile);
  expect(users).toHaveLength(3);

  const names = users.map((u) => u.name);
  expect(names).toContain("Aino");
  expect(names).toContain("Veikko");
  expect(names).toContain("Onni");

  const onni = users.find((u) => u.name === "Onni")!;
  const clubUrls = onni.clubs.map((c) => c.clubUrl);
  expect(clubUrls).toContain("https://ppj.myclub.fi");
  expect(clubUrls).toContain("https://topola.myclub.fi");

  const aino = users.find((u) => u.name === "Aino")!;
  expect(aino.clubs.map((c) => c.clubUrl)).toContain("https://topola.myclub.fi");
});

test("listUsers club entries have clubUrl and memberId", () => {
  const profile: StoredProfile = {
    ...emptyProfile,
    members: [
      {
        name: "Veikko",
        clubs: [{ clubUrl: "https://ppj.myclub.fi", memberId: "100003" }],
      },
    ],
  };
  const users = listUsers(profile);
  expect(users[0].clubs[0]).toMatchObject({
    clubUrl: "https://ppj.myclub.fi",
    memberId: "100003",
  });
});
