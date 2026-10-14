# Personal agent

An always-on personal agent in the style of Meta Muse, OpenClaw, and ChatGPT Dots, built entirely on Vercel's stack and fully customizable. It lives on your server, talks to you on Telegram, remembers what matters to you, and acts on its own through a heartbeat and self-scheduled routines.

| Layer | Vercel product |
|---|---|
| Agent framework (agent-as-a-directory, durable sessions, channels, schedules, memory) | [eve](https://eve.dev) |
| Model calls and tool loop | [AI SDK](https://ai-sdk.dev) v7 |
| Durable execution (survives crashes and restarts) | [Workflow SDK](https://workflow-sdk.dev) |
| Model routing (any provider, one key) and web search | [AI Gateway](https://vercel.com/docs/ai-gateway) |
| Sandbox when hosted on Vercel | [Vercel Sandbox](https://vercel.com/docs/sandbox) |

## What it does

- **Talks to you on Telegram.** Only your user ID gets through; everyone else is dropped before any model call. Photos, PDFs, and text files work too. Approvals and questions show up as buttons.
- **Remembers you.** Long-term memory shared across every conversation and every scheduled run. The agent saves durable facts and tells you when it does.
- **Acts on its own:**
  - **Routines:** reminders, follow-ups, and recurring jobs ("every weekday at 8, send me a briefing") that the agent creates, lists, edits, and deletes itself. A one-minute dispatcher runs them as normal agent turns and the result lands in your chat.
  - **Heartbeat:** every 30 minutes (configurable, never during quiet hours) the agent reviews a checklist of standing concerns and messages you only if something needs attention. An empty checklist costs nothing: no model call.
  - **Activity log:** ask "what have you been up to?" and it reads back what it did on its own.
- **Does real work:** web search and page fetching, a sandboxed shell and filesystem, exact math, and a `researcher` subagent for deep, cited research while it keeps chatting with you.
- **Hands heavy jobs to Claude Code:** the `claude_code` tool runs Claude Code, on your Claude subscription by default, in a disposable Vercel Sandbox microVM. Coding, scripts, and data work happen there in the background while the agent keeps talking to you.
- **Skills:** a daily briefing and a weekly review, loaded only when relevant.

## Layout

```text
agent/
  agent.ts               model, reasoning, compaction, spend limits
  instructions.md        identity, tone, proactivity, memory, and safety rules
  instructions/now.ts    injects your local time into every turn
  memory.ts              long-term memory slot (local disk, or Vercel Blob on Vercel)
  sandbox.ts             shell/filesystem provider (just-bash, docker, or vercel)
  channels/telegram.ts   Telegram, owner-only
  channels/eve.ts        HTTP session API behind Basic auth
  schedules/heartbeat.ts the heartbeat
  schedules/routines.ts  dispatcher for agent-created routines
  tools/                 routines, heartbeat checklist, activity log, clock, calculator, ...
  skills/                daily-briefing, weekly-review
  subagents/researcher/  deep-research specialist
  lib/                   config, model selection, Claude Code delegate, file-backed stores
scripts/                 Telegram polling bridge and webhook registration
deploy/                  systemd units and a Caddyfile
test/                    unit tests for routines, heartbeat, and memory storage
```

Each file is plain TypeScript or Markdown. Add a tool by dropping a file in `agent/tools/`, a skill in `agent/skills/`, a recurring job in `agent/schedules/`, a specialist in `agent/subagents/`. See `node_modules/eve/docs/README.md` for the full framework docs.

eve also provides `bash`, `read_file`, `write_file`, `web_fetch`, `web_search`, and an `agent` tool (delegate to a copy of itself) by default.

## Setup

Requires Node 24 or newer.

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

1. A model credential (see below).
2. `OWNER_TIMEZONE`: for example `Europe/Rome`.
3. Telegram: create a bot with [@BotFather](https://t.me/BotFather), set `TELEGRAM_BOT_TOKEN`, a random `TELEGRAM_WEBHOOK_SECRET_TOKEN` (`openssl rand -hex 32`), and your numeric user ID in `TELEGRAM_OWNER_IDS` (ask [@userinfobot](https://t.me/userinfobot)).
4. `EVE_ADMIN_PASSWORD`: protects the HTTP API in production.

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

The `researcher` subagent uses `RESEARCHER_MODEL`, or a lighter model from the same provider.

### Claude Code (optional)

The `claude_code` tool delegates hands-on jobs to Claude Code through Vercel's official harness adapter (`@ai-sdk/harness-claude-code`), running in a Vercel Sandbox. Billing follows `CLAUDE_CODE_AUTH`:

- `subscription` (default): your Claude plan. On a Mac where you're logged in to Claude Code it works as is. On a server, run `claude setup-token` once and set `CLAUDE_CODE_OAUTH_TOKEN`. If `ANTHROPIC_API_KEY` is also set, a token is required, so an API key can never silently take over billing.
- `api-key`: `ANTHROPIC_API_KEY`, billed per token.
- `gateway`: `AI_GATEWAY_API_KEY`.

The sandbox needs Vercel access: `vercel link && vercel env pull` for `VERCEL_OIDC_TOKEN`, or `VERCEL_TOKEN`, `VERCEL_TEAM_ID`, and `VERCEL_PROJECT_ID`. Sandbox compute is billed by Vercel.

## Run locally

Chat in the terminal UI:

```bash
npm run dev
```

`eve dev` can also use credentials from its `/login` command (a Vercel account, a ChatGPT subscription, or a provider API key) instead of `.env`.

Schedules do not fire on their own under `eve dev`. Trigger one manually:

```bash
curl -X POST http://localhost:2000/eve/v1/dev/schedules/routines
```

Production mode locally, with Telegram:

```bash
npm run build
npm start
```

Then, in a second terminal:

```bash
npm run telegram:poll
```

## Deploy on a VM (always on)

With Docker:

```bash
docker compose up -d --build
```

This runs the agent plus the Telegram polling bridge, with workflow state and agent data on named volumes. No public URL or open port is needed: the poller pulls messages from Telegram and forwards them to the agent on the private network.

Without Docker, build in place and use the systemd units in `deploy/` (`agent.service` and `telegram-poller.service`).

To use a Telegram webhook instead of polling, put the VM behind HTTPS (see `deploy/Caddyfile`), stop the poller, and register the webhook:

```bash
PUBLIC_URL=https://agent.example.com npm run telegram:webhook
```

Persist two directories across restarts and upgrades: `.eve/.workflow-data` (durable sessions and parked turns) and `.data` (memory, routines, heartbeat checklist, activity log).

### Sandbox choice

`AGENT_SANDBOX` is read at build time:

- `just-bash` (default): a pure-JavaScript shell with a virtual filesystem. No dependencies, but no native binaries such as Python.
- `docker`: a real Linux container per session. Needs Docker on the host where the agent runs (not inside the agent's own container).
- `vercel`: hosted Vercel Sandbox microVMs.

## Deploy on Vercel

`npx eve deploy` works too. Schedules become Vercel Cron Jobs and the sandbox should be `vercel`. Two caveats: run `npx eve add memory/file` so memory lives in Vercel Blob, and replace the file-based stores in `agent/lib/` (routines, heartbeat, activity) with a durable store such as Upstash Redis, because the Vercel filesystem is not persistent. Register the Telegram webhook against the deployment URL.

## Test

```bash
npm run typecheck
npm test
```

## Customizing

- **Personality and rules:** edit `agent/instructions.md`.
- **Model:** set `AGENT_MODEL` (see "Choose the model"), or add providers in `agent/lib/models.ts`.
- **Spend:** `limits.maxTokenCostUsdPerSession` in `agent/agent.ts` caps model cost per session.
- **Approvals:** add `approval: always()` (from `eve/tools/approval`) to any tool that should ask you first. Note that turns started by the heartbeat or a routine run as the app itself; give such tools a `response` policy that lets you approve them.
- **More channels:** `npx eve add channel/slack`, `channel/discord`, `channel/twilio` (SMS and calls), `channel/linq` or `channel/photon` (iMessage).
- **Integrations:** `npx eve registry search <service>` to connect MCP servers and APIs such as Linear, GitHub, or Notion.

## Safety notes

- Everything the owner check lets through runs with the agent's full toolset. Keep `TELEGRAM_OWNER_IDS` and `EVE_ADMIN_PASSWORD` tight.
- The default tools run without approval. The sandbox isolates shell commands, but authored tools in `agent/tools/` run in the server process with access to its environment.
- Delivery of routines is at least once: a crash at the wrong moment can run one twice.

## License

MIT
