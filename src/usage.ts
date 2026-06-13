export function printUsage() {
  console.log(`
maiklubi — CLI for myclub.fi, built for parents and AI agents

Usage:
  maiklubi                                          Interactive mode (logs you in on first run)
  maiklubi login                                    Log in and save your account (email + password)
  maiklubi summary [--days 14] [--member <name>] [--club <name>] [--all-members] [--json]
  maiklubi users list [--json]
  maiklubi accounts list [--json]
  maiklubi events list [--member <name>] [--club <name>] [--all-members] [--start YYYY-MM-DD] [--end YYYY-MM-DD] [--with-participants] [--all-events | --joinable-only] [--json]
  maiklubi events indicate --member <name> [--club <name>] --id <eventId> --status yes|no|no_response|maybe [--json]
  maiklubi events participants --member <name> [--club <name>] --id <eventId> [--json]
  maiklubi events comments --member <name> [--club <name>] --id <eventId> [--json]
  maiklubi invoices list [--member <name>] [--club <name>] [--all-members] [--json]
  maiklubi notifications list [--member <name>] [--club <name>] [--limit 20] [--all-members] [--json]
  maiklubi notifications show --member <name> [--club <name>] --id <notificationId> [--json]
  maiklubi calendar list [--json]
  maiklubi calendar create --member <name> [--club <name>] [--indication yes] [--json]
  maiklubi update
  maiklubi config clear
  maiklubi --help | -h
  maiklubi --version | -v
`.trim());
}
