#!/usr/bin/env bash
# Runs a command with secrets from the macOS keychain (local use).
#
#   scripts/keychain-run.sh npm start
#
# Loads .env and .env.local, then loads each secret named in KEYCHAIN_SECRETS
# (comma-separated, set in .env) from the keychain item with the same service
# name. Only listed secrets are loaded, so other keys in your keychain never
# change which provider or billing route the agent uses. Store one with:
#
#   security add-generic-password -a "$USER" -s TELEGRAM_BOT_TOKEN -w
#
# Values never touch disk and are never printed. On a server, use .env or
# your secret manager instead.
set -euo pipefail
cd "$(dirname "$0")/.."

for file in .env .env.local; do
  if [[ -f "$file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$file"
    set +a
  fi
done

IFS=',' read -r -a names <<< "${KEYCHAIN_SECRETS:-}"
for raw in "${names[@]}"; do
  name="${raw//[[:space:]]/}"
  [[ -z "$name" ]] && continue
  if [[ -n "${!name:-}" ]]; then
    echo "keychain-run: $name already set, keeping it" >&2
  elif value=$(security find-generic-password -s "$name" -w 2>/dev/null); then
    export "$name=$value"
    echo "keychain-run: loaded $name from keychain" >&2
  else
    echo "keychain-run: $name not found in keychain" >&2
  fi
done

exec "$@"
