import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import { anthropic } from "eve/models/anthropic";
import { chatgpt, openai } from "eve/models/openai";

/**
 * Model selection, in the spirit of OpenClaw's provider picker.
 *
 * AGENT_MODEL is "<provider>:<model>" or a bare AI Gateway ID:
 *
 *   anthropic/claude-opus-5.5        AI Gateway (AI_GATEWAY_API_KEY)
 *   gateway:openai/gpt-5.5           AI Gateway, explicit
 *   anthropic:claude-opus-5-5        Anthropic API (ANTHROPIC_API_KEY; Max/Team monthly credits work here)
 *   openai:gpt-6-luna-fast           OpenAI API (OPENAI_API_KEY)
 *   google:gemini-4-argon            Gemini API (GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY)
 *   chatgpt:gpt-6-luna-fast          ChatGPT subscription via `eve dev` /login (local only)
 *   local:llama3.3                   Any OpenAI-compatible server, e.g. Ollama (LOCAL_MODEL_BASE_URL)
 *
 * Without AGENT_MODEL, the first available credential wins, in the order above.
 */

export type Provider = "gateway" | "anthropic" | "openai" | "google" | "chatgpt" | "local";

export interface ModelSpec {
  provider: Provider;
  model: string;
}

const PROVIDERS: readonly Provider[] = ["gateway", "anthropic", "openai", "google", "chatgpt", "local"];

/** Default model per provider for the main agent and for lighter helpers like the researcher. */
const DEFAULTS: Record<Provider, { main: string; light: string }> = {
  gateway: { main: "anthropic/claude-opus-5.5", light: "anthropic/claude-sonnet-5.5" },
  anthropic: { main: "claude-opus-5-5", light: "claude-sonnet-5-5" },
  openai: { main: "gpt-6-luna", light: "gpt-6-luna-fast" },
  google: { main: "gemini-4-argon", light: "gemini-3.8-flash" },
  chatgpt: { main: "gpt-6-luna-fast", light: "gpt-6-luna-fast" },
  local: { main: "llama3.3", light: "llama3.3" },
};

function geminiApiKey(): string | undefined {
  return process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || undefined;
}

/** Provider implied by whichever credential is configured. */
export function detectProvider(): Provider {
  if (process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN) return "gateway";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  if (geminiApiKey()) return "google";
  if (process.env.LOCAL_MODEL_BASE_URL) return "local";
  return "gateway";
}

export function parseModelSpec(raw: string | undefined, role: "main" | "light" = "main"): ModelSpec {
  const value = raw?.trim();
  if (!value) {
    const provider = detectProvider();
    return { provider, model: DEFAULTS[provider][role] };
  }

  const colon = value.indexOf(":");
  if (colon > 0) {
    const prefix = value.slice(0, colon) as Provider;
    if (PROVIDERS.includes(prefix)) {
      return { provider: prefix, model: value.slice(colon + 1) || DEFAULTS[prefix][role] };
    }
  }
  // A bare "vendor/model" ID routes through AI Gateway.
  return { provider: "gateway", model: value };
}

/** Builds the concrete model. Gateway models stay strings so eve routes them itself. */
export function createModel(spec: ModelSpec): LanguageModel | string {
  switch (spec.provider) {
    case "gateway":
      return spec.model;
    case "anthropic":
      return anthropic(spec.model);
    case "openai":
      return openai(spec.model);
    case "chatgpt":
      return chatgpt(spec.model);
    case "google":
      return createGoogleGenerativeAI({ apiKey: geminiApiKey() })(spec.model);
    case "local":
      return createOpenAICompatible({
        name: "local",
        baseURL: process.env.LOCAL_MODEL_BASE_URL ?? "http://127.0.0.1:11434/v1",
        apiKey: process.env.LOCAL_MODEL_API_KEY,
      })(spec.model);
  }
}

/**
 * Context window for models AI Gateway's catalog may not know (direct and local
 * providers). eve uses it to decide when to compact.
 */
export function contextWindowFor(spec: ModelSpec): number | undefined {
  const override = Number(process.env.AGENT_CONTEXT_WINDOW);
  if (Number.isFinite(override) && override > 0) return override;
  if (spec.provider === "local") return 32_000;
  return undefined;
}

/** The selection eve's dynamic model resolver returns for one step. */
export function modelSelection(raw: string | undefined, role: "main" | "light") {
  const spec = parseModelSpec(raw, role);
  return {
    model: createModel(spec),
    // Local servers often reject reasoning options; let them use their default.
    reasoning: spec.provider === "local" ? ("provider-default" as const) : ("medium" as const),
    modelContextWindowTokens: contextWindowFor(spec),
  };
}

export function describeSpec(spec: ModelSpec): string {
  return `${spec.provider}:${spec.model}`;
}
