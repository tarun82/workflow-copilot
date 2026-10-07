"use client";

import { useMemo } from "react";
import { Download, FileBraces, Printer } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { Markdown } from "@/components/Markdown";
import { VerdictBadge } from "@/components/sections";
import { buildMarkdown, download } from "@/lib/report";
import type { Session } from "@/lib/types";

export function Report({ session }: { session: Session }) {
  const md = useMemo(() => buildMarkdown(session), [session]);
  const preds = (session.baseline ?? session.analysis!).predictions;
  const slug = session.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "workflow";

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">Reimagination report</h1>
          <p className="text-sm text-zinc-500">Interview, outputs A–H and the team&apos;s decisions — ready to share.</p>
        </div>
        <Button icon={<Download className="size-4" />} onClick={() => download(`${slug}.md`, md)}>
          Markdown
        </Button>
        <Button
          icon={<FileBraces className="size-4" />}
          onClick={() =>
            download(
              `${slug}.json`,
              JSON.stringify({ title: session.title, answers: session.answers, analysis: session.analysis, baseline: session.baseline, reviews: session.reviews }, null, 2),
              "application/json",
            )
          }
        >
          JSON
        </Button>
        <Button variant="primary" icon={<Printer className="size-4" />} onClick={() => window.print()}>
          Print / PDF
        </Button>
      </div>

      <Card className="no-print p-5">
        <div className="mb-3 text-sm font-medium">Decision log</div>
        <div className="grid gap-2 sm:grid-cols-2">
          {preds.map((p) => {
            const r = session.reviews[p.id];
            return (
              <div key={p.id} className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200/70 dark:bg-zinc-950 dark:ring-zinc-800">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[13px] font-medium">{p.title}</span>
                  <VerdictBadge verdict={r?.verdict ?? "undecided"} />
                </div>
                {r?.rationale && <p className="mt-1 text-[12px] text-zinc-500">“{r.rationale}”</p>}
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="print-full p-8 sm:p-12">
        <Markdown source={md} />
      </Card>
    </div>
  );
}
