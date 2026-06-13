export type Indication = "yes" | "no" | "no_response" | "maybe";

/** myClub's numeric indication ids ↔ our string values (one source of truth). */
export const INDICATION_BY_ID: Record<number, Indication> = {
  1: "yes",
  2: "maybe",
  3: "no",
  4: "no_response",
};
export const ID_BY_INDICATION: Record<Indication, number> = {
  yes: 1,
  maybe: 2,
  no: 3,
  no_response: 4,
};

export interface MemberClub {
  clubUrl: string;
  memberId: string;
}

export interface MemberConfig {
  name: string;
  clubs: MemberClub[];
}

export interface StoredProfile {
  id: string;
  email: string;
  passwordObfuscated: string;
  members?: MemberConfig[];
  lastMemberName?: string | null;
  lastUsedAt: string;
}

export interface MaiklubiConfig {
  profiles: StoredProfile[];
  lastProfileId?: string | null;
}

export interface Event {
  id: number;
  name: string;
  group: string;
  venue: string;
  month: string;
  event_category: string;
  starts_at?: string; // local-time ISO: "2026-06-17T15:00:00" (from TklCalendar react-props)
  ends_at?: string;   // local-time ISO: "2026-06-17T16:45:00"
  joinable?: boolean;           // false once the join widget is gone (deadline passed / match event)
  registrationClosed?: boolean; // true specifically when "Ilmoittautuminen päättynyt"
}

export interface EventComment {
  id: number;
  content: string;
  created_at: string;
  creator: {
    id: number;
    name: string;
  };
}

export interface Invoice {
  id: string;
  due_date: string;
  amount: string;
  title: string;
  reference?: string;
  virtual_barcode?: string;
  status: "open" | "paid";
}

export interface Notification {
  id?: string;
  title: string;
  url?: string;
  group?: string;
}

export interface NotificationDetail {
  title: string;
  sender?: string;
  timestamp?: string;
  content: string;
}

export interface EventParticipant {
  member_id: number;
  name: string;
  indication: Indication;
  role?: string; // e.g. "Pelaaja", "Valmentaja"
}

export interface CalendarSubscription {
  id: number;
  name: string;
}
