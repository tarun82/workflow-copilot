import { NextResponse } from "next/server";
import { chatJson, isLlmConfigured } from "@/lib/llm";
import { refinePrompt } from "@/lib/prompts";
import { demoRefine } from "@/lib/demo-engine";
import { normalizeAnalysis } from "@/lib/normalize";
import { BUDGETS, buildContext } from "@/lib/context";
import type { Analysis, Collateral, PredictionReview } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const { analysis, reviews, collateral } = (await req.json()) as {
    analysis: Analysis;
    reviews: Record<string, PredictionReview>;
    collateral?: Collateral;
  };
  const files = collateral?.files ?? [];

  if (!isLlmConfigured() || analysis.source === "demo") {
    return NextResponse.json({ analysis: demoRefine(analysis, reviews, files) });
  }

  try {
    const ctx = buildContext({ rawText: "", files: files.filter((f) => f.role === "metrics") }, BUDGETS.refine);
    const raw = await chatJson<unknown>(refinePrompt(analysis, reviews, ctx));
    const refined = normalizeAnalysis(raw, "llm");
    const rejected = new Set(
      Object.entries(reviews)
        .filter(([, r]) => r.verdict === "not-actionable")
        .map(([id]) => id),
    );
    // The team's verdict is final: strip anything the model tried to bring back.
    refined.predictions = refined.predictions.filter((p) => !rejected.has(p.id));
    refined.interventions = refined.interventions.filter((i) => !rejected.has(i.predictionId));
    refined.leadingIndicators = refined.leadingIndicators.filter((i) => !rejected.has(i.predictionId));
    refined.refinedFromReview = true;
    refined.ledger = analysis.ledger;
    return NextResponse.json({ analysis: refined });
  } catch (e) {
    return NextResponse.json({
      analysis: demoRefine(analysis, reviews, files),
      warning: `LLM call failed, used rule-based refinement instead: ${e instanceof Error ? e.message : e}`,
    });
  }
}
