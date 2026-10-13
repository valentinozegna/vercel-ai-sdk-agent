import { getWritable } from 'workflow';
import { workflowAgent } from '../workflow-agent.js';

/**
 * Durable chat workflow. Each run of `chat` is checkpointed: tool calls
 * run as discrete retryable steps, and the run survives process restarts.
 *
 * Run locally:  npx workflow build -t standalone && npx workflow start chat '"<prompt>"'
 * Inspect:      npx workflow inspect runs / npx workflow web
 */
export async function chat(prompt: string) {
  'use workflow';

  const result = await workflowAgent.stream({
    prompt,
    writable: getWritable(),
  });

  return { messages: result.messages };
}
