import type { Collateral, ColumnProfile, LedgerEntry, SheetProfile, SourceFile } from "./types";

export const PASTED = "Pasted notes";

/** Character budgets per stage. Roughly 4 chars ≈ 1 token. */
export const BUDGETS = {
  interview: 60_000,
  generate: 70_000,
  refine: 20_000,
} as const;

function excerpt(text: string, max: number) {
  if (text.length <= max) return text;
  const head = Math.floor(max * 0.7);
  const tail = max - head - 60;
  return `${text.slice(0, head)}\n[… ${(text.length - head - tail).toLocaleString()} characters omitted …]\n${text.slice(-Math.max(0, tail))}`;
}

/** Fair-share allocation: small items get everything they need, the rest split what remains. */
function allocate(sizes: number[], budget: number) {
  const order = sizes.map((s, i) => [s, i]).sort((a, b) => a[0] - b[0]);
  const out = new Array(sizes.length).fill(0);
  let remaining = budget;
  order.forEach(([size, i], k) => {
    const share = Math.floor(remaining / (order.length - k));
    out[i] = Math.min(size, share);
    remaining -= out[i];
  });
  return out;
}

function fmtCol(c: ColumnProfile) {
  const parts = [`${c.name} (${c.type}`];
  if (c.missingPct > 0) parts.push(`, ${c.missingPct}% blank`);
  parts.push(")");
  if (c.type === "number") parts.push(`: min ${c.min}, median ${c.median}, mean ${c.mean}, p90 ${c.p90}, max ${c.max}`);
  else if (c.type === "date") parts.push(`: ${c.min} → ${c.max}`);
  else if (c.top?.length) parts.push(`: ${c.top.map((t) => `${t.value}×${t.count}`).join(", ")}${c.distinct > c.top.length ? ` (+${c.distinct - c.top.length} more)` : ""}`);
  else parts.push(`: ${c.distinct} distinct`);
  return parts.join("");
}

export function renderSheet(file: string, s: SheetProfile) {
  const lines = [`### ${file} › ${s.name} — ${s.rows.toLocaleString()} rows × ${s.columns.length} columns`];
  lines.push("Columns:", ...s.columns.map((c) => `- ${fmtCol(c)}`));
  if (s.derived.length) lines.push("Computed metrics:", ...s.derived.map((d) => `- ${d.name}: ${d.value}`));
  if (s.sample.length > 1) lines.push("Sample rows:", ...s.sample.slice(0, 4).map((r) => `| ${r.map((c) => c.slice(0, 40)).join(" | ")} |`));
  return lines.join("\n");
}

export interface ContextPack {
  documents: string;
  datasets: string;
  /** Plain process text (no data dumps), used by the heuristic engine. */
  processText: string;
  ledger: LedgerEntry[];
}

export function buildContext(c: Collateral, budget: number): ContextPack {
  const docs: { name: string; role: SourceFile["role"]; text: string; digest?: string }[] = [];
  if (c.rawText.trim()) docs.push({ name: PASTED, role: "process", text: c.rawText.trim() });
  const metrics: SourceFile[] = [];
  for (const f of c.files) {
    if (f.role === "metrics" && f.sheets?.length) metrics.push(f);
    else docs.push({ name: f.name, role: f.role, text: f.text, digest: f.digest });
  }

  const ledger: LedgerEntry[] = [];

  // Datasets: profiles are compact; cap them at 40% of the budget when documents also exist.
  const rendered = metrics.map((f) => ({ f, text: (f.sheets ?? []).map((s) => renderSheet(f.name, s)).join("\n\n") }));
  const dataBudget = docs.length ? Math.floor(budget * 0.4) : budget;
  const dataAlloc = allocate(rendered.map((r) => r.text.length), dataBudget);
  const datasets = rendered
    .map((r, i) => {
      const text = excerpt(r.text, dataAlloc[i]);
      ledger.push({ file: r.f.name, role: "metrics", mode: "profile", includedChars: text.length, totalChars: r.f.chars });
      return text;
    })
    .join("\n\n");

  // Documents: process material first, reference material gets what is left.
  const docBudget = budget - datasets.length;
  const process = docs.filter((d) => d.role === "process");
  const reference = docs.filter((d) => d.role === "reference");
  const processBudget = reference.length ? Math.floor(docBudget * 0.8) : docBudget;
  const parts: string[] = [];
  const place = (list: typeof docs, b: number) => {
    const alloc = allocate(list.map((d) => d.text.length), b);
    let used = 0;
    list.forEach((d, i) => {
      let text: string;
      let mode: LedgerEntry["mode"];
      if (d.text.length <= alloc[i]) {
        text = d.text;
        mode = "full";
      } else if (d.digest) {
        text = excerpt(d.digest, alloc[i]);
        mode = "digest";
      } else {
        text = excerpt(d.text, alloc[i]);
        mode = "excerpt";
      }
      used += text.length;
      parts.push(`## ${d.role === "reference" ? "Reference" : "Source"}: ${d.name}${mode === "digest" ? " (AI digest of long document)" : mode === "excerpt" ? " (excerpt)" : ""}\n${text}`);
      ledger.push({ file: d.name, role: d.role, mode, includedChars: text.length, totalChars: d.text.length });
    });
    return used;
  };
  const usedByProcess = place(process, processBudget);
  place(reference, docBudget - usedByProcess);

  return {
    documents: parts.join("\n\n"),
    datasets,
    processText: process.map((d) => d.digest && d.text.length > budget ? d.digest : d.text).join("\n\n"),
    ledger,
  };
}

/* ---------- linking analysis items back to data ---------- */

export interface ColumnMatch {
  file: string;
  sheet: string;
  column: ColumnProfile;
  score: number;
}

const STOP = new Set(["date", "time", "name", "item", "data", "value", "type", "number", "column", "with", "from", "that", "this", "will", "each", "when", "before", "after"]);

function stems(s: string) {
  return (s.toLowerCase().replace(/([a-z])([A-Z])/g, "$1 $2").match(/[a-z]{3,}/g) ?? [])
    .filter((w) => !STOP.has(w))
    .map((w) => w.slice(0, 5));
}

/** Columns whose names overlap with the given text (e.g. a prediction or indicator). */
export function matchColumns(text: string, files: SourceFile[], limit = 6): ColumnMatch[] {
  const want = new Set(stems(text));
  const out: ColumnMatch[] = [];
  for (const f of files) {
    // Words naming the dataset itself (e.g. "Invoices") appear in almost any related text, so they can't discriminate.
    const subject = new Set(stems([f.name.replace(/\.[^.]+$/, ""), ...(f.sheets ?? []).map((s) => s.name)].join(" ")));
    for (const s of f.sheets ?? []) {
      for (const col of s.columns) {
        const score = stems(col.name).filter((w) => want.has(w) && !subject.has(w)).length;
        if (score > 0) out.push({ file: f.name, sheet: s.name, column: col, score });
      }
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function describeColumn(c: ColumnProfile) {
  return fmtCol(c);
}
