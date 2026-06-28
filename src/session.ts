import { CookieJar } from "tough-cookie";
import { fetch } from "undici";
import { parseDetailPageIndication, parseIndicationFromToggleJs, parseEventComments, parseEventsList, parseEventTimeDetails, parseEventParticipants, parseCalendarSubscriptions, parseCalendarSubscriptionUrl, parseEventJoinable, parseNotificationDetail } from "./parsers.js";
import { INDICATION_BY_ID, ID_BY_INDICATION } from "./types.js";
import type { Event, EventComment, EventParticipant, CalendarSubscription, Indication, NotificationDetail } from "./types.js";

const ID_BASE = "https://id.myclub.fi";
const REQUEST_TIMEOUT_MS = 30_000;

function extractMeta(html: string, name: string): string | undefined {
  const m = html.match(new RegExp(`<meta name="${name}" content="([^"]+)"`));
  return m?.[1];
}

/** Ensure a URL targets myclub.fi before we attach the session cookie/CSRF to it. */
function assertMyClubHost(url: string): void {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }
  if (host !== "myclub.fi" && !host.endsWith(".myclub.fi")) {
    throw new Error(`Refusing to send credentials to non-myclub.fi host: ${host}`);
  }
}

export class MyClubSession {
  private jar = new CookieJar();
  private csrfToken = "";
  private loginId = ""; // x-login header: member's internal ID for indications.json

  private async request(
    url: string,
    options: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      followRedirects?: boolean;
    } = {}
  ): Promise<{ status: number; headers: Headers; text: () => Promise<string>; url: string }> {
    const makeHeaders = async (targetUrl: string) => {
      const cookieHeader = await this.jar.getCookieString(targetUrl);
      const h: Record<string, string> = {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "fi,en;q=0.9",
        ...options.headers,
      };
      if (cookieHeader) h["Cookie"] = cookieHeader;
      return h;
    };

    // Use manual redirect handling so we capture Set-Cookie on every hop
    let currentUrl = url;
    let method = options.method ?? "GET";
    let body = options.body;
    let hops = 0;

    while (hops < 10) {
      // Only ever send credentials/cookies to myclub.fi — guards against a
      // tampered config clubUrl or a rogue cross-host redirect.
      assertMyClubHost(currentUrl);
      const response = await fetch(currentUrl, {
        method,
        headers: await makeHeaders(currentUrl),
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      // Store cookies from this response
      const setCookie = response.headers.getSetCookie?.() ?? [];
      for (const cookie of setCookie) {
        await this.jar.setCookie(cookie, currentUrl).catch(() => {});
      }

      // Capture internal member ID from x-login header (present on club-domain responses)
      const xLogin = response.headers.get("x-login");
      if (xLogin) this.loginId = xLogin;

      if (
        options.followRedirects === false ||
        (response.status < 300 || response.status >= 400)
      ) {
        return response as any;
      }

      const location = response.headers.get("location");
      if (!location) return response as any;

      // Resolve relative redirects
      currentUrl = new URL(location, currentUrl).toString();
      method = "GET";
      body = undefined;
      hops++;
    }

    throw new Error("Too many redirects");
  }

  async login(email: string, password: string): Promise<void> {
    // 1. Get login page for CSRF token
    const loginPage = await this.request(`${ID_BASE}/flow/login`);
    const html = await loginPage.text();

    const csrf = extractMeta(html, "csrf-token");
    if (!csrf) throw new Error("Could not find CSRF token on login page");
    this.csrfToken = csrf;

    // 2. Submit credentials
    const body = new URLSearchParams({
      authenticity_token: csrf,
      "user_session[email]": email,
      "user_session[password]": password,
    });

    let loginResp = await this.request(`${ID_BASE}/flow/user_session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: `${ID_BASE}/flow/login`,
      },
      body: body.toString(),
    });

    // Retry once on transient 5xx server errors (server rate-limits rapid logins)
    if (loginResp.status >= 500) {
      await new Promise((r) => setTimeout(r, 3000));
      const retryPage = await this.request(`${ID_BASE}/flow/login`);
      const retryHtml = await retryPage.text();
      const retryCsrf = extractMeta(retryHtml, "csrf-token");
      if (retryCsrf) {
        this.csrfToken = retryCsrf;
        const retryBody = new URLSearchParams({
          authenticity_token: retryCsrf,
          "user_session[email]": email,
          "user_session[password]": password,
        });
        loginResp = await this.request(`${ID_BASE}/flow/user_session`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Referer: `${ID_BASE}/flow/login`,
          },
          body: retryBody.toString(),
        });
      }
    }

    if (loginResp.status >= 500) {
      throw new Error(`Login failed: server error (${loginResp.status})`);
    }

    const loginHtml = await loginResp.text();

    // Check if we're still on the login form (bad credentials)
    const isLoginPage =
      loginHtml.includes('action="/flow/user_session"') ||
      loginHtml.includes('class="user_sessions');
    if (isLoginPage) {
      const error = loginHtml.match(/class="[^"]*alert[^"]*"[^>]*>\s*([^<]{3,200})/)?.[1];
      throw new Error(`Login failed: ${error?.trim() ?? "invalid credentials"}`);
    }

    // Update CSRF if we got a new page
    const newCsrf = extractMeta(loginHtml, "csrf-token");
    if (newCsrf) this.csrfToken = newCsrf;
  }

  async selectAccount(clubUrl: string, memberId: string): Promise<void> {
    const url = `${clubUrl}/flow/select_account?id=${memberId}`;
    const resp = await this.request(url);
    const html = await resp.text();
    const csrf = extractMeta(html, "csrf-token");
    if (csrf) this.csrfToken = csrf;
  }

  async fetchPage(url: string): Promise<string> {
    const resp = await this.request(url);
    const html = await resp.text();
    // Refresh CSRF if present
    const csrf = extractMeta(html, "csrf-token");
    if (csrf) this.csrfToken = csrf;
    return html;
  }

  async fetchAjax(url: string, referer?: string): Promise<{ status: number; text: string }> {
    const resp = await this.request(url, {
      headers: {
        "X-Requested-With": "XMLHttpRequest",
        "X-CSRF-Token": this.csrfToken,
        Accept:
          "text/javascript, application/javascript, application/ecmascript, application/x-ecmascript, */*; q=0.01",
        ...(referer ? { Referer: referer } : {}),
      },
    });
    return { status: resp.status, text: await resp.text() };
  }

  async getEventIndication(
    clubUrl: string,
    eventId: number
  ): Promise<Indication> {
    // Use indications.json when we have the member's internal login ID.
    // The event detail page HTML is aggressively cached server-side and returns stale data.
    if (this.loginId) {
      try {
        const resp = await this.request(`${clubUrl}/flow/events/${eventId}/indications.json`, {
          headers: {
            Accept: "application/json, text/javascript, */*; q=0.01",
            "X-Requested-With": "XMLHttpRequest",
            "X-CSRF-Token": this.csrfToken,
            Referer: `${clubUrl}/flow/`,
          },
        });
        if (resp.status === 200) {
          const json = JSON.parse(await resp.text()) as unknown;
          if (Array.isArray(json)) {
            const entry = (json as Array<{ member_id: number; indication_id: number }>).find(
              (e) => String(e.member_id) === this.loginId
            );
            // Entry not found: member has not responded (no_response)
            return entry ? (INDICATION_BY_ID[entry.indication_id] ?? "no_response") : "no_response";
          }
        }
      } catch {
        // Fall through to detail page fallback
      }
    }
    // Fallback: parse event detail page (may be cached)
    const html = await this.fetchPage(`${clubUrl}/flow/events/${eventId}`);
    return parseDetailPageIndication(html);
  }

  private async sendIndicationToggle(
    clubUrl: string,
    eventId: number,
    param: Indication,
    reason?: string
  ): Promise<Indication> {
    if (param === "no") {
      // "no" (decline) is a two-step: GET /edit?indication=no opens a modal form;
      // the actual state change requires a PATCH to /flow/events/{id} with participation fields.
      return this.sendDecline(clubUrl, eventId, reason);
    }
    // For yes / no_response / maybe: GET edit?indication=X sets state directly.
    // Referer must be the events list page (not the detail page) to match browser behavior.
    const r = await this.fetchAjax(
      `${clubUrl}/flow/events/${eventId}/edit?indication=${param}`,
      `${clubUrl}/flow/`
    );
    if (r.status >= 400) throw new Error(`Indicate failed (${r.status})`);
    // Parse new state from the JS response body (server returns updated button HTML).
    // Falls back to the requested param if body is empty (e.g. browser returned 304 from cache).
    return parseIndicationFromToggleJs(r.text) ?? param;
  }

  private async sendDecline(
    clubUrl: string,
    eventId: number,
    reason?: string
  ): Promise<"no"> {
    // "no" (decline) requires submitting the modal PATCH form:
    //   POST /flow/events/{id} with _method=patch + participation[indication_id]=3
    // The first GET /edit?indication=no only opens the modal, it doesn't change the DB state.
    const body = new URLSearchParams({
      authenticity_token: this.csrfToken,
      _method: "patch",
      "participation[indication_id]": "3",
      "participation[comment]": reason ?? "Muuta ohjelmaa",
      details_open: "value ",
      selected_tab: "",
    });
    const resp = await this.request(`${clubUrl}/flow/events/${eventId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-CSRF-Token": this.csrfToken,
        "X-Requested-With": "XMLHttpRequest",
        Accept: "text/javascript, application/javascript, */*; q=0.01",
        Referer: `${clubUrl}/flow/`,
      },
      body: body.toString(),
    });
    if (resp.status >= 400) throw new Error(`Decline failed (${resp.status})`);
    return "no";
  }

  async indicate(
    clubUrl: string,
    eventId: number,
    targetStatus: Indication,
    reason?: string
  ): Promise<{ ownParticipation: number; indication: Indication }> {
    const currentStatus = await this.getEventIndication(clubUrl, eventId);

    if (currentStatus === targetStatus) {
      return { ownParticipation: ID_BY_INDICATION[currentStatus] ?? 4, indication: currentStatus };
    }

    // Before attempting to change indication, confirm the event is actually
    // joinable. After the registration deadline (or for match-type events) myClub
    // removes the join widget; sending the toggle would silently no-op while
    // appearing to succeed. Fail loudly with a clear reason instead.
    const detailHtml = await this.fetchPage(`${clubUrl}/flow/events/${eventId}`);
    const { joinable, registrationClosed } = parseEventJoinable(detailHtml);
    if (!joinable) {
      throw new Error(
        registrationClosed
          ? "Registration has closed for this event — indication can no longer be changed."
          : "This event is not open for joining (no registration available)."
      );
    }

    await this.sendIndicationToggle(clubUrl, eventId, targetStatus, reason);
    // Read back the actual state: the JS response parse is unreliable for some event types
    // (e.g. camp events return different HTML that contains unrelated btn-success elements).
    const newStatus = await this.getEventIndication(clubUrl, eventId);
    return { ownParticipation: ID_BY_INDICATION[newStatus] ?? 4, indication: newStatus };
  }

  async getEventsList(clubUrl: string, opts: { joinable?: boolean } = {}): Promise<Event[]> {
    const html = await this.fetchPage(`${clubUrl}/flow/`);
    const events = parseEventsList(html);
    // Detail pages give us missing times (clubs without TklCalendar, e.g. PPJ) and,
    // when requested, joinability (only available on the detail page). Fetch in parallel.
    const needDetail = opts.joinable ? events : events.filter((e) => !e.starts_at);
    if (needDetail.length > 0) {
      await Promise.all(
        needDetail.map(async (event) => {
          try {
            const detailHtml = await this.fetchPage(`${clubUrl}/flow/events/${event.id}`);
            if (!event.starts_at) {
              const times = parseEventTimeDetails(detailHtml);
              if (times.starts_at) event.starts_at = times.starts_at;
              if (times.ends_at) event.ends_at = times.ends_at;
            }
            if (opts.joinable) {
              const j = parseEventJoinable(detailHtml);
              event.joinable = j.joinable;
              event.registrationClosed = j.registrationClosed;
            }
          } catch {
            // skip — event stays without time/joinability
          }
        })
      );
    }
    return events;
  }

  async getEventComments(clubUrl: string, eventId: number): Promise<EventComment[]> {
    const html = await this.fetchPage(`${clubUrl}/flow/events/${eventId}`);
    return parseEventComments(html);
  }

  async getNotification(clubUrl: string, notificationId: number): Promise<NotificationDetail | null> {
    const html = await this.fetchPage(`${clubUrl}/flow/notifications/${notificationId}`);
    return parseNotificationDetail(html);
  }

  getLoginId(): string {
    return this.loginId;
  }

  async getEventParticipants(clubUrl: string, eventId: number): Promise<EventParticipant[]> {
    const html = await this.fetchPage(`${clubUrl}/flow/events/${eventId}`);
    return parseEventParticipants(html);
  }

  async listCalendarSubscriptions(): Promise<CalendarSubscription[]> {
    const html = await this.fetchPage("https://id.myclub.fi/flow/calendar_subscriptions");
    return parseCalendarSubscriptions(html);
  }

  async getCalendarSubscriptionUrl(subscriptionId: number): Promise<string | null> {
    const r = await this.fetchAjax(
      `https://id.myclub.fi/flow/calendar_subscriptions/${subscriptionId}/copy_link`,
      "https://id.myclub.fi/flow/calendar_subscriptions"
    );
    return parseCalendarSubscriptionUrl(r.text);
  }

  async createCalendarSubscription(
    name: string,
    memberInternalIds: string[],
    indication: string = ""
  ): Promise<{ id: number; webcalUrl: string }> {
    // Snapshot existing IDs before creating
    const beforeHtml = await this.fetchPage("https://id.myclub.fi/flow/calendar_subscriptions");
    const existingIds = new Set(parseCalendarSubscriptions(beforeHtml).map((s) => s.id));

    // Get fresh CSRF from the new-subscription form
    await this.fetchPage("https://id.myclub.fi/flow/calendar_subscriptions/new");

    const body = new URLSearchParams({
      authenticity_token: this.csrfToken,
      "calendar_subscription[name]": name,
      filter_by_member_ids: "1",
      "calendar_subscription[indication]": indication,
      commit: "Luo",
    });
    for (const id of memberInternalIds) {
      body.append("calendar_subscription[member_ids][]", id);
    }

    const resp = await this.request("https://id.myclub.fi/flow/calendar_subscriptions", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: "https://id.myclub.fi/flow/calendar_subscriptions/new",
      },
      body: body.toString(),
    });

    const afterHtml = await resp.text();
    const allSubs = parseCalendarSubscriptions(afterHtml);
    const newSub = allSubs.find((s) => !existingIds.has(s.id));
    if (!newSub) throw new Error(`Could not find newly created subscription in list`);

    const webcalUrl = await this.getCalendarSubscriptionUrl(newSub.id);
    if (!webcalUrl) throw new Error("Could not get webcal URL for new subscription");

    return { id: newSub.id, webcalUrl };
  }
}
