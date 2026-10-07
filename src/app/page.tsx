"use client";

import { useEffect, useState } from "react";
import {
  ClipboardList,
  FileUp,
  KeyRound,
  LayoutGrid,
  Moon,
  Plus,
  Scale,
  Sparkles,
  Sun,
  Trash,
  MessagesSquare,
  CircleAlert,
  X,
} from "lucide-react";
import { useSessions } from "@/lib/store";
import type { LlmStatus, Session, Stage } from "@/lib/types";
import { cx } from "@/components/ui";
import { Intake } from "@/components/stages/Intake";
import { Interview } from "@/components/stages/Interview";
import { Studio } from "@/components/stages/Studio";
import { Facilitate } from "@/components/stages/Facilitate";
import { Report } from "@/components/stages/Report";

const STAGES: { id: Stage; label: string; hint: string; icon: typeof FileUp }[] = [
  { id: "intake", label: "Share workflow", hint: "Paste or upload", icon: FileUp },
  { id: "interview", label: "Discovery interview", hint: "8 questions", icon: MessagesSquare },
  { id: "studio", label: "Reimagination studio", hint: "Outputs A–H", icon: LayoutGrid },
  { id: "facilitate", label: "Team review", hint: "Is it actionable?", icon: Scale },
  { id: "report", label: "Report", hint: "Export & share", icon: ClipboardList },
];

function stageEnabled(s: Session, stage: Stage) {
  if (stage === "intake" || stage === "interview") return true;
  return Boolean(s.analysis);
}

export default function Home() {
  const { sessions, active, ready, update, create, remove, select } = useSessions();
  const [status, setStatus] = useState<LlmStatus | null>(null);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    fetch("/api/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ configured: false, provider: "openai", model: "-" }));
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("reimagine.theme", next ? "dark" : "light");
  };

  if (!ready || !active) {
    return (
      <div className="grid h-screen place-items-center">
        <Sparkles className="size-6 animate-pulse text-indigo-500" />
      </div>
    );
  }

  const go = (stage: Stage) => update({ stage });
  const allPredictions = (active.baseline ?? active.analysis)?.predictions ?? [];
  const reviewed = allPredictions.filter((p) => (active.reviews[p.id]?.verdict ?? "undecided") !== "undecided").length;

  return (
    <div className="glow flex min-h-screen">
      {/* Sidebar */}
      <aside className="no-print sticky top-0 hidden h-screen w-72 shrink-0 flex-col border-r border-zinc-200/70 bg-white/70 backdrop-blur-xl lg:flex dark:border-zinc-800/70 dark:bg-zinc-950/60">
        <div className="flex items-center gap-2.5 px-5 pt-5 pb-4">
          <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-md shadow-indigo-500/20">
            <Sparkles className="size-4.5 text-white" />
          </div>
          <div>
            <div className="text-[15px] font-semibold tracking-tight">Reimagine</div>
            <div className="text-[11px] text-zinc-500">Workflow Reimagination Copilot</div>
          </div>
        </div>

        <nav className="px-3">
          <div className="px-2 pb-2 text-[11px] font-medium tracking-wider text-zinc-400 uppercase">Journey</div>
          <ol className="space-y-0.5">
            {STAGES.map((st, i) => {
              const enabled = stageEnabled(active, st.id);
              const current = active.stage === st.id;
              const Icon = st.icon;
              return (
                <li key={st.id}>
                  <button
                    disabled={!enabled}
                    onClick={() => go(st.id)}
                    className={cx(
                      "group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition",
                      current
                        ? "bg-zinc-900 text-white shadow-sm dark:bg-white dark:text-zinc-900"
                        : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800/60",
                      !enabled && "cursor-not-allowed opacity-40",
                    )}
                  >
                    <span
                      className={cx(
                        "grid size-7 place-items-center rounded-lg text-xs",
                        current ? "bg-white/15 dark:bg-zinc-900/10" : "bg-zinc-100 dark:bg-zinc-800",
                      )}
                    >
                      <Icon className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium">
                        {i + 1}. {st.label}
                      </span>
                      <span className={cx("block text-[11px]", current ? "opacity-70" : "text-zinc-400")}>
                        {st.id === "facilitate" && active.analysis
                          ? `${reviewed}/${allPredictions.length} predictions reviewed`
                          : st.hint}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="mt-6 flex min-h-0 flex-1 flex-col px-3">
          <div className="flex items-center justify-between px-2 pb-2">
            <span className="text-[11px] font-medium tracking-wider text-zinc-400 uppercase">Workflows</span>
            <button
              onClick={create}
              className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              title="New workflow"
            >
              <Plus className="size-4" />
            </button>
          </div>
          <ul className="scroll-thin min-h-0 flex-1 space-y-0.5 overflow-y-auto pb-3">
            {sessions.map((s) => (
              <li key={s.id} className="group relative">
                <button
                  onClick={() => select(s.id)}
                  className={cx(
                    "w-full truncate rounded-lg px-2.5 py-1.5 pr-8 text-left text-[13px] transition",
                    s.id === active.id
                      ? "bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300"
                      : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800/60",
                  )}
                >
                  {s.title}
                </button>
                <button
                  onClick={() => confirm(`Delete "${s.title}"?`) && remove(s.id)}
                  className="absolute top-1/2 right-1.5 hidden -translate-y-1/2 rounded p-1 text-zinc-400 group-hover:block hover:text-rose-500"
                  title="Delete"
                >
                  <Trash className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-zinc-200/70 p-3 dark:border-zinc-800/70">
          <div
            className={cx(
              "rounded-xl p-3 text-xs",
              status?.configured
                ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300"
                : "bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200",
            )}
          >
            <div className="flex items-center gap-1.5 font-medium">
              <KeyRound className="size-3.5" />
              {status?.configured ? `Live AI · ${status.provider}` : "Demo mode"}
            </div>
            <p className="mt-1 leading-relaxed opacity-80">
              {status?.configured
                ? `Model: ${status.model}`
                : "Using a built-in heuristic engine. Add LLM_API_KEY to .env.local for full AI reasoning."}
            </p>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-zinc-200/70 bg-zinc-50/70 px-4 backdrop-blur-xl sm:px-8 dark:border-zinc-800/70 dark:bg-zinc-950/60">
          <div className="flex items-center gap-2 lg:hidden">
            <Sparkles className="size-4 text-indigo-500" />
          </div>
          <input
            value={active.title}
            onChange={(e) => update({ title: e.target.value })}
            className="min-w-0 flex-1 truncate bg-transparent text-sm font-medium outline-none placeholder:text-zinc-400"
            placeholder="Name this workflow"
            aria-label="Workflow name"
          />
          <div className="flex gap-1 lg:hidden">
            {STAGES.map((st, i) => (
              <button
                key={st.id}
                disabled={!stageEnabled(active, st.id)}
                onClick={() => go(st.id)}
                className={cx(
                  "grid size-7 place-items-center rounded-lg text-xs font-medium disabled:opacity-30",
                  active.stage === st.id ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "bg-zinc-100 dark:bg-zinc-800",
                )}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <button
            onClick={toggleTheme}
            className="grid size-9 place-items-center rounded-xl text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            aria-label="Toggle theme"
          >
            {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
        </header>

        <main key={active.id + active.stage} className="print-full mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-8 animate-rise">
          {active.notice && (
            <div className="no-print mb-6 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-[13px] text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0 flex-1 break-words">{active.notice}</span>
              <button onClick={() => update({ notice: undefined })} className="rounded p-0.5 hover:bg-amber-100 dark:hover:bg-amber-500/20" aria-label="Dismiss">
                <X className="size-4" />
              </button>
            </div>
          )}
          {active.stage === "intake" && <Intake session={active} update={update} />}
          {active.stage === "interview" && <Interview session={active} update={update} />}
          {active.stage === "studio" && active.analysis && <Studio session={active} update={update} />}
          {active.stage === "facilitate" && active.analysis && <Facilitate session={active} update={update} />}
          {active.stage === "report" && active.analysis && <Report session={active} />}
        </main>
      </div>
    </div>
  );
}
