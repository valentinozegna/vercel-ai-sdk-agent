# vercel-ai-sdk-agent

A functional working agent built with the **Vercel AI SDK v7** (`ToolLoopAgent`).

## What it does

An agent with five tools that runs either as an interactive terminal UI
or as a one-shot CLI command:

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

Typecheck:

```bash
npm run typecheck
```

## Notes

- No API keys are committed to this repo. `.env` is gitignored; only
  `.env.example` (with placeholder values) is tracked.
- File tools are sandboxed to the directory you launch from.
- Built against `ai@7` — see the [AI SDK agent docs](https://ai-sdk.dev/docs/agents/overview).

## License

MIT
