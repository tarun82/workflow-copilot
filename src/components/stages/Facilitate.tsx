"use client";

import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  CircleAlert,
  CircleCheck,
  CircleX,
  Database,
  Minus,
  Plus,
  RefreshCw,
  Users,
} from "lucide-react";
import { Badge, Button, Card, cx } from "@/components/ui";
import { PredictionCard, VerdictBadge } from "@/components/sections";
import { CRITERIA } from "@/lib/questions";
import { emptyReview } from "@/lib/store";
import type { CriterionKey, PredictionReview, Verdict } from "@/lib/types";
import { collateral, type StageProps } from "./shared";
import { describeColumn, matchColumns } from "@/lib/context";

const VERDICTS: { id: Exclude<Verdict, "undecided">; label: string; icon: typeof CircleCheck; cls: string; vote: keyof PredictionReview["votes"] }[] = [
  { id: "actionable", label: "Actionable", icon: CircleCheck, cls: "bg-emerald-600 text-white ring-emerald-600", vote: "actionable" },
  { id: "needs-data", label: "Needs data first", icon: Database, cls: "bg-sky-600 text-white ring-sky-600", vote: "needsData" },
  { id: "not-actionable", label: "Not actionable", icon: CircleX, cls: "bg-rose-600 text-white ring-rose-600", vote: "notActionable" },
];

function suggest(c: PredictionReview["criteria"]): Verdict | null {
  const vals = Object.values(c);
  if (vals.every((v) => v === null)) return null;
  if (c.owner === false || c.lever === false || c.leadTime === false) return "not-actionable";
  if (c.data === false) return "needs-data";
  if (vals.every((v) => v === true)) return "actionable";
  return null;
}

/** The copilot challenges verdicts that contradict the team's own checklist. */
function pushback(r: PredictionReview): string | null {
  const no = CRITERIA.filter((c) => r.criteria[c.key] === false).map((c) => c.label.toLowerCase());
  const unknown = CRITERIA.filter((c) => r.criteria[c.key] === null).map((c) => c.label.toLowerCase());
  if (r.verdict === "actionable" && no.length)
    return `You marked this actionable, but also said "no" to: ${no.join(", ")}. What would make it actionable despite that?`;
  if (r.verdict === "actionable" && unknown.length >= 3)
    return `Most of the checklist is still unanswered. Are you confident someone would act on this on Monday morning?`;
  if (r.verdict === "not-actionable" && CRITERIA.every((c) => r.criteria[c.key] === true))
    return "Every check passed, yet you rejected it. Capture why — that reason is valuable for the report.";
  const { actionable, notActionable, needsData } = r.votes;
  const total = actionable + notActionable + needsData;
  if (total >= 3 && r.verdict !== "undecided") {
    const top = Math.max(actionable, notActionable, needsData);
    const map = { actionable, "not-actionable": notActionable, "needs-data": needsData } as const;
    if (map[r.verdict as keyof typeof map] < top) return "The room's votes lean a different way than this verdict. Worth one more round of discussion?";
  }
  if (r.verdict !== "undecided" && !r.rationale.trim()) return "Add a sentence on why — the rationale is what makes this decision reusable.";
  return null;
}

/** Shows which uploaded columns could feed this prediction, to inform the "Data exists" check. */
function DataEvidence({ session, predictionId }: { session: StageProps["session"]; predictionId: string }) {
  const base = session.baseline ?? session.analysis!;
  const p = base.predictions.find((x) => x.id === predictionId)!;
  const datasets = session.files.filter((f) => f.role === "metrics" && f.sheets?.length);
  const indicators = base.leadingIndicators.filter((d) => d.predictionId === p.id);
  const step = base.workflowMap.find((s) => s.id === p.stepId);
  const matches = matchColumns(
    [p.title, p.whatToPredict, p.whenPredicted, step?.description, p.evidence, ...indicators.flatMap((d) => [d.name, d.signal, d.source])].join(" "),
    datasets,
    6,
  );

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Database className="size-4 text-emerald-600" /> Evidence from your data
      </div>
      {!datasets.length ? (
        <p className="mt-1.5 text-[13px] text-zinc-500">
          No metrics files were uploaded, so the &ldquo;Data exists&rdquo; check rests on team knowledge. Upload an export on the first
          screen to ground this.
        </p>
      ) : matches.length === 0 ? (
        <p className="mt-1.5 text-[13px] text-amber-700 dark:text-amber-300">
          None of the {datasets.length} uploaded dataset{datasets.length > 1 ? "s" : ""} has columns that obviously match this prediction.
          That may point to &ldquo;Needs data first&rdquo; — or the data lives elsewhere.
        </p>
      ) : (
        <>
          <p className="mt-1 text-[12px] text-zinc-500">Columns that could feed this prediction (matched by name — the team should confirm):</p>
          <ul className="mt-2 space-y-1.5">
            {matches.map((m) => (
              <li key={`${m.file}${m.sheet}${m.column.name}`} className="rounded-lg bg-zinc-50 px-3 py-2 text-[12.5px] ring-1 ring-zinc-200/70 dark:bg-zinc-950 dark:ring-zinc-800">
                <span className="text-zinc-500">
                  {m.file} › {m.sheet} ›{" "}
                </span>
                <span className="font-medium">{describeColumn(m.column)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {p.evidence && !p.evidence.split(/;\s*/).every((e) => matches.some((m) => e === `${m.file} › ${m.sheet} › ${m.column.name}`)) && (
        <p className="mt-2 text-[12px] text-zinc-500">AI noted: {p.evidence}</p>
      )}
    </Card>
  );
}

export function Facilitate({ session, update }: StageProps) {
  const base = session.baseline ?? session.analysis!;
  const preds = base.predictions;
  const [idx, setIdx] = useState(() => Math.max(0, preds.findIndex((p) => (session.reviews[p.id]?.verdict ?? "undecided") === "undecided")));
  const [rebuilding, setRebuilding] = useState(false);
  const [error, setError] = useState("");

  const p = preds[idx];
  const r: PredictionReview = session.reviews[p.id] ?? emptyReview();
  const setReview = (patch: Partial<PredictionReview>) =>
    update((s) => ({ reviews: { ...s.reviews, [p.id]: { ...(s.reviews[p.id] ?? emptyReview()), ...patch } } }));

  const setCriterion = (k: CriterionKey, v: boolean | null) => setReview({ criteria: { ...r.criteria, [k]: v } });
  const vote = (k: keyof PredictionReview["votes"], d: number) => setReview({ votes: { ...r.votes, [k]: Math.max(0, r.votes[k] + d) } });

  const verdictOf = (id: string) => session.reviews[id]?.verdict ?? "undecided";
  const tally = {
    actionable: preds.filter((x) => verdictOf(x.id) === "actionable").length,
    "needs-data": preds.filter((x) => verdictOf(x.id) === "needs-data").length,
    "not-actionable": preds.filter((x) => verdictOf(x.id) === "not-actionable").length,
  };
  const decided = tally.actionable + tally["needs-data"] + tally["not-actionable"];
  const suggestion = suggest(r.criteria);
  const challenge = pushback(r);

  async function rebuild() {
    setRebuilding(true);
    setError("");
    try {
      const res = await fetch("/api/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysis: base, reviews: session.reviews, collateral: collateral(session) }),
      });
      const data = await res.json();
      if (!data.analysis) throw new Error(data.error || "Refinement failed.");
      update({ baseline: base, analysis: data.analysis, stage: "studio", notice: data.warning });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refinement failed.");
      setRebuilding(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-gradient-to-br from-zinc-900 via-indigo-950 to-violet-950 p-7 text-white shadow-xl sm:p-9">
        <div className="flex items-center gap-2 text-xs font-medium text-indigo-200">
          <Users className="size-3.5" /> Team review · facilitator mode
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          “Which of these predictions are <span className="text-indigo-300">actually actionable</span>?”
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] text-indigo-100/80">
          The copilot proposed {preds.length} predictions. It won&apos;t accept its own ideas — your team decides. Only predictions you mark
          actionable will shape the interventions, future state and prototypes.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-4 text-sm">
          <div className="h-2 w-48 overflow-hidden rounded-full bg-white/15">
            <div className="h-full rounded-full bg-white transition-all" style={{ width: `${(decided / preds.length) * 100}%` }} />
          </div>
          <span className="text-indigo-100/80">
            {decided}/{preds.length} decided
          </span>
          <span className="flex gap-3 text-xs text-indigo-100/70">
            <span>✓ {tally.actionable} actionable</span>
            <span>◌ {tally["needs-data"]} need data</span>
            <span>✕ {tally["not-actionable"]} rejected</span>
          </span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <Card className="h-fit p-2">
          <ol className="space-y-0.5">
            {preds.map((x, i) => (
              <li key={x.id}>
                <button
                  onClick={() => setIdx(i)}
                  className={cx(
                    "w-full rounded-xl px-3 py-2.5 text-left transition",
                    i === idx ? "bg-zinc-100 dark:bg-zinc-800" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50",
                  )}
                >
                  <div className="text-[13px] leading-snug font-medium">
                    <span className="text-zinc-400">{i + 1}.</span> {x.title}
                  </div>
                  <div className="mt-1.5">
                    <VerdictBadge verdict={verdictOf(x.id)} />
                  </div>
                </button>
              </li>
            ))}
          </ol>
        </Card>

        <div key={p.id} className="animate-rise space-y-5">
          <Card className="p-6">
            <PredictionCard p={p} analysis={base} verdict={r.verdict} />
          </Card>

          {p.facilitatorQuestions.length > 0 && (
            <Card className="flex gap-3 p-5">
              <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-white">
                <Bot className="size-4" />
              </div>
              <div>
                <div className="text-sm font-medium">Debate these before deciding</div>
                <ul className="mt-2 space-y-1.5 text-[13.5px] text-zinc-700 dark:text-zinc-300">
                  {p.facilitatorQuestions.map((q) => (
                    <li key={q} className="flex gap-2">
                      <span className="text-indigo-500">→</span> {q}
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          )}

          <DataEvidence session={session} predictionId={p.id} />

          <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-medium">Actionability checklist</div>
                {suggestion && (
                  <span className="text-xs text-zinc-500">
                    Checklist points to: <VerdictBadge verdict={suggestion} />
                  </span>
                )}
              </div>
              <ul className="space-y-2.5">
                {CRITERIA.map((c) => {
                  const v = r.criteria[c.key];
                  return (
                    <li key={c.key} className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium">{c.label}</div>
                        <div className="text-[12px] text-zinc-500">{c.question}</div>
                      </div>
                      <div className="flex shrink-0 overflow-hidden rounded-lg ring-1 ring-zinc-200 dark:ring-zinc-700">
                        {([
                          [true, "Yes", "bg-emerald-600 text-white"],
                          [null, "?", "bg-zinc-200 dark:bg-zinc-700"],
                          [false, "No", "bg-rose-600 text-white"],
                        ] as const).map(([val, label, on]) => (
                          <button
                            key={label}
                            onClick={() => setCriterion(c.key, val)}
                            className={cx("px-2.5 py-1 text-xs font-medium transition", v === val ? on : "text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800")}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>

            <Card className="p-5">
              <div className="mb-1 text-sm font-medium">Room vote</div>
              <p className="mb-3 text-[12px] text-zinc-500">Count hands (or dots on a whiteboard).</p>
              <ul className="space-y-2">
                {VERDICTS.map((v) => (
                  <li key={v.id} className="flex items-center gap-3">
                    <span className="flex-1 text-[13px]">{v.label}</span>
                    <button onClick={() => vote(v.vote, -1)} className="grid size-7 place-items-center rounded-lg ring-1 ring-zinc-200 hover:bg-zinc-50 dark:ring-zinc-700 dark:hover:bg-zinc-800" aria-label={`Remove ${v.label} vote`}>
                      <Minus className="size-3" />
                    </button>
                    <span className="w-6 text-center font-semibold tabular-nums">{r.votes[v.vote]}</span>
                    <button onClick={() => vote(v.vote, 1)} className="grid size-7 place-items-center rounded-lg ring-1 ring-zinc-200 hover:bg-zinc-50 dark:ring-zinc-700 dark:hover:bg-zinc-800" aria-label={`Add ${v.label} vote`}>
                      <Plus className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <Card className="p-5">
            <label htmlFor="rationale" className="text-sm font-medium">
              Why? <span className="font-normal text-zinc-500">— the team&apos;s reasoning goes into the report and steers the rebuild</span>
            </label>
            <textarea
              id="rationale"
              value={r.rationale}
              onChange={(e) => setReview({ rationale: e.target.value })}
              rows={3}
              placeholder="e.g. Budget owners already get daily digests — a risk flag there is cheap and they can delegate. Needs approver calendar data."
              className="mt-2 w-full resize-y rounded-xl bg-zinc-50 p-3 text-[13.5px] ring-1 ring-zinc-200 outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-zinc-950 dark:ring-zinc-800"
            />
            <div className="mt-4 flex flex-wrap gap-2">
              {VERDICTS.map((v) => {
                const Icon = v.icon;
                const on = r.verdict === v.id;
                return (
                  <button
                    key={v.id}
                    onClick={() => setReview({ verdict: on ? "undecided" : v.id })}
                    className={cx(
                      "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium ring-1 transition active:scale-[0.98]",
                      on ? v.cls : "ring-zinc-200 hover:bg-zinc-50 dark:ring-zinc-700 dark:hover:bg-zinc-800",
                    )}
                  >
                    <Icon className="size-4" /> {v.label}
                  </button>
                );
              })}
            </div>
            {challenge && (
              <div className="mt-4 flex gap-2.5 rounded-xl bg-amber-50 p-3 text-[13px] text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                <Bot className="mt-0.5 size-4 shrink-0" />
                <span>
                  <span className="font-medium">Copilot pushback: </span>
                  {challenge}
                </span>
              </div>
            )}
          </Card>

          <div className="flex items-center gap-3">
            <Button variant="ghost" disabled={idx === 0} onClick={() => setIdx(idx - 1)} icon={<ArrowLeft className="size-4" />}>
              Previous
            </Button>
            <div className="flex-1" />
            {idx < preds.length - 1 && (
              <Button variant="secondary" onClick={() => setIdx(idx + 1)}>
                Next prediction <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      <Card className="flex flex-wrap items-center gap-4 p-5">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Rebuild the plan from your decisions</div>
          <p className="mt-0.5 text-[13px] text-zinc-500">
            {decided < preds.length
              ? `${preds.length - decided} prediction${preds.length - decided > 1 ? "s are" : " is"} still undecided — they'll be dropped from the rebuilt plan.`
              : "Interventions, future state, data needs and prototypes will be regenerated using only actionable predictions. Needs-data items become data workstreams."}
          </p>
          {error && (
            <p className="mt-1 flex items-center gap-1 text-xs text-rose-600">
              <CircleAlert className="size-3.5" /> {error}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Badge tone="emerald">{tally.actionable} kept</Badge>
          {tally["needs-data"] > 0 && <Badge tone="sky">{tally["needs-data"]} need data</Badge>}
        </div>
        <Button variant="primary" loading={rebuilding} disabled={decided === 0} onClick={rebuild} icon={!rebuilding && <RefreshCw className="size-4" />}>
          {rebuilding ? "Rebuilding…" : "Rebuild plan"}
        </Button>
        {session.analysis?.refinedFromReview && (
          <Button variant="ghost" onClick={() => update({ stage: "report" })}>
            View report <ArrowRight className="size-4" />
          </Button>
        )}
      </Card>
    </div>
  );
}
