"use client";

import { useRef, useState } from "react";
import { ArrowRight, Upload, Wand, CircleAlert, MessagesSquare, Scale, Radar } from "lucide-react";
import { Badge, Button, Card, cx } from "@/components/ui";
import { CollateralList, type DigestState } from "@/components/Collateral";
import { SAMPLE_WORKFLOW } from "@/lib/sample";
import { QUESTIONS } from "@/lib/questions";
import type { Answers, QuestionId, SourceFile } from "@/lib/types";
import { collateral, type StageProps } from "./shared";

const ACCEPT = ".txt,.md,.markdown,.docx,.pptx,.xlsx,.xls,.csv,.html,.htm";
const MAX_STORED_CHARS = 120_000;
/** Documents longer than this get an LLM digest so their content survives context budgets. */
const DIGEST_MIN_CHARS = 20_000;

export function Intake({ session, update }: StageProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [digests, setDigests] = useState<Record<string, DigestState>>({});

  const hasContent = Boolean(session.rawText.trim() || session.files.length);
  const digesting = Object.values(digests).includes("pending");

  async function digest(f: SourceFile, fullText: string) {
    setDigests((d) => ({ ...d, [f.name]: "pending" }));
    try {
      const res = await fetch("/api/digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: f.name, text: fullText }),
      });
      const data = (await res.json()) as { digest: string | null };
      if (data.digest) {
        update((s) => ({ files: s.files.map((x) => (x.name === f.name ? { ...x, digest: data.digest! } : x)) }));
      }
      setDigests((d) => ({ ...d, [f.name]: data.digest ? "done" : "skipped" }));
    } catch {
      setDigests((d) => ({ ...d, [f.name]: "skipped" }));
    }
  }

  async function upload(list: FileList | File[]) {
    const files = Array.from(list);
    if (!files.length) return;
    setUploading(true);
    setErrors([]);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      const res = await fetch("/api/parse", { method: "POST", body: fd });
      const data = (await res.json()) as { files?: (SourceFile | { name: string; error: string })[]; error?: string };
      if (data.error) throw new Error(data.error);
      const ok: SourceFile[] = [];
      const toDigest: [SourceFile, string][] = [];
      const errs: string[] = [];
      data.files?.forEach((f) => {
        if ("error" in f) errs.push(`${f.name}: ${f.error}`);
        else if (!f.text.trim()) errs.push(`${f.name}: no readable text found.`);
        else {
          const stored = { ...f, text: f.text.slice(0, MAX_STORED_CHARS) };
          ok.push(stored);
          if (f.role !== "metrics" && f.text.length > DIGEST_MIN_CHARS) toDigest.push([stored, f.text]);
        }
      });
      setErrors(errs);
      const named = ok.find((f) => f.role === "process") ?? ok[0];
      update((s) => ({
        files: [...s.files.filter((x) => !ok.some((o) => o.name === x.name)), ...ok],
        title: s.title === "Untitled workflow" && named ? named.name.replace(/\.[^.]+$/, "") : s.title,
      }));
      toDigest.forEach(([f, full]) => digest(f, full));
    } catch (e) {
      setErrors([e instanceof Error ? e.message : "Upload failed."]);
    } finally {
      setUploading(false);
    }
  }

  async function start(skipAi = false) {
    if (skipAi || !hasContent) {
      update({ stage: "interview" });
      return;
    }
    setStarting(true);
    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collateral: collateral(session) }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      update((s) => {
        const answers = { ...s.answers } as Answers;
        (Object.keys(answers) as QuestionId[]).forEach((id) => {
          const d = data.answers?.[id];
          if (!d) return;
          const draft = String(d.answer ?? "").trim();
          answers[id] = {
            value: answers[id].confirmed ? answers[id].value : draft,
            aiDraft: draft,
            confidence: d.confidence,
            followUp: d.followUp,
            confirmed: answers[id].confirmed,
          };
        });
        return {
          answers,
          stage: "interview",
          notice: data.warning,
          title: s.title === "Untitled workflow" && data.title ? data.title : s.title,
        };
      });
    } catch (e) {
      setErrors([e instanceof Error ? e.message : "Could not start the interview."]);
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="space-y-10">
      <section className="pt-4 text-center">
        <Badge tone="indigo" className="mb-5">
          <Radar className="size-3" /> Facilitator, not oracle
        </Badge>
        <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Reimagine how your <span className="grad-text">workflow</span> could predict its own problems.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-pretty text-zinc-500 dark:text-zinc-400">
          Share how the work happens today. Reimagine interviews your team, maps pain points and prediction
          opportunities — and then asks <em>you</em> which ones are actually actionable.
        </p>
      </section>

      <div className="grid gap-5 md:grid-cols-5">
        <Card className="p-5 md:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <label htmlFor="raw" className="text-sm font-medium">
              Paste your workflow
            </label>
            <Button
              size="sm"
              variant="ghost"
              icon={<Wand className="size-3.5" />}
              onClick={() => update({ rawText: SAMPLE_WORKFLOW, title: session.title === "Untitled workflow" ? "Vendor invoice processing" : session.title })}
            >
              Load sample
            </Button>
          </div>
          <textarea
            id="raw"
            value={session.rawText}
            onChange={(e) => update({ rawText: e.target.value })}
            placeholder={"Describe the workflow in your own words — steps, people, systems, what goes wrong…\n\nBullet points, SOP excerpts or meeting notes all work."}
            className="scroll-thin h-72 w-full resize-none rounded-xl bg-zinc-50 p-4 font-mono text-[13px] leading-relaxed ring-1 ring-zinc-200 outline-none placeholder:font-sans placeholder:text-zinc-400 focus:ring-2 focus:ring-indigo-500 dark:bg-zinc-950 dark:ring-zinc-800"
          />
          <div className="mt-2 text-right text-[11px] text-zinc-400">{session.rawText.length.toLocaleString()} characters</div>
        </Card>

        <div className="flex flex-col gap-5 md:col-span-2">
          <Card className="flex-1 p-5">
            <div className="mb-3 text-sm font-medium">Upload documents</div>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                upload(e.dataTransfer.files);
              }}
              className={cx(
                "flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition",
                drag
                  ? "border-indigo-500 bg-indigo-50/60 dark:bg-indigo-500/10"
                  : "border-zinc-200 hover:border-indigo-300 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:border-indigo-500/50 dark:hover:bg-zinc-900",
              )}
            >
              <div className={cx("mb-3 grid size-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300", uploading && "animate-pulse")}>
                <Upload className="size-5" />
              </div>
              <div className="text-sm font-medium">{uploading ? "Reading files…" : "Drop files or click to browse"}</div>
              <div className="mt-1 text-xs text-zinc-500">TXT · MD · DOCX · PPTX · XLSX · CSV · HTML — up to 15 MB</div>
            </button>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => {
                if (e.target.files) upload(e.target.files);
                e.target.value = "";
              }}
            />

            <ul className="mt-4 space-y-1.5 text-[12px] text-zinc-500">
              <li>
                <span className="font-medium text-zinc-700 dark:text-zinc-300">Add as many files as you like</span> — SOPs, decks,
                notes and data exports together.
              </li>
              <li>
                <span className="font-medium text-zinc-700 dark:text-zinc-300">Excel / CSV</span> is profiled across every row: column
                types, stats, cycle times between date columns and status distributions.
              </li>
            </ul>
          </Card>
        </div>
      </div>

      {session.files.length > 0 && (
        <CollateralList
          collateral={collateral(session)}
          digests={digests}
          onRole={(name, role) => update((s) => ({ files: s.files.map((x) => (x.name === name ? { ...x, role, roleReason: "Set by team" } : x)) }))}
          onRemove={(name) => update((s) => ({ files: s.files.filter((x) => x.name !== name) }))}
        />
      )}

      {errors.length > 0 && (
        <div className="space-y-1 rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
          {errors.map((e) => (
            <div key={e} className="flex items-start gap-2">
              <CircleAlert className="mt-0.5 size-4 shrink-0" /> {e}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col items-center gap-3">
        <Button size="lg" variant="primary" loading={starting || digesting} disabled={!hasContent} onClick={() => start()} icon={!starting && !digesting && <MessagesSquare className="size-4" />}>
          {digesting ? "Digesting long documents…" : starting ? `Studying ${session.files.length + (session.rawText.trim() ? 1 : 0)} sources…` : "Start discovery interview"}
          {!starting && <ArrowRight className="size-4" />}
        </Button>
        <button onClick={() => start(true)} className="text-xs text-zinc-500 underline-offset-4 hover:text-zinc-800 hover:underline dark:hover:text-zinc-200">
          or skip and answer the questions from scratch
        </button>
      </div>

      <section className="grid gap-4 pt-4 sm:grid-cols-3">
        {[
          { icon: MessagesSquare, title: "1 · Interview", body: `${QUESTIONS.length} focused questions. The AI drafts answers from your docs; your team confirms them.` },
          { icon: Radar, title: "2 · Reimagine", body: "Workflow & pain-point maps, prediction opportunities, indicators, interventions, future state, data & prototypes." },
          { icon: Scale, title: "3 · Challenge", body: "The team votes on which predictions are actually actionable. Only those shape the final plan." },
        ].map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-2xl p-5 ring-1 ring-zinc-200/70 dark:ring-zinc-800/70">
            <Icon className="mb-3 size-5 text-indigo-500" />
            <div className="text-sm font-semibold">{title}</div>
            <p className="mt-1 text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">{body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
