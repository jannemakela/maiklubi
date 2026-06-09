import { test, expect, afterEach } from "vitest";
import { rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  loadConfig,
  saveConfig,
  obfuscateSecret,
  revealSecret,
} from "./config.js";

const tmpPath = join(tmpdir(), `maiklubi-test-${process.pid}.json`);

afterEach(async () => {
  delete process.env["MAIKLUBI_CONFIG_PATH"];
  await rm(tmpPath, { force: true });
});

test("obfuscateSecret / revealSecret roundtrip", () => {
  const secret = "myP@ssw0rd!";
  expect(revealSecret(obfuscateSecret(secret))).toBe(secret);
});

test("revealSecret returns null for wrong prefix", () => {
  const wrongPrefix = Buffer.from("wrong::pass").toString("base64");
  expect(revealSecret(wrongPrefix)).toBeNull();
});

test("revealSecret returns null for non-base64 garbage", () => {
  expect(revealSecret("not-valid-base64!!")).toBeNull();
});

test("loadConfig returns empty profiles when file does not exist", async () => {
  process.env["MAIKLUBI_CONFIG_PATH"] = join(tmpdir(), "no-such-file-maiklubi.json");
  const cfg = await loadConfig();
  expect(cfg.profiles).toEqual([]);
});

test("saveConfig + loadConfig roundtrip preserves profile and members", async () => {
  process.env["MAIKLUBI_CONFIG_PATH"] = tmpPath;
  await saveConfig({
    profiles: [
      {
        id: "test@example.com",
        email: "test@example.com",
        passwordObfuscated: obfuscateSecret("secret"),
        members: [
          {
            name: "Aino",
            clubs: [{ clubUrl: "https://topola.myclub.fi", memberId: "100001" }],
          },
        ],
        lastUsedAt: "2026-06-05T00:00:00.000Z",
      },
    ],
  });
  const cfg = await loadConfig();
  expect(cfg.profiles).toHaveLength(1);
  const p = cfg.profiles[0];
  expect(p.email).toBe("test@example.com");
  expect(revealSecret(p.passwordObfuscated)).toBe("secret");
  expect(p.members).toHaveLength(1);
  expect(p.members![0].name).toBe("Aino");
  expect(p.members![0].clubs[0].memberId).toBe("100001");
});

test("getConfigPath respects MAIKLUBI_CONFIG_PATH env var", async () => {
  process.env["MAIKLUBI_CONFIG_PATH"] = tmpPath;
  const { getConfigPath } = await import("./config.js");
  expect(getConfigPath()).toBe(tmpPath);
});
