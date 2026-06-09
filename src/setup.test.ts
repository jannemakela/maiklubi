import { test, expect, describe } from "vitest";
import { clubsToMembers } from "./setup.js";

describe("clubsToMembers", () => {
  test("inverts clubs→members into members→clubs", () => {
    const clubs = [
      { url: "https://club-a.myclub.fi", name: "Club A", members: [
        { id: "1", name: "Aino" },
        { id: "2", name: "Veikko" },
      ]},
      { url: "https://club-b.myclub.fi", name: "Club B", members: [
        { id: "3", name: "Veikko" },
        { id: "4", name: "Onni" },
      ]},
    ];
    const members = clubsToMembers(clubs);

    expect(members.map((m) => m.name).sort()).toEqual(["Aino", "Onni", "Veikko"]);

    const veikko = members.find((m) => m.name === "Veikko")!;
    expect(veikko.clubs).toEqual([
      { clubUrl: "https://club-a.myclub.fi", memberId: "2" },
      { clubUrl: "https://club-b.myclub.fi", memberId: "3" },
    ]);

    const aino = members.find((m) => m.name === "Aino")!;
    expect(aino.clubs).toEqual([{ clubUrl: "https://club-a.myclub.fi", memberId: "1" }]);
  });

  test("returns empty array when there are no clubs", () => {
    expect(clubsToMembers([])).toEqual([]);
  });

  test("a member appearing once has a single club entry", () => {
    const members = clubsToMembers([
      { url: "https://x.myclub.fi", name: "X", members: [{ id: "9", name: "Solo" }] },
    ]);
    expect(members).toEqual([{ name: "Solo", clubs: [{ clubUrl: "https://x.myclub.fi", memberId: "9" }] }]);
  });
});
