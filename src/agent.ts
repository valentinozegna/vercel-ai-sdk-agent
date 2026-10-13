import { ToolLoopAgent, isStepCount, tool } from 'ai';
import { z } from 'zod';
import { readdir, readFile as fsReadFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();

/** Keep file tools sandboxed to the working directory. */
function safePath(p: string): string {
  const resolved = path.resolve(ROOT, p);
  if (resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)) {
    throw new Error('Path escapes the working directory');
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const getCurrentTime = tool({
  description: 'Get the current date and time.',
  inputSchema: z.object({
    timeZone: z
      .string()
      .optional()
      .describe('IANA timezone, e.g. "America/Los_Angeles"'),
  }),
  execute: async ({ timeZone }) => {
    const now = new Date();
    return {
      iso: now.toISOString(),
      local: now.toLocaleString('en-US', timeZone ? { timeZone } : undefined),
      timeZone: timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  },
});

/** Tiny safe arithmetic evaluator (no eval). Supports + - * / % ^ and parens. */
function evaluateExpression(input: string): number {
  const s = input.replace(/\s+/g, '');
  if (s === '' || !/^[\d+\-*/%^().]+$/.test(s)) {
    throw new Error('Invalid characters in expression');
  }
  let i = 0;

  const parseExpr = (): number => {
    let v = parseTerm();
    while (i < s.length && (s[i] === '+' || s[i] === '-')) {
      const op = s[i++];
      const rhs = parseTerm();
      v = op === '+' ? v + rhs : v - rhs;
    }
    return v;
  };
  const parseTerm = (): number => {
    let v = parseFactor();
    while (i < s.length && (s[i] === '*' || s[i] === '/' || s[i] === '%')) {
      const op = s[i++];
      const rhs = parseFactor();
      if ((op === '/' || op === '%') && rhs === 0) throw new Error('Division by zero');
      v = op === '*' ? v * rhs : op === '/' ? v / rhs : v % rhs;
    }
    return v;
  };
  const parseFactor = (): number => {
    const v = parseUnary();
    if (i < s.length && s[i] === '^') {
      i++;
      return Math.pow(v, parseFactor()); // right-associative
    }
    return v;
  };
  const parseUnary = (): number => {
    if (s[i] === '-') {
      i++;
      return -parseUnary();
    }
    if (s[i] === '+') {
      i++;
      return parseUnary();
    }
    return parsePrimary();
  };
  const parsePrimary = (): number => {
    if (s[i] === '(') {
      i++;
      const v = parseExpr();
      if (s[i] !== ')') throw new Error('Mismatched parentheses');
      i++;
      return v;
    }
    const m = /^(\d+(\.\d+)?)/.exec(s.slice(i));
    if (!m) throw new Error(`Unexpected token at position ${i}`);
    i += m[1].length;
    return parseFloat(m[1]);
  };

  const result = parseExpr();
  if (i !== s.length) throw new Error(`Unexpected token at position ${i}`);
  return result;
}

const calculate = tool({
  description: 'Evaluate an arithmetic expression, e.g. "(12 + 7) * 3".',
  inputSchema: z.object({
    expression: z.string().describe('Arithmetic expression using + - * / % ^ and parentheses'),
  }),
  execute: async ({ expression }) => {
    try {
      return { expression, result: evaluateExpression(expression) };
    } catch (err) {
      return { expression, error: (err as Error).message };
    }
  },
});

const listFiles = tool({
  description: 'List files in a directory, relative to the working directory.',
  inputSchema: z.object({
    dir: z.string().default('.').describe('Directory relative to the working directory'),
  }),
  execute: async ({ dir }) => {
    const resolved = safePath(dir);
    const entries = await readdir(resolved, { withFileTypes: true });
    return entries
      .filter(e => !e.name.startsWith('.'))
      .map(e => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' }));
  },
});

const readFile = tool({
  description: 'Read a text file, relative to the working directory.',
  inputSchema: z.object({
    file: z.string().describe('File path relative to the working directory'),
    maxChars: z.number().default(20000).describe('Maximum characters to return'),
  }),
  execute: async ({ file, maxChars }) => {
    const resolved = safePath(file);
    const content = await fsReadFile(resolved, 'utf-8');
    const truncated = content.length > maxChars;
    return {
      file,
      truncated,
      content: truncated ? content.slice(0, maxChars) : content,
    };
  },
});

const fetchWebsite = tool({
  description: 'Fetch a web page and return its text content (HTML stripped).',
  inputSchema: z.object({
    url: z.string().url().describe('The https URL to fetch'),
  }),
  execute: async ({ url }) => {
    const res = await fetch(url, {
      headers: { 'user-agent': 'vercel-ai-sdk-agent/1.0' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { url, error: `HTTP ${res.status}` };
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 10000);
    return { url, text };
  },
});

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

export const agent = new ToolLoopAgent({
  model: process.env.AI_MODEL ?? 'anthropic/claude-sonnet-5.5',
  instructions: `You are a helpful local assistant running in a terminal.
Use your tools when they help answer accurately: check the time, do math,
inspect local files, or fetch web pages. Prefer tools over guessing.
Keep answers concise and in plain text.`,
  tools: {
    getCurrentTime,
    calculate,
    listFiles,
    readFile,
    fetchWebsite,
  },
  stopWhen: isStepCount(20),
});
