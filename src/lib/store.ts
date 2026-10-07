"use client";

import { useCallback, useEffect, useState } from "react";
import { emptyAnswers } from "./questions";
import type { CriterionKey, PredictionReview, Session } from "./types";

const KEY = "reimagine.sessions.v1";
const ACTIVE = "reimagine.active.v1";

export function newSession(): Session {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: "Untitled workflow",
    createdAt: now,
    updatedAt: now,
    rawText: "",
    files: [],
    answers: emptyAnswers(),
    reviews: {},
    painReactions: {},
    stage: "intake",
  };
}

export function emptyReview(): PredictionReview {
  const criteria = { owner: null, leadTime: null, lever: null, data: null, measurable: null } as Record<
    CriterionKey,
    boolean | null
  >;
  return { verdict: "undecided", criteria, votes: { actionable: 0, notActionable: 0, needsData: 0 }, rationale: "" };
}

function load(): Session[] {
  try {
    const list: Session[] = JSON.parse(localStorage.getItem(KEY) || "[]");
    return list.map((s) => ({ ...s, files: s.files.map((f) => ({ ...f, role: f.role ?? "process" })) }));
  } catch {
    return [];
  }
}

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let list = load();
    if (!list.length) list = [newSession()];
    const saved = localStorage.getItem(ACTIVE);
    setSessions(list);
    setActiveId(list.some((s) => s.id === saved) ? saved! : list[0].id);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(sessions));
    } catch {
      console.warn("Browser storage is full — large uploads in older workflows may need to be deleted.");
    }
    localStorage.setItem(ACTIVE, activeId);
  }, [sessions, activeId, ready]);

  const active = sessions.find((s) => s.id === activeId);

  const update = useCallback(
    (patch: Partial<Session> | ((s: Session) => Partial<Session>)) => {
      setSessions((list) =>
        list.map((s) =>
          s.id === activeId
            ? { ...s, ...(typeof patch === "function" ? patch(s) : patch), updatedAt: new Date().toISOString() }
            : s,
        ),
      );
    },
    [activeId],
  );

  const create = useCallback(() => {
    const s = newSession();
    setSessions((list) => [s, ...list]);
    setActiveId(s.id);
  }, []);

  const remove = useCallback(
    (id: string) => {
      setSessions((list) => {
        const next = list.filter((s) => s.id !== id);
        if (!next.length) next.push(newSession());
        if (id === activeId) setActiveId(next[0].id);
        return next;
      });
    },
    [activeId],
  );

  return { sessions, active, ready, update, create, remove, select: setActiveId };
}
