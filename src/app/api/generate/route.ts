import { NextResponse } from "next/server";
import { chatJson, isLlmConfigured } from "@/lib/llm";
import { analysisPrompt } from "@/lib/prompts";
import { demoAnalysis } from "@/lib/demo-engine";
import { normalizeAnalysis } from "@/lib/normalize";
import { BUDGETS, buildContext } from "@/lib/context";
import type { Answers, Collateral } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const { answers, collateral } = (await req.json()) as { answers: Answers; collateral: Collateral };
  const ctx = buildContext(collateral, BUDGETS.generate);
  const demo = () => ({ ...demoAnalysis(answers, ctx, collateral.files), ledger: ctx.ledger });

  if (!isLlmConfigured()) return NextResponse.json({ analysis: demo() });

  try {
    const raw = await chatJson<unknown>(analysisPrompt(answers, ctx));
    return NextResponse.json({ analysis: { ...normalizeAnalysis(raw, "llm"), ledger: ctx.ledger } });
  } catch (e) {
    return NextResponse.json({
      analysis: demo(),
      warning: `LLM call failed, used demo engine instead: ${e instanceof Error ? e.message : e}`,
    });
  }
}
