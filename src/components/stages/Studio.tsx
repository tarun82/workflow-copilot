"use client";

import { useState } from "react";
import { ArrowRight, Bot, Files, Scale, Sparkles } from "lucide-react";
import { CoverageBadge, ROLE_META } from "@/components/Collateral";
import { Badge, Button, Card, cx } from "@/components/ui";
import { SECTIONS, type SectionId } from "@/lib/questions";
import {
  DataRequirements,
  FutureState,
  Indicators,
  Interventions,
  PainMap,
  Predictions,
  Prototypes,
  WorkflowMap,
} from "@/components/sections";
import type { StageProps } from "./shared";

export function Studio({ session, update }: StageProps) {
  const a = session.analysis!;
  const [tab, setTab] = useState<SectionId>("map");
  const toReview = () => update({ stage: "facilitate" });
  const undecided = (session.baseline ?? a).predictions.filter((p) => (session.reviews[p.id]?.verdict ?? "undecided") === "undecided").length;

  const stats = [
    { label: "Steps", value: a.workflowMap.length },
    { label: "Pain points", value: a.painPoints.length },
    { label: "Late discoveries", value: a.painPoints.filter((p) => p.discoveredLate).length },
    { label: "Predictions", value: a.predictions.length },
    { label: "Data gaps", value: a.dataRequirements.filter((d) => d.availability !== "available").length },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Reimagination studio</h1>
            <Badge tone={a.source === "llm" ? "emerald" : "amber"}>
              <Sparkles className="size-3" /> {a.source === "llm" ? "AI generated" : "Demo engine"}
            </Badge>
            {a.refinedFromReview && <Badge tone="emerald">Refined by team review</Badge>}
          </div>
          <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-400">{a.summary}</p>
        </div>
        <Button variant="primary" onClick={toReview} icon={<Scale className="size-4" />}>
          Team review {undecided > 0 && <span className="rounded-full bg-white/20 px-1.5 text-[11px] dark:bg-zinc-900/15">{undecided}</span>}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stats.map((s) => (
          <Card key={s.label} className="px-4 py-3">
            <div className="text-2xl font-semibold tabular-nums">{s.value}</div>
            <div className="text-xs text-zinc-500">{s.label}</div>
          </Card>
        ))}
      </div>

      {a.openQuestions.length > 0 && (
        <Card className="flex gap-3 p-4">
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-white">
            <Bot className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium">Before you trust any of this, the copilot needs your team to answer:</div>
            <ul className="mt-1.5 space-y-1 text-[13px] text-zinc-600 dark:text-zinc-400">
              {a.openQuestions.slice(0, 5).map((q) => (
                <li key={q} className="flex gap-2">
                  <span className="text-indigo-500">?</span> {q}
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      {a.ledger && a.ledger.length > 0 && (
        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <Files className="size-4 text-indigo-500" /> Sources studied for this pack
          </div>
          <ul className="flex flex-wrap gap-2">
            {a.ledger.map((l) => (
              <li key={l.file} className="flex items-center gap-2 rounded-lg bg-zinc-50 px-2.5 py-1.5 text-[12px] ring-1 ring-zinc-200/70 dark:bg-zinc-950 dark:ring-zinc-800">
                <span className="max-w-[220px] truncate font-medium">{l.file}</span>
                <Badge tone={ROLE_META[l.role].tone}>{ROLE_META[l.role].label}</Badge>
                <CoverageBadge entry={l} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <nav className="no-print sticky top-14 z-10 -mx-1 overflow-x-auto bg-zinc-50 px-1 py-2 [scrollbar-width:none] dark:bg-zinc-950">
        <div className="flex w-max gap-1 rounded-2xl bg-zinc-200/50 p-1 dark:bg-zinc-800/50">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setTab(s.id)}
              className={cx(
                "flex items-center gap-2 rounded-xl px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition",
                tab === s.id ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-white" : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200",
              )}
            >
              <span className={cx("grid size-5 place-items-center rounded-md text-[10px]", tab === s.id ? "bg-gradient-to-br from-indigo-500 to-violet-500 text-white" : "bg-zinc-300/60 dark:bg-zinc-700")}>
                {s.key}
              </span>
              {s.title}
            </button>
          ))}
        </div>
      </nav>

      <div key={tab} className="animate-rise">
        {tab === "map" && <WorkflowMap analysis={a} />}
        {tab === "pain" && (
          <PainMap
            analysis={a}
            reactions={session.painReactions}
            onReact={(id, r) => update((s) => ({ painReactions: { ...s.painReactions, [id]: r } }))}
          />
        )}
        {tab === "predictions" && <Predictions analysis={a} reviews={session.reviews} onReview={toReview} />}
        {tab === "indicators" && <Indicators analysis={a} />}
        {tab === "interventions" && <Interventions analysis={a} onReview={toReview} />}
        {tab === "future" && <FutureState analysis={a} onReview={toReview} />}
        {tab === "data" && <DataRequirements analysis={a} />}
        {tab === "prototypes" && <Prototypes analysis={a} onReview={toReview} />}
      </div>

      <div className="flex justify-end pt-2">
        {tab !== "prototypes" ? (
          <Button
            variant="ghost"
            onClick={() => setTab(SECTIONS[SECTIONS.findIndex((s) => s.id === tab) + 1].id)}
          >
            Next: {SECTIONS[SECTIONS.findIndex((s) => s.id === tab) + 1].title} <ArrowRight className="size-4" />
          </Button>
        ) : (
          <Button variant="primary" onClick={toReview} icon={<Scale className="size-4" />}>
            Ask the team: which predictions are actionable? <ArrowRight className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
