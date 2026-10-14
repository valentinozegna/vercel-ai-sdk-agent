import { defineWorkflowTool, type WorkflowStepToolContext } from "eve/tools";
import { FatalError } from "workflow";
import { z } from "zod";

import { claudeCodeConfigured, runClaudeCodeJob, type ClaudeCodeResult } from "../lib/claude-code";

/**
 * Hands a self-contained job to Claude Code (on the owner's Claude plan by
 * default) running in a Vercel Sandbox. It runs as a background task: the
 * conversation continues and the result arrives when Claude Code finishes.
 */
export default defineWorkflowTool({
  description: [
    "Delegate a substantial, self-contained job to Claude Code running in a disposable Linux sandbox:",
    "writing or fixing code, building a small tool or script, data processing, or multi-step work that needs a real machine.",
    "It runs in the background; keep talking to the owner and its report arrives later.",
    "Write `task` as a complete brief: Claude Code cannot see this conversation, the owner's files, or your memory.",
    "The sandbox is deleted afterwards, so ask for any results you need in its final report.",
  ].join(" "),
  inputSchema: z.object({
    task: z.string().min(1).max(20_000).describe("Complete, self-contained instructions for Claude Code."),
    timeoutMinutes: z.number().int().min(1).max(60).optional().describe("Defaults to 20."),
  }),
  label: {
    start: () => "Delegate to Claude Code",
  },
  async task({ task, timeoutMinutes }, ctx) {
    "use workflow";
    return await runJob(task, timeoutMinutes ?? 20, ctx);
  },
});

/**
 * The whole job is one durable step. Failures are final: an automatic retry
 * would rerun the entire job in a new sandbox and spend the owner's usage
 * again, so the agent decides whether to try once more.
 */
async function runJob(
  task: string,
  timeoutMinutes: number,
  ctx: WorkflowStepToolContext,
): Promise<ClaudeCodeResult> {
  "use step";
  const status = claudeCodeConfigured();
  if (!status.ok) throw new FatalError(`Claude Code is not set up: ${status.reason}`);
  try {
    return await runClaudeCodeJob({ task, timeoutMinutes }, ctx.abortSignal);
  } catch (error) {
    throw new FatalError(`Claude Code job failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
