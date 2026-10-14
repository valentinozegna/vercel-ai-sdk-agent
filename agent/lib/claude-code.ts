/**
 * Delegates a job to Claude Code through Vercel's official harness adapter
 * (@ai-sdk/harness-claude-code). Claude Code runs with its own tools inside a
 * Vercel Sandbox microVM, so it can install packages, run code, and edit files
 * without touching this server.
 *
 * Authentication (CLAUDE_CODE_AUTH):
 *   subscription (default)  Your Claude plan. Uses CLAUDE_CODE_OAUTH_TOKEN
 *                           (from `claude setup-token`; works on any server)
 *                           or, without it, the Claude Code login on this
 *                           machine (macOS keychain or ~/.claude).
 *   api-key                 ANTHROPIC_API_KEY, billed per token.
 *   gateway                 AI_GATEWAY_API_KEY through Vercel AI Gateway.
 *
 * Vercel Sandbox needs VERCEL_OIDC_TOKEN (vercel link && vercel env pull), or
 * VERCEL_TOKEN + VERCEL_TEAM_ID + VERCEL_PROJECT_ID on a non-Vercel host.
 */

import type { ClaudeCodeAuthenticationMode } from "@ai-sdk/harness-claude-code";

export type ClaudeCodeAuthChoice = "subscription" | "api-key" | "gateway";

export function claudeCodeAuthChoice(): ClaudeCodeAuthChoice {
  const raw = process.env.CLAUDE_CODE_AUTH;
  return raw === "api-key" || raw === "gateway" ? raw : "subscription";
}

/** Maps the configured choice to the adapter's `auth` setting. */
export function claudeCodeAuth(): ClaudeCodeAuthenticationMode {
  switch (claudeCodeAuthChoice()) {
    case "api-key": {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) throw new Error("CLAUDE_CODE_AUTH=api-key needs ANTHROPIC_API_KEY.");
      return { ANTHROPIC_API_KEY: key };
    }
    case "gateway":
      return "ai-gateway";
    case "subscription": {
      const token = process.env.CLAUDE_CODE_OAUTH_TOKEN;
      // An explicit token is passed as an isolated environment, so an
      // ANTHROPIC_API_KEY used by the main agent can never take over billing.
      if (token) return { CLAUDE_CODE_OAUTH_TOKEN: token };
      if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) {
        throw new Error(
          "Claude Code would bill ANTHROPIC_API_KEY instead of your subscription. " +
            "Run `claude setup-token` and set CLAUDE_CODE_OAUTH_TOKEN, or set CLAUDE_CODE_AUTH=api-key.",
        );
      }
      // No credential in the environment: the adapter reads this machine's Claude Code login.
      return "direct";
    }
  }
}

/** Sandbox credentials for hosts outside Vercel; OIDC needs nothing explicit. */
function sandboxCredentials(): { token: string; teamId: string; projectId: string } | undefined {
  const { VERCEL_TOKEN, VERCEL_TEAM_ID, VERCEL_PROJECT_ID } = process.env;
  if (VERCEL_TOKEN && VERCEL_TEAM_ID && VERCEL_PROJECT_ID) {
    return { token: VERCEL_TOKEN, teamId: VERCEL_TEAM_ID, projectId: VERCEL_PROJECT_ID };
  }
  return undefined;
}

export function claudeCodeConfigured(): { ok: true } | { ok: false; reason: string } {
  if (!process.env.VERCEL_OIDC_TOKEN && !sandboxCredentials()) {
    return {
      ok: false,
      reason:
        "Claude Code runs in a Vercel Sandbox, which needs VERCEL_OIDC_TOKEN or VERCEL_TOKEN + VERCEL_TEAM_ID + VERCEL_PROJECT_ID.",
    };
  }
  try {
    claudeCodeAuth();
  } catch (error) {
    return { ok: false, reason: (error as Error).message };
  }
  return { ok: true };
}

const INSTRUCTIONS = [
  "You are working on a job delegated by a personal assistant agent, inside a disposable Linux sandbox.",
  "Work autonomously: there is no human to ask. Install what you need.",
  "Your final message is the only thing the assistant receives, and the sandbox is deleted afterwards.",
  "End with a self-contained report: what you did, the result, and the full content of any short output files the user needs.",
].join(" ");

export interface ClaudeCodeJob {
  task: string;
  timeoutMinutes: number;
}

export interface ClaudeCodeResult {
  text: string;
  auth: ClaudeCodeAuthChoice;
  model: string;
  durationSeconds: number;
}

/** Runs one Claude Code job in a fresh sandbox and tears everything down. */
export async function runClaudeCodeJob(
  job: ClaudeCodeJob,
  abortSignal?: AbortSignal,
): Promise<ClaudeCodeResult> {
  const status = claudeCodeConfigured();
  if (!status.ok) throw new Error(status.reason);

  // Loaded lazily so the harness and sandbox SDKs stay out of every other module.
  const { HarnessAgent } = await import("@ai-sdk/harness/agent");
  const { createClaudeCode } = await import("@ai-sdk/harness-claude-code");
  const { createVercelNetworkSandboxSession } = await import("@ai-sdk/sandbox-vercel");

  const model = process.env.CLAUDE_CODE_MODEL || undefined;
  const agent = new HarnessAgent({
    harness: createClaudeCode({ auth: claudeCodeAuth() }),
    ...(model ? { model } : {}),
    instructions: INSTRUCTIONS,
    permissionMode: "allow-all",
  });

  const started = Date.now();
  const timeoutMs = job.timeoutMinutes * 60_000;
  const sandbox = await createVercelNetworkSandboxSession({
    runtime: "node24",
    ports: [4000],
    // Headroom over the job timeout so the sandbox outlives the turn it hosts.
    timeout: timeoutMs + 5 * 60_000,
    template: await agent.getSandboxTemplate(),
    ...sandboxCredentials(),
  });

  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = abortSignal ? AbortSignal.any([abortSignal, timeout]) : timeout;

  try {
    const session = await agent.createSession({ sandboxSession: sandbox });
    try {
      const result = await agent.generate({ session, prompt: job.task, abortSignal: signal });
      return {
        text: result.text,
        auth: claudeCodeAuthChoice(),
        model: model ?? "claude-code-default",
        durationSeconds: Math.round((Date.now() - started) / 1000),
      };
    } finally {
      await session.destroy().catch(() => undefined);
    }
  } finally {
    await Promise.resolve(sandbox.destroy()).catch(() => undefined);
  }
}
