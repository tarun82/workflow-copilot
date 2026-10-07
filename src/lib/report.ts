import { CRITERIA, QUESTIONS } from "./questions";
import type { Session } from "./types";

const VERDICT_LABEL = {
  actionable: "✅ Actionable",
  "not-actionable": "❌ Not actionable",
  "needs-data": "🔎 Needs data",
  undecided: "⏳ Undecided",
} as const;

export function buildMarkdown(s: Session): string {
  const a = s.analysis;
  const out: string[] = [];
  out.push(`# ${s.title}`, `_Workflow reimagination pack — ${new Date().toLocaleDateString()}_`, "");

  out.push("## Discovery interview", "");
  QUESTIONS.forEach((q, i) => {
    out.push(`**${i + 1}. ${q.title}**`, "", s.answers[q.id]?.value?.trim() || "_Not answered_", "");
  });

  if (!a) return out.join("\n");

  out.push("## Summary", "", a.summary, "");
  if (a.refinedFromReview) out.push("> This pack has been rebuilt from the team's actionability review.", "");

  out.push("## A. Workflow map", "");
  a.workflowMap.forEach((st, i) =>
    out.push(`${i + 1}. **${st.name}** — ${st.actor}${st.human ? " (human)" : ""} · _${st.type}_  \n   ${st.description}`),
  );
  out.push("");

  out.push("## B. Pain-point map", "", "| Pain point | Step | Category | Severity | Frequency | Found late? |", "|---|---|---|---|---|---|");
  a.painPoints.forEach((p) => {
    const step = a.workflowMap.find((x) => x.id === p.stepId)?.name ?? p.stepId;
    out.push(`| ${p.title} | ${step} | ${p.category} | ${p.severity}/5 | ${p.frequency}/5 | ${p.discoveredLate ? "Yes" : "No"} |`);
  });
  out.push("");

  out.push("## C. Prediction opportunities & team verdicts", "");
  (s.baseline ?? a).predictions.forEach((p) => {
    const r = s.reviews[p.id];
    out.push(`### ${p.title} — ${VERDICT_LABEL[r?.verdict ?? "undecided"]}`);
    out.push(`- **Predict:** ${p.whatToPredict}`, `- **When:** ${p.whenPredicted}`, `- **Who acts:** ${p.whoActs}`);
    out.push(`- **Value / feasibility:** ${p.value} / ${p.feasibility}`);
    if (p.devilsAdvocate) out.push(`- **Devil's advocate:** ${p.devilsAdvocate}`);
    if (p.evidence) out.push(`- **Data evidence:** ${p.evidence}`);
    if (r) {
      const crit = CRITERIA.map((c) => `${c.label}: ${r.criteria[c.key] === true ? "yes" : r.criteria[c.key] === false ? "no" : "?"}`).join(" · ");
      out.push(`- **Actionability checks:** ${crit}`);
      out.push(`- **Votes:** ${r.votes.actionable} actionable · ${r.votes.notActionable} not · ${r.votes.needsData} needs data`);
      if (r.rationale) out.push(`- **Team rationale:** ${r.rationale}`);
    }
    out.push("");
  });

  out.push("## D. Leading indicators", "", "| Indicator | Signal | Source | Lead time | For prediction |", "|---|---|---|---|---|");
  a.leadingIndicators.forEach((d) =>
    out.push(`| ${d.name} | ${d.signal} | ${d.source} | ${d.leadTime} | ${a.predictions.find((p) => p.id === d.predictionId)?.title ?? d.predictionId} |`),
  );
  out.push("");

  out.push("## E. Prescriptive interventions", "");
  a.interventions.forEach((e) =>
    out.push(`- **${e.when}** → ${e.action} _(owner: ${e.owner}; ${e.automationLevel}; guardrail: ${e.guardrail})_`),
  );
  out.push("");

  out.push("## F. Future-state workflow", "", a.futureState.narrative, "");
  a.futureState.steps.forEach((f, i) => out.push(`${i + 1}. **${f.name}** [${f.change}] — ${f.actor}: ${f.description}`));
  out.push("");

  out.push("## G. Data requirements", "", "| Data | Source | Availability | Description |", "|---|---|---|---|");
  a.dataRequirements.forEach((g) => out.push(`| ${g.name} | ${g.source} | ${g.availability} | ${g.description} |`));
  out.push("");

  out.push("## H. Prototype suggestions", "");
  a.prototypes.forEach((h) => {
    out.push(`### ${h.title} (${h.effort}, ${h.timeline})`, h.description, `- **Success metric:** ${h.successMetric}`);
    h.steps.forEach((st, i) => out.push(`  ${i + 1}. ${st}`));
    out.push("");
  });

  if (a.openQuestions.length) {
    out.push("## Open questions for the team", "");
    a.openQuestions.forEach((q) => out.push(`- ${q}`));
    out.push("");
  }

  if (a.ledger?.length) {
    out.push("## Appendix: collateral studied", "", "| Source | Role | How it was used | Coverage |", "|---|---|---|---|");
    a.ledger.forEach((l) => {
      const pct = l.totalChars ? Math.min(100, Math.round((l.includedChars / l.totalChars) * 100)) : 100;
      const how = { full: "Read in full", excerpt: "Excerpt", digest: "AI digest of full document", profile: "Profiled across all rows" }[l.mode];
      out.push(`| ${l.file} | ${l.role} | ${how} | ${l.mode === "excerpt" ? `${pct}%` : "100%"} |`);
    });
    out.push("");
  }

  const datasets = s.files.filter((f) => f.role === "metrics" && f.sheets?.length);
  if (datasets.length) {
    out.push("## Appendix: dataset baselines", "");
    datasets.forEach((f) =>
      f.sheets!.forEach((sh) => {
        out.push(`### ${f.name} › ${sh.name} (${sh.rows.toLocaleString()} rows)`);
        sh.derived.forEach((d) => out.push(`- **${d.name}:** ${d.value}`));
        if (!sh.derived.length) out.push(`- Columns: ${sh.columns.map((c) => c.name).join(", ")}`);
        out.push("");
      }),
    );
  }
  return out.join("\n");
}

export function download(filename: string, content: string, type = "text/markdown") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
