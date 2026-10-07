/**
 * Heuristic engine used when no LLM key is configured. It keeps the full
 * facilitation flow usable for demos and workshops; real insight quality
 * comes from the LLM once LLM_API_KEY is set.
 */
import { QUESTIONS } from "./questions";
import { matchColumns, type ContextPack } from "./context";
import type {
  SourceFile,
  Analysis,
  Answers,
  Confidence,
  DataRequirement,
  FutureStep,
  Intervention,
  LeadingIndicator,
  PainCategory,
  PainPoint,
  Prediction,
  PredictionReview,
  PrototypeSuggestion,
  QuestionId,
  StepType,
  WorkflowStep,
} from "./types";

const ROLE_RE =
  /\b(customer|client|supplier|vendor|manager|clerk|analyst|approver|agent|officer|reviewer|specialist|lead|owner|engineer|admin(?:istrator)?|coordinator|director|accountant|planner|nurse|doctor|physician|recruiter|hr|finance|legal|sales|support|operations|ops|treasury|procurement|underwriter|dispatcher|technician|team|staff|supervisor|controller)s?\b/i;

const KEYWORDS: Record<Exclude<QuestionId, "workflow" | "steps">, RegExp> = {
  trigger: /\b(when|whenever|receiv|request|trigger|submit|arriv|start|initiat|kick|each (day|week|month)|month[- ]end|incoming|raised|opens?)\b/i,
  humans: ROLE_RE,
  decisions: /\b(approv|decid|decision|review|assess|evaluat|whether|if |escalat|reject|prioriti|sign[- ]off|judg|choose|authori[sz])/i,
  problems: /\b(delay|error|issue|problem|mistake|late|rework|miss|complain|backlog|bottleneck|manual|slow|chase|duplicate|incorrect|lost|breach|exception|mismatch|wait)/i,
  data: /\b(system|erp|crm|spreadsheet|excel|database|log|record|ticket|email|report|dashboard|sap|salesforce|servicenow|jira|data|table|portal|form|api|csv|sharepoint|workday|oracle)/i,
  outcomes: /\b(time|cost|rate|%|percent|sla|satisfaction|nps|csat|kpi|measure|metric|days|hours|accuracy|throughput|volume|revenue|on[- ]time)/i,
};

function sentences(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/^[\s\-*•#>\d.)|]+/, "").trim())
    .filter((s) => s.length > 3 && s.length < 400);
}

function listItems(text: string): string[] {
  return text
    .split(/\n/)
    .filter((l) => /^\s*(\d+[.)]|[-*•]|step\s*\d+[:.)-]?)\s+/i.test(l))
    .map((l) => l.replace(/^\s*(\d+[.)]|[-*•]|step\s*\d+[:.)-]?)\s+/i, "").trim())
    .filter((l) => l.length > 2);
}

function uniq<T>(xs: T[]) {
  return Array.from(new Set(xs));
}

const STOP = new Set("the a an to by from with and or if our their each every is are for of in into on at against then".split(" "));

/** First role mentioned in a sentence, keeping a qualifier like "AP clerk" or "budget owner". */
function roleIn(s: string): string | null {
  const m = s.match(new RegExp(`(?:\\b([A-Za-z][\\w-]*)\\s+)?${ROLE_RE.source}`, "i"));
  if (!m) return null;
  const q = m[1] && !STOP.has(m[1].toLowerCase()) && !/(s|ed|ing)$/.test(m[1]) ? `${m[1]} ` : "";
  const r = `${q}${m[2]}`;
  return r.charAt(0).toUpperCase() + r.slice(1);
}

function conf(n: number): Confidence {
  return n >= 2 ? "high" : n === 1 ? "medium" : "low";
}

const FOLLOW_UPS: Record<QuestionId, string> = {
  workflow: "Who is the end customer of this workflow, and what does 'done well' look like for them?",
  trigger: "How many times does this trigger fire per week, and is the volume predictable?",
  steps: "Which step takes the longest elapsed time — not effort, but waiting?",
  humans: "Which hand-off between people causes the most back-and-forth?",
  decisions: "Which decision would you most like to make earlier, if you could see the future?",
  problems: "Where does the problem actually originate versus where you first notice it?",
  data: "Is there a record of past outcomes (e.g. which items were late or wrong) we could learn from?",
  outcomes: "Which one metric would leadership care about most if it moved by 20%?",
};

const SECTION_LABELS: [QuestionId, RegExp][] = [
  ["steps", /\b(steps?|process|procedure|how it works|flow)\b/i],
  ["problems", /\b(problems?|issues?|pain|challenges?|what goes wrong)\b/i],
  ["data", /\b(data|systems?|tools?|sources?)\b/i],
  ["outcomes", /\b(measure|metrics?|kpis?|outcomes?|success)\b/i],
  ["trigger", /\b(trigger|starts?|kick[- ]?off)\b/i],
  ["humans", /\b(roles?|people|who|stakeholders?|team)\b/i],
  ["decisions", /\b(decisions?|approvals?)\b/i],
];

/** Groups text under labels like "## Problems" or "Data: …" so answers can come from the right section. */
function sections(text: string): Partial<Record<QuestionId, string>> {
  const out: Partial<Record<QuestionId, string[]>> = {};
  let current: QuestionId | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const heading = line.match(/^#{1,6}\s+(.+)$/)?.[1] ?? line.match(/^([A-Za-z][\w &/'-]{1,40}):\s*(.*)$/)?.[1];
    if (heading) {
      const hit = SECTION_LABELS.find(([, re]) => re.test(heading));
      current = hit ? hit[0] : null;
      const rest = line.match(/^[A-Za-z][\w &/'-]{1,40}:\s*(.+)$/)?.[1];
      if (current && rest && !line.startsWith("#")) {
        (out[current] ??= []).push(rest);
        current = null;
      }
      continue;
    }
    if (current && line) (out[current] ??= []).push(line);
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v!.join("\n")]));
}

function rank(text: string, re: RegExp, max: number, exclude: string[] = []) {
  const g = new RegExp(re.source, "gi");
  return uniq(sentences(text))
    .filter((s) => !exclude.includes(s))
    .map((s) => ({ s, n: new Set((s.match(g) ?? []).map((m) => m.toLowerCase())).size }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, max)
    .map((x) => x.s);
}

const BAD_VALUE = /late|breach|fail|error|reject|exception|overdue|escalat|reopen|cancel|missed|declin|defect|rework|hold|block/i;

interface DataFacts {
  inventory: string[];
  outcomes: string[];
  problems: { text: string; columns: string[]; file: string }[];
}

/** Turns spreadsheet profiles into interview-ready statements. */
export function dataFacts(files: SourceFile[]): DataFacts {
  const facts: DataFacts = { inventory: [], outcomes: [], problems: [] };
  for (const f of files) {
    if (f.role !== "metrics") continue;
    for (const s of f.sheets ?? []) {
      const where = `${f.name} › ${s.name}`;
      const useful = s.columns.filter((c) => c.type !== "text").slice(0, 10);
      facts.inventory.push(
        `${where} (${s.rows.toLocaleString()} rows): ${useful.map((c) => `${c.name} [${c.type}${c.missingPct > 20 ? `, ${c.missingPct}% blank` : ""}]`).join(", ")}`,
      );
      s.derived.forEach((d) => facts.outcomes.push(`${d.name}: ${d.value} [${where}]`));
      s.columns
        .filter((c) => c.type === "number" && c.median !== undefined)
        .slice(0, 4)
        .forEach((c) => facts.outcomes.push(`${c.name}: median ${c.median}, p90 ${c.p90} [${where}]`));

      s.derived
        .filter((d) => d.name.startsWith("Elapsed"))
        .forEach((d) => {
          const med = Number(d.value.match(/median ([\d.]+)/)?.[1]);
          const p90 = Number(d.value.match(/p90 ([\d.]+)/)?.[1]);
          if (med >= 0 && p90 >= Math.max(1, med * 2)) {
            facts.problems.push({
              text: `Long tail in ${d.name.replace("Elapsed days ", "")}: p90 ${p90} days vs median ${med} [${where}]`,
              columns: d.columns,
              file: where,
            });
          }
        });
      s.columns
        .filter((c) => c.top?.length)
        .forEach((c) => {
          const bad = c.top!.filter((t) => BAD_VALUE.test(t.value));
          const n = bad.reduce((x, t) => x + t.count, 0);
          if (n && n / Math.max(1, c.filled) >= 0.05) {
            facts.problems.push({
              text: `${Math.round((n / c.filled) * 100)}% of records have ${c.name} = ${bad.map((b) => b.value).join("/")} [${where}]`,
              columns: [c.name],
              file: where,
            });
          }
        });
    }
  }
  return facts;
}

export function demoInterview(ctx: ContextPack, files: SourceFile[]) {
  const text = ctx.processText.trim();
  const sents = sentences(text);
  const sec = sections(text);
  const answers = {} as Record<QuestionId, { answer: string; confidence: Confidence; followUp: string }>;

  const headline = text.split("\n").find((l) => l.trim().length > 3)?.replace(/^#+\s*/, "").trim() ?? "";
  const fallbackTitle = files[0]?.name.replace(/\.[^.]+$/, "") ?? "Untitled workflow";
  const title = headline.length > 70 ? headline.slice(0, 67) + "…" : headline || fallbackTitle;

  const intro = sents.filter((s) => s !== headline && !s.endsWith(":")).slice(0, 2).join(" ");
  answers.workflow = { answer: intro, confidence: intro ? "medium" : "low", followUp: FOLLOW_UPS.workflow };

  const numbered = text.split("\n").filter((l) => /^\s*(\d+[.)]|step\s*\d+)/i.test(l)).map(cleanStep);
  const items = sec.steps ? listItems(sec.steps) : numbered.length >= 3 ? numbered : listItems(text);
  const steps = (items.length >= 3 ? items : sents.slice(0, 8)).slice(0, 12);
  answers.steps = {
    answer: steps.map((s, i) => `${i + 1}. ${s}`).join("\n"),
    confidence: items.length >= 3 ? "high" : "low",
    followUp: FOLLOW_UPS.steps,
  };

  const roles = new Map<string, number[]>();
  steps.forEach((s, i) => {
    const r = roleIn(s);
    if (r) roles.set(r, [...(roles.get(r) ?? []), i + 1]);
  });
  answers.humans = sec.humans
    ? { answer: sec.humans, confidence: "high", followUp: FOLLOW_UPS.humans }
    : {
        answer: Array.from(roles, ([r, n]) => `${r}: step${n.length > 1 ? "s" : ""} ${n.join(", ")}`).join("\n"),
        confidence: conf(Math.min(2, roles.size)),
        followUp: FOLLOW_UPS.humans,
      };

  const triggerPref = /\b(starts?|trigger|kick|initiat|begins?)\b/i;
  const pools: Record<"trigger" | "decisions" | "problems" | "data" | "outcomes", string[]> = {
    trigger: sec.trigger ? [sec.trigger] : [sents.find((s) => triggerPref.test(s)) ?? rank(text, KEYWORDS.trigger, 1)[0]].filter(Boolean),
    decisions: sec.decisions ? [sec.decisions] : rank(steps.join("\n"), KEYWORDS.decisions, 4),
    problems: sec.problems ? [sec.problems] : rank(text, KEYWORDS.problems, 4, steps),
    data: sec.data ? [sec.data] : rank(text, KEYWORDS.data, 3, steps),
    outcomes: sec.outcomes ? [sec.outcomes] : rank(text, KEYWORDS.outcomes, 3, steps),
  };
  (Object.keys(pools) as (keyof typeof pools)[]).forEach((k) => {
    const hits = pools[k];
    answers[k] = {
      answer: hits.join("\n"),
      confidence: sec[k] ? "high" : conf(Math.min(1, hits.length)),
      followUp: FOLLOW_UPS[k],
    };
  });

  const df = dataFacts(files);
  const merge = (k: QuestionId, extra: string[], label: string) => {
    if (!extra.length) return;
    const base = answers[k].answer.trim();
    answers[k] = {
      ...answers[k],
      answer: [base, `${label}:`, ...extra.map((x) => `- ${x}`)].filter(Boolean).join("\n"),
      confidence: "high",
    };
  };
  merge("data", df.inventory, "From uploaded datasets");
  merge("outcomes", df.outcomes.slice(0, 8), "Measured in uploaded data");
  merge("problems", df.problems.slice(0, 5).map((p) => p.text), "Signals found in the data");

  return { title, answers };
}

/* ---------------- analysis ---------------- */

function cleanStep(s: string) {
  return s.replace(/^\s*(\d+[.)]|[-*•]|step\s*\d+[:.)-]?)\s*/i, "").trim();
}

function shortName(s: string) {
  const first = s.split(/[,:;(—–]\s|\s-\s|\s+(?:and then|then|so that|which|to ensure)\s+/i)[0];
  const words = first.replace(/[.]$/, "").split(/\s+/).slice(0, 6);
  while (words.length > 2 && STOP.has(words[words.length - 1].toLowerCase())) words.pop();
  const name = words.join(" ");
  return name.charAt(0).toUpperCase() + name.slice(1);
}

const SYSTEM_RE = /^(the\s+)?(system|sap|erp|crm|salesforce|servicenow|workday|oracle|bot|portal|scheduler|automation|\w+ system)\b/i;

function detectActor(step: string): string {
  if (SYSTEM_RE.test(step) || /\b(automatically|auto-)/i.test(step)) return "System";
  return roleIn(step) ?? "Operations";
}

function stepType(s: string, i: number, n: number): StepType {
  if (i === 0) return "trigger";
  if (KEYWORDS.decisions.test(s)) return "decision";
  if (/\b(send|route|forward|hand|assign|escalat|pass|notify|transfer)/i.test(s)) return "handoff";
  if (i === n - 1) return "end";
  return "task";
}

const PAIN_RULES: { re: RegExp; cat: PainCategory; title: (n: string) => string; desc: (n: string) => string; late: boolean }[] = [
  {
    re: /\b(manual|key|enter|re-?type|copy|paste|spreadsheet|excel|email)/i,
    cat: "manual",
    title: (n) => `Manual effort in “${n}”`,
    desc: (n) => `“${n}” relies on hand-keying or copy/paste, consuming capacity and introducing transcription errors.`,
    late: false,
  },
  {
    re: /\b(approv|sign[- ]off|wait|queue|pending|review)/i,
    cat: "delay",
    title: (n) => `Queueing at “${n}”`,
    desc: () => `Items wait for a person to pick them up; nobody sees the queue building until deadlines are close.`,
    late: true,
  },
  {
    re: /\b(check|verify|match|validat|reconcil|audit|inspect|qa|test)/i,
    cat: "error",
    title: (n) => `Errors surface at “${n}”`,
    desc: () => `Defects introduced upstream are only caught here, forcing rework loops back to earlier steps.`,
    late: true,
  },
  {
    re: /\b(send|route|forward|hand|assign|escalat|transfer|pass)/i,
    cat: "handoff",
    title: (n) => `Hand-off friction at “${n}”`,
    desc: () => `Context is lost between teams, causing clarification requests and bounced work.`,
    late: false,
  },
  {
    re: /\b(complian|regulat|policy|audit|kyc|gdpr|sox)/i,
    cat: "compliance",
    title: (n) => `Compliance exposure in “${n}”`,
    desc: () => `Policy breaches are detected after the fact rather than prevented.`,
    late: true,
  },
];

function overlap(a: string, b: string) {
  const stems = (s: string) => (s.toLowerCase().match(/[a-z]{4,}/g) ?? []).map((w) => w.slice(0, 6));
  const wa = new Set(stems(a));
  return stems(b).filter((w) => wa.has(w)).length;
}

const PRED_TEMPLATES: Record<
  PainCategory,
  (step: WorkflowStep, prev: WorkflowStep | undefined) => Omit<Prediction, "id" | "stepId" | "painPointIds">
> = {
  delay: (s, prev) => ({
    title: `Predict SLA risk before “${s.name}”`,
    whatToPredict: `Probability that an item will stall at “${s.name}” beyond its target time.`,
    whenPredicted: `As soon as the item reaches “${prev?.name ?? "intake"}” — hours or days before the queue forms.`,
    whoActs: `${s.actor} lead`,
    value: "high",
    feasibility: "medium",
    assumptions: ["Historical step timestamps exist", "Queue length and approver availability are knowable in advance"],
    devilsAdvocate: `If the ${s.actor.toLowerCase()} team has no spare capacity to re-prioritise, knowing earlier changes nothing.`,
    facilitatorQuestions: [
      `If you knew on day 1 that an item would be late, what exactly would you do differently?`,
      `Who has authority to re-route or expedite work at “${s.name}”?`,
    ],
  }),
  error: (s, prev) => ({
    title: `Predict exceptions at “${s.name}”`,
    whatToPredict: `Likelihood that an item will fail or be flagged at “${s.name}”.`,
    whenPredicted: `At “${prev?.name ?? "intake"}”, before effort is spent downstream.`,
    whoActs: prev?.actor ? `${prev.actor}` : "Intake owner",
    value: "high",
    feasibility: "medium",
    assumptions: ["Past exceptions are recorded with a reason code", "Root causes are visible in intake data"],
    devilsAdvocate: "Exception reasons may be too varied or poorly logged for a reliable signal.",
    facilitatorQuestions: [
      "Do we record *why* items fail today, or only that they failed?",
      "Would a 'likely exception' flag at intake be trusted by the people receiving it?",
    ],
  }),
  rework: (s) => ({
    title: `Predict rework loops at “${s.name}”`,
    whatToPredict: `Chance that work returns to an earlier step after “${s.name}”.`,
    whenPredicted: "Before the first hand-off.",
    whoActs: s.actor,
    value: "medium",
    feasibility: "medium",
    assumptions: ["Rework is traceable via status history"],
    devilsAdvocate: "Rework may stem from unclear policy, which a prediction will not fix.",
    facilitatorQuestions: ["Is rework a symptom of a missing standard rather than something to predict?"],
  }),
  handoff: (s) => ({
    title: `Predict hand-offs likely to bounce`,
    whatToPredict: `Which items sent via “${s.name}” will come back for clarification.`,
    whenPredicted: "At the moment of hand-off.",
    whoActs: s.actor,
    value: "medium",
    feasibility: "high",
    assumptions: ["Completeness of the hand-off package can be scored"],
    devilsAdvocate: "A simple completeness checklist might deliver the same benefit without any model.",
    facilitatorQuestions: [
      "Is this really a prediction problem, or a checklist problem?",
      "What fraction of hand-offs bounce today?",
    ],
  }),
  manual: (s) => ({
    title: `Predict effort & route at intake`,
    whatToPredict: `Complexity of each item so simple ones can skip manual handling at “${s.name}”.`,
    whenPredicted: "At intake, before anyone touches the item.",
    whoActs: `${s.actor} supervisor`,
    value: "medium",
    feasibility: "high",
    assumptions: ["Simple vs complex items are distinguishable from intake attributes"],
    devilsAdvocate: "Straight automation (OCR, integration) may beat prediction here.",
    facilitatorQuestions: ["What share of items are 'simple'? Would fast-tracking them free real capacity?"],
  }),
  visibility: (s) => ({
    title: `Predict end-to-end outcome early`,
    whatToPredict: `Whether the workflow instance will meet its outcome target, assessed at “${s.name}”.`,
    whenPredicted: "Within the first step or two.",
    whoActs: "Process owner",
    value: "high",
    feasibility: "low",
    assumptions: ["Outcome labels exist for past instances"],
    devilsAdvocate: "An early, low-accuracy risk score could create alert fatigue.",
    facilitatorQuestions: ["What accuracy would you need before acting on this score?"],
  }),
  compliance: (s) => ({
    title: `Predict policy breaches before they occur`,
    whatToPredict: `Items likely to breach policy at “${s.name}”.`,
    whenPredicted: "Before approval / commitment.",
    whoActs: "Compliance owner",
    value: "high",
    feasibility: "medium",
    assumptions: ["Past breaches are documented"],
    devilsAdvocate: "A deterministic rule may be safer and more auditable than a prediction.",
    facilitatorQuestions: ["Would an auditor accept a probabilistic control here?"],
  }),
};

const INDICATORS: Record<PainCategory, [string, string, string][]> = {
  delay: [
    ["Queue age at step", "Items older than P75 cycle time still waiting", "Workflow status timestamps"],
    ["Approver load", "Open items per approver vs. weekly norm", "Task / approval system"],
  ],
  error: [
    ["Intake completeness score", "Missing or inconsistent fields at entry", "Intake form / document metadata"],
    ["Source reliability", "Historic exception rate of this requester or supplier", "Exception log"],
  ],
  rework: [["Status reversals", "Item moved backwards in status", "Status history"]],
  handoff: [
    ["Clarification requests", "Emails or comments asking for missing info", "Email / ticket comments"],
  ],
  manual: [["Touch count", "Number of manual edits per item", "Audit trail"]],
  visibility: [["Early milestone slippage", "First milestone missed by >1 day", "Workflow timestamps"]],
  compliance: [["Policy-adjacent attributes", "Values near approval thresholds", "Transaction data"]],
};

const LEVER: Record<PainCategory, [string, Intervention["automationLevel"], string]> = {
  delay: ["Re-prioritise the queue and nudge the approver; offer a delegate if they are away.", "recommend", "Human confirms any re-routing; daily cap on nudges."],
  error: ["Return to sender with the specific likely defect before it moves downstream.", "recommend", "Only flag when confidence > agreed threshold; log overrides."],
  rework: ["Add a targeted pre-check for the predicted rework reason.", "inform", "Review false-positive rate weekly."],
  handoff: ["Block hand-off until the predicted missing items are attached.", "automate", "Allow manual override with reason."],
  manual: ["Fast-track low-complexity items through a straight-through path.", "automate", "Random 5% sample audited by a human."],
  visibility: ["Surface at-risk items on the process owner's daily stand-up board.", "inform", "Show reason codes, not just a score."],
  compliance: ["Require second review for items predicted to breach policy.", "recommend", "Never auto-reject; compliance retains final call."],
};

function cite(text: string, files: SourceFile[], limit = 3) {
  const m = matchColumns(text, files, limit);
  return m.length ? m.map((x) => `${x.file} › ${x.sheet} › ${x.column.name}`).join("; ") : undefined;
}

export function demoAnalysis(answers: Answers, ctx: ContextPack, files: SourceFile[]): Analysis {
  const source = ctx.processText;
  const metricFiles = files.filter((f) => f.role === "metrics");
  const df = dataFacts(files);
  const stepsRaw = listItems(answers.steps.value).length
    ? listItems(answers.steps.value)
    : answers.steps.value.split(/\n|;|→|->/).map(cleanStep).filter(Boolean);
  const stepTexts = (stepsRaw.length >= 3 ? stepsRaw : sentences(source).slice(0, 8)).slice(0, 10);
  const trigger = answers.trigger.value.split("\n")[0].trim();
  if (trigger && !KEYWORDS.trigger.test(stepTexts[0] ?? "")) {
    stepTexts.unshift(trigger.replace(/^(the process|it|this workflow)\s+(starts|begins|is triggered)\s+(when|by)\s+/i, ""));
  }
  if (stepTexts.length === 0) stepTexts.push("Receive request", "Process request", "Review & approve", "Complete");

  const n = stepTexts.length;
  const workflowMap: WorkflowStep[] = stepTexts.map((t, i) => {
    const type = stepType(t, i, n);
    const actor = detectActor(t);
    const name = shortName(t);
    return {
      id: `s${i + 1}`,
      name,
      description: t.charAt(0).toUpperCase() + t.slice(1),
      actor,
      type,
      human: actor !== "System",
      decision: type === "decision" ? `${name.replace(/\?$/, "")}?` : undefined,
    };
  });

  /* B. pain points */
  const pains: PainPoint[] = [];
  workflowMap.forEach((s, i) => {
    if (i === 0) return;
    const rule = PAIN_RULES.find((r) => r.re.test(s.description));
    if (rule && pains.length < 6) {
      const problemBoost = sentences(answers.problems.value).some((p) => overlap(p, s.description) > 0) ? 1 : 0;
      pains.push({
        id: `p${pains.length + 1}`,
        stepId: s.id,
        title: rule.title(s.name),
        description: rule.desc(s.name),
        severity: Math.min(5, 3 + problemBoost + (rule.late ? 1 : 0)),
        frequency: Math.min(5, 3 + (s.human ? 1 : 0)),
        category: rule.cat,
        discoveredLate: rule.late,
      });
    }
  });
  df.problems.forEach((dp) => {
    if (pains.length >= 8) return;
    const best = [...workflowMap].sort((a, b) => overlap(dp.text, b.description) - overlap(dp.text, a.description))[0];
    pains.push({
      id: `p${pains.length + 1}`,
      stepId: best.id,
      title: dp.text.startsWith("Long tail") ? `Long tail: ${dp.columns.join(" → ")}` : `High ${dp.columns[0]} exception rate`,
      description: dp.text.replace(/\s*\[[^\]]+\]$/, ""),
      severity: 4,
      frequency: 4,
      category: dp.text.startsWith("Long tail") ? "delay" : "error",
      discoveredLate: true,
      evidence: `${dp.file} › ${dp.columns.join(", ")}`,
    });
  });
  sentences(answers.problems.value).forEach((p) => {
    if (pains.length >= 8 || /\[[^\]]+›/.test(p) || /:\s*$/.test(p)) return;
    const best = [...workflowMap].sort((a, b) => overlap(p, b.description) - overlap(p, a.description))[0];
    if (pains.some((x) => x.stepId === best.id)) return;
    pains.push({
      id: `p${pains.length + 1}`,
      stepId: best.id,
      title: shortName(p),
      description: p,
      severity: 4,
      frequency: 3,
      category: /late|delay|slow|wait|chase/i.test(p) ? "delay" : /error|mistake|wrong|mismatch|incorrect/i.test(p) ? "error" : "visibility",
      discoveredLate: true,
    });
  });
  if (pains.length === 0) {
    const s = workflowMap[Math.floor(n / 2)];
    pains.push({
      id: "p1",
      stepId: s.id,
      title: "Limited visibility of progress",
      description: "Status of in-flight items is not visible until something goes wrong.",
      severity: 3,
      frequency: 4,
      category: "visibility",
      discoveredLate: true,
    });
  }

  pains.forEach((p) => {
    if (p.evidence) return;
    const step = workflowMap.find((s) => s.id === p.stepId);
    p.evidence = cite(`${p.title} ${p.description} ${step?.description ?? ""}`, metricFiles, 2) ?? "Team interview";
  });

  /* C. predictions */
  const ranked = [...pains].sort((a, b) => b.severity * b.frequency - a.severity * a.frequency);
  const usedCats = new Set<PainCategory>();
  const predictions: Prediction[] = [];
  const firstOfEach = ranked.filter((p) => !usedCats.has(p.category) && usedCats.add(p.category));
  const chosen = [...firstOfEach, ...ranked.filter((p) => !firstOfEach.includes(p))].slice(0, 4);
  for (const p of chosen) {
    const idx = workflowMap.findIndex((s) => s.id === p.stepId);
    const tmpl = PRED_TEMPLATES[p.category](workflowMap[idx], workflowMap[Math.max(0, idx - 1)]);
    const same = predictions.find((x) => x.title === tmpl.title);
    if (same) {
      same.painPointIds.push(p.id);
      continue;
    }
    predictions.push({ ...tmpl, id: `c${predictions.length + 1}`, stepId: p.stepId, painPointIds: [p.id] });
  }
  if (!usedCats.has("visibility") && predictions.length < 6) {
    const s = workflowMap[Math.min(1, n - 1)];
    predictions.push({
      ...PRED_TEMPLATES.visibility(s, workflowMap[0]),
      whatToPredict: `Whether this instance will hit its outcome target${answers.outcomes.value ? ` (${answers.outcomes.value.split("\n")[0].slice(0, 80)})` : ""}.`,
      id: `c${predictions.length + 1}`,
      stepId: s.id,
      painPointIds: [],
    });
  }

  predictions.forEach((pr) => {
    const step = workflowMap.find((s) => s.id === pr.stepId);
    const linked = pains.filter((p) => pr.painPointIds.includes(p.id));
    pr.evidence =
      cite(`${pr.title} ${pr.whatToPredict} ${step?.description ?? ""} ${linked.map((p) => p.evidence).join(" ")}`, metricFiles) ??
      (metricFiles.length ? "No matching columns found in uploaded data" : "No datasets uploaded");
  });

  /* D, E */
  const leadingIndicators: LeadingIndicator[] = [];
  const interventions: Intervention[] = [];
  predictions.forEach((pr) => {
    const cat = pains.find((p) => pr.painPointIds.includes(p.id))?.category ?? "visibility";
    INDICATORS[cat].forEach(([name, signal, src]) =>
      leadingIndicators.push({
        id: `d${leadingIndicators.length + 1}`,
        predictionId: pr.id,
        name,
        signal,
        source: cite(`${name} ${signal} ${pr.whatToPredict}`, metricFiles, 1) ?? src,
        leadTime: cat === "delay" ? "1–3 days" : "At intake",
      }),
    );
    const [action, level, guard] = LEVER[cat];
    interventions.push({
      id: `e${interventions.length + 1}`,
      predictionId: pr.id,
      when: "This prediction flags an item as high-risk",
      action,
      owner: pr.whoActs,
      automationLevel: level,
      guardrail: guard,
    });
  });

  /* F */
  const futureSteps: FutureStep[] = [];
  futureSteps.push({
    id: "f1",
    name: workflowMap[0].name,
    description: workflowMap[0].description,
    actor: workflowMap[0].actor,
    change: "unchanged",
  });
  futureSteps.push({
    id: "f2",
    name: "AI risk triage",
    description: "Every new item is scored for predicted delays, exceptions and complexity; results route the work.",
    actor: "System",
    change: "new",
    predictionId: predictions[0]?.id,
  });
  workflowMap.slice(1).forEach((s) => {
    const pr = predictions.find((p) => p.stepId === s.id);
    const pain = pains.find((p) => p.stepId === s.id);
    const change: FutureStep["change"] =
      pain?.category === "manual" ? "automated" : pr ? "augmented" : "unchanged";
    futureSteps.push({
      id: `f${futureSteps.length + 1}`,
      name: s.name,
      description:
        change === "automated"
          ? `Low-complexity items flow straight through; humans handle predicted exceptions only.`
          : change === "augmented"
            ? `${s.actor} sees a risk flag and recommended action before work reaches this step.`
            : s.description,
      actor: change === "automated" ? `System + ${s.actor}` : s.actor,
      change,
      predictionId: pr?.id,
    });
  });

  /* G */
  const dataRequirements: DataRequirement[] = [];
  const dataItems = uniq(
    answers.data.value
      .split("From uploaded datasets:")[0]
      .split(/\n|;|,(?![^(]*\))/)
      .map((d) => d.replace(/^[\s\-*•\d.)]+/, "").trim())
      .filter((d) => d.length > 2),
  ).slice(0, 5);
  dataItems.forEach((d) =>
    dataRequirements.push({
      id: `g${dataRequirements.length + 1}`,
      name: shortName(d),
      description: d,
      source: d.match(KEYWORDS.data)?.[0]?.toUpperCase() ?? "Existing system",
      availability: "available",
      predictionIds: predictions.map((p) => p.id),
    }),
  );
  metricFiles.forEach((f) =>
    (f.sheets ?? []).forEach((s) => {
      const key = s.columns.filter((c) => c.type === "date" || c.type === "category" || c.type === "number" || c.type === "boolean");
      if (!key.length) return;
      const blanky = key.filter((c) => c.missingPct > 20);
      dataRequirements.push({
        id: `g${dataRequirements.length + 1}`,
        name: `${f.name.replace(/\.[^.]+$/, "")} › ${s.name}`,
        description: `${s.rows.toLocaleString()} records with ${key.slice(0, 6).map((c) => c.name).join(", ")}${key.length > 6 ? "…" : ""}.`,
        source: `${f.name} › ${s.name}`,
        availability: blanky.length ? "partial" : "available",
        predictionIds: predictions.filter((p) => p.evidence?.includes(`${f.name} › ${s.name}`)).map((p) => p.id),
        evidence: blanky.length
          ? `Blank-heavy: ${blanky.map((c) => `${c.name} ${c.missingPct}%`).join(", ")}`
          : `All key columns ≥ 80% populated`,
      });
    }),
  );

  const allCols = metricFiles.flatMap((f) => (f.sheets ?? []).flatMap((s) => s.columns.map((c) => ({ c, where: `${f.name} › ${s.name} › ${c.name}` }))));
  const dateCols = allCols.filter((x) => x.c.type === "date");
  const labelCols = allCols.filter((x) => x.c.top?.some((t) => BAD_VALUE.test(t.value)));
  const actorCols = allCols.filter((x) => /owner|assignee|agent|handler|user|approver|team/i.test(x.c.name));
  (
    [
      ["Step-level timestamps", "Entry/exit time for every step of every instance (event log).", "Workflow / ticketing system", dateCols, 2],
      ["Historical outcome labels", "Which past instances were late, wrong or reworked — and why.", "To be compiled from logs + team knowledge", labelCols, 1],
      ["Actor & capacity data", "Who handled each item and their concurrent workload.", "HR / task system", actorCols, 1],
    ] as const
  ).forEach(([name, description, src, found, need]) =>
    dataRequirements.push({
      id: `g${dataRequirements.length + 1}`,
      name,
      description,
      source: found.length ? found[0].where.split(" › ").slice(0, 2).join(" › ") : src,
      availability: found.length >= need ? "available" : found.length ? "partial" : name.startsWith("Historical") ? "missing" : "partial",
      predictionIds: predictions.map((p) => p.id),
      evidence: found.length ? `Found: ${found.slice(0, 3).map((x) => x.where).join("; ")}` : "Not found in uploaded data",
    }),
  );
  const baseline = metricFiles
    .flatMap((f) => (f.sheets ?? []).flatMap((s) => s.derived))
    .find((d) => d.name.startsWith("Elapsed"));
  const baselineMedian = baseline?.value.match(/median ([\d.]+)/)?.[1];

  /* H */
  const top = predictions[0];
  const prototypes: PrototypeSuggestion[] = [
    {
      id: "h1",
      title: "Paper-prototype the risk flag",
      description: `For 2 weeks, manually label new items as high/low risk for "${top?.title ?? "the top prediction"}" and track whether acting early helps.`,
      effort: "S",
      timeline: "2 weeks",
      successMetric: "≥ 60% of flagged items actually hit the predicted problem",
      predictionIds: top ? [top.id] : [],
      steps: ["Agree a simple scoring rubric", "Score every new item at intake", "Record outcomes", "Review hit-rate together"],
    },
    {
      id: "h2",
      title: "Back-test on historical data",
      description: "Pull 3–6 months of event logs and test whether the leading indicators would have predicted the known bad outcomes.",
      effort: "M",
      timeline: "3–4 weeks",
      successMetric: "Indicators separate good vs bad outcomes (AUC ≥ 0.7)",
      predictionIds: predictions.slice(0, 3).map((p) => p.id),
      steps: ["Extract step timestamps", "Label outcomes", "Compute indicators", "Compare distributions"],
    },
    {
      id: "h3",
      title: "Wizard-of-Oz intervention",
      description: "A team member plays the 'AI' and sends the recommended intervention to owners; measure response and impact.",
      effort: "S",
      timeline: "2–3 weeks",
      successMetric: baselineMedian
        ? `Owners act on ≥ 70% of nudges and median ${baseline!.name.replace("Elapsed days ", "")} falls below ${baselineMedian} days (today's baseline)`
        : "Owners act on ≥ 70% of nudges and cycle time improves",
      predictionIds: predictions.slice(0, 2).map((p) => p.id),
      steps: ["Pick one intervention", "Define message & channel", "Run with one team", "Debrief"],
    },
  ];

  const openQuestions = [
    ...QUESTIONS.filter((q) => !answers[q.id].value.trim()).map((q) => `We don't yet know: ${q.title.toLowerCase()}`),
    "Which of these predictions would actually change what someone does on Monday morning?",
    "Do we have labelled history of past failures, or must we start collecting it?",
    "Who owns the decision to act on a prediction — and are they in this room?",
  ];

  return {
    summary: `${answers.workflow.value.split("\n")[0] || "This workflow"} — ${n} steps, ${pains.length} pain points, ${predictions.filter((p) => p.value === "high").length} high-value prediction opportunities. Problems are mostly discovered late, which makes shifting detection earlier the main reimagination lever.`,
    workflowMap,
    painPoints: pains,
    predictions,
    leadingIndicators,
    interventions,
    futureState: {
      narrative:
        "Instead of discovering problems where they surface, every item is risk-scored at intake. Owners get early, explained flags with a recommended action, simple work flows straight through, and humans focus on the exceptions that matter.",
      steps: futureSteps,
    },
    dataRequirements,
    prototypes,
    openQuestions,
    source: "demo",
    generatedAt: new Date().toISOString(),
  };
}

export function demoRefine(
  analysis: Analysis,
  reviews: Record<string, PredictionReview>,
  files: SourceFile[] = [],
): Analysis {
  const verdict = (id: string) => reviews[id]?.verdict ?? "undecided";
  const keep = new Set(analysis.predictions.filter((p) => verdict(p.id) === "actionable").map((p) => p.id));
  const needsData = analysis.predictions.filter((p) => verdict(p.id) === "needs-data");
  const kept = analysis.predictions.filter((p) => keep.has(p.id) || verdict(p.id) === "needs-data");
  const keepIds = (ids: string[]) => ids.filter((id) => keep.has(id));

  const dataRequirements = analysis.dataRequirements
    .map((g) => ({ ...g, predictionIds: g.predictionIds.filter((id) => keep.has(id) || needsData.some((n) => n.id === id)) }))
    .filter((g) => g.predictionIds.length > 0 || g.source.includes(" › "));
  needsData.forEach((p) => {
    const candidates = cite(`${p.title} ${p.whatToPredict}`, files);
    dataRequirements.push({
      id: `g${dataRequirements.length + 1}_${p.id}`,
      name: `Data to validate: ${p.title}`,
      description: reviews[p.id]?.rationale || `The team flagged that “${p.title}” needs data before it can be acted on.`,
      source: candidates ? "Partly in uploaded data" : "To be identified",
      availability: candidates ? "partial" : "missing",
      predictionIds: [p.id],
      evidence: candidates ? `Possible starting point: ${candidates}` : "No matching columns in uploaded data",
    });
  });

  const prototypes = analysis.prototypes
    .map((h) => ({ ...h, predictionIds: keepIds(h.predictionIds) }))
    .filter((h) => h.predictionIds.length > 0);
  if (needsData.length) {
    prototypes.push({
      id: `h_data`,
      title: "Data discovery sprint",
      description: `Locate and sample the data needed for: ${needsData.map((p) => p.title).join("; ")}.`,
      effort: "S",
      timeline: "1–2 weeks",
      successMetric: "Data owner identified and a 3-month sample extracted",
      predictionIds: needsData.map((p) => p.id),
      steps: ["Map required fields", "Find system owners", "Extract sample", "Assess quality together"],
    });
  }

  return {
    ...analysis,
    predictions: kept,
    leadingIndicators: analysis.leadingIndicators.filter((d) => keep.has(d.predictionId)),
    interventions: analysis.interventions
      .filter((e) => keep.has(e.predictionId))
      .map((e) => (reviews[e.predictionId]?.rationale ? { ...e, guardrail: `${e.guardrail} Team note: ${reviews[e.predictionId].rationale}` } : e)),
    futureState: {
      ...analysis.futureState,
      steps: analysis.futureState.steps
        .filter((f) => !(f.change === "new" && f.predictionId && !keep.has(f.predictionId) && keep.size === 0))
        .map((f) =>
          f.predictionId && !keep.has(f.predictionId) && f.change !== "new"
            ? { ...f, change: "unchanged" as const, predictionId: undefined }
            : f,
        ),
    },
    dataRequirements,
    prototypes,
    openQuestions: [
      ...needsData.map((p) => `What data would make “${p.title}” actionable, and who owns it?`),
      ...(keep.size === 0 ? ["The team found no prediction actionable yet — revisit the pain points or reframe the decision points."] : []),
      "What is the smallest experiment that would prove the top actionable prediction wrong?",
    ],
    refinedFromReview: true,
    generatedAt: new Date().toISOString(),
  };
}
