import { test, expect } from "vitest";
import { parseArgs } from "./args.js";

test("parses simple command and subcommand", () => {
  const r = parseArgs(["users", "list"]);
  expect(r.command).toBe("users");
  expect(r.subcommand).toBe("list");
});

test("parses --json flag", () => {
  const r = parseArgs(["events", "list", "--json"]);
  expect(r.flags.json).toBe(true);
});

test("parses --member flag", () => {
  const r = parseArgs(["events", "list", "--member", "Aino"]);
  expect(r.flags.member).toBe("Aino");
});

test("parses --club flag", () => {
  const r = parseArgs(["events", "list", "--club", "ppj"]);
  expect(r.flags.club).toBe("ppj");
});

test("parses --all-members flag", () => {
  const r = parseArgs(["events", "list", "--all-members"]);
  expect(r.flags.allMembers).toBe(true);
});

test("parses --limit flag as number", () => {
  const r = parseArgs(["notifications", "list", "--limit", "5"]);
  expect(r.flags.limit).toBe(5);
});

test("parses combined flags", () => {
  const r = parseArgs(["invoices", "paid", "--member", "Onni", "--club", "ppj", "--json"]);
  expect(r.command).toBe("invoices");
  expect(r.subcommand).toBe("paid");
  expect(r.flags.member).toBe("Onni");
  expect(r.flags.club).toBe("ppj");
  expect(r.flags.json).toBe(true);
});

test("handles missing subcommand", () => {
  const r = parseArgs(["users"]);
  expect(r.command).toBe("users");
  expect(r.subcommand).toBeUndefined();
});

test("handles empty args", () => {
  const r = parseArgs([]);
  expect(r.command).toBeUndefined();
  expect(r.subcommand).toBeUndefined();
});

test("subcommand starting with -- is treated as flag not subcommand", () => {
  const r = parseArgs(["users", "--json"]);
  expect(r.subcommand).toBeUndefined();
  expect(r.flags.json).toBe(true);
});

test("parses --status flag for event indication", () => {
  const r = parseArgs(["events", "indicate", "--member", "Aino", "--id", "10759871", "--status", "yes"]);
  expect(r.command).toBe("events");
  expect(r.subcommand).toBe("indicate");
  expect(r.flags.member).toBe("Aino");
  expect(r.flags.id).toBe("10759871");
  expect(r.flags.status).toBe("yes");
});

test("parses --status no", () => {
  const r = parseArgs(["events", "indicate", "--status", "no"]);
  expect(r.flags.status).toBe("no");
});

test("parses --start flag", () => {
  const r = parseArgs(["events", "list", "--start", "2026-06-01"]);
  expect(r.flags.start).toBe("2026-06-01");
});

test("parses --end flag", () => {
  const r = parseArgs(["events", "list", "--end", "2026-06-30"]);
  expect(r.flags.end).toBe("2026-06-30");
});

test("parses --start and --end together", () => {
  const r = parseArgs(["events", "list", "--start", "2026-06-01", "--end", "2026-06-30"]);
  expect(r.flags.start).toBe("2026-06-01");
  expect(r.flags.end).toBe("2026-06-30");
});

test("parses --reason flag", () => {
  const r = parseArgs(["events", "indicate", "--member", "Aino", "--id", "123", "--status", "no", "--reason", "Sairas"]);
  expect(r.flags.reason).toBe("Sairas");
});

test("--reason with multi-word value", () => {
  const r = parseArgs(["events", "indicate", "--status", "no", "--reason", "Meillä on matka"]);
  expect(r.flags.reason).toBe("Meillä on matka");
});

test("--reason is undefined when not provided", () => {
  const r = parseArgs(["events", "indicate", "--status", "no"]);
  expect(r.flags.reason).toBeUndefined();
});
