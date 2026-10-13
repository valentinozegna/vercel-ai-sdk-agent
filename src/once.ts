import 'dotenv/config';
import { agent } from './agent.js';

const prompt = process.argv.slice(2).join(' ');
if (!prompt) {
  console.error('Usage: npm run once -- "your prompt here"');
  process.exit(1);
}

const result = await agent.generate({ prompt });
console.log(result.text);
