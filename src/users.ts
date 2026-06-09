import type { StoredProfile, MemberConfig } from "./types.js";

export function listUsers(profile: StoredProfile): MemberConfig[] {
  return profile.members ?? [];
}
