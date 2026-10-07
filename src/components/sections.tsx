"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  Bot,
  CircleAlert,
  CircleCheck,
  CircleQuestionMark,
  CircleX,
  Clock,
  Database,
  Diamond,
  FlaskConical,
  Flag,
  GitBranch,
  Play,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  User,
  Zap,
  Scale,
} from "lucide-react";
import { Badge, Card, Hypothesis, SectionHeader, cx, levelTone, type Tone } from "./ui";
import type { Analysis, PainReaction, Prediction, PredictionReview, StepType, Verdict } from "@/lib/types";

/* ---------- shared bits ---------- */

const STEP_STYLE: Record<StepType, { tone: string; label: string; icon: typeof Play }> = {
  trigger: { tone: "border-sky-300 bg-sky-50 dark:border-sky-500/40 dark:bg-sky-500/10", label: "Trigger", icon: Zap },
  task: { tone: "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900", label: "Task", icon: Play },
  decision: { tone: "border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10", label: "Decision", icon: Diamond },
  handoff: { tone: "border-violet-300 bg-violet-50 dark:border-violet-500/40 dark:bg-violet-500/10", label: "Hand-off", icon: GitBranch },
  end: { tone: "border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10", label: "Outcome", icon: Flag },
};

export const VERDICT_META: Record<Verdict, { label: string; tone: Tone; icon: typeof CircleCheck }> = {
  undecided: { label: "Awaiting team", tone: "zinc", icon: CircleQuestionMark },
  actionable: { label: "Actionable", tone: "emerald", icon: CircleCheck },
  "not-actionable": { label: "Not actionable", tone: "rose", icon: CircleX },
  "needs-data": { label: "Needs data", tone: "sky", icon: Database },
};

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const m = VERDICT_META[verdict];
  const Icon = m.icon;
  return (
    <Badge tone={m.tone}>
      <Icon className="size-3" /> {m.label}
    </Badge>
  );
}

function DraftBanner({ analysis, onReview }: { analysis: Analysis; onReview?: () => void }) {
  if (analysis.refinedFromReview) {
    return (
      <div className="mb-5 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
        <CircleCheck className="size-4 shrink-0" /> Rebuilt from predictions your team marked actionable.
      </div>
    );
  }
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
      <CircleAlert className="size-4 shrink-0" />
      <span className="flex-1">Draft built on predictions the team hasn&apos;t validated yet.</span>
      {onReview && (
        <button onClick={onReview} className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline">
          Review predictions <ArrowRight className="size-3.5" />
        </button>
      )}
    </div>
  );
}

function Evidence({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <div className="mt-2 flex gap-1.5 text-[11.5px] text-emerald-700 dark:text-emerald-400">
      <Database className="mt-0.5 size-3 shrink-0" />
      <span className="min-w-0 break-words">{text}</span>
    </div>
  );
}

function predTitle(a: Analysis, id: string) {
  return a.predictions.find((p) => p.id === id)?.title ?? id;
}

/* ---------- A. Workflow map (swimlanes) ---------- */

export function WorkflowMap({ analysis }: { analysis: Analysis }) {
  const [showPain, setShowPain] = useState(true);
  const steps = analysis.workflowMap;
  const lanes = useMemo(() => Array.from(new Set(steps.map((s) => s.actor))), [steps]);
  const painBy = useMemo(() => {
    const m: Record<string, number> = {};
    analysis.painPoints.forEach((p) => (m[p.stepId] = (m[p.stepId] ?? 0) + 1));
    return m;
  }, [analysis.painPoints]);

  return (
    <section>
      <SectionHeader
        letter="A"
        title="Workflow map"
        subtitle="Current-state swimlanes: who does what, in what order, and where decisions happen."
        action={
          <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-500">
            <input type="checkbox" checked={showPain} onChange={(e) => setShowPain(e.target.checked)} className="accent-indigo-600" />
            Overlay pain points
          </label>
        }
      />
      <Card className="overflow-hidden">
        <div className="scroll-thin overflow-x-auto">
          <div
            className="grid"
            style={{
              gridTemplateColumns: `140px repeat(${steps.length}, minmax(200px, 1fr))`,
              width: `max(100%, ${140 + steps.length * 200}px)`,
            }}
          >
            {/* timeline */}
            <div className="sticky left-0 z-10 border-b border-zinc-100 bg-white dark:border-zinc-800 dark:bg-zinc-900" />
            {steps.map((s, i) => (
              <div key={s.id} className="relative flex items-center justify-center border-b border-zinc-100 py-3 dark:border-zinc-800">
                <div className={cx("absolute top-1/2 h-px bg-zinc-200 dark:bg-zinc-700", i === 0 ? "left-1/2 right-0" : i === steps.length - 1 ? "left-0 right-1/2" : "inset-x-0")} />
                <span className="relative z-[1] grid size-6 place-items-center rounded-full bg-zinc-900 text-[11px] font-semibold text-white dark:bg-white dark:text-zinc-900">
                  {i + 1}
                </span>
              </div>
            ))}
            {/* lanes */}
            {lanes.map((lane, li) => (
              <div key={lane} className="contents">
                <div
                  className={cx(
                    "sticky left-0 z-10 flex items-center gap-2 border-r border-zinc-100 bg-white px-4 py-4 text-xs font-medium text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300",
                    li % 2 && "bg-zinc-50/80 dark:bg-zinc-900/80",
                  )}
                >
                  {lane === "System" ? <Bot className="size-3.5 text-zinc-400" /> : <User className="size-3.5 text-zinc-400" />}
                  <span className="line-clamp-2">{lane}</span>
                </div>
                {steps.map((s) => {
                  const st = STEP_STYLE[s.type];
                  const Icon = st.icon;
                  const pains = painBy[s.id] ?? 0;
                  return (
                    <div key={s.id} className={cx("p-2", li % 2 && "bg-zinc-50/60 dark:bg-zinc-950/30")}>
                      {s.actor === lane && (
                        <div
                          className={cx(
                            "relative h-full rounded-xl border p-3 shadow-sm transition hover:shadow-md",
                            st.tone,
                            showPain && pains > 0 && "ring-2 ring-rose-400/70 ring-offset-2 ring-offset-white dark:ring-offset-zinc-900",
                          )}
                        >
                          <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-zinc-500 uppercase">
                            <Icon className="size-3" /> {st.label}
                          </div>
                          <div className="text-[13px] leading-snug font-semibold">{s.name}</div>
                          <p className="mt-1 line-clamp-3 text-[11.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">{s.description}</p>
                          {s.decision && <p className="mt-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">◆ {s.decision}</p>}
                          {showPain && pains > 0 && (
                            <span className="absolute -top-2 -right-2 grid size-5 place-items-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow">
                              {pains}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-4 border-t border-zinc-100 px-4 py-3 text-[11px] text-zinc-500 dark:border-zinc-800">
          {Object.entries(STEP_STYLE).map(([k, v]) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className={cx("size-3 rounded border", v.tone)} /> {v.label}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-full bg-rose-500" /> Pain points on step
          </span>
        </div>
      </Card>
    </section>
  );
}

/* ---------- B. Pain-point map ---------- */

const CAT_TONE: Record<string, Tone> = {
  delay: "amber",
  error: "rose",
  rework: "rose",
  handoff: "violet",
  visibility: "sky",
  manual: "zinc",
  compliance: "indigo",
};

export function PainMap({
  analysis,
  reactions,
  onReact,
}: {
  analysis: Analysis;
  reactions: Record<string, PainReaction>;
  onReact: (id: string, r: PainReaction) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const pains = analysis.painPoints;
  const num = (id: string) => pains.findIndex((p) => p.id === id) + 1;
  const stepHeat = analysis.workflowMap.map((s) => ({
    s,
    heat: pains.filter((p) => p.stepId === s.id).reduce((t, p) => t + p.severity * p.frequency, 0),
  }));
  const maxHeat = Math.max(1, ...stepHeat.map((x) => x.heat));

  return (
    <section>
      <SectionHeader
        letter="B"
        title="Pain-point map"
        subtitle="Where it hurts, how badly and how often — and whether problems are discovered later than they start."
        action={<Hypothesis />}
      />

      <Card className="mb-5 p-4">
        <div className="mb-2 text-xs font-medium text-zinc-500">Heat along the workflow</div>
        <div className="flex gap-1">
          {stepHeat.map(({ s, heat }) => (
            <div key={s.id} className="group min-w-0 flex-1" title={`${s.name}: heat ${heat}`}>
              <div
                className="h-8 rounded-md transition"
                style={{ background: heat ? `rgb(244 63 94 / ${0.15 + (heat / maxHeat) * 0.75})` : "rgb(161 161 170 / 0.15)" }}
              />
              <div className="mt-1 truncate text-[10px] text-zinc-500">{s.name}</div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
        <Card className="p-5">
          <div className="mb-3 text-xs font-medium text-zinc-500">Severity ↑ × frequency →</div>
          <div className="flex">
            <div className="flex-1">
              <div className="grid grid-cols-5 gap-1">
                {[5, 4, 3, 2, 1].map((sev) =>
                  [1, 2, 3, 4, 5].map((freq) => {
                    const here = pains.filter((p) => p.severity === sev && p.frequency === freq);
                    const intensity = (sev * freq) / 25;
                    return (
                      <div
                        key={`${sev}-${freq}`}
                        className="flex aspect-square flex-wrap content-center items-center justify-center gap-0.5 rounded-md p-0.5"
                        style={{ background: `rgb(244 63 94 / ${0.05 + intensity * 0.35})` }}
                      >
                        {here.map((p) => (
                          <span
                            key={p.id}
                            onMouseEnter={() => setHover(p.id)}
                            onMouseLeave={() => setHover(null)}
                            className={cx(
                              "grid size-5 cursor-default place-items-center rounded-full bg-zinc-900 text-[10px] font-bold text-white shadow transition dark:bg-white dark:text-zinc-900",
                              hover === p.id && "scale-125 bg-rose-600 dark:bg-rose-400",
                            )}
                          >
                            {num(p.id)}
                          </span>
                        ))}
                      </div>
                    );
                  }),
                )}
              </div>
              <div className="mt-1.5 text-center text-[10px] text-zinc-400">Frequency →</div>
            </div>
          </div>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2">
          {pains.map((p) => {
            const step = analysis.workflowMap.find((s) => s.id === p.stepId);
            const r = reactions[p.id];
            return (
              <Card
                key={p.id}
                className={cx("p-4 transition", hover === p.id && "ring-2 ring-rose-400", r === "dispute" && "opacity-60")}
              >
                <div onMouseEnter={() => setHover(p.id)} onMouseLeave={() => setHover(null)}>
                  <div className="flex items-start gap-2.5">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-zinc-900 text-[11px] font-bold text-white dark:bg-white dark:text-zinc-900">
                      {num(p.id)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm leading-snug font-semibold">{p.title}</div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        <Badge tone={CAT_TONE[p.category]}>{p.category}</Badge>
                        {p.discoveredLate && (
                          <Badge tone="rose">
                            <Clock className="size-3" /> found late
                          </Badge>
                        )}
                        {step && <Badge>@ {step.name}</Badge>}
                      </div>
                    </div>
                  </div>
                  <p className="mt-2 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">{p.description}</p>
                  <Evidence text={p.evidence} />
                  <div className="mt-3 flex items-center gap-3 text-[11px] text-zinc-500">
                    <span>Severity {p.severity}/5</span>
                    <span>Frequency {p.frequency}/5</span>
                    <span className="flex-1" />
                    <button
                      onClick={() => onReact(p.id, r === "agree" ? undefined : "agree")}
                      className={cx("flex items-center gap-1 rounded-md px-1.5 py-1", r === "agree" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "hover:bg-zinc-100 dark:hover:bg-zinc-800")}
                    >
                      <ThumbsUp className="size-3" /> Real
                    </button>
                    <button
                      onClick={() => onReact(p.id, r === "dispute" ? undefined : "dispute")}
                      className={cx("flex items-center gap-1 rounded-md px-1.5 py-1", r === "dispute" ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" : "hover:bg-zinc-100 dark:hover:bg-zinc-800")}
                    >
                      <ThumbsDown className="size-3" /> Not really
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ---------- C. Predictions ---------- */

export function PredictionCard({
  p,
  analysis,
  verdict,
  compact,
}: {
  p: Prediction;
  analysis: Analysis;
  verdict: Verdict;
  compact?: boolean;
}) {
  const step = analysis.workflowMap.find((s) => s.id === p.stepId);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        <VerdictBadge verdict={verdict} />
        <Badge tone={levelTone(p.value)}>value: {p.value}</Badge>
        <Badge tone={levelTone(p.feasibility)}>feasibility: {p.feasibility}</Badge>
        {step && <Badge>@ {step.name}</Badge>}
      </div>
      <h3 className="mt-2.5 text-[15px] leading-snug font-semibold">{p.title}</h3>
      <dl className="mt-2 space-y-1.5 text-[13px]">
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-zinc-500">Predict</dt>
          <dd>{p.whatToPredict}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-zinc-500">When</dt>
          <dd>{p.whenPredicted}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-zinc-500">Who acts</dt>
          <dd className="font-medium">{p.whoActs}</dd>
        </div>
      </dl>
      <Evidence text={p.evidence} />
      {!compact && p.assumptions.length > 0 && (
        <div className="mt-3">
          <div className="text-[11px] font-medium tracking-wide text-zinc-500 uppercase">Assumes</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12.5px] text-zinc-600 dark:text-zinc-400">
            {p.assumptions.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      )}
      {p.devilsAdvocate && (
        <div className="mt-3 rounded-lg bg-zinc-50 p-2.5 text-[12.5px] text-zinc-600 ring-1 ring-zinc-200/70 dark:bg-zinc-950 dark:text-zinc-400 dark:ring-zinc-800">
          <span className="font-medium text-zinc-800 dark:text-zinc-200">Devil&apos;s advocate: </span>
          {p.devilsAdvocate}
        </div>
      )}
    </div>
  );
}

export function Predictions({
  analysis,
  reviews,
  onReview,
}: {
  analysis: Analysis;
  reviews: Record<string, PredictionReview>;
  onReview: () => void;
}) {
  const pos = { high: 0, medium: 1, low: 2 } as const;
  return (
    <section>
      <SectionHeader
        letter="C"
        title="Prediction opportunities"
        subtitle="Places where knowing something earlier could change what someone does. None are actionable until your team says so."
        action={
          <button onClick={onReview} className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900">
            <Scale className="size-3.5" /> Which are actually actionable?
          </button>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <div className="grid gap-4 md:grid-cols-2">
          {analysis.predictions.map((p) => (
            <Card key={p.id} className="p-5">
              <PredictionCard p={p} analysis={analysis} verdict={reviews[p.id]?.verdict ?? "undecided"} />
            </Card>
          ))}
        </div>
        <Card className="h-fit p-5">
          <div className="mb-3 text-xs font-medium text-zinc-500">Value × feasibility (AI estimate)</div>
          <div className="relative grid aspect-square grid-cols-3 grid-rows-3 gap-1">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className={cx("rounded-md", i === 2 ? "bg-emerald-100/70 dark:bg-emerald-500/10" : "bg-zinc-100 dark:bg-zinc-800/60")} />
            ))}
            {analysis.predictions.map((p, i) => {
              const col = 2 - pos[p.feasibility];
              const row = pos[p.value];
              const same = analysis.predictions.filter((q, j) => j < i && q.value === p.value && q.feasibility === p.feasibility).length;
              return (
                <span
                  key={p.id}
                  title={p.title}
                  className="absolute grid size-6 place-items-center rounded-full bg-indigo-600 text-[10px] font-bold text-white shadow"
                  style={{ left: `calc(${(col + 0.5) * 33.33}% - 12px + ${same * 14}px)`, top: `calc(${(row + 0.5) * 33.33}% - 12px)` }}
                >
                  {i + 1}
                </span>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-zinc-400">
            <span>← harder</span>
            <span>easier →</span>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
            Top-right = AI&apos;s guess at quick wins. The team review asks the question that matters more: <em>would anyone act on it?</em>
          </p>
        </Card>
      </div>
    </section>
  );
}

/* ---------- D. Leading indicators ---------- */

export function Indicators({ analysis }: { analysis: Analysis }) {
  const groups = analysis.predictions
    .map((p) => ({ p, items: analysis.leadingIndicators.filter((d) => d.predictionId === p.id) }))
    .filter((g) => g.items.length);
  return (
    <section>
      <SectionHeader
        letter="D"
        title="Possible leading indicators"
        subtitle="Signals that move before the outcome does — the raw material for each prediction."
        action={<Hypothesis />}
      />
      <div className="space-y-4">
        {groups.map(({ p, items }) => (
          <Card key={p.id} className="overflow-hidden">
            <div className="border-b border-zinc-100 px-5 py-3 text-sm font-medium dark:border-zinc-800">{p.title}</div>
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {items.map((d) => (
                <div key={d.id} className="grid gap-2 px-5 py-3 text-[13px] sm:grid-cols-[1.2fr_2fr_1.2fr_auto] sm:items-center">
                  <div className="font-medium">{d.name}</div>
                  <div className="text-zinc-600 dark:text-zinc-400">{d.signal}</div>
                  <div className="flex items-center gap-1.5 text-zinc-500">
                    <Database className="size-3.5 shrink-0" /> {d.source}
                  </div>
                  <Badge tone="indigo">
                    <Clock className="size-3" /> {d.leadTime || "—"}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        ))}
        {!groups.length && <Empty text="No leading indicators — no predictions are currently in scope." />}
      </div>
    </section>
  );
}

/* ---------- E. Interventions ---------- */

const LEVELS = ["inform", "recommend", "automate"] as const;

export function Interventions({ analysis, onReview }: { analysis: Analysis; onReview: () => void }) {
  return (
    <section>
      <SectionHeader letter="E" title="Prescriptive interventions" subtitle="What the owner does when a prediction fires — at the lowest level of automation that works." />
      <DraftBanner analysis={analysis} onReview={onReview} />
      <div className="grid gap-4 md:grid-cols-2">
        {analysis.interventions.map((e) => (
          <Card key={e.id} className="p-5">
            <div className="text-[11px] font-medium text-zinc-500">For: {predTitle(analysis, e.predictionId)}</div>
            <div className="mt-3 space-y-2 text-[13.5px]">
              <div className="flex gap-2">
                <span className="mt-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">IF</span>
                <span>{e.when}</span>
              </div>
              <div className="flex gap-2">
                <span className="mt-0.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">THEN</span>
                <span className="font-medium">{e.action}</span>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <div className="flex gap-1">
                {LEVELS.map((l, i) => (
                  <div key={l} className={cx("h-1.5 w-8 rounded-full", i <= LEVELS.indexOf(e.automationLevel) ? "bg-indigo-500" : "bg-zinc-200 dark:bg-zinc-700")} />
                ))}
              </div>
              <span className="text-xs text-zinc-500 capitalize">{e.automationLevel}</span>
              <span className="flex-1" />
              <span className="flex items-center gap-1 text-xs text-zinc-500">
                <User className="size-3.5" /> {e.owner}
              </span>
            </div>
            {e.guardrail && (
              <div className="mt-3 flex gap-2 rounded-lg bg-zinc-50 p-2.5 text-[12px] text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-600" /> {e.guardrail}
              </div>
            )}
          </Card>
        ))}
        {!analysis.interventions.length && <Empty text="No interventions — mark at least one prediction actionable." />}
      </div>
    </section>
  );
}

/* ---------- F. Future state ---------- */

const CHANGE_TONE: Record<string, Tone> = {
  unchanged: "zinc",
  augmented: "indigo",
  automated: "violet",
  new: "emerald",
  removed: "rose",
};

export function FutureState({ analysis, onReview }: { analysis: Analysis; onReview: () => void }) {
  return (
    <section>
      <SectionHeader letter="F" title="Future-state workflow" subtitle="The reimagined flow, side by side with today." />
      <DraftBanner analysis={analysis} onReview={onReview} />
      <Card className="mb-5 bg-gradient-to-br from-indigo-50 to-violet-50 p-5 ring-indigo-100 dark:from-indigo-500/10 dark:to-violet-500/10 dark:ring-indigo-500/20">
        <p className="text-[15px] leading-relaxed">{analysis.futureState.narrative}</p>
      </Card>
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <div className="mb-2 text-xs font-medium tracking-wide text-zinc-500 uppercase">Today</div>
          <ol className="space-y-2">
            {analysis.workflowMap.map((s, i) => (
              <li key={s.id} className="flex gap-3 rounded-xl bg-white/60 p-3 ring-1 ring-zinc-200/70 dark:bg-zinc-900/40 dark:ring-zinc-800">
                <span className="text-xs font-semibold text-zinc-400">{i + 1}</span>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium">{s.name}</div>
                  <div className="text-[11px] text-zinc-500">{s.actor}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <div className="mb-2 text-xs font-medium tracking-wide text-indigo-600 uppercase dark:text-indigo-400">Reimagined</div>
          <ol className="space-y-2">
            {analysis.futureState.steps.map((f, i) => (
              <li
                key={f.id}
                className={cx(
                  "flex gap-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800",
                  f.change === "removed" && "opacity-50 line-through",
                  f.change === "new" && "ring-emerald-300 dark:ring-emerald-500/40",
                )}
              >
                <span className="text-xs font-semibold text-zinc-400">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-medium">{f.name}</span>
                    <Badge tone={CHANGE_TONE[f.change]}>{f.change}</Badge>
                  </div>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">{f.description}</p>
                  <div className="mt-1 text-[11px] text-zinc-400">{f.actor}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/* ---------- G. Data ---------- */

const AVAIL_TONE = { available: "emerald", partial: "amber", missing: "rose" } as const;

export function DataRequirements({ analysis }: { analysis: Analysis }) {
  const d = analysis.dataRequirements;
  const counts = { available: 0, partial: 0, missing: 0 };
  d.forEach((x) => counts[x.availability]++);
  const total = Math.max(1, d.length);
  return (
    <section>
      <SectionHeader letter="G" title="Data requirements" subtitle="What the predictions need, where it lives, and how ready it is." action={<Hypothesis />} />
      <Card className="mb-4 p-4">
        <div className="flex h-2.5 overflow-hidden rounded-full">
          <div className="bg-emerald-500" style={{ width: `${(counts.available / total) * 100}%` }} />
          <div className="bg-amber-400" style={{ width: `${(counts.partial / total) * 100}%` }} />
          <div className="bg-rose-500" style={{ width: `${(counts.missing / total) * 100}%` }} />
        </div>
        <div className="mt-2 flex gap-4 text-xs text-zinc-500">
          <span>{counts.available} available</span>
          <span>{counts.partial} partial</span>
          <span>{counts.missing} missing</span>
        </div>
      </Card>
      <Card className="overflow-hidden">
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="border-b border-zinc-100 text-[11px] tracking-wide text-zinc-500 uppercase dark:border-zinc-800">
              <tr>
                <th className="px-5 py-3 font-medium">Data</th>
                <th className="px-5 py-3 font-medium">Source</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Supports</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {d.map((g) => (
                <tr key={g.id} className="align-top">
                  <td className="px-5 py-3">
                    <div className="font-medium">{g.name}</div>
                    <div className="mt-0.5 text-[12px] text-zinc-500">{g.description}</div>
                    <Evidence text={g.evidence} />
                  </td>
                  <td className="px-5 py-3 text-zinc-600 dark:text-zinc-400">{g.source}</td>
                  <td className="px-5 py-3">
                    <Badge tone={AVAIL_TONE[g.availability]}>{g.availability}</Badge>
                  </td>
                  <td className="px-5 py-3 text-[12px] text-zinc-500">{g.predictionIds.length} prediction{g.predictionIds.length === 1 ? "" : "s"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}

/* ---------- H. Prototypes ---------- */

export function Prototypes({ analysis, onReview }: { analysis: Analysis; onReview: () => void }) {
  return (
    <section>
      <SectionHeader letter="H" title="Prototype suggestions" subtitle="Small, cheap experiments to test the riskiest assumptions before building anything." />
      <DraftBanner analysis={analysis} onReview={onReview} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {analysis.prototypes.map((h) => (
          <Card key={h.id} className="flex flex-col p-5">
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300">
                <FlaskConical className="size-4" />
              </span>
              <Badge tone="violet">Effort {h.effort}</Badge>
              <Badge>{h.timeline}</Badge>
            </div>
            <h3 className="mt-3 text-[15px] font-semibold">{h.title}</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">{h.description}</p>
            <ol className="mt-3 space-y-1 text-[12.5px]">
              {h.steps.map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-zinc-400">{i + 1}.</span> {s}
                </li>
              ))}
            </ol>
            <div className="mt-auto pt-4">
              <div className="rounded-lg bg-emerald-50 p-2.5 text-[12px] text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
                <span className="font-medium">Success looks like: </span>
                {h.successMetric}
              </div>
            </div>
          </Card>
        ))}
        {!analysis.prototypes.length && <Empty text="No prototypes yet." />}
      </div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">{text}</div>;
}
