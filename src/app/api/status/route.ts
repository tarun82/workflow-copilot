import { NextResponse } from "next/server";
import { llmStatus } from "@/lib/llm";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(llmStatus());
}
