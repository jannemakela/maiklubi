import { input, password as passwordPrompt, select } from "@inquirer/prompts";
import { MyClubSession } from "./session.js";
import { parseClubsFromHome } from "./parsers.js";
import { loadConfig, saveConfig, obfuscateSecret } from "./config.js";
import { orCancel, CANCELLED } from "./prompts.js";
import type { StoredProfile, MemberConfig } from "./types.js";

type DiscoveredClub = { url: string; name: string; members: { id: string; name: string }[] };

/**
 * Invert the home-page club listing (clubs → their members) into maiklubi's
 * member-centric config shape (members → the clubs they belong to). Pure.
 */
export function clubsToMembers(clubs: DiscoveredClub[]): MemberConfig[] {
  const byMember = new Map<string, MemberConfig>();
  for (const club of clubs) {
    for (const m of club.members) {
      if (!byMember.has(m.name)) byMember.set(m.name, { name: m.name, clubs: [] });
      byMember.get(m.name)!.clubs.push({ clubUrl: club.url, memberId: m.id });
    }
  }
  return [...byMember.values()];
}

/**
 * Login entry point: if there are saved profiles, let the user pick one (or
 * "Use a new login"); otherwise go straight to a fresh login. Returns the
 * active profile, or null if the user cancels.
 */
export async function chooseOrCreateProfile(): Promise<StoredProfile | null> {
  const config = await loadConfig();
  if (config.profiles.length === 0) {
    return setupAccount();
  }

  const choices = [
    ...config.profiles.map((p) => ({
      value: p.id,
      name: p.members?.length
        ? `${p.email}  (${p.members.map((m) => m.name).join(", ")})`
        : p.email,
    })),
    { value: "__new__", name: "Käytä uutta kirjautumista" },
  ];

  const choice = await orCancel(
    select({ message: "Valitse tallennettu tili tai luo uusi:", choices })
  );
  if (choice === CANCELLED) return null;
  if (choice === "__new__") return setupAccount();

  // Existing profile chosen → make it the active one.
  const profile = config.profiles.find((p) => p.id === choice)!;
  config.lastProfileId = profile.id;
  await saveConfig(config);
  console.log(`\n✓ Käytetään tiliä ${profile.email}\n`);
  return profile;
}

/**
 * Interactive first-run login: prompt for myclub.fi credentials, log in,
 * auto-discover members/clubs, and save them locally. Returns the saved
 * profile, or null if the user cancels.
 */
export async function setupAccount(nowIso: string = new Date().toISOString()): Promise<StoredProfile | null> {
  console.log("\nTervetuloa maiklubiin! Kirjaudu myclub.fi-tunnuksillasi.");
  console.log("(Tunnukset tallennetaan vain omalle koneellesi, ~/.config/maiklubi/config.json)\n");

  let session: MyClubSession;
  let email: string;
  let pw: string;

  // Retry the credentials until login succeeds or the user aborts (Esc).
  while (true) {
    const e = await orCancel(input({ message: "myclub.fi-sähköposti:" }));
    if (e === CANCELLED) return null;
    const p = await orCancel(passwordPrompt({ message: "Salasana:", mask: "•" }));
    if (p === CANCELLED) return null;
    email = e.trim();
    pw = p;

    process.stdout.write("Kirjaudutaan...");
    session = new MyClubSession();
    try {
      await session.login(email, pw);
      console.log(" ok.");
      break;
    } catch (err) {
      console.log(" epäonnistui.");
      console.error(`  ${err instanceof Error ? err.message : String(err)} — yritä uudelleen.\n`);
    }
  }

  // Discover the family's members & clubs from the home page.
  process.stdout.write("Haetaan jäsenet ja seurat...");
  const html = await session.fetchPage("https://id.myclub.fi/flow/home");
  const { clubs } = parseClubsFromHome(html);
  const members = clubsToMembers(clubs);
  console.log(" valmis.");

  if (members.length === 0) {
    console.error("  Tileiltä ei löytynyt jäseniä. Tarkista tunnukset ja yritä uudelleen.");
    return null;
  }

  const profile: StoredProfile = {
    id: email,
    email,
    passwordObfuscated: obfuscateSecret(pw),
    members,
    lastUsedAt: nowIso,
  };

  const config = await loadConfig();
  config.profiles = config.profiles.filter((p) => p.id !== profile.id);
  config.profiles.push(profile);
  config.lastProfileId = profile.id;
  await saveConfig(config);

  console.log(`\n✓ Tallennettu ${members.length} jäsentä:`);
  for (const m of members) {
    const clubList = m.clubs.map((c) => {
      try { return new URL(c.clubUrl).hostname.split(".")[0]; } catch { return c.clubUrl; }
    }).join(", ");
    console.log(`  ${m.name}  (${clubList})`);
  }
  console.log("");
  return profile;
}
