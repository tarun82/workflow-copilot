import { QUESTIONS } from "./questions";
import type { ContextPack } from "./context";
import type { Analysis, Answers, PredictionReview } from "./types";

export const FACILITATOR_PERSONA = `You are "Reimagine", an AI Workflow Reimagination Copilot acting as a FACILITATOR for a cross-functional team, not as an oracle.
Principles:
- Everything you propose is a hypothesis for the team to test. Never claim a prediction is actionable — only the team can decide that.
- Prefer predictions that move problem DISCOVERY earlier in the workflow (shift-left), tied to a specific decision point and a specific person who can act.
- Be concrete and grounded in the team's own words, systems and roles. Do not invent systems that were not mentioned unless you clearly mark them as "assumed".
- The team may share several documents and datasets. Study ALL of them; when sources disagree, say so rather than silently picking one.
- Treat computed dataset metrics as facts about the data, but remember data can be incomplete or biased.
- For every prediction, argue against yourself (devil's advocate) and pose sharp facilitator questions the team should debate.
- Keep text crisp: titles under 8 words, descriptions under 40 words.
- Respond with a single valid JSON object only. No markdown, no commentary.`;

function material(ctx: ContextPack) {
  return `## Documents (${ctx.ledger.filter((l) => l.mode !== "profile").length})
"""
${ctx.documents || "(none)"}
"""

## Datasets — profiled by the app (${ctx.ledger.filter((l) => l.mode === "profile").length})
Column types, statistics and computed metrics were calculated over every row; cite them as "file › sheet › column".
"""
${ctx.datasets || "(none)"}
"""`;
}

export function interviewPrompt(ctx: ContextPack) {
  const qs = QUESTIONS.map((q) => `- "${q.id}": ${q.title} ${q.prompt}`).join("\n");
  return {
    system: FACILITATOR_PERSONA,
    user: `A team has shared material describing one of their workflows. Draft answers to the 8 discovery questions using ONLY what the material says.
- Use documents for workflow, trigger, steps, humans, decisions and problems.
- Use datasets to answer "data" (list each dataset with its useful columns) and "outcomes" (cite measurable metrics with their current values, e.g. median cycle time). Datasets can also reveal problems (long tails, high exception rates) — mention those under "problems" with numbers.
- Mention which source file each key fact came from in brackets, e.g. [SOP.docx].
If the material does not answer a question, return an empty "answer", "confidence": "low" and a "followUp" question you would ask the team.
Even when you can answer, include a "followUp" probing question that would sharpen the answer.

Questions:
${qs}

Return JSON:
{ "answers": { "<questionId>": { "answer": string, "confidence": "high"|"medium"|"low", "followUp": string } }, "title": string (short workflow name) }

${material(ctx)}`,
  };
}

function answersBlock(answers: Answers) {
  return QUESTIONS.map((q) => `### ${q.title}\n${answers[q.id]?.value?.trim() || "(not answered)"}`).join("\n\n");
}

const ANALYSIS_SCHEMA = `{
  "summary": string,
  "workflowMap": [{ "id": "s1", "name": string, "description": string, "actor": string (role or "System"), "type": "trigger"|"task"|"decision"|"handoff"|"end", "human": boolean, "decision"?: string, "systems"?: string[] }],
  "painPoints": [{ "id": "p1", "stepId": string, "title": string, "description": string, "severity": 1-5, "frequency": 1-5, "category": "delay"|"error"|"rework"|"handoff"|"visibility"|"manual"|"compliance", "discoveredLate": boolean, "evidence": string (source file and, if from data, the metric/value) }],
  "predictions": [{ "id": "c1", "title": string, "whatToPredict": string, "whenPredicted": string (which step / how early), "whoActs": string, "stepId": string, "painPointIds": string[], "value": "high"|"medium"|"low", "feasibility": "high"|"medium"|"low", "assumptions": string[], "devilsAdvocate": string, "facilitatorQuestions": string[], "evidence": string (data columns that could train/feed it, or "no data found") }],
  "leadingIndicators": [{ "id": "d1", "predictionId": string, "name": string, "signal": string, "source": string (prefer "file › sheet › column"), "leadTime": string }],
  "interventions": [{ "id": "e1", "predictionId": string, "when": string, "action": string, "owner": string, "automationLevel": "inform"|"recommend"|"automate", "guardrail": string }],
  "futureState": { "narrative": string, "steps": [{ "id": "f1", "name": string, "description": string, "actor": string, "change": "unchanged"|"augmented"|"automated"|"new"|"removed", "predictionId"?: string }] },
  "dataRequirements": [{ "id": "g1", "name": string, "description": string, "source": string, "availability": "available"|"partial"|"missing", "predictionIds": string[], "evidence": string (matching columns + quality, e.g. "tickets.xlsx › Sheet1 › closed_at, 12% blank") }],
  "prototypes": [{ "id": "h1", "title": string, "description": string, "effort": "S"|"M"|"L", "timeline": string, "successMetric": string (use current baseline values from datasets when available), "predictionIds": string[], "steps": string[] }],
  "openQuestions": string[]
}`;

export function analysisPrompt(answers: Answers, ctx: ContextPack) {
  return {
    system: FACILITATOR_PERSONA,
    user: `Using the team's interview answers (authoritative), all shared documents and the profiled datasets, produce a reimagination pack.

Produce:
A. workflowMap: 5-12 ordered steps of the CURRENT workflow.
B. painPoints: 4-8, each tied to a stepId. Mark discoveredLate=true when the problem originates earlier than where it is noticed. Size severity/frequency using dataset metrics where possible (e.g. p90 elapsed days, exception distribution) and cite them in "evidence".
C. predictions: 4-6 prediction opportunities. Each must name WHO acts and WHEN the prediction must arrive to be useful. In "evidence", list dataset columns that could serve as features/labels, or say none were found.
D. leadingIndicators: 1-3 per prediction — observable signals that move BEFORE the outcome. Prefer signals that exist as columns in the datasets.
E. interventions: one per prediction — what the owner does when the prediction fires; choose the least-automated level that works and give a guardrail.
F. futureState: reimagined steps (mark each change) + a 2-3 sentence narrative.
G. dataRequirements: datasets/fields needed. Mark "available" ONLY if a matching column exists in the profiled datasets or the team stated it exists; "partial" if blank-heavy or only partly present; otherwise "missing".
H. prototypes: 2-3 small experiments (2-6 weeks) the team could run to test the riskiest predictions, with success metrics anchored to current baselines.
Also: openQuestions — 3-6 questions the team must answer before trusting this pack, including any conflicts between sources.

JSON schema:
${ANALYSIS_SCHEMA}

## Interview answers
${answersBlock(answers)}

${material(ctx)}`,
  };
}

export function refinePrompt(analysis: Analysis, reviews: Record<string, PredictionReview>, ctx: ContextPack) {
  const decisions = analysis.predictions.map((p) => {
    const r = reviews[p.id];
    return {
      id: p.id,
      title: p.title,
      verdict: r?.verdict ?? "undecided",
      criteria: r?.criteria,
      votes: r?.votes,
      teamRationale: r?.rationale || "",
    };
  });

  return {
    system: FACILITATOR_PERSONA,
    user: `The team has reviewed your prediction opportunities and decided which are actually actionable. Respect their decisions completely — you must not re-introduce rejected ideas.

Rules:
- Rebuild leadingIndicators, interventions, futureState, dataRequirements and prototypes using ONLY predictions with verdict "actionable".
- For "needs-data" predictions: do not create interventions; instead add data requirements (availability "missing" or "partial") naming the exact columns to find or collect — check the profiled datasets first — and, if useful, a data-discovery prototype.
- Drop "not-actionable" predictions everywhere. Use the team's rationale to sharpen remaining items.
- Keep the same ids for kept predictions. Return predictions unchanged except you may sharpen wording using team rationale.
- Update openQuestions to reflect what the team still needs to resolve.
- Return the FULL analysis object with the same schema.

Team decisions:
${JSON.stringify(decisions, null, 2)}

Current analysis:
${JSON.stringify({ ...analysis, source: undefined, generatedAt: undefined, ledger: undefined }, null, 2)}

## Datasets — profiled by the app
"""
${ctx.datasets || "(none)"}
"""

JSON schema:
${ANALYSIS_SCHEMA}`,
  };
}

export function digestPrompt(file: string, chunk: string, part: number, parts: number) {
  return {
    system: `You extract workflow facts from long business documents for a workflow-reimagination team. Respond with JSON only.`,
    user: `Extract everything relevant to understanding and improving the workflow from part ${part} of ${parts} of "${file}".
Keep: triggers, steps and their order, roles/teams, systems, decisions & approval rules, thresholds, SLAs, volumes, metrics, known problems, exceptions, data sources, policies.
Drop: boilerplate, legal disclaimers, tables of contents, repetition.
Use terse bullet points; keep numbers and names exact.

Return JSON: { "facts": string (markdown bullets) }

"""
${chunk}
"""`,
  };
}
