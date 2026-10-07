# Reimagine — AI Workflow Reimagination Copilot

A facilitator, not an idea generator. Teams paste or upload a workflow; the copilot interviews them, generates a reimagination pack, and then asks the team **"Which of these predictions are actually actionable?"** Only the predictions the team accepts shape the final plan.

## Quick start

```bash
npm install
cp .env.example .env.local   # add your LLM key (optional — see below)
npm run dev                  # http://localhost:3000
```

Without a key the app runs in **demo mode** using a built-in heuristic engine, so the whole flow works offline. Click **Load sample** on the first screen to try it.

## Adding your LLM key

Edit `.env.local`:

| Variable | Purpose |
|---|---|
| `LLM_PROVIDER` | `openai` (default, also any OpenAI-compatible endpoint), `azure`, `anthropic`, `gemini` |
| `LLM_API_KEY` | Your key. Empty = demo mode |
| `LLM_MODEL` | Model name (Azure: deployment name) |
| `LLM_BASE_URL` | Optional custom endpoint (OpenRouter, Groq, Ollama, Azure resource URL…) |

Restart `npm run dev` after editing. The sidebar shows **Live AI** when a key is detected. If an LLM call fails, the app falls back to the demo engine and shows a warning banner.

Provider code lives in `src/lib/llm.ts`; prompts in `src/lib/prompts.ts`.

## The journey

1. **Share workflow** — paste text and/or upload `.txt .md .docx .pptx .xlsx .xls .csv .html` (parsed server-side, incl. PowerPoint speaker notes and every Excel sheet).
2. **Discovery interview** — one question at a time:
   what is the workflow · what triggers it · major steps · where humans are involved · where decisions are made · where problems are discovered · what data is available · what outcomes can be measured.
   The AI drafts answers from your material with a confidence level and a probing follow-up; the team confirms or edits each one.
3. **Reimagination studio** — outputs A–H:
   A. Workflow map (swimlanes) · B. Pain-point map (heat strip + severity×frequency) · C. Prediction opportunities · D. Leading indicators · E. Prescriptive interventions · F. Future-state workflow (before/after) · G. Data requirements · H. Prototype suggestions.
   Everything is labelled as an AI hypothesis; E/F/H are marked *draft* until the team has reviewed.
4. **Team review (facilitator mode)** — for each prediction: debate questions, devil's-advocate argument, a 5-point actionability checklist (owner · lead time · lever · data · measurable), room vote counter, rationale, and verdict (*Actionable / Needs data / Not actionable*). The copilot **pushes back** when a verdict contradicts the team's own checklist or votes. **Rebuild plan** regenerates D–H from actionable predictions only; needs-data items become data workstreams; rejected ideas are stripped server-side even if the model tries to reintroduce them.
5. **Report** — decision log plus full pack; export Markdown, JSON or Print/PDF.

Sessions are stored in the browser (`localStorage`); multiple workflows are listed in the sidebar.

## Multiple files & metrics data

Upload any mix of documents and data exports. Each file gets a **role** (auto-suggested, changeable in the file list):

| Role | Typical files | How it is ingested |
|---|---|---|
| **Process** | SOPs, decks, meeting notes | Read in full; documents over 20k chars get an AI *digest* (map-reduce over every chunk) so nothing is silently cut. |
| **Metrics / data** | Excel / CSV exports | **Profiled across every row** (up to 100k/sheet): header detection, column types, fill rates, stats, top values, plus derived metrics — cycle time between date columns (median / p90), volume per month, status & exception distributions. |
| **Reference** | Policies, SLAs, glossaries | Supporting context with a smaller share of the budget. |

Every stage receives a budgeted context pack built from **all** sources (`src/lib/context.ts`): each file gets a fair share, so one big file can't crowd out the others.

- **Interview** — drafts the *data*, *problems* and *outcomes* answers from the dataset profiles (e.g. "p90 Received→Approved is 21 days vs median 6").
- **Studio** — pain points, predictions and data requirements carry **evidence** citations (`file › sheet › column`); section G is grounded in the columns you actually have. A *Sources studied* card shows how each file was used (full / digest / excerpt / profiled).
- **Team review** — *Evidence from your data* lists the columns that could feed each prediction, informing (not auto-ticking) the "Data exists" check.
- **Rebuild & report** — refine re-reads the dataset profiles; the report appends a collateral ledger and the dataset baselines.

Try it with the files in `samples/` (regenerate the workbook with `node scripts/make-sample-xlsx.mjs samples/ap-invoice-metrics.xlsx`).

## Project layout

```
src/app/page.tsx              App shell (sidebar, stages, theme)
src/app/api/*                 parse · interview · generate · refine · status
src/components/stages/*       Intake, Interview, Studio, Facilitate, Report
src/components/sections.tsx   Visualisations for outputs A–H
src/lib/parsers.ts            DOCX / PPTX / XLSX / CSV / HTML / MD / TXT extraction
src/lib/profiler.ts           Spreadsheet profiling & derived metrics
src/lib/context.ts            Per-stage context budgets, coverage ledger, column matching
src/components/Collateral.tsx File list with roles, coverage and data profiles
src/lib/llm.ts                Provider adapters (placeholder keys via env)
src/lib/prompts.ts            Facilitator persona + JSON schemas
src/lib/demo-engine.ts        Heuristic engine used without a key
```
