import { NextResponse } from "next/server";
import { chatJson, isLlmConfigured } from "@/lib/llm";
import { digestPrompt } from "@/lib/prompts";

export const runtime = "nodejs";
export const maxDuration = 300;

const CHUNK = 24_000;

/** Map step for long documents: condense each chunk to workflow facts so nothing is silently dropped. */
export async function POST(req: Request) {
  const { name, text } = (await req.json()) as { name: string; text: string };
  if (!isLlmConfigured()) return NextResponse.json({ digest: null, reason: "demo-mode" });

  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += CHUNK) chunks.push(text.slice(i, i + CHUNK));

  try {
    const facts = await Promise.all(
      chunks.map((c, i) =>
        chatJson<{ facts?: string }>({ ...digestPrompt(name, c, i + 1, chunks.length), maxTokens: 1500 }).then(
          (r) => r.facts?.trim() ?? "",
        ),
      ),
    );
    return NextResponse.json({ digest: facts.filter(Boolean).join("\n\n") });
  } catch (e) {
    return NextResponse.json({ digest: null, reason: e instanceof Error ? e.message : String(e) });
  }
}
