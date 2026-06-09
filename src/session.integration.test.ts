import { test, expect, beforeAll, describe } from "vitest";
import { MyClubSession } from "./session.js";

// Run with real credentials AND test coordinates supplied via env vars — nothing
// account-specific is hardcoded here, so the public source contains no personal data.
//
//   MAIKLUBI_INTEGRATION=1 \
//   MAIKLUBI_EMAIL=you@example.fi MAIKLUBI_PASSWORD=... \
//   MAIKLUBI_TEST_CLUB_URL=https://yourclub.myclub.fi \
//   MAIKLUBI_TEST_MEMBER_ID=123456 \
//   MAIKLUBI_TEST_EVENT_ID=7654321 \
//   MAIKLUBI_TEST_EXPECTED_IDS=123456,234567 \   # optional: IDs expected on the home page
//   npm run test:integration
//
// Tests skip automatically when the required env vars are absent.

const run = process.env["MAIKLUBI_INTEGRATION"] === "1";

const EMAIL = process.env["MAIKLUBI_EMAIL"] ?? "";
const PASSWORD = process.env["MAIKLUBI_PASSWORD"] ?? "";
const CLUB_URL = process.env["MAIKLUBI_TEST_CLUB_URL"] ?? "";
const MEMBER_ID = process.env["MAIKLUBI_TEST_MEMBER_ID"] ?? "";
const EVENT_ID = Number(process.env["MAIKLUBI_TEST_EVENT_ID"] ?? "0");
const EXPECTED_IDS = (process.env["MAIKLUBI_TEST_EXPECTED_IDS"] ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const haveCreds = run && EMAIL && PASSWORD;
const haveCoords = haveCreds && CLUB_URL && MEMBER_ID && EVENT_ID > 0;

describe.skipIf(!haveCreds)("myclub.fi live session", () => {
  let session: MyClubSession;
  let homeHtml: string;

  beforeAll(async () => {
    session = new MyClubSession();
    await session.login(EMAIL, PASSWORD);
    homeHtml = await session.fetchPage("https://id.myclub.fi/flow/home");
  }, 30_000);

  test("login succeeds with valid credentials", () => {
    expect(session).toBeDefined();
  });

  test("home page is authenticated (homes show class)", () => {
    expect(homeHtml).toMatch(/homes show production/);
  });

  test.skipIf(EXPECTED_IDS.length === 0)(
    "home page contains the expected member IDs (from MAIKLUBI_TEST_EXPECTED_IDS)",
    () => {
      for (const id of EXPECTED_IDS) {
        expect(homeHtml).toContain(id);
      }
    }
  );
});

// ─── Reading verification ─────────────────────────────────────────────────────
describe.skipIf(!haveCoords)("indication reading — test member/event", () => {
  let readSession: MyClubSession;

  beforeAll(async () => {
    readSession = new MyClubSession();
    await readSession.login(EMAIL, PASSWORD);
    await readSession.selectAccount(CLUB_URL, MEMBER_ID);
  }, 30_000);

  test("DIAGNOSTIC: what does the event detail page HTML actually contain?", async () => {
    const html = await readSession.fetchPage(`${CLUB_URL}/flow/events/${EVENT_ID}`);

    const title = html.match(/<title>([^<]+)<\/title>/)?.[1] ?? "(no title)";
    const isLogin = html.includes('action="/flow/user_session"');
    console.log(`\n  Page title: ${title}`);
    console.log(`  Is login page: ${isLogin}`);
    console.log(`  HTML length: ${html.length}`);

    const allIndications = [...html.matchAll(/data-indication="([^"]+)"/g)].map((m) => m[1]);
    console.log(`  data-indication values found: ${JSON.stringify(allIndications)}`);

    const idx = html.indexOf("indication");
    if (idx !== -1) {
      console.log(`  Context around first "indication":\n${"─".repeat(60)}`);
      console.log(html.slice(Math.max(0, idx - 80), idx + 220));
      console.log("─".repeat(60));
    } else {
      console.log(`  "indication" NOT found anywhere in HTML`);
      console.log(`  First 400 chars:\n${html.slice(0, 400)}`);
    }

    expect(html.length).toBeGreaterThan(0);
  }, 30_000);

  test("getEventIndication returns a valid state for the test event", async () => {
    const ind = await readSession.getEventIndication(CLUB_URL, EVENT_ID);
    console.log(`  Event ${EVENT_ID}: "${ind}"`);
    expect(["yes", "no", "no_response", "maybe"]).toContain(ind);
  }, 30_000);
});

// ─── Indication write cycle ────────────────────────────────────────────────────
// Toggles RSVP through every state, then RESTORES the original — leaves no change.
describe.skipIf(!haveCoords)("event indication — write cycle (restores original)", () => {
  let indicationSession: MyClubSession;
  let originalIndication: "yes" | "no" | "no_response" | "maybe";

  beforeAll(async () => {
    indicationSession = new MyClubSession();
    await indicationSession.login(EMAIL, PASSWORD);
    await indicationSession.selectAccount(CLUB_URL, MEMBER_ID);
    originalIndication = await indicationSession.getEventIndication(CLUB_URL, EVENT_ID);
  }, 30_000);

  test("can read current indication from event detail page", () => {
    expect(["yes", "no", "no_response", "maybe"]).toContain(originalIndication);
  });

  test("no_response → yes (join): verifies via detail page + restores", async () => {
    await indicationSession.indicate(CLUB_URL, EVENT_ID, "no_response");
    const result = await indicationSession.indicate(CLUB_URL, EVENT_ID, "yes");
    expect(result.indication).toBe("yes");
    expect(result.ownParticipation).toBe(1);
    await indicationSession.indicate(CLUB_URL, EVENT_ID, originalIndication);
    expect(await indicationSession.getEventIndication(CLUB_URL, EVENT_ID)).toBe(originalIndication);
  }, 60_000);

  test("yes → no_response (cancel join): verifies + restores", async () => {
    await indicationSession.indicate(CLUB_URL, EVENT_ID, "yes");
    const result = await indicationSession.indicate(CLUB_URL, EVENT_ID, "no_response");
    expect(result.indication).toBe("no_response");
    expect(result.ownParticipation).toBe(4);
    await indicationSession.indicate(CLUB_URL, EVENT_ID, originalIndication);
  }, 60_000);

  test("no_response → no (decline): verifies + restores", async () => {
    await indicationSession.indicate(CLUB_URL, EVENT_ID, "no_response");
    const result = await indicationSession.indicate(CLUB_URL, EVENT_ID, "no");
    expect(result.indication).toBe("no");
    expect(result.ownParticipation).toBe(3);
    await indicationSession.indicate(CLUB_URL, EVENT_ID, originalIndication);
    expect(await indicationSession.getEventIndication(CLUB_URL, EVENT_ID)).toBe(originalIndication);
  }, 60_000);

  test("yes → no (decline from joined): verifies + restores", async () => {
    await indicationSession.indicate(CLUB_URL, EVENT_ID, "yes");
    const result = await indicationSession.indicate(CLUB_URL, EVENT_ID, "no");
    expect(result.indication).toBe("no");
    await indicationSession.indicate(CLUB_URL, EVENT_ID, originalIndication);
  }, 60_000);

  test("full cycle no_response → yes → no → no_response — all states reachable", async () => {
    await indicationSession.indicate(CLUB_URL, EVENT_ID, "no_response");
    expect(await indicationSession.getEventIndication(CLUB_URL, EVENT_ID)).toBe("no_response");

    await indicationSession.indicate(CLUB_URL, EVENT_ID, "yes");
    expect(await indicationSession.getEventIndication(CLUB_URL, EVENT_ID)).toBe("yes");

    await indicationSession.indicate(CLUB_URL, EVENT_ID, "no");
    expect(await indicationSession.getEventIndication(CLUB_URL, EVENT_ID)).toBe("no");

    await indicationSession.indicate(CLUB_URL, EVENT_ID, "no_response");
    expect(await indicationSession.getEventIndication(CLUB_URL, EVENT_ID)).toBe("no_response");

    await indicationSession.indicate(CLUB_URL, EVENT_ID, originalIndication);
  }, 90_000);
});
