export type QuestionId =
  | "workflow"
  | "trigger"
  | "steps"
  | "humans"
  | "decisions"
  | "problems"
  | "data"
  | "outcomes";

export type Confidence = "high" | "medium" | "low";

export interface Answer {
  value: string;
  aiDraft?: string;
  confidence?: Confidence;
  followUp?: string;
  confirmed: boolean;
}

export type Answers = Record<QuestionId, Answer>;

/**
 * How a collateral is used by the pipeline:
 * - process: describes how the work happens (SOPs, notes, decks) → interview + maps
 * - metrics: tabular data to analyse (exports, KPIs, logs) → profiled, grounds pain points / data / indicators
 * - reference: supporting context (policies, org charts) → included when budget allows
 */
export type FileRole = "process" | "metrics" | "reference";

export type ColumnType = "number" | "date" | "category" | "boolean" | "id" | "text";

export interface ColumnProfile {
  name: string;
  type: ColumnType;
  filled: number;
  missingPct: number;
  distinct: number;
  min?: string;
  max?: string;
  mean?: number;
  median?: number;
  p90?: number;
  top?: { value: string; count: number }[];
}

export interface DerivedMetric {
  name: string;
  value: string;
  columns: string[];
}

export interface SheetProfile {
  name: string;
  rows: number;
  columns: ColumnProfile[];
  derived: DerivedMetric[];
  sample: string[][];
}

export interface SourceFile {
  name: string;
  kind: string;
  chars: number;
  text: string;
  role: FileRole;
  roleReason?: string;
  sheets?: SheetProfile[];
  /** LLM-extracted workflow facts for documents too long to include in full. */
  digest?: string;
}

export type CoverageMode = "full" | "excerpt" | "digest" | "profile";

export interface LedgerEntry {
  file: string;
  role: FileRole;
  mode: CoverageMode;
  includedChars: number;
  totalChars: number;
}

export type StepType = "trigger" | "task" | "decision" | "handoff" | "end";

export interface WorkflowStep {
  id: string;
  name: string;
  description: string;
  actor: string;
  type: StepType;
  human: boolean;
  decision?: string;
  systems?: string[];
}

export type PainCategory =
  | "delay"
  | "error"
  | "rework"
  | "handoff"
  | "visibility"
  | "manual"
  | "compliance";

export interface PainPoint {
  id: string;
  stepId: string;
  title: string;
  description: string;
  severity: number;
  frequency: number;
  category: PainCategory;
  discoveredLate: boolean;
  /** Where this came from, e.g. "tickets.xlsx › Sheet1: median 6.2 days Received → Approved". */
  evidence?: string;
}

export type Level = "high" | "medium" | "low";

export interface Prediction {
  id: string;
  title: string;
  whatToPredict: string;
  whenPredicted: string;
  whoActs: string;
  stepId: string;
  painPointIds: string[];
  value: Level;
  feasibility: Level;
  assumptions: string[];
  devilsAdvocate: string;
  facilitatorQuestions: string[];
  evidence?: string;
}

export interface LeadingIndicator {
  id: string;
  predictionId: string;
  name: string;
  signal: string;
  source: string;
  leadTime: string;
}

export type AutomationLevel = "inform" | "recommend" | "automate";

export interface Intervention {
  id: string;
  predictionId: string;
  when: string;
  action: string;
  owner: string;
  automationLevel: AutomationLevel;
  guardrail: string;
}

export type StepChange = "unchanged" | "augmented" | "automated" | "new" | "removed";

export interface FutureStep {
  id: string;
  name: string;
  description: string;
  actor: string;
  change: StepChange;
  predictionId?: string;
}

export type Availability = "available" | "partial" | "missing";

export interface DataRequirement {
  id: string;
  name: string;
  description: string;
  source: string;
  availability: Availability;
  predictionIds: string[];
  evidence?: string;
}

export interface PrototypeSuggestion {
  id: string;
  title: string;
  description: string;
  effort: "S" | "M" | "L";
  timeline: string;
  successMetric: string;
  predictionIds: string[];
  steps: string[];
}

export interface Analysis {
  summary: string;
  workflowMap: WorkflowStep[];
  painPoints: PainPoint[];
  predictions: Prediction[];
  leadingIndicators: LeadingIndicator[];
  interventions: Intervention[];
  futureState: { narrative: string; steps: FutureStep[] };
  dataRequirements: DataRequirement[];
  prototypes: PrototypeSuggestion[];
  openQuestions: string[];
  source: "llm" | "demo";
  generatedAt: string;
  refinedFromReview?: boolean;
  /** Which collaterals were studied for this pack and how much of each. */
  ledger?: LedgerEntry[];
}

/** Everything the team shared, sent to each pipeline stage. */
export interface Collateral {
  rawText: string;
  files: SourceFile[];
}

export type Verdict = "undecided" | "actionable" | "not-actionable" | "needs-data";

export type CriterionKey = "owner" | "leadTime" | "lever" | "data" | "measurable";

export interface PredictionReview {
  verdict: Verdict;
  criteria: Record<CriterionKey, boolean | null>;
  votes: { actionable: number; notActionable: number; needsData: number };
  rationale: string;
}

export type PainReaction = "agree" | "dispute" | undefined;

export interface Session {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  rawText: string;
  files: SourceFile[];
  answers: Answers;
  analysis?: Analysis;
  /** Original AI pack, kept so the team can change verdicts and rebuild. */
  baseline?: Analysis;
  reviews: Record<string, PredictionReview>;
  painReactions: Record<string, PainReaction>;
  stage: Stage;
  /** Last non-fatal warning from the AI backend (e.g. LLM call failed and demo engine was used). */
  notice?: string;
}

export type Stage = "intake" | "interview" | "studio" | "facilitate" | "report";

export interface LlmStatus {
  configured: boolean;
  provider: string;
  model: string;
}
