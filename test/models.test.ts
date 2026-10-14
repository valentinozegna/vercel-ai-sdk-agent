import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { claudeCodeAuth, claudeCodeConfigured } from "../agent/lib/claude-code";
import { detectProvider, parseModelSpec } from "../agent/lib/models";

const KEYS = [
  "AI_GATEWAY_API_KEY",
  "VERCEL_OIDC_TOKEN",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "LOCAL_MODEL_BASE_URL",
  "CLAUDE_CODE_AUTH",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "VERCEL_TOKEN",
  "VERCEL_TEAM_ID",
  "VERCEL_PROJECT_ID",
];
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("model selection", () => {
  it("parses explicit providers and bare gateway IDs", () => {
    assert.deepEqual(parseModelSpec("google:gemini-3.8-flash"), { provider: "google", model: "gemini-3.8-flash" });
    assert.deepEqual(parseModelSpec("anthropic:claude-opus-5-5"), { provider: "anthropic", model: "claude-opus-5-5" });
    assert.deepEqual(parseModelSpec("anthropic/claude-opus-5.5"), { provider: "gateway", model: "anthropic/claude-opus-5.5" });
    assert.deepEqual(parseModelSpec("local:"), { provider: "local", model: "llama3.3" });
  });

  it("detects the provider from the configured credential", () => {
    assert.equal(detectProvider(), "gateway");
    process.env.GEMINI_API_KEY = "x";
    assert.equal(detectProvider(), "google");
    process.env.ANTHROPIC_API_KEY = "x";
    assert.equal(detectProvider(), "anthropic");
    process.env.AI_GATEWAY_API_KEY = "x";
    assert.equal(detectProvider(), "gateway");
  });

  it("picks the lighter default model for helpers", () => {
    process.env.GEMINI_API_KEY = "x";
    assert.deepEqual(parseModelSpec(undefined, "light"), { provider: "google", model: "gemini-3.8-flash" });
  });
});

describe("Claude Code auth", () => {
  it("defaults to the machine's subscription login", () => {
    assert.equal(claudeCodeAuth(), "direct");
  });

  it("uses an explicit subscription token in isolation", () => {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "tok";
    process.env.ANTHROPIC_API_KEY = "key";
    assert.deepEqual(claudeCodeAuth(), { CLAUDE_CODE_OAUTH_TOKEN: "tok" });
  });

  it("refuses to silently bill an API key in subscription mode", () => {
    process.env.ANTHROPIC_API_KEY = "key";
    assert.throws(() => claudeCodeAuth(), /setup-token/);
  });

  it("supports API-key and gateway billing", () => {
    process.env.CLAUDE_CODE_AUTH = "api-key";
    process.env.ANTHROPIC_API_KEY = "key";
    assert.deepEqual(claudeCodeAuth(), { ANTHROPIC_API_KEY: "key" });
    process.env.CLAUDE_CODE_AUTH = "gateway";
    assert.equal(claudeCodeAuth(), "ai-gateway");
  });

  it("requires Vercel Sandbox credentials", () => {
    assert.equal(claudeCodeConfigured().ok, false);
    process.env.VERCEL_TOKEN = "t";
    process.env.VERCEL_TEAM_ID = "team";
    process.env.VERCEL_PROJECT_ID = "prj";
    assert.equal(claudeCodeConfigured().ok, true);
  });
});
