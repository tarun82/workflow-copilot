import { NextResponse } from "next/server";
import { chatJson, isLlmConfigured } from "@/lib/llm";
import { interviewPrompt } from "@/lib/prompts";
import { demoInterview } from "@/lib/demo-engine";
import { BUDGETS, buildContext } from "@/lib/context";
import type { Collateral } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const { collateral } = (await req.json()) as { collateral: Collateral };
  if (!collateral?.rawText?.trim() && !collateral?.files?.length) {
    return NextResponse.json({ error: "Nothing to analyse yet." }, { status: 400 });
  }
  const ctx = buildContext(collateral, BUDGETS.interview);

  if (!isLlmConfigured()) return NextResponse.json({ ...demoInterview(ctx, collateral.files), ledger: ctx.ledger, mode: "demo" });

  try {
    const data = await chatJson<ReturnType<typeof demoInterview>>({ ...interviewPrompt(ctx), maxTokens: 3500 });
    return NextResponse.json({ ...data, ledger: ctx.ledger, mode: "llm" });
  } catch (e) {
    return NextResponse.json({
      ...demoInterview(ctx, collateral.files),
      ledger: ctx.ledger,
      mode: "demo",
      warning: `LLM call failed, used demo engine instead: ${e instanceof Error ? e.message : e}`,
    });
  }
}
