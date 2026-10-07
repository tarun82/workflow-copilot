"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Bot, Check, CircleDashed, CircleCheck, Sparkles, RotateCcw, CircleAlert } from "lucide-react";
import { Badge, Button, Card, cx } from "@/components/ui";
import { QUESTIONS } from "@/lib/questions";
import type { Answer } from "@/lib/types";
import { collateral, type StageProps } from "./shared";

const CONF_TONE = { high: "emerald", medium: "amber", low: "rose" } as const;

export function Interview({ session, update }: StageProps) {
  const firstOpen = QUESTIONS.findIndex((q) => !session.answers[q.id]?.confirmed);
  const [idx, setIdx] = useState(firstOpen === -1 ? QUESTIONS.length - 1 : firstOpen);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  const q = QUESTIONS[idx];
  const a: Answer = session.answers[q.id];
  const confirmedCount = QUESTIONS.filter((x) => session.answers[x.id]?.confirmed).length;
  const answeredCount = QUESTIONS.filter((x) => session.answers[x.id]?.value.trim()).length;
  const unconfirmedDrafts = QUESTIONS.filter((x) => session.answers[x.id]?.value.trim() && !session.answers[x.id].confirmed).length;

  useEffect(() => {
    ref.current?.focus();
  }, [idx]);

  const setAnswer = (patch: Partial<Answer>) =>
    update((s) => ({ answers: { ...s.answers, [q.id]: { ...s.answers[q.id], ...patch } } }));

  const confirmAndNext = () => {
    setAnswer({ confirmed: true });
    if (idx < QUESTIONS.length - 1) setIdx(idx + 1);
  };

  async function generate() {
    setGenerating(true);
    setError("");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: session.answers, collateral: collateral(session) }),
      });
      const data = await res.json();
      if (!data.analysis) throw new Error(data.error || "Generation failed.");
      update({ analysis: data.analysis, baseline: undefined, reviews: {}, painReactions: {}, stage: "studio", notice: data.warning });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed.");
      setGenerating(false);
    }
  }

  const progress = (confirmedCount / QUESTIONS.length) * 100;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_260px]">
      <div>
        <div className="mb-8">
          <div className="mb-2 flex items-center justify-between text-xs text-zinc-500">
            <span>Discovery interview</span>
            <span>
              {confirmedCount} of {QUESTIONS.length} confirmed by team
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200/70 dark:bg-zinc-800">
            <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div key={q.id} className="animate-rise">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-indigo-600 dark:text-indigo-400">
            <span className="grid size-6 place-items-center rounded-md bg-indigo-50 text-xs dark:bg-indigo-500/15">{idx + 1}</span>
            Question {idx + 1} of {QUESTIONS.length}
          </div>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">{q.title}</h2>
          <p className="mt-3 text-lg text-zinc-600 dark:text-zinc-300">{q.prompt}</p>
          <p className="mt-1 text-sm text-zinc-500">{q.hint}</p>

          {a.aiDraft && (
            <div className="mt-6 flex flex-wrap items-center gap-2 text-xs">
              <Badge tone="violet">
                <Sparkles className="size-3" /> Drafted from your material
              </Badge>
              {a.confidence && <Badge tone={CONF_TONE[a.confidence]}>{a.confidence} confidence</Badge>}
              {a.confirmed ? (
                <Badge tone="emerald">
                  <Check className="size-3" /> Confirmed by team
                </Badge>
              ) : (
                <span className="text-zinc-500">Please check — AI drafts can be wrong.</span>
              )}
              {a.value !== a.aiDraft && (
                <button onClick={() => setAnswer({ value: a.aiDraft!, confirmed: false })} className="ml-auto inline-flex items-center gap-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
                  <RotateCcw className="size-3" /> Restore AI draft
                </button>
              )}
            </div>
          )}

          <textarea
            ref={ref}
            value={a.value}
            onChange={(e) => setAnswer({ value: e.target.value, confirmed: false })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                confirmAndNext();
              }
            }}
            rows={q.id === "steps" ? 9 : 5}
            placeholder={q.placeholder}
            className={cx(
              "mt-3 w-full resize-y rounded-2xl bg-white p-5 text-[15px] leading-relaxed shadow-sm ring-1 outline-none placeholder:text-zinc-400 focus:ring-2 focus:ring-indigo-500 dark:bg-zinc-900",
              a.confirmed ? "ring-emerald-300 dark:ring-emerald-500/40" : "ring-zinc-200 dark:ring-zinc-800",
            )}
          />

          {a.followUp && (
            <Card className="mt-4 flex gap-3 p-4">
              <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-white">
                <Bot className="size-4" />
              </div>
              <div>
                <div className="text-xs font-medium text-zinc-500">The copilot wants to probe further</div>
                <p className="mt-0.5 text-sm">{a.followUp}</p>
                <p className="mt-1 text-xs text-zinc-500">Discuss as a team and fold the answer into the box above.</p>
              </div>
            </Card>
          )}

          <div className="mt-6 flex items-center gap-3">
            <Button variant="ghost" disabled={idx === 0} onClick={() => setIdx(idx - 1)} icon={<ArrowLeft className="size-4" />}>
              Back
            </Button>
            <div className="flex-1" />
            {idx < QUESTIONS.length - 1 ? (
              <>
                <span className="hidden text-xs text-zinc-400 sm:inline">Ctrl + Enter</span>
                <Button variant="primary" onClick={confirmAndNext}>
                  {a.value.trim() ? "Confirm & next" : "Skip for now"} <ArrowRight className="size-4" />
                </Button>
              </>
            ) : (
              <Button variant="secondary" onClick={() => setAnswer({ confirmed: true })} icon={<Check className="size-4" />} disabled={a.confirmed}>
                {a.confirmed ? "Confirmed" : "Confirm answer"}
              </Button>
            )}
          </div>
        </div>
      </div>

      <aside className="space-y-4">
        <Card className="p-3">
          <ol className="space-y-0.5">
            {QUESTIONS.map((x, i) => {
              const ans = session.answers[x.id];
              const state = ans.confirmed ? "confirmed" : ans.value.trim() ? "draft" : "empty";
              return (
                <li key={x.id}>
                  <button
                    onClick={() => setIdx(i)}
                    className={cx(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition",
                      i === idx ? "bg-zinc-100 font-medium dark:bg-zinc-800" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50",
                    )}
                  >
                    {state === "confirmed" ? (
                      <CircleCheck className="size-4 shrink-0 text-emerald-500" />
                    ) : state === "draft" ? (
                      <Sparkles className="size-4 shrink-0 text-violet-500" />
                    ) : (
                      <CircleDashed className="size-4 shrink-0 text-zinc-300 dark:text-zinc-600" />
                    )}
                    <span className="truncate">{x.title}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </Card>

        <Card className="p-4">
          <div className="text-sm font-medium">Ready to reimagine?</div>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">
            {answeredCount < 3
              ? "Answer at least 3 questions — the steps question matters most."
              : unconfirmedDrafts
                ? `${unconfirmedDrafts} AI-drafted answer${unconfirmedDrafts > 1 ? "s are" : " is"} not yet confirmed by the team. You can still proceed, but outputs will inherit any mistakes.`
                : "All answers confirmed. The copilot will generate outputs A–H as hypotheses for your team to challenge."}
          </p>
          <Button
            variant="primary"
            className="mt-3 w-full"
            loading={generating}
            disabled={answeredCount < 3}
            onClick={generate}
            icon={!generating && <Sparkles className="size-4" />}
          >
            {generating ? "Reimagining…" : session.analysis ? "Regenerate pack" : "Generate pack"}
          </Button>
          {session.analysis && !generating && (
            <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">Regenerating clears the team&apos;s review votes.</p>
          )}
          {error && (
            <p className="mt-2 flex gap-1.5 text-xs text-rose-600">
              <CircleAlert className="size-3.5 shrink-0" /> {error}
            </p>
          )}
        </Card>
      </aside>
    </div>
  );
}
