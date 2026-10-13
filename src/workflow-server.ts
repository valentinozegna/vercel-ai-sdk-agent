/**
 * Local durable-run server for the WorkflowAgent demo.
 *
 * 1. Build the bundles:  npx workflow build -t standalone
 * 2. Run this server:    npm run workflow-server
 *    (serves the workflow queue consumer at /.well-known/workflow/v1/flow)
 * 3. Start a run:        curl -X POST localhost:3457/run -d '{"prompt":"..."}'
 * 4. Poll the result:    curl localhost:3457/result/<runId>
 * 5. Inspect:            npx workflow inspect runs   /   npx workflow web
 *
 * Runs are checkpointed to .workflow-data/ — kill and restart this server
 * mid-run and the workflow resumes from its last completed step.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { start, getRun } from 'workflow/api';
import { chat } from './workflows/chat.js';

const PORT = Number(process.env.WORKFLOW_PORT ?? 3457);
const REPO_ROOT = new URL('../', import.meta.url);

// The workflow ID is assigned by the workflow compiler; read it from the
// build manifest instead of hardcoding it.
const manifest = JSON.parse(
  await readFile(
    new URL('.well-known/workflow/v1/manifest.json', REPO_ROOT),
    'utf-8',
  ),
);
const workflowId: string =
  manifest.workflows['src/workflows/chat.ts'].chat.workflowId;
(chat as unknown as { workflowId: string }).workflowId = workflowId;

const flow = (await import(
  new URL('.well-known/workflow/v1/flow.mjs', REPO_ROOT).href
)) as { POST: (req: Request) => Promise<Response> };

async function readBody(
  req: import('node:http').IncomingMessage,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  // Workflow queue consumer (called by the local world on every step).
  if (url.pathname === '/.well-known/workflow/v1/flow') {
    const body = await readBody(req);
    const request = new Request(url, {
      method: req.method,
      headers: req.headers as unknown as HeadersInit,
      body:
        req.method === 'GET' || req.method === 'HEAD'
          ? undefined
          : new Uint8Array(body),
    });
    const response = await flow.POST(request);
    res.writeHead(
      response.status,
      Object.fromEntries(response.headers.entries()),
    );
    res.end(Buffer.from(await response.arrayBuffer()));
    return;
  }

  // Start a durable agent run.
  if (url.pathname === '/run' && req.method === 'POST') {
    const { prompt } = JSON.parse((await readBody(req)).toString() || '{}');
    const run = await start(chat as never, [
      prompt ?? 'What is (12 + 7) * 3?',
    ]);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ runId: run.runId }));
    return;
  }

  // Poll until the run completes, then return its value.
  if (url.pathname.startsWith('/result/') && req.method === 'GET') {
    const runId = url.pathname.split('/')[2];
    const run = await getRun(runId);
    const status = await run.status;
    if (status !== 'completed') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ runId, status }));
      return;
    }
    const value = await run.returnValue;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ runId, status, value }));
    return;
  }

  res.writeHead(404);
  res.end('not found');
}).listen(PORT, () => {
  console.log(`workflow server on http://localhost:${PORT}`);
});
