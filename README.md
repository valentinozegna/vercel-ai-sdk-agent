# vercel-ai-sdk-agent

A functional working agent built with the **Vercel AI SDK v7** —
`ToolLoopAgent` for interactive use, plus `WorkflowAgent` for durable,
resumable runs.

## What it does

An agent with five tools that runs as an interactive terminal UI,
a one-shot CLI command, or a durable workflow:

| Tool | What it does |
|---|---|
| `getCurrentTime` | Current date/time, optional IANA timezone |
| `calculate` | Safe arithmetic (`(12 + 7) * 3`, no `eval`) |
| `listFiles` | List files in a directory (sandboxed to cwd) |
| `readFile` | Read a text file (sandboxed to cwd, capped) |
| `fetchWebsite` | Fetch a page and return its text |

The model is resolved through the [Vercel AI Gateway](https://vercel.com/docs/ai-gateway),
so any `provider/model` ID works. Set it with `AI_MODEL`.

## Setup

```bash
npm install
cp .env.example .env
# edit .env and add your AI_GATEWAY_API_KEY (never commit .env)
```

Get a key at https://vercel.com/docs/ai-gateway.

## Run

Interactive terminal UI:

```bash
npm run agent
```

One-shot:

```bash
npm run once -- "What time is it in Tokyo and what is (48 + 12) * 3?"
```

Durable workflow agent (same tools, each tool call a retryable,
persistent step):

```bash
npm run workflow -- "What is (12 + 7) * 3?"
```

Typecheck:

```bash
npm run typecheck
```

## WorkflowAgent

`src/workflow-agent.ts` defines the same agent as a `WorkflowAgent`
(`@ai-sdk/workflow`). Tool `execute` functions are marked `'use step'`,
so inside a workflow each tool call gets automatic retries, survives
process restarts, and shows up as a discrete step in the dashboard.

`src/workflows/chat.ts` is the durable entrypoint: a `'use workflow'`
function that streams the agent via `getWritable()`. Run it with the
Workflow SDK:

```bash
npx workflow build -t standalone   # compile workflow + step bundles
npx workflow start chat '"<prompt>"'  # start a run (local backend)
npx workflow inspect runs          # inspect runs and steps
```

Full durability (surviving restarts, human-in-the-loop approvals via
`needsApproval`) needs the workflow runtime — local via the standalone
flow handler, or managed on Vercel. See the
[WorkflowAgent docs](https://ai-sdk.dev/docs/agents/workflow-agent).

## Notes

- No API keys are committed to this repo. `.env` is gitignored; only
  `.env.example` (with placeholder values) is tracked.
- File tools are sandboxed to the directory you launch from.
- Built against `ai@7` — see the [AI SDK agent docs](https://ai-sdk.dev/docs/agents/overview).

## License

MIT
