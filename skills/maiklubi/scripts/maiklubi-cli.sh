#!/usr/bin/env bash
set -euo pipefail

# Wrapper for myclub CLI that prefers non-interactive JSON output.
# Usage: maiklubi-cli.sh <args>

if command -v myclub >/dev/null 2>&1; then
  myclub "$@"
else
  # fallback to local repo build
  node "$(pwd)/dist/index.js" "$@"
fi
