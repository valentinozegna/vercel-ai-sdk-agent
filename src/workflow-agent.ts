import { WorkflowAgent } from '@ai-sdk/workflow';
import { isStepCount, tool } from 'ai';
import { z } from 'zod';
import { readdir, readFile as fsReadFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Durable version of the agent in src/agent.ts.
 *
 * WorkflowAgent runs the same tool loop, but each tool execution is a
 * durable workflow step: automatic retries, persistence across process
 * restarts, and per-step observability.
 *
 * Tool `execute` functions are marked with 'use step' so the workflow
 * runtime treats them as discrete, retryable steps. Without the workflow
 * compiler/runtime they still run as plain functions.
 */

const PROJECT_ROOT = process.cwd();

async function getCurrentTimeStep({ timezone }: { timezone?: string }) {
  'use step';
  return new Date().toLocaleString('en-US', {
    timeZone: timezone || 'UTC',
    dateStyle: 'full',
    timeStyle: 'long',
  });
}

const SAFE_EXPR = /^[0-9+\-*/().\s^%]*$/;

async function calculateStep({ expression }: { expression: string }) {
  'use step';
  if (!SAFE_EXPR.test(expression) || expression.trim() === '') {
    throw new Error('Only numbers and + - * / ( ) . % ^ are allowed.');
  }
  const sanitized = expression.replace(/\^/g, '**');
  // eslint-disable-next-line no-new-func
  const value = Function(`"use strict"; return (${sanitized});`)();
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('Expression did not evaluate to a finite number.');
  }
  return value;
}

async function listFilesStep({ dir }: { dir?: string }) {
  'use step';
  const target = path.resolve(PROJECT_ROOT, dir || '.');
  if (!target.startsWith(PROJECT_ROOT)) {
    throw new Error('Can only list files inside the project directory.');
  }
  return (await readdir(target)).join('\n');
}

async function readFileStep({ file }: { file: string }) {
  'use step';
  const target = path.resolve(PROJECT_ROOT, file);
  if (!target.startsWith(PROJECT_ROOT)) {
    throw new Error('Can only read files inside the project directory.');
  }
  const content = await fsReadFile(target, 'utf-8');
  return content.length > 8000 ? content.slice(0, 8000) + '\n…(truncated)' : content;
}

async function fetchWebsiteTextStep({ url }: { url: string }) {
  'use step';
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') {
    throw new Error('Only https URLs are allowed.');
  }
  const res = await fetch(url, {
    headers: { 'user-agent': 'vercel-ai-sdk-agent/1.0' },
  });
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 8000 ? text.slice(0, 8000) + '\n…(truncated)' : text;
}

export const workflowAgent = new WorkflowAgent({
  model: process.env.AI_MODEL ?? 'anthropic/claude-sonnet-5.5',

  instructions:
    'You are a helpful assistant with tools. ' +
    'Use getCurrentTime for time questions, calculate for arithmetic, ' +
    'listFiles and readFile for local files, fetchWebsiteText for web pages.',

  tools: {
    getCurrentTime: tool({
      description: 'Get the current date and time, optionally in a timezone.',
      inputSchema: z.object({
        timezone: z
          .string()
          .optional()
          .describe('IANA timezone, e.g. America/Los_Angeles'),
      }),
      execute: getCurrentTimeStep,
    }),

    calculate: tool({
      description: 'Evaluate a basic arithmetic expression.',
      inputSchema: z.object({
        expression: z.string().describe('e.g. (12 + 7) * 3'),
      }),
      execute: calculateStep,
    }),

    listFiles: tool({
      description: 'List files in a directory inside the project.',
      inputSchema: z.object({
        dir: z.string().optional().describe('Relative directory, default .'),
      }),
      execute: listFilesStep,
    }),

    readFile: tool({
      description: 'Read a text file inside the project.',
      inputSchema: z.object({ file: z.string().describe('Relative path') }),
      execute: readFileStep,
    }),

    fetchWebsiteText: tool({
      description: 'Fetch a web page and return its visible text.',
      inputSchema: z.object({ url: z.string().describe('https URL') }),
      execute: fetchWebsiteTextStep,
    }),
  },

  stopWhen: isStepCount(8),
});
