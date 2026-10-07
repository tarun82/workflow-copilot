import type { Answers, CriterionKey, QuestionId } from "./types";

export interface Question {
  id: QuestionId;
  title: string;
  prompt: string;
  hint: string;
  placeholder: string;
}

export const QUESTIONS: Question[] = [
  {
    id: "workflow",
    title: "What is the workflow?",
    prompt: "In one or two sentences, what does this workflow accomplish and for whom?",
    hint: "Name it, state its purpose and who benefits when it runs well.",
    placeholder: "e.g. Vendor invoice processing — getting supplier invoices validated, approved and paid on time.",
  },
  {
    id: "trigger",
    title: "What triggers it?",
    prompt: "What event, request or schedule kicks this workflow off?",
    hint: "Think inbound email, form submission, month-end, a system alert, a customer call…",
    placeholder: "e.g. A supplier emails a PDF invoice to the AP mailbox.",
  },
  {
    id: "steps",
    title: "What are the major steps?",
    prompt: "List the major steps in order, from trigger to completion.",
    hint: "One step per line works best. 5–12 steps is the sweet spot.",
    placeholder: "1. Receive invoice\n2. Key into ERP\n3. Match to PO\n4. Route for approval\n5. Schedule payment",
  },
  {
    id: "humans",
    title: "Where are humans involved?",
    prompt: "Which steps need a person, and which role performs them?",
    hint: "Include hand-offs between teams — that's often where time disappears.",
    placeholder: "e.g. AP clerk keys data; budget owner approves; treasury releases payment.",
  },
  {
    id: "decisions",
    title: "Where are decisions made?",
    prompt: "What judgement calls happen along the way, and what are they based on?",
    hint: "Approvals, exceptions, prioritisation, escalation, go/no-go choices.",
    placeholder: "e.g. Approve or reject invoices over $10k; decide whether a price mismatch is acceptable.",
  },
  {
    id: "problems",
    title: "Where are problems discovered?",
    prompt: "Where do issues usually surface — and how late is that compared to where they started?",
    hint: "Problems discovered late are the best candidates for prediction.",
    placeholder: "e.g. Mismatches found at 3-way match; late payments only noticed when suppliers chase us.",
  },
  {
    id: "data",
    title: "What data is available?",
    prompt: "What systems, records, logs or documents exist for this workflow today?",
    hint: "Include messy data: spreadsheets, email timestamps, ticket histories.",
    placeholder: "e.g. ERP invoice & PO tables, approval timestamps, supplier master, AP mailbox metadata.",
  },
  {
    id: "outcomes",
    title: "What outcomes can be measured?",
    prompt: "How would you know the workflow got better? What can you measure today?",
    hint: "Cycle time, error rate, cost per transaction, SLA breaches, satisfaction…",
    placeholder: "e.g. Invoice cycle time, % paid on time, exceptions per 100 invoices, early-pay discounts captured.",
  },
];

export function emptyAnswers(): Answers {
  return QUESTIONS.reduce((acc, q) => {
    acc[q.id] = { value: "", confirmed: false };
    return acc;
  }, {} as Answers);
}

export const SECTIONS = [
  { key: "A", id: "map", title: "Workflow map" },
  { key: "B", id: "pain", title: "Pain-point map" },
  { key: "C", id: "predictions", title: "Prediction opportunities" },
  { key: "D", id: "indicators", title: "Leading indicators" },
  { key: "E", id: "interventions", title: "Prescriptive interventions" },
  { key: "F", id: "future", title: "Future-state workflow" },
  { key: "G", id: "data", title: "Data requirements" },
  { key: "H", id: "prototypes", title: "Prototype suggestions" },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];

export const CRITERIA: { key: CriterionKey; label: string; question: string }[] = [
  { key: "owner", label: "Clear owner", question: "Is there a named person or role who would act on this prediction?" },
  { key: "leadTime", label: "Enough lead time", question: "Does the prediction arrive early enough to change the outcome?" },
  { key: "lever", label: "A lever to pull", question: "Is there something concrete they could do differently when it fires?" },
  { key: "data", label: "Data exists", question: "Do we have (or can we get) the data to make this prediction?" },
  { key: "measurable", label: "Measurable impact", question: "Could we tell, within a quarter, whether acting on it helped?" },
];
