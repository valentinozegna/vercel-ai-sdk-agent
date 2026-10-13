import 'dotenv/config';
import { runAgentTUI } from '@ai-sdk/tui';
import { agent } from './agent.js';

if (!process.env.AI_GATEWAY_API_KEY) {
  console.warn(
    'Warning: AI_GATEWAY_API_KEY is not set. Copy .env.example to .env and add your key.',
  );
}

await runAgentTUI({
  title: 'AI SDK v7 Agent',
  agent,
});
