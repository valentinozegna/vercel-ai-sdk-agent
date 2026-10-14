---
name: verify
description: Build, run, and drive this eve agent to verify a change at its real surfaces (HTTP session API, Telegram webhook, schedules).
---

# Verify this agent

Node 24+ is required (`~/.nvm/versions/node/v26.11.1/bin` on the owner's Mac).

## Launch (production mode, isolated)

```bash
npx eve build
V=$(mktemp -d)
GEMINI_API_KEY="$(security find-generic-password -s GEMINI_API_KEY -a valentino -w)" \
EVE_ADMIN_PASSWORD=verify-pass TELEGRAM_BOT_TOKEN=123:fake TELEGRAM_WEBHOOK_SECRET_TOKEN=vsecret \
TELEGRAM_OWNER_IDS=111 OWNER_TIMEZONE=Europe/Rome QUIET_HOURS=off HEARTBEAT_INTERVAL_MINUTES=5 \
AGENT_DATA_DIR=$V/data PORT=3199 npx eve start --host 127.0.0.1
```

Never print the key. Health: `GET /eve/v1/health`. Delete `.eve/.workflow-data` afterwards.

## Drive

- HTTP API (Basic auth `owner:verify-pass`): `POST /eve/v1/session {"message": ...}`, then read `GET /eve/v1/session/<id>/stream?startIndex=0` (NDJSON, replays from the start; break on the turn you sent, not the first `turn.completed`).
- Telegram: `POST /eve/v1/telegram` with header `x-telegram-bot-api-secret-token: vsecret` and a raw Bot API update. Replies fail with 401 (fake token); read the session stream instead.
- Schedules fire only under `eve start` (not `eve dev`). Create a routine ~2 minutes out and watch `$V/data/activity.jsonl`.
- Agent state on disk: `$V/data/{memory,routines.json,HEARTBEAT.md,activity.jsonl}`.

## Docker

`colima start` (Docker is not running by default). `compose.yaml` requires a `.env`; create a test-only one with the fake values above, never a real key. Pass the model key through an override file containing `services.agent.environment: [GEMINI_API_KEY]` and set it inline from the keychain. Afterwards: `docker compose down -v`, delete the test `.env`, `colima stop`.

## Gotchas

- `eve dev` never fires schedules; use `curl -X POST localhost:2000/eve/v1/dev/schedules/<name>` there.
- Without Vercel Sandbox credentials, `claude_code` fails fast by design.
- Heartbeat and routines share the owner's Telegram chat session; a routine arriving mid-heartbeat steers that turn into one reply.
