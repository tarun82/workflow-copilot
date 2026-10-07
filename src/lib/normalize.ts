import type { Analysis, Level } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */

const arr = (v: any): any[] => (Array.isArray(v) ? v : []);
const str = (v: any, d = ""): string => (typeof v === "string" ? v : v == null ? d : String(v));
const strs = (v: any): string[] => arr(v).map((x) => str(x)).filter(Boolean);
const oneOf = <T extends string>(v: any, opts: readonly T[], d: T): T => (opts.includes(v) ? v : d);
const clamp = (v: any) => Math.min(5, Math.max(1, Math.round(Number(v) || 3)));
const LEVELS = ["high", "medium", "low"] as const;
const lvl = (v: any): Level => oneOf(String(v ?? "").toLowerCase(), LEVELS, "medium");

function ids<T extends { id: string }>(items: T[], prefix: string): T[] {
  const seen = new Set<string>();
  return items.map((it, i) => {
    let id = it.id || `${prefix}${i + 1}`;
    while (seen.has(id)) id = `${id}_${i}`;
    seen.add(id);
    return { ...it, id };
  });
}

export function normalizeAnalysis(raw: any, source: Analysis["source"]): Analysis {
  const workflowMap = ids(
    arr(raw?.workflowMap).map((s: any) => ({
      id: str(s.id),
      name: str(s.name, "Step"),
      description: str(s.description),
      actor: str(s.actor, "Team"),
      type: oneOf(s.type, ["trigger", "task", "decision", "handoff", "end"] as const, "task"),
      human: s.human !== false,
      decision: s.decision ? str(s.decision) : undefined,
      systems: strs(s.systems),
    })),
    "s",
  );
  const firstStep = workflowMap[0]?.id ?? "";

  const painPoints = ids(
    arr(raw?.painPoints).map((p: any) => ({
      id: str(p.id),
      stepId: str(p.stepId, firstStep),
      title: str(p.title, "Pain point"),
      description: str(p.description),
      severity: clamp(p.severity),
      frequency: clamp(p.frequency),
      category: oneOf(
        p.category,
        ["delay", "error", "rework", "handoff", "visibility", "manual", "compliance"] as const,
        "delay",
      ),
      discoveredLate: Boolean(p.discoveredLate),
      evidence: p.evidence ? str(p.evidence) : undefined,
    })),
    "p",
  );

  const predictions = ids(
    arr(raw?.predictions).map((p: any) => ({
      id: str(p.id),
      title: str(p.title, "Prediction"),
      whatToPredict: str(p.whatToPredict),
      whenPredicted: str(p.whenPredicted),
      whoActs: str(p.whoActs),
      stepId: str(p.stepId, firstStep),
      painPointIds: strs(p.painPointIds),
      value: lvl(p.value),
      feasibility: lvl(p.feasibility),
      assumptions: strs(p.assumptions),
      devilsAdvocate: str(p.devilsAdvocate),
      facilitatorQuestions: strs(p.facilitatorQuestions),
      evidence: p.evidence ? str(p.evidence) : undefined,
    })),
    "c",
  );

  return {
    summary: str(raw?.summary),
    workflowMap,
    painPoints,
    predictions,
    leadingIndicators: ids(
      arr(raw?.leadingIndicators).map((d: any) => ({
        id: str(d.id),
        predictionId: str(d.predictionId),
        name: str(d.name, "Indicator"),
        signal: str(d.signal),
        source: str(d.source),
        leadTime: str(d.leadTime),
      })),
      "d",
    ),
    interventions: ids(
      arr(raw?.interventions).map((e: any) => ({
        id: str(e.id),
        predictionId: str(e.predictionId),
        when: str(e.when),
        action: str(e.action),
        owner: str(e.owner),
        automationLevel: oneOf(e.automationLevel, ["inform", "recommend", "automate"] as const, "recommend"),
        guardrail: str(e.guardrail),
      })),
      "e",
    ),
    futureState: {
      narrative: str(raw?.futureState?.narrative),
      steps: ids(
        arr(raw?.futureState?.steps).map((f: any) => ({
          id: str(f.id),
          name: str(f.name, "Step"),
          description: str(f.description),
          actor: str(f.actor, "Team"),
          change: oneOf(f.change, ["unchanged", "augmented", "automated", "new", "removed"] as const, "unchanged"),
          predictionId: f.predictionId ? str(f.predictionId) : undefined,
        })),
        "f",
      ),
    },
    dataRequirements: ids(
      arr(raw?.dataRequirements).map((g: any) => ({
        id: str(g.id),
        name: str(g.name, "Dataset"),
        description: str(g.description),
        source: str(g.source),
        availability: oneOf(g.availability, ["available", "partial", "missing"] as const, "partial"),
        predictionIds: strs(g.predictionIds),
        evidence: g.evidence ? str(g.evidence) : undefined,
      })),
      "g",
    ),
    prototypes: ids(
      arr(raw?.prototypes).map((h: any) => ({
        id: str(h.id),
        title: str(h.title, "Prototype"),
        description: str(h.description),
        effort: oneOf(h.effort, ["S", "M", "L"] as const, "M"),
        timeline: str(h.timeline),
        successMetric: str(h.successMetric),
        predictionIds: strs(h.predictionIds),
        steps: strs(h.steps),
      })),
      "h",
    ),
    openQuestions: strs(raw?.openQuestions),
    source,
    generatedAt: new Date().toISOString(),
  };
}
