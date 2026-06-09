# Changelog

## 1.2.0 — 2026-06-09

### Added
- **Interactive login.** Running `maiklubi` on first run (or `maiklubi login`) now prompts for your myclub.fi email + password, logs in, auto-discovers your family's members and clubs, and saves them — no manual config or env vars needed.
- **Profile picker.** `maiklubi login` lists your saved accounts and lets you switch between them or "Use a new login" (multiple myclub.fi accounts supported).

### Changed
- `engines.node` corrected to `>=20.17.0` to match the real requirement of the `@inquirer` dependency (was inaccurately `>=18`).
- Network requests now time out after 30s (no more indefinite hangs on a stalled connection).
- CLI command output is consistently English (invoice "due"/"paid", participant statuses); the interactive menu stays Finnish.
- Internal cleanup: removed ~200 lines of dead code, de-duplicated `decodeEntities` and the indication id↔string map, introduced a single `Indication` type, and factored out helpers in the CLI dispatcher. No behaviour change.

### Fixed
- `summary` no longer lists past events and uses a local-time (not UTC) date window, so "next N days" is correct.
- Hardened `formatMonth` against missing input.

## 1.0.0 — 2026-06-09

First stable public release.

### Added
- Brand assets: app/favicon icon, shield nav logo, and a 1200×630 social (OG) image.
- Light, teal-themed homepage with a real-example chat, AI-usage guide, and FAQ.

## 0.5.0 — 2026-06-08

### Changed
- **Renamed the project from `mai-club` to `maiklubi`.** Binary, package, env-var prefix (`MAIKLUBI_*`), and config dir (`~/.config/maiklubi/`) all changed. Upstream service references to myclub.fi are unchanged.
- Split the monolithic `index.ts` into focused modules: `auth`, `commands`, `menu`, `usage`, `prompts`.
- Extracted a single `orCancel()` prompt helper, removing ~10 copies of the Esc/Ctrl-C handling boilerplate.

### Added
- `LICENSE` (MIT) and full `package.json` metadata (`repository`, `engines`, `files`, `keywords`, …).

### Fixed
- Docs no longer list a non-existent `invoices paid` command (`invoices list` returns both open and paid).
- Removed personal data from test fixtures and the homepage; integration test reads live-account coordinates from env vars.

## 0.4.0 — 2026-06-07

### Added
- `--start YYYY-MM-DD` and `--end YYYY-MM-DD` flags for `events list` — date range filtering
- Interactive calendar wizard: step-by-step selection of person, hobby/club, and event filter (all vs. only attending)
- Calendar moved to top-level interactive menu (no longer requires member context first)
- Homepage at `docs/index.html`

### Fixed
- Open invoices not showing — myclub.fi uses a card layout for open invoices (not a table); parser now handles both
- Notifications showing navigation links instead of actual announcements — parser now targets `h3.notification-subject`
- `&euro;` entity not decoded in invoice amounts

## 0.3.0 — 2026-06-07

### Added
- `maiklubi summary` command — single call returning upcoming events (with RSVP status), open invoices, and recent notifications. Accepts `--days` (default 14) and `--all-members`. The recommended entry point for AI agents.
- `maiklubi version` — prints current CLI version; supports `--json`
- `maiklubi update` — self-update via npm
- Skills integration — `skills/maiklubi/SKILL.md` and `skills.json` compatible with the vercel-labs Skills CLI. AI agents can discover and invoke maiklubi as a named skill.
- `--days <n>` flag for `summary` command

## 0.2.0 — 2026-06-05

### Added
- `maiklubi events participants` — list all participants of an event grouped by RSVP status (yes / maybe / no / no_response), with roles (Pelaaja, Valmentaja, etc.)
- `maiklubi calendar list` — list existing webcal calendar subscriptions
- `maiklubi calendar create` — create a new calendar subscription and return the `webcal://` URL; supports `--indication yes` to filter to attended events only
- `--with-participants` flag on `maiklubi events list` — fetches and shows participants inline for events the member is attending
- Indication status shown on `maiklubi events list` (✓ / ✗ / —)
- `EventParticipant` and `CalendarSubscription` types

### Fixed
- Navigation crash on Escape / back in interactive mode (ExitPromptError handling)
- PPJ events missing dates — fallback to per-event detail page parsing when TklCalendar props are absent

## 0.1.0 — 2026-05-01

### Added
- Initial release
- Interactive mode with member/club/action selection
- `maiklubi events list` — upcoming events per member/club
- `maiklubi events indicate` — RSVP to an event (yes / no / no_response / maybe)
- `maiklubi invoices list` and `maiklubi invoices paid` — open and paid invoices
- `maiklubi notifications list` — club notifications
- `maiklubi accounts list` — all club memberships from myclub.fi
- `maiklubi users list` — configured family members
- `maiklubi config clear` — remove stored credentials
- `--json` flag on all commands for AI agent integration
- `--all-members` flag to run for every configured member/club pair
- Full Vitest test suite (parsers, args, resolve, config, interactive navigation)
- Integration test suite against live myclub.fi (opt-in via `MAIKLUBI_INTEGRATION=1`)
