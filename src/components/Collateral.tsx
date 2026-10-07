"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  CircleCheck,
  Code,
  FileSpreadsheet,
  FileText,
  LoaderCircle,
  Presentation,
  Sparkles,
  X,
} from "lucide-react";
import { Badge, Card, cx, type Tone } from "./ui";
import { BUDGETS, PASTED, buildContext, describeColumn } from "@/lib/context";
import type { Collateral, FileRole, LedgerEntry, SourceFile } from "@/lib/types";

export type DigestState = "pending" | "done" | "skipped";

export const ROLE_META: Record<FileRole, { label: string; hint: string; tone: Tone }> = {
  process: { label: "Process", hint: "How the work happens — drives the interview and maps", tone: "indigo" },
  metrics: { label: "Metrics / data", hint: "Profiled column by column — grounds pain points, indicators & data needs", tone: "emerald" },
  reference: { label: "Reference", hint: "Supporting context — included as budget allows", tone: "zinc" },
};

const MODE_LABEL: Record<LedgerEntry["mode"], string> = {
  full: "Read in full",
  excerpt: "Excerpt",
  digest: "AI digest",
  profile: "Profiled",
};

function kindIcon(kind: string) {
  if (kind === "Excel" || kind === "CSV") return FileSpreadsheet;
  if (kind === "PowerPoint") return Presentation;
  if (kind === "HTML") return Code;
  return FileText;
}

export function CoverageBadge({ entry }: { entry?: LedgerEntry }) {
  if (!entry) return null;
  const pct = entry.totalChars ? Math.min(100, Math.round((entry.includedChars / entry.totalChars) * 100)) : 100;
  const tone: Tone = entry.mode === "excerpt" ? "amber" : "emerald";
  return (
    <Badge tone={tone}>
      {MODE_LABEL[entry.mode]}
      {entry.mode === "excerpt" && ` · ${pct}%`}
    </Badge>
  );
}

export function CollateralList({
  collateral,
  digests,
  onRole,
  onRemove,
}: {
  collateral: Collateral;
  digests: Record<string, DigestState>;
  onRole: (name: string, role: FileRole) => void;
  onRemove: (name: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const ledger = useMemo(() => buildContext(collateral, BUDGETS.generate).ledger, [collateral]);
  const entry = (name: string) => ledger.find((l) => l.file === name);
  const excerpted = ledger.filter((l) => l.mode === "excerpt");

  return (
    <Card className="p-5">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <div className="text-sm font-medium">Collateral pipeline</div>
        <Badge>{collateral.files.length + (collateral.rawText.trim() ? 1 : 0)} sources</Badge>
        <span className="flex-1" />
        {excerpted.length > 0 ? (
          <span className="text-xs text-amber-600 dark:text-amber-400">
            {excerpted.length} source{excerpted.length > 1 ? "s" : ""} too long to read in full — add an LLM key to digest them.
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
            <CircleCheck className="size-3.5" /> Every source will be studied
          </span>
        )}
      </div>
      <p className="mb-4 text-xs text-zinc-500">
        Set each file&apos;s role. Process docs feed the interview and maps; metrics files are profiled across every row and
        ground the pain points, indicators, data needs and team review.
      </p>

      <ul className="space-y-2">
        {collateral.rawText.trim() && (
          <li className="flex items-center gap-3 rounded-xl bg-zinc-50 px-3 py-2.5 ring-1 ring-zinc-200/70 dark:bg-zinc-950 dark:ring-zinc-800">
            <FileText className="size-4 shrink-0 text-indigo-500" />
            <div className="min-w-0 flex-1 text-[13px] font-medium">{PASTED}</div>
            <Badge tone="indigo">Process</Badge>
            <CoverageBadge entry={entry(PASTED)} />
          </li>
        )}
        {collateral.files.map((f) => (
          <FileRow
            key={f.name}
            f={f}
            entry={entry(f.name)}
            digest={digests[f.name]}
            open={open === f.name}
            onToggle={() => setOpen(open === f.name ? null : f.name)}
            onRole={(r) => onRole(f.name, r)}
            onRemove={() => onRemove(f.name)}
          />
        ))}
      </ul>
    </Card>
  );
}

function FileRow({
  f,
  entry,
  digest,
  open,
  onToggle,
  onRole,
  onRemove,
}: {
  f: SourceFile;
  entry?: LedgerEntry;
  digest?: DigestState;
  open: boolean;
  onToggle: () => void;
  onRole: (r: FileRole) => void;
  onRemove: () => void;
}) {
  const Icon = kindIcon(f.kind);
  const rows = f.sheets?.reduce((s, x) => s + x.rows, 0) ?? 0;
  const cols = f.sheets?.reduce((s, x) => s + x.columns.length, 0) ?? 0;
  const metrics = f.sheets?.reduce((s, x) => s + x.derived.length, 0) ?? 0;

  return (
    <li className="rounded-xl bg-zinc-50 ring-1 ring-zinc-200/70 dark:bg-zinc-950 dark:ring-zinc-800">
      <div className="flex flex-wrap items-center gap-3 px-3 py-2.5">
        <Icon className={cx("size-4 shrink-0", f.role === "metrics" ? "text-emerald-500" : "text-indigo-500")} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium">{f.name}</div>
          <div className="flex flex-wrap gap-x-2 text-[11px] text-zinc-500">
            <span>{f.kind}</span>
            {f.sheets?.length ? (
              <span>
                {f.sheets.length} sheet{f.sheets.length > 1 ? "s" : ""} · {rows.toLocaleString()} rows · {cols} columns
                {metrics > 0 && ` · ${metrics} computed metrics`}
              </span>
            ) : (
              <span>{f.chars.toLocaleString()} chars</span>
            )}
            {f.roleReason && <span className="italic">· {f.roleReason}</span>}
          </div>
        </div>

        {digest === "pending" && (
          <Badge tone="violet">
            <LoaderCircle className="size-3 animate-spin" /> Digesting
          </Badge>
        )}
        {f.digest && (
          <Badge tone="violet">
            <Sparkles className="size-3" /> Digest ready
          </Badge>
        )}
        <CoverageBadge entry={entry} />

        <select
          value={f.role}
          onChange={(e) => onRole(e.target.value as FileRole)}
          title={ROLE_META[f.role].hint}
          className="rounded-lg bg-white px-2 py-1 text-xs ring-1 ring-zinc-200 outline-none dark:bg-zinc-900 dark:ring-zinc-700"
          aria-label={`Role for ${f.name}`}
        >
          {(Object.keys(ROLE_META) as FileRole[])
            .filter((r) => r !== "metrics" || f.sheets?.length)
            .map((r) => (
              <option key={r} value={r}>
                {ROLE_META[r].label}
              </option>
            ))}
        </select>

        {f.sheets?.length ? (
          <button onClick={onToggle} className="rounded p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200" aria-label="Show profile">
            <ChevronDown className={cx("size-4 transition", open && "rotate-180")} />
          </button>
        ) : null}
        <button onClick={onRemove} className="rounded p-1 text-zinc-400 hover:text-rose-500" aria-label={`Remove ${f.name}`}>
          <X className="size-3.5" />
        </button>
      </div>

      {open && f.sheets && (
        <div className="space-y-4 border-t border-zinc-200/70 px-4 py-3 dark:border-zinc-800">
          {f.sheets.map((s) => (
            <div key={s.name}>
              <div className="mb-1.5 text-xs font-medium">
                {s.name} <span className="font-normal text-zinc-500">— {s.rows.toLocaleString()} rows</span>
              </div>
              {s.derived.length > 0 && (
                <ul className="mb-2 space-y-1">
                  {s.derived.map((d) => (
                    <li key={d.name} className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[12px] text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200">
                      <span className="font-medium">{d.name}:</span> {d.value}
                    </li>
                  ))}
                </ul>
              )}
              <ul className="grid gap-x-4 gap-y-0.5 text-[11.5px] text-zinc-600 sm:grid-cols-2 dark:text-zinc-400">
                {s.columns.map((c) => (
                  <li key={c.name} className="truncate" title={describeColumn(c)}>
                    {describeColumn(c)}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </li>
  );
}
