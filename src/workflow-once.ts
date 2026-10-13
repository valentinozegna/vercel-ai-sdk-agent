import 'dotenv/config';
import { workflowAgent } from './workflow-agent.js';

const prompt = process.argv.slice(2).join(' ') || 'What is (12 + 7) * 3?';

const result = await workflowAgent.generate({ prompt });
console.log(result.text);
