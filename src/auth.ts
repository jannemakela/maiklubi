import { loadConfig, getActiveProfile, getProfileCredentials, getCredentialsFromEnv } from "./config.js";
import { MyClubSession } from "./session.js";
import type { StoredProfile } from "./types.js";

/**
 * Build an authenticated session. Prefers MAIKLUBI_EMAIL / MAIKLUBI_PASSWORD
 * env vars, then falls back to the stored config profile.
 */
export async function createSession(): Promise<{ session: MyClubSession; profile: StoredProfile | null }> {
  const envCreds = getCredentialsFromEnv();

  if (envCreds) {
    const session = new MyClubSession();
    await session.login(envCreds.email, envCreds.password);
    return { session, profile: null };
  }

  const config = await loadConfig();
  const profile = getActiveProfile(config);
  if (!profile) {
    console.error("No credentials found. Set MAIKLUBI_EMAIL and MAIKLUBI_PASSWORD, or run maiklubi to set up.");
    process.exit(1);
  }
  const creds = getProfileCredentials(profile);
  if (!creds) {
    console.error("Stored credentials are corrupted. Run `maiklubi login` to re-authenticate.");
    process.exit(1);
  }
  const session = new MyClubSession();
  await session.login(creds.email, creds.password);
  return { session, profile };
}
