import "server-only";
import type { LlmStatus } from "./types";

/**
 * LLM provider configuration. Fill these in `.env.local` (see `.env.example`).
 * When LLM_API_KEY is empty the app runs in demo mode with a heuristic engine.
 */
type Provider = "openai" | "azure" | "anthropic" | "gemini";

const PROVIDER = (process.env.LLM_PROVIDER || "openai").toLowerCase() as Provider;
const API_KEY = process.env.LLM_API_KEY || "";
const MODEL = process.env.LLM_MODEL || defaultModel(PROVIDER);
const BASE_URL = process.env.LLM_BASE_URL || "";
const AZURE_API_VERSION = process.env.AZURE_OPENAI_API_VERSION || "2024-10-21";
const TEMPERATURE = Number(process.env.LLM_TEMPERATURE ?? 0.4);

function defaultModel(p: Provider) {
  switch (p) {
    case "anthropic":
      return "claude-sonnet-4-5";
    case "gemini":
      return "gemini-2.5-pro";
    default:
      return "gpt-4o";
  }
}

export function llmStatus(): LlmStatus {
  return { configured: Boolean(API_KEY), provider: PROVIDER, model: MODEL };
}

export function isLlmConfigured() {
  return Boolean(API_KEY);
}

interface ChatArgs {
  system: string;
  user: string;
  maxTokens?: number;
}

async function post(url: string, headers: Record<string, string>, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`LLM request failed (${res.status}): ${detail.slice(0, 400)}`);
  }
  return res.json();
}

async function chat({ system, user, maxTokens = 8000 }: ChatArgs): Promise<string> {
  switch (PROVIDER) {
    case "anthropic": {
      const data = await post(
        `${BASE_URL || "https://api.anthropic.com"}/v1/messages`,
        { "x-api-key": API_KEY, "anthropic-version": "2023-06-01" },
        {
          model: MODEL,
          max_tokens: maxTokens,
          temperature: TEMPERATURE,
          system,
          messages: [{ role: "user", content: user }],
        },
      );
      return data.content?.map((c: { text?: string }) => c.text ?? "").join("") ?? "";
    }
    case "gemini": {
      const base = BASE_URL || "https://generativelanguage.googleapis.com/v1beta";
      const data = await post(
        `${base}/models/${MODEL}:generateContent`,
        { "x-goog-api-key": API_KEY },
        {
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: {
            temperature: TEMPERATURE,
            maxOutputTokens: maxTokens,
            responseMimeType: "application/json",
          },
        },
      );
      return data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
    }
    case "azure": {
      if (!BASE_URL) throw new Error("LLM_BASE_URL must be set to your Azure OpenAI endpoint.");
      const data = await post(
        `${BASE_URL.replace(/\/$/, "")}/openai/deployments/${MODEL}/chat/completions?api-version=${AZURE_API_VERSION}`,
        { "api-key": API_KEY },
        {
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          temperature: TEMPERATURE,
          max_tokens: maxTokens,
          response_format: { type: "json_object" },
        },
      );
      return data.choices?.[0]?.message?.content ?? "";
    }
    default: {
      // Any OpenAI-compatible endpoint (OpenAI, OpenRouter, Groq, Together, Ollama, vLLM…)
      const data = await post(
        `${(BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "")}/chat/completions`,
        { Authorization: `Bearer ${API_KEY}` },
        {
          model: MODEL,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          temperature: TEMPERATURE,
          max_tokens: maxTokens,
          response_format: { type: "json_object" },
        },
      );
      return data.choices?.[0]?.message?.content ?? "";
    }
  }
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Model did not return JSON.");
  return JSON.parse(candidate.slice(start, end + 1));
}

export async function chatJson<T>(args: ChatArgs): Promise<T> {
  const raw = await chat(args);
  return extractJson(raw) as T;
}
