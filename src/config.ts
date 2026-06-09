import { readFile, writeFile, mkdir, rm } from "fs/promises";
import { dirname, resolve } from "path";
import { homedir } from "os";
import type { MaiklubiConfig, StoredProfile } from "./types.js";

const SALT = "maiklubi::";

export function getConfigPath(): string {
  const override = process.env["MAIKLUBI_CONFIG_PATH"];
  if (override) return resolve(override);
  const xdg = process.env["XDG_CONFIG_HOME"];
  const base = xdg ? resolve(xdg) : resolve(homedir(), ".config");
  return resolve(base, "maiklubi", "config.json");
}

export async function loadConfig(): Promise<MaiklubiConfig> {
  const path = getConfigPath();
  try {
    const raw = await readFile(path, "utf-8");
    const data = JSON.parse(raw) as MaiklubiConfig;
    if (!data.profiles) return { profiles: [] };
    return data;
  } catch (err) {
    // Missing file = not logged in yet (expected). Anything else (e.g. corrupt
    // JSON) is worth surfacing so it isn't mistaken for "logged out".
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
      console.error(`Warning: could not read config at ${path}: ${err instanceof Error ? err.message : String(err)}`);
    }
    return { profiles: [] };
  }
}

export async function saveConfig(config: MaiklubiConfig): Promise<void> {
  const path = getConfigPath();
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, JSON.stringify(config, null, 2) + "\n", {
    encoding: "utf-8",
    mode: 0o600,
  });
}

export function obfuscateSecret(value: string): string {
  return Buffer.from(SALT + value, "utf-8").toString("base64");
}

export function revealSecret(value: string): string | null {
  try {
    const decoded = Buffer.from(value, "base64").toString("utf-8");
    if (!decoded.startsWith(SALT)) return null;
    return decoded.slice(SALT.length);
  } catch {
    return null;
  }
}

export function getActiveProfile(config: MaiklubiConfig): StoredProfile | null {
  if (config.profiles.length === 0) return null;
  if (config.lastProfileId) {
    return config.profiles.find((p) => p.id === config.lastProfileId) ?? config.profiles[0];
  }
  return config.profiles[0];
}

export function getProfileCredentials(
  profile: StoredProfile
): { email: string; password: string } | null {
  const password = revealSecret(profile.passwordObfuscated);
  if (!password) return null;
  return { email: profile.email, password };
}

export async function clearConfig(): Promise<void> {
  await rm(getConfigPath(), { force: true });
}

export function getCredentialsFromEnv(): { email: string; password: string } | null {
  const email = process.env["MAIKLUBI_EMAIL"];
  const password = process.env["MAIKLUBI_PASSWORD"];
  if (!email || !password) return null;
  return { email, password };
}
