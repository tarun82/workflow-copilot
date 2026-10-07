import "server-only";
import * as XLSX from "xlsx";
import type { ColumnProfile, ColumnType, DerivedMetric, FileRole, SheetProfile } from "./types";

const MAX_ROWS = 100_000;
const DAY = 86_400_000;
const OUTCOME_RE = /status|state|stage|outcome|result|resolution|priority|severity|type|category|reason|flag|breach|sla|late|error|exception|channel|team|owner|assignee|region/i;
const ID_RE = /(^|[\s_-])(id|no|number|ref|key|#)$|^id[\s_-]/i;
const DATE_STR = /^\d{4}-\d{1,2}-\d{1,2}([ T]\d{1,2}:\d{2}(:\d{2})?)?|^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}( \d{1,2}:\d{2})?$/;
const BOOL = new Set(["true", "false", "yes", "no", "y", "n"]);

type Cell = string | number | boolean | Date | null;

function quantile(sorted: number[], q: number) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

const round = (n: number) => (Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 100) / 100);
const fmtDate = (t: number) => new Date(t).toISOString().slice(0, 10);

function toTime(v: Cell): number | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.getTime();
  if (typeof v === "string" && DATE_STR.test(v.trim())) {
    const t = Date.parse(v.trim());
    return isNaN(t) ? null : t;
  }
  return null;
}

function toNum(v: Cell): number | null {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string") {
    const s = v.trim().replace(/[,$€£₹%\s]/g, "");
    if (s && /^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  }
  return null;
}

function findHeaderRow(rows: Cell[][]) {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const r = rows[i];
    const filled = r.filter((c) => c !== null && String(c).trim() !== "");
    const stringy = filled.filter((c) => typeof c === "string" && !DATE_STR.test(c));
    if (filled.length >= 2 && stringy.length / filled.length >= 0.6 && filled.length >= r.length * 0.5) return i;
  }
  return 0;
}

function profileColumn(name: string, values: Cell[], rowCount: number): { profile: ColumnProfile; times?: (number | null)[] } {
  const filled = values.filter((v) => v !== null && String(v).trim() !== "");
  const n = filled.length;
  const strs = filled.map((v) => (v instanceof Date ? fmtDate(v.getTime()) : String(v).trim()));
  const distinct = new Set(strs).size;
  const nums = filled.map(toNum).filter((x): x is number => x !== null);
  const times = values.map(toTime);
  const timeCount = times.filter((t) => t !== null).length;

  let type: ColumnType = "text";
  if (n && timeCount / n >= 0.8) type = "date";
  else if (n && strs.every((s) => BOOL.has(s.toLowerCase())) && distinct <= 2) type = "boolean";
  else if (n && ID_RE.test(name) && distinct >= n * 0.9) type = "id";
  else if (n && nums.length / n >= 0.9) type = "number";
  else if (n && (distinct <= Math.max(25, n * 0.05) || OUTCOME_RE.test(name)) && distinct < n * 0.5) type = "category";

  const profile: ColumnProfile = {
    name,
    type,
    filled: n,
    missingPct: rowCount ? round(((rowCount - n) / rowCount) * 100) : 0,
    distinct,
  };

  if (type === "number") {
    const s = [...nums].sort((a, b) => a - b);
    profile.min = String(round(s[0]));
    profile.max = String(round(s[s.length - 1]));
    profile.mean = round(s.reduce((a, b) => a + b, 0) / s.length);
    profile.median = round(quantile(s, 0.5));
    profile.p90 = round(quantile(s, 0.9));
  } else if (type === "date") {
    const t = times.filter((x): x is number => x !== null).sort((a, b) => a - b);
    profile.min = fmtDate(t[0]);
    profile.max = fmtDate(t[t.length - 1]);
  }
  if (type === "category" || type === "boolean") {
    const counts = new Map<string, number>();
    strs.forEach((s) => counts.set(s, (counts.get(s) ?? 0) + 1));
    profile.top = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([value, count]) => ({ value, count }));
  }
  return { profile, times: type === "date" ? times : undefined };
}

function derive(columns: ColumnProfile[], dateSeries: Map<string, (number | null)[]>, rows: number): DerivedMetric[] {
  const out: DerivedMetric[] = [];
  const dates = columns.filter((c) => c.type === "date").map((c) => c.name);

  const pairs: [string, string][] = [];
  for (let i = 0; i < dates.length - 1 && pairs.length < 5; i++) pairs.push([dates[i], dates[i + 1]]);
  if (dates.length > 2) pairs.push([dates[0], dates[dates.length - 1]]);

  for (const [a, b] of pairs) {
    const A = dateSeries.get(a)!;
    const B = dateSeries.get(b)!;
    const d: number[] = [];
    for (let i = 0; i < A.length; i++) if (A[i] !== null && B[i] !== null) d.push((B[i]! - A[i]!) / DAY);
    const pos = d.filter((x) => x >= 0).sort((x, y) => x - y);
    if (pos.length < 3) continue;
    out.push({
      name: `Elapsed days ${a} → ${b}`,
      value: `median ${round(quantile(pos, 0.5))}, mean ${round(pos.reduce((s, x) => s + x, 0) / pos.length)}, p90 ${round(quantile(pos, 0.9))}, max ${round(pos[pos.length - 1])} (n=${pos.length}${d.length > pos.length ? `, ${d.length - pos.length} negative ignored` : ""})`,
      columns: [a, b],
    });
  }

  if (dates.length) {
    const first = columns.find((c) => c.name === dates[0])!;
    const span = (Date.parse(first.max!) - Date.parse(first.min!)) / DAY;
    if (span > 0) {
      const months = Math.max(1, span / 30.4);
      out.push({
        name: `Volume by ${first.name}`,
        value: `${rows} records over ${round(span)} days (${first.min} → ${first.max}), ≈${round(rows / months)}/month`,
        columns: [first.name],
      });
    }
  }

  columns
    .filter((c) => (c.type === "category" || c.type === "boolean") && c.top?.length && OUTCOME_RE.test(c.name))
    .slice(0, 6)
    .forEach((c) => {
      out.push({
        name: `Distribution of ${c.name}`,
        value: c.top!.map((t) => `${t.value} ${round((t.count / Math.max(1, c.filled)) * 100)}%`).join(", "),
        columns: [c.name],
      });
    });

  return out;
}

export function profileWorkbook(buf: Buffer): SheetProfile[] {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const out: SheetProfile[] = [];
  for (const sheetName of wb.SheetNames) {
    const all = XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[sheetName], { header: 1, raw: true, defval: null, blankrows: false });
    if (!all.length) continue;
    const h = findHeaderRow(all);
    const width = Math.max(...all.slice(h, h + 50).map((r) => r.length));
    const header = Array.from({ length: width }, (_, i) => {
      const v = all[h]?.[i];
      return v === null || v === undefined || String(v).trim() === "" ? `Column ${i + 1}` : String(v).trim();
    });
    const body = all.slice(h + 1, h + 1 + MAX_ROWS).filter((r) => r.some((c) => c !== null && String(c).trim() !== ""));
    const dateSeries = new Map<string, (number | null)[]>();
    const columns = header.map((name, i) => {
      const { profile, times } = profileColumn(name, body.map((r) => r[i] ?? null), body.length);
      if (times) dateSeries.set(name, times);
      return profile;
    });
    const usable = columns.filter((c) => c.filled > 0);
    out.push({
      name: sheetName,
      rows: body.length,
      columns: usable,
      derived: derive(usable, dateSeries, body.length),
      sample: [header, ...body.slice(0, 5).map((r) => header.map((_, i) => (r[i] instanceof Date ? fmtDate((r[i] as Date).getTime()) : String(r[i] ?? ""))))],
    });
  }
  return out;
}

/** Heuristic first guess; the team can override it in the UI. */
export function suggestRole(kind: string, sheets?: SheetProfile[]): { role: FileRole; reason: string } {
  if (sheets?.length) {
    const rows = sheets.reduce((s, x) => s + x.rows, 0);
    const quant = sheets.flatMap((s) => s.columns).filter((c) => c.type === "number" || c.type === "date").length;
    const texty = sheets.flatMap((s) => s.columns).filter((c) => c.type === "text").length;
    if (rows >= 10 && quant >= 1) return { role: "metrics", reason: `${rows.toLocaleString()} rows with ${quant} numeric/date columns` };
    if (texty >= quant) return { role: "process", reason: "Mostly descriptive text — treated as a process table" };
    return { role: "metrics", reason: "Tabular data" };
  }
  return { role: "process", reason: `${kind} document` };
}
