# maiklubi

CLI for [myclub.fi](https://myclub.fi) — manage your family's sports club events, invoices, and announcements from the terminal or via AI agents.

> **Disclaimer:** maiklubi is an independent, unofficial tool and is not affiliated with, endorsed by, or connected to myClub / myclub.fi. Use it with your own account and credentials, at your own risk.

## Install

Requires Node.js **20.17+** (or 22.13+ / 23.5+).

```bash
# From npm
npm install -g maiklubi

# Or from source
git clone https://github.com/jannemakela/maiklubi.git
cd maiklubi
npm install
npm run build
npm link   # makes `maiklubi` available globally
```

## Log in

Just run `maiklubi` (or `maiklubi login`) and enter your myclub.fi email + password. It logs in, **auto-discovers your family's members and clubs**, and saves them:

```bash
maiklubi        # first run walks you through login
maiklubi login  # log in again / switch account
```

Credentials are saved to `~/.config/maiklubi/config.json` (base64-obfuscated, not encrypted). For scripts/CI you can skip the prompt with environment variables instead:

```bash
export MAIKLUBI_EMAIL="your@email.fi"
export MAIKLUBI_PASSWORD="yourpassword"
```

## Usage

```
maiklubi                                   Interactive mode (logs you in on first run)
maiklubi login                             Log in and save your account
maiklubi users list [--json]               List configured family members
maiklubi accounts list [--json]            List accounts from myclub.fi
maiklubi events list [OPTIONS]             List upcoming events
maiklubi events indicate [OPTIONS]         Join or leave an event
maiklubi events participants [OPTIONS]     List event participants
maiklubi events comments [OPTIONS]         Read an event's discussion thread
maiklubi summary [OPTIONS]                 Events + invoices + notifications in one call
maiklubi invoices list [OPTIONS]           List open + paid invoices
maiklubi notifications list [OPTIONS]      List notifications
maiklubi calendar list [--json]            List calendar subscriptions
maiklubi calendar create [OPTIONS]         Create a calendar subscription
maiklubi version [--json]                  Show current version
maiklubi update                            Update to the latest version
maiklubi config clear                      Remove saved config

Options:
  --member <name>      Member name (e.g. Aino, Veikko, Onni)
  --club <name>        Club slug or URL (e.g. ppj, topola)
  --all-members        Run for all configured members and clubs
  --start <YYYY-MM-DD> Filter events from this date (inclusive)
  --end <YYYY-MM-DD>   Filter events up to this date (inclusive)
  --days <n>           Lookahead window in days (summary; default 14)
  --id <eventId>       Event ID
  --status <status>    Indication: yes|no|no_response|maybe
  --with-participants  Show participants for joined events (events list)
  --all-events         Show everything, incl. unjoinable events you haven't responded to
  --joinable-only      Show only events you can still join (drops all unjoinable)
  --limit <n>          Max results (default 20)
  --json               Machine-readable JSON output (for AI agents)
```

Run `maiklubi --help` for the full per-command synopsis.

## Use with Claude

Run with `--json` and pipe output to Claude, or use directly in Claude Code:

```
maiklubi events list --member Aino --json
maiklubi invoices list --all-members --json
```

## License

[MIT](LICENSE) © Janne Mäkelä
