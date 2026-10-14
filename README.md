# Vercel Always-On Agent

An always-on personal agent in the style of Meta Muse, OpenClaw, and ChatGPT Dots, built entirely on Vercel's stack and fully customizable. It lives on your server, talks to you on Telegram, remembers what matters to you, acts on its own through a heartbeat and self-scheduled routines, and hands hands-on jobs to Claude Code on your Claude subscription.

| Layer | Vercel product |
|---|---|
| Agent framework (agent-as-a-directory, durable sessions, channels, schedules, memory) | [eve](https://eve.dev) |
| Model calls and tool loop | [AI SDK](https://ai-sdk.dev) v7 |
| Durable execution (survives crashes and restarts) | [Workflow SDK](https://workflow-sdk.dev) |
| Model routing (any provider, one key) and web search | [AI Gateway](https://vercel.com/docs/ai-gateway) |
| Claude Code delegate | [AI SDK harness](https://ai-sdk.dev/docs/ai-sdk-harnesses) `@ai-sdk/harness-claude-code` |
| Isolated machines for Claude Code (and the agent's shell when hosted on Vercel) | [Vercel Sandbox](https://vercel.com/docs/sandbox) |

## What it does

- **Talks to you on Telegram.** Only your user ID gets through; everyone else is dropped before any model call. Photos, PDFs, and text files work too. Approvals and questions show up as buttons.
- **Remembers you.** Long-term memory shared across every conversation and every scheduled run. The agent saves durable facts and tells you when it does.
- **Acts on its own:**
  - **Routines:** reminders, follow-ups, and recurring jobs ("every weekday at 8, send me a briefing") that the agent creates, lists, edits, and deletes itself. A one-minute dispatcher runs them as normal agent turns and the result lands in your chat.
  - **Heartbeat:** every 30 minutes (configurable, never during quiet hours) the agent reviews a checklist of standing concerns and messages you only if something needs attention. An empty checklist costs nothing: no model call.
  - **Activity log:** ask "what have you been up to?" and it reads back what it did on its own.
- **Does real work:** web search and page fetching, a sandboxed shell and filesystem, exact math, and a `researcher` subagent for deep, cited research while it keeps chatting with you.
- **Hands heavy jobs to Claude Code:** the `claude_code` tool runs Claude Code, on your Claude subscription by default, in a disposable Vercel Sandbox microVM. Coding, scripts, and data work happen there in the background while the agent keeps talking to you.
- **Runs on any model:** AI Gateway, Anthropic, OpenAI, Gemini, a ChatGPT subscription (local), or a local model.
- **Skills:** a daily briefing and a weekly review, loaded only when relevant.

## Layout

```text
agent/
  agent.ts               model selection, compaction, spend limits, build settings
  instructions.md        identity, tone, proactivity, memory, honesty, and safety rules
  instructions/now.ts    injects your local time into every turn
  memory.ts              long-term memory slot (local disk, or Vercel Blob on Vercel)
  sandbox.ts             shell/filesystem provider (just-bash, docker, or vercel)
  channels/telegram.ts   Telegram, owner-only
  channels/eve.ts        HTTP session API behind Basic auth
  schedules/heartbeat.ts the heartbeat
  schedules/routines.ts  dispatcher for agent-created routines
  tools/                 routines, heartbeat checklist, activity log, claude_code, clock, calculator, ...
  skills/                daily-briefing, weekly-review
  subagents/researcher/  deep-research specialist
  lib/                   config, model selection, Claude Code delegate, file-backed stores
scripts/                 Telegram polling bridge, webhook registration, keychain launcher
deploy/                  systemd units and a Caddyfile
test/                    unit tests for routines, heartbeat, memory storage, models, Claude Code auth
.claude/skills/verify/   recipe for verifying changes end to end
```

Each file is plain TypeScript or Markdown. Add a tool by dropping a file in `agent/tools/`, a skill in `agent/skills/`, a recurring job in `agent/schedules/`, a specialist in `agent/subagents/`. See `node_modules/eve/docs/README.md` for the full framework docs.

eve also provides `bash`, `read_file`, `write_file`, `web_fetch`, `web_search`, and an `agent` tool (delegate to a copy of itself) by default.

## Setup

Requires Node 24 or newer.

```bash
npm install
```

```bash
cp .env.example .env
```

Then fill in `.env`: a model credential, `OWNER_TIMEZONE` (for example `Europe/Rome`), and Telegram. Every variable is documented in `.env.example`.

### Choose the model

Set one credential; the agent picks it up automatically. `AGENT_MODEL` chooses explicitly (`<provider>:<model>`, or a bare AI Gateway ID).

| Provider | Credential | Example `AGENT_MODEL` | Notes |
|---|---|---|---|
| Vercel AI Gateway | `AI_GATEWAY_API_KEY` | `anthropic/claude-opus-5.5` | Any provider's models with one key |
| Anthropic | `ANTHROPIC_API_KEY` | `anthropic:claude-opus-5-5` | Claude Max and Team plans include monthly API credits for this |
| OpenAI | `OPENAI_API_KEY` | `openai:gpt-6-luna` | |
| Google Gemini | `GEMINI_API_KEY` | `google:gemini-4-argon` | |
| ChatGPT subscription | `/login` in `eve dev` | `chatgpt:gpt-6-luna-fast` | Local development only |
| Local (Ollama, vLLM, ...) | `LOCAL_MODEL_BASE_URL` | `local:llama3.3` | Any OpenAI-compatible server |

The `researcher` subagent uses `RESEARCHER_MODEL`, or a lighter model from the same provider. A `VERCEL_OIDC_TOKEN` (from `vercel env pull`) also counts as an AI Gateway credential, so set `AGENT_MODEL` if you want a different provider while linked to Vercel.

### Connect Telegram

1. In Telegram, message [@BotFather](https://t.me/BotFather), send `/newbot`, pick a name and a username ending in `bot`, and copy the token.
2. Put the token in `TELEGRAM_BOT_TOKEN` (or in the keychain, see below) and the username in `TELEGRAM_BOT_USERNAME`.
3. Set `TELEGRAM_WEBHOOK_SECRET_TOKEN` to a random string. It is the shared password between the Telegram relay and the agent.

```bash
openssl rand -hex 32
```

4. Set `TELEGRAM_OWNER_IDS` to your numeric Telegram user ID, from [@userinfobot](https://t.me/userinfobot). Alternatively, start the agent with it empty, message your bot once, and read your ID from the agent log line `ignored message from non-owner user <id>`.

No public URL is needed: the relay (`npm run telegram:poll`) pulls messages from Telegram and forwards them to the agent.

### Claude Code (optional)

The `claude_code` tool delegates hands-on jobs to Claude Code through Vercel's official harness adapter, running in a Vercel Sandbox. Billing follows `CLAUDE_CODE_AUTH`:

- `subscription` (default): your Claude plan. On a Mac where you're logged in to Claude Code it works as is. On a server, run `claude setup-token` once and set `CLAUDE_CODE_OAUTH_TOKEN`. If `ANTHROPIC_API_KEY` is also set, a token is required, so an API key can never silently take over billing.
- `api-key`: `ANTHROPIC_API_KEY`, billed per token.
- `gateway`: `AI_GATEWAY_API_KEY`.

The sandbox needs Vercel access. Locally, link the project and pull a short-lived token:

```bash
vercel link
```

```bash
vercel env pull .env.local
```

On a server, set `VERCEL_TOKEN`, `VERCEL_TEAM_ID`, and `VERCEL_PROJECT_ID` instead. Sandbox compute is billed by Vercel. Failed jobs are not retried automatically, so a broken job never burns your subscription twice.

## Run on your Mac

Locally the agent runs as plain Node processes, which keeps the edit-and-test loop fast and lets it read secrets from the macOS keychain.

### Keep secrets in the keychain

Store each secret in the keychain under its variable name, list the names in `KEYCHAIN_SECRETS`, and leave the variables empty in `.env`:

```bash
security add-generic-password -a "$USER" -s TELEGRAM_BOT_TOKEN -w
```

```
KEYCHAIN_SECRETS=TELEGRAM_BOT_TOKEN,GEMINI_API_KEY
```

The `local:*` scripts run through `scripts/keychain-run.sh`, which loads only the listed names, so other keys in your keychain never change the provider or billing route. Values never touch disk.

### Start it

Build once, then run the agent and the Telegram relay in two terminals:

```bash
npm run build
```

```bash
npm run local:start
```

```bash
npm run local:telegram
```

Both stop when the Mac sleeps or restarts. For development with hot reload and the terminal UI, use `npm run local:dev` (schedules don't fire on their own under `eve dev`; trigger one with `curl -X POST http://localhost:2000/eve/v1/dev/schedules/routines`).

## Deploy on a VM (always on)

On a server, run it with Docker. The image pins Node and every dependency, `restart: unless-stopped` brings it back after crashes and reboots, and state lives in named volumes that survive rebuilds.

```bash
docker compose up -d --build
```

This runs the agent plus the Telegram relay. The agent's port is bound to localhost only; no public URL or open port is needed.

Without Docker, build in place and use the systemd units in `deploy/` (`agent.service` and `telegram-poller.service`). To use a Telegram webhook instead of polling, put the VM behind HTTPS (see `deploy/Caddyfile`), stop the relay, and register the webhook:

```bash
PUBLIC_URL=https://agent.example.com npm run telegram:webhook
```

Persist two directories across restarts and upgrades: `.eve/.workflow-data` (durable sessions and parked turns) and `.data` (memory, routines, heartbeat checklist, activity log). The compose file does this with volumes.

### Secrets on a VM

The keychain is Mac-only. On a VM, keep the secrets as encrypted Vercel project environment variables and pull them into a locked-down `.env` when you deploy:

```bash
vercel env add TELEGRAM_BOT_TOKEN production
```

```bash
vercel env pull .env --environment=production
```

```bash
chmod 600 .env
```

`.dockerignore` excludes `.env`, so secrets are injected at runtime and never baked into the image. Use separate model, Vercel, and Claude keys for the VM so either machine's keys can be revoked independently, and generate `CLAUDE_CODE_OAUTH_TOKEN` with `claude setup-token`. A plain `.env` copied over SSH, the 1Password CLI (`op run -- docker compose up -d`), or your cloud's secret manager work too.

### Sandbox choice

`AGENT_SANDBOX` is read at build time and decides where the agent's own `bash`, `read_file`, and `write_file` run:

- `just-bash` (default): a pure-JavaScript shell with a virtual filesystem. No dependencies, but no native binaries such as Python. Use `claude_code` for real Linux work.
- `docker`: a real Linux container per session. Needs Docker on the host where the agent runs (not inside the agent's own container).
- `vercel`: hosted Vercel Sandbox microVMs.

## Deploy on Vercel

`npx eve deploy` works too. Schedules become Vercel Cron Jobs and the sandbox should be `vercel`. Two caveats: run `npx eve add memory/file` so memory lives in Vercel Blob, and replace the file-based stores in `agent/lib/` (routines, heartbeat, activity) with a durable store such as Upstash Redis, because the Vercel filesystem is not persistent. Register the Telegram webhook against the deployment URL.

## Test

```bash
npm run typecheck
```

```bash
npm test
```

To verify a change end to end (real server, real model, Telegram webhook, schedules, Docker), follow `.claude/skills/verify/SKILL.md`, or run `/verify` in Claude Code.

## Customizing

- **Personality and rules:** edit `agent/instructions.md`.
- **Model:** set `AGENT_MODEL` (see "Choose the model"), or add providers in `agent/lib/models.ts`.
- **Spend:** `limits.maxTokenCostUsdPerSession` in `agent/agent.ts` caps model cost per session.
- **Approvals:** add `approval: always()` (from `eve/tools/approval`) to any tool that should ask you first. Turns started by the heartbeat or a routine run as the app itself; give such tools a `response` policy that lets you approve them.
- **More channels:** `npx eve add channel/slack`, `channel/discord`, `channel/twilio` (SMS and calls), `channel/linq` or `channel/photon` (iMessage).
- **Integrations:** `npx eve registry search <service>` to connect MCP servers and APIs such as Google Drive, Gmail, Linear, GitHub, or Notion.

## Safety notes

- Everything the owner check lets through runs with the agent's full toolset. Keep `TELEGRAM_OWNER_IDS` and `EVE_ADMIN_PASSWORD` tight.
- The default tools run without approval. The sandbox isolates shell commands, but authored tools in `agent/tools/` run in the server process with access to its environment.
- Delivery of routines is at least once: a crash at the wrong moment can run one twice.
- One bot token can serve only one poller. Don't point another agent (for example OpenClaw) at the same bot.

## License

MIT
